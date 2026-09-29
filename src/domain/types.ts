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

export type CurrencyCode = 'EUR' | 'USD' | 'GBP' | 'NGN' | 'JPY' | 'AED'

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
  /**
   * Where the trip goes, as shown: the chosen destination's `displayName`
   * ("London, United Kingdom"). For a trip saved before destinations came
   * from a catalogue it is whatever was typed, kept as-is.
   */
  destination: string
  /**
   * The destination's identity (`data/destinations.ts`), and the only thing
   * Explore, place details and itinerary drafting read to know where the trip
   * is. Null only for a pre-catalogue trip whose typed destination names no
   * catalogue city; those are never treated as Paris or anywhere else.
   */
  destinationId: string | null
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
  /**
   * The currency `estimatedCost` is quoted in, carried on the item exactly as
   * `Expense.currency` is carried on an expense.
   *
   * Without it a stop was a bare number, so switching a trip from EUR to NGN
   * relabelled EUR-priced stops as naira. A generated stop takes the trip's own
   * currency; a stop saved from the catalogue takes the catalogue's, because a
   * €22 Louvre ticket dropped into a naira trip really is still in euro.
   * Changing a trip's currency never rewrites an item: a mismatch is excluded
   * from the total and reported, never converted. There are no exchange rates in
   * this app.
   */
  currency: CurrencyCode
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

/**
 * A free-form note the traveller writes for themselves.
 *
 * Notes are deliberately their own record rather than a field on an itinerary
 * item: they are never regenerated, replaced or re-costed, so anything the
 * traveller writes here survives every draft change.
 */
export interface TripNote {
  id: string
  tripId: string
  title: string
  body: string
  /** Pinned notes sort above the rest so they stay visible on a long trip. */
  pinned: boolean
  createdAt: string
  updatedAt: string
}

/** Curated demo catalogue record. Prices are estimates, never live quotes. */
export interface Experience {
  id: string
  name: string
  /** The destination this place is in (`data/destinations.ts`). Explore filters on it. */
  destinationId: string
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
  /**
   * A licensed photograph of the place, or null when there is none. Null is
   * shown as a drawn cover, never as a borrowed photo of somewhere else.
   */
  imageUrl: string | null
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
  /** Display name of the chosen destination; mirrors `destinationId`. */
  destination: string
  /** Chosen from the destination catalogue; required for a new trip. */
  destinationId: string | null
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
  startedAt: string | null
  completedAt: string | null
  /**
   * @deprecated Prototype-only switch that forced the next generation to fail.
   *
   * No longer read or written. It used to live here, which meant it was
   * persisted: a `true` written by the demo switch survived a reload and wedged
   * that trip into permanent failure with no UI left to turn it back off. The
   * switch now lives in a non-persisted ref inside `TouristProvider`, so it
   * lasts exactly as long as the session that set it. Declared optional only so
   * that snapshots and fixtures written against v1 still load and still type;
   * nothing should start reading it again.
   */
  shouldFail?: boolean
}
