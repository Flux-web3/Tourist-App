import { addDays, todayISO } from '@/domain/format'
import { STORAGE_KEY, createGuestUser } from '@/services/persistence'
import { STORAGE_VERSION, type PersistedState } from '@/services/contracts'
import type {
  Expense,
  GenerationState,
  ItineraryDay,
  ItineraryItem,
  Trip,
  TripNote,
  User,
} from '@/domain/types'

export const FIXTURE_TRIP_ID = 'trip-fixture'
export const FIXTURE_USER_ID = 'user-fixture'

/**
 * Two days of draft stops: 4 on day one, 1 on day two, 129 EUR of estimates.
 *
 * `index` is 1-based, matching `buildItinerary` in `src/services/itineraryGenerator.ts`,
 * so every user-facing "Day N" label reads correctly.
 */
export const FIXTURE_DAY_ONE_DATE = addDays(todayISO(), 30)
export const FIXTURE_ITEM_COSTS = [30, 24, 18, 12, 45]
export const FIXTURE_ITINERARY_ESTIMATE = 129
export const FIXTURE_EXPENSE_TOTAL = 1385

export const FIXTURE_ITEM_TITLES = [
  'Morning at the Eiffel Tower',
  'Louvre highlights',
  'Seine riverside walk',
  'Dinner at a bistro',
  'Montmartre in the morning',
] as const

export const FIXTURE_EXPENSE_DESCRIPTIONS = [
  'Return flights, Lagos to Paris',
  'Apartment deposit, Le Marais',
  'Metro and bus passes',
  'Louvre tickets',
  'Dinner at a bistro',
] as const

const CREATED_AT = '2026-02-01T08:00:00.000Z'
const CATEGORIES: ItineraryItem['category'][] = [
  'sightseeing',
  'culture',
  'outdoors',
  'food',
  'sightseeing',
]

function makeItem(index: number, tripId: string, startTime: string): ItineraryItem {
  return {
    id: `item-${index + 1}`,
    tripId,
    title: FIXTURE_ITEM_TITLES[index],
    category: CATEGORIES[index],
    startTime,
    endTime: null,
    location: index === 0 ? 'Champ de Mars, Paris' : '',
    description: '',
    estimatedCost: FIXTURE_ITEM_COSTS[index],
    currency: 'EUR',
    source: index % 2 === 0 ? 'ai' : 'catalog',
    editedByUser: false,
    experienceId: null,
    notes: '',
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
  }
}

export function makeFixtureTrip(overrides: Partial<Trip> = {}): Trip {
  return {
    id: FIXTURE_TRIP_ID,
    userId: FIXTURE_USER_ID,
    name: 'Paris in the Spring',
    origin: 'Lagos, Nigeria',
    destination: 'Paris, France',
    startDate: FIXTURE_DAY_ONE_DATE,
    endDate: addDays(FIXTURE_DAY_ONE_DATE, 1),
    travelers: 2,
    budget: 2500,
    currency: 'EUR',
    interests: ['culture', 'food', 'relaxed'],
    pace: 'balanced',
    notes: 'Keep one day light so we can follow the weather.',
    status: 'itinerary_ready',
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    ...overrides,
  }
}

export function makeFixtureDays(
  tripId = FIXTURE_TRIP_ID,
  firstDate = FIXTURE_DAY_ONE_DATE,
): ItineraryDay[] {
  const first = makeItem(0, tripId, '09:00')
  const second = makeItem(1, tripId, '13:00')
  const third = makeItem(2, tripId, '16:00')
  const fourth = makeItem(3, tripId, '19:30')
  const fifth = makeItem(4, tripId, '09:30')
  return [
    {
      id: 'day-1',
      tripId,
      date: firstDate,
      index: 1,
      title: null,
      items: [first, second, third, fourth],
    },
    {
      id: 'day-2',
      tripId,
      date: addDays(firstDate, 1),
      index: 2,
      title: null,
      items: [fifth],
    },
  ]
}

export function makeFixtureExpenses(tripId = FIXTURE_TRIP_ID): Expense[] {
  const amounts = [780, 420, 45, 44, 96]
  const categories: Expense['category'][] = ['transport', 'stay', 'transport', 'activities', 'food']
  return FIXTURE_EXPENSE_DESCRIPTIONS.map((description, index) => ({
    id: `expense-${index + 1}`,
    tripId,
    description,
    amount: amounts[index],
    currency: 'EUR',
    category: categories[index],
    date: addDays(FIXTURE_DAY_ONE_DATE, index - 1),
    notes: '',
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
  }))
}

export const FIXTURE_NOTE_TITLES = ['Flight reference', 'Apartment key safe', 'Dinner booking'] as const

export function makeFixtureNotes(tripId = FIXTURE_TRIP_ID): TripNote[] {
  return FIXTURE_NOTE_TITLES.map((title, index) => ({
    id: `note-${index + 1}`,
    tripId,
    title,
    body: `Detail ${index + 1}\nSecond line ${index + 1}`,
    pinned: index === 0,
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
  }))
}

export function makeGeneration(overrides: Partial<GenerationState> = {}): GenerationState {
  return {
    status: 'idle',
    error: null,
    shouldFail: false,
    startedAt: null,
    completedAt: null,
    ...overrides,
  }
}

export interface FixtureOptions {
  /** Day one of the trip. Defaults to a fixed future date, never today or past. */
  firstDate?: string
  trip?: Partial<Trip>
  days?: ItineraryDay[]
  expenses?: Expense[]
  notes?: TripNote[]
  generation?: GenerationState
  user?: User
  extraTrips?: Trip[]
}

/**
 * A complete, valid `PersistedState` with fixed ids and amounts, so budgets
 * and counts are exact and nothing depends on a generated itinerary.
 */
export function fixtureState(options: FixtureOptions = {}): PersistedState {
  const {
    firstDate = FIXTURE_DAY_ONE_DATE,
    trip = {},
    days = makeFixtureDays(FIXTURE_TRIP_ID, firstDate),
    expenses = makeFixtureExpenses(),
    notes = makeFixtureNotes(),
    generation = makeGeneration(),
    user = createGuestUser({ id: FIXTURE_USER_ID, name: 'Adaeze N.' }),
    extraTrips = [],
  } = options

  return {
    version: STORAGE_VERSION,
    user,
    trips: [makeFixtureTrip({ ...trip, startDate: firstDate, endDate: addDays(firstDate, 1) }), ...extraTrips],
    daysByTrip: { [FIXTURE_TRIP_ID]: days },
    expensesByTrip: { [FIXTURE_TRIP_ID]: expenses },
    generation: { [FIXTURE_TRIP_ID]: generation },
    notesByTrip: { [FIXTURE_TRIP_ID]: notes },
    themePreference: 'system',
    hasDemoData: false,
  }
}

/** The same fixture, but starting today so "Next up today" is the correct branch. */
export function fixtureStateStartingToday(options: FixtureOptions = {}): PersistedState {
  return fixtureState({ ...options, firstDate: todayISO() })
}

export function readStoredState(): PersistedState {
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (raw === null) throw new Error('nothing was persisted')
  return JSON.parse(raw) as PersistedState
}
