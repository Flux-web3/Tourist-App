import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { sumAmounts } from '@/domain/money'
import type { CurrencyCode, Expense, ExpenseCategory, Trip } from '@/domain/types'
import { STORAGE_VERSION, type PersistedState } from '@/services/contracts'
import { expenseService } from '@/services/expenseService'
import { createEmptyState, createGuestUser } from '@/services/persistence'
import { selectBudget } from '@/state/selectors'

const FIXED_NOW = new Date('2026-03-15T09:30:00.000Z')
const FIXED_ISO = '2026-03-15T09:30:00.000Z'

const TRIP: Trip = {
  id: 'trip_fixture',
  userId: 'usr_fixture',
  name: 'Paris in the Spring',
  origin: 'Lagos, Nigeria',
  destination: 'Paris, France',
  startDate: '2026-04-01',
  endDate: '2026-04-05',
  travelers: 2,
  budget: 2500,
  currency: 'EUR',
  interests: ['culture', 'food'],
  pace: 'balanced',
  notes: '',
  status: 'itinerary_ready',
  createdAt: FIXED_ISO,
  updatedAt: FIXED_ISO,
}

const OTHER_TRIP: Trip = { ...TRIP, id: 'trip_other', name: 'Lisbon long weekend' }

type ExpenseInput = Omit<Expense, 'id' | 'createdAt' | 'updatedAt'>

function expenseInput(overrides: Partial<ExpenseInput> = {}): ExpenseInput {
  return {
    tripId: TRIP.id,
    description: 'Metro and bus passes',
    amount: 45,
    currency: 'EUR',
    category: 'transport',
    date: '2026-04-01',
    notes: '',
    ...overrides,
  }
}

function stateWith(expenses: Expense[] = [], otherExpenses: Expense[] = []): PersistedState {
  const base = createEmptyState(createGuestUser())
  return {
    ...base,
    version: STORAGE_VERSION,
    trips: [TRIP, OTHER_TRIP],
    daysByTrip: { [TRIP.id]: [], [OTHER_TRIP.id]: [] },
    expensesByTrip: { [TRIP.id]: expenses, [OTHER_TRIP.id]: otherExpenses },
    generation: {},
  }
}

function expensesOf(state: PersistedState, tripId = TRIP.id): Expense[] {
  return state.expensesByTrip[tripId] ?? []
}

function totalByCategory(expenses: readonly Expense[]): Record<ExpenseCategory, number> {
  const categories: ExpenseCategory[] = ['stay', 'food', 'transport', 'activities', 'shopping', 'other']
  const rounded: Record<ExpenseCategory, number> = {
    stay: 0,
    food: 0,
    transport: 0,
    activities: 0,
    shopping: 0,
    other: 0,
  }
  for (const category of categories) {
    rounded[category] = sumAmounts(
      expenses.filter((expense) => expense.category === category).map((expense) => expense.amount),
    )
  }
  return rounded
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(FIXED_NOW)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('expenseService.add', () => {
  it('appends the expense to the requested trip', () => {
    const state = stateWith()

    const result = expenseService.add(state, expenseInput())

    expect(result.expense.tripId).toBe(TRIP.id)
    expect(expensesOf(result.state)).toHaveLength(1)
    expect(expensesOf(result.state)[0]?.id).toBe(result.expense.id)
    expect(expensesOf(state)).toHaveLength(0)
  })

  it('issues an id and timestamps the record', () => {
    const { expense } = expenseService.add(stateWith(), expenseInput())

    expect(expense.id).toMatch(/^exp_/)
    expect(expense.createdAt).toBe(FIXED_ISO)
    expect(expense.updatedAt).toBe(FIXED_ISO)
  })

  it('gives each expense its own id', () => {
    const first = expenseService.add(stateWith(), expenseInput())
    const second = expenseService.add(first.state, expenseInput({ amount: 10 }))

    expect(first.expense.id).not.toBe(second.expense.id)
    expect(expensesOf(second.state)).toHaveLength(2)
  })

  it('trims the description', () => {
    const { expense } = expenseService.add(stateWith(), expenseInput({ description: '  Metro pass  ' }))

    expect(expense.description).toBe('Metro pass')
  })

  it('copies every other field through unchanged', () => {
    const input = expenseInput({
      description: 'Louvre tickets',
      amount: 44,
      category: 'activities',
      date: '2026-04-02',
      notes: 'Two timed entries',
    })

    const { expense } = expenseService.add(stateWith(), input)

    expect(expense.description).toBe('Louvre tickets')
    expect(expense.amount).toBe(44)
    expect(expense.category).toBe('activities')
    expect(expense.date).toBe('2026-04-02')
    expect(expense.notes).toBe('Two timed entries')
  })

  it('preserves the call order', () => {
    const first = expenseService.add(stateWith(), expenseInput({ description: 'first' }))
    const second = expenseService.add(first.state, expenseInput({ description: 'second' }))

    expect(expensesOf(second.state).map((expense) => expense.description)).toEqual(['first', 'second'])
  })

  it('adds to the bucket the caller names, not the first trip', () => {
    const { state } = expenseService.add(stateWith(), expenseInput({ tripId: OTHER_TRIP.id }))

    expect(expensesOf(state, TRIP.id)).toHaveLength(0)
    expect(expensesOf(state, OTHER_TRIP.id)).toHaveLength(1)
  })

  it('leaves the other trips alone', () => {
    const existing: Expense = {
      ...expenseInput({ tripId: OTHER_TRIP.id, description: 'Tram ticket' }),
      id: 'exp_existing',
      createdAt: FIXED_ISO,
      updatedAt: FIXED_ISO,
    }
    const state = stateWith([], [existing])

    const result = expenseService.add(state, expenseInput())

    expect(expensesOf(result.state, OTHER_TRIP.id)).toEqual([existing])
  })
})

describe('expenseService.add and cent-safe money', () => {
  it('keeps a decimal amount on two decimal places', () => {
    const { expense } = expenseService.add(stateWith(), expenseInput({ amount: 19.999 }))

    expect(expense.amount).toBe(20)
  })

  it('rounds a third decimal place rather than storing it', () => {
    const { expense } = expenseService.add(stateWith(), expenseInput({ amount: 10.129 }))

    expect(expense.amount).toBe(10.13)
  })

  it('stores 0.1 and 0.2 exactly so the pair totals 0.3', () => {
    let state = stateWith()
    const first = expenseService.add(state, expenseInput({ amount: 0.1 }))
    state = first.state
    const second = expenseService.add(state, expenseInput({ amount: 0.2 }))

    const amounts = expensesOf(second.state).map((expense) => expense.amount)

    expect(0.1 + 0.2).not.toBe(0.3)
    expect(amounts).toEqual([0.1, 0.2])
    expect(sumAmounts(amounts)).toBe(0.3)
  })

  it('keeps a longer mixed basket exact', () => {
    let state = stateWith()
    for (const amount of [0.1, 0.2, 10.13, 0.07, 33.33]) {
      state = expenseService.add(state, expenseInput({ amount })).state
    }

    const amounts = expensesOf(state).map((expense) => expense.amount)

    expect(amounts).toEqual([0.1, 0.2, 10.13, 0.07, 33.33])
    for (const amount of amounts) {
      expect(Math.round(amount * 100) / 100).toBe(amount)
    }
    expect(sumAmounts(amounts)).toBe(43.83)
  })

  it('totals per category without float drift', () => {
    let state = stateWith()
    state = expenseService.add(
      state,
      expenseInput({ amount: 0.1, category: 'food' }),
    ).state
    state = expenseService.add(
      state,
      expenseInput({ amount: 0.2, category: 'food' }),
    ).state
    state = expenseService.add(
      state,
      expenseInput({ amount: 420, category: 'stay' }),
    ).state
    state = expenseService.add(
      state,
      expenseInput({ amount: 45, category: 'transport' }),
    ).state

    const totals = totalByCategory(expensesOf(state))

    expect(totals.food).toBe(0.3)
    expect(totals.stay).toBe(420)
    expect(totals.transport).toBe(45)
    expect(totals.activities).toBe(0)
    expect(totals.shopping).toBe(0)
    expect(totals.other).toBe(0)
    expect(sumAmounts(Object.values(totals))).toBe(sumAmounts(expensesOf(state).map((e) => e.amount)))
  })

  it('leaves an untouched category at zero', () => {
    const { state } = expenseService.add(stateWith(), expenseInput({ category: 'shopping' }))
    const totals = totalByCategory(expensesOf(state))

    expect(totals.shopping).toBe(45)
    expect(totals.food).toBe(0)
  })
})

/**
 * The service records the currency it was handed, and that is right: the
 * traveller paid in it. What must not happen is the budget then adding that
 * amount to a total labelled with the trip's currency. So each case below
 * checks both halves — the record keeps its own currency, and the trip summary
 * leaves the amount out and reports the mismatch.
 */
describe('expenseService.add and the trip currency', () => {
  it('stores the trip currency on the expense', () => {
    const { expense } = expenseService.add(stateWith(), expenseInput({ currency: TRIP.currency }))

    expect(expense.currency).toBe('EUR')
    expect(expense.currency).toBe(TRIP.currency)
  })

  it('counts an expense in the trip currency towards the trip total', () => {
    const { state } = expenseService.add(
      stateWith(),
      expenseInput({ amount: 45, currency: TRIP.currency }),
    )
    const budget = selectBudget(state, TRIP)

    expect(budget?.actualSpent).toBe(45)
    expect(budget?.mixedCurrency).toBe(false)
    expect(budget?.uncountedExpenseCount).toBe(0)
  })

  it('stores a foreign currency verbatim and keeps that amount out of the trip total', () => {
    const { expense, state } = expenseService.add(
      stateWith(),
      expenseInput({ amount: 45_000, currency: 'NGN' }),
    )

    expect(expense.currency).toBe('NGN')
    expect(expense.currency).not.toBe(TRIP.currency)

    const budget = selectBudget(state, TRIP)
    expect(budget?.currency).toBe('EUR')
    expect(budget?.actualSpent).toBe(0)
    expect(budget?.remaining).toBe(TRIP.budget)
    expect(budget?.isOverBudget).toBe(false)
    expect(budget?.mixedCurrency).toBe(true)
    expect(budget?.otherCurrencies).toEqual(['NGN'])
    expect(budget?.uncountedExpenseCount).toBe(1)
  })

  it('does not derive the currency from the trip it is filed under, and flags it there', () => {
    const { state } = expenseService.add(
      stateWith(),
      expenseInput({ tripId: OTHER_TRIP.id, amount: 30, currency: 'GBP' as CurrencyCode }),
    )

    expect(expensesOf(state, OTHER_TRIP.id)[0]?.currency).toBe('GBP')

    const budget = selectBudget(state, OTHER_TRIP)
    expect(OTHER_TRIP.currency).toBe('EUR')
    expect(budget?.actualSpent).toBe(0)
    expect(budget?.mixedCurrency).toBe(true)
    expect(budget?.otherCurrencies).toEqual(['GBP'])
  })

  it('totals only the trip-currency expenses when a basket holds several currencies', () => {
    let state = stateWith()
    for (const [amount, currency] of [
      [20, 'EUR'],
      [30.5, 'EUR'],
      [45_000, 'NGN'],
      [1000, 'JPY'],
    ] as [number, CurrencyCode][]) {
      state = expenseService.add(state, expenseInput({ amount, currency })).state
    }

    const budget = selectBudget(state, TRIP)
    expect(budget?.actualSpent).toBe(50.5)
    expect(budget?.remaining).toBe(2449.5)
    expect(budget?.otherCurrencies).toEqual(['JPY', 'NGN'])
    expect(budget?.uncountedExpenseCount).toBe(2)
  })
})

describe('expenseService.add and input guards', () => {
  it('rejects a zero amount', () => {
    const state = stateWith()

    expect(() => expenseService.add(state, expenseInput({ amount: 0 }))).toThrow(
      /greater than zero/i,
    )
    expect(expensesOf(state)).toHaveLength(0)
  })

  it('rejects a negative amount', () => {
    const state = stateWith()

    expect(() => expenseService.add(state, expenseInput({ amount: -12.5 }))).toThrow(
      /greater than zero/i,
    )
    expect(expensesOf(state)).toHaveLength(0)
  })

  it('rejects a negative amount that rounds to negative zero cents', () => {
    expect(() => expenseService.add(stateWith(), expenseInput({ amount: -0 }))).toThrow(
      /greater than zero/i,
    )
  })

  it('rejects an amount that rounds down to nothing', () => {
    expect(() => expenseService.add(stateWith(), expenseInput({ amount: 0.004 }))).toThrow(
      /greater than zero/i,
    )
  })

  it('rejects a non-finite amount', () => {
    expect(() => expenseService.add(stateWith(), expenseInput({ amount: Number.NaN }))).toThrow(
      /finite number/i,
    )
    expect(() => expenseService.add(stateWith(), expenseInput({ amount: Number.POSITIVE_INFINITY }))).toThrow(
      /finite number/i,
    )
    expect(() => expenseService.add(stateWith(), expenseInput({ amount: Number.NEGATIVE_INFINITY }))).toThrow(
      /finite number/i,
    )
  })

  it('rejects a description that is empty once trimmed', () => {
    expect(() => expenseService.add(stateWith(), expenseInput({ description: '   ' }))).toThrow(
      /at least 2 characters/i,
    )
    expect(() => expenseService.add(stateWith(), expenseInput({ description: '' }))).toThrow(
      /at least 2 characters/i,
    )
    expect(() => expenseService.add(stateWith(), expenseInput({ description: 'x' }))).toThrow(
      /at least 2 characters/i,
    )
  })

  it('rejects a date that is not an ISO calendar date', () => {
    const badDates = ['2026-2-1', '01/04/2026', 'not-a-date', '', '2026-04-01T09:00:00Z']

    for (const date of badDates) {
      expect(() => expenseService.add(stateWith(), expenseInput({ date }))).toThrow(
        /calendar date/i,
      )
    }
  })

  it('rejects a date that does not exist on the calendar', () => {
    expect(() =>
      expenseService.add(stateWith(), expenseInput({ date: '2026-02-30' })),
    ).toThrow(/calendar date/i)
    expect(() =>
      expenseService.add(stateWith(), expenseInput({ date: '2026-04-31' })),
    ).toThrow(/calendar date/i)
    expect(() =>
      expenseService.add(stateWith(), expenseInput({ date: '2026-13-01' })),
    ).toThrow(/calendar date/i)
  })

  it('rejects a category outside the supported list', () => {
    expect(() =>
      expenseService.add(
        stateWith(),
        expenseInput({ category: 'gambling' as unknown as ExpenseCategory }),
      ),
    ).toThrow(/category is not supported/i)
  })

  it('rejects a currency outside the supported list', () => {
    expect(() =>
      expenseService.add(
        stateWith(),
        expenseInput({ currency: 'BTC' as unknown as CurrencyCode }),
      ),
    ).toThrow(/currency is not supported/i)
  })

  it('leaves the caller state untouched when the input is rejected', () => {
    const state = stateWith()

    expect(() => expenseService.add(state, expenseInput({ amount: -1 }))).toThrow()

    expect(expensesOf(state)).toHaveLength(0)
  })

  it('accepts a date before the trip starts', () => {
    const { state, expense } = expenseService.add(
      stateWith(),
      expenseInput({ amount: 780, date: '2026-03-11' }),
    )

    expect(expense.date).toBe('2026-03-11')
    expect(expense.date < TRIP.startDate).toBe(true)
    expect(expensesOf(state)[0]?.date).toBe('2026-03-11')
  })

  it('accepts a date after the trip ends', () => {
    const { expense } = expenseService.add(
      stateWith(),
      expenseInput({ date: '2026-05-01' }),
    )

    expect(expense.date).toBe('2026-05-01')
  })

  it('accepts a far future booking date', () => {
    const { expense } = expenseService.add(
      stateWith(),
      expenseInput({ date: '2030-01-01' }),
    )

    expect(expense.date).toBe('2030-01-01')
  })
})

describe('expenseService.update', () => {
  const existing: Expense = {
    ...expenseInput({ description: 'Metro pass', amount: 45, category: 'transport' }),
    id: 'exp_target',
    createdAt: '2026-03-01T10:00:00.000Z',
    updatedAt: '2026-03-01T10:00:00.000Z',
  }

  it('patches the matching expense', () => {
    const state = stateWith([existing])

    const result = expenseService.update(state, 'exp_target', {
      description: 'Weekly metro passes',
      amount: 52.5,
      category: 'transport',
    })

    const updated = expensesOf(result)[0]
    expect(updated?.description).toBe('Weekly metro passes')
    expect(updated?.amount).toBe(52.5)
    expect(updated?.category).toBe('transport')
  })

  it('refreshes updatedAt but keeps createdAt', () => {
    const state = stateWith([existing])

    const result = expenseService.update(state, 'exp_target', { amount: 50 })
    const updated = expensesOf(result)[0]

    expect(updated?.updatedAt).toBe(FIXED_ISO)
    expect(updated?.createdAt).toBe('2026-03-01T10:00:00.000Z')
  })

  it('keeps the id, the trip and the untouched fields', () => {
    const state = stateWith([existing])

    const result = expenseService.update(state, 'exp_target', { notes: 'Paid by card' })
    const updated = expensesOf(result)[0]

    expect(updated?.id).toBe('exp_target')
    expect(updated?.tripId).toBe(TRIP.id)
    expect(updated?.amount).toBe(45)
    expect(updated?.date).toBe('2026-04-01')
    expect(updated?.notes).toBe('Paid by card')
  })

  it('rounds a patched amount', () => {
    const state = stateWith([existing])

    const result = expenseService.update(state, 'exp_target', { amount: 19.999 })

    expect(expensesOf(result)[0]?.amount).toBe(20)
  })

  it('leaves the amount alone when the patch has none', () => {
    const state = stateWith([existing])

    const result = expenseService.update(state, 'exp_target', { description: 'Renamed' })

    expect(expensesOf(result)[0]?.amount).toBe(45)
  })

  it('leaves the other expenses alone', () => {
    const other: Expense = { ...existing, id: 'exp_other', amount: 10 }
    const state = stateWith([existing, other])

    const result = expenseService.update(state, 'exp_target', { amount: 99 })

    expect(expensesOf(result).map((expense) => expense.amount)).toEqual([99, 10])
  })

  it('returns the same state for an unknown id', () => {
    const state = stateWith([existing])

    const result = expenseService.update(state, 'exp_missing', { amount: 5 })

    expect(result).toBe(state)
  })

  it('does not mutate the state it was given', () => {
    const state = stateWith([existing])

    expenseService.update(state, 'exp_target', { amount: 1 })

    expect(expensesOf(state)[0]?.amount).toBe(45)
  })

  it('finds an expense in any trip bucket', () => {
    const elsewhere: Expense = { ...existing, id: 'exp_elsewhere', tripId: OTHER_TRIP.id }
    const state = stateWith([], [elsewhere])

    const result = expenseService.update(state, 'exp_elsewhere', { amount: 7 })

    expect(expensesOf(result, OTHER_TRIP.id)[0]?.amount).toBe(7)
    expect(expensesOf(result, TRIP.id)).toHaveLength(0)
  })
})

describe('expenseService.update input guards', () => {
  const existing: Expense = {
    ...expenseInput({ description: 'Metro pass', amount: 45, category: 'transport' }),
    id: 'exp_guard',
    createdAt: '2026-03-01T10:00:00.000Z',
    updatedAt: '2026-03-01T10:00:00.000Z',
  }

  it('rejects a patched amount of zero', () => {
    const state = stateWith([existing])

    expect(() => expenseService.update(state, 'exp_guard', { amount: 0 })).toThrow(
      /greater than zero/i,
    )
  })

  it('rejects a patched negative amount', () => {
    const state = stateWith([existing])

    expect(() => expenseService.update(state, 'exp_guard', { amount: -5 })).toThrow(
      /greater than zero/i,
    )
  })

  it('rejects a patched amount that is not finite', () => {
    const state = stateWith([existing])

    expect(() => expenseService.update(state, 'exp_guard', { amount: Number.NaN })).toThrow(
      /finite number/i,
    )
  })

  it('rejects a patched description that is blank once trimmed', () => {
    const state = stateWith([existing])

    expect(() => expenseService.update(state, 'exp_guard', { description: '  ' })).toThrow(
      /at least 2 characters/i,
    )
  })

  it('rejects a patched date that is not a real calendar date', () => {
    const state = stateWith([existing])

    expect(() => expenseService.update(state, 'exp_guard', { date: '2026-02-30' })).toThrow(
      /calendar date/i,
    )
    expect(() => expenseService.update(state, 'exp_guard', { date: 'yesterday' })).toThrow(
      /calendar date/i,
    )
  })

  it('rejects a patched category outside the supported list', () => {
    const state = stateWith([existing])

    expect(() =>
      expenseService.update(state, 'exp_guard', {
        category: 'gambling' as unknown as ExpenseCategory,
      }),
    ).toThrow(/category is not supported/i)
  })

  it('rejects a patched currency outside the supported list', () => {
    const state = stateWith([existing])

    expect(() =>
      expenseService.update(state, 'exp_guard', { currency: 'BTC' as unknown as CurrencyCode }),
    ).toThrow(/currency is not supported/i)
  })

  it('leaves the stored expense untouched when a patch is rejected', () => {
    const state = stateWith([existing])

    expect(() => expenseService.update(state, 'exp_guard', { amount: 0 })).toThrow()

    expect(expensesOf(state)[0]).toEqual(existing)
  })

  it('trims a patched description', () => {
    const state = stateWith([existing])

    const result = expenseService.update(state, 'exp_guard', { description: '  Weekly passes  ' })

    expect(expensesOf(result)[0]?.description).toBe('Weekly passes')
  })
})

describe('expenseService.remove', () => {
  const first: Expense = {
    ...expenseInput({ description: 'first' }),
    id: 'exp_first',
    createdAt: FIXED_ISO,
    updatedAt: FIXED_ISO,
  }
  const second: Expense = {
    ...expenseInput({ description: 'second' }),
    id: 'exp_second',
    createdAt: FIXED_ISO,
    updatedAt: FIXED_ISO,
  }

  it('removes the named expense from the trip', () => {
    const state = stateWith([first, second])

    const result = expenseService.remove(state, TRIP.id, 'exp_first')

    expect(expensesOf(result).map((expense) => expense.id)).toEqual(['exp_second'])
  })

  it('is a no-op for an unknown expense id', () => {
    const state = stateWith([first, second])

    const result = expenseService.remove(state, TRIP.id, 'exp_missing')

    expect(expensesOf(result)).toEqual([first, second])
  })

  it('is a no-op for an unknown trip id', () => {
    const state = stateWith([first, second])

    const result = expenseService.remove(state, 'trip_missing', 'exp_first')

    expect(expensesOf(result)).toEqual([first, second])
  })

  it('does not touch the same id in another trip', () => {
    const elsewhere: Expense = { ...first, tripId: OTHER_TRIP.id }
    const state = stateWith([first], [elsewhere])

    const result = expenseService.remove(state, TRIP.id, 'exp_first')

    expect(expensesOf(result, TRIP.id)).toHaveLength(0)
    expect(expensesOf(result, OTHER_TRIP.id)).toEqual([elsewhere])
  })

  it('leaves the input state untouched', () => {
    const state = stateWith([first, second])

    expenseService.remove(state, TRIP.id, 'exp_first')

    expect(expensesOf(state)).toHaveLength(2)
  })

  it('keeps the remaining total exact', () => {
    let state = stateWith()
    state = expenseService.add(state, expenseInput({ amount: 0.1 })).state
    state = expenseService.add(state, expenseInput({ amount: 0.2 })).state
    const target = expensesOf(state)[0]
    if (!target) throw new Error('expected a seeded expense')

    const result = expenseService.remove(state, TRIP.id, target.id)

    expect(sumAmounts(expensesOf(result).map((expense) => expense.amount))).toBe(0.2)
  })
})
