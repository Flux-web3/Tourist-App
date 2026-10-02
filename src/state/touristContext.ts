import { createContext } from 'react'
import type {
  CatalogQuery,
  PersistedState,
  PersistenceLoadStatus,
} from '@/services/contracts'
import type {
  Expense,
  Experience,
  ItineraryCategory,
  ItineraryDay,
  ItineraryItem,
  ThemePreference,
  Trip,
  TripDraft,
  TripNote,
  User,
} from '@/domain/types'
import type { TouristState } from './touristReducer'

export type NewExpenseInput = {
  tripId: string
  description: string
  amount: number
  category: Expense['category']
  date: string
  notes: string
}

export type ExpensePatch = Partial<Omit<Expense, 'id' | 'tripId' | 'createdAt'>>

export type NewNoteInput = {
  tripId: string
  title: string
  body: string
}

export type NotePatch = Partial<Pick<TripNote, 'title' | 'body'>>

export type ItineraryItemPatch = Partial<
  Omit<ItineraryItem, 'id' | 'tripId' | 'createdAt' | 'updatedAt' | 'source' | 'editedByUser'>
>

export type CustomItemInput = {
  title: string
  category: ItineraryCategory
  startTime: string
  endTime: string | null
  location: string
  description: string
  estimatedCost: number
  notes: string
}

export type AddToTripInput = {
  dayId: string
  position?: number
  startTime?: string
}

/**
 * The single write surface for feature screens. Every mutation flows through
 * one of these actions, which keeps the itinerary, the budget and the persisted
 * snapshot in step.
 */
export interface TouristActions {
  setThemePreference(preference: ThemePreference): void

  signIn(input: { name: string; email: string | null }): void
  signOut(): void
  loadDemoData(): void
  /**
   * Removes everything Tourist has stored in this browser: every trip and its
   * records, the name and email, and the backup copy. Only the colour theme is
   * kept.
   */
  clearAllData(): void
  /** Hides the one-off notice about how the saved data loaded. */
  dismissStorageNotice(): void

  createTrip(draft: TripDraft): Trip
  updateTrip(tripId: string, patch: Partial<TripDraft>): void
  deleteTrip(tripId: string): void

  generateItinerary(tripId: string, options?: { regenerate?: boolean }): Promise<void>
  retryGeneration(tripId: string): Promise<void>
  setSimulateFailure(tripId: string, shouldFail: boolean): void

  getItem(tripId: string, itemId: string): { day: ItineraryDay; item: ItineraryItem } | null
  editItem(tripId: string, itemId: string, patch: ItineraryItemPatch): void
  replaceItem(tripId: string, itemId: string): Promise<void>
  dismissSwapError(): void
  addCustomItem(tripId: string, input: CustomItemInput, placement: AddToTripInput): ItineraryItem | null
  addExperienceToTrip(
    tripId: string,
    experienceId: string,
    placement: AddToTripInput,
  ): Promise<ItineraryItem | null>
  removeItem(tripId: string, itemId: string): void
  moveItem(tripId: string, itemId: string, dayId: string, position?: number): void

  addExpense(input: NewExpenseInput): Expense | null
  updateExpense(expenseId: string, patch: ExpensePatch): void
  removeExpense(tripId: string, expenseId: string): void

  addNote(input: NewNoteInput): TripNote | null
  updateNote(tripId: string, noteId: string, patch: NotePatch): TripNote | null
  toggleNotePin(tripId: string, noteId: string): void
  removeNote(tripId: string, noteId: string): void

  searchExperiences(query: CatalogQuery): Promise<Experience[]>
  getExperience(id: string): Promise<Experience | null>
  trackSearch(query: CatalogQuery): void
}

/**
 * How this session stands with the browser's storage. The app keeps working in
 * memory whatever happens here, which is exactly why it has to be said out
 * loud: a save that fails looks no different on screen until the page reloads.
 */
export interface StorageStatus {
  /** `failing` while the newest change in this tab did not reach storage. */
  saving: 'ok' | 'failing'
  /** How the saved data read, on mount or when another tab last changed it. */
  load: PersistenceLoadStatus
  /**
   * Whether the payload that read came from was copied to the backup slot.
   * False when no copy was needed, and false when one was needed but could
   * not be written, so a notice never claims a backup that is not there.
   */
  backedUp: boolean
  /**
   * True while this session deliberately writes nothing: the stored payload
   * could not be read and is the only copy of it, so it is left untouched.
   */
  readOnly: boolean
  /** True when `load` describes a change made by another tab, not the page load. */
  fromOtherTab: boolean
  /** True once the traveller has dismissed the notice about `load`. */
  noticeDismissed: boolean
  /** True while the backup slot in this browser holds a copy of earlier data. */
  hasBackup: boolean
}

export interface TouristContextValue {
  state: TouristState
  hydrated: boolean
  actions: TouristActions
  storage: StorageStatus
  /** Item id currently being swapped, so one button can show progress. */
  pendingItemId: string | null
  /** Set when a single-item swap fails; the itinerary itself is untouched. */
  swapError: string | null
  /**
   * The trip the latest swap belongs to. `swapError` is one value for the whole
   * app, so an itinerary page shows it only when this matches its own trip.
   */
  swapTripId: string | null
}

export const TouristContext = createContext<TouristContextValue | null>(null)

export type { PersistedState, User }
