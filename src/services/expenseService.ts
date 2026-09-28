import { createId, nowISO } from '@/domain/ids'
import { parseISODate } from '@/domain/format'
import { CURRENCIES, fromCents, toCents } from '@/domain/money'
import type { CurrencyCode, Expense, ExpenseCategory } from '@/domain/types'
import type { ExpenseService } from './contracts'

const EXPENSE_CATEGORIES = [
  'stay',
  'food',
  'transport',
  'activities',
  'shopping',
  'other',
] as const satisfies readonly ExpenseCategory[]

function isCurrency(value: unknown): value is CurrencyCode {
  return typeof value === 'string' && CURRENCIES.some((code) => code === value)
}

function isExpenseCategory(value: unknown): value is ExpenseCategory {
  return typeof value === 'string' && EXPENSE_CATEGORIES.some((category) => category === value)
}

/** An expense is only worth storing if it costs something real and is datable. */
function normaliseExpenseFields(fields: {
  amount: unknown
  description: unknown
  currency: unknown
  category: unknown
  date: unknown
}): Pick<Expense, 'amount' | 'description' | 'currency' | 'category' | 'date'> {
  if (typeof fields.amount !== 'number' || !Number.isFinite(fields.amount)) {
    throw new Error('Expense amount must be a finite number.')
  }

  const amount = fromCents(toCents(fields.amount))
  if (amount <= 0) {
    throw new Error('Expense amount must be greater than zero.')
  }

  if (typeof fields.description !== 'string' || fields.description.trim().length < 2) {
    throw new Error('Expense description must be at least 2 characters.')
  }

  if (typeof fields.date !== 'string' || parseISODate(fields.date) === null) {
    throw new Error('Expense date must be a real calendar date in yyyy-mm-dd form.')
  }

  if (!isExpenseCategory(fields.category)) {
    throw new Error('Expense category is not supported.')
  }

  if (!isCurrency(fields.currency)) {
    throw new Error('Expense currency is not supported.')
  }

  return {
    amount,
    description: fields.description.trim(),
    currency: fields.currency,
    category: fields.category,
    date: fields.date,
  }
}

export const expenseService: ExpenseService = {
  add(state, input) {
    const fields = normaliseExpenseFields(input)
    const timestamp = nowISO()
    const expense: Expense = {
      ...input,
      ...fields,
      id: createId('exp'),
      createdAt: timestamp,
      updatedAt: timestamp,
    }

    const existing = state.expensesByTrip[expense.tripId] ?? []
    return {
      expense,
      state: {
        ...state,
        expensesByTrip: {
          ...state.expensesByTrip,
          [expense.tripId]: [...existing, expense],
        },
      },
    }
  },

  update(state, expenseId, patch) {
    for (const [tripId, expenses] of Object.entries(state.expensesByTrip)) {
      const current = expenses.find((expense) => expense.id === expenseId)
      if (!current) continue

      const merged: Expense = {
        ...current,
        ...patch,
        amount: patch.amount === undefined ? current.amount : patch.amount,
        description: patch.description === undefined ? current.description : patch.description,
      }
      const fields = normaliseExpenseFields(merged)
      const updated: Expense = { ...merged, ...fields, updatedAt: nowISO() }

      return {
        ...state,
        expensesByTrip: {
          ...state.expensesByTrip,
          [tripId]: expenses.map((expense) => (expense.id === expenseId ? updated : expense)),
        },
      }
    }

    return state
  },

  remove(state, tripId, expenseId) {
    const existing = state.expensesByTrip[tripId] ?? []
    return {
      ...state,
      expensesByTrip: {
        ...state.expensesByTrip,
        [tripId]: existing.filter((expense) => expense.id !== expenseId),
      },
    }
  },
}
