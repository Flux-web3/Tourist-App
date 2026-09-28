import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { addDays, eachDay } from '@/domain/format'
import type { ItineraryItem, Trip, TripDraft } from '@/domain/types'
import { createEmptyDraft, suggestTripName, TRIP_LIMITS, validateTripDraft } from '@/domain/validation'
import { STORAGE_VERSION, type PersistedState } from '@/services/contracts'
import { createEmptyState, createGuestUser } from '@/services/persistence'
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
      shouldFail: false,
      startedAt: null,
      completedAt: null,
    })
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
})
