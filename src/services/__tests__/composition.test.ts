import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ItineraryDay, Trip, TripDraft } from '@/domain/types'
import { eachDay } from '@/domain/format'
import type {
  AnalyticsService,
  ExpenseService,
  ItineraryService,
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
      'persistence',
      'places',
      'trips',
    ])
  })

  it('satisfies the trip service contract', () => {
    const services = createServices()
    const trips: TripService = services.trips

    expect(typeof trips.create).toBe('function')
    expect(typeof trips.update).toBe('function')
    expect(typeof trips.remove).toBe('function')
  })

  it('satisfies the itinerary service contract', () => {
    const services = createServices()
    const itinerary: ItineraryService = services.itinerary

    expect(typeof itinerary.generate).toBe('function')
    expect(typeof itinerary.suggestAlternative).toBe('function')
  })

  it('satisfies the place service contract', () => {
    const services = createServices()
    const places: PlaceService = services.places

    expect(typeof places.search).toBe('function')
    expect(typeof places.getById).toBe('function')
  })

  it('satisfies the expense service contract', () => {
    const services = createServices()
    const expenses: ExpenseService = services.expenses

    expect(typeof expenses.add).toBe('function')
    expect(typeof expenses.update).toBe('function')
    expect(typeof expenses.remove).toBe('function')
  })

  it('satisfies the persistence service contract', () => {
    const services = createServices()
    const persistence: PersistenceService = services.persistence

    expect(typeof persistence.load).toBe('function')
    expect(typeof persistence.save).toBe('function')
    expect(typeof persistence.clear).toBe('function')
  })

  it('satisfies the analytics service contract', () => {
    const services = createServices()
    const analytics: AnalyticsService = services.analytics

    expect(typeof analytics.track).toBe('function')
    expect(typeof analytics.events).toBe('function')
    expect(typeof analytics.clear).toBe('function')
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
