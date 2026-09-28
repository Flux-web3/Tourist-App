import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { addDays, eachDay } from '@/domain/format'
import { moveItemInDays } from '@/domain/itinerary'
import type { ItineraryItem, Trip, TripDraft } from '@/domain/types'
import { createEmptyDraft, suggestTripName, TRIP_LIMITS, validateTripDraft } from '@/domain/validation'
import { STORAGE_VERSION, type PersistedState } from '@/services/contracts'
import { buildItinerary } from '@/services/itineraryGenerator'
import { createDemoState, createEmptyState, createGuestUser, DEMO_TRIP_ID } from '@/services/persistence'
import { tripService } from '@/services/tripService'

const FIXED_NOW = new Date('2026-03-15T09:30:00.000Z')
const FIXED_ISO = '2026-03-15T09:30:00.000Z'
const START = '2026-04-01'
const END = '2026-04-05'

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(FIXED_NOW)
})

afterEach(() => {
  vi.useRealTimers()
})

function validDraft(overrides: Partial<TripDraft> = {}): TripDraft {
  return {
    name: 'Paris in the Spring',
    origin: 'Lagos, Nigeria',
    destination: 'Paris, France',
    startDate: START,
    endDate: END,
    travelers: 2,
    budget: 2500,
    currency: 'EUR',
    interests: ['culture', 'food'],
    pace: 'balanced',
    notes: 'Keep one day light',
    ...overrides,
  }
}

function baseState(): PersistedState {
  return createEmptyState(createGuestUser())
}

function daysOf(state: PersistedState, tripId: string) {
  return state.daysByTrip[tripId] ?? []
}

function allItems(state: PersistedState, tripId: string): ItineraryItem[] {
  return daysOf(state, tripId).flatMap((day) => day.items)
}

function syntheticItem(overrides: Partial<ItineraryItem> & { id: string }): ItineraryItem {
  return {
    tripId: 'trip_seed',
    title: 'Synthetic stop',
    category: 'sightseeing',
    startTime: '12:00',
    endTime: '13:00',
    location: 'Le Marais',
    description: 'Synthetic description',
    estimatedCost: 0,
    currency: 'EUR',
    source: 'ai',
    editedByUser: false,
    experienceId: null,
    notes: '',
    createdAt: FIXED_ISO,
    updatedAt: FIXED_ISO,
    ...overrides,
  }
}

function seedItemsInto(state: PersistedState, tripId: string): PersistedState {
  const days = daysOf(state, tripId)
  const first = days[0]
  if (!first) throw new Error('fixture trip has no days')
  return {
    ...state,
    daysByTrip: {
      ...state.daysByTrip,
      [tripId]: [{ ...first, items: [...first.items, ...preservedFixtures()] }, ...days.slice(1)],
    },
  }
}

function preservedFixtures(): ItineraryItem[] {
  return [
    syntheticItem({ id: 'itm_user_added', source: 'user', title: 'User added stop' }),
    syntheticItem({
      id: 'itm_catalog_added',
      source: 'catalog',
      title: 'Catalog added stop',
      experienceId: 'exp_marais_walk',
    }),
    syntheticItem({ id: 'itm_ai_edited', source: 'ai', editedByUser: true, title: 'Edited AI stop' }),
    syntheticItem({ id: 'itm_ai_plain', source: 'ai', editedByUser: false, title: 'Plain AI stop' }),
  ]
}

function createdTrip(state: PersistedState): Trip {
  const trip = state.trips[0]
  if (!trip) throw new Error('fixture trip was not created')
  return trip
}

describe('tripService.create', () => {
  it('builds a trip with days already present for the full date range', () => {
    const { state, trip } = tripService.create(baseState(), validDraft(), 'usr_fixture')

    expect(trip).not.toBeNull()
    const days = daysOf(state, trip?.id ?? '')
    expect(days).toHaveLength(5)
    expect(days.map((day) => day.date)).toEqual(eachDay(START, END))
    expect(days.map((day) => day.index)).toEqual([1, 2, 3, 4, 5])
    for (const day of days) {
      expect(day.tripId).toBe(trip?.id)
      expect(day.items.length).toBeGreaterThan(0)
    }
  })

  it('starts the trip in draft status', () => {
    const { trip } = tripService.create(baseState(), validDraft(), 'usr_fixture')

    expect(trip?.status).toBe('draft')
  })

  it('issues a unique id per trip', () => {
    const state = baseState()
    const first = tripService.create(state, validDraft(), 'usr_fixture')
    const second = tripService.create(first.state, validDraft({ name: 'Second trip' }), 'usr_fixture')

    expect(first.trip?.id).not.toBe(second.trip?.id)
    expect(first.state.trips).toHaveLength(1)
    expect(second.state.trips).toHaveLength(2)
    expect(new Set(second.state.trips.map((trip) => trip.id)).size).toBe(2)
  })

  it('copies the draft onto the trip and keeps the caller state untouched', () => {
    const state = baseState()
    const draft = validDraft()
    const { trip } = tripService.create(state, draft, 'usr_fixture')

    expect(trip?.userId).toBe('usr_fixture')
    expect(trip?.origin).toBe(draft.origin)
    expect(trip?.destination).toBe(draft.destination)
    expect(trip?.travelers).toBe(2)
    expect(trip?.budget).toBe(2500)
    expect(trip?.currency).toBe('EUR')
    expect(trip?.pace).toBe('balanced')
    expect(trip?.interests).toEqual(draft.interests)
    expect(trip?.interests).not.toBe(draft.interests)
    expect(state.trips).toHaveLength(0)
    expect(state.daysByTrip).toEqual({})
  })

  it('trims free text fields', () => {
    const { trip } = tripService.create(
      baseState(),
      validDraft({ origin: '  Lagos  ', destination: '  Paris  ', notes: '  hello  ' }),
      'usr_fixture',
    )

    expect(trip?.origin).toBe('Lagos')
    expect(trip?.destination).toBe('Paris')
    expect(trip?.notes).toBe('hello')
  })

  it('trims the trip name', () => {
    const { trip } = tripService.create(
      baseState(),
      validDraft({ name: '  Paris in the Spring  ' }),
      'usr_fixture',
    )

    expect(trip?.name).toBe('Paris in the Spring')
  })

  it('registers an empty expense bucket and an idle generation record', () => {
    const { state, trip } = tripService.create(baseState(), validDraft(), 'usr_fixture')
    const tripId = trip?.id ?? ''

    expect(state.expensesByTrip[tripId]).toEqual([])
    expect(state.generation[tripId]).toEqual({
      status: 'idle',
      error: null,
      startedAt: null,
      completedAt: null,
    })
  })

  it('registers an empty notes bucket for the new trip', () => {
    const { state, trip } = tripService.create(baseState(), validDraft(), 'usr_fixture')

    expect(state.notesByTrip?.[trip?.id ?? '']).toEqual([])
  })

  it('stamps created and updated at the same moment', () => {
    const { trip } = tripService.create(baseState(), validDraft(), 'usr_fixture')

    expect(trip?.createdAt).toBe(FIXED_ISO)
    expect(trip?.updatedAt).toBe(FIXED_ISO)
  })

  it('keeps a single-day trip to a single day', () => {
    const { state, trip } = tripService.create(
      baseState(),
      validDraft({ startDate: START, endDate: START }),
      'usr_fixture',
    )

    expect(daysOf(state, trip?.id ?? '')).toHaveLength(1)
  })

  it('rejects a draft the domain validator refuses instead of creating a trip', () => {
    const draft = createEmptyDraft()
    expect(validateTripDraft(draft).isValid).toBe(false)

    const state = baseState()
    const result = tripService.create(state, draft, 'usr_fixture')

    expect(result.trip).toBeNull()
    expect(result.state).toBe(state)
  })

  it('names a blank draft from its destination and start month instead of storing nothing', () => {
    const state = baseState()

    const result = tripService.create(state, validDraft({ name: '   ' }), 'usr_fixture')

    expect(result.trip?.name).toBe(suggestTripName('Paris, France', START))
    expect(result.state.trips).toHaveLength(1)
  })

  it('still rejects a blank draft once the suggested name cannot be built', () => {
    const state = baseState()
    const draft = validDraft({ name: '   ', destination: '' })

    const result = tripService.create(state, draft, 'usr_fixture')

    expect(result.trip).toBeNull()
    expect(result.state).toBe(state)
  })

  it('rejects a name longer than the documented limit', () => {
    const state = baseState()
    const draft = validDraft({ name: 'P'.repeat(TRIP_LIMITS.maxNameLength + 1) })

    const result = tripService.create(state, draft, 'usr_fixture')

    expect(result.trip).toBeNull()
    expect(result.state).toBe(state)
  })

  it('accepts a name at exactly the documented limit', () => {
    const name = 'P'.repeat(TRIP_LIMITS.maxNameLength)

    const { trip } = tripService.create(baseState(), validDraft({ name }), 'usr_fixture')

    expect(trip?.name).toBe(name)
  })

  it('rejects a destination shorter than the documented minimum', () => {
    const state = baseState()

    const result = tripService.create(state, validDraft({ destination: 'P' }), 'usr_fixture')

    expect(result.trip).toBeNull()
    expect(result.state).toBe(state)
  })

  it('rejects an origin shorter than the documented minimum', () => {
    const state = baseState()

    const result = tripService.create(state, validDraft({ origin: ' ' }), 'usr_fixture')

    expect(result.trip).toBeNull()
    expect(result.state).toBe(state)
  })

  it('rejects a date range that ends before it starts', () => {
    const state = baseState()

    const result = tripService.create(
      state,
      validDraft({ startDate: '2026-04-05', endDate: '2026-04-01' }),
      'usr_fixture',
    )

    expect(result.trip).toBeNull()
    expect(result.state).toBe(state)
  })

  it('rejects a budget of zero', () => {
    const state = baseState()

    const result = tripService.create(state, validDraft({ budget: 0 }), 'usr_fixture')

    expect(result.trip).toBeNull()
    expect(result.state).toBe(state)
  })

  it('rejects a draft with no interests', () => {
    const state = baseState()

    const result = tripService.create(state, validDraft({ interests: [] }), 'usr_fixture')

    expect(result.trip).toBeNull()
    expect(result.state).toBe(state)
  })

  it('rejects a start date that is not a real calendar date', () => {
    const state = baseState()

    const result = tripService.create(
      state,
      validDraft({ startDate: '2026-02-30', endDate: END }),
      'usr_fixture',
    )

    expect(result.trip).toBeNull()
    expect(result.state).toBe(state)
  })

  it('leaves no days, expenses or generation record behind after a rejection', () => {
    const state = baseState()

    tripService.create(state, createEmptyDraft(), 'usr_fixture')

    expect(state.daysByTrip).toEqual({})
    expect(state.expensesByTrip).toEqual({})
    expect(state.generation).toEqual({})
  })
})

describe('tripService.update', () => {
  it('returns a result describing what changed', () => {
    const created = tripService.create(baseState(), validDraft(), 'usr_fixture')
    const tripId = created.trip?.id ?? ''

    const result = tripService.update(created.state, tripId, { travelers: 4, budget: 3200 })

    expect(result.trip?.id).toBe(tripId)
    expect(result.trip?.travelers).toBe(4)
    expect(result.trip?.budget).toBe(3200)
    expect(result.state.trips).toHaveLength(1)
    expect(result.state.trips[0]?.travelers).toBe(4)
    expect(result.trip?.updatedAt).toBe(FIXED_ISO)
  })

  it('leaves untouched fields alone', () => {
    const created = tripService.create(baseState(), validDraft(), 'usr_fixture')
    const before = created.trip

    const result = tripService.update(created.state, before?.id ?? '', { travelers: 5 })

    expect(result.trip?.name).toBe(before?.name)
    expect(result.trip?.origin).toBe(before?.origin)
    expect(result.trip?.destination).toBe(before?.destination)
    expect(result.trip?.startDate).toBe(before?.startDate)
    expect(result.trip?.endDate).toBe(before?.endDate)
    expect(result.trip?.pace).toBe(before?.pace)
    expect(result.trip?.status).toBe(before?.status)
    expect(result.trip?.createdAt).toBe(before?.createdAt)
  })

  it('trims a patched name and notes', () => {
    const created = tripService.create(baseState(), validDraft(), 'usr_fixture')

    const result = tripService.update(created.state, created.trip?.id ?? '', {
      name: '  Renamed  ',
      notes: '  updated note  ',
    })

    expect(result.trip?.name).toBe('Renamed')
    expect(result.trip?.notes).toBe('updated note')
  })

  it('returns a null trip and the same state for an unknown id', () => {
    const created = tripService.create(baseState(), validDraft(), 'usr_fixture')

    const result = tripService.update(created.state, 'trip_does_not_exist', { travelers: 9 })

    expect(result.trip).toBeNull()
    expect(result.state).toBe(created.state)
  })

  it('does not change the days at all when only the name changes', () => {
    const created = tripService.create(baseState(), validDraft(), 'usr_fixture')
    const tripId = created.trip?.id ?? ''
    const daysBefore = daysOf(created.state, tripId)

    const result = tripService.update(created.state, tripId, { name: 'Just a rename' })

    expect(result.state.daysByTrip[tripId]).toEqual(daysBefore)
    expect(daysOf(result.state, tripId)).toHaveLength(5)
    expect(allItems(result.state, tripId).map((item) => item.id)).toEqual(
      allItems(created.state, tripId).map((item) => item.id),
    )
  })

  it('reflows the days when the end date moves', () => {
    const created = tripService.create(baseState(), validDraft(), 'usr_fixture')
    const tripId = created.trip?.id ?? ''

    const result = tripService.update(created.state, tripId, { endDate: addDays(END, 2) })

    expect(result.trip?.endDate).toBe(addDays(END, 2))
    const days = daysOf(result.state, tripId)
    expect(days).toHaveLength(7)
    expect(days.map((day) => day.date)).toEqual(eachDay(START, addDays(END, 2)))
    expect(days.map((day) => day.index)).toEqual([1, 2, 3, 4, 5, 6, 7])
  })

  it('reflows the days when the start date moves', () => {
    const created = tripService.create(baseState(), validDraft(), 'usr_fixture')
    const tripId = created.trip?.id ?? ''

    const result = tripService.update(created.state, tripId, { startDate: addDays(START, 1) })

    const days = daysOf(result.state, tripId)
    expect(days).toHaveLength(4)
    expect(days[0]?.date).toBe(addDays(START, 1))
    expect(days[0]?.index).toBe(1)
  })

  it('reflows the days when the pace changes', () => {
    const created = tripService.create(baseState(), validDraft({ pace: 'relaxed' }), 'usr_fixture')
    const tripId = created.trip?.id ?? ''
    const relaxedCount = allItems(created.state, tripId).length

    const result = tripService.update(created.state, tripId, { pace: 'packed' })

    expect(result.trip?.pace).toBe('packed')
    expect(allItems(result.state, tripId).length).toBeGreaterThan(relaxedCount)
  })

  it('reflows the days when the destination changes to a non-Paris city', () => {
    const created = tripService.create(baseState(), validDraft(), 'usr_fixture')
    const tripId = created.trip?.id ?? ''
    const parisTitles = allItems(created.state, tripId).map((item) => item.title)
    expect(parisTitles).toContain('Arrive, drop bags, and walk the neighbourhood')

    const result = tripService.update(created.state, tripId, { destination: 'Lisbon, Portugal' })

    const lisbonTitles = allItems(result.state, tripId).map((item) => item.title)
    expect(lisbonTitles).toContain('Arrive and settle in')
    expect(lisbonTitles).not.toContain('Arrive, drop bags, and walk the neighbourhood')
    expect(lisbonTitles.some((title) => /Louvre|Orsay|Seine|Versailles|Montmartre|Sacre/.test(title))).toBe(
      false,
    )
  })

  it('keeps traveller-owned items exactly once and drops unedited AI items on a date reflow', () => {
    const created = tripService.create(baseState(), validDraft(), 'usr_fixture')
    const tripId = created.trip?.id ?? ''
    const seeded = seedItemsInto(created.state, tripId)
    expect(allItems(seeded, tripId).map((item) => item.id)).toContain('itm_ai_plain')

    const result = tripService.update(seeded, tripId, { endDate: addDays(END, 2) })
    const ids = allItems(result.state, tripId).map((item) => item.id)

    expect(ids.filter((id) => id === 'itm_user_added')).toHaveLength(1)
    expect(ids.filter((id) => id === 'itm_catalog_added')).toHaveLength(1)
    expect(ids.filter((id) => id === 'itm_ai_edited')).toHaveLength(1)
    expect(ids).not.toContain('itm_ai_plain')
    expect(daysOf(result.state, tripId)).toHaveLength(7)
    expect(
      daysOf(result.state, tripId)[0]?.items.filter((item) => item.id === 'itm_user_added'),
    ).toHaveLength(1)
  })

  it('keeps traveller-owned items exactly once and drops unedited AI items on a pace reflow', () => {
    const created = tripService.create(baseState(), validDraft(), 'usr_fixture')
    const tripId = created.trip?.id ?? ''
    const seeded = seedItemsInto(created.state, tripId)

    const result = tripService.update(seeded, tripId, { pace: 'packed' })
    const ids = allItems(result.state, tripId).map((item) => item.id)

    expect(ids.filter((id) => id === 'itm_user_added')).toHaveLength(1)
    expect(ids.filter((id) => id === 'itm_catalog_added')).toHaveLength(1)
    expect(ids.filter((id) => id === 'itm_ai_edited')).toHaveLength(1)
    expect(ids).not.toContain('itm_ai_plain')
  })

  it('keeps traveller-owned items exactly once and drops unedited AI items on a destination reflow', () => {
    const created = tripService.create(baseState(), validDraft(), 'usr_fixture')
    const tripId = created.trip?.id ?? ''
    const seeded = seedItemsInto(created.state, tripId)

    const result = tripService.update(seeded, tripId, { destination: 'Lisbon, Portugal' })
    const ids = allItems(result.state, tripId).map((item) => item.id)

    expect(ids.filter((id) => id === 'itm_user_added')).toHaveLength(1)
    expect(ids.filter((id) => id === 'itm_catalog_added')).toHaveLength(1)
    expect(ids.filter((id) => id === 'itm_ai_edited')).toHaveLength(1)
    expect(ids).not.toContain('itm_ai_plain')
  })

  it('preserves the traveller-owned item payload unchanged', () => {
    const created = tripService.create(baseState(), validDraft(), 'usr_fixture')
    const tripId = created.trip?.id ?? ''
    const seeded = seedItemsInto(created.state, tripId)
    const original = allItems(seeded, tripId).find((item) => item.id === 'itm_catalog_added')

    const result = tripService.update(seeded, tripId, { pace: 'relaxed' })
    const after = allItems(result.state, tripId).find((item) => item.id === 'itm_catalog_added')

    expect(after).toEqual(original)
    expect(after?.source).toBe('catalog')
    expect(after?.experienceId).toBe('exp_marais_walk')
  })

  it('gives every reflowed day a fresh set of AI drafts', () => {
    const created = tripService.create(baseState(), validDraft(), 'usr_fixture')
    const tripId = created.trip?.id ?? ''
    const beforeIds = allItems(created.state, tripId).map((item) => item.id)

    const result = tripService.update(created.state, tripId, { pace: 'packed' })
    const afterIds = allItems(result.state, tripId).map((item) => item.id)

    expect(afterIds).not.toEqual(beforeIds)
    expect(new Set(afterIds).size).toBe(afterIds.length)
  })

  /**
   * The generator's template prices are euro prices, so a generated stop is
   * priced in EUR whatever the trip's currency. Regenerating on a currency change
   * therefore repriced nothing, and only threw away the draft the traveller had
   * chosen.
   */
  it('does not reflow the days when the currency changes', () => {
    const created = tripService.create(baseState(), validDraft(), 'usr_fixture')
    const tripId = created.trip?.id ?? ''
    const before = daysOf(created.state, tripId)
    expect(allItems(created.state, tripId).every((item) => item.currency === 'EUR')).toBe(true)

    const result = tripService.update(created.state, tripId, { currency: 'NGN' })

    expect(result.trip?.currency).toBe('NGN')
    expect(result.state.daysByTrip[tripId]).toBe(before)
    const items = allItems(result.state, tripId)
    expect(items.length).toBeGreaterThan(0)
    expect(items.every((item) => item.currency === 'EUR')).toBe(true)
  })

  it('keeps every stop, the untouched AI ones included, when the currency changes', () => {
    const created = tripService.create(baseState(), validDraft(), 'usr_fixture')
    const tripId = created.trip?.id ?? ''
    const seeded = seedItemsInto(created.state, tripId)
    const idsBefore = allItems(seeded, tripId).map((item) => item.id)

    const result = tripService.update(seeded, tripId, { currency: 'NGN' })

    expect(allItems(result.state, tripId).map((item) => item.id)).toEqual(idsBefore)
    expect(idsBefore).toContain('itm_ai_plain')
  })

  /**
   * The traveller's own half of the plan is never silently rewritten. A preserved
   * stop keeping its old currency is correct, not a bug: it is then reported as
   * uncounted rather than relabelled.
   */
  it('does not rewrite the currency of a preserved stop', () => {
    const created = tripService.create(baseState(), validDraft(), 'usr_fixture')
    const tripId = created.trip?.id ?? ''
    const seeded = seedItemsInto(created.state, tripId)
    const original = allItems(seeded, tripId).find((item) => item.id === 'itm_catalog_added')
    expect(original?.currency).toBe('EUR')

    const result = tripService.update(seeded, tripId, { currency: 'NGN' })
    const after = allItems(result.state, tripId).find((item) => item.id === 'itm_catalog_added')

    expect(after).toEqual(original)
    expect(after?.currency).toBe('EUR')
    expect(result.trip?.currency).toBe('NGN')
  })

  it('leaves the AI draft in EUR and keeps its ids when the currency changes to JPY', () => {
    const created = tripService.create(baseState(), validDraft(), 'usr_fixture')
    const tripId = created.trip?.id ?? ''
    const seeded = seedItemsInto(created.state, tripId)
    // Generated ids also carry the `itm_` prefix, so the fixture ids are named
    // explicitly rather than matched on shape.
    const fixtureIds = new Set(preservedFixtures().map((item) => item.id))
    const generatedBefore = allItems(seeded, tripId).filter((item) => !fixtureIds.has(item.id))

    const result = tripService.update(seeded, tripId, { currency: 'JPY' })
    const generatedAfter = allItems(result.state, tripId).filter((item) => !fixtureIds.has(item.id))

    expect(generatedAfter.length).toBeGreaterThan(0)
    expect(generatedAfter.map((item) => item.id)).toEqual(generatedBefore.map((item) => item.id))
    expect(generatedAfter.every((item) => item.currency === 'EUR')).toBe(true)
  })

  it('does not reflow for any supported currency', () => {
    for (const currency of ['EUR', 'USD', 'GBP', 'NGN', 'JPY'] as const) {
      const created = tripService.create(baseState(), validDraft(), 'usr_fixture')
      const tripId = created.trip?.id ?? ''
      const before = daysOf(created.state, tripId)

      const result = tripService.update(created.state, tripId, { currency })

      expect(result.trip?.currency, `currency=${currency}`).toBe(currency)
      expect(result.state.daysByTrip[tripId], `currency=${currency}`).toBe(before)
      expect(
        allItems(result.state, tripId).every((item) => item.currency === 'EUR'),
        `currency=${currency}`,
      ).toBe(true)
    }
  })

  it('does not reflow when the patch leaves the currency alone', () => {
    const created = tripService.create(baseState(), validDraft(), 'usr_fixture')
    const tripId = created.trip?.id ?? ''
    const before = daysOf(created.state, tripId)

    const result = tripService.update(created.state, tripId, { name: 'Renamed trip' })

    expect(result.state.daysByTrip[tripId]).toBe(before)
  })

  it('only touches the trip that was patched', () => {
    const first = tripService.create(baseState(), validDraft(), 'usr_fixture')
    const firstId = first.trip?.id ?? ''
    const second = tripService.create(
      first.state,
      validDraft({ name: 'Second trip', destination: 'Lisbon, Portugal' }),
      'usr_fixture',
    )
    const secondId = second.trip?.id ?? ''
    const secondDaysBefore = daysOf(second.state, secondId)

    const result = tripService.update(second.state, firstId, { endDate: addDays(END, 3) })

    expect(daysOf(result.state, firstId)).toHaveLength(8)
    expect(result.state.daysByTrip[secondId]).toBe(secondDaysBefore)
    expect(createdTrip(second.state).id).toBe(firstId)
  })
})

/** The patch the edit dialog sends: the whole draft, every field, on every save. */
function wholeDraft(trip: Trip, overrides: Partial<TripDraft> = {}): TripDraft {
  return {
    name: trip.name,
    origin: trip.origin,
    destination: trip.destination,
    startDate: trip.startDate,
    endDate: trip.endDate,
    travelers: trip.travelers,
    budget: trip.budget,
    currency: trip.currency,
    interests: [...trip.interests],
    pace: trip.pace,
    notes: trip.notes,
    ...overrides,
  }
}

function itemIds(state: PersistedState, tripId: string): string[] {
  return allItems(state, tripId).map((item) => item.id)
}

/**
 * The edit dialog always sends the whole draft, so a reflow keyed on "is the
 * field in the patch" fired on every save. A rename or a budget change rebuilt
 * the plan from variant 0 and threw away the draft the traveller had chosen.
 */
describe('tripService.update reflows only when the plan’s shape changes value', () => {
  it('keeps the exact AI item ids when a whole-draft save only renames the trip', () => {
    const created = tripService.create(baseState(), validDraft(), 'usr_fixture')
    const trip = createdTrip(created.state)
    const before = daysOf(created.state, trip.id)

    const result = tripService.update(created.state, trip.id, wholeDraft(trip, { name: 'Paris, renamed' }))

    expect(result.trip?.name).toBe('Paris, renamed')
    expect(result.state.daysByTrip[trip.id]).toBe(before)
    expect(itemIds(result.state, trip.id)).toEqual(itemIds(created.state, trip.id))
  })

  it('keeps the exact AI item ids when a whole-draft save only changes the budget', () => {
    const created = tripService.create(baseState(), validDraft(), 'usr_fixture')
    const trip = createdTrip(created.state)
    const before = daysOf(created.state, trip.id)

    const result = tripService.update(created.state, trip.id, wholeDraft(trip, { budget: 4200 }))

    expect(result.trip?.budget).toBe(4200)
    expect(result.state.daysByTrip[trip.id]).toBe(before)
    expect(itemIds(result.state, trip.id)).toEqual(itemIds(created.state, trip.id))
  })

  it('keeps a regenerated draft (variant 3) when the trip is renamed', () => {
    const created = tripService.create(baseState(), validDraft(), 'usr_fixture')
    const trip = createdTrip(created.state)
    const variantThree = buildItinerary(trip, 3, FIXED_ISO)
    const state: PersistedState = {
      ...created.state,
      daysByTrip: { ...created.state.daysByTrip, [trip.id]: variantThree },
    }

    const result = tripService.update(state, trip.id, wholeDraft(trip, { name: 'Paris, renamed' }))

    expect(result.state.daysByTrip[trip.id]).toBe(variantThree)
    expect(itemIds(result.state, trip.id)).toEqual(variantThree.flatMap((day) => day.items.map((item) => item.id)))
  })

  it('does not reflow a whole-draft save that changes nothing', () => {
    const created = tripService.create(baseState(), validDraft(), 'usr_fixture')
    const trip = createdTrip(created.state)
    const before = daysOf(created.state, trip.id)

    const result = tripService.update(created.state, trip.id, wholeDraft(trip))

    expect(result.trip).not.toBeNull()
    expect(result.state.daysByTrip[trip.id]).toBe(before)
  })

  it('does not reflow when only the interests, travellers, notes or origin change', () => {
    const created = tripService.create(baseState(), validDraft(), 'usr_fixture')
    const trip = createdTrip(created.state)
    const before = daysOf(created.state, trip.id)

    const result = tripService.update(
      created.state,
      trip.id,
      wholeDraft(trip, { interests: ['outdoors'], travelers: 4, notes: 'Late check-in', origin: 'Abuja, Nigeria' }),
    )

    expect(result.trip?.interests).toEqual(['outdoors'])
    expect(result.state.daysByTrip[trip.id]).toBe(before)
  })

  it('keeps the chosen draft when a whole-draft save changes the currency', () => {
    const created = tripService.create(baseState(), validDraft(), 'usr_fixture')
    const trip = createdTrip(created.state)
    const before = daysOf(created.state, trip.id)

    const result = tripService.update(created.state, trip.id, wholeDraft(trip, { currency: 'GBP' }))

    expect(result.trip?.currency).toBe('GBP')
    expect(result.state.daysByTrip[trip.id]).toBe(before)
  })

  it('still reflows a whole-draft save that moves the end date', () => {
    const created = tripService.create(baseState(), validDraft(), 'usr_fixture')
    const trip = createdTrip(created.state)

    const result = tripService.update(created.state, trip.id, wholeDraft(trip, { endDate: addDays(END, 2) }))

    expect(daysOf(result.state, trip.id).map((day) => day.date)).toEqual(eachDay(START, addDays(END, 2)))
  })

  it('still reflows a whole-draft save that changes the pace', () => {
    const created = tripService.create(baseState(), validDraft(), 'usr_fixture')
    const trip = createdTrip(created.state)

    const result = tripService.update(created.state, trip.id, wholeDraft(trip, { pace: 'packed' }))

    expect(itemIds(result.state, trip.id)).not.toEqual(itemIds(created.state, trip.id))
  })

  it('still reflows a whole-draft save that changes the destination', () => {
    const created = tripService.create(baseState(), validDraft(), 'usr_fixture')
    const trip = createdTrip(created.state)

    const result = tripService.update(
      created.state,
      trip.id,
      wholeDraft(trip, { destination: 'Lisbon, Portugal' }),
    )

    expect(allItems(result.state, trip.id).map((item) => item.title)).toContain('Arrive and settle in')
  })
})

/**
 * Day ids are positional, so the merge used to pair "day 1" with "day 1" and
 * could pair one stored day twice. After an ordinary date edit a booked dinner
 * showed up twice, or on the wrong date.
 */
describe('tripService.update keeps each stop on its calendar date', () => {
  const FIRST = '2026-04-10'

  function bookedId(date: string): string {
    return `itm_booked_${date}`
  }

  /** A three-day trip, 10 to 12 April, with a dinner the traveller booked each night. */
  function plannedTrip(): { state: PersistedState; tripId: string } {
    const created = tripService.create(
      baseState(),
      validDraft({ startDate: FIRST, endDate: addDays(FIRST, 2) }),
      'usr_fixture',
    )
    const tripId = created.trip?.id ?? ''
    const days = daysOf(created.state, tripId).map((day) => ({
      ...day,
      items: [
        ...day.items,
        syntheticItem({ id: bookedId(day.date), tripId, source: 'user', startTime: '19:30' }),
      ],
    }))
    return { tripId, state: { ...created.state, daysByTrip: { ...created.state.daysByTrip, [tripId]: days } } }
  }

  function placements(state: PersistedState, tripId: string, itemId: string): string[] {
    return daysOf(state, tripId).flatMap((day) =>
      day.items.filter((item) => item.id === itemId).map(() => day.date),
    )
  }

  it('neither duplicates nor re-dates a stop when the trip starts two days earlier', () => {
    const { state, tripId } = plannedTrip()

    const result = tripService.update(state, tripId, { startDate: addDays(FIRST, -2) })

    expect(daysOf(result.state, tripId).map((day) => day.date)).toEqual(eachDay(addDays(FIRST, -2), addDays(FIRST, 2)))
    expect(placements(result.state, tripId, bookedId('2026-04-10'))).toEqual(['2026-04-10'])
    expect(placements(result.state, tripId, bookedId('2026-04-11'))).toEqual(['2026-04-11'])
    expect(placements(result.state, tripId, bookedId('2026-04-12'))).toEqual(['2026-04-12'])
  })

  it('keeps every stop on its date when the trip starts earlier and ends later', () => {
    const { state, tripId } = plannedTrip()

    const result = tripService.update(state, tripId, {
      startDate: addDays(FIRST, -2),
      endDate: addDays(FIRST, 4),
    })

    for (const date of eachDay(FIRST, addDays(FIRST, 2))) {
      expect(placements(result.state, tripId, bookedId(date)), date).toEqual([date])
    }
  })

  it('keeps a stop on its calendar date when the whole trip shifts a day later', () => {
    const { state, tripId } = plannedTrip()

    const result = tripService.update(state, tripId, {
      startDate: addDays(FIRST, 1),
      endDate: addDays(FIRST, 3),
    })

    expect(placements(result.state, tripId, bookedId('2026-04-11'))).toEqual(['2026-04-11'])
    expect(placements(result.state, tripId, bookedId('2026-04-12'))).toEqual(['2026-04-12'])
    // 10 April left the trip, so its dinner moves to the nearest day that is left.
    expect(placements(result.state, tripId, bookedId('2026-04-10'))).toEqual(['2026-04-11'])
  })

  it('keeps an AI stop the traveller moved to another day through a reflow', () => {
    const { state, tripId } = plannedTrip()
    const days = daysOf(state, tripId)
    const moving = days[0]?.items.find((item) => item.source === 'ai')
    const target = days[1]
    if (!moving || !target) throw new Error('fixture trip has no AI stop to move')
    const moved: PersistedState = {
      ...state,
      daysByTrip: {
        ...state.daysByTrip,
        [tripId]: moveItemInDays(days, moving.id, target.id, undefined, FIXED_ISO),
      },
    }

    const result = tripService.update(moved, tripId, { pace: 'packed' })

    expect(placements(result.state, tripId, moving.id)).toEqual([target.date])
  })
})

/**
 * `update` used to forward any patch straight through without validating it. An
 * `endDate` before the `startDate` left `eachDay` with nothing to return, so the
 * trip silently lost every day it had.
 */
describe('tripService.update rejects a patch the domain validator refuses', () => {
  function created() {
    return tripService.create(baseState(), validDraft(), 'usr_fixture')
  }

  it('refuses an end date before the start date and keeps the days', () => {
    const before = created()
    const tripId = before.trip?.id ?? ''

    const result = tripService.update(before.state, tripId, { endDate: '2026-03-20' })

    expect(result.trip).toBeNull()
    expect(result.state).toBe(before.state)
    expect(daysOf(before.state, tripId)).toHaveLength(5)
  })

  it('refuses a trip longer than the documented day cap', () => {
    const before = created()

    const result = tripService.update(before.state, before.trip?.id ?? '', {
      endDate: addDays(START, TRIP_LIMITS.maxDays),
    })

    expect(result.trip).toBeNull()
    expect(result.state).toBe(before.state)
  })

  it('refuses a budget of zero', () => {
    const before = created()

    const result = tripService.update(before.state, before.trip?.id ?? '', { budget: 0 })

    expect(result.trip).toBeNull()
    expect(result.state).toBe(before.state)
  })

  it('refuses emptying the interests', () => {
    const before = created()

    const result = tripService.update(before.state, before.trip?.id ?? '', { interests: [] })

    expect(result.trip).toBeNull()
    expect(result.state).toBe(before.state)
  })

  it('refuses a destination shorter than the documented minimum', () => {
    const before = created()

    const result = tripService.update(before.state, before.trip?.id ?? '', { destination: 'P' })

    expect(result.trip).toBeNull()
    expect(result.state).toBe(before.state)
  })

  it('refuses an unsupported currency', () => {
    const before = created()

    const result = tripService.update(before.state, before.trip?.id ?? '', {
      currency: 'CHF' as TripDraft['currency'],
    })

    expect(result.trip).toBeNull()
    expect(result.state).toBe(before.state)
  })

  it('refuses a start date that is not a real calendar date', () => {
    const before = created()

    const result = tripService.update(before.state, before.trip?.id ?? '', { startDate: '2026-02-30' })

    expect(result.trip).toBeNull()
    expect(result.state).toBe(before.state)
  })

  it('refuses a name longer than the documented limit', () => {
    const before = created()

    const result = tripService.update(before.state, before.trip?.id ?? '', {
      name: 'P'.repeat(TRIP_LIMITS.maxNameLength + 1),
    })

    expect(result.trip).toBeNull()
    expect(result.state).toBe(before.state)
  })

  it('still accepts a name cleared to blank, which it re-derives', () => {
    const before = created()

    const result = tripService.update(before.state, before.trip?.id ?? '', { name: '   ' })

    expect(result.trip?.name).toBe(suggestTripName('Paris, France', START))
  })
})

/**
 * A trip that has begun must stay editable. Its own start date is in the past for
 * the rest of the trip, and refusing it froze the budget, the notes, the
 * interests, the pace and the name for good.
 */
describe('tripService.update and a trip that has already started', () => {
  const STARTED = '2026-03-01'

  function inProgress(): { state: PersistedState; tripId: string } {
    const created = tripService.create(baseState(), validDraft(), 'usr_fixture')
    const tripId = created.trip?.id ?? ''
    // Backdate the stored trip directly: creation rightly refuses a past start.
    return {
      tripId,
      state: {
        ...created.state,
        trips: created.state.trips.map((trip) =>
          trip.id === tripId ? { ...trip, startDate: STARTED, endDate: '2026-03-20' } : trip,
        ),
      },
    }
  }

  it('accepts a budget edit while the start date stays where it is', () => {
    const { state, tripId } = inProgress()

    const result = tripService.update(state, tripId, { budget: 4000 })

    expect(result.trip?.budget).toBe(4000)
    expect(result.trip?.startDate).toBe(STARTED)
  })

  it('accepts notes, a name, interests and a pace edit too', () => {
    const { state, tripId } = inProgress()

    const result = tripService.update(state, tripId, {
      name: 'Paris, extended',
      notes: 'Booked one more night',
      interests: ['food'],
      pace: 'relaxed',
    })

    expect(result.trip?.name).toBe('Paris, extended')
    expect(result.trip?.notes).toBe('Booked one more night')
    expect(result.trip?.pace).toBe('relaxed')
  })

  it('accepts a start date resubmitted unchanged alongside another edit', () => {
    const { state, tripId } = inProgress()

    const result = tripService.update(state, tripId, { startDate: STARTED, budget: 3000 })

    expect(result.trip?.budget).toBe(3000)
  })

  it('still refuses moving the start date to a different past day', () => {
    const { state, tripId } = inProgress()

    const result = tripService.update(state, tripId, { startDate: '2026-02-01' })

    expect(result.trip).toBeNull()
    expect(result.state).toBe(state)
  })
})

/**
 * Shortening the range used to delete the dropped days whole, taking the
 * traveller's own stops with them. The edit dialog promises the opposite.
 */
describe('tripService.update when the trip is shortened', () => {
  function seededWeek(): { state: PersistedState; tripId: string } {
    const created = tripService.create(
      baseState(),
      validDraft({ startDate: START, endDate: addDays(START, 6) }),
      'usr_fixture',
    )
    const tripId = created.trip?.id ?? ''
    const days = daysOf(created.state, tripId)
    expect(days).toHaveLength(7)
    const last = days[6]
    if (!last) throw new Error('fixture trip has no seventh day')
    return {
      tripId,
      state: {
        ...created.state,
        daysByTrip: {
          ...created.state.daysByTrip,
          [tripId]: [...days.slice(0, 6), { ...last, items: [...last.items, ...preservedFixtures()] }],
        },
      },
    }
  }

  it('keeps the traveller-owned stops from the days it drops', () => {
    const { state, tripId } = seededWeek()

    const result = tripService.update(state, tripId, { endDate: addDays(START, 2) })
    const ids = allItems(result.state, tripId).map((item) => item.id)

    expect(daysOf(result.state, tripId)).toHaveLength(3)
    expect(ids.filter((id) => id === 'itm_user_added')).toHaveLength(1)
    expect(ids.filter((id) => id === 'itm_catalog_added')).toHaveLength(1)
    expect(ids.filter((id) => id === 'itm_ai_edited')).toHaveLength(1)
  })

  it('still drops the unedited AI stops from those days', () => {
    const { state, tripId } = seededWeek()

    const result = tripService.update(state, tripId, { endDate: addDays(START, 2) })

    expect(allItems(result.state, tripId).map((item) => item.id)).not.toContain('itm_ai_plain')
  })

  it('carries them onto the last surviving day', () => {
    const { state, tripId } = seededWeek()

    const result = tripService.update(state, tripId, { endDate: addDays(START, 2) })
    const lastDay = daysOf(result.state, tripId)[2]

    expect(lastDay?.items.map((item) => item.id)).toContain('itm_user_added')
  })

  it('keeps the carried stop payload untouched', () => {
    const { state, tripId } = seededWeek()
    const original = allItems(state, tripId).find((item) => item.id === 'itm_catalog_added')

    const result = tripService.update(state, tripId, { endDate: addDays(START, 2) })

    expect(allItems(result.state, tripId).find((item) => item.id === 'itm_catalog_added')).toEqual(
      original,
    )
  })

  it('leaves the receiving day in chronological order', () => {
    const { state, tripId } = seededWeek()

    const result = tripService.update(state, tripId, { endDate: addDays(START, 2) })
    const times = daysOf(result.state, tripId)[2]?.items.map((item) => item.startTime) ?? []

    expect(times).toEqual([...times].sort())
  })

  it('keeps them when the start date moves forward instead', () => {
    const { state, tripId } = seededWeek()
    const withFirstDayStops: PersistedState = {
      ...state,
      daysByTrip: {
        ...state.daysByTrip,
        [tripId]: daysOf(state, tripId).map((day, index) =>
          index === 0
            ? { ...day, items: [...day.items, syntheticItem({ id: 'itm_day_one', source: 'user' })] }
            : day,
        ),
      },
    }

    const result = tripService.update(withFirstDayStops, tripId, { startDate: addDays(START, 3) })

    expect(daysOf(result.state, tripId)).toHaveLength(4)
    expect(allItems(result.state, tripId).map((item) => item.id)).toContain('itm_day_one')
  })
})

describe('tripService.remove', () => {
  it('removes the trip and its days', () => {
    const created = tripService.create(baseState(), validDraft(), 'usr_fixture')
    const tripId = created.trip?.id ?? ''

    const result = tripService.remove(created.state, tripId)

    expect(result.trips).toEqual([])
    expect(result.daysByTrip[tripId]).toBeUndefined()
  })

  it('removes the expense bucket and the generation record too', () => {
    const created = tripService.create(baseState(), validDraft(), 'usr_fixture')
    const tripId = created.trip?.id ?? ''

    const result = tripService.remove(created.state, tripId)

    expect(result.expensesByTrip[tripId]).toBeUndefined()
    expect(result.generation[tripId]).toBeUndefined()
  })

  it('leaves the other trips untouched', () => {
    const first = tripService.create(baseState(), validDraft(), 'usr_fixture')
    const second = tripService.create(first.state, validDraft({ name: 'Second trip' }), 'usr_fixture')
    const keepId = second.trip?.id ?? ''

    const result = tripService.remove(second.state, createdTrip(first.state).id)

    expect(result.trips.map((trip) => trip.id)).toEqual([keepId])
    expect(daysOf(result, keepId)).toEqual(daysOf(second.state, keepId))
  })

  it('does not mutate the state it was given', () => {
    const created = tripService.create(baseState(), validDraft(), 'usr_fixture')
    const tripId = created.trip?.id ?? ''

    tripService.remove(created.state, tripId)

    expect(created.state.trips).toHaveLength(1)
    expect(created.state.daysByTrip[tripId]).toBeDefined()
  })

  it('is a safe no-op for an unknown id', () => {
    const created = tripService.create(baseState(), validDraft(), 'usr_fixture')

    const result = tripService.remove(created.state, 'trip_does_not_exist')

    expect(result.trips).toHaveLength(1)
    expect(result.version).toBe(STORAGE_VERSION)
  })

  it('removes the notes bucket too', () => {
    const created = tripService.create(baseState(), validDraft(), 'usr_fixture')
    const tripId = created.trip?.id ?? ''
    const withNote: PersistedState = {
      ...created.state,
      notesByTrip: {
        ...created.state.notesByTrip,
        [tripId]: [
          {
            id: 'not_fixture',
            tripId,
            title: 'Flight reference',
            body: 'PC 1044',
            pinned: false,
            createdAt: FIXED_ISO,
            updatedAt: FIXED_ISO,
          },
        ],
      },
    }

    const result = tripService.remove(withNote, tripId)

    expect(result.notesByTrip?.[tripId]).toBeUndefined()
  })

  it('leaves another trip notes bucket alone', () => {
    const first = tripService.create(baseState(), validDraft(), 'usr_fixture')
    const second = tripService.create(first.state, validDraft({ name: 'Second trip' }), 'usr_fixture')
    const keepId = second.trip?.id ?? ''

    const result = tripService.remove(second.state, createdTrip(first.state).id)

    expect(result.notesByTrip?.[keepId]).toEqual([])
  })

  /**
   * `hasDemoData` is documented as "true when the seeded demo trip is present",
   * so deleting that trip has to clear it. It used to stay set, leaving the
   * snapshot claiming demo data that no longer existed.
   */
  it('clears hasDemoData when the demo trip itself is deleted', () => {
    const demo = createDemoState(createGuestUser())
    expect(demo.hasDemoData).toBe(true)

    expect(tripService.remove(demo, DEMO_TRIP_ID).hasDemoData).toBe(false)
  })

  it('leaves hasDemoData alone when a different trip is deleted', () => {
    const demo = createDemoState(createGuestUser())
    const withOwnTrip = tripService.create(demo, validDraft({ name: 'My own trip' }), 'usr_fixture')
    const ownId = withOwnTrip.trip?.id ?? ''

    const result = tripService.remove(withOwnTrip.state, ownId)

    expect(result.hasDemoData).toBe(true)
    expect(result.trips.map((trip) => trip.id)).toEqual([DEMO_TRIP_ID])
  })
})
