import { createId, nowISO } from '@/domain/ids'
import { eachDay } from '@/domain/format'
import { countItems, mergeGeneratedDays, stripOtherDestinationItems } from '@/domain/itinerary'
import { getDestination, matchDestination } from '@/data/destinations'
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
    destinationId: trip.destinationId ?? null,
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

/**
 * The catalogue destination a draft or patch means when it carries no id. Only
 * code that predates the destination picker sends text alone; text naming
 * exactly one catalogue city is taken as that city (the rule stored trips were
 * migrated by), and anything else stays unlisted rather than guessed.
 */
function destinationIdFromText(text: string): string | null {
  return matchDestination(text)?.id ?? null
}

/**
 * Dates, pace and destination set the shape of the draft, so the draft is
 * re-flowed when one of them changes value. The test compares the stored trip
 * with the edited one, not what the patch contains. The edit dialog always sends
 * the whole draft, so testing only whether a field was present rebuilt the plan
 * from variant 0 on every save. A rename or a budget change threw away the draft
 * the traveller had regenerated to.
 *
 * The destination is compared by `destinationId` whenever either trip has one,
 * because the id is what the generator drafts from. The text is only display: a
 * migrated trip stored as "paris" becomes "Paris, France" when the traveller
 * picks the same city again, and comparing the text re-drafted their plan for a
 * change of spelling. The text decides only between two trips with no id, which
 * is all a pre-catalogue trip has, and then without its surrounding spaces.
 *
 * `currency` is deliberately not in the set. The generator's template prices are
 * euro prices, and every generated stop is priced in EUR whatever the trip's
 * currency. So regenerating on a currency change reprices nothing. All it would do
 * is discard the traveller's chosen draft. Stops priced in a currency other than
 * the trip's are reported as uncounted by the budget screen, and nothing is ever
 * converted.
 *
 * Keep this set in step with `sameItineraryShape` in `TouristProvider`, which
 * decides when an in-flight generation describes a trip that no longer exists.
 */
function shouldReflow(current: Trip, next: Trip): boolean {
  const currentId = current.destinationId ?? null
  const nextId = next.destinationId ?? null
  const destinationChanged =
    currentId !== null || nextId !== null
      ? nextId !== currentId
      : next.destination.trim() !== current.destination.trim()
  return (
    next.startDate !== current.startDate ||
    next.endDate !== current.endDate ||
    next.pace !== current.pace ||
    destinationChanged
  )
}

export const tripService: TripService = {
  create(state, draft, userId) {
    const destinationId = draft.destinationId ?? destinationIdFromText(draft.destination)
    // A chosen destination is stored under the catalogue's own name, so the
    // text a trip shows can never disagree with the city it is planned for.
    const destination = getDestination(destinationId)?.displayName ?? draft.destination.trim()
    const name = typeof draft.name === 'string' ? draft.name.trim() : ''
    const named: TripDraft = {
      ...draft,
      destination,
      destinationId,
      name: name || suggestTripName(destination, draft.startDate, destinationId),
    }

    if (!validateTripDraft(named).isValid) {
      return { state, trip: null }
    }

    const timestamp = nowISO()
    const tripId = createId('trip')
    const drafted: Trip = {
      id: tripId,
      userId,
      name: named.name,
      origin: draft.origin.trim(),
      destination: named.destination,
      destinationId: named.destinationId,
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

    const dayIds = eachDay(drafted.startDate, drafted.endDate)
    const days = buildItinerary(drafted, 0, timestamp).slice(0, dayIds.length)
    // The plan is drafted right here, so a trip that has stops is not a bare
    // draft. Left as 'draft', the Trips list said "Itinerary not generated"
    // beside "15 planned stops".
    const trip: Trip = countItems(days) > 0 ? { ...drafted, status: 'itinerary_ready' } : drafted

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
    const currentDestinationId = current.destinationId ?? null
    const destinationText = (patch.destination ?? current.destination).trim()
    const textChanged = patch.destination !== undefined && destinationText !== current.destination.trim()
    const destinationId =
      patch.destinationId !== undefined
        ? patch.destinationId
        : textChanged
          ? destinationIdFromText(destinationText)
          : currentDestinationId
    /*
      Only a destination being chosen now takes the catalogue's display name. A
      migrated trip keeps the text it was typed with ("paris") until the
      traveller picks again; rewriting it on an unrelated save would also read
      as a destination change and re-flow their draft.
    */
    const destination =
      destinationId !== currentDestinationId
        ? (getDestination(destinationId)?.displayName ?? destinationText)
        : destinationText
    const next: Trip = {
      ...current,
      ...patch,
      destination,
      destinationId,
      name: patch.name !== undefined ? patch.name.trim() : current.name,
      notes: patch.notes !== undefined ? patch.notes.trim() : current.notes,
      updatedAt: timestamp,
    }

    // Clearing the name is allowed on edit, so re-derive one rather than
    // leaving the trip nameless in a list that shows nothing to click.
    if (!next.name) {
      next.name = suggestTripName(next.destination, next.startDate, next.destinationId)
    }
    /*
      A name Tourist suggested ("London in September") describes the trip, not
      the traveller's wording, so it follows the trip: moved to Paris, it read
      "Curated Paris places you can add to any day of London in September". A
      name the traveller wrote themselves is never touched.
    */
    const suggestedBefore = suggestTripName(current.destination, current.startDate, currentDestinationId)
    if (next.name === suggestedBefore) {
      next.name = suggestTripName(next.destination, next.startDate, next.destinationId)
    }

    /**
     * The same rules that gate creation gate an edit. Without this a patch went
     * straight through, so an `endDate` before the `startDate` left `eachDay`
     * with nothing to return and the trip lost every day it had. The start date
     * is checked against the stored one so a trip that has already begun stays
     * editable, and so is the destination, so a pre-catalogue trip whose city
     * Tourist does not list can still be edited without changing city.
     */
    const context = {
      previousStartDate: current.startDate,
      previousDestination: { destination: current.destination, destinationId: currentDestinationId },
    }
    if (!validateTripDraft(toDraft(next), context).isValid) {
      return { state, trip: null }
    }

    const trips = state.trips.map((trip) => (trip.id === tripId ? next : trip))
    let daysByTrip = state.daysByTrip

    if (shouldReflow(current, next)) {
      /*
        A new city is not a new date range. What a date or pace change keeps
        (catalogue places, hand-edited AI stops) was planned for the old city,
        so it goes before the re-flow, leaving only the traveller's own stops
        and any place in the new city's guide. Done here rather than in the
        dialog so every caller that moves a trip gets the same plan.
      */
      const existing =
        destinationId !== currentDestinationId
          ? stripOtherDestinationItems(state.daysByTrip[tripId] ?? [], destinationId)
          : (state.daysByTrip[tripId] ?? [])
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
