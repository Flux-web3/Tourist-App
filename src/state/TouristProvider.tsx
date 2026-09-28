import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react'
import { addMinutesToTime } from '@/domain/format'
import { createId } from '@/domain/ids'
import {
  countItems,
  findDayById,
  findItemInDays,
  insertItemAt,
  mergeGeneratedDays,
  moveItemInDays,
  nextEmptySlotStartTime,
  removeItemFromDays,
  replaceItemInDays,
  updateItemInDays,
} from '@/domain/itinerary'
import { applyTheme, readThemePreference } from '@/lib/theme'
import { services } from '@/services'
import type { CatalogQuery, PersistedState } from '@/services/contracts'
import { createDemoState, createEmptyState } from '@/services/persistence'
import type {
  GenerationState,
  ItineraryItem,
  ThemePreference,
  Trip,
  TripDraft,
  User,
} from '@/domain/types'
import {
  TouristContext,
  type AddToTripInput,
  type CustomItemInput,
  type ExpensePatch,
  type ItineraryItemPatch,
  type NewExpenseInput,
  type NewNoteInput,
  type NotePatch,
  type TouristActions,
  type TouristContextValue,
} from './touristContext'
import { createInitialTouristState, toPersistedState, touristReducer } from './touristReducer'

const IDLE_GENERATION: GenerationState = {
  status: 'idle',
  error: null,
  startedAt: null,
  completedAt: null,
}

/**
 * True when the trip still has the shape the plan was drafted against. These are
 * exactly the fields `tripService.update` re-flows the itinerary for, so a change
 * to any of them means a result produced before the change describes a trip that
 * no longer exists.
 */
function sameItineraryShape(before: Trip, after: Trip | undefined): after is Trip {
  return (
    after !== undefined &&
    after.startDate === before.startDate &&
    after.endDate === before.endDate &&
    after.pace === before.pace &&
    after.destination === before.destination
  )
}

function timestamp(): string {
  return new Date().toISOString()
}

export function TouristProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(touristReducer, undefined, createInitialTouristState)
  const [pendingItemId, setPendingItemId] = useState<string | null>(null)
  const [swapError, setSwapError] = useState<string | null>(null)

  const stateRef = useRef(state)
  stateRef.current = state
  const variantRef = useRef<Record<string, number>>({})
  /**
   * The prototype's "make the next generation fail" switch. Deliberately a ref
   * rather than part of the persisted state: it is a demo affordance, so it must
   * not survive a reload and strand a trip in permanent failure.
   */
  const simulateFailureRef = useRef<Record<string, boolean>>({})

  const commit = useCallback((next: PersistedState) => {
    stateRef.current = { ...next, hydrated: stateRef.current.hydrated }
    dispatch({ type: 'replace', state: next })
  }, [])

  useEffect(() => {
    const loaded = services.persistence.load()
    /**
     * A first-time traveller starts empty. The demo trip is only ever added by
     * an explicit "Try the demo", never silently: sample data presented as the
     * traveller's own would be the one dishonest thing in the product.
     */
    const base = loaded ?? createEmptyState()
    const initial: PersistedState = { ...base, themePreference: readThemePreference() }
    dispatch({ type: 'hydrate', state: initial })
    if (!loaded) services.persistence.save(initial)
  }, [])

  useEffect(() => {
    if (!state.hydrated) return
    services.persistence.save(toPersistedState(state))
  }, [state])

  useEffect(() => {
    applyTheme(state.themePreference)
    if (state.themePreference !== 'system' || typeof window.matchMedia !== 'function') return
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => applyTheme('system')
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [state.themePreference])

  const patch = useCallback(
    (payload: Partial<PersistedState>) => {
      commit({ ...stateRef.current, ...payload })
    },
    [commit],
  )

  const setGeneration = useCallback(
    (tripId: string, value: GenerationState) => {
      const current = stateRef.current
      patch({ generation: { ...current.generation, [tripId]: value } })
    },
    [patch],
  )

  const trackSaved = useCallback((tripId: string) => {
    services.analytics.track('trip_saved', { tripId })
  }, [])

  const markItineraryReady = useCallback((trip: Trip, at: string): Trip => {
    if (trip.status === 'itinerary_ready') return trip
    return { ...trip, status: 'itinerary_ready', updatedAt: at }
  }, [])

  const runGeneration = useCallback(
    async (tripId: string, { regenerate, shouldFail }: { regenerate: boolean; shouldFail: boolean }) => {
      const trip = stateRef.current.trips.find((candidate) => candidate.id === tripId)
      if (!trip) return
      const startedAt = timestamp()
      const variant = regenerate
        ? ((variantRef.current[tripId] = (variantRef.current[tripId] ?? 0) + 1))
        : 0

      setGeneration(tripId, { ...IDLE_GENERATION, status: 'loading', startedAt })
      services.analytics.track('itinerary_generation_started', { tripId, regenerate, variant })

      try {
        const generated = await services.itinerary.generate(trip, { shouldFail, variant })
        const after = stateRef.current
        const current = after.trips.find((candidate) => candidate.id === tripId)
        /**
         * The trip was deleted while this was in flight. Writing the days now
         * would put a bucket back for a trip that no longer exists, and nothing
         * would ever clean it up.
         */
        if (!current) return
        /**
         * The dates, pace or destination moved while this was in flight, so these
         * days describe a trip the traveller no longer has.
         * `tripService.update` already reflowed the itinerary onto the new shape,
         * so the honest thing is to throw this result away and clear the spinner
         * rather than overwrite good days with stale ones.
         */
        if (!sameItineraryShape(trip, current)) {
          setGeneration(tripId, IDLE_GENERATION)
          return
        }
        const existing = after.daysByTrip[tripId] ?? []
        const days = regenerate ? mergeGeneratedDays(existing, generated) : generated
        const completedAt = timestamp()

        patch({
          daysByTrip: { ...after.daysByTrip, [tripId]: days },
          trips: after.trips.map((candidate) =>
            candidate.id === tripId ? markItineraryReady(candidate, completedAt) : candidate,
          ),
          generation: {
            ...after.generation,
            [tripId]: { status: 'success', error: null, startedAt, completedAt },
          },
        })
        services.analytics.track('itinerary_generation_succeeded', {
          tripId,
          dayCount: days.length,
          itemCount: countItems(days),
          variant,
        })
        trackSaved(tripId)
      } catch (error) {
        const after = stateRef.current
        const message =
          error instanceof Error ? error.message : 'Something went wrong while drafting your itinerary.'
        // Same orphan guard as the success path: no generation record for a trip
        // that was deleted while this was in flight.
        if (!after.trips.some((candidate) => candidate.id === tripId)) return
        patch({
          generation: {
            ...after.generation,
            [tripId]: {
              status: 'error',
              error: message,
              startedAt,
              completedAt: timestamp(),
            },
          },
        })
        services.analytics.track('itinerary_generation_failed', { tripId, message })
      }
    },
    [markItineraryReady, patch, setGeneration, trackSaved],
  )

  const actions = useMemo<TouristActions>(() => {
    const setThemePreference = (preference: ThemePreference) => {
      applyTheme(preference)
      commit({ ...stateRef.current, themePreference: preference })
    }

    const signIn = ({ name, email }: { name: string; email: string | null }) => {
      const current = stateRef.current
      const user: User = {
        ...current.user,
        name: name.trim() || current.user.name,
        email,
        isGuest: false,
      }
      patch({ user })
      services.analytics.track('signup_completed', { mode: 'local_prototype', isGuest: false })
    }

    const signOut = () => {
      patch({ user: { ...stateRef.current.user, isGuest: true, email: null } })
    }

    const loadDemoData = () => {
      const current = stateRef.current
      const demo = createDemoState(current.user)
      const [demoTrip] = demo.trips
      if (!demoTrip) return
      if (current.trips.some((trip) => trip.id === demoTrip.id)) return

      const fresh: PersistedState = {
        ...current,
        trips: [...current.trips, demoTrip],
        daysByTrip: { ...current.daysByTrip, ...demo.daysByTrip },
        expensesByTrip: { ...current.expensesByTrip, ...demo.expensesByTrip },
        notesByTrip: { ...current.notesByTrip, ...demo.notesByTrip },
        generation: { ...current.generation, ...demo.generation },
        hasDemoData: true,
      }
      services.persistence.save(fresh)
      commit(fresh)
    }

    const clearAllData = () => {
      const current = stateRef.current
      const fresh: PersistedState = {
        ...createEmptyState(current.user),
        themePreference: current.themePreference,
      }
      /**
       * "Clear all data" has to mean all of it. The analytics log is in memory
       * only, but it still holds destinations and the traveller's raw search
       * text, so leaving it behind would make the promise false.
       */
      services.analytics.clear()
      variantRef.current = {}
      simulateFailureRef.current = {}
      services.persistence.save(fresh)
      commit(fresh)
    }

    const createTrip = (draft: TripDraft): Trip => {
      const current = stateRef.current
      const result = services.trips.create(current, draft, current.user.id)
      if (!result.trip) throw new Error('The trip could not be created.')
      const { trip } = result
      patch({
        trips: result.state.trips,
        daysByTrip: result.state.daysByTrip,
        expensesByTrip: result.state.expensesByTrip,
        // The notes bucket `tripService.create` just built has to come across
        // too, or the first note written to the trip lands in a bucket that the
        // create never registered.
        notesByTrip: result.state.notesByTrip,
        generation: result.state.generation,
      })
      services.analytics.track('trip_created', {
        tripId: trip.id,
        destination: trip.destination,
        travelers: trip.travelers,
        currency: trip.currency,
        pace: trip.pace,
      })
      services.analytics.track('trip_details_completed', { tripId: trip.id })
      trackSaved(trip.id)
      return trip
    }

    const updateTrip = (tripId: string, update: Partial<TripDraft>) => {
      const result = services.trips.update(stateRef.current, tripId, update)
      if (!result.trip) return
      patch({ trips: result.state.trips, daysByTrip: result.state.daysByTrip })
      trackSaved(tripId)
    }

    const deleteTrip = (tripId: string) => {
      const next = services.trips.remove(stateRef.current, tripId)
      delete variantRef.current[tripId]
      delete simulateFailureRef.current[tripId]
      patch({
        trips: next.trips,
        daysByTrip: next.daysByTrip,
        expensesByTrip: next.expensesByTrip,
        notesByTrip: next.notesByTrip,
        generation: next.generation,
        hasDemoData: next.hasDemoData,
      })
    }

    const generateItinerary = async (tripId: string, options?: { regenerate?: boolean }) => {
      const existing = stateRef.current.daysByTrip[tripId] ?? []
      await runGeneration(tripId, {
        regenerate: options?.regenerate ?? existing.length > 0,
        shouldFail: simulateFailureRef.current[tripId] ?? false,
      })
    }

    const retryGeneration = async (tripId: string) => {
      const current = stateRef.current
      const previous = current.generation[tripId] ?? IDLE_GENERATION
      simulateFailureRef.current[tripId] = false
      setGeneration(tripId, { ...previous, status: 'idle', error: null })
      await runGeneration(tripId, { regenerate: true, shouldFail: false })
    }

    const setSimulateFailure = (tripId: string, shouldFail: boolean) => {
      simulateFailureRef.current[tripId] = shouldFail
    }

    const getItem = (tripId: string, itemId: string) =>
      findItemInDays(stateRef.current.daysByTrip[tripId] ?? [], itemId)

    const editItem = (tripId: string, itemId: string, itemPatch: ItineraryItemPatch) => {
      const current = stateRef.current
      const located = findItemInDays(current.daysByTrip[tripId] ?? [], itemId)
      if (!located) return
      const days = updateItemInDays(current.daysByTrip[tripId] ?? [], itemId, itemPatch, timestamp())
      patch({ daysByTrip: { ...current.daysByTrip, [tripId]: days } })
      services.analytics.track('itinerary_item_edited', {
        tripId,
        itemId,
        fields: Object.keys(itemPatch).join(','),
      })
      trackSaved(tripId)
    }

    const replaceItem = async (tripId: string, itemId: string) => {
      const current = stateRef.current
      const trip = current.trips.find((candidate) => candidate.id === tripId)
      const located = findItemInDays(current.daysByTrip[tripId] ?? [], itemId)
      if (!trip || !located) return
      const variant = (variantRef.current[tripId] = (variantRef.current[tripId] ?? 0) + 1)

      setPendingItemId(itemId)
      setSwapError(null)
      try {
        const replacement = await services.itinerary.suggestAlternative({
          trip,
          day: located.day,
          item: located.item,
          variant,
          shouldFail: simulateFailureRef.current[tripId] ?? false,
        })
        const after = stateRef.current
        const stillThere = after.trips.find((candidate) => candidate.id === tripId)
        // The trip was deleted while the suggestion was in flight: writing the
        // days back would resurrect a bucket nothing will ever clean up.
        if (!stillThere) return
        // The trip was re-flowed, so this suggestion was built against a day that
        // may no longer exist. Discard it rather than write it somewhere it does
        // not belong; the plan the traveller has is untouched either way.
        if (!sameItineraryShape(trip, stillThere)) return
        const days = replaceItemInDays(
          after.daysByTrip[tripId] ?? [],
          itemId,
          replacement,
          timestamp(),
        )
        patch({ daysByTrip: { ...after.daysByTrip, [tripId]: days } })
        services.analytics.track('itinerary_item_replaced', {
          tripId,
          itemId,
          from: located.item.title,
          to: replacement.title,
        })
        trackSaved(tripId)
      } catch (error) {
        setSwapError(
          error instanceof Error
            ? error.message
            : 'We could not find a different suggestion. Your plan is unchanged.',
        )
      } finally {
        setPendingItemId(null)
      }
    }

    const dismissSwapError = () => setSwapError(null)

    const addCustomItem = (
      tripId: string,
      input: CustomItemInput,
      placement: AddToTripInput,
    ): ItineraryItem | null => {
      const current = stateRef.current
      const days = current.daysByTrip[tripId] ?? []
      const day = findDayById(days, placement.dayId)
      if (!day) return null
      const at = timestamp()
      const item: ItineraryItem = {
        id: createId('itm'),
        tripId,
        title: input.title.trim(),
        category: input.category,
        startTime: input.startTime || nextEmptySlotStartTime(day),
        endTime: input.endTime || null,
        location: input.location.trim(),
        description: input.description.trim(),
        estimatedCost: Math.max(0, input.estimatedCost),
        source: 'user',
        editedByUser: false,
        experienceId: null,
        notes: input.notes.trim(),
        createdAt: at,
        updatedAt: at,
      }
      patch({ daysByTrip: { ...current.daysByTrip, [tripId]: insertItemAt(days, day.id, item, placement.position) } })
      trackSaved(tripId)
      return item
    }

    const addExperienceToTrip = async (
      tripId: string,
      experienceId: string,
      placement: AddToTripInput,
    ): Promise<ItineraryItem | null> => {
      const experience = await services.places.getById(experienceId)
      if (!experience) return null
      const current = stateRef.current
      const days = current.daysByTrip[tripId] ?? []
      const day = findDayById(days, placement.dayId)
      if (!day) return null
      const at = timestamp()
      const startTime = placement.startTime || nextEmptySlotStartTime(day)
      const item: ItineraryItem = {
        id: createId('itm'),
        tripId,
        title: experience.name,
        category: experience.category,
        startTime,
        endTime: addMinutesToTime(startTime, experience.durationMinutes),
        location: `${experience.neighborhood}, ${experience.city}`,
        description: experience.summary,
        estimatedCost: experience.priceFrom,
        source: 'catalog',
        editedByUser: false,
        experienceId: experience.id,
        notes: experience.hoursNote,
        createdAt: at,
        updatedAt: at,
      }
      const at2 = timestamp()
      patch({
        daysByTrip: {
          ...current.daysByTrip,
          [tripId]: insertItemAt(days, day.id, item, placement.position),
        },
        trips: current.trips.map((candidate) =>
          candidate.id === tripId ? markItineraryReady(candidate, at2) : candidate,
        ),
      })
      services.analytics.track('experience_added', { tripId, experienceId, dayId: day.id })
      trackSaved(tripId)
      return item
    }

    const removeItem = (tripId: string, itemId: string) => {
      const current = stateRef.current
      const days = removeItemFromDays(current.daysByTrip[tripId] ?? [], itemId)
      patch({ daysByTrip: { ...current.daysByTrip, [tripId]: days } })
      trackSaved(tripId)
    }

    const moveItem = (tripId: string, itemId: string, dayId: string, position?: number) => {
      const current = stateRef.current
      const days = moveItemInDays(current.daysByTrip[tripId] ?? [], itemId, dayId, position)
      patch({ daysByTrip: { ...current.daysByTrip, [tripId]: days } })
      trackSaved(tripId)
    }

    const addExpense = (input: NewExpenseInput) => {
      const current = stateRef.current
      const trip = current.trips.find((candidate) => candidate.id === input.tripId)
      if (!trip) return null
      const result = services.expenses.add(current, {
        tripId: trip.id,
        description: input.description,
        amount: input.amount,
        currency: trip.currency,
        category: input.category,
        date: input.date,
        notes: input.notes,
      })
      patch({ expensesByTrip: result.state.expensesByTrip })
      services.analytics.track('expense_added', {
        tripId: trip.id,
        amount: result.expense.amount,
        currency: result.expense.currency,
        category: result.expense.category,
      })
      trackSaved(trip.id)
      return result.expense
    }

    const updateExpense = (expenseId: string, update: ExpensePatch) => {
      const next = services.expenses.update(stateRef.current, expenseId, update)
      patch({ expensesByTrip: next.expensesByTrip })
    }

    const removeExpense = (tripId: string, expenseId: string) => {
      patch({
        expensesByTrip: services.expenses.remove(stateRef.current, tripId, expenseId).expensesByTrip,
      })
    }

    const addNote = (input: NewNoteInput) => {
      const current = stateRef.current
      const trip = current.trips.find((candidate) => candidate.id === input.tripId)
      if (!trip) return null
      const result = services.notes.add(current, { ...input, pinned: false })
      if (!result.note) return null
      patch({ notesByTrip: result.state.notesByTrip })
      services.analytics.track('note_created', { tripId: trip.id, pinned: false })
      trackSaved(trip.id)
      return result.note
    }

    const updateNote = (tripId: string, noteId: string, update: NotePatch) => {
      const result = services.notes.update(stateRef.current, tripId, noteId, update)
      if (!result.note) return null
      patch({ notesByTrip: result.state.notesByTrip })
      services.analytics.track('note_updated', {
        tripId,
        noteId,
        fields: Object.keys(update).join(','),
      })
      trackSaved(tripId)
      return result.note
    }

    const toggleNotePin = (tripId: string, noteId: string) => {
      const current = stateRef.current
      const existing = (current.notesByTrip?.[tripId] ?? []).find((note) => note.id === noteId)
      if (!existing) return
      const next = services.notes.setPinned(current, tripId, noteId, !existing.pinned)
      patch({ notesByTrip: next.notesByTrip })
      services.analytics.track('note_pin_toggled', { tripId, noteId, pinned: !existing.pinned })
      trackSaved(tripId)
    }

    const removeNote = (tripId: string, noteId: string) => {
      const next = services.notes.remove(stateRef.current, tripId, noteId)
      patch({ notesByTrip: next.notesByTrip })
      services.analytics.track('note_deleted', { tripId, noteId })
      trackSaved(tripId)
    }

    const searchExperiences = (query: CatalogQuery) => services.places.search(query)
    const getExperience = (id: string) => services.places.getById(id)

    const trackSearch = (query: CatalogQuery) => {
      services.analytics.track('experience_searched', {
        text: query.text.trim(),
        category: query.category,
        maxPrice: query.maxPrice ?? null,
      })
    }

    return {
      setThemePreference,
      signIn,
      signOut,
      loadDemoData,
      clearAllData,
      createTrip,
      updateTrip,
      deleteTrip,
      generateItinerary,
      retryGeneration,
      setSimulateFailure,
      getItem,
      editItem,
      replaceItem,
      dismissSwapError,
      addCustomItem,
      addExperienceToTrip,
      removeItem,
      moveItem,
      addExpense,
      updateExpense,
      removeExpense,
      addNote,
      updateNote,
      toggleNotePin,
      removeNote,
      searchExperiences,
      getExperience,
      trackSearch,
    }
  }, [commit, patch, runGeneration, setGeneration, trackSaved, markItineraryReady])

  const value = useMemo<TouristContextValue>(
    () => ({ state, hydrated: state.hydrated, actions, pendingItemId, swapError }),
    [actions, pendingItemId, state, swapError],
  )

  return <TouristContext.Provider value={value}>{children}</TouristContext.Provider>
}
