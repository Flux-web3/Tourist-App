import { createId, nowISO } from '@/domain/ids'
import { eachDay } from '@/domain/format'
import { mergeGeneratedDays } from '@/domain/itinerary'
import { suggestTripName, validateTripDraft } from '@/domain/validation'
import { buildItinerary } from './itineraryGenerator'
import { DEMO_TRIP_ID } from './persistence'
import type { Trip, TripDraft } from '@/domain/types'
import type { TripService } from './contracts'

function touchTrip(trip: Trip, patch: Partial<Trip>, timestamp: string): Trip {
  return { ...trip, ...patch, updatedAt: timestamp }
}

/** The draft the validator sees, taken from a whole trip rather than a form. */
function toDraft(trip: Trip): TripDraft {
  return {
    name: trip.name,
    origin: trip.origin,
    destination: trip.destination,
    startDate: trip.startDate,
    endDate: trip.endDate,
    travelers: trip.travelers,
    budget: trip.budget,
    currency: trip.currency,
    interests: trip.interests,
    pace: trip.pace,
    notes: trip.notes,
  }
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
        notesByTrip: { ...(state.notesByTrip ?? {}), [trip.id]: [] },
        generation: {
          ...state.generation,
          [trip.id]: { status: 'idle', error: null, startedAt: null, completedAt: null },
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

    // Clearing the name is allowed on edit, so re-derive one rather than
    // leaving the trip nameless in a list that shows nothing to click.
    if (!next.name) {
      next.name = suggestTripName(next.destination, next.startDate)
    }

    /**
     * The same rules that gate creation gate an edit. Without this a patch went
     * straight through, so an `endDate` before the `startDate` left `eachDay`
     * with nothing to return and the trip lost every day it had. The start date
     * is checked against the stored one so a trip that has already begun stays
     * editable.
     */
    if (!validateTripDraft(toDraft(next), { previousStartDate: current.startDate }).isValid) {
      return { state, trip: null }
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
    const notesByTrip = { ...(state.notesByTrip ?? {}) }
    const generation = { ...state.generation }
    delete daysByTrip[tripId]
    delete expensesByTrip[tripId]
    delete notesByTrip[tripId]
    delete generation[tripId]

    return {
      ...state,
      trips: state.trips.filter((trip) => trip.id !== tripId),
      daysByTrip,
      expensesByTrip,
      notesByTrip,
      generation,
      // `hasDemoData` is documented as "true when the seeded demo trip is
      // present", so deleting that trip has to clear it. Left set, the snapshot
      // claimed demo data that no longer existed.
      hasDemoData: tripId === DEMO_TRIP_ID ? false : state.hasDemoData,
    }
  },
}

export { touchTrip }
