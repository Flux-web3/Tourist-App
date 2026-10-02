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
  suggestPlaceSlot,
  updateItemInDays,
} from '@/domain/itinerary'
import { applyTheme, readThemePreference } from '@/lib/theme'
import { services } from '@/services'
import type { CatalogQuery, PersistedState, PersistenceLoadStatus } from '@/services/contracts'
import { BACKUP_KEY, STORAGE_KEY, createDemoState, createEmptyState } from '@/services/persistence'
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
  type StorageStatus,
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
 *
 * The destination follows the same rule as `shouldReflow` there: a destination
 * is an id, so when either trip has one the ids alone decide, and a change to
 * the display text is not a change of place. Only two trips with no id at all
 * (saved before destinations were listed) are compared by their trimmed text.
 */
function sameItineraryShape(before: Trip, after: Trip | undefined): after is Trip {
  if (after === undefined) return false
  const beforeId = before.destinationId ?? null
  const afterId = after.destinationId ?? null
  const sameDestination =
    beforeId !== null || afterId !== null
      ? afterId === beforeId
      : after.destination.trim() === before.destination.trim()
  return (
    after.startDate === before.startDate &&
    after.endDate === before.endDate &&
    after.pace === before.pace &&
    sameDestination
  )
}

function timestamp(): string {
  return new Date().toISOString()
}

const INTERRUPTED_GENERATION_MESSAGE =
  'Drafting stopped when the page was closed or reloaded. Your plan was not changed. Try again.'

/**
 * A `loading` status read from storage is always stale: no request survives a
 * page load. Restored as-is, it left the trip on "Drafting your itinerary…"
 * forever with Regenerate disabled, and only clearing all data got it back. It
 * becomes a retryable error instead, so the traveller sees what happened.
 */
function settleInterruptedGenerations(
  generation: PersistedState['generation'],
): PersistedState['generation'] {
  if (!Object.values(generation).some((entry) => entry.status === 'loading')) return generation
  return Object.fromEntries(
    Object.entries(generation).map(([tripId, entry]) => [
      tripId,
      entry.status === 'loading'
        ? { ...entry, status: 'error', error: INTERRUPTED_GENERATION_MESSAGE, completedAt: null }
        : entry,
    ]),
  )
}

const ABANDONED_GENERATION_MESSAGE =
  'Drafting stopped because your trips were changed in another tab. Your plan was not changed. Try again.'

const INITIAL_STORAGE: StorageStatus = {
  saving: 'ok',
  load: 'empty',
  backedUp: false,
  readOnly: false,
  fromOtherTab: false,
  noticeDismissed: false,
  hasBackup: false,
}

/** A payload this build cannot use: not valid data, or written by a newer build. */
function isUnusable(status: PersistenceLoadStatus): boolean {
  return status === 'unreadable' || status === 'future'
}

/**
 * True when `state` is, field for field, the very snapshot `synced` is. Every
 * action replaces at least one top-level field with a new object, so identical
 * references mean nothing has changed since `synced` was adopted.
 */
function isSameSnapshot(state: PersistedState, synced: PersistedState | null): boolean {
  return (
    synced !== null &&
    state.version === synced.version &&
    state.user === synced.user &&
    state.trips === synced.trips &&
    state.daysByTrip === synced.daysByTrip &&
    state.expensesByTrip === synced.expensesByTrip &&
    state.notesByTrip === synced.notesByTrip &&
    state.generation === synced.generation &&
    state.themePreference === synced.themePreference &&
    state.hasDemoData === synced.hasDemoData
  )
}

export function TouristProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(touristReducer, undefined, createInitialTouristState)
  const [storage, setStorage] = useState<StorageStatus>(INITIAL_STORAGE)
  const [pendingItemId, setPendingItemId] = useState<string | null>(null)
  const [swapError, setSwapError] = useState<string | null>(null)
  const [swapTripId, setSwapTripId] = useState<string | null>(null)

  const stateRef = useRef(state)
  stateRef.current = state
  const variantRef = useRef<Record<string, number>>({})
  /**
   * The prototype's "make the next generation fail" switch. Deliberately a ref
   * rather than part of the persisted state: it is a demo affordance, so it must
   * not survive a reload and strand a trip in permanent failure.
   */
  const simulateFailureRef = useRef<Record<string, boolean>>({})
  /**
   * The newest generation started for each trip. A run compares its own number
   * against this after the await and writes nothing if a later run has started
   * since: a double-tapped Regenerate, or a Retry pressed while the first run was
   * still out, must never let the older result land last and overwrite the newer
   * one (or stamp an error over a run that is still loading).
   */
  const generationRunRef = useRef<Record<string, number>>({})
  /**
   * The trip the in-flight swap, or the swap error on screen, belongs to. Both
   * are single provider-wide values, so without this a trip deletion or a data
   * reset would leave a spinner or an error banner about a trip that is gone.
   */
  const swapTripRef = useRef<string | null>(null)
  /**
   * The newest swap started. `pendingItemId` and `swapError` are shared by every
   * trip, so a swap that has been abandoned (its trip deleted, the data reset)
   * must not reach them when it finally settles: it would clear the spinner of,
   * or raise an error over, a newer swap on another trip.
   */
  const swapRunRef = useRef(0)
  /**
   * The trips with a generation still out in this tab. Storage only says that
   * a trip is `loading`, not which tab is doing the drafting, so this is how a
   * tab knows a spinner is its own when another tab changes the data under it.
   */
  const activeGenerationsRef = useRef(new Set<string>())
  /**
   * True while this session must not write to storage at all: what is stored
   * could not be read and is the only copy of it. Saving the fresh, empty state
   * this session starts from would destroy the traveller's data for good.
   */
  const readOnlyRef = useRef(false)
  /**
   * The snapshot this tab adopted from another tab's write, while its state is
   * still exactly that. Storage already holds it, so there is nothing to save,
   * and saving anyway is how two tabs would start answering each other's
   * writes for ever.
   */
  const syncedRef = useRef<PersistedState | null>(null)

  const commit = useCallback((next: PersistedState) => {
    stateRef.current = { ...next, hydrated: stateRef.current.hydrated }
    dispatch({ type: 'replace', state: next })
  }, [])

  /**
   * The one place a snapshot is written. The outcome is kept rather than
   * dropped: a rejected write changes nothing on screen, so without it the
   * traveller carries on and loses everything on the next reload.
   */
  const persist = useCallback((next: PersistedState) => {
    if (readOnlyRef.current) return
    const saving = services.persistence.save(next).status === 'saved' ? 'ok' : 'failing'
    setStorage((current) => (current.saving === saving ? current : { ...current, saving }))
  }, [])

  const clearSwapState = useCallback(() => {
    swapRunRef.current += 1
    swapTripRef.current = null
    setSwapTripId(null)
    setPendingItemId(null)
    setSwapError(null)
  }, [])

  useEffect(() => {
    const result = services.persistence.loadDetailed()
    /**
     * A first-time traveller starts empty. The demo trip is only ever added by
     * an explicit "Try the demo", never silently: sample data presented as the
     * traveller's own would be the one dishonest thing in the product.
     */
    const base = result.state ?? createEmptyState()
    const initial: PersistedState = {
      ...base,
      generation: settleInterruptedGenerations(base.generation),
      themePreference: readThemePreference(),
    }
    /**
     * Starting fresh is only safe once the payload this build could not use
     * has been copied to the backup. When that copy could not be written, the
     * live key is the only one there is, so nothing is saved over it for the
     * rest of the session.
     */
    const readOnly = isUnusable(result.status) && result.backupKey === null
    readOnlyRef.current = readOnly
    syncedRef.current = null
    setStorage({
      saving: 'ok',
      load: result.status,
      backedUp: result.backupKey !== null,
      readOnly,
      fromOtherTab: false,
      noticeDismissed: false,
      hasBackup: services.persistence.hasBackup(),
    })
    // Not saved here: the save effect below writes it once it is the state,
    // and writes nothing while the session is read-only.
    dispatch({ type: 'hydrate', state: initial })
  }, [])

  useEffect(() => {
    if (!state.hydrated) return
    const snapshot = toPersistedState(state)
    if (isSameSnapshot(snapshot, syncedRef.current)) return
    syncedRef.current = null
    persist(snapshot)
  }, [state, persist])

  /**
   * Another tab changed what is stored. This tab's copy of the whole state is
   * now stale, and its next save would write that stale copy back: the other
   * tab's new expense gone, its deleted trip returned. So this tab re-reads
   * storage and carries on from there.
   */
  const syncFromStorage = useCallback(() => {
    const result = services.persistence.loadDetailed()
    const unusable = isUnusable(result.status)

    /**
     * Anything in flight here was started against the state being replaced.
     * The run numbers are moved on rather than cleared: a cleared counter
     * starts again at 1, which is the number an abandoned run may be holding.
     */
    const abandoned = [...activeGenerationsRef.current]
    activeGenerationsRef.current.clear()
    for (const tripId of Object.keys(generationRunRef.current)) {
      generationRunRef.current[tripId] += 1
    }
    clearSwapState()

    /**
     * A key removed elsewhere means start empty. A payload this build cannot
     * use (another tab is on a newer build, say), or storage that would not
     * read at all, is different: emptying the screen would look like data
     * loss, so this tab keeps what it was showing.
     */
    const keepCurrent = unusable || result.status === 'unavailable'
    const base =
      result.state ?? (keepCurrent ? toPersistedState(stateRef.current) : createEmptyState())

    // A spinner this tab was responsible for has nothing behind it any more.
    let generation = base.generation
    let settled = false
    for (const tripId of abandoned) {
      const entry = generation[tripId]
      if (entry?.status !== 'loading') continue
      generation = {
        ...generation,
        [tripId]: { ...entry, status: 'error', error: ABANDONED_GENERATION_MESSAGE, completedAt: null },
      }
      settled = true
    }

    // The theme has its own key, shared by every tab, exactly as on first load.
    const themePreference = readThemePreference()
    const next: PersistedState = { ...base, generation, themePreference }

    /**
     * Unusable data is left exactly where it is, backed up or not: the tab that
     * wrote it is still using it.
     */
    readOnlyRef.current = unusable
    /**
     * Adopting what storage holds must not be answered with a write, or two
     * tabs would ping-pong. The only writes that follow a sync are the ones
     * that carry something new: a draft this tab had to abandon, or a theme
     * the payload disagrees with. Neither can repeat, since the next tab to
     * read the result finds nothing left to settle and the same theme key.
     */
    const matchesStorage =
      result.state === null || (!settled && themePreference === base.themePreference)
    syncedRef.current = matchesStorage ? next : null

    const hasBackup = services.persistence.hasBackup()
    const noteworthy = unusable || result.status === 'salvaged'
    setStorage((current) => ({
      ...current,
      readOnly: unusable,
      hasBackup,
      // A clean read from another tab says nothing new, so a notice from the
      // page load stays until it is dismissed.
      ...(noteworthy || current.readOnly
        ? {
            load: result.status,
            backedUp: result.backupKey !== null,
            fromOtherTab: true,
            noticeDismissed: false,
          }
        : {}),
    }))

    stateRef.current = { ...next, hydrated: true }
    dispatch({ type: 'hydrate', state: next })
  }, [clearSwapState])

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === BACKUP_KEY) {
        const hasBackup = services.persistence.hasBackup()
        setStorage((current) => (current.hasBackup === hasBackup ? current : { ...current, hasBackup }))
        return
      }
      // A null key is another tab clearing the whole of storage.
      if (event.key !== null && event.key !== STORAGE_KEY) return
      syncFromStorage()
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [syncFromStorage])

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
      const run = (generationRunRef.current[tripId] = (generationRunRef.current[tripId] ?? 0) + 1)
      const superseded = () => generationRunRef.current[tripId] !== run

      activeGenerationsRef.current.add(tripId)
      setGeneration(tripId, { ...IDLE_GENERATION, status: 'loading', startedAt })
      services.analytics.track('itinerary_generation_started', { tripId, regenerate, variant })

      try {
        const generated = await services.itinerary.generate(trip, { shouldFail, variant })
        // A newer run owns this trip's days and its generation record now.
        if (superseded()) return
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
        /**
         * Always merged, the first draft included. `existing` is read after the
         * await, so it holds whatever the traveller added while this was out;
         * taking `generated` as it stands replaced the plan and lost those
         * stops. With nothing to keep, the merge is exactly `generated`.
         */
        const existing = after.daysByTrip[tripId] ?? []
        const days = mergeGeneratedDays(existing, generated)
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
        // An older run failing must not stamp an error over a newer run that is
        // still loading or has already succeeded.
        if (superseded()) return
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
      } finally {
        // Still this trip's newest run, so the trip has nothing in flight now.
        if (!superseded()) activeGenerationsRef.current.delete(tripId)
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
      persist(fresh)
      commit(fresh)
    }

    const clearAllData = () => {
      /**
       * "Clear all data" has to mean all of it, because that is what the
       * dialog promises. So the traveller's name and email go too: the state
       * starts again from a brand new guest rather than carrying the old user
       * record across. Only the colour theme is kept, which says nothing about
       * the traveller or their trips.
       */
      const fresh: PersistedState = {
        ...createEmptyState(),
        themePreference: stateRef.current.themePreference,
      }
      /**
       * The analytics log is in memory only, but it still holds destinations
       * and the traveller's raw search text, so leaving it behind would make
       * the promise false.
       */
      services.analytics.clear()
      variantRef.current = {}
      simulateFailureRef.current = {}
      // Anything still in flight belongs to a trip that no longer exists.
      generationRunRef.current = {}
      activeGenerationsRef.current.clear()
      clearSwapState()
      /**
       * The backup slot can hold a full copy of every trip, expense and note
       * (a migration, a salvage and an unreadable payload each leave one), so
       * it is removed as well. A payload this session was leaving untouched
       * because it could not be read is replaced too: the traveller has now
       * asked for it to go.
       */
      services.persistence.discardBackup()
      const hasBackup = services.persistence.hasBackup()
      readOnlyRef.current = false
      syncedRef.current = null
      setStorage((current) => ({
        ...current,
        load: 'empty',
        backedUp: false,
        readOnly: false,
        fromOtherTab: false,
        noticeDismissed: false,
        hasBackup,
      }))
      persist(fresh)
      commit(fresh)
    }

    const dismissStorageNotice = () => {
      setStorage((current) => (current.noticeDismissed ? current : { ...current, noticeDismissed: true }))
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
      delete generationRunRef.current[tripId]
      activeGenerationsRef.current.delete(tripId)
      if (swapTripRef.current === tripId) clearSwapState()
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
      const run = (swapRunRef.current += 1)
      const superseded = () => swapRunRef.current !== run

      swapTripRef.current = tripId
      setSwapTripId(tripId)
      setPendingItemId(itemId)
      setSwapError(null)
      try {
        const replacement = await services.itinerary.suggestAlternative({
          trip,
          day: located.day,
          item: located.item,
          days: stateRef.current.daysByTrip[tripId] ?? [],
          variant,
          shouldFail: simulateFailureRef.current[tripId] ?? false,
        })
        if (superseded()) return
        const after = stateRef.current
        const stillThere = after.trips.find((candidate) => candidate.id === tripId)
        // The trip was deleted while the suggestion was in flight: writing the
        // days back would resurrect a bucket nothing will ever clean up.
        if (!stillThere) return
        // The trip was re-flowed, so this suggestion was built against a day that
        // may no longer exist. Discard it rather than write it somewhere it does
        // not belong; the plan the traveller has is untouched either way.
        if (!sameItineraryShape(trip, stillThere)) return
        /**
         * The stop has to still be the exact stop the suggestion was built for.
         * While it was in flight the traveller may have removed it, moved it to
         * another day or edited it by hand, or a regeneration may have rebuilt
         * the day around it. Writing now would overwrite their edit, drop an AI
         * stop onto a day they moved it away from, or report a swap that never
         * happened. Every helper in `domain/itinerary` returns the untouched
         * items by reference, so an unchanged reference means an unchanged stop.
         */
        const target = findItemInDays(after.daysByTrip[tripId] ?? [], itemId)
        if (!target || target.day.id !== located.day.id || target.item !== located.item) return
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
        if (superseded()) return
        setSwapError(
          error instanceof Error
            ? error.message
            : 'We could not find a different suggestion. Your plan is unchanged.',
        )
      } finally {
        if (!superseded()) setPendingItemId(null)
      }
    }

    const dismissSwapError = () => setSwapError(null)

    const addCustomItem = (
      tripId: string,
      input: CustomItemInput,
      placement: AddToTripInput,
    ): ItineraryItem | null => {
      const current = stateRef.current
      // The cost was typed into a field labelled with this trip's currency, so
      // that is the only honest currency for it. No trip, no stop: never guess.
      const trip = current.trips.find((candidate) => candidate.id === tripId)
      if (!trip) return null
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
        currency: trip.currency,
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
      // A place only goes into a trip to its own city. The UI never offers a
      // London trip a Paris place, but this is the last line: a stale link or
      // a legacy trip with no destination (null never equals a place's id)
      // must not slip another city's stop into the itinerary.
      const targetTrip = current.trips.find((candidate) => candidate.id === tripId)
      if (!targetTrip || experience.destinationId !== targetTrip.destinationId) return null
      const days = current.daysByTrip[tripId] ?? []
      const day = findDayById(days, placement.dayId)
      if (!day) return null
      // A typed time is the traveller's call and is kept as given. Without one the
      // place goes where its usual hours and the day's stops leave room, and
      // when nowhere does, nothing is added: the dialog shows the same answer
      // from `suggestPlaceSlot` and asks for a time instead.
      let startTime = placement.startTime ?? ''
      if (!startTime) {
        const suggestion = suggestPlaceSlot(day, experience)
        if (suggestion.kind === 'none') return null
        startTime = suggestion.startTime
      }
      const at = timestamp()
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
        // The catalogue's own currency, never the trip's: a EUR ticket dropped
        // into a naira trip is still EUR, and relabelling it would silently count
        // 22 EUR as 22 NGN. The budget excludes and reports a mismatch instead.
        currency: experience.currency,
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
      const days = moveItemInDays(
        current.daysByTrip[tripId] ?? [],
        itemId,
        dayId,
        position,
        timestamp(),
      )
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
      dismissStorageNotice,
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
  }, [clearSwapState, commit, patch, persist, runGeneration, setGeneration, trackSaved, markItineraryReady])

  const value = useMemo<TouristContextValue>(
    () => ({ state, hydrated: state.hydrated, actions, storage, pendingItemId, swapError, swapTripId }),
    [actions, pendingItemId, state, storage, swapError, swapTripId],
  )

  return <TouristContext.Provider value={value}>{children}</TouristContext.Provider>
}
