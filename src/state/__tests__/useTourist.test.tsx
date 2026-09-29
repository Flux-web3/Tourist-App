import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  Expense,
  GenerationState,
  ItineraryDay,
  ItineraryItem,
  Trip,
  User,
} from '@/domain/types'
import { STORAGE_VERSION, type PersistedState } from '@/services/contracts'
import { TouristProvider } from '@/state/TouristProvider'
import {
  useActions,
  useAppState,
  useGeneration,
  useTheme,
  useTourist,
  useTrip,
  useTripBudget,
  useTripDays,
  useTripExpenses,
  useTrips,
} from '@/state/useTourist'

const STATE_KEY = 'tourist.state.v1'

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
    endDate: '2026-04-02',
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

function makeItem(tripId: string, id: string, overrides: Partial<ItineraryItem> = {}): ItineraryItem {
  return {
    id,
    tripId,
    title: `Item ${id}`,
    category: 'sightseeing',
    startTime: '09:00',
    endTime: '10:00',
    location: 'Somewhere',
    description: 'A description',
    estimatedCost: 25,
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
  return { id: `${tripId}_d${index}`, tripId, date: `2026-04-0${index}`, index, title: null, items }
}

function makeExpense(tripId: string, id: string, overrides: Partial<Expense> = {}): Expense {
  return {
    id,
    tripId,
    description: `Expense ${id}`,
    amount: 100,
    currency: 'EUR',
    category: 'food',
    date: '2026-04-01',
    notes: '',
    createdAt: '2026-01-03T00:00:00.000Z',
    updatedAt: '2026-01-03T00:00:00.000Z',
    ...overrides,
  }
}

const TRIP_OLD = makeTrip()
const TRIP_NEW = makeTrip({
  id: 'trip_2',
  name: 'A second trip',
  startDate: '2026-05-01',
  endDate: '2026-05-01',
  budget: 800,
  createdAt: '2026-02-01T00:00:00.000Z',
  updatedAt: '2026-02-01T00:00:00.000Z',
})

const DAYS: ItineraryDay[] = [
  makeDay(TRIP_OLD.id, 1, [
    makeItem(TRIP_OLD.id, 'itm_a1', { estimatedCost: 19.99, startTime: '08:00' }),
    makeItem(TRIP_OLD.id, 'itm_a2', { estimatedCost: 0.1, startTime: '10:00' }),
  ]),
  makeDay(TRIP_OLD.id, 2, []),
]

const EXPENSES: Expense[] = [
  makeExpense(TRIP_OLD.id, 'exp_1', { amount: 100.25, date: '2026-04-02' }),
  makeExpense(TRIP_OLD.id, 'exp_2', { amount: 0.2, date: '2026-04-01' }),
]

const GENERATION: GenerationState = {
  status: 'success',
  error: null,
  startedAt: '2026-01-02T00:00:00.000Z',
  completedAt: '2026-01-02T00:00:02.000Z',
}

function seedState(state: PersistedState): void {
  window.localStorage.setItem(STATE_KEY, JSON.stringify(state))
}

function makeState(): PersistedState {
  return {
    version: STORAGE_VERSION,
    user: { ...USER },
    trips: [TRIP_OLD, TRIP_NEW],
    daysByTrip: { [TRIP_OLD.id]: DAYS, [TRIP_NEW.id]: [] },
    expensesByTrip: { [TRIP_OLD.id]: EXPENSES, [TRIP_NEW.id]: [] },
    generation: { [TRIP_OLD.id]: GENERATION },
    themePreference: 'system',
    hasDemoData: true,
  }
}

function wrapper({ children }: { children: ReactNode }) {
  return <TouristProvider>{children}</TouristProvider>
}

beforeEach(() => {
  seedState(makeState())
})

describe('useTourist', () => {
  it('throws when it is called outside a provider', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    expect(() => renderHook(() => useTourist())).toThrow(
      'useTourist must be used inside <TouristProvider>.',
    )
    consoleError.mockRestore()
  })

  it('returns the whole context value inside a provider', () => {
    const { result } = renderHook(() => useTourist(), { wrapper })
    expect(result.current.hydrated).toBe(true)
    expect(result.current.state.hydrated).toBe(true)
    expect(result.current.state.trips).toHaveLength(2)
    expect(typeof result.current.actions.createTrip).toBe('function')
    expect(typeof result.current.actions.generateItinerary).toBe('function')
    expect(result.current.pendingItemId).toBeNull()
    expect(result.current.swapError).toBeNull()
  })
})

describe('useTrips', () => {
  it('returns the trip list newest first', () => {
    const { result } = renderHook(() => useTrips(), { wrapper })
    expect(result.current.map((trip) => trip.id)).toEqual([TRIP_NEW.id, TRIP_OLD.id])
    expect(result.current).toHaveLength(2)
  })

  it('returns an empty list when the store has no trips', () => {
    window.localStorage.setItem(
      STATE_KEY,
      JSON.stringify({ ...makeState(), trips: [], daysByTrip: {}, expensesByTrip: {} }),
    )
    const { result } = renderHook(() => useTrips(), { wrapper })
    expect(result.current).toEqual([])
  })
})

describe('useTrip', () => {
  it('returns the trip for a known id', () => {
    const { result } = renderHook(() => useTrip(TRIP_OLD.id), { wrapper })
    expect(result.current?.id).toBe(TRIP_OLD.id)
    expect(result.current?.name).toBe('Spring in Paris')
  })

  it('returns null for an unknown id and for no id', () => {
    const { result } = renderHook(
      () => ({
        unknown: useTrip('trip_missing'),
        missing: useTrip(undefined),
        empty: useTrip(''),
      }),
      { wrapper },
    )
    expect(result.current.unknown).toBeNull()
    expect(result.current.missing).toBeNull()
    expect(result.current.empty).toBeNull()
  })
})

describe('useTripDays', () => {
  it('returns the days for a known trip', () => {
    const { result } = renderHook(() => useTripDays(TRIP_OLD.id), { wrapper })
    expect(result.current).toHaveLength(2)
    expect(result.current[0].items).toHaveLength(2)
    expect(result.current[1].items).toHaveLength(0)
  })

  it('returns an empty list for an unknown trip and for no id', () => {
    const { result } = renderHook(
      () => ({
        unknown: useTripDays('trip_missing'),
        missing: useTripDays(undefined),
        emptyDays: useTripDays(TRIP_NEW.id),
      }),
      { wrapper },
    )
    expect(result.current.unknown).toEqual([])
    expect(result.current.missing).toEqual([])
    expect(result.current.emptyDays).toEqual([])
  })
})

describe('useTripExpenses', () => {
  it('returns the expenses for a known trip in date order', () => {
    const { result } = renderHook(() => useTripExpenses(TRIP_OLD.id), { wrapper })
    expect(result.current.map((expense) => expense.id)).toEqual(['exp_1', 'exp_2'])
    expect(result.current).toHaveLength(2)
  })

  it('returns an empty list for an unknown trip and for no id', () => {
    const { result } = renderHook(
      () => ({
        unknown: useTripExpenses('trip_missing'),
        missing: useTripExpenses(undefined),
        noExpenses: useTripExpenses(TRIP_NEW.id),
      }),
      { wrapper },
    )
    expect(result.current.unknown).toEqual([])
    expect(result.current.missing).toEqual([])
    expect(result.current.noExpenses).toEqual([])
  })
})

describe('useTripBudget', () => {
  it('returns a summary that agrees with the raw data for a known trip', () => {
    const { result } = renderHook(() => useTripBudget(TRIP_OLD.id), { wrapper })
    expect(result.current?.tripBudget).toBe(1000)
    expect(result.current?.itineraryEstimate).toBe(20.09)
    expect(result.current?.actualSpent).toBe(100.45)
    expect(result.current?.remaining).toBe(899.55)
    expect(result.current?.isOverBudget).toBe(false)
    expect(result.current?.currency).toBe('EUR')
  })

  it('returns a summary for a trip that has no days or expenses yet', () => {
    const { result } = renderHook(() => useTripBudget(TRIP_NEW.id), { wrapper })
    expect(result.current?.tripBudget).toBe(800)
    expect(result.current?.itineraryEstimate).toBe(0)
    expect(result.current?.actualSpent).toBe(0)
    expect(result.current?.remaining).toBe(800)
  })

  it('returns null for an unknown trip and for no id', () => {
    const { result } = renderHook(
      () => ({ unknown: useTripBudget('trip_missing'), missing: useTripBudget(undefined) }),
      { wrapper },
    )
    expect(result.current.unknown).toBeNull()
    expect(result.current.missing).toBeNull()
  })
})

describe('useGeneration', () => {
  it('returns the stored generation state for a known trip', () => {
    const { result } = renderHook(() => useGeneration(TRIP_OLD.id), { wrapper })
    expect(result.current.status).toBe('success')
    expect(result.current.error).toBeNull()
    expect(result.current.startedAt).toBe('2026-01-02T00:00:00.000Z')
    expect(result.current.completedAt).toBe('2026-01-02T00:00:02.000Z')
  })

  it('returns an idle state for an unknown trip and for no id', () => {
    const { result } = renderHook(
      () => ({
        unknown: useGeneration('trip_missing'),
        missing: useGeneration(undefined),
      }),
      { wrapper },
    )
    expect(result.current.unknown).toEqual({
      status: 'idle',
      error: null,
      startedAt: null,
      completedAt: null,
    })
    expect(result.current.missing).toEqual(result.current.unknown)
  })
})

describe('useAppState, useActions and useTheme', () => {
  it('exposes the same state and action object as the context', () => {
    const { result } = renderHook(
      () => {
        const context = useTourist()
        return {
          state: useAppState(),
          actions: useActions(),
          contextState: context.state,
          contextActions: context.actions,
        }
      },
      { wrapper },
    )
    expect(result.current.state).toBe(result.current.contextState)
    expect(result.current.actions).toBe(result.current.contextActions)
  })

  it('reports the theme preference and can change it', () => {
    const { result } = renderHook(() => useTheme(), { wrapper })
    expect(result.current.preference).toBe('system')
    act(() => {
      result.current.setPreference('dark')
    })
    expect(result.current.preference).toBe('dark')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })

  it('reflects a mutation made through the actions in the trip hooks', () => {
    const { result } = renderHook(
      () => ({
        expenses: useTripExpenses(TRIP_OLD.id),
        budget: useTripBudget(TRIP_OLD.id),
        actions: useActions(),
      }),
      { wrapper },
    )
    expect(result.current.expenses).toHaveLength(2)
    act(() => {
      result.current.actions.addExpense({
        tripId: TRIP_OLD.id,
        description: 'Croissant',
        amount: 0.1,
        category: 'food',
        date: '2026-04-02',
        notes: '',
      })
    })
    expect(result.current.expenses).toHaveLength(3)
    expect(result.current.budget?.actualSpent).toBe(100.55)
  })
})
