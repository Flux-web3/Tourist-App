import { createId, nowISO } from '@/domain/ids'
import { addDays, todayISO } from '@/domain/format'
import { CURRENCIES } from '@/domain/money'
import { buildItinerary } from './itineraryGenerator'
import type {
  CurrencyCode,
  Expense,
  GenerationState,
  GenerationStatus,
  ItineraryCategory,
  ItineraryDay,
  ItineraryItem,
  ItineraryItemSource,
  ThemePreference,
  TravelInterest,
  TravelPace,
  Trip,
  TripNote,
  TripStatus,
  User,
} from '@/domain/types'
import { STORAGE_VERSION, type PersistedState } from './contracts'

const STORAGE_KEY = 'tourist.state.v1'

const TRAVEL_INTERESTS = [
  'culture',
  'food',
  'outdoors',
  'nightlife',
  'shopping',
  'relaxed',
] as const satisfies readonly TravelInterest[]

const TRAVEL_PACES = ['relaxed', 'balanced', 'packed'] as const satisfies readonly TravelPace[]

const TRIP_STATUSES = ['draft', 'itinerary_ready'] as const satisfies readonly TripStatus[]

const ITINERARY_CATEGORIES = [
  'food',
  'sightseeing',
  'culture',
  'outdoors',
  'shopping',
  'nightlife',
  'transit',
  'stay',
] as const satisfies readonly ItineraryCategory[]

const ITINERARY_SOURCES = ['ai', 'user', 'catalog'] as const satisfies readonly ItineraryItemSource[]

const EXPENSE_CATEGORIES = [
  'stay',
  'food',
  'transport',
  'activities',
  'shopping',
  'other',
] as const satisfies readonly Expense['category'][]

const THEME_PREFERENCES = ['light', 'dark', 'system'] as const satisfies readonly ThemePreference[]

const GENERATION_STATUSES = [
  'idle',
  'loading',
  'success',
  'error',
] as const satisfies readonly GenerationStatus[]

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isArrayOf<T>(value: unknown, guard: (entry: unknown) => entry is T): value is T[] {
  return Array.isArray(value) && value.every(guard)
}

function isBucketOf<T>(value: unknown, guard: (entry: unknown) => entry is T): value is Record<string, T[]> {
  return isRecord(value) && Object.values(value).every((entry) => isArrayOf(entry, guard))
}

function isMapOf<T>(value: unknown, guard: (entry: unknown) => entry is T): value is Record<string, T> {
  return isRecord(value) && Object.values(value).every(guard)
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

function isNullableString(value: unknown): value is string | null {
  return typeof value === 'string' || value === null
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isOneOf<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === 'string' && allowed.some((candidate) => candidate === value)
}

function isCurrency(value: unknown): value is CurrencyCode {
  return isString(value) && CURRENCIES.some((code) => code === value)
}

function isUser(value: unknown): value is User {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.name) &&
    isNullableString(value.email) &&
    typeof value.isGuest === 'boolean' &&
    isString(value.createdAt)
  )
}

function isTrip(value: unknown): value is Trip {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.userId) &&
    isString(value.name) &&
    isString(value.origin) &&
    isString(value.destination) &&
    isString(value.startDate) &&
    isString(value.endDate) &&
    isFiniteNumber(value.travelers) &&
    isFiniteNumber(value.budget) &&
    isCurrency(value.currency) &&
    isArrayOf(value.interests, (interest) => isOneOf(interest, TRAVEL_INTERESTS)) &&
    isOneOf(value.pace, TRAVEL_PACES) &&
    isString(value.notes) &&
    isOneOf(value.status, TRIP_STATUSES) &&
    isString(value.createdAt) &&
    isString(value.updatedAt)
  )
}

function isItineraryItem(value: unknown): value is ItineraryItem {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.tripId) &&
    isString(value.title) &&
    isOneOf(value.category, ITINERARY_CATEGORIES) &&
    isString(value.startTime) &&
    isNullableString(value.endTime) &&
    isString(value.location) &&
    isString(value.description) &&
    isFiniteNumber(value.estimatedCost) &&
    isOneOf(value.source, ITINERARY_SOURCES) &&
    typeof value.editedByUser === 'boolean' &&
    isNullableString(value.experienceId) &&
    isString(value.notes) &&
    isString(value.createdAt) &&
    isString(value.updatedAt)
  )
}

function isItineraryDay(value: unknown): value is ItineraryDay {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.tripId) &&
    isString(value.date) &&
    isFiniteNumber(value.index) &&
    isNullableString(value.title) &&
    isArrayOf(value.items, isItineraryItem)
  )
}

function isExpense(value: unknown): value is Expense {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.tripId) &&
    isString(value.description) &&
    isFiniteNumber(value.amount) &&
    isCurrency(value.currency) &&
    isOneOf(value.category, EXPENSE_CATEGORIES) &&
    isString(value.date) &&
    isString(value.notes) &&
    isString(value.createdAt) &&
    isString(value.updatedAt)
  )
}

function isGenerationState(value: unknown): value is GenerationState {
  return (
    isRecord(value) &&
    isOneOf(value.status, GENERATION_STATUSES) &&
    isNullableString(value.error) &&
    typeof value.shouldFail === 'boolean' &&
    isNullableString(value.startedAt) &&
    isNullableString(value.completedAt)
  )
}

function isTripNote(value: unknown): value is TripNote {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.tripId) &&
    isString(value.title) &&
    isString(value.body) &&
    typeof value.pinned === 'boolean' &&
    isString(value.createdAt) &&
    isString(value.updatedAt)
  )
}

/**
 * `notesByTrip` is deliberately accepted as absent. Snapshots written before
 * notes existed must still load, otherwise every returning traveller would
 * silently lose their trips and expenses to a validation failure.
 */
function isPersistedState(value: unknown): value is PersistedState {
  if (!isRecord(value)) return false
  return (
    value.version === STORAGE_VERSION &&
    isUser(value.user) &&
    isArrayOf(value.trips, isTrip) &&
    isBucketOf(value.daysByTrip, isItineraryDay) &&
    isBucketOf(value.expensesByTrip, isExpense) &&
    (value.notesByTrip === undefined || isBucketOf(value.notesByTrip, isTripNote)) &&
    isMapOf(value.generation, isGenerationState) &&
    isOneOf(value.themePreference, THEME_PREFERENCES) &&
    typeof value.hasDemoData === 'boolean'
  )
}

/** Fills in keys added after a snapshot was written, without touching real data. */
function normaliseState(state: PersistedState): PersistedState {
  return { ...state, notesByTrip: state.notesByTrip ?? {} }
}

export function createGuestUser(overrides: Partial<User> = {}): User {
  return {
    id: createId('usr'),
    name: 'Adaeze N.',
    email: null,
    isGuest: true,
    createdAt: nowISO(),
    ...overrides,
  }
}

export function createEmptyState(user: User = createGuestUser()): PersistedState {
  return {
    version: STORAGE_VERSION,
    user,
    trips: [],
    daysByTrip: {},
    expensesByTrip: {},
    notesByTrip: {},
    generation: {},
    themePreference: 'system',
    hasDemoData: false,
  }
}

function idleGeneration(): GenerationState {
  return {
    status: 'idle',
    error: null,
    shouldFail: false,
    startedAt: null,
    completedAt: null,
  }
}

export const DEMO_TRIP_ID = 'trip_demo_paris'

function buildDemoTrip(user: User): {
  trip: Trip
  days: ItineraryDay[]
  expenses: Expense[]
  notes: TripNote[]
} {
  const startDate = todayISO()
  const endDate = addDays(startDate, 6)
  const timestamp = nowISO()

  const trip: Trip = {
    id: DEMO_TRIP_ID,
    userId: user.id,
    name: 'Paris in the Spring',
    origin: 'Lagos, Nigeria',
    destination: 'Paris, France',
    startDate,
    endDate,
    travelers: 2,
    budget: 2500,
    currency: 'EUR',
    interests: ['culture', 'food', 'relaxed'],
    pace: 'balanced',
    notes: 'Keep one day light so we can follow the weather.',
    status: 'itinerary_ready',
    createdAt: timestamp,
    updatedAt: timestamp,
  }

  const days = buildItinerary(trip, 0, timestamp)

  const expenses: Expense[] = [
    {
      id: createId('exp'),
      tripId: trip.id,
      description: 'Return flights, Lagos to Paris',
      amount: 780,
      currency: 'EUR',
      category: 'transport',
      date: addDays(startDate, -21),
      notes: 'Booked and paid before departure.',
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: createId('exp'),
      tripId: trip.id,
      description: 'Apartment deposit, Le Marais',
      amount: 420,
      currency: 'EUR',
      category: 'stay',
      date: addDays(startDate, -14),
      notes: 'Deposit taken on the apartment in Le Marais.',
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: createId('exp'),
      tripId: trip.id,
      description: 'Metro and bus passes',
      amount: 45,
      currency: 'EUR',
      category: 'transport',
      date: startDate,
      notes: 'Weekly passes for the whole trip.',
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: createId('exp'),
      tripId: trip.id,
      description: 'Louvre tickets',
      amount: 44,
      currency: 'EUR',
      category: 'activities',
      date: addDays(startDate, 1),
      notes: 'Two timed entries, Denon wing.',
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: createId('exp'),
      tripId: trip.id,
      description: 'Dinner at a bistro',
      amount: 96,
      currency: 'EUR',
      category: 'food',
      date: addDays(startDate, 1),
      notes: 'Two covers, no dessert. Slightly over budget.',
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ]

  const notes: TripNote[] = [
    {
      id: createId('not'),
      tripId: trip.id,
      title: 'Flight reference',
      body: 'PC 1044, departs 09:40 from LOS.\nSeat 14A and 14B. Two checked bags already paid for, so keep the allowance for souvenirs.',
      pinned: true,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: createId('not'),
      tripId: trip.id,
      title: 'Before we go',
      body: 'Notify the Le Marais apartment about the late arrival.\n\nTop up the metro card at the airport rather than in the city centre - it is cheaper and there is no queue.',
      pinned: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ]

  return { trip, days, expenses, notes }
}

export function createDemoState(user: User = createGuestUser()): PersistedState {
  const { trip, days, expenses, notes } = buildDemoTrip(user)
  return {
    version: STORAGE_VERSION,
    user,
    trips: [trip],
    daysByTrip: { [trip.id]: days },
    expensesByTrip: { [trip.id]: expenses },
    notesByTrip: { [trip.id]: notes },
    generation: { [trip.id]: idleGeneration() },
    themePreference: 'system',
    hasDemoData: true,
  }
}

export function createPersistenceService(): {
  load(): PersistedState | null
  save(state: PersistedState): void
  clear(): void
} {
  return {
    load() {
      if (typeof window === 'undefined' || !window.localStorage) return null
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY)
        if (!raw) return null
        const parsed: unknown = JSON.parse(raw)
        return isPersistedState(parsed) ? normaliseState(parsed) : null
      } catch {
        return null
      }
    },
    save(state) {
      if (typeof window === 'undefined' || !window.localStorage) return
      if (!isPersistedState(state)) {
        if (import.meta.env.DEV) {
          console.warn('[persistence] refusing to save a state that is not a valid payload')
        }
        return
      }
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normaliseState(state)))
      } catch (error) {
        if (import.meta.env.DEV) {
          console.warn('[persistence] unable to save state', error)
        }
      }
    },
    clear() {
      if (typeof window === 'undefined' || !window.localStorage) return
      try {
        window.localStorage.removeItem(STORAGE_KEY)
      } catch {
        /* prototype: nothing to recover from */
      }
    },
  }
}

export { STORAGE_KEY }
