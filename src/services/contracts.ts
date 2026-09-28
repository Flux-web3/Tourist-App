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

export const STORAGE_VERSION = 1

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

export interface PersistenceService {
  load(): PersistedState | null
  save(state: PersistedState): void
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
