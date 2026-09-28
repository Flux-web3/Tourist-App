import { useContext, useMemo } from 'react'
import { selectBudget, selectDays, selectExpenses, selectTrip, selectTrips } from './selectors'
import { TouristContext, type TouristContextValue } from './touristContext'
import type { BudgetSummary } from '@/domain/money'
import type { Expense, ItineraryDay, Trip } from '@/domain/types'
import type { TouristState } from './touristReducer'

export function useTourist(): TouristContextValue {
  const context = useContext(TouristContext)
  if (!context) {
    throw new Error('useTourist must be used inside <TouristProvider>.')
  }
  return context
}

export function useAppState(): TouristState {
  return useTourist().state
}

export function useActions() {
  return useTourist().actions
}

export function useTheme() {
  const { state, actions } = useTourist()
  return { preference: state.themePreference, setPreference: actions.setThemePreference }
}

export function useTrips(): Trip[] {
  const state = useAppState()
  return useMemo(() => selectTrips(state), [state])
}

export function useTrip(tripId: string | undefined): Trip | null {
  const state = useAppState()
  return useMemo(() => selectTrip(state, tripId), [state, tripId])
}

export function useTripDays(tripId: string | undefined): ItineraryDay[] {
  const state = useAppState()
  return useMemo(() => selectDays(state, tripId), [state, tripId])
}

export function useTripExpenses(tripId: string | undefined): Expense[] {
  const state = useAppState()
  return useMemo(() => selectExpenses(state, tripId), [state, tripId])
}

export function useTripBudget(tripId: string | undefined): BudgetSummary | null {
  const state = useAppState()
  const trip = useTrip(tripId)
  return useMemo(() => selectBudget(state, trip), [state, trip])
}

export function useGeneration(tripId: string | undefined) {
  const state = useAppState()
  return state.generation[tripId ?? ''] ?? {
    status: 'idle' as const,
    error: null,
    shouldFail: false,
    startedAt: null,
    completedAt: null,
  }
}
