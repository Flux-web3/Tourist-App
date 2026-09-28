import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ItineraryDay, Trip, TripDraft } from '@/domain/types'
import { eachDay } from '@/domain/format'
import type {
  AnalyticsService,
  ExpenseService,
  ItineraryService,
  NoteService,
  PersistenceService,
  PlaceService,
  TripService,
} from '@/services/contracts'
import { createDemoState, createEmptyState, createGuestUser } from '@/services/persistence'
import { buildItinerary } from '@/services/itineraryGenerator'
import { expenseService } from '@/services/expenseService'
import { itineraryService } from '@/services/itineraryService'
import { placeService } from '@/services/placeService'
import { tripService } from '@/services/tripService'
import { createServices, services as sharedServices, type Services } from '@/services/index'

const FIXED_NOW = new Date('2026-03-15T09:30:00.000Z')
const START = '2026-04-01'
const END = '2026-04-05'
const GENERATION_WAIT_MS = 5000

function draft(overrides: Partial<TripDraft> = {}): TripDraft {
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
    notes: '',
    ...overrides,
  }
}

function project(days: readonly ItineraryDay[]): unknown[] {
  return days.map((day) => ({
    date: day.date,
    index: day.index,
    items: day.items.map((item) => ({
      title: item.title,
      category: item.category,
      startTime: item.startTime,
      location: item.location,
      estimatedCost: item.estimatedCost,
      source: item.source,
    })),
  }))
}

function firstTrip(services: Services): Trip {
  const trip = services.trips.create(createEmptyState(createGuestUser()), draft(), 'usr_fixture').trip
  if (trip === null) throw new Error('composed root failed to create a trip')
  return trip
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(FIXED_NOW)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('the composition root shape', () => {
  it('exposes every service slot', () => {
    const services = createServices()

    expect(Object.keys(services).sort()).toEqual([
      'analytics',
      'expenses',
      'itinerary',
      'notes',
      'persistence',
      'places',
      'trips',
    ])
  })

  /**
   * These used to be seven `expect(typeof service.method).toBe('function')`
   * blocks, which asserted nothing: the `const x: SomeService = services.x`
   * annotation on the line above already proves the shape at compile time, and a
   * slot wired to a broken implementation would have passed every one of them.
   * Each slot now takes one real call through the contract-typed handle and the
   * observable effect is checked instead.
   */
  it('reaches a working trip service through the contract', () => {
    const trips: TripService = createServices().trips
    const base = createEmptyState(createGuestUser())

    const created = trips.create(base, draft(), 'usr_fixture')
    expect(created.trip).not.toBeNull()
    const tripId = created.trip?.id ?? ''

    const updated = trips.update(created.state, tripId, { travelers: 5 })
    expect(updated.trip?.travelers).toBe(5)

    expect(trips.remove(updated.state, tripId).trips).toEqual([])
  })

  it('reaches a working itinerary service through the contract', async () => {
    const itinerary: ItineraryService = createServices().itinerary
    const trip = firstTrip(createServices())

    const pending = itinerary.generate(trip)
    await vi.advanceTimersByTimeAsync(GENERATION_WAIT_MS)
    const days = await pending
    expect(days.map((day) => day.date)).toEqual(eachDay(START, END))

    const day = days[0]
    const item = day?.items[0]
    if (!day || !item) throw new Error('the generated plan has no first item')
    const alternativePending = itinerary.suggestAlternative({ trip, day, item })
    await vi.advanceTimersByTimeAsync(GENERATION_WAIT_MS)
    const alternative = await alternativePending
    expect(alternative.title).not.toBe(item.title)
  })

  it('reaches a working place service through the contract', async () => {
    const places: PlaceService = createServices().places

    const found = await places.search({ text: '', category: 'all' })
    expect(found.length).toBeGreaterThan(0)

    const first = found[0]
    if (!first) throw new Error('the catalogue is empty')
    expect((await places.getById(first.id))?.id).toBe(first.id)
    expect(await places.getById('exp_does_not_exist')).toBeNull()
  })

  it('reaches a working expense service through the contract', () => {
    const services = createServices()
    const expenses: ExpenseService = services.expenses
    const trip = firstTrip(services)
    const base = createEmptyState(createGuestUser())

    const added = expenses.add(base, {
      tripId: trip.id,
      description: 'Metro pass',
      amount: 25.5,
      currency: 'EUR',
      category: 'transport',
      date: START,
      notes: '',
    })
    expect(added.state.expensesByTrip[trip.id]).toHaveLength(1)

    const patched = expenses.update(added.state, added.expense.id, { amount: 30 })
    expect(patched.expensesByTrip[trip.id]?.[0]?.amount).toBe(30)

    expect(expenses.remove(patched, trip.id, added.expense.id).expensesByTrip[trip.id]).toEqual([])
  })

  it('reaches a working note service through the contract', () => {
    const services = createServices()
    const notes: NoteService = services.notes
    const trip = firstTrip(services)
    const base = createEmptyState(createGuestUser())

    const added = notes.add(base, { tripId: trip.id, title: 'Flight', body: 'PC 1044' })
    const noteId = added.note?.id ?? ''
    expect(noteId).not.toBe('')

    expect(notes.update(added.state, trip.id, noteId, { body: 'PC 1045' }).note?.body).toBe('PC 1045')
    expect(
      notes.setPinned(added.state, trip.id, noteId, true).notesByTrip?.[trip.id]?.[0]?.pinned,
    ).toBe(true)
    expect(notes.remove(added.state, trip.id, noteId).notesByTrip?.[trip.id]).toEqual([])
  })

  it('reaches a working persistence service through the contract', () => {
    const persistence: PersistenceService = createServices().persistence
    const state = createEmptyState(createGuestUser())

    persistence.clear()
    expect(persistence.load()).toBeNull()

    persistence.save(state)
    expect(persistence.load()?.user.id).toBe(state.user.id)

    persistence.clear()
    expect(persistence.load()).toBeNull()
  })

  it('reaches a working analytics service through the contract', () => {
    const analytics: AnalyticsService = createServices().analytics

    expect(analytics.events()).toEqual([])
    analytics.track('trip_saved', { tripId: 'trip_fixture' })
    expect(analytics.events().map((entry) => entry.event)).toEqual(['trip_saved'])

    analytics.clear()
    expect(analytics.events()).toEqual([])
  })

  it('hands back a fresh persistence and analytics service on every call', () => {
    const first = createServices()
    const second = createServices()

    expect(first.persistence).not.toBe(second.persistence)
    expect(first.analytics).not.toBe(second.analytics)
  })

  it('exposes a module level singleton of the same shape', () => {
    const services: Services = sharedServices

    expect(Object.keys(services).sort()).toEqual([
      'analytics',
      'expenses',
      'itinerary',
      'notes',
      'persistence',
      'places',
      'trips',
    ])
  })
})

describe('the composition root wiring', () => {
  it('wires the singleton services the unit tests exercise', () => {
    const services = createServices()

    expect(services.trips).toBe(tripService)
    expect(services.itinerary).toBe(itineraryService)
    expect(services.places).toBe(placeService)
    expect(services.expenses).toBe(expenseService)
  })

  it('routes itinerary generation through the same generator as buildItinerary', async () => {
    const services = createServices()
    const trip = firstTrip(services)

    const pending = services.itinerary.generate(trip)
    await vi.advanceTimersByTimeAsync(GENERATION_WAIT_MS)
    const composed = await pending

    expect(project(composed)).toEqual(project(buildItinerary(trip, 0)))
  })

  it('keeps generation deterministic through the composed root', async () => {
    const services = createServices()
    const trip = firstTrip(services)

    const first = services.itinerary.generate(trip)
    await vi.advanceTimersByTimeAsync(GENERATION_WAIT_MS)
    const second = services.itinerary.generate(trip)
    await vi.advanceTimersByTimeAsync(GENERATION_WAIT_MS)

    expect(project(await second)).toEqual(project(await first))
  })

  it('propagates the failure path through the composed root', async () => {
    const services = createServices()
    const trip = firstTrip(services)

    const pending = services.itinerary.generate(trip, { shouldFail: true })
    void pending.catch(() => undefined)
    await vi.advanceTimersByTimeAsync(GENERATION_WAIT_MS)

    await expect(pending).rejects.toThrow()
  })
})

describe('the composed end to end flow', () => {
  it('creates, generates, files an expense, tracks and reloads', async () => {
    const services = createServices()
    const user = createGuestUser()

    const created = services.trips.create(createEmptyState(user), draft(), user.id)
    const trip = created.trip
    if (trip === null) throw new Error('composed root failed to create a trip')

    const pending = services.itinerary.generate(trip)
    await vi.advanceTimersByTimeAsync(GENERATION_WAIT_MS)
    const days = await pending

    expect(days).toHaveLength(5)
    expect(days.map((day) => day.date)).toEqual(eachDay(START, END))

    const withExpense = services.expenses.add(
      {
        ...created.state,
        daysByTrip: { ...created.state.daysByTrip, [trip.id]: days },
      },
      {
        tripId: trip.id,
        description: 'Louvre tickets',
        amount: 44,
        currency: trip.currency,
        category: 'activities',
        date: START,
        notes: '',
      },
    )

    services.analytics.track('trip_created', { tripId: trip.id })
    services.analytics.track('itinerary_generation_succeeded', { dayCount: days.length })

    const persisted: Services['persistence'] = services.persistence
    persisted.save(withExpense.state)

    const reloaded = persisted.load()

    expect(reloaded?.trips).toHaveLength(1)
    expect(reloaded?.trips[0]?.id).toBe(trip.id)
    expect(reloaded?.daysByTrip[trip.id]?.map((day) => day.index)).toEqual([1, 2, 3, 4, 5])
    expect(reloaded?.expensesByTrip[trip.id]?.[0]?.amount).toBe(44)
    expect(reloaded?.user.id).toBe(user.id)
    expect(services.analytics.events().map((entry) => entry.event)).toEqual([
      'trip_created',
      'itinerary_generation_succeeded',
    ])
  })

  it('rehydrates the seeded demo state through the composed root', () => {
    const services = createServices()

    services.persistence.save(createDemoState())
    const reloaded = services.persistence.load()

    expect(reloaded?.hasDemoData).toBe(true)
    expect(reloaded?.trips).toHaveLength(1)
    expect(reloaded?.trips[0]?.destination).toBe('Paris, France')
  })

  it('clears storage through the composed root', () => {
    const services = createServices()
    services.persistence.save(createDemoState())

    services.persistence.clear()

    expect(services.persistence.load()).toBeNull()
  })

  it('survives a reload of the demo state through a second service instance', () => {
    const first = createServices()
    first.persistence.save(createDemoState())
    const second = createServices()

    const reloaded = second.persistence.load()

    expect(reloaded?.trips[0]?.origin).toBe('Lagos, Nigeria')
    expect(Object.keys(reloaded?.daysByTrip ?? {})).toHaveLength(1)
  })

  it('searches the catalogue through the composed root', async () => {
    const services = createServices()

    const results = await services.places.search({
      text: 'Eiffel',
      category: 'all',
      maxPrice: null,
    })

    expect(results.map((experience) => experience.id)).toEqual(['exp_eiffel_tower'])
  })
})
