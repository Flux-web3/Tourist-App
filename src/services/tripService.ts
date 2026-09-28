import { createId, nowISO } from '@/domain/ids'
import { eachDay } from '@/domain/format'
import { mergeGeneratedDays } from '@/domain/itinerary'
import { suggestTripName, validateTripDraft } from '@/domain/validation'
import { buildItinerary } from './itineraryGenerator'
import type { Trip, TripDraft } from '@/domain/types'
import type { TripService } from './contracts'

function touchTrip(trip: Trip, patch: Partial<Trip>, timestamp: string): Trip {
  return { ...trip, ...patch, updatedAt: timestamp }
}

/** Dates and pace drive the shape of the draft, so a change re-flows it. */
function shouldReflow(patch: Partial<TripDraft>): boolean {
  return (
    patch.startDate !== undefined ||
    patch.endDate !== undefined ||
    patch.pace !== undefined ||
    patch.destination !== undefined
  )
}

export const tripService: TripService = {
  create(state, draft, userId) {
    const name = typeof draft.name === 'string' ? draft.name.trim() : ''
    const named: TripDraft = {
      ...draft,
      name: name || suggestTripName(draft.destination, draft.startDate),
    }

    if (!validateTripDraft(named).isValid) {
      return { state, trip: null }
    }

    const timestamp = nowISO()
    const tripId = createId('trip')
    const trip: Trip = {
      id: tripId,
      userId,
      name: named.name,
      origin: draft.origin.trim(),
      destination: draft.destination.trim(),
      startDate: draft.startDate,
      endDate: draft.endDate,
      travelers: draft.travelers,
      budget: draft.budget,
      currency: draft.currency,
      interests: [...draft.interests],
      pace: draft.pace,
      notes: draft.notes.trim(),
      status: 'draft',
      createdAt: timestamp,
      updatedAt: timestamp,
    }

    const dayIds = eachDay(trip.startDate, trip.endDate)
    const days = buildItinerary(trip, 0, timestamp).slice(0, dayIds.length)

    return {
      trip,
      state: {
        ...state,
        trips: [...state.trips, trip],
        daysByTrip: { ...state.daysByTrip, [trip.id]: days },
        expensesByTrip: { ...state.expensesByTrip, [trip.id]: [] },
        generation: {
          ...state.generation,
          [trip.id]: { status: 'idle', error: null, shouldFail: false, startedAt: null, completedAt: null },
        },
      },
    }
  },

  update(state, tripId, patch) {
    const current = state.trips.find((trip) => trip.id === tripId)
    if (!current) return { state, trip: null }

    const timestamp = nowISO()
    const next: Trip = {
      ...current,
      ...patch,
      name: patch.name !== undefined ? patch.name.trim() : current.name,
      notes: patch.notes !== undefined ? patch.notes.trim() : current.notes,
      updatedAt: timestamp,
    }

    const trips = state.trips.map((trip) => (trip.id === tripId ? next : trip))
    let daysByTrip = state.daysByTrip

    if (shouldReflow(patch)) {
      const existing = state.daysByTrip[tripId] ?? []
      const regenerated = buildItinerary(next, 0, timestamp)
      daysByTrip = { ...state.daysByTrip, [tripId]: mergeGeneratedDays(existing, regenerated) }
    }

    return { state: { ...state, trips, daysByTrip }, trip: next }
  },

  remove(state, tripId) {
    const daysByTrip = { ...state.daysByTrip }
    const expensesByTrip = { ...state.expensesByTrip }
    const generation = { ...state.generation }
    delete daysByTrip[tripId]
    delete expensesByTrip[tripId]
    delete generation[tripId]

    return {
      ...state,
      trips: state.trips.filter((trip) => trip.id !== tripId),
      daysByTrip,
      expensesByTrip,
      generation,
    }
  },
}

export { touchTrip }
