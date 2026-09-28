import { estimateTotal } from '@/domain/itinerary'
import { fromCents, summariseBudget, toCents, type BudgetSummary } from '@/domain/money'
import type {
  CurrencyCode,
  Expense,
  ItineraryDay,
  ItineraryItem,
  Trip,
  TripNote,
} from '@/domain/types'
import type { PersistedState } from '@/services/contracts'

export function selectTrip(state: PersistedState, tripId: string | undefined): Trip | null {
  if (!tripId) return null
  return state.trips.find((trip) => trip.id === tripId) ?? null
}

export function selectTrips(state: PersistedState): Trip[] {
  return [...state.trips].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export function selectDays(state: PersistedState, tripId: string | undefined): ItineraryDay[] {
  if (!tripId) return []
  return state.daysByTrip[tripId] ?? []
}

export function selectExpenses(state: PersistedState, tripId: string | undefined): Expense[] {
  if (!tripId) return []
  return [...(state.expensesByTrip[tripId] ?? [])].sort((a, b) => {
    if (a.date !== b.date) return b.date.localeCompare(a.date)
    return b.createdAt.localeCompare(a.createdAt)
  })
}

/**
 * Breaks `actualSpent` down by category.
 *
 * Only expenses logged in `currency` are grouped, which is exactly the rule
 * `summariseBudget` applies to `actualSpent`, so the rows add up to that figure
 * to the minor unit. An expense in another currency is left out rather than
 * converted or folded in under the wrong symbol; the budget summary reports it
 * through `mixedCurrency` / `otherCurrencies` / `uncountedExpenseCount`.
 *
 * The running totals are integer minor units on the currency's own scale —
 * hundredths for EUR, whole yen for JPY — and are converted back once.
 * Accumulating in major units and re-rounding after every addition loses whole
 * cents on amounts the float representation cannot hold.
 *
 * `currency` is required on purpose: a caller that forgot it would get the old
 * behaviour of adding every currency together.
 */
export function selectExpensesByCategory(
  expenses: readonly Expense[],
  currency: CurrencyCode,
): Array<{ category: Expense['category']; total: number; count: number }> {
  const buckets = new Map<Expense['category'], { category: Expense['category']; cents: number; count: number }>()
  for (const expense of expenses) {
    if (expense.currency !== currency) continue
    const existing = buckets.get(expense.category) ?? { category: expense.category, cents: 0, count: 0 }
    existing.cents += toCents(expense.amount, currency)
    existing.count += 1
    buckets.set(expense.category, existing)
  }
  return [...buckets.values()]
    .sort((a, b) => b.cents - a.cents)
    .map(({ category, cents, count }) => ({ category, total: fromCents(cents, currency), count }))
}

/**
 * Each expense carries the currency it was logged in, and so does each planned
 * stop. Switching a trip's currency does not rewrite either. The codes therefore
 * travel with the amounts so the summary can total only what is genuinely in the
 * trip currency and report the rest instead of silently mixing scales.
 *
 * Both lists are derived from one flattened array rather than two independent
 * `flatMap` passes, because `summariseBudget` reads them positionally: the
 * amounts and their codes have to be in the same order by construction, not by
 * coincidence.
 */
export function selectBudget(state: PersistedState, trip: Trip | null): BudgetSummary | null {
  if (!trip) return null
  const items = selectDays(state, trip.id).flatMap((day) => day.items)
  const expenses = selectExpenses(state, trip.id)
  return summariseBudget({
    tripBudget: trip.budget,
    itineraryEstimates: items.map((item) => item.estimatedCost),
    itineraryEstimateCurrencies: items.map((item) => item.currency),
    expenseAmounts: expenses.map((expense) => expense.amount),
    expenseCurrencies: expenses.map((expense) => expense.currency),
    currency: trip.currency,
  })
}

export function selectTripSummary(state: PersistedState, trip: Trip): {
  trip: Trip
  dayCount: number
  itemCount: number
  itineraryEstimate: number
  actualSpent: number
  remaining: number
  days: ItineraryDay[]
  nextItem: ItineraryItem | null
} {
  const days = selectDays(state, trip.id)
  const budget = selectBudget(state, trip)
  const itemCount = days.reduce((total, day) => total + day.items.length, 0)
  return {
    trip,
    days,
    dayCount: days.length,
    itemCount,
    // On the trip's own currency, so a stop still priced in a currency the trip
    // has since moved away from is left out rather than folded in under the
    // wrong symbol.
    itineraryEstimate: estimateTotal(days, trip.currency),
    actualSpent: budget?.actualSpent ?? 0,
    remaining: budget?.remaining ?? trip.budget,
    nextItem: days.find((day) => day.items.length > 0)?.items[0] ?? null,
  }
}

export function selectHasData(state: PersistedState): boolean {
  return state.trips.length > 0
}

/**
 * Pinned notes first, then most recently touched. Ordering is stable because
 * `updatedAt` falls back to `createdAt` and the id breaks exact ties.
 */
export function selectNotes(state: PersistedState, tripId: string | undefined): TripNote[] {
  if (!tripId) return []
  return [...(state.notesByTrip?.[tripId] ?? [])].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
    const byTime = b.updatedAt.localeCompare(a.updatedAt)
    return byTime !== 0 ? byTime : b.id.localeCompare(a.id)
  })
}
