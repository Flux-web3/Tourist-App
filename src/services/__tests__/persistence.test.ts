import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { addDays, eachDay, todayISO } from '@/domain/format'
import { STORAGE_VERSION, type PersistedState } from '@/services/contracts'
import {
  STORAGE_KEY,
  createDemoState,
  createEmptyState,
  createGuestUser,
  createPersistenceService,
} from '@/services/persistence'

const FIXED_NOW = new Date('2026-03-15T09:30:00.000Z')
const FIXED_ISO = '2026-03-15T09:30:00.000Z'
const FIXED_TODAY = '2026-03-15'

const service = createPersistenceService()

function writeRaw(raw: string): void {
  window.localStorage.setItem(STORAGE_KEY, raw)
}

function withoutKey(state: PersistedState, key: string): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...state }
  delete copy[key]
  return copy
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(FIXED_NOW)
  service.clear()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('storage contract', () => {
  it('pins the storage version to 1', () => {
    expect(STORAGE_VERSION).toBe(1)
  })

  it('uses exactly the versioned storage key', () => {
    expect(STORAGE_KEY).toBe('tourist.state.v1')
  })

  it('writes the payload under that key with the current version', () => {
    const state = createEmptyState()
    service.save(state)

    const raw = window.localStorage.getItem(STORAGE_KEY)
    expect(raw).not.toBeNull()
    const parsed: unknown = JSON.parse(raw ?? 'null')
    expect((parsed as PersistedState).version).toBe(STORAGE_VERSION)
  })

  it('reports load as empty for a key that was never written', () => {
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
    expect(() => service.load()).not.toThrow()
    expect(service.load()).toBeNull()
  })
})

describe('round trip', () => {
  it('round-trips trips, days, expenses, user, generation and theme preference', () => {
    const tripId = 'trip_round_trip'
    const state: PersistedState = {
      version: STORAGE_VERSION,
      user: createGuestUser({ name: 'Round Trip' }),
      trips: [
        {
          id: tripId,
          userId: 'usr_fixture',
          name: 'Round trip trip',
          origin: 'Lagos, Nigeria',
          destination: 'Paris, France',
          startDate: '2026-04-01',
          endDate: '2026-04-03',
          travelers: 3,
          budget: 1800,
          currency: 'EUR',
          interests: ['culture', 'shopping'],
          pace: 'packed',
          notes: 'Notes survive the round trip',
          status: 'itinerary_ready',
          createdAt: FIXED_ISO,
          updatedAt: FIXED_ISO,
        },
      ],
      daysByTrip: {
        [tripId]: [
          {
            id: `${tripId}_d1`,
            tripId,
            date: '2026-04-01',
            index: 1,
            title: null,
            items: [
              {
                id: 'itm_round_trip',
                tripId,
                title: 'Round trip item',
                category: 'culture',
                startTime: '09:00',
                endTime: '11:00',
                location: 'Le Marais',
                description: 'Described',
                estimatedCost: 12.5,
                source: 'user',
                editedByUser: true,
                experienceId: 'exp_marais_walk',
                notes: 'Item notes',
                createdAt: FIXED_ISO,
                updatedAt: FIXED_ISO,
              },
            ],
          },
        ],
      },
      expensesByTrip: {
        [tripId]: [
          {
            id: 'exp_round_trip',
            tripId,
            description: 'Round trip expense',
            amount: 19.99,
            currency: 'EUR',
            category: 'food',
            date: '2026-03-20',
            notes: '',
            createdAt: FIXED_ISO,
            updatedAt: FIXED_ISO,
          },
        ],
      },
      generation: {
        [tripId]: {
          status: 'success',
          error: null,
          shouldFail: false,
          startedAt: FIXED_ISO,
          completedAt: FIXED_ISO,
        },
      },
      notesByTrip: {
        [tripId]: [
          {
            id: 'note_round_trip',
            tripId,
            title: 'Flight reference',
            body: 'FR 1420\nDeparts 07:40',
            pinned: true,
            createdAt: FIXED_ISO,
            updatedAt: FIXED_ISO,
          },
        ],
      },
      themePreference: 'dark',
      hasDemoData: true,
    }

    service.save(state)
    const loaded = service.load()

    expect(loaded).toEqual(state)
    expect(loaded?.themePreference).toBe('dark')
    expect(loaded?.user.name).toBe('Round Trip')
    expect(loaded?.trips[0]?.travelers).toBe(3)
    expect(loaded?.daysByTrip[tripId]?.[0]?.items[0]?.estimatedCost).toBe(12.5)
    expect(loaded?.expensesByTrip[tripId]?.[0]?.amount).toBe(19.99)
    expect(loaded?.generation[tripId]?.status).toBe('success')
    expect(loaded?.notesByTrip?.[tripId]?.[0]?.pinned).toBe(true)
    expect(loaded?.notesByTrip?.[tripId]?.[0]?.body).toBe('FR 1420\nDeparts 07:40')
    expect(loaded?.hasDemoData).toBe(true)
  })

  it('round-trips the empty state', () => {
    const state = createEmptyState()
    service.save(state)
    expect(service.load()).toEqual(state)
  })

  it('round-trips a trip that has no days and no expenses', () => {
    const state: PersistedState = {
      ...createEmptyState(),
      daysByTrip: { trip_without_days: [] },
      expensesByTrip: { trip_without_days: [] },
    }

    service.save(state)
    const loaded = service.load()

    expect(loaded?.daysByTrip.trip_without_days).toEqual([])
    expect(loaded?.expensesByTrip.trip_without_days).toEqual([])
    expect(loaded?.trips).toEqual([])
  })
})

describe('rejection of unusable payloads', () => {
  it('returns empty for malformed JSON', () => {
    writeRaw('{ this is not json')
    expect(() => service.load()).not.toThrow()
    expect(service.load()).toBeNull()
  })

  it('returns empty for a JSON primitive', () => {
    writeRaw('42')
    expect(service.load()).toBeNull()
  })

  it('returns empty for a JSON array', () => {
    writeRaw('[]')
    expect(service.load()).toBeNull()
  })

  it('rejects a payload carrying the wrong version', () => {
    writeRaw(JSON.stringify({ ...createEmptyState(), version: 2 }))
    expect(service.load()).toBeNull()
  })

  it('rejects a payload whose trips value is not an array', () => {
    writeRaw(
      JSON.stringify({
        version: STORAGE_VERSION,
        user: createGuestUser(),
        trips: { nope: true },
        daysByTrip: {},
        expensesByTrip: {},
      }),
    )
    expect(service.load()).toBeNull()
  })

  it('rejects a payload whose daysByTrip is a number', () => {
    writeRaw(
      JSON.stringify({
        version: STORAGE_VERSION,
        user: createGuestUser(),
        trips: [],
        daysByTrip: 7,
        expensesByTrip: {},
      }),
    )
    expect(service.load()).toBeNull()
  })

  it('rejects a payload whose daysByTrip is null', () => {
    writeRaw(
      JSON.stringify({
        version: STORAGE_VERSION,
        user: createGuestUser(),
        trips: [],
        daysByTrip: null,
        expensesByTrip: {},
        generation: {},
        themePreference: 'system',
        hasDemoData: false,
      }),
    )

    expect(service.load()).toBeNull()
  })

  it('rejects a payload whose expensesByTrip is null', () => {
    writeRaw(JSON.stringify({ ...createEmptyState(), expensesByTrip: null }))

    expect(service.load()).toBeNull()
  })

  it('rejects a payload whose generation bucket is missing', () => {
    writeRaw(JSON.stringify(withoutKey(createEmptyState(), 'generation')))

    expect(service.load()).toBeNull()
  })

  it('rejects a payload whose theme preference is not a known value', () => {
    writeRaw(JSON.stringify({ ...createEmptyState(), themePreference: 'sepia' }))

    expect(service.load()).toBeNull()
  })

  it('rejects a payload whose hasDemoData flag is not a boolean', () => {
    writeRaw(JSON.stringify({ ...createEmptyState(), hasDemoData: 'yes' }))

    expect(service.load()).toBeNull()
  })

  it('rejects a payload with no user, because the contract requires one', () => {
    writeRaw(JSON.stringify({ ...createEmptyState(), user: null }))

    expect(service.load()).toBeNull()
  })

  it('rejects a payload whose user is missing the fields the app reads', () => {
    writeRaw(JSON.stringify({ ...createEmptyState(), user: { id: 'usr_broken', name: 'No flags' } }))

    expect(service.load()).toBeNull()
  })

  it('rejects a trip carrying an unknown status', () => {
    const state = createDemoState()
    const trip = state.trips[0]
    if (!trip) throw new Error('demo state has no trip')

    writeRaw(JSON.stringify({ ...state, trips: [{ ...trip, status: 'archived' }] }))

    expect(service.load()).toBeNull()
  })

  it('rejects a trip whose interests are not travel interests', () => {
    const state = createDemoState()
    const trip = state.trips[0]
    if (!trip) throw new Error('demo state has no trip')

    writeRaw(JSON.stringify({ ...state, trips: [{ ...trip, interests: ['skydiving'] }] }))

    expect(service.load()).toBeNull()
  })

  it('rejects a day bucket holding a value that is not an array of days', () => {
    const state = createDemoState()
    const trip = state.trips[0]
    if (!trip) throw new Error('demo state has no trip')

    writeRaw(JSON.stringify({ ...state, daysByTrip: { [trip.id]: { nope: true } } }))

    expect(service.load()).toBeNull()
  })

  it('rejects a day whose item is missing its times and source', () => {
    const state = createDemoState()
    const trip = state.trips[0]
    const days = state.daysByTrip[trip?.id ?? '']
    const first = days[0]
    const item = first?.items[0]
    if (!trip || !first || !item) throw new Error('demo state has no seeded item')
    const brokenItem: Record<string, unknown> = { ...item }
    delete brokenItem.startTime
    delete brokenItem.source

    writeRaw(
      JSON.stringify({
        ...state,
        daysByTrip: {
          ...state.daysByTrip,
          [trip.id]: [{ ...first, items: [brokenItem] }],
        },
      }),
    )

    expect(service.load()).toBeNull()
  })

  it('rejects an expense carrying an unknown category', () => {
    const state = createDemoState()
    const trip = state.trips[0]
    const expenses = state.expensesByTrip[trip?.id ?? '']
    const first = expenses[0]
    if (!trip || !first) throw new Error('demo state has no seeded expense')

    writeRaw(
      JSON.stringify({
        ...state,
        expensesByTrip: { ...state.expensesByTrip, [trip.id]: [{ ...first, category: 'gambling' }] },
      }),
    )

    expect(service.load()).toBeNull()
  })

  it('rejects a generation record whose status is not a known value', () => {
    const state = createDemoState()
    const trip = state.trips[0]
    if (!trip) throw new Error('demo state has no trip')
    const record = state.generation[trip.id]
    if (!record) throw new Error('demo state has no generation record')

    writeRaw(
      JSON.stringify({
        ...state,
        generation: { ...state.generation, [trip.id]: { ...record, status: 'pending' } },
      }),
    )

    expect(service.load()).toBeNull()
  })

  it('rejects a payload with no version at all', () => {
    writeRaw(JSON.stringify(withoutKey(createEmptyState(), 'version')))

    expect(service.load()).toBeNull()
  })
})

describe('save guards', () => {
  it('writes nothing when handed a state that is not a valid payload', () => {
    const state = createEmptyState()

    service.save({ ...state, trips: [{ id: 'trip_broken' }] } as unknown as PersistedState)

    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('leaves an earlier good payload in place when a later save is invalid', () => {
    service.save(createEmptyState())
    const good = window.localStorage.getItem(STORAGE_KEY)

    service.save({ ...createEmptyState(), themePreference: 'neon' } as unknown as PersistedState)

    expect(window.localStorage.getItem(STORAGE_KEY)).toBe(good)
    expect(service.load()?.themePreference).toBe('system')
  })

  it('still round-trips a valid state after a rejected save', () => {
    const state = createDemoState()
    service.save(state)

    expect(service.load()).toEqual(state)
  })
})

describe('clear', () => {
  it('removes the stored payload', () => {
    service.save(createDemoState())
    expect(window.localStorage.getItem(STORAGE_KEY)).not.toBeNull()

    service.clear()

    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
    expect(service.load()).toBeNull()
  })

  it('is a safe no-op when nothing is stored', () => {
    expect(() => service.clear()).not.toThrow()
    expect(service.load()).toBeNull()
  })

  it('leaves unrelated keys untouched', () => {
    window.localStorage.setItem('tourist.unrelated', 'keep me')
    service.save(createEmptyState())

    service.clear()

    expect(window.localStorage.getItem('tourist.unrelated')).toBe('keep me')
  })
})

describe('createGuestUser', () => {
  it('returns a guest with the expected shape', () => {
    const user = createGuestUser()

    expect(user.id).toMatch(/^usr_/)
    expect(user.name.length).toBeGreaterThan(0)
    expect(user.email).toBeNull()
    expect(user.isGuest).toBe(true)
    expect(user.createdAt).toBe(FIXED_ISO)
  })

  it('applies overrides', () => {
    const user = createGuestUser({ name: 'Amara', email: 'amara@example.com', isGuest: false })

    expect(user.name).toBe('Amara')
    expect(user.email).toBe('amara@example.com')
    expect(user.isGuest).toBe(false)
    expect(user.id).toMatch(/^usr_/)
  })

  it('issues a different id on every call', () => {
    const first = createGuestUser()
    const second = createGuestUser()

    expect(first.id).not.toBe(second.id)
  })
})

describe('createEmptyState', () => {
  it('starts empty at the current version', () => {
    const state = createEmptyState()

    expect(state.version).toBe(STORAGE_VERSION)
    expect(state.trips).toEqual([])
    expect(state.daysByTrip).toEqual({})
    expect(state.expensesByTrip).toEqual({})
    expect(state.generation).toEqual({})
    expect(state.themePreference).toBe('system')
    expect(state.hasDemoData).toBe(false)
  })

  it('adopts the user it is given', () => {
    const user = createGuestUser({ name: 'Chidi' })
    const state = createEmptyState(user)

    expect(state.user).toBe(user)
    expect(state.user.isGuest).toBe(true)
  })
})

describe('createDemoState', () => {
  it('contains exactly one seeded trip', () => {
    const state = createDemoState()

    expect(state.trips).toHaveLength(1)
    expect(state.hasDemoData).toBe(true)
  })

  it('seeds the trip with the documented origin, destination, party size and length', () => {
    const trip = createDemoState().trips[0]

    expect(trip?.origin).toBe('Lagos, Nigeria')
    expect(trip?.destination).toBe('Paris, France')
    expect(trip?.travelers).toBe(2)
    expect(trip?.startDate).toBe(FIXED_TODAY)
    expect(trip?.startDate).toBe(todayISO())
    expect(trip?.endDate).toBe(addDays(FIXED_TODAY, 6))
  })

  it('spans seven days inclusive of both ends', () => {
    const state = createDemoState()
    const trip = state.trips[0]
    const days = state.daysByTrip[trip?.id ?? '']

    expect(eachDay(trip?.startDate ?? '', trip?.endDate ?? '')).toHaveLength(7)
    expect(days).toHaveLength(7)
    expect(days?.map((day) => day.date)).toEqual(eachDay(trip?.startDate ?? '', trip?.endDate ?? ''))
    expect(days?.map((day) => day.index)).toEqual([1, 2, 3, 4, 5, 6, 7])
  })

  it('gives every day at least one item', () => {
    const state = createDemoState()
    const trip = state.trips[0]
    const days = state.daysByTrip[trip?.id ?? ''] ?? []

    for (const day of days) {
      expect(day.items.length).toBeGreaterThan(0)
      expect(day.tripId).toBe(trip?.id)
    }
  })

  it('seeds expenses with positive amounts', () => {
    const state = createDemoState()
    const trip = state.trips[0]
    const expenses = state.expensesByTrip[trip?.id ?? ''] ?? []

    expect(expenses.length).toBeGreaterThan(0)
    for (const expense of expenses) {
      expect(expense.amount).toBeGreaterThan(0)
      expect(expense.tripId).toBe(trip?.id)
      expect(expense.currency).toBe(trip?.currency)
    }
  })

  it('seeds a guest user', () => {
    const state = createDemoState()

    expect(state.user.isGuest).toBe(true)
    expect(state.user.id).toMatch(/^usr_/)
  })

  it('seeds an idle generation record for the trip', () => {
    const state = createDemoState()
    const generation = state.generation[state.trips[0]?.id ?? '']

    expect(generation?.status).toBe('idle')
    expect(generation?.error).toBeNull()
    expect(generation?.shouldFail).toBe(false)
  })

  it('passes the shape validator and survives a save and load cycle', () => {
    const state = createDemoState()

    service.save(state)
    const loaded = service.load()

    expect(loaded).toEqual(state)
  })

  it('adopts the user it is given', () => {
    const user = createGuestUser({ name: 'Demo Owner' })
    const state = createDemoState(user)

    expect(state.user).toBe(user)
    expect(state.trips[0]?.userId).toBe(user.id)
  })
})
