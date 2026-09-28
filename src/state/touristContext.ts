import { createContext } from 'react'
import type {
  CatalogQuery,
  PersistedState,
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
  clearAllData(): void

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

  searchExperiences(query: CatalogQuery): Promise<Experience[]>
  getExperience(id: string): Promise<Experience | null>
  trackSearch(query: CatalogQuery): void
}

export interface TouristContextValue {
  state: TouristState
  hydrated: boolean
  actions: TouristActions
  /** Item id currently being swapped, so one button can show progress. */
  pendingItemId: string | null
  /** Set when a single-item swap fails; the itinerary itself is untouched. */
  swapError: string | null
}

export const TouristContext = createContext<TouristContextValue | null>(null)

export type { PersistedState, User }
