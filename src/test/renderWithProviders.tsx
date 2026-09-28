import type { ReactElement, ReactNode } from 'react'
import { render, type RenderOptions, type RenderResult } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { TouristProvider } from '@/state/TouristProvider'
import {
  STORAGE_KEY,
  createDemoState,
  createEmptyState,
  createGuestUser,
} from '@/services/persistence'
import type { PersistedState } from '@/services/contracts'
import type { User } from '@/domain/types'

export const TEST_TRIP_ID = 'trip-under-test'
export const THEME_KEY = 'tourist.theme'

/**
 * Demo state re-keyed onto a stable trip id so route-based assertions and
 * `useParams` lookups stay deterministic.
 */
export function demoStateFor(tripId: string = TEST_TRIP_ID, user?: User): PersistedState {
  const base = createDemoState(user)
  const [trip] = base.trips
  const days = base.daysByTrip[trip.id] ?? []
  const expenses = base.expensesByTrip[trip.id] ?? []
  const generation = base.generation[trip.id]
  return {
    ...base,
    trips: [{ ...trip, id: tripId }],
    daysByTrip: {
      [tripId]: days.map((day) => ({
        ...day,
        tripId,
        items: day.items.map((item) => ({ ...item, tripId })),
      })),
    },
    expensesByTrip: {
      [tripId]: expenses.map((expense) => ({ ...expense, tripId })),
    },
    generation: generation ? { [tripId]: generation } : {},
  }
}

export interface ProviderRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  route?: string
  user?: User
  state?: PersistedState
}

/**
 * Seeds `tourist.state.v1` then renders inside a memory router and the real
 * provider, so pages hydrate from exactly the state a test declares.
 */
export function renderWithProviders(
  ui: ReactElement,
  { route = '/', user, state, ...options }: ProviderRenderOptions = {},
): RenderResult {
  const resolvedUser = user ?? state?.user ?? createGuestUser()
  const persisted = state ?? createEmptyState(resolvedUser)
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted))

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <MemoryRouter initialEntries={[route]}>
        <TouristProvider>{children}</TouristProvider>
      </MemoryRouter>
    )
  }

  return render(ui, { wrapper: Wrapper, ...options })
}
