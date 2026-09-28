import { act, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  Expense,
  GenerationState,
  ItineraryDay,
  ItineraryItem,
  Trip,
  TripDraft,
  User,
} from '@/domain/types'
import { createEmptyDraft } from '@/domain/validation'
import { STORAGE_VERSION, type PersistedState } from '@/services/contracts'
import { selectBudget, selectTrip } from '@/state/selectors'
import type { TouristContextValue } from '@/state/touristContext'
import { TouristProvider } from '@/state/TouristProvider'
import { useTourist } from '@/state/useTourist'

const STATE_KEY = 'tourist.state.v1'
const THEME_KEY = 'tourist.theme'
const FIXED_NOW = new Date('2026-03-10T09:00:00.000Z')
const TRIP_ID = 'trip_1'

const USER: User = {
  id: 'usr_1',
  name: 'Adaeze N.',
  email: null,
  isGuest: true,
  createdAt: '2026-01-01T00:00:00.000Z',
}

function makeTrip(overrides: Partial<Trip> = {}): Trip {
  return {
    id: TRIP_ID,
    userId: USER.id,
    name: 'Spring in Paris',
    origin: 'Lagos, Nigeria',
    destination: 'Paris, France',
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
    category: 'culture',
    startTime: '09:00',
    endTime: '10:00',
    location: 'Somewhere',
    description: 'A description',
    estimatedCost: 25,
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

function idleGeneration(): GenerationState {
  return { status: 'idle', error: null, shouldFail: false, startedAt: null, completedAt: null }
}

const SEEDED_DAYS: ItineraryDay[] = [
  makeDay(TRIP_ID, 1, [
    makeItem(TRIP_ID, 'itm_a', { startTime: '08:00' }),
    makeItem(TRIP_ID, 'itm_b', { startTime: '10:00' }),
  ]),
  makeDay(TRIP_ID, 2, [makeItem(TRIP_ID, 'itm_c', { startTime: '09:00' })]),
]

const SEEDED_EXPENSES: Expense[] = [makeExpense(TRIP_ID, 'exp_a')]

function emptyState(): PersistedState {
  return {
    version: STORAGE_VERSION,
    user: { ...USER },
    trips: [],
    daysByTrip: {},
    expensesByTrip: {},
    generation: {},
    themePreference: 'system',
    hasDemoData: false,
  }
}

function seededState(): PersistedState {
  return {
    version: STORAGE_VERSION,
    user: { ...USER },
    trips: [makeTrip()],
    daysByTrip: { [TRIP_ID]: SEEDED_DAYS },
    expensesByTrip: { [TRIP_ID]: SEEDED_EXPENSES },
    generation: { [TRIP_ID]: idleGeneration() },
    themePreference: 'system',
    hasDemoData: false,
  }
}

function seedState(state: PersistedState): void {
  window.localStorage.setItem(STATE_KEY, JSON.stringify(state))
}

function readStored(): PersistedState {
  const raw = window.localStorage.getItem(STATE_KEY)
  if (raw === null) throw new Error('nothing was persisted')
  return JSON.parse(raw) as PersistedState
}

function parisDraft(overrides: Partial<TripDraft> = {}): TripDraft {
  return {
    ...createEmptyDraft(),
    name: 'Paris trip',
    origin: 'Lagos, Nigeria',
    destination: 'Paris, France',
    startDate: '2026-05-01',
    endDate: '2026-05-03',
    interests: ['culture', 'food'],
    ...overrides,
  }
}

const api: { current: TouristContextValue | null } = { current: null }

function Harness() {
  api.current = useTourist()
  return null
}

function renderProvider() {
  return render(
    <TouristProvider>
      <Harness />
    </TouristProvider>,
  )
}

function ctx(): TouristContextValue {
  if (!api.current) throw new Error('the harness is not mounted')
  return api.current
}

function generationFor(tripId: string): GenerationState {
  return ctx().state.generation[tripId] ?? idleGeneration()
}

function allIds(days: ItineraryDay[]): string[] {
  return days.flatMap((day) => day.items.map((item) => item.id))
}

function allTitles(days: ItineraryDay[]): string[] {
  return days.flatMap((day) => day.items.map((item) => item.title))
}

async function settle(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

afterEach(() => {
  vi.useRealTimers()
  api.current = null
})

describe('TouristProvider session', () => {
  it('hydrates the demo trip when the store is empty', () => {
    vi.useFakeTimers({ now: FIXED_NOW })
    renderProvider()
    const state = ctx().state
    expect(ctx().hydrated).toBe(true)
    expect(state.hydrated).toBe(true)
    expect(state.user.isGuest).toBe(true)
    expect(state.hasDemoData).toBe(true)
    expect(state.trips).toHaveLength(1)
    expect(state.trips[0].name).toBe('Paris in the Spring')
    expect(state.trips[0].startDate).toBe('2026-03-10')
    expect(state.daysByTrip[state.trips[0].id]).toHaveLength(7)
    expect(state.expensesByTrip[state.trips[0].id]).toHaveLength(5)
    expect(readStored().trips[0].id).toBe(state.trips[0].id)
  })

  it('hydrates the stored payload instead of the demo when the key is present', () => {
    seedState(seededState())
    renderProvider()
    expect(ctx().state.trips).toHaveLength(1)
    expect(ctx().state.trips[0].id).toBe(TRIP_ID)
    expect(ctx().state.daysByTrip[TRIP_ID]).toHaveLength(2)
    expect(ctx().state.hasDemoData).toBe(false)
  })

  it('signs a guest in and returns to a guest on sign out', () => {
    seedState(emptyState())
    renderProvider()
    const guestId = ctx().state.user.id
    expect(ctx().state.user.isGuest).toBe(true)

    act(() => {
      ctx().actions.signIn({ name: '  Ada Lovelace  ', email: 'ada@example.com' })
    })
    expect(ctx().state.user.isGuest).toBe(false)
    expect(ctx().state.user.name).toBe('Ada Lovelace')
    expect(ctx().state.user.email).toBe('ada@example.com')
    expect(ctx().state.user.id).toBe(guestId)
    expect(readStored().user.isGuest).toBe(false)

    act(() => {
      ctx().actions.signOut()
    })
    expect(ctx().state.user.isGuest).toBe(true)
    expect(ctx().state.user.email).toBeNull()
    expect(ctx().state.user.name).toBe('Ada Lovelace')
    expect(ctx().state.user.id).toBe(guestId)
  })

  it('keeps the guest name when a sign in has no usable name', () => {
    seedState(emptyState())
    renderProvider()
    act(() => {
      ctx().actions.signIn({ name: '   ', email: null })
    })
    expect(ctx().state.user.isGuest).toBe(false)
    expect(ctx().state.user.name).toBe(USER.name)
  })
})

describe('TouristProvider trips', () => {
  it('creates a trip and lands one day per date in the range', () => {
    vi.useFakeTimers({ now: FIXED_NOW })
    seedState(emptyState())
    renderProvider()

    let createdId = ''
    act(() => {
      createdId = ctx().actions.createTrip(
        parisDraft({ endDate: '2026-05-04', budget: 2500, travelers: 3 }),
      ).id
    })

    const state = ctx().state
    expect(state.trips).toHaveLength(1)
    expect(state.trips[0].id).toBe(createdId)
    expect(state.trips[0].name).toBe('Paris trip')
    expect(state.trips[0].travelers).toBe(3)
    expect(state.trips[0].budget).toBe(2500)
    expect(state.trips[0].status).toBe('draft')
    expect(state.trips[0].userId).toBe(USER.id)
    expect(state.daysByTrip[createdId]).toHaveLength(4)
    expect(state.daysByTrip[createdId].map((day) => day.date)).toEqual([
      '2026-05-01',
      '2026-05-02',
      '2026-05-03',
      '2026-05-04',
    ])
    expect(state.daysByTrip[createdId].map((day) => day.index)).toEqual([1, 2, 3, 4])
    expect(state.expensesByTrip[createdId]).toEqual([])
    expect(state.generation[createdId].status).toBe('idle')
  })

  it('names an unnamed trip from its destination and start month', () => {
    vi.useFakeTimers({ now: FIXED_NOW })
    seedState(emptyState())
    renderProvider()
    act(() => {
      ctx().actions.createTrip(parisDraft({ name: '   ', destination: 'Lisbon, Portugal' }))
    })
    expect(ctx().state.trips[0].name).toBe('Lisbon, Portugal in May')
  })

  it('reflows the days on update while keeping user, catalog and edited items', async () => {
    vi.useFakeTimers({ now: FIXED_NOW })
    seedState(emptyState())
    renderProvider()

    let tripId = ''
    act(() => {
      tripId = ctx().actions.createTrip(parisDraft()).id
    })
    let generation: Promise<void> | null = null
    act(() => {
      generation = ctx().actions.generateItinerary(tripId)
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500)
      await generation
    })

    const before = ctx().state.daysByTrip[tripId]
    const firstDay = before[0]
    const aiIds = firstDay.items.map((item) => item.id)
    expect(aiIds.length).toBeGreaterThanOrEqual(2)

    act(() => {
      ctx().actions.editItem(tripId, aiIds[0], { title: 'My hand-picked museum' })
    })
    let customId = ''
    act(() => {
      customId =
        ctx().actions.addCustomItem(
          tripId,
          {
            title: 'Sunday market',
            category: 'food',
            startTime: '08:00',
            endTime: null,
            location: 'Le Marais',
            description: 'Produce and coffee',
            estimatedCost: 12,
            notes: '',
          },
          { dayId: firstDay.id, position: 0 },
        )?.id ?? ''
    })
    let catalogId = ''
    await act(async () => {
      catalogId =
        (await ctx().actions.addExperienceToTrip(tripId, 'exp_eiffel_tower', {
          dayId: firstDay.id,
          position: 0,
        }))?.id ?? ''
    })

    act(() => {
      ctx().actions.updateTrip(tripId, { endDate: '2026-05-05' })
    })

    const after = ctx().state.daysByTrip[tripId]
    expect(after).toHaveLength(5)
    expect(after[4].date).toBe('2026-05-05')
    expect(after[4].index).toBe(5)
    const ids = allIds(after)
    expect(ids).toContain(aiIds[0])
    expect(ids).toContain(customId)
    expect(ids).toContain(catalogId)
    expect(ids).not.toContain(aiIds[1])
    expect(allTitles(after)).toContain('My hand-picked museum')
    expect(allTitles(after)).toContain('Sunday market')
    expect(allTitles(after)).toContain('Eiffel Tower Summit')
    const preserved = after[0].items.filter((item) => item.source !== 'ai')
    expect(preserved.map((item) => item.source).sort()).toEqual(['catalog', 'user'])
  })

  it('keeps the days untouched for an update that does not reflow', () => {
    seedState(seededState())
    renderProvider()
    const mounted = ctx().state.daysByTrip[TRIP_ID]
    act(() => {
      ctx().actions.updateTrip(TRIP_ID, { name: '  Renamed trip  ', budget: 1500 })
    })
    expect(ctx().state.trips[0].name).toBe('Renamed trip')
    expect(ctx().state.trips[0].budget).toBe(1500)
    expect(ctx().state.daysByTrip[TRIP_ID]).toBe(mounted)
  })

  it('deletes a trip together with its days, expenses and generation state', () => {
    seedState(seededState())
    renderProvider()
    act(() => {
      ctx().actions.addExpense({
        tripId: TRIP_ID,
        description: 'Coffee',
        amount: 4.5,
        category: 'food',
        date: '2026-04-01',
        notes: '',
      })
    })
    expect(ctx().state.expensesByTrip[TRIP_ID]).toHaveLength(2)

    act(() => {
      ctx().actions.deleteTrip(TRIP_ID)
    })

    expect(ctx().state.trips).toEqual([])
    expect(ctx().state.daysByTrip[TRIP_ID]).toBeUndefined()
    expect(ctx().state.expensesByTrip[TRIP_ID]).toBeUndefined()
    expect(ctx().state.generation[TRIP_ID]).toBeUndefined()
    expect(ctx().state.user.id).toBe(USER.id)
    const stored = readStored()
    expect(stored.trips).toEqual([])
    expect(stored.daysByTrip).toEqual({})
    expect(stored.expensesByTrip).toEqual({})
    expect(stored.generation).toEqual({})
  })

  it('ignores an update for a trip that does not exist', () => {
    seedState(seededState())
    renderProvider()
    const before = ctx().state
    act(() => {
      ctx().actions.updateTrip('trip_missing', { name: 'Nope' })
    })
    expect(ctx().state).toEqual(before)
    act(() => {
      ctx().actions.deleteTrip('trip_missing')
    })
    expect(ctx().state).toEqual(before)
    expect(ctx().state.trips).toHaveLength(1)
    expect(ctx().state.trips[0].name).toBe('Spring in Paris')
  })
})

describe('TouristProvider generation', () => {
  it('moves from idle to loading to success and fills the days', async () => {
    vi.useFakeTimers({ now: FIXED_NOW })
    seedState(emptyState())
    renderProvider()

    let tripId = ''
    act(() => {
      tripId = ctx().actions.createTrip(parisDraft()).id
    })
    expect(generationFor(tripId).status).toBe('idle')

    let pending: Promise<void> | null = null
    act(() => {
      pending = ctx().actions.generateItinerary(tripId)
    })
    const loading = generationFor(tripId)
    expect(loading.status).toBe('loading')
    expect(loading.error).toBeNull()
    expect(loading.startedAt).not.toBeNull()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500)
      await pending
    })

    const done = generationFor(tripId)
    expect(done.status).toBe('success')
    expect(done.error).toBeNull()
    expect(done.completedAt).not.toBeNull()
    expect(done.startedAt ?? '').not.toBe('')
    expect((done.completedAt ?? '') >= (done.startedAt ?? '')).toBe(true)
    expect(ctx().state.daysByTrip[tripId]).toHaveLength(3)
    expect(allIds(ctx().state.daysByTrip[tripId]).length).toBeGreaterThan(0)
    expect(ctx().state.trips[0].status).toBe('itinerary_ready')
  })

  it('reaches the error state and leaves the generated days alone', async () => {
    vi.useFakeTimers({ now: FIXED_NOW })
    seedState(emptyState())
    renderProvider()

    let tripId = ''
    act(() => {
      tripId = ctx().actions.createTrip(parisDraft()).id
    })
    let pending: Promise<void> | null = null
    act(() => {
      pending = ctx().actions.generateItinerary(tripId)
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500)
      await pending
    })
    expect(generationFor(tripId).status).toBe('success')
    const daysBefore = ctx().state.daysByTrip[tripId]
    const itemsBefore = allIds(daysBefore)

    act(() => {
      ctx().actions.setSimulateFailure(tripId, true)
    })
    expect(generationFor(tripId).shouldFail).toBe(true)

    act(() => {
      pending = ctx().actions.generateItinerary(tripId)
    })
    expect(generationFor(tripId).status).toBe('loading')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500)
      await pending
    })

    const failed = generationFor(tripId)
    expect(failed.status).toBe('error')
    expect(failed.error).not.toBeNull()
    expect(failed.error?.length ?? 0).toBeGreaterThan(0)
    expect(failed.completedAt).not.toBeNull()
    expect(ctx().state.daysByTrip[tripId]).toBe(daysBefore)
    expect(allIds(ctx().state.daysByTrip[tripId])).toEqual(itemsBefore)
  })

  it('retries a failed generation back to success', async () => {
    vi.useFakeTimers({ now: FIXED_NOW })
    seedState(seededState())
    renderProvider()

    act(() => {
      ctx().actions.setSimulateFailure(TRIP_ID, true)
    })
    let pending: Promise<void> | null = null
    act(() => {
      pending = ctx().actions.generateItinerary(TRIP_ID)
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500)
      await pending
    })
    expect(generationFor(TRIP_ID).status).toBe('error')

    act(() => {
      pending = ctx().actions.retryGeneration(TRIP_ID)
    })
    const retrying = generationFor(TRIP_ID)
    expect(retrying.status).toBe('loading')
    expect(retrying.shouldFail).toBe(false)
    expect(retrying.error).toBeNull()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500)
      await pending
    })

    const recovered = generationFor(TRIP_ID)
    expect(recovered.status).toBe('success')
    expect(recovered.error).toBeNull()
    expect(recovered.completedAt).not.toBeNull()
    expect(ctx().state.daysByTrip[TRIP_ID]).toHaveLength(2)
    expect(allIds(ctx().state.daysByTrip[TRIP_ID]).length).toBeGreaterThan(0)
  })

  it('does nothing for a trip that does not exist', async () => {
    vi.useFakeTimers({ now: FIXED_NOW })
    seedState(seededState())
    renderProvider()
    const before = ctx().state
    await act(async () => {
      await ctx().actions.generateItinerary('trip_missing')
    })
    await settle(1500)
    expect(ctx().state).toBe(before)
    expect(ctx().state.generation.trip_missing).toBeUndefined()
  })
})

describe('TouristProvider itinerary items', () => {
  it('edits exactly one item and marks it edited', () => {
    seedState(seededState())
    renderProvider()
    const before = ctx().state.daysByTrip[TRIP_ID]
    const target = before[0].items[0]
    const sibling = before[0].items[1]

    act(() => {
      ctx().actions.editItem(TRIP_ID, target.id, { title: 'Renamed stop', estimatedCost: 99.5 })
    })

    const after = ctx().state.daysByTrip[TRIP_ID]
    const edited = after[0].items[0]
    expect(after[0].items).toHaveLength(2)
    expect(edited.id).toBe(target.id)
    expect(edited.title).toBe('Renamed stop')
    expect(edited.estimatedCost).toBe(99.5)
    expect(edited.editedByUser).toBe(true)
    expect(edited.source).toBe('ai')
    expect(edited.tripId).toBe(TRIP_ID)
    expect(edited.updatedAt).not.toBe(edited.createdAt)
    expect(after[0].items[1]).toBe(sibling)
    expect(after[1]).toBe(before[1])
    expect(before[0].items[0].title).toBe(target.title)
  })

  it('finds an item and ignores an edit for one that is missing', () => {
    seedState(seededState())
    renderProvider()
    const located = ctx().actions.getItem(TRIP_ID, 'itm_b')
    expect(located?.item.id).toBe('itm_b')
    expect(located?.day.id).toBe(`${TRIP_ID}_d1`)
    expect(ctx().actions.getItem(TRIP_ID, 'itm_missing')).toBeNull()
    expect(ctx().actions.getItem('trip_missing', 'itm_b')).toBeNull()

    const before = ctx().state.daysByTrip[TRIP_ID]
    act(() => {
      ctx().actions.editItem(TRIP_ID, 'itm_missing', { title: 'Nothing' })
    })
    expect(ctx().state.daysByTrip[TRIP_ID]).toBe(before)
  })

  it('swaps one item, leaves the siblings identical and clears pendingItemId', async () => {
    vi.useFakeTimers({ now: FIXED_NOW })
    seedState(seededState())
    renderProvider()
    const before = ctx().state.daysByTrip[TRIP_ID]
    const target = before[0].items[0]
    const sibling = before[0].items[1]
    const otherDay = before[1]

    let pending: Promise<void> | null = null
    act(() => {
      pending = ctx().actions.replaceItem(TRIP_ID, target.id)
    })
    expect(ctx().pendingItemId).toBe(target.id)
    expect(ctx().swapError).toBeNull()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(800)
      await pending
    })

    const after = ctx().state.daysByTrip[TRIP_ID]
    const swapped = after[0].items[0]
    expect(after[0].items).toHaveLength(2)
    expect(swapped.id).toBe(target.id)
    expect(swapped.tripId).toBe(TRIP_ID)
    expect(swapped.title).not.toBe(target.title)
    expect(swapped.editedByUser).toBe(true)
    expect(swapped.startTime).toBe(target.startTime)
    expect(after[0].items[1]).toBe(sibling)
    expect(after[1]).toBe(otherDay)
    expect(ctx().pendingItemId).toBeNull()
    expect(ctx().swapError).toBeNull()
  })

  it('surfaces a swap error and leaves the item unchanged when the suggestion fails', async () => {
    vi.useFakeTimers({ now: FIXED_NOW })
    seedState(seededState())
    renderProvider()
    act(() => {
      ctx().actions.setSimulateFailure(TRIP_ID, true)
    })
    const before = ctx().state.daysByTrip[TRIP_ID]
    const target = before[0].items[0]

    let pending: Promise<void> | null = null
    act(() => {
      pending = ctx().actions.replaceItem(TRIP_ID, target.id)
    })
    expect(ctx().pendingItemId).toBe(target.id)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(800)
      await pending
    })

    expect(ctx().swapError).not.toBeNull()
    expect(ctx().swapError?.length ?? 0).toBeGreaterThan(0)
    expect(ctx().pendingItemId).toBeNull()
    expect(ctx().state.daysByTrip[TRIP_ID]).toBe(before)
    expect(ctx().state.daysByTrip[TRIP_ID][0].items[0]).toBe(target)

    act(() => {
      ctx().actions.dismissSwapError()
    })
    expect(ctx().swapError).toBeNull()
    expect(ctx().state.daysByTrip[TRIP_ID]).toBe(before)
  })

  it('removes exactly one item', () => {
    seedState(seededState())
    renderProvider()
    const before = ctx().state.daysByTrip[TRIP_ID]
    act(() => {
      ctx().actions.removeItem(TRIP_ID, 'itm_a')
    })
    const after = ctx().state.daysByTrip[TRIP_ID]
    expect(after[0].items).toHaveLength(1)
    expect(after[0].items[0].id).toBe('itm_b')
    expect(after[1]).toBe(before[1])
    expect(allIds(after)).toEqual(['itm_b', 'itm_c'])
  })

  it('moves exactly one item to another day', () => {
    seedState(seededState())
    renderProvider()
    const before = ctx().state.daysByTrip[TRIP_ID]
    act(() => {
      ctx().actions.moveItem(TRIP_ID, 'itm_b', `${TRIP_ID}_d2`, 0)
    })
    const after = ctx().state.daysByTrip[TRIP_ID]
    expect(after[0].items.map((item) => item.id)).toEqual(['itm_a'])
    expect(after[1].items.map((item) => item.id)).toEqual(['itm_b', 'itm_c'])
    expect(after[1].items[0]).toBe(before[0].items[1])
    expect(after[0].items[0]).toBe(before[0].items[0])
  })

  it('inserts a custom item at the chosen day and position', () => {
    seedState(seededState())
    renderProvider()
    const before = ctx().state.daysByTrip[TRIP_ID]
    const day = before[0]

    let createdId = ''
    act(() => {
      createdId =
        ctx().actions.addCustomItem(
          TRIP_ID,
          {
            title: '  Sunday market  ',
            category: 'food',
            startTime: '',
            endTime: null,
            location: '  Le Marais  ',
            description: '  Produce and coffee  ',
            estimatedCost: -5,
            notes: '  Bring a bag  ',
          },
          { dayId: day.id, position: 1 },
        )?.id ?? ''
    })

    const after = ctx().state.daysByTrip[TRIP_ID]
    const created = after[0].items[1]
    expect(createdId).not.toBe('')
    expect(created.id).toBe(createdId)
    expect(after[0].items).toHaveLength(3)
    expect(created.title).toBe('Sunday market')
    expect(created.location).toBe('Le Marais')
    expect(created.description).toBe('Produce and coffee')
    expect(created.notes).toBe('Bring a bag')
    expect(created.estimatedCost).toBe(0)
    expect(created.source).toBe('user')
    expect(created.editedByUser).toBe(false)
    expect(created.experienceId).toBeNull()
    expect(created.tripId).toBe(TRIP_ID)
    expect(created.startTime).toBe('11:30')
    expect(created.endTime).toBeNull()
    expect(after[0].items[0]).toBe(day.items[0])
    expect(after[0].items[2]).toBe(day.items[1])
    expect(after[1]).toBe(before[1])
  })

  it('appends a custom item when no position is given', () => {
    seedState(seededState())
    renderProvider()
    const day = ctx().state.daysByTrip[TRIP_ID][0]
    act(() => {
      ctx().actions.addCustomItem(
        TRIP_ID,
        {
          title: 'Last stop',
          category: 'nightlife',
          startTime: '20:00',
          endTime: '22:00',
          location: 'Oberkampf',
          description: 'A late set',
          estimatedCost: 35,
          notes: '',
        },
        { dayId: day.id },
      )
    })
    const items = ctx().state.daysByTrip[TRIP_ID][0].items
    expect(items).toHaveLength(3)
    expect(items[2].title).toBe('Last stop')
    expect(items[2].startTime).toBe('20:00')
    expect(items[2].endTime).toBe('22:00')
  })

  it('returns null for a custom item on a day that does not exist', () => {
    seedState(seededState())
    renderProvider()
    const before = ctx().state.daysByTrip[TRIP_ID]
    let created: ItineraryItem | null = null
    act(() => {
      created = ctx().actions.addCustomItem(
        TRIP_ID,
        {
          title: 'Nowhere',
          category: 'food',
          startTime: '10:00',
          endTime: null,
          location: '',
          description: '',
          estimatedCost: 0,
          notes: '',
        },
        { dayId: 'day_missing' },
      )
    })
    expect(created).toBeNull()
    expect(ctx().state.daysByTrip[TRIP_ID]).toBe(before)
  })

  it('adds a catalog experience, keeps the rest of the day and returns the item', async () => {
    seedState(seededState())
    renderProvider()
    const before = ctx().state.daysByTrip[TRIP_ID]
    const day = before[0]

    const box: { created: ItineraryItem | null } = { created: null }
    await act(async () => {
      box.created = await ctx().actions.addExperienceToTrip(TRIP_ID, 'exp_eiffel_tower', {
        dayId: day.id,
        position: 0,
        startTime: '16:00',
      })
    })

    const after = ctx().state.daysByTrip[TRIP_ID]
    const inserted = after[0].items[0]
    expect(box.created).not.toBeNull()
    expect(inserted.id).toBe(box.created?.id)
    expect(after[0].items).toHaveLength(3)
    expect(inserted.title).toBe('Eiffel Tower Summit')
    expect(inserted.source).toBe('catalog')
    expect(inserted.experienceId).toBe('exp_eiffel_tower')
    expect(inserted.category).toBe('sightseeing')
    expect(inserted.estimatedCost).toBe(29)
    expect(inserted.location).toBe('7th arrondissement, Paris')
    expect(inserted.startTime).toBe('16:00')
    expect(inserted.endTime).toBe('18:30')
    expect(inserted.editedByUser).toBe(false)
    expect(after[0].items[1]).toBe(day.items[0])
    expect(after[0].items[2]).toBe(day.items[1])
    expect(after[1]).toBe(before[1])
    expect(ctx().state.trips[0].status).toBe('itinerary_ready')
    expect(selectBudget(ctx().state, selectTrip(ctx().state, TRIP_ID))?.itineraryEstimate).toBe(104)
  })

  it('returns null for an unknown experience or an unknown day', async () => {
    seedState(seededState())
    renderProvider()
    const before = ctx().state.daysByTrip[TRIP_ID]
    let created: ItineraryItem | null = null
    await act(async () => {
      created = await ctx().actions.addExperienceToTrip(TRIP_ID, 'exp_missing', {
        dayId: before[0].id,
      })
    })
    expect(created).toBeNull()
    await act(async () => {
      created = await ctx().actions.addExperienceToTrip(TRIP_ID, 'exp_eiffel_tower', {
        dayId: 'day_missing',
      })
    })
    expect(created).toBeNull()
    expect(ctx().state.daysByTrip[TRIP_ID]).toBe(before)
  })
})

describe('TouristProvider expenses', () => {
  it('adds, updates and removes expenses without float drift', () => {
    seedState(seededState())
    renderProvider()

    let firstId = ''
    act(() => {
      firstId =
        ctx().actions.addExpense({
          tripId: TRIP_ID,
          description: '  Croissant  ',
          amount: 0.1,
          category: 'food',
          date: '2026-04-01',
          notes: '',
        })?.id ?? ''
    })
    let secondId = ''
    act(() => {
      secondId =
        ctx().actions.addExpense({
          tripId: TRIP_ID,
          description: 'Coffee',
          amount: 0.2,
          category: 'food',
          date: '2026-04-02',
          notes: '',
        })?.id ?? ''
    })

    expect(ctx().state.expensesByTrip[TRIP_ID]).toHaveLength(3)
    const budget = selectBudget(ctx().state, selectTrip(ctx().state, TRIP_ID))
    expect(budget?.actualSpent).toBe(100.3)
    expect(budget?.remaining).toBe(899.7)
    expect(ctx().state.expensesByTrip[TRIP_ID][1].description).toBe('Croissant')

    act(() => {
      ctx().actions.updateExpense(firstId, { amount: 15.5, description: 'Lunch', category: 'food' })
    })
    const updated = ctx().state.expensesByTrip[TRIP_ID].find((expense) => expense.id === firstId)
    expect(updated?.amount).toBe(15.5)
    expect(updated?.description).toBe('Lunch')
    expect(updated?.tripId).toBe(TRIP_ID)
    expect(selectBudget(ctx().state, selectTrip(ctx().state, TRIP_ID))?.actualSpent).toBe(115.7)

    act(() => {
      ctx().actions.removeExpense(TRIP_ID, secondId)
    })
    expect(ctx().state.expensesByTrip[TRIP_ID].map((expense) => expense.id)).toEqual([
      'exp_a',
      firstId,
    ])
    expect(selectBudget(ctx().state, selectTrip(ctx().state, TRIP_ID))?.actualSpent).toBe(115.5)
  })

  it('keeps both expenses when two are added in the same React batch', () => {
    seedState(seededState())
    renderProvider()
    act(() => {
      ctx().actions.addExpense({
        tripId: TRIP_ID,
        description: 'First',
        amount: 1,
        category: 'food',
        date: '2026-04-01',
        notes: '',
      })
      ctx().actions.addExpense({
        tripId: TRIP_ID,
        description: 'Second',
        amount: 2,
        category: 'food',
        date: '2026-04-01',
        notes: '',
      })
    })
    const descriptions = ctx().state.expensesByTrip[TRIP_ID].map((expense) => expense.description)
    expect(descriptions).toEqual(['Expense exp_a', 'First', 'Second'])
  })

  it('takes the currency from the trip and returns null for an unknown trip', () => {
    seedState(seededState())
    renderProvider()
    const box: { added: Expense | null } = { added: null }
    act(() => {
      box.added = ctx().actions.addExpense({
        tripId: 'trip_missing',
        description: 'Nothing',
        amount: 5,
        category: 'other',
        date: '2026-04-01',
        notes: '',
      })
    })
    expect(box.added).toBeNull()
    act(() => {
      box.added = ctx().actions.addExpense({
        tripId: TRIP_ID,
        description: 'Metro',
        amount: 12.345,
        category: 'transport',
        date: '2026-04-01',
        notes: '',
      })
    })
    expect(box.added?.currency).toBe('EUR')
    expect(box.added?.amount).toBe(12.35)
  })
})

describe('TouristProvider persistence', () => {
  it('writes the whole state to localStorage after a mutation', () => {
    vi.useFakeTimers({ now: FIXED_NOW })
    seedState(emptyState())
    renderProvider()
    let tripId = ''
    act(() => {
      tripId = ctx().actions.createTrip(parisDraft()).id
    })

    const stored = readStored()
    expect(stored.version).toBe(STORAGE_VERSION)
    expect('hydrated' in stored).toBe(false)
    expect(stored.trips).toHaveLength(1)
    expect(stored.trips[0].id).toBe(tripId)
    expect(stored.daysByTrip[tripId]).toHaveLength(3)
    expect(stored.expensesByTrip[tripId]).toEqual([])
    expect(stored.user.id).toBe(USER.id)
    expect(stored.themePreference).toBe('system')
  })

  it('hands a freshly mounted provider the payload it stored', () => {
    seedState(seededState())
    const first = renderProvider()
    expect(ctx().state.trips[0].id).toBe(TRIP_ID)

    act(() => {
      ctx().actions.addExpense({
        tripId: TRIP_ID,
        description: 'Ferry ticket',
        amount: 18.5,
        category: 'activities',
        date: '2026-04-01',
        notes: '',
      })
    })
    expect(readStored().expensesByTrip[TRIP_ID]).toHaveLength(2)

    first.unmount()
    api.current = null
    renderProvider()

    expect(ctx().state.hydrated).toBe(true)
    expect(ctx().state.trips).toHaveLength(1)
    expect(ctx().state.trips[0].id).toBe(TRIP_ID)
    expect(ctx().state.daysByTrip[TRIP_ID]).toHaveLength(2)
    expect(ctx().state.expensesByTrip[TRIP_ID].map((expense) => expense.description)).toEqual([
      'Expense exp_a',
      'Ferry ticket',
    ])
    expect(selectBudget(ctx().state, selectTrip(ctx().state, TRIP_ID))?.actualSpent).toBe(118.5)
  })

  it('loads the demo trip from an empty store', () => {
    vi.useFakeTimers({ now: FIXED_NOW })
    seedState(emptyState())
    renderProvider()
    expect(ctx().state.trips).toEqual([])

    act(() => {
      ctx().actions.loadDemoData()
    })

    const state = ctx().state
    const trip = state.trips[0]
    expect(state.hasDemoData).toBe(true)
    expect(state.trips).toHaveLength(1)
    expect(trip.name).toBe('Paris in the Spring')
    expect(trip.destination).toBe('Paris, France')
    expect(trip.status).toBe('itinerary_ready')
    expect(trip.startDate).toBe('2026-03-10')
    expect(trip.endDate).toBe('2026-03-16')
    expect(state.daysByTrip[trip.id]).toHaveLength(7)
    expect(state.daysByTrip[trip.id].map((day) => day.date)).toEqual([
      '2026-03-10',
      '2026-03-11',
      '2026-03-12',
      '2026-03-13',
      '2026-03-14',
      '2026-03-15',
      '2026-03-16',
    ])
    expect(state.expensesByTrip[trip.id]).toHaveLength(5)
    expect(state.user.id).toBe(USER.id)
    expect(readStored().hasDemoData).toBe(true)
    expect(readStored().trips[0].id).toBe(trip.id)
  })

  it('adds the demo trip to a populated store without touching the traveller data', () => {
    vi.useFakeTimers({ now: FIXED_NOW })
    seedState(seededState())
    renderProvider()
    const before = ctx().state

    act(() => {
      ctx().actions.loadDemoData()
    })

    const state = ctx().state
    const demoTrip = state.trips[1]
    expect(state.hasDemoData).toBe(true)
    expect(state.trips).toHaveLength(2)
    expect(demoTrip.name).toBe('Paris in the Spring')
    expect(before.trips[0].id).toBe(TRIP_ID)

    expect(state.daysByTrip[TRIP_ID]).toBe(before.daysByTrip[TRIP_ID])
    expect(state.expensesByTrip[TRIP_ID]).toBe(before.expensesByTrip[TRIP_ID])
    expect(state.daysByTrip[demoTrip.id]).toHaveLength(7)
    expect(state.expensesByTrip[demoTrip.id]).toHaveLength(5)
    expect(state.notesByTrip?.[demoTrip.id]?.length ?? 0).toBeGreaterThan(0)

    expect(readStored().trips.map((trip) => trip.id)).toEqual([TRIP_ID, demoTrip.id])
    expect(readStored().daysByTrip[TRIP_ID]).toBeDefined()
  })

  it('keeps the traveller theme when the demo is added', () => {
    vi.useFakeTimers({ now: FIXED_NOW })
    seedState(seededState())
    window.localStorage.setItem(THEME_KEY, 'dark')
    renderProvider()
    expect(ctx().state.themePreference).toBe('dark')

    act(() => {
      ctx().actions.loadDemoData()
    })

    expect(ctx().state.themePreference).toBe('dark')
  })

  it('does not add a second demo trip when one is already loaded', () => {
    vi.useFakeTimers({ now: FIXED_NOW })
    seedState(emptyState())
    renderProvider()

    act(() => {
      ctx().actions.loadDemoData()
    })
    const demoId = ctx().state.trips[0].id

    act(() => {
      ctx().actions.loadDemoData()
    })

    expect(ctx().state.trips).toHaveLength(1)
    expect(ctx().state.trips[0].id).toBe(demoId)
  })

  it('clears every trip and empties the stored payload', () => {
    vi.useFakeTimers({ now: FIXED_NOW })
    seedState(seededState())
    renderProvider()
    act(() => {
      ctx().actions.clearAllData()
    })

    const state = ctx().state
    expect(state.trips).toEqual([])
    expect(state.daysByTrip).toEqual({})
    expect(state.expensesByTrip).toEqual({})
    expect(state.generation).toEqual({})
    expect(state.hasDemoData).toBe(false)
    expect(state.user.id).toBe(USER.id)
    expect(state.themePreference).toBe('system')

    const stored = readStored()
    expect(stored.trips).toEqual([])
    expect(stored.daysByTrip).toEqual({})
    expect(stored.expensesByTrip).toEqual({})
    expect(stored.generation).toEqual({})
    expect(stored.hasDemoData).toBe(false)
  })
})

describe('TouristProvider theme', () => {
  it('applies the resolved theme to the document and persists the preference', () => {
    seedState(emptyState())
    renderProvider()
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    expect(document.documentElement.getAttribute('data-theme-preference')).toBe('system')

    act(() => {
      ctx().actions.setThemePreference('dark')
    })
    expect(ctx().state.themePreference).toBe('dark')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    expect(document.documentElement.getAttribute('data-theme-preference')).toBe('dark')
    expect(window.localStorage.getItem(THEME_KEY)).toBe('dark')
    expect(readStored().themePreference).toBe('dark')

    act(() => {
      ctx().actions.setThemePreference('light')
    })
    expect(ctx().state.themePreference).toBe('light')
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    expect(window.localStorage.getItem(THEME_KEY)).toBe('light')
  })

  it('resolves the system preference against the media query on mount', () => {
    seedState(emptyState())
    renderProvider()
    act(() => {
      ctx().actions.setThemePreference('system')
    })
    expect(ctx().state.themePreference).toBe('system')
    expect(document.documentElement.getAttribute('data-theme-preference')).toBe('system')
    expect(['light', 'dark']).toContain(document.documentElement.getAttribute('data-theme'))
  })

  it('adopts the stored theme preference on mount', () => {
    window.localStorage.setItem(THEME_KEY, 'dark')
    seedState(emptyState())
    renderProvider()
    expect(ctx().state.themePreference).toBe('dark')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    expect(document.documentElement.getAttribute('data-theme-preference')).toBe('dark')
  })

  it('keeps the theme across a data reset', () => {
    vi.useFakeTimers({ now: FIXED_NOW })
    seedState(seededState())
    renderProvider()
    act(() => {
      ctx().actions.setThemePreference('dark')
    })
    expect(ctx().state.themePreference).toBe('dark')
    act(() => {
      ctx().actions.clearAllData()
    })
    expect(ctx().state.themePreference).toBe('dark')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    act(() => {
      ctx().actions.loadDemoData()
    })
    expect(ctx().state.themePreference).toBe('dark')
  })

  it('keeps the theme change when a reset is batched with it', () => {
    vi.useFakeTimers({ now: FIXED_NOW })
    seedState(seededState())
    renderProvider()
    act(() => {
      ctx().actions.setThemePreference('dark')
      ctx().actions.clearAllData()
    })
    expect(ctx().state.trips).toEqual([])
    expect(ctx().state.themePreference).toBe('dark')
  })
})

describe('TouristProvider catalog reads', () => {
  it('resolves experiences without changing the store', async () => {
    seedState(seededState())
    renderProvider()
    const before = ctx().state

    await act(async () => {
      const found = await ctx().actions.getExperience('exp_eiffel_tower')
      expect(found?.name).toBe('Eiffel Tower Summit')
      expect(found?.city).toBe('Paris')
      expect(await ctx().actions.getExperience('exp_missing')).toBeNull()
      const results = await ctx().actions.searchExperiences({
        text: 'Eiffel',
        category: 'all',
        maxPrice: null,
      })
      expect(results.length).toBeGreaterThan(0)
      expect(results[0].id).toBe('exp_eiffel_tower')
      const filtered = await ctx().actions.searchExperiences({
        text: '',
        category: 'food',
        maxPrice: null,
      })
      expect(filtered.length).toBeGreaterThan(0)
      expect(filtered.every((experience) => experience.category === 'food')).toBe(true)
    })

    act(() => {
      ctx().actions.trackSearch({ text: '  museum  ', category: 'culture', maxPrice: 20 })
    })
    expect(ctx().state).toBe(before)
  })
})
