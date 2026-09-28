import { estimateTotal } from '@/domain/itinerary'
import { summariseBudget, type BudgetSummary } from '@/domain/money'
import type { Expense, ItineraryDay, ItineraryItem, Trip, TripNote } from '@/domain/types'
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

export function selectExpensesByCategory(
  expenses: readonly Expense[],
): Array<{ category: Expense['category']; total: number; count: number }> {
  const buckets = new Map<Expense['category'], { category: Expense['category']; total: number; count: number }>()
  for (const expense of expenses) {
    const existing = buckets.get(expense.category) ?? { category: expense.category, total: 0, count: 0 }
    existing.total = Math.round((existing.total + expense.amount) * 100) / 100
    existing.count += 1
    buckets.set(expense.category, existing)
  }
  return [...buckets.values()].sort((a, b) => b.total - a.total)
}

export function selectBudget(state: PersistedState, trip: Trip | null): BudgetSummary | null {
  if (!trip) return null
  const days = selectDays(state, trip.id)
  const expenses = selectExpenses(state, trip.id)
  return summariseBudget({
    tripBudget: trip.budget,
    itineraryEstimates: days.flatMap((day) => day.items.map((item) => item.estimatedCost)),
    expenseAmounts: expenses.map((expense) => expense.amount),
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
    itineraryEstimate: estimateTotal(days),
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
