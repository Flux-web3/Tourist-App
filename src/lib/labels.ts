import { getDestination } from '@/data/destinations'
import type {
  CurrencyCode,
  ExpenseCategory,
  ItineraryCategory,
  ItineraryItemRole,
  TravelInterest,
  TravelPace,
} from '@/domain/types'

/**
 * Integrity labels. Anything the prototype does not genuinely know about is
 * marked here rather than being presented as live data.
 */
export const PROTOTYPE_LABEL = {
  curatedGuide: 'Curated guide',
  catalogDemo: 'Catalog demo',
  estimatedPrice: 'Estimated price',
  informationMayChange: 'Information may change',
  aiDraft: 'AI draft',
  aiDraftEstimate: 'AI Draft Estimate',
  tripBudget: 'Trip Budget',
  actualSpent: 'Actual Spent',
  remaining: 'Remaining Budget',
  guest: 'Guest mode',
  localOnly: 'Prototype: saved on this device only',
  noAccount: 'No account needed',
  /** Marks the opt-in demo trip so sample data never passes for the traveller's own. */
  sampleTrip: 'Sample trip',
} as const

export const ITINERARY_CATEGORY_LABEL: Record<ItineraryCategory, string> = {
  food: 'Food',
  sightseeing: 'Sightseeing',
  culture: 'Culture',
  outdoors: 'Outdoors',
  shopping: 'Shopping',
  nightlife: 'Nightlife',
  transit: 'Transit',
  stay: 'Stay',
}

export const ITINERARY_CATEGORY_ICON: Record<ItineraryCategory, string> = {
  food: 'restaurant',
  sightseeing: 'landscape',
  culture: 'museum',
  outdoors: 'park',
  shopping: 'shopping_bag',
  nightlife: 'nightlife',
  transit: 'directions_subway',
  stay: 'hotel',
}

export const EXPENSE_CATEGORY_LABEL: Record<ExpenseCategory, string> = {
  stay: 'Stay',
  food: 'Food',
  transport: 'Transport',
  activities: 'Activities',
  shopping: 'Shopping',
  other: 'Other',
}

export const INTEREST_LABEL: Record<TravelInterest, string> = {
  culture: 'Culture',
  food: 'Food',
  outdoors: 'Outdoors',
  nightlife: 'Nightlife',
  shopping: 'Shopping',
  relaxed: 'Slow mornings',
}

export const PACE_LABEL: Record<TravelPace, string> = {
  relaxed: 'Relaxed',
  balanced: 'Balanced',
  packed: 'Packed',
}

/**
 * How much Tourist knows about a destination, in the words the traveller sees
 * (`Destination.guide`). "General" is said as plainly as "curated" so a city
 * with no guide never reads as a covered one by omission.
 */
export const GUIDE_LABEL = {
  curated: 'Curated guide',
  general: 'General suggestions',
} as const

/** Under the destination field once a general destination is chosen. */
export function generalGuideHint(city: string): string {
  return `Tourist has no curated guide for ${city} yet: Explore is empty and the draft uses general activity types, not local picks.`
}

/**
 * Where a trip stands, read from `destinationId` only. A trip whose id is not
 * in the catalogue (a pre-catalogue "Lisbon") is general too, and is named by
 * the text the traveller typed, since that is all Tourist has.
 */
export function describeTripGuide(trip: { destinationId: string | null; destination: string }): {
  guide: 'curated' | 'general'
  /** The city as the traveller should read it: "Tokyo", or their own "Lisbon". */
  place: string
  /** False for a destination outside the catalogue: its draft has no city or local prices. */
  listed: boolean
  /** The draft's price currency for a listed destination. */
  currency: CurrencyCode | null
} {
  const destination = getDestination(trip.destinationId)
  if (!destination) {
    return { guide: 'general', place: trip.destination.trim() || 'this destination', listed: false, currency: null }
  }
  return { guide: destination.guide, place: destination.city, listed: true, currency: destination.currency }
}

/** Marks the stops that are travel into and out of the city (`ItineraryItem.role`). */
export const TRAVEL_ROLE_LABEL: Record<ItineraryItemRole, string> = {
  arrival: 'Arrival',
  departure: 'Departure',
}
