import { describe, expect, it } from 'vitest'
import { sumAmounts, toCents } from '@/domain/money'
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
    destinationId: 'paris',
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
    expect(selectExpensesByCategory([], 'EUR')).toEqual([])
  })

  it('groups by category, counts entries and sorts by total descending', () => {
    expect(selectExpensesByCategory(EXPENSES, 'EUR')).toEqual([
      { category: 'stay', total: 200.45, count: 1 },
      { category: 'food', total: 100.45, count: 2 },
      { category: 'transport', total: 0.1, count: 1 },
    ])
  })

  it('keeps every grouped total exact for values that drift in floating point', () => {
    const drift = [0.1, 0.2, 0.3, 1.1, 2.2].map((amount, index) =>
      makeExpense(TRIP_ONE.id, `exp_drift_${index}`, { amount }),
    )
    expect(selectExpensesByCategory(drift, 'EUR')).toEqual([
      { category: 'food', total: 3.9, count: 5 },
    ])
  })

  it('returns a single bucket for a single expense', () => {
    const only = makeExpense(TRIP_ONE.id, 'exp_only', { amount: 7.25, category: 'other' })
    expect(selectExpensesByCategory([only], 'EUR')).toEqual([
      { category: 'other', total: 7.25, count: 1 },
    ])
  })

  it('orders equal totals deterministically by their first appearance', () => {
    const tied = [
      makeExpense(TRIP_ONE.id, 'exp_t1', { amount: 5, category: 'shopping' }),
      makeExpense(TRIP_ONE.id, 'exp_t2', { amount: 5, category: 'activities' }),
    ]
    expect(selectExpensesByCategory(tied, 'EUR').map((bucket) => bucket.category)).toEqual([
      'shopping',
      'activities',
    ])
  })

  it('totals a pair of half-cent amounts on the cent scale rather than the float scale', () => {
    const halves = [0.145, 0.145].map((amount, index) =>
      makeExpense(TRIP_ONE.id, `exp_half_${index}`, { amount, category: 'food' }),
    )
    expect(0.145 * 100).toBe(14.499999999999998)
    expect(selectExpensesByCategory(halves, 'EUR')).toEqual([{ category: 'food', total: 0.3, count: 2 }])
  })

  it('keeps a single half-cent amount whole instead of losing the cent', () => {
    const one = makeExpense(TRIP_ONE.id, 'exp_one', { amount: 1.005, category: 'stay' })
    expect(1.005 * 100).toBe(100.49999999999999)
    expect(selectExpensesByCategory([one], 'EUR')).toEqual([{ category: 'stay', total: 1.01, count: 1 }])
  })

  it('agrees with sumAmounts on every bucket', () => {
    const mixed = [0.145, 1.005, 2.675, 19.99, 0.01].map((amount, index) =>
      makeExpense(TRIP_ONE.id, `exp_mixed_${index}`, { amount, category: 'transport' }),
    )
    const [bucket] = selectExpensesByCategory(mixed, 'EUR')
    expect(bucket?.total).toBe(sumAmounts(mixed.map((expense) => expense.amount)))
    expect(bucket?.total).toBe(23.84)
  })

  it('does not drift across a long run of accumulations', () => {
    const many = Array.from({ length: 20 }, (_, index) =>
      makeExpense(TRIP_ONE.id, `exp_many_${index}`, { amount: 0.145, category: 'other' }),
    )
    expect(selectExpensesByCategory(many, 'EUR')).toEqual([{ category: 'other', total: 3, count: 20 }])
  })
})

/**
 * The breakdown is a breakdown of `actualSpent`, so it must follow the same
 * currency rule. Before, it grouped every expense regardless of currency, so a
 * trip switched from EUR to NGN showed its euro spend as naira rows while
 * Actual Spent read zero.
 */
describe('selectExpensesByCategory and currency', () => {
  /** Two NGN expenses and two EUR ones, on a trip now in NGN. */
  function stateAfterSwitchToNgn(): { state: PersistedState; trip: Trip } {
    const trip = { ...TRIP_ONE, currency: 'NGN' as const, budget: 500_000 }
    const expenses = [
      makeExpense(trip.id, 'exp_eur_stay', { amount: 1200, currency: 'EUR', category: 'stay' }),
      makeExpense(trip.id, 'exp_eur_act', { amount: 450.25, currency: 'EUR', category: 'activities' }),
      makeExpense(trip.id, 'exp_ngn_stay', { amount: 60_000, currency: 'NGN', category: 'stay' }),
      makeExpense(trip.id, 'exp_ngn_food', { amount: 8_500.5, currency: 'NGN', category: 'food' }),
    ]
    return {
      trip,
      state: {
        ...makeState(),
        trips: [trip, TRIP_TWO],
        daysByTrip: { [trip.id]: DAYS, [TRIP_TWO.id]: [] },
        expensesByTrip: { [trip.id]: expenses, [TRIP_TWO.id]: [] },
      },
    }
  }

  it('groups only the expenses in the currency it is given', () => {
    const { state, trip } = stateAfterSwitchToNgn()
    expect(selectExpensesByCategory(selectExpenses(state, trip.id), 'NGN')).toEqual([
      { category: 'stay', total: 60_000, count: 1 },
      { category: 'food', total: 8_500.5, count: 1 },
    ])
  })

  it('never folds a foreign amount into a row, not even one in the same category', () => {
    const { state, trip } = stateAfterSwitchToNgn()
    const rows = selectExpensesByCategory(selectExpenses(state, trip.id), 'NGN')
    const stay = rows.find((row) => row.category === 'stay')
    // 61,200 would be naira and euros added together.
    expect(stay?.total).toBe(60_000)
    expect(stay?.total).not.toBe(61_200)
    expect(rows.map((row) => row.category)).not.toContain('activities')
  })

  it('returns no rows at all when every expense is in another currency', () => {
    const { state, trip } = stateAfterSwitchToNgn()
    const rows = selectExpensesByCategory(selectExpenses(state, trip.id), 'GBP')
    expect(rows).toEqual([])
    expect(selectBudget(state, { ...trip, currency: 'GBP' })?.actualSpent).toBe(0)
  })

  it('adds up to exactly actualSpent in a mixed-currency trip', () => {
    const { state, trip } = stateAfterSwitchToNgn()
    const budget = selectBudget(state, trip)!
    const rows = selectExpensesByCategory(selectExpenses(state, trip.id), trip.currency)
    expect(budget.actualSpent).toBe(68_500.5)
    expect(sumAmounts(rows.map((row) => row.total), trip.currency)).toBe(budget.actualSpent)
    expect(rows.reduce((total, row) => total + row.count, 0)).toBe(
      selectExpenses(state, trip.id).length - budget.uncountedExpenseCount,
    )
  })

  it('reconciles with actualSpent to the minor unit for every trip currency', () => {
    const currencies = ['EUR', 'USD', 'GBP', 'NGN', 'JPY'] as const
    const categories = ['stay', 'food', 'transport', 'activities', 'shopping', 'other'] as const
    // Awkward amounts: half-cents, float-hostile values, and fractions of a yen.
    const amounts = [0.145, 1.005, 2.675, 19.99, 0.01, 1200.6, 5000, 100.25, 3400.5, 7.7, 0.3]
    const expenses = amounts.map((amount, index) =>
      makeExpense(TRIP_ONE.id, `exp_matrix_${index}`, {
        amount,
        currency: currencies[index % currencies.length],
        category: categories[index % categories.length],
      }),
    )
    const state: PersistedState = {
      ...makeState(),
      expensesByTrip: { [TRIP_ONE.id]: expenses, [TRIP_TWO.id]: [] },
    }

    for (const currency of currencies) {
      const trip = { ...TRIP_ONE, currency }
      const budget = selectBudget(state, trip)!
      const rows = selectExpensesByCategory(selectExpenses(state, trip.id), currency)
      const rowCents = rows.reduce((total, row) => total + toCents(row.total, currency), 0)
      expect(rowCents, currency).toBe(toCents(budget.actualSpent, currency))
      expect(sumAmounts(rows.map((row) => row.total), currency), currency).toBe(budget.actualSpent)
    }
  })

  it('totals JPY in whole yen, with no minor unit', () => {
    const yen = [
      makeExpense(TRIP_ONE.id, 'exp_jpy_1', { amount: 1200.6, currency: 'JPY', category: 'food' }),
      makeExpense(TRIP_ONE.id, 'exp_jpy_2', { amount: 3400.6, currency: 'JPY', category: 'food' }),
      makeExpense(TRIP_ONE.id, 'exp_eur', { amount: 22.5, currency: 'EUR', category: 'food' }),
    ]
    const rows = selectExpensesByCategory(yen, 'JPY')
    // Whole yen per expense: 1,201 + 3,401. Hundredths would give 4,601.2.
    expect(rows).toEqual([{ category: 'food', total: 4602, count: 2 }])
    expect(Number.isInteger(rows[0].total)).toBe(true)

    const state: PersistedState = {
      ...makeState(),
      expensesByTrip: { [TRIP_ONE.id]: yen, [TRIP_TWO.id]: [] },
    }
    const budget = selectBudget(state, { ...TRIP_ONE, currency: 'JPY', budget: 150_000 })
    expect(rows[0].total).toBe(budget?.actualSpent)
  })

  it('keeps one trip’s expenses out of another trip’s rows', () => {
    const tripTwoExpenses = [
      makeExpense(TRIP_TWO.id, 'exp_t2_stay', { amount: 300, category: 'stay' }),
      makeExpense(TRIP_TWO.id, 'exp_t2_act', { amount: 80, category: 'activities' }),
    ]
    const state: PersistedState = {
      ...makeState(),
      expensesByTrip: { [TRIP_ONE.id]: EXPENSES, [TRIP_TWO.id]: tripTwoExpenses },
    }
    expect(selectExpensesByCategory(selectExpenses(state, TRIP_TWO.id), 'EUR')).toEqual([
      { category: 'stay', total: 300, count: 1 },
      { category: 'activities', total: 80, count: 1 },
    ])
    expect(selectExpensesByCategory(selectExpenses(state, TRIP_ONE.id), 'EUR')).toEqual([
      { category: 'stay', total: 200.45, count: 1 },
      { category: 'food', total: 100.45, count: 2 },
      { category: 'transport', total: 0.1, count: 1 },
    ])
    expect(selectBudget(state, TRIP_TWO)?.actualSpent).toBe(380)
    expect(selectBudget(state, TRIP_ONE)?.actualSpent).toBe(301)
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

  it('reports no currency mixing when every expense is in the trip currency', () => {
    const budget = selectBudget(makeState(), TRIP_ONE)
    expect(budget?.mixedCurrency).toBe(false)
    expect(budget?.otherCurrencies).toEqual([])
    expect(budget?.uncountedExpenseCount).toBe(0)
  })

  it('reports no estimate mixing when every stop is in the trip currency', () => {
    const budget = selectBudget(makeState(), TRIP_ONE)
    expect(budget?.mixedEstimateCurrency).toBe(false)
    expect(budget?.otherEstimateCurrencies).toEqual([])
    expect(budget?.uncountedEstimateCount).toBe(0)
  })
})

/**
 * The itinerary half of the same problem. A stop saved from the catalogue is
 * priced in the catalogue's currency, and a regeneration deliberately preserves
 * it, so a trip switched to another currency keeps stops the new total cannot
 * honestly include.
 */
describe('selectBudget and an itinerary stop in another currency', () => {
  /** One EUR catalogue stop and one NGN stop, on a trip in NGN. */
  function stateWithForeignStop(): PersistedState {
    return {
      ...makeState(),
      expensesByTrip: { [TRIP_ONE.id]: [], [TRIP_TWO.id]: [] },
      daysByTrip: {
        [TRIP_ONE.id]: [
          makeDay(TRIP_ONE.id, 1, [
            makeItem(TRIP_ONE.id, 'itm_ngn', { estimatedCost: 50_000, currency: 'NGN' }),
            makeItem(TRIP_ONE.id, 'itm_eur', {
              estimatedCost: 22,
              currency: 'EUR',
              source: 'catalog',
              startTime: '11:00',
            }),
          ]),
        ],
        [TRIP_TWO.id]: [],
      },
    }
  }

  const NGN_TRIP = { ...TRIP_ONE, currency: 'NGN' as const, budget: 1_000_000 }

  it('surfaces the mismatch through the new fields', () => {
    const budget = selectBudget(stateWithForeignStop(), NGN_TRIP)
    expect(budget?.mixedEstimateCurrency).toBe(true)
    expect(budget?.otherEstimateCurrencies).toEqual(['EUR'])
    expect(budget?.uncountedEstimateCount).toBe(1)
  })

  it('leaves the foreign stop out of the estimate rather than relabelling it', () => {
    const budget = selectBudget(stateWithForeignStop(), NGN_TRIP)
    expect(budget?.currency).toBe('NGN')
    expect(budget?.itineraryEstimate).toBe(50_000)
    // 50,022 would be the silent sum of two currencies.
    expect(budget?.itineraryEstimate).not.toBe(50_022)
  })

  it('never lets an itinerary stop touch actualSpent, remaining or isOverBudget', () => {
    const budget = selectBudget(stateWithForeignStop(), NGN_TRIP)
    expect(budget?.actualSpent).toBe(0)
    expect(budget?.remaining).toBe(1_000_000)
    expect(budget?.isOverBudget).toBe(false)
    expect(budget?.remaining).toBe(budget!.tripBudget - budget!.actualSpent)
  })

  it('keeps the settled figures intact even when every stop is foreign', () => {
    const state = {
      ...stateWithForeignStop(),
      expensesByTrip: {
        [TRIP_ONE.id]: [makeExpense(TRIP_ONE.id, 'exp_ngn', { amount: 12_000, currency: 'NGN' })],
        [TRIP_TWO.id]: [],
      },
    }
    const eurTrip = { ...TRIP_ONE, currency: 'USD' as const, budget: 5000 }
    const budget = selectBudget(state, eurTrip)
    expect(budget?.itineraryEstimate).toBe(0)
    expect(budget?.uncountedEstimateCount).toBe(2)
    expect(budget?.otherEstimateCurrencies).toEqual(['EUR', 'NGN'])
    expect(budget?.actualSpent).toBe(0)
    expect(budget?.remaining).toBe(5000)
  })

  it('reports the estimate and the expense mismatches separately', () => {
    const state = {
      ...stateWithForeignStop(),
      expensesByTrip: {
        [TRIP_ONE.id]: [makeExpense(TRIP_ONE.id, 'exp_jpy', { amount: 5000, currency: 'JPY' })],
        [TRIP_TWO.id]: [],
      },
    }
    const budget = selectBudget(state, NGN_TRIP)
    expect(budget?.otherEstimateCurrencies).toEqual(['EUR'])
    expect(budget?.otherCurrencies).toEqual(['JPY'])
    expect(budget?.uncountedEstimateCount).toBe(1)
    expect(budget?.uncountedExpenseCount).toBe(1)
  })

  it('counts the stop again once the trip currency matches it', () => {
    const budget = selectBudget(stateWithForeignStop(), { ...TRIP_ONE, currency: 'EUR' })
    expect(budget?.itineraryEstimate).toBe(22)
    expect(budget?.otherEstimateCurrencies).toEqual(['NGN'])
    expect(budget?.uncountedEstimateCount).toBe(1)
  })

  it('totals a JPY trip in whole yen through the estimate path', () => {
    const state = {
      ...makeState(),
      expensesByTrip: { [TRIP_ONE.id]: [], [TRIP_TWO.id]: [] },
      daysByTrip: {
        [TRIP_ONE.id]: [
          makeDay(TRIP_ONE.id, 1, [
            makeItem(TRIP_ONE.id, 'itm_jpy_1', { estimatedCost: 1200, currency: 'JPY' }),
            makeItem(TRIP_ONE.id, 'itm_jpy_2', {
              estimatedCost: 3400,
              currency: 'JPY',
              startTime: '11:00',
            }),
            makeItem(TRIP_ONE.id, 'itm_eur', {
              estimatedCost: 22.5,
              currency: 'EUR',
              startTime: '14:00',
            }),
          ]),
        ],
        [TRIP_TWO.id]: [],
      },
    }
    const budget = selectBudget(state, { ...TRIP_ONE, currency: 'JPY', budget: 150_000 })
    expect(budget?.itineraryEstimate).toBe(4600)
    expect(Number.isInteger(budget!.itineraryEstimate)).toBe(true)
    expect(budget?.uncountedEstimateCount).toBe(1)
    expect(budget?.remaining).toBe(150_000)
  })
})

/**
 * Switching a trip's currency leaves the already-logged expenses in the old
 * one. The dialog that switches it cannot convert them, so the summary has to
 * make the mismatch visible instead of adding yen to euros.
 */
describe('selectBudget and a trip whose currency was switched', () => {
  function stateWithForeignExpense(): PersistedState {
    return {
      ...makeState(),
      expensesByTrip: {
        [TRIP_ONE.id]: [
          makeExpense(TRIP_ONE.id, 'exp_eur', { amount: 100, currency: 'EUR' }),
          makeExpense(TRIP_ONE.id, 'exp_jpy', { amount: 5000, currency: 'JPY' }),
        ],
        [TRIP_TWO.id]: [],
      },
      daysByTrip: { [TRIP_ONE.id]: [], [TRIP_TWO.id]: [] },
    }
  }

  it('surfaces the mismatch on the summary', () => {
    const budget = selectBudget(stateWithForeignExpense(), TRIP_ONE)
    expect(budget?.mixedCurrency).toBe(true)
    expect(budget?.otherCurrencies).toEqual(['JPY'])
    expect(budget?.uncountedExpenseCount).toBe(1)
  })

  it('does not fold the foreign amount into actualSpent or remaining', () => {
    const budget = selectBudget(stateWithForeignExpense(), TRIP_ONE)
    expect(budget?.currency).toBe('EUR')
    expect(budget?.actualSpent).toBe(100)
    expect(budget?.remaining).toBe(900)
    expect(budget?.isOverBudget).toBe(false)
  })

  it('does not let a large foreign amount fake an overspend', () => {
    const state = {
      ...makeState(),
      daysByTrip: { [TRIP_ONE.id]: [], [TRIP_TWO.id]: [] },
      expensesByTrip: {
        [TRIP_ONE.id]: [
          makeExpense(TRIP_ONE.id, 'exp_eur', { amount: 100, currency: 'EUR' }),
          makeExpense(TRIP_ONE.id, 'exp_ngn', { amount: 2_000_000, currency: 'NGN' }),
        ],
        [TRIP_TWO.id]: [],
      },
    }
    const budget = selectBudget(state, TRIP_ONE)
    expect(budget?.actualSpent).toBe(100)
    expect(budget?.remaining).toBe(900)
    expect(budget?.isOverBudget).toBe(false)
    expect(budget?.otherCurrencies).toEqual(['NGN'])
  })

  it('counts nothing when the switch left every expense behind', () => {
    const state = {
      ...makeState(),
      daysByTrip: { [TRIP_ONE.id]: [], [TRIP_TWO.id]: [] },
      expensesByTrip: {
        [TRIP_ONE.id]: [
          makeExpense(TRIP_ONE.id, 'exp_usd_1', { amount: 40, currency: 'USD' }),
          makeExpense(TRIP_ONE.id, 'exp_gbp_1', { amount: 60, currency: 'GBP' }),
        ],
        [TRIP_TWO.id]: [],
      },
    }
    const budget = selectBudget(state, TRIP_ONE)
    expect(budget?.actualSpent).toBe(0)
    expect(budget?.remaining).toBe(1000)
    expect(budget?.uncountedExpenseCount).toBe(2)
    expect(budget?.otherCurrencies).toEqual(['GBP', 'USD'])
  })

  it('starts counting the expenses again once the trip currency matches them', () => {
    const state = stateWithForeignExpense()
    const asJpyTrip = selectBudget(state, { ...TRIP_ONE, currency: 'JPY', budget: 150_000 })
    expect(asJpyTrip?.actualSpent).toBe(5000)
    expect(asJpyTrip?.remaining).toBe(145_000)
    expect(asJpyTrip?.otherCurrencies).toEqual(['EUR'])
    expect(asJpyTrip?.uncountedExpenseCount).toBe(1)
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

  it('totals the estimate on the trip currency and leaves a foreign stop out', () => {
    const state = {
      ...makeState(),
      daysByTrip: {
        [TRIP_ONE.id]: [
          makeDay(TRIP_ONE.id, 1, [
            makeItem(TRIP_ONE.id, 'itm_ngn', { estimatedCost: 50_000, currency: 'NGN' }),
            makeItem(TRIP_ONE.id, 'itm_eur', {
              estimatedCost: 22,
              currency: 'EUR',
              startTime: '11:00',
            }),
          ]),
        ],
      },
    }
    const summary = selectTripSummary(state, { ...TRIP_ONE, currency: 'NGN', budget: 1_000_000 })
    expect(summary.itemCount).toBe(2)
    expect(summary.itineraryEstimate).toBe(50_000)
    // The estimate is still no part of what the traveller has left.
    expect(summary.remaining).toBe(1_000_000 - summary.actualSpent)
  })

  it('agrees with the budget summary on the estimate it reports', () => {
    const summary = selectTripSummary(makeState(), TRIP_ONE)
    const budget = selectBudget(makeState(), TRIP_ONE)
    expect(summary.itineraryEstimate).toBe(budget?.itineraryEstimate)
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
