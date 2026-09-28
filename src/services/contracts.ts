import type {
  Expense,
  Experience,
  GenerationState,
  ItineraryCategory,
  ItineraryDay,
  ItineraryItem,
  ThemePreference,
  Trip,
  TripDraft,
  TripNote,
  User,
} from '@/domain/types'

/**
 * Replaceable service contracts.
 *
 * The prototype ships local implementations backed by `localStorage` and a
 * deterministic generator. A real backend would satisfy these same interfaces
 * without any caller changing.
 */

/**
 * The schema version of the payload, not of the storage location.
 *
 * It lives inside the JSON so that a bump can be *migrated* rather than
 * orphaned: the key under which snapshots are written never moves, so every
 * build reads the same slot and brings whatever it finds forward. Bump this
 * whenever the persisted shape changes and add the matching step to the ladder
 * in `migrations.ts`.
 *
 * - v1: the original shape.
 * - v2: `ItineraryItem` carries its own `currency`, mirroring `Expense`.
 */
export const STORAGE_VERSION = 2

/** The complete persisted application state. */
export interface PersistedState {
  version: number
  user: User
  trips: Trip[]
  daysByTrip: Record<string, ItineraryDay[]>
  expensesByTrip: Record<string, Expense[]>
  /**
   * Notes arrived after v1 shipped, so this key may be absent on snapshots
   * written by an earlier build. Treat it as optional when validating and
   * normalise it on load rather than rejecting the whole snapshot, which would
   * silently discard the traveller's trips.
   */
  notesByTrip?: Record<string, TripNote[]>
  generation: Record<string, GenerationState>
  themePreference: ThemePreference
  /** True when the seeded Lagos to Paris demo trip is present. */
  hasDemoData: boolean
}

/**
 * What a read or a write had to throw away, or rebuild, to keep the rest.
 *
 * Salvage is per record: one expense in a category this build does not know is
 * dropped and the other nineteen are kept, rather than the whole snapshot being
 * discarded. These counts are how a caller can tell that happened.
 *
 * Counts are of individual records. A container that was not even a list or a
 * map (`daysByTrip: 7`) cannot be counted record by record, so it contributes 1.
 */
export interface PersistenceSalvage {
  trips: number
  days: number
  items: number
  expenses: number
  notes: number
  generation: number
  /**
   * Day buckets dropped because no trip could say which currency their items
   * were priced in. Guessing a currency would misstate money, so the bucket goes.
   */
  orphanedDayBuckets: number
  /**
   * Catalogue stops whose experience is no longer in the catalogue (or that
   * never named one), so their currency could not be confirmed and was taken
   * from the trip. These are *kept*, not dropped - counted so a caller can flag
   * them for the traveller to check.
   */
  unmatchedCatalogItems: number
  /** True when the stored user record was unusable and was rebuilt so the trips could be kept. */
  rebuiltUser: boolean
}

export type PersistenceLoadStatus =
  /** No `localStorage` in this environment. */
  | 'unavailable'
  /** Nothing has ever been written. */
  | 'empty'
  /** Read at the current version with nothing changed. */
  | 'loaded'
  /** Read at the current version, but some records had to be dropped or rebuilt. */
  | 'salvaged'
  /** Read at an older version and brought forward through the migration ladder. */
  | 'migrated'
  /** The payload could not be read at all. A copy was kept at `backupKey`. */
  | 'unreadable'
  /** Written by a newer build than this one. Left in `backupKey`; start fresh. */
  | 'future'

export interface PersistenceLoadResult {
  /** `null` means "start fresh" - never "the traveller had nothing". */
  state: PersistedState | null
  status: PersistenceLoadStatus
  /** The version recorded in the payload, or `null` when it carried none. */
  foundVersion: number | null
  /** Where the raw payload was copied before this build stopped using it, when that happened. */
  backupKey: string | null
  salvage: PersistenceSalvage
}

export type PersistenceSaveStatus =
  | 'saved'
  /** The state held nothing persistable, so the previous payload was left in place. */
  | 'refused'
  | 'unavailable'
  /** `localStorage` rejected the write, quota being the usual reason. */
  | 'unwritable'

export interface PersistenceSaveResult {
  status: PersistenceSaveStatus
  /** Why the write was refused or failed, else `null`. */
  reason: string | null
  /** Records the guard dropped before writing, so one bad field cannot stop the rest. */
  salvage: PersistenceSalvage
}

export interface PersistenceService {
  /**
   * The state to hydrate from, or `null` to start fresh. Callers that only need
   * `load() ?? createEmptyState()` are unaffected by anything below.
   */
  load(): PersistedState | null
  /** The same read, with the detail needed to tell the traveller what happened. */
  loadDetailed(): PersistenceLoadResult
  save(state: PersistedState): PersistenceSaveResult
  clear(): void
}

export interface TripMutationResult {
  state: PersistedState
  trip: Trip | null
}

export interface TripService {
  create(state: PersistedState, draft: TripDraft, userId: string): TripMutationResult
  update(state: PersistedState, tripId: string, patch: Partial<TripDraft>): TripMutationResult
  remove(state: PersistedState, tripId: string): PersistedState
}

export interface GenerateOptions {
  /** Prototype-only switch used to exercise the failure and retry path. */
  shouldFail?: boolean
  /** Changes the deterministic seed so a regeneration differs. */
  variant?: number
}

export interface ItineraryService {
  generate(trip: Trip, options?: GenerateOptions): Promise<ItineraryDay[]>
  suggestAlternative(input: {
    trip: Trip
    day: ItineraryDay
    item: ItineraryItem
    shouldFail?: boolean
    variant?: number
  }): Promise<ItineraryItem>
}

export interface CatalogQuery {
  text: string
  category: ItineraryCategory | 'all'
  maxPrice?: number | null
}

export interface PlaceService {
  search(query: CatalogQuery): Promise<Experience[]>
  getById(id: string): Promise<Experience | null>
}

export interface ExpenseService {
  add(state: PersistedState, input: Omit<Expense, 'id' | 'createdAt' | 'updatedAt'>): {
    state: PersistedState
    expense: Expense
  }
  update(
    state: PersistedState,
    expenseId: string,
    patch: Partial<Omit<Expense, 'id' | 'tripId' | 'createdAt'>>,
  ): PersistedState
  remove(state: PersistedState, tripId: string, expenseId: string): PersistedState
}

export type NewNoteInput = Omit<TripNote, 'id' | 'createdAt' | 'updatedAt' | 'pinned'> & {
  pinned?: boolean
}

export type NotePatch = Partial<Omit<TripNote, 'id' | 'tripId' | 'createdAt'>>

export interface NoteMutationResult {
  state: PersistedState
  note: TripNote | null
}

export interface NoteService {
  add(state: PersistedState, input: NewNoteInput): NoteMutationResult
  update(state: PersistedState, tripId: string, noteId: string, patch: NotePatch): NoteMutationResult
  setPinned(state: PersistedState, tripId: string, noteId: string, pinned: boolean): PersistedState
  remove(state: PersistedState, tripId: string, noteId: string): PersistedState
}

export type AnalyticsEventName =
  | 'signup_completed'
  | 'trip_created'
  | 'trip_details_completed'
  | 'itinerary_generation_started'
  | 'itinerary_generation_succeeded'
  | 'itinerary_generation_failed'
  | 'itinerary_item_edited'
  | 'itinerary_item_replaced'
  | 'experience_searched'
  | 'experience_added'
  | 'expense_added'
  | 'note_created'
  | 'note_updated'
  | 'note_deleted'
  | 'note_pin_toggled'
  | 'trip_saved'

export type AnalyticsPayload = Record<string, string | number | boolean | null>

export interface AnalyticsService {
  track(event: AnalyticsEventName, payload?: AnalyticsPayload): void
  events(): Array<{ event: AnalyticsEventName; payload: AnalyticsPayload; at: string }>
  clear(): void
}
