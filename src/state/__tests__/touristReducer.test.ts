import { describe, expect, it } from 'vitest'
import type {
  Expense,
  GenerationState,
  ItineraryDay,
  ItineraryItem,
  Trip,
  User,
} from '@/domain/types'
import { STORAGE_VERSION, type PersistedState } from '@/services/contracts'
import {
  createInitialTouristState,
  toPersistedState,
  touristReducer,
  type TouristAction,
  type TouristState,
} from '@/state/touristReducer'

const USER: User = {
  id: 'usr_1',
  name: 'Adaeze N.',
  email: null,
  isGuest: true,
  createdAt: '2026-01-01T00:00:00.000Z',
}

function makeTrip(overrides: Partial<Trip> = {}): Trip {
  return {
    id: 'trip_1',
    userId: USER.id,
    name: 'Spring in Paris',
    origin: 'Lagos, Nigeria',
    destination: 'Paris, France',
    startDate: '2026-04-01',
    endDate: '2026-04-02',
    travelers: 2,
    budget: 1000,
    currency: 'EUR',
    interests: ['culture', 'food'],
    pace: 'balanced',
    notes: '',
    status: 'draft',
    createdAt: '2026-01-02T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    ...overrides,
  }
}

function makeItem(
  tripId: string,
  id: string,
  overrides: Partial<ItineraryItem> = {},
): ItineraryItem {
  return {
    id,
    tripId,
    title: `Item ${id}`,
    category: 'sightseeing',
    startTime: '09:00',
    endTime: '10:00',
    location: 'Somewhere',
    description: 'A description',
    estimatedCost: 20,
    currency: 'EUR',
    source: 'ai',
    editedByUser: false,
    experienceId: null,
    notes: '',
    createdAt: '2026-01-02T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
    ...overrides,
  }
}

function makeDay(tripId: string, index: number, items: ItineraryItem[]): ItineraryDay {
  const date = `2026-04-0${index}`
  return { id: `${tripId}_d${index}`, tripId, date, index, title: null, items }
}

function makeExpense(
  tripId: string,
  id: string,
  overrides: Partial<Expense> = {},
): Expense {
  return {
    id,
    tripId,
    description: `Expense ${id}`,
    amount: 12.5,
    currency: 'EUR',
    category: 'food',
    date: '2026-04-01',
    notes: '',
    createdAt: '2026-01-03T00:00:00.000Z',
    updatedAt: '2026-01-03T00:00:00.000Z',
    ...overrides,
  }
}

function makeGeneration(overrides: Partial<GenerationState> = {}): GenerationState {
  return {
    status: 'idle',
    error: null,
    startedAt: null,
    completedAt: null,
    ...overrides,
  }
}

function makePersistedState(): PersistedState {
  const trip = makeTrip()
  return {
    version: STORAGE_VERSION,
    user: { ...USER },
    trips: [trip],
    daysByTrip: {
      [trip.id]: [
        makeDay(trip.id, 1, [
          makeItem(trip.id, 'itm_a'),
          makeItem(trip.id, 'itm_b', { startTime: '11:00' }),
        ]),
        makeDay(trip.id, 2, [makeItem(trip.id, 'itm_c', { startTime: '09:30' })]),
      ],
    },
    expensesByTrip: { [trip.id]: [makeExpense(trip.id, 'exp_a')] },
    generation: { [trip.id]: makeGeneration() },
    themePreference: 'system',
    hasDemoData: false,
  }
}

function makeState(hydrated = true): TouristState {
  return { ...makePersistedState(), hydrated }
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const nested of Object.values(value as Record<string, unknown>)) {
      deepFreeze(nested)
    }
  }
  return value
}

function applyPurely(state: TouristState, action: TouristAction): TouristState {
  const before = JSON.stringify(state)
  deepFreeze(state)
  const next = touristReducer(state, action)
  expect(JSON.stringify(state)).toBe(before)
  return next
}

describe('createInitialTouristState', () => {
  it('starts unhydrated with an empty, versioned store', () => {
    const state = createInitialTouristState()
    expect(state.hydrated).toBe(false)
    expect(state.version).toBe(STORAGE_VERSION)
    expect(state.trips).toEqual([])
    expect(state.daysByTrip).toEqual({})
    expect(state.expensesByTrip).toEqual({})
    expect(state.generation).toEqual({})
    expect(state.themePreference).toBe('system')
    expect(state.hasDemoData).toBe(false)
    expect(state.user.isGuest).toBe(true)
  })

  it('returns independent containers on every call', () => {
    const first = createInitialTouristState()
    const second = createInitialTouristState()
    expect(first.trips).not.toBe(second.trips)
    expect(first.daysByTrip).not.toBe(second.daysByTrip)
    expect(first.expensesByTrip).not.toBe(second.expensesByTrip)
    expect(first.generation).not.toBe(second.generation)
  })
})

describe('toPersistedState', () => {
  it('drops hydrated and keeps every persisted slice', () => {
    const persisted = toPersistedState(makeState())
    expect('hydrated' in persisted).toBe(false)
    expect(persisted.version).toBe(STORAGE_VERSION)
    expect(persisted.trips).toHaveLength(1)
    expect(Object.keys(persisted.daysByTrip)).toEqual(['trip_1'])
  })

  it('leaves the state it was given untouched', () => {
    const state = makeState()
    const before = JSON.stringify(state)
    toPersistedState(state)
    expect(JSON.stringify(state)).toBe(before)
    expect(state.hydrated).toBe(true)
  })
})

describe('touristReducer hydrate', () => {
  it('adopts the persisted payload wholesale and marks the state hydrated', () => {
    const payload = makePersistedState()
    const next = applyPurely(makeState(false), { type: 'hydrate', state: payload })
    expect(next.hydrated).toBe(true)
    expect(next.trips).toBe(payload.trips)
    expect(next.daysByTrip).toBe(payload.daysByTrip)
    expect(next.expensesByTrip).toBe(payload.expensesByTrip)
    expect(next.generation).toBe(payload.generation)
    expect(next.user).toBe(payload.user)
    expect(next.themePreference).toBe(payload.themePreference)
  })

  it('discards the previous contents rather than merging them', () => {
    const previous = makeState()
    const next = touristReducer(previous, {
      type: 'hydrate',
      state: { ...makePersistedState(), trips: [], daysByTrip: {}, expensesByTrip: {} },
    })
    expect(next.trips).toEqual([])
    expect(next.daysByTrip).toEqual({})
    expect(next.expensesByTrip).toEqual({})
  })

  it('does not mutate the payload it is handed', () => {
    const payload = makePersistedState()
    const before = JSON.stringify(payload)
    deepFreeze(payload)
    touristReducer(makeState(false), { type: 'hydrate', state: payload })
    expect(JSON.stringify(payload)).toBe(before)
  })
})

describe('touristReducer patch', () => {
  it('adds a trip without touching any other slice', () => {
    const state = makeState()
    const trip = makeTrip({ id: 'trip_2', name: 'Lisbon', createdAt: '2026-02-01T00:00:00.000Z' })
    const next = applyPurely(state, { type: 'patch', payload: { trips: [...state.trips, trip] } })
    expect(next.trips).toHaveLength(2)
    expect(next.trips[1].id).toBe('trip_2')
    expect(next.daysByTrip).toBe(state.daysByTrip)
    expect(next.expensesByTrip).toBe(state.expensesByTrip)
    expect(next.generation).toBe(state.generation)
    expect(next.user).toBe(state.user)
    expect(next.hydrated).toBe(state.hydrated)
  })

  it('replaces the day list for a single trip and leaves sibling trips alone', () => {
    const state = makeState()
    const days = [makeDay('trip_1', 1, [])]
    const next = applyPurely(state, {
      type: 'patch',
      payload: { daysByTrip: { ...state.daysByTrip, trip_1: days } },
    })
    expect(next.daysByTrip.trip_1).toBe(days)
    expect(next.daysByTrip.trip_1).toHaveLength(1)
    expect(next.trips).toBe(state.trips)
  })

  it('replaces the expense list for a single trip', () => {
    const state = makeState()
    const expenses = [makeExpense('trip_1', 'exp_new', { amount: 3.25 })]
    const next = applyPurely(state, {
      type: 'patch',
      payload: { expensesByTrip: { ...state.expensesByTrip, trip_1: expenses } },
    })
    expect(next.expensesByTrip.trip_1).toBe(expenses)
    expect(next.expensesByTrip.trip_1[0].amount).toBe(3.25)
  })

  it('drives the generation state transitions through successive patches', () => {
    const idle = makeState()
    const loading = applyPurely(idle, {
      type: 'patch',
      payload: { generation: { trip_1: makeGeneration({ status: 'loading', startedAt: 'T0' }) } },
    })
    expect(loading.generation.trip_1.status).toBe('loading')
    expect(loading.generation.trip_1.error).toBeNull()

    const success = applyPurely(loading, {
      type: 'patch',
      payload: {
        generation: {
          trip_1: makeGeneration({ status: 'success', startedAt: 'T0', completedAt: 'T1' }),
        },
      },
    })
    expect(success.generation.trip_1.status).toBe('success')
    expect(success.generation.trip_1.completedAt).toBe('T1')

    const failed = applyPurely(success, {
      type: 'patch',
      payload: {
        generation: {
          trip_1: makeGeneration({
            status: 'error',
            error: 'The generator gave up.',
            startedAt: 'T2',
            completedAt: 'T3',
          }),
        },
      },
    })
    expect(failed.generation.trip_1.status).toBe('error')
    expect(failed.generation.trip_1.error).toBe('The generator gave up.')
    expect(idle.generation.trip_1.status).toBe('idle')
  })

  it('signs a user in and out by patching the user alone', () => {
    const guest = makeState()
    const signedIn = applyPurely(guest, {
      type: 'patch',
      payload: { user: { ...USER, name: 'Ada Lovelace', email: 'ada@example.com', isGuest: false } },
    })
    expect(signedIn.user.isGuest).toBe(false)
    expect(signedIn.user.email).toBe('ada@example.com')
    expect(signedIn.user.id).toBe(USER.id)

    const signedOut = applyPurely(signedIn, {
      type: 'patch',
      payload: { user: { ...signedIn.user, isGuest: true, email: null } },
    })
    expect(signedOut.user.isGuest).toBe(true)
    expect(signedOut.user.email).toBeNull()
    expect(signedOut.user.name).toBe('Ada Lovelace')
    expect(guest.user.isGuest).toBe(true)
  })

  it('keeps hydrated across a patch', () => {
    const next = applyPurely(makeState(true), { type: 'patch', payload: { hasDemoData: true } })
    expect(next.hydrated).toBe(true)
    const stillUnhydrated = applyPurely(makeState(false), {
      type: 'patch',
      payload: { hasDemoData: true },
    })
    expect(stillUnhydrated.hydrated).toBe(false)
  })

  it('accepts a theme preference and lets the payload win', () => {
    const next = applyPurely(makeState(), { type: 'patch', payload: { themePreference: 'dark' } })
    expect(next.themePreference).toBe('dark')
  })

  it('returns a new object with no changes for an empty payload', () => {
    const state = makeState()
    const next = applyPurely(state, { type: 'patch', payload: {} })
    expect(next).not.toBe(state)
    expect(next).toEqual(state)
  })

  it('does not cascade a removed trip into its days and expenses', () => {
    const state = makeState()
    const next = applyPurely(state, { type: 'patch', payload: { trips: [] } })
    expect(next.trips).toEqual([])
    expect(next.daysByTrip.trip_1).toHaveLength(2)
    expect(next.expensesByTrip.trip_1).toHaveLength(1)
  })
})

describe('touristReducer setTheme', () => {
  it('stores each theme preference', () => {
    for (const preference of ['light', 'dark', 'system'] as const) {
      const next = applyPurely(makeState(), { type: 'setTheme', preference })
      expect(next.themePreference).toBe(preference)
    }
  })

  it('agrees with patching the same preference', () => {
    const viaAction = touristReducer(makeState(), { type: 'setTheme', preference: 'dark' })
    const viaPatch = touristReducer(makeState(), { type: 'patch', payload: { themePreference: 'dark' } })
    expect(viaAction.themePreference).toBe(viaPatch.themePreference)
  })

  it('keeps every other slice by reference', () => {
    const state = makeState()
    const next = applyPurely(state, { type: 'setTheme', preference: 'light' })
    expect(next.trips).toBe(state.trips)
    expect(next.daysByTrip).toBe(state.daysByTrip)
    expect(next.expensesByTrip).toBe(state.expensesByTrip)
    expect(next.generation).toBe(state.generation)
    expect(next.user).toBe(state.user)
  })
})

describe('touristReducer reset', () => {
  it('replaces the whole store and marks it hydrated', () => {
    const previous = makeState()
    const fresh = makePersistedState()
    fresh.trips = [makeTrip({ id: 'trip_9' })]
    fresh.daysByTrip = {}
    fresh.expensesByTrip = {}
    fresh.generation = {}
    const next = applyPurely(previous, { type: 'reset', state: fresh })
    expect(next.hydrated).toBe(true)
    expect(next.trips).toBe(fresh.trips)
    expect(next.trips).toHaveLength(1)
    expect(next.trips[0].id).toBe('trip_9')
    expect(next.daysByTrip).toEqual({})
  })

  it('empties everything the way a cleared store needs', () => {
    const next = applyPurely(makeState(), {
      type: 'reset',
      state: { ...makePersistedState(), trips: [], daysByTrip: {}, expensesByTrip: {}, generation: {}, hasDemoData: false },
    })
    expect(next.trips).toEqual([])
    expect(next.daysByTrip).toEqual({})
    expect(next.expensesByTrip).toEqual({})
    expect(next.generation).toEqual({})
    expect(next.hasDemoData).toBe(false)
    expect(next.user.id).toBe(USER.id)
  })

  it('does not mutate the state it is handed over', () => {
    const previous = makeState()
    const before = JSON.stringify(previous)
    const fresh = makePersistedState()
    touristReducer(previous, { type: 'reset', state: fresh })
    expect(JSON.stringify(previous)).toBe(before)
  })
})

describe('touristReducer invariants', () => {
  it('returns the same reference for an unrecognised action', () => {
    const state = makeState()
    const next = touristReducer(state, { type: 'trip_added' } as unknown as TouristAction)
    expect(next).toBe(state)
  })

  it('leaves an unhydrated state unhydrated for the incremental actions', () => {
    const actions: TouristAction[] = [
      { type: 'patch', payload: { hasDemoData: true } },
      { type: 'setTheme', preference: 'dark' },
    ]
    for (const action of actions) {
      expect(touristReducer(makeState(false), action).hydrated).toBe(false)
    }
  })

  it('forces hydrated for the two whole-store actions', () => {
    const payload = makePersistedState()
    const viaHydrate = touristReducer(makeState(false), { type: 'hydrate', state: payload })
    const viaReset = touristReducer(makeState(false), { type: 'reset', state: payload })
    expect(viaHydrate.hydrated).toBe(true)
    expect(viaReset.hydrated).toBe(true)
  })

  it('returns a shallow copy so untouched slices keep their identity', () => {
    const state = makeState()
    const next = applyPurely(state, { type: 'patch', payload: { themePreference: 'light' } })
    expect(next).not.toBe(state)
    expect(next.user).toBe(state.user)
    expect(next.trips).toBe(state.trips)
  })

  it('survives a round trip through serialization', () => {
    const state = makeState()
    const restored = clone(state) as TouristState
    const next = touristReducer(restored, { type: 'patch', payload: { hasDemoData: true } })
    expect(next.trips).toEqual(state.trips)
    expect(next.daysByTrip).toEqual(state.daysByTrip)
  })
})
