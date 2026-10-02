import { createId, nowISO } from '@/domain/ids'
import { addDays, todayISO } from '@/domain/format'
import { buildItinerary } from './itineraryGenerator'
import type { Expense, GenerationState, ItineraryDay, Trip, TripNote, User } from '@/domain/types'
import {
  STORAGE_VERSION,
  type PersistedState,
  type PersistenceLoadResult,
  type PersistenceLoadStatus,
  type PersistenceSaveResult,
  type PersistenceService,
} from './contracts'
import { describeSalvage, isCleanSalvage, noSalvage, readSnapshot } from './migrations'

/**
 * Where the snapshot lives. **This string is a storage location, not a version
 * marker, and it must never move.**
 *
 * It reads like `...v1` for one reason: that is where every snapshot written by
 * every build so far already lives. Deriving it from `STORAGE_VERSION` would
 * mean a version bump silently started reading an empty slot, orphaning the
 * traveller's trips, expenses and notes behind a key nothing looks at again -
 * which is precisely the data loss the versioning here exists to prevent. The
 * version travels *inside* the payload (see `STORAGE_VERSION`), so one fixed key
 * is all that is needed.
 */
const STORAGE_KEY = 'tourist.state.v1'

/**
 * Where a payload this build stops using is copied first.
 *
 * Nothing is destroyed by accident without a copy: an unparseable write, a
 * payload from a newer build, a partial salvage, a migration and a `clear()`
 * all land here before the live key is replaced or removed. A later build - or
 * a person with a devtools console - can still get the traveller's data back.
 *
 * The one exception is the traveller asking for it. "Clear all data" promises
 * to remove everything stored in this browser, and a copy of every trip,
 * expense and note left behind here would make that false, so it calls
 * `discardBackup()`.
 */
const BACKUP_KEY = 'tourist.state.backup'

const GUEST_NAME = 'Adaeze N.'

export const DEMO_TRIP_ID = 'trip_demo_paris'

const READ_OPTIONS = { fallbackUserName: GUEST_NAME, demoTripId: DEMO_TRIP_ID } as const

/**
 * True for a guest record nobody has put anything into: no sign-in, no email
 * and the placeholder name. Anything else holds something the traveller typed.
 */
export function isUntouchedGuest(user: User): boolean {
  return user.isGuest && user.email === null && user.name === GUEST_NAME
}

export function createGuestUser(overrides: Partial<User> = {}): User {
  return {
    id: createId('usr'),
    name: GUEST_NAME,
    email: null,
    isGuest: true,
    createdAt: nowISO(),
    ...overrides,
  }
}

export function createEmptyState(user: User = createGuestUser()): PersistedState {
  return {
    version: STORAGE_VERSION,
    user,
    trips: [],
    daysByTrip: {},
    expensesByTrip: {},
    notesByTrip: {},
    generation: {},
    themePreference: 'system',
    hasDemoData: false,
  }
}

function idleGeneration(): GenerationState {
  return {
    status: 'idle',
    error: null,
    startedAt: null,
    completedAt: null,
  }
}

function buildDemoTrip(user: User): {
  trip: Trip
  days: ItineraryDay[]
  expenses: Expense[]
  notes: TripNote[]
} {
  const startDate = todayISO()
  const endDate = addDays(startDate, 6)
  const timestamp = nowISO()

  const trip: Trip = {
    id: DEMO_TRIP_ID,
    userId: user.id,
    name: 'Paris in the Spring',
    origin: 'Lagos, Nigeria',
    destination: 'Paris, France',
    destinationId: 'paris',
    startDate,
    endDate,
    travelers: 2,
    budget: 2500,
    currency: 'EUR',
    interests: ['culture', 'food', 'relaxed'],
    pace: 'balanced',
    notes: 'Keep one day light so we can follow the weather.',
    status: 'itinerary_ready',
    createdAt: timestamp,
    updatedAt: timestamp,
  }

  const days = buildItinerary(trip, 0, timestamp)

  const expenses: Expense[] = [
    {
      id: createId('exp'),
      tripId: trip.id,
      description: 'Return flights, Lagos to Paris',
      amount: 780,
      currency: 'EUR',
      category: 'transport',
      date: addDays(startDate, -21),
      notes: 'Booked and paid before departure.',
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: createId('exp'),
      tripId: trip.id,
      description: 'Apartment deposit, Le Marais',
      amount: 420,
      currency: 'EUR',
      category: 'stay',
      date: addDays(startDate, -14),
      notes: 'Deposit taken on the apartment in Le Marais.',
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: createId('exp'),
      tripId: trip.id,
      description: 'Metro and bus passes',
      amount: 45,
      currency: 'EUR',
      category: 'transport',
      date: startDate,
      notes: 'Weekly passes for the whole trip.',
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: createId('exp'),
      tripId: trip.id,
      description: 'Louvre tickets',
      amount: 44,
      currency: 'EUR',
      category: 'activities',
      date: addDays(startDate, 1),
      notes: 'Two timed entries, Denon wing.',
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: createId('exp'),
      tripId: trip.id,
      description: 'Dinner at a bistro',
      amount: 96,
      currency: 'EUR',
      category: 'food',
      date: addDays(startDate, 1),
      notes: 'Two covers, no dessert. Slightly over budget.',
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ]

  const notes: TripNote[] = [
    {
      id: createId('not'),
      tripId: trip.id,
      title: 'Flight reference',
      body: 'PC 1044, departs 09:40 from LOS.\nSeat 14A and 14B. Two checked bags already paid for, so keep the allowance for souvenirs.',
      pinned: true,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: createId('not'),
      tripId: trip.id,
      title: 'Before we go',
      body: 'Notify the Le Marais apartment about the late arrival.\n\nTop up the metro card at the airport rather than in the city centre - it is cheaper and there is no queue.',
      pinned: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ]

  return { trip, days, expenses, notes }
}

export function createDemoState(user: User = createGuestUser()): PersistedState {
  const { trip, days, expenses, notes } = buildDemoTrip(user)
  return {
    version: STORAGE_VERSION,
    user,
    trips: [trip],
    daysByTrip: { [trip.id]: days },
    expensesByTrip: { [trip.id]: expenses },
    notesByTrip: { [trip.id]: notes },
    generation: { [trip.id]: idleGeneration() },
    themePreference: 'system',
    hasDemoData: true,
  }
}

function storage(): Storage | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage ?? null
  } catch {
    // Storage can be blocked outright (private mode, a hardened profile).
    return null
  }
}

function warn(message: string, detail?: unknown): void {
  if (!import.meta.env.DEV) return
  if (detail === undefined) console.warn(`[persistence] ${message}`)
  else console.warn(`[persistence] ${message}`, detail)
}

/** `QuotaExceededError: ...` whether or not this environment's DOMException extends Error. */
function describeError(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'name' in error && 'message' in error) {
    return `${String(error.name)}: ${String(error.message)}`
  }
  return 'localStorage rejected the write'
}

function emptyLoad(status: PersistenceLoadStatus): PersistenceLoadResult {
  return { state: null, status, foundVersion: null, backupKey: null, salvage: noSalvage() }
}

function failedSave(status: PersistenceSaveResult['status'], reason: string): PersistenceSaveResult {
  return { status, reason, salvage: noSalvage() }
}

export function createPersistenceService(): PersistenceService {
  /**
   * Copies a payload this build is about to stop using. Best effort by design:
   * a full quota must not turn a recoverable read into a thrown error, so a
   * failed backup is reported as "no backup" rather than raised.
   */
  function backUp(store: Storage, raw: string): string | null {
    try {
      store.setItem(BACKUP_KEY, raw)
      return BACKUP_KEY
    } catch (error) {
      warn('could not write a backup copy before starting fresh', error)
      return null
    }
  }

  function loadDetailed(): PersistenceLoadResult {
    const store = storage()
    if (!store) return emptyLoad('unavailable')

    let raw: string | null = null
    try {
      raw = store.getItem(STORAGE_KEY)
    } catch (error) {
      warn('could not read the stored payload', error)
      return emptyLoad('unavailable')
    }
    if (raw === null || raw === '') return emptyLoad('empty')

    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      // Unparseable: a truncated or interrupted write. Keep the bytes anyway,
      // because a human may still read a trip name out of them.
      warn('the stored payload is not valid JSON, starting fresh')
      return { ...emptyLoad('unreadable'), backupKey: backUp(store, raw) }
    }

    const read = readSnapshot(parsed, READ_OPTIONS)

    if (read.state === null) {
      /**
       * A payload from a newer build is *not* an error. This build cannot know
       * what a newer record means, so it starts fresh and leaves the original
       * in the backup for the build that can.
       */
      const status: PersistenceLoadStatus =
        read.problem === 'future-version' || read.problem === 'no-migration-path'
          ? 'future'
          : 'unreadable'
      warn(
        status === 'future'
          ? `the stored payload is version ${String(read.foundVersion)}, newer than this build reads; starting fresh and keeping a backup`
          : 'the stored payload had nothing recoverable in it, starting fresh',
      )
      return {
        state: null,
        status,
        foundVersion: read.foundVersion,
        backupKey: backUp(store, raw),
        salvage: read.salvage,
      }
    }

    const clean = isCleanSalvage(read.salvage)
    const status: PersistenceLoadStatus = read.migrated ? 'migrated' : clean ? 'loaded' : 'salvaged'
    if (read.migrated) {
      const unmatched = read.salvage.unmatchedCatalogItems
      warn(
        `migrated the stored payload from version ${String(read.foundVersion ?? 1)} to ${String(STORAGE_VERSION)}` +
          (unmatched > 0
            ? `; ${String(unmatched)} catalogue stop(s) no longer in the catalogue were priced in their trip's currency`
            : ''),
      )
    }
    if (!clean) warn(`salvaged the stored payload, dropped ${describeSalvage(read.salvage)}`)

    return {
      state: read.state,
      status,
      foundVersion: read.foundVersion,
      // A migration or a dropped record is worth a copy of what it came from.
      // Filling a null or absent field with its default loses nothing, so a
      // clean read at the current version takes no backup.
      backupKey: status === 'loaded' ? null : backUp(store, raw),
      salvage: read.salvage,
    }
  }

  function save(state: PersistedState): PersistenceSaveResult {
    const store = storage()
    if (!store) return failedSave('unavailable', 'localStorage is not available')

    /**
     * The same salvage pass the reader uses, so the guard against writing
     * rubbish cannot freeze persistence for everything else: one malformed
     * record is dropped and the rest of the traveller's data is still written.
     * Only a state with nothing persistable in it is refused, and a refusal
     * leaves the previous payload untouched rather than replacing it.
     */
    const read = readSnapshot(state, READ_OPTIONS)
    if (read.state === null) {
      warn('refusing to save: the state held nothing persistable, the stored payload is untouched')
      return failedSave('refused', read.problem ?? 'nothing persistable')
    }

    if (!isCleanSalvage(read.salvage)) {
      warn(`saving without ${describeSalvage(read.salvage)}, which could not be persisted`)
    }

    try {
      store.setItem(STORAGE_KEY, JSON.stringify(read.state))
    } catch (error) {
      // Quota is the usual cause. The previous payload survives, so the session
      // keeps working and a later, smaller save can still succeed.
      warn('unable to save state', error)
      return {
        status: 'unwritable',
        reason: describeError(error),
        salvage: read.salvage,
      }
    }

    return { status: 'saved', reason: null, salvage: read.salvage }
  }

  function clear(): void {
    const store = storage()
    if (!store) return
    try {
      // Deliberate or not, a reset is still a destruction, so it leaves a copy.
      const raw = store.getItem(STORAGE_KEY)
      if (raw !== null && raw !== '') backUp(store, raw)
      store.removeItem(STORAGE_KEY)
    } catch (error) {
      warn('could not clear the stored payload', error)
    }
  }

  function hasBackup(): boolean {
    const store = storage()
    if (!store) return false
    try {
      return store.getItem(BACKUP_KEY) !== null
    } catch (error) {
      warn('could not look for a backup copy', error)
      return false
    }
  }

  function discardBackup(): void {
    const store = storage()
    if (!store) return
    try {
      store.removeItem(BACKUP_KEY)
    } catch (error) {
      warn('could not remove the backup copy', error)
    }
  }

  return {
    load: () => loadDetailed().state,
    loadDetailed,
    save,
    clear,
    hasBackup,
    discardBackup,
  }
}

export { BACKUP_KEY, STORAGE_KEY }
