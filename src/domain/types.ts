/**
 * Core domain contracts for the Tourist prototype.
 *
 * Money is always stored in the trip's own currency as a major-unit number
 * (e.g. 24.5 means 24.50 EUR). All arithmetic goes through `domain/money.ts`
 * so sums never drift on floating point.
 *
 * Dates are ISO `yyyy-mm-dd` strings and times are 24h `HH:mm` strings, which
 * keeps persistence and sorting locale independent.
 */

export type CurrencyCode = 'EUR' | 'USD' | 'GBP' | 'NGN' | 'JPY'

export type TravelInterest =
  | 'culture'
  | 'food'
  | 'outdoors'
  | 'nightlife'
  | 'shopping'
  | 'relaxed'

export type TravelPace = 'relaxed' | 'balanced' | 'packed'

export type TripStatus = 'draft' | 'itinerary_ready'

export type ThemePreference = 'light' | 'dark' | 'system'

export type ResolvedTheme = 'light' | 'dark'

export interface User {
  id: string
  name: string
  email: string | null
  isGuest: boolean
  createdAt: string
}

export interface Trip {
  id: string
  userId: string
  name: string
  origin: string
  destination: string
  startDate: string
  endDate: string
  travelers: number
  budget: number
  currency: CurrencyCode
  interests: TravelInterest[]
  pace: TravelPace
  notes: string
  status: TripStatus
  createdAt: string
  updatedAt: string
}

export type ItineraryCategory =
  | 'food'
  | 'sightseeing'
  | 'culture'
  | 'outdoors'
  | 'shopping'
  | 'nightlife'
  | 'transit'
  | 'stay'

/**
 * `ai` items belong to a generated draft and may be replaced by a regeneration.
 * `user` and `catalog` items are never discarded, and any item the traveller
 * edits is flagged `editedByUser` so regeneration preserves it too.
 */
export type ItineraryItemSource = 'ai' | 'user' | 'catalog'

export interface ItineraryItem {
  id: string
  tripId: string
  title: string
  category: ItineraryCategory
  startTime: string
  endTime: string | null
  location: string
  description: string
  estimatedCost: number
  source: ItineraryItemSource
  editedByUser: boolean
  experienceId: string | null
  notes: string
  createdAt: string
  updatedAt: string
}

export interface ItineraryDay {
  id: string
  tripId: string
  date: string
  index: number
  title: string | null
  items: ItineraryItem[]
}

export type ExpenseCategory =
  | 'stay'
  | 'food'
  | 'transport'
  | 'activities'
  | 'shopping'
  | 'other'

export interface Expense {
  id: string
  tripId: string
  description: string
  amount: number
  currency: CurrencyCode
  category: ExpenseCategory
  date: string
  notes: string
  createdAt: string
  updatedAt: string
}

/** Curated demo catalogue record. Prices are estimates, never live quotes. */
export interface Experience {
  id: string
  name: string
  city: string
  country: string
  neighborhood: string
  category: ItineraryCategory
  summary: string
  description: string
  durationMinutes: number
  priceFrom: number
  currency: CurrencyCode
  isFree: boolean
  rating: number
  reviewCount: number
  imageUrl: string
  imageAlt: string
  imageCredit: ImageCredit | null
  tags: string[]
  hoursNote: string
  bestTime: string
}

export interface ImageCredit {
  author: string
  license: string
  sourceUrl: string
}

export interface TripDraft {
  name: string
  origin: string
  destination: string
  startDate: string
  endDate: string
  travelers: number
  budget: number
  currency: CurrencyCode
  interests: TravelInterest[]
  pace: TravelPace
  notes: string
}

export type TripDraftField = keyof TripDraft

export type TripDraftErrors = Partial<Record<TripDraftField, string>>

export type GenerationStatus = 'idle' | 'loading' | 'success' | 'error'

export interface GenerationState {
  status: GenerationStatus
  error: string | null
  /** Prototype-only switch that forces the next generation to fail. */
  shouldFail: boolean
  startedAt: string | null
  completedAt: string | null
}
