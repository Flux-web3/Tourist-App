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
  shouldFail: false,
  startedAt: null,
  completedAt: null,
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

  const commit = useCallback((next: PersistedState) => {
    stateRef.current = { ...next, hydrated: stateRef.current.hydrated }
    dispatch({ type: 'replace', state: next })
  }, [])

  useEffect(() => {
    const loaded = services.persistence.load()
    const base = loaded ?? createDemoState()
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

      setGeneration(tripId, { ...IDLE_GENERATION, status: 'loading', shouldFail, startedAt })
      services.analytics.track('itinerary_generation_started', { tripId, regenerate, variant })

      try {
        const generated = await services.itinerary.generate(trip, { shouldFail, variant })
        const after = stateRef.current
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
            [tripId]: { status: 'success', error: null, shouldFail, startedAt, completedAt },
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
        patch({
          generation: {
            ...after.generation,
            [tripId]: {
              status: 'error',
              error: message,
              shouldFail,
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
      const fresh: PersistedState = {
        ...createDemoState(current.user),
        themePreference: current.themePreference,
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
      patch({
        trips: next.trips,
        daysByTrip: next.daysByTrip,
        expensesByTrip: next.expensesByTrip,
        notesByTrip: next.notesByTrip,
        generation: next.generation,
      })
    }

    const generateItinerary = async (tripId: string, options?: { regenerate?: boolean }) => {
      const existing = stateRef.current.daysByTrip[tripId] ?? []
      const shouldFail = stateRef.current.generation[tripId]?.shouldFail ?? false
      await runGeneration(tripId, {
        regenerate: options?.regenerate ?? existing.length > 0,
        shouldFail,
      })
    }

    const retryGeneration = async (tripId: string) => {
      const current = stateRef.current
      const previous = current.generation[tripId] ?? IDLE_GENERATION
      setGeneration(tripId, { ...previous, status: 'idle', error: null, shouldFail: false })
      await runGeneration(tripId, { regenerate: true, shouldFail: false })
    }

    const setSimulateFailure = (tripId: string, shouldFail: boolean) => {
      setGeneration(tripId, { ...IDLE_GENERATION, shouldFail })
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
          shouldFail: current.generation[tripId]?.shouldFail ?? false,
        })
        const after = stateRef.current
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
