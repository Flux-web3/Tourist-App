import { describe, expect, it } from 'vitest'
import type {
  Expense,
  ItineraryDay,
  ItineraryItem,
  Trip,
  User,
} from '@/domain/types'
import { STORAGE_VERSION, type PersistedState } from '@/services/contracts'
import {
  selectBudget,
  selectDays,
  selectExpenses,
  selectExpensesByCategory,
  selectHasData,
  selectTrip,
  selectTripSummary,
  selectTrips,
} from '@/state/selectors'

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
    endDate: '2026-04-03',
    travelers: 2,
    budget: 1000,
    currency: 'EUR',
    interests: ['culture', 'food'],
    pace: 'balanced',
    notes: '',
    status: 'itinerary_ready',
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
  return {
    id: `${tripId}_d${index}`,
    tripId,
    date: `2026-04-0${index}`,
    index,
    title: null,
    items,
  }
}

function makeExpense(tripId: string, id: string, overrides: Partial<Expense> = {}): Expense {
  return {
    id,
    tripId,
    description: `Expense ${id}`,
    amount: 10,
    currency: 'EUR',
    category: 'food',
    date: '2026-04-01',
    notes: '',
    createdAt: '2026-01-03T00:00:00.000Z',
    updatedAt: '2026-01-03T00:00:00.000Z',
    ...overrides,
  }
}

const TRIP_ONE = makeTrip()
const TRIP_TWO = makeTrip({
  id: 'trip_2',
  name: 'A second trip',
  startDate: '2026-05-01',
  endDate: '2026-05-01',
  budget: 800,
  createdAt: '2026-02-01T00:00:00.000Z',
  updatedAt: '2026-02-01T00:00:00.000Z',
})

const DAYS: ItineraryDay[] = [
  makeDay(TRIP_ONE.id, 1, [
    makeItem(TRIP_ONE.id, 'itm_a1', { estimatedCost: 19.99, startTime: '08:00' }),
    makeItem(TRIP_ONE.id, 'itm_a2', { estimatedCost: 0.1, startTime: '10:00' }),
  ]),
  makeDay(TRIP_ONE.id, 2, []),
  makeDay(TRIP_ONE.id, 3, [
    makeItem(TRIP_ONE.id, 'itm_c1', { estimatedCost: 0.2, startTime: '08:00' }),
    makeItem(TRIP_ONE.id, 'itm_c2', { estimatedCost: 25.5, startTime: '11:00' }),
  ]),
]

const EXPENSES: Expense[] = [
  makeExpense(TRIP_ONE.id, 'exp_1', {
    amount: 100.25,
    date: '2026-04-03',
    category: 'food',
    createdAt: '2026-01-05T00:00:00.000Z',
  }),
  makeExpense(TRIP_ONE.id, 'exp_2', {
    amount: 0.2,
    date: '2026-04-03',
    category: 'food',
    createdAt: '2026-01-04T00:00:00.000Z',
  }),
  makeExpense(TRIP_ONE.id, 'exp_3', {
    amount: 0.1,
    date: '2026-04-02',
    category: 'transport',
    createdAt: '2026-01-06T00:00:00.000Z',
  }),
  makeExpense(TRIP_ONE.id, 'exp_4', {
    amount: 200.45,
    date: '2026-04-01',
    category: 'stay',
    createdAt: '2026-01-07T00:00:00.000Z',
  }),
]

function makeState(): PersistedState {
  return {
    version: STORAGE_VERSION,
    user: { ...USER },
    trips: [TRIP_ONE, TRIP_TWO],
    daysByTrip: { [TRIP_ONE.id]: DAYS, [TRIP_TWO.id]: [] },
    expensesByTrip: { [TRIP_ONE.id]: EXPENSES, [TRIP_TWO.id]: [] },
    generation: {},
    themePreference: 'system',
    hasDemoData: true,
  }
}

function withoutTrips(): PersistedState {
  return { ...makeState(), trips: [], daysByTrip: {}, expensesByTrip: {} }
}

describe('selectTrip', () => {
  it('finds a trip that exists', () => {
    expect(selectTrip(makeState(), TRIP_ONE.id)).toBe(TRIP_ONE)
  })

  it('returns null for a trip that is missing', () => {
    expect(selectTrip(makeState(), 'trip_missing')).toBeNull()
  })

  it('returns null when no id is supplied', () => {
    const state = makeState()
    expect(selectTrip(state, undefined)).toBeNull()
    expect(selectTrip(state, '')).toBeNull()
  })
})

describe('selectTrips', () => {
  it('orders trips newest first', () => {
    expect(selectTrips(makeState()).map((trip) => trip.id)).toEqual([TRIP_TWO.id, TRIP_ONE.id])
  })

  it('returns a fresh array and leaves the stored order alone', () => {
    const state = makeState()
    const trips = selectTrips(state)
    expect(trips).not.toBe(state.trips)
    expect(state.trips).toEqual([TRIP_ONE, TRIP_TWO])
  })

  it('returns an empty list when there are no trips', () => {
    expect(selectTrips(withoutTrips())).toEqual([])
  })
})

describe('selectDays', () => {
  it('returns the days for a trip that exists', () => {
    expect(selectDays(makeState(), TRIP_ONE.id)).toBe(DAYS)
  })

  it('returns an empty array for a trip that is missing', () => {
    expect(selectDays(makeState(), 'trip_missing')).toEqual([])
  })

  it('returns an empty array when no id is supplied', () => {
    expect(selectDays(makeState(), undefined)).toEqual([])
    expect(selectDays(makeState(), '')).toEqual([])
  })

  it('returns an empty array for a trip with no days yet', () => {
    expect(selectDays(makeState(), TRIP_TWO.id)).toEqual([])
  })
})

describe('selectExpenses', () => {
  it('orders expenses by date descending then by creation descending', () => {
    expect(selectExpenses(makeState(), TRIP_ONE.id).map((expense) => expense.id)).toEqual([
      'exp_1',
      'exp_2',
      'exp_3',
      'exp_4',
    ])
  })

  it('returns a sorted copy without reordering the stored expenses', () => {
    const state = makeState()
    const expenses = selectExpenses(state, TRIP_ONE.id)
    expect(expenses).not.toBe(state.expensesByTrip[TRIP_ONE.id])
    expect(state.expensesByTrip[TRIP_ONE.id].map((expense) => expense.id)).toEqual([
      'exp_1',
      'exp_2',
      'exp_3',
      'exp_4',
    ])
  })

  it('returns an empty array for a trip that is missing or idless', () => {
    expect(selectExpenses(makeState(), 'trip_missing')).toEqual([])
    expect(selectExpenses(makeState(), undefined)).toEqual([])
    expect(selectExpenses(makeState(), TRIP_TWO.id)).toEqual([])
  })
})

describe('selectExpensesByCategory', () => {
  it('returns an empty array for no expenses', () => {
    expect(selectExpensesByCategory([])).toEqual([])
  })

  it('groups by category, counts entries and sorts by total descending', () => {
    expect(selectExpensesByCategory(EXPENSES)).toEqual([
      { category: 'stay', total: 200.45, count: 1 },
      { category: 'food', total: 100.45, count: 2 },
      { category: 'transport', total: 0.1, count: 1 },
    ])
  })

  it('keeps every grouped total exact for values that drift in floating point', () => {
    const drift = [0.1, 0.2, 0.3, 1.1, 2.2].map((amount, index) =>
      makeExpense(TRIP_ONE.id, `exp_drift_${index}`, { amount }),
    )
    expect(selectExpensesByCategory(drift)).toEqual([
      { category: 'food', total: 3.9, count: 5 },
    ])
  })

  it('returns a single bucket for a single expense', () => {
    const only = makeExpense(TRIP_ONE.id, 'exp_only', { amount: 7.25, category: 'other' })
    expect(selectExpensesByCategory([only])).toEqual([
      { category: 'other', total: 7.25, count: 1 },
    ])
  })

  it('orders equal totals deterministically by their first appearance', () => {
    const tied = [
      makeExpense(TRIP_ONE.id, 'exp_t1', { amount: 5, category: 'shopping' }),
      makeExpense(TRIP_ONE.id, 'exp_t2', { amount: 5, category: 'activities' }),
    ]
    expect(selectExpensesByCategory(tied).map((bucket) => bucket.category)).toEqual([
      'shopping',
      'activities',
    ])
  })
})

describe('selectBudget', () => {
  it('returns null when there is no trip', () => {
    expect(selectBudget(makeState(), null)).toBeNull()
  })

  it('agrees with the raw days and expenses for a trip that exists', () => {
    const budget = selectBudget(makeState(), TRIP_ONE)
    expect(budget).not.toBeNull()
    expect(budget?.tripBudget).toBe(1000)
    expect(budget?.itineraryEstimate).toBe(45.79)
    expect(budget?.actualSpent).toBe(301)
    expect(budget?.remaining).toBe(699)
    expect(budget?.estimateVariance).toBe(-255.21)
    expect(budget?.isOverBudget).toBe(false)
    expect(budget?.currency).toBe('EUR')
  })

  it('ignores the empty middle day when totalling the estimate', () => {
    const withEmptyDay = selectBudget(makeState(), TRIP_ONE)
    const withoutEmptyDay = selectBudget(
      { ...makeState(), daysByTrip: { [TRIP_ONE.id]: [DAYS[0], DAYS[2]] } },
      TRIP_ONE,
    )
    expect(DAYS[1].items).toHaveLength(0)
    expect(withEmptyDay?.itineraryEstimate).toBe(withoutEmptyDay?.itineraryEstimate)
    expect(withEmptyDay?.itineraryEstimate).toBe(45.79)
  })

  it('reports an overspend when the ceiling is below the spend', () => {
    const budget = selectBudget(makeState(), { ...TRIP_ONE, budget: 100 })
    expect(budget?.actualSpent).toBe(301)
    expect(budget?.remaining).toBe(-201)
    expect(budget?.isOverBudget).toBe(true)
  })

  it('reports zeroes for a trip that exists but has no data yet', () => {
    const budget = selectBudget(makeState(), TRIP_TWO)
    expect(budget?.tripBudget).toBe(800)
    expect(budget?.itineraryEstimate).toBe(0)
    expect(budget?.actualSpent).toBe(0)
    expect(budget?.remaining).toBe(800)
    expect(budget?.estimateVariance).toBe(0)
    expect(budget?.isOverBudget).toBe(false)
  })

  it('uses only the trip in hand when its id is absent from the store', () => {
    const detached = { ...TRIP_ONE, id: 'trip_detached', budget: 500 }
    const budget = selectBudget(makeState(), detached)
    expect(budget?.tripBudget).toBe(500)
    expect(budget?.itineraryEstimate).toBe(0)
    expect(budget?.actualSpent).toBe(0)
    expect(budget?.remaining).toBe(500)
  })
})

describe('selectTripSummary', () => {
  it('counts days and items and agrees with the raw data', () => {
    const summary = selectTripSummary(makeState(), TRIP_ONE)
    expect(summary.trip).toBe(TRIP_ONE)
    expect(summary.days).toBe(DAYS)
    expect(summary.dayCount).toBe(3)
    expect(summary.itemCount).toBe(4)
    expect(summary.itineraryEstimate).toBe(45.79)
    expect(summary.actualSpent).toBe(301)
    expect(summary.remaining).toBe(699)
  })

  it('counts an empty day as a day but not as an item', () => {
    const summary = selectTripSummary(makeState(), TRIP_ONE)
    const empty = summary.days[1]
    expect(empty.items).toHaveLength(0)
    expect(summary.dayCount).toBe(summary.days.length)
    expect(summary.itemCount).toBe(
      summary.days.reduce((total, day) => total + day.items.length, 0),
    )
  })

  it('returns the first item of the first day that has one', () => {
    expect(selectTripSummary(makeState(), TRIP_ONE).nextItem).toBe(DAYS[0].items[0])
  })

  it('skips leading empty days when choosing the next item', () => {
    const emptyFirst: ItineraryDay[] = [makeDay(TRIP_ONE.id, 1, []), DAYS[2]]
    const summary = selectTripSummary(
      { ...makeState(), daysByTrip: { [TRIP_ONE.id]: emptyFirst } },
      TRIP_ONE,
    )
    expect(summary.nextItem).toBe(DAYS[2].items[0])
  })

  it('reports an empty trip without a next item', () => {
    const summary = selectTripSummary(makeState(), TRIP_TWO)
    expect(summary.dayCount).toBe(0)
    expect(summary.itemCount).toBe(0)
    expect(summary.itineraryEstimate).toBe(0)
    expect(summary.actualSpent).toBe(0)
    expect(summary.remaining).toBe(800)
    expect(summary.nextItem).toBeNull()
  })

  it('falls back to the trip budget when a trip carries no budget summary', () => {
    const state = { ...makeState(), expensesByTrip: {}, daysByTrip: {} }
    const summary = selectTripSummary(state, TRIP_TWO)
    expect(summary.remaining).toBe(800)
    expect(summary.nextItem).toBeNull()
  })
})

describe('selectHasData', () => {
  it('is false when the store has no trips', () => {
    expect(selectHasData(withoutTrips())).toBe(false)
  })

  it('is true as soon as one trip exists', () => {
    expect(selectHasData(makeState())).toBe(true)
    expect(selectHasData({ ...makeState(), trips: [TRIP_ONE] })).toBe(true)
  })
})
