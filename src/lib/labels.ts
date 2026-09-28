import type { ExpenseCategory, ItineraryCategory, TravelInterest, TravelPace } from '@/domain/types'

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
