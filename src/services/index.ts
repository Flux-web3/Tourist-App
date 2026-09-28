import { createAnalyticsService } from './analytics'
import { expenseService } from './expenseService'
import { itineraryService } from './itineraryService'
import { createNoteService } from './noteService'
import { placeService } from './placeService'
import { createPersistenceService } from './persistence'
import { tripService } from './tripService'
import type { AnalyticsService, ExpenseService, ItineraryService, NoteService, PersistenceService, PlaceService, TripService } from './contracts'

/**
 * Composition root. Swap an implementation here and the whole app follows the
 * same contracts - this is the only file that knows which concrete services
 * are in use.
 */
export interface Services {
  trips: TripService
  itinerary: ItineraryService
  places: PlaceService
  expenses: ExpenseService
  notes: NoteService
  persistence: PersistenceService
  analytics: AnalyticsService
}

export function createServices(): Services {
  return {
    trips: tripService,
    itinerary: itineraryService,
    places: placeService,
    expenses: expenseService,
    notes: createNoteService(),
    persistence: createPersistenceService(),
    analytics: createAnalyticsService(),
  }
}

export const services: Services = createServices()

export * from './contracts'
export { GENERATION_ERROR_MESSAGE, itineraryService } from './itineraryService'
export { buildAlternativeItem, buildItinerary, describePlan, summariseDraft } from './itineraryGenerator'
export { createDemoState, createEmptyState, createGuestUser, createPersistenceService } from './persistence'
