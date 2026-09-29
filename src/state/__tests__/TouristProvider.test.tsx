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
import {
  GENERATION_ERROR_MESSAGE,
  buildAlternativeItem,
  buildItinerary,
  services,
} from '@/services'
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
    category: 'culture',
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

function idleGeneration(): GenerationState {
  return { status: 'idle', error: null, startedAt: null, completedAt: null }
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
    destinationId: 'paris',
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
  it('starts a first-time traveller empty rather than seeding the demo trip', () => {
    vi.useFakeTimers({ now: FIXED_NOW })
    renderProvider()
    const state = ctx().state
    expect(ctx().hydrated).toBe(true)
    expect(state.hydrated).toBe(true)
    expect(state.user.isGuest).toBe(true)
    // Sample data must never arrive unasked: it would be indistinguishable
    // from the traveller's own trip.
    expect(state.hasDemoData).toBe(false)
    expect(state.trips).toEqual([])
    expect(state.daysByTrip).toEqual({})
    expect(state.expensesByTrip).toEqual({})
    expect(state.notesByTrip).toEqual({})
    expect(readStored().trips).toEqual([])
  })

  it('adds the demo trip only when the traveller explicitly asks for it', () => {
    vi.useFakeTimers({ now: FIXED_NOW })
    renderProvider()
    expect(ctx().state.trips).toEqual([])

    act(() => {
      ctx().actions.loadDemoData()
    })

    const state = ctx().state
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

  /**
   * `tripService.create` builds a notes bucket for the new trip, and the provider
   * used to drop it while copying the other four across.
   */
  it('registers the notes bucket the trip service built', () => {
    vi.useFakeTimers({ now: FIXED_NOW })
    seedState(emptyState())
    renderProvider()

    let createdId = ''
    act(() => {
      createdId = ctx().actions.createTrip(parisDraft()).id
    })

    expect(ctx().state.notesByTrip?.[createdId]).toEqual([])
    expect(readStored().notesByTrip?.[createdId]).toEqual([])
  })

  it('takes a note on a freshly created trip without a missing bucket', () => {
    vi.useFakeTimers({ now: FIXED_NOW })
    seedState(emptyState())
    renderProvider()

    let createdId = ''
    act(() => {
      createdId = ctx().actions.createTrip(parisDraft()).id
    })
    act(() => {
      ctx().actions.addNote({ tripId: createdId, title: 'Flight', body: 'PC 1044' })
    })

    expect(ctx().state.notesByTrip?.[createdId]).toHaveLength(1)
  })

  it('does not apply an update the domain validator refuses', () => {
    vi.useFakeTimers({ now: FIXED_NOW })
    seedState(seededState())
    renderProvider()
    const before = ctx().state

    act(() => {
      ctx().actions.updateTrip(TRIP_ID, { endDate: '2026-03-01' })
    })

    expect(ctx().state.trips[0].endDate).toBe(before.trips[0].endDate)
    expect(ctx().state.daysByTrip[TRIP_ID]).toBe(before.daysByTrip[TRIP_ID])
  })

  it('names an unnamed trip from its destination and start month', () => {
    vi.useFakeTimers({ now: FIXED_NOW })
    seedState(emptyState())
    renderProvider()
    act(() => {
      ctx().actions.createTrip(parisDraft({ name: '   ', destination: 'Rome, Italy', destinationId: 'rome' }))
    })
    expect(ctx().state.trips[0].name).toBe('Rome in May')
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
    // The switch is deliberately not part of the state any more, so its effect is
    // what gets asserted: the next run fails.
    expect(generationFor(tripId).shouldFail).toBeUndefined()

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

  it('turns a draft interrupted by a reload into a retryable error, not a spinner forever', async () => {
    vi.useFakeTimers({ now: FIXED_NOW })
    // What storage holds when the tab was closed or reloaded mid-draft.
    const interrupted = seededState()
    interrupted.generation[TRIP_ID] = {
      status: 'loading',
      error: null,
      startedAt: '2026-04-01T09:00:00.000Z',
      completedAt: null,
    }
    seedState(interrupted)
    const planBefore = allIds(interrupted.daysByTrip[TRIP_ID])
    renderProvider()

    const restored = generationFor(TRIP_ID)
    expect(restored.status).toBe('error')
    expect(restored.error).toMatch(/closed or reloaded.*not changed/)
    expect(readStored().generation[TRIP_ID].status).toBe('error')
    expect(allIds(ctx().state.daysByTrip[TRIP_ID])).toEqual(planBefore)

    let pending: Promise<void> | null = null
    act(() => {
      pending = ctx().actions.retryGeneration(TRIP_ID)
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500)
      await pending
    })
    expect(generationFor(TRIP_ID).status).toBe('success')
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
    const original = before[0].items[1]
    const moved = after[1].items[1]
    expect(after[0].items.map((item) => item.id)).toEqual(['itm_a'])
    expect(after[1].items.map((item) => item.id)).toEqual(['itm_c', 'itm_b'])
    // Moving a stop to another day is the traveller's decision, so it is marked
    // as theirs: otherwise the next regeneration would silently discard it.
    expect(moved).toEqual({ ...original, editedByUser: true, updatedAt: moved.updatedAt })
    expect(moved.updatedAt).not.toBe(original.updatedAt)
    // Everything that did not move keeps its identity.
    expect(after[0].items[0]).toBe(before[0].items[0])
    expect(after[1].items[0]).toBe(before[1].items[0])
  })

  /**
   * The requested index no longer wins over the clock: `itm_b` starts at 10:00
   * and `itm_c` at 09:00, so dropping it at slot 0 still leaves it second. A day
   * is rendered chronologically, so honouring the index literally would have put
   * a 10:00 stop above a 09:00 one.
   */
  it('keeps the receiving day chronological when the requested slot would not', () => {
    seedState(seededState())
    renderProvider()
    act(() => {
      ctx().actions.moveItem(TRIP_ID, 'itm_b', `${TRIP_ID}_d2`, 0)
    })
    const times = ctx().state.daysByTrip[TRIP_ID][1].items.map((item) => item.startTime)
    expect(times).toEqual(['09:00', '10:00'])
  })

  it('inserts a custom item on the chosen day, in its chronological slot', () => {
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
    // Requested slot 1, but its derived start time is 11:30 and the day already
    // holds 08:00 and 10:00, so chronological order puts it last.
    const created = after[0].items[2]
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
    expect(after[0].items[1]).toBe(day.items[1])
    expect(after[0].items.map((item) => item.startTime)).toEqual(['08:00', '10:00', '11:30'])
    expect(after[1]).toBe(before[1])
  })

  it('honours the requested slot among stops that share a start time', () => {
    seedState(seededState())
    renderProvider()
    const day = ctx().state.daysByTrip[TRIP_ID][0]

    act(() => {
      ctx().actions.addCustomItem(
        TRIP_ID,
        {
          title: 'Same slot',
          category: 'food',
          startTime: '08:00',
          endTime: null,
          location: '',
          description: '',
          estimatedCost: 0,
          notes: '',
        },
        { dayId: day.id, position: 0 },
      )
    })

    // 'Same slot' is a user item at 08:00, so the tie-break puts it above the
    // untouched 08:00 AI draft it was dropped in front of.
    expect(allTitles([ctx().state.daysByTrip[TRIP_ID][0]])).toEqual([
      'Same slot',
      'Item itm_a',
      'Item itm_b',
    ])
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
    // Requested slot 0, but a 16:00 stop belongs after the day's 08:00 and 10:00
    // ones, so it lands last rather than at the top of the day.
    const inserted = after[0].items[2]
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
    expect(after[0].items.map((item) => item.startTime)).toEqual(['08:00', '10:00', '16:00'])
    expect(after[0].items[0]).toBe(day.items[0])
    expect(after[0].items[1]).toBe(day.items[1])
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

  /**
   * The analytics log is in memory only, but it holds destinations and the
   * traveller's raw search text. "Clear all data" left it untouched, which made
   * the promise false.
   */
  it('clears the in-memory analytics log as well', () => {
    vi.useFakeTimers({ now: FIXED_NOW })
    seedState(seededState())
    renderProvider()

    act(() => {
      ctx().actions.trackSearch({ text: 'hidden bistro in Le Marais', category: 'food', destinationId: 'paris' })
    })
    expect(services.analytics.events().length).toBeGreaterThan(0)

    act(() => {
      ctx().actions.clearAllData()
    })

    expect(services.analytics.events()).toEqual([])
  })

  it('leaves no trace of the searched text behind', () => {
    vi.useFakeTimers({ now: FIXED_NOW })
    seedState(seededState())
    renderProvider()

    act(() => {
      ctx().actions.trackSearch({ text: 'hidden bistro in Le Marais', category: 'food', destinationId: 'paris' })
    })
    act(() => {
      ctx().actions.clearAllData()
    })

    expect(JSON.stringify(services.analytics.events())).not.toContain('Le Marais')
  })

  it('clears the demo flag when the demo trip is deleted', () => {
    vi.useFakeTimers({ now: FIXED_NOW })
    seedState(emptyState())
    renderProvider()
    act(() => {
      ctx().actions.loadDemoData()
    })
    const demoId = ctx().state.trips[0].id
    expect(ctx().state.hasDemoData).toBe(true)

    act(() => {
      ctx().actions.deleteTrip(demoId)
    })

    expect(ctx().state.hasDemoData).toBe(false)
    expect(readStored().hasDemoData).toBe(false)
  })

  it('lets the demo be loaded again after it was deleted', () => {
    vi.useFakeTimers({ now: FIXED_NOW })
    seedState(emptyState())
    renderProvider()
    act(() => {
      ctx().actions.loadDemoData()
    })
    const demoId = ctx().state.trips[0].id
    act(() => {
      ctx().actions.deleteTrip(demoId)
    })
    act(() => {
      ctx().actions.loadDemoData()
    })

    expect(ctx().state.trips).toHaveLength(1)
    expect(ctx().state.hasDemoData).toBe(true)
  })
})

/**
 * Generation is asynchronous, so the trip can be deleted or its dates changed
 * while a run is in flight. Both paths used to write `daysByTrip[tripId]` and
 * `generation[tripId]` back regardless, leaving either a permanent orphan or days
 * built for a date range the trip no longer had.
 */
describe('TouristProvider generation races', () => {
  it('writes nothing back when the trip is deleted mid-generation', async () => {
    vi.useFakeTimers({ now: FIXED_NOW })
    seedState(emptyState())
    renderProvider()

    let tripId = ''
    act(() => {
      tripId = ctx().actions.createTrip(parisDraft()).id
    })
    let pending: Promise<void> | null = null
    act(() => {
      pending = ctx().actions.generateItinerary(tripId, { regenerate: true })
    })
    act(() => {
      ctx().actions.deleteTrip(tripId)
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500)
      await pending
    })

    const state = ctx().state
    expect(state.trips).toEqual([])
    expect(state.daysByTrip[tripId]).toBeUndefined()
    expect(state.generation[tripId]).toBeUndefined()
    expect(readStored().daysByTrip[tripId]).toBeUndefined()
    expect(readStored().generation[tripId]).toBeUndefined()
  })

  it('writes no error record either when the trip is deleted mid-generation', async () => {
    vi.useFakeTimers({ now: FIXED_NOW })
    seedState(emptyState())
    renderProvider()

    let tripId = ''
    act(() => {
      tripId = ctx().actions.createTrip(parisDraft()).id
    })
    act(() => {
      ctx().actions.setSimulateFailure(tripId, true)
    })
    let pending: Promise<void> | null = null
    act(() => {
      pending = ctx().actions.generateItinerary(tripId, { regenerate: true })
    })
    act(() => {
      ctx().actions.deleteTrip(tripId)
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500)
      await pending
    })

    expect(ctx().state.generation[tripId]).toBeUndefined()
    expect(ctx().state.daysByTrip[tripId]).toBeUndefined()
  })

  it('discards days built for a date range the trip no longer has', async () => {
    vi.useFakeTimers({ now: FIXED_NOW })
    seedState(emptyState())
    renderProvider()

    let tripId = ''
    act(() => {
      tripId = ctx().actions.createTrip(parisDraft({ endDate: '2026-05-06' })).id
    })
    let pending: Promise<void> | null = null
    act(() => {
      pending = ctx().actions.generateItinerary(tripId, { regenerate: true })
    })
    // The dates move while the six-day plan is still being drafted.
    act(() => {
      ctx().actions.updateTrip(tripId, { endDate: '2026-05-02' })
    })
    const reflowed = ctx().state.daysByTrip[tripId]
    expect(reflowed).toHaveLength(2)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500)
      await pending
    })

    // The stale six-day result must not overwrite the reflowed two-day plan.
    expect(ctx().state.daysByTrip[tripId]).toHaveLength(2)
    expect(ctx().state.daysByTrip[tripId]).toBe(reflowed)
  })

  it('clears the loading state rather than leaving a spinner behind', async () => {
    vi.useFakeTimers({ now: FIXED_NOW })
    seedState(emptyState())
    renderProvider()

    let tripId = ''
    act(() => {
      tripId = ctx().actions.createTrip(parisDraft({ endDate: '2026-05-06' })).id
    })
    let pending: Promise<void> | null = null
    act(() => {
      pending = ctx().actions.generateItinerary(tripId, { regenerate: true })
    })
    expect(generationFor(tripId).status).toBe('loading')
    act(() => {
      ctx().actions.updateTrip(tripId, { endDate: '2026-05-02' })
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500)
      await pending
    })

    expect(generationFor(tripId).status).toBe('idle')
    expect(generationFor(tripId).error).toBeNull()
  })

  it('writes nothing back when the trip is deleted mid-swap', async () => {
    vi.useFakeTimers({ now: FIXED_NOW })
    seedState(seededState())
    renderProvider()

    let pending: Promise<void> | null = null
    act(() => {
      pending = ctx().actions.replaceItem(TRIP_ID, 'itm_a')
    })
    act(() => {
      ctx().actions.deleteTrip(TRIP_ID)
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
      await pending
    })

    expect(ctx().state.daysByTrip[TRIP_ID]).toBeUndefined()
    expect(readStored().daysByTrip[TRIP_ID]).toBeUndefined()
  })

  it('discards a swap suggestion built against a range the trip no longer has', async () => {
    vi.useFakeTimers({ now: FIXED_NOW })
    seedState(seededState())
    renderProvider()

    let pending: Promise<void> | null = null
    act(() => {
      pending = ctx().actions.replaceItem(TRIP_ID, 'itm_a')
    })
    act(() => {
      ctx().actions.updateTrip(TRIP_ID, { endDate: '2026-04-05' })
    })
    const reflowed = ctx().state.daysByTrip[TRIP_ID]

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
      await pending
    })

    expect(ctx().state.daysByTrip[TRIP_ID]).toBe(reflowed)
  })
})

/**
 * The simulated-failure switch is a demo affordance. It used to live in the
 * persisted generation record, so a `true` survived a reload and wedged that trip
 * into permanent failure with no UI left to turn it off.
 */
describe('TouristProvider simulated failure is not persisted', () => {
  it('still makes the next run fail', async () => {
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
  })

  it('can be turned back off again', async () => {
    vi.useFakeTimers({ now: FIXED_NOW })
    seedState(seededState())
    renderProvider()

    act(() => {
      ctx().actions.setSimulateFailure(TRIP_ID, true)
    })
    act(() => {
      ctx().actions.setSimulateFailure(TRIP_ID, false)
    })
    let pending: Promise<void> | null = null
    act(() => {
      pending = ctx().actions.generateItinerary(TRIP_ID)
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500)
      await pending
    })

    expect(generationFor(TRIP_ID).status).toBe('success')
  })

  it('never reaches the stored payload', async () => {
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

    expect(window.localStorage.getItem(STATE_KEY) ?? '').not.toContain('shouldFail')
  })

  /**
   * The wedge itself: a snapshot written by an older build carries
   * `shouldFail: true`, and the trip must still generate normally.
   */
  it('ignores a true left behind in an older snapshot', async () => {
    vi.useFakeTimers({ now: FIXED_NOW })
    const stale = seededState()
    seedState({
      ...stale,
      generation: { [TRIP_ID]: { ...idleGeneration(), shouldFail: true } },
    })
    renderProvider()

    let pending: Promise<void> | null = null
    act(() => {
      pending = ctx().actions.generateItinerary(TRIP_ID)
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500)
      await pending
    })

    expect(generationFor(TRIP_ID).status).toBe('success')
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
        destinationId: 'paris',
      })
      expect(results.length).toBeGreaterThan(0)
      expect(results[0].id).toBe('exp_eiffel_tower')
      const filtered = await ctx().actions.searchExperiences({
        text: '',
        category: 'food',
        maxPrice: null,
        destinationId: 'paris',
      })
      expect(filtered.length).toBeGreaterThan(0)
      expect(filtered.every((experience) => experience.category === 'food')).toBe(true)
    })

    act(() => {
      ctx().actions.trackSearch({ text: '  museum  ', category: 'culture', maxPrice: 20, destinationId: 'paris' })
    })
    expect(ctx().state).toBe(before)
  })
})

/**
 * A service call held open until the test settles it, so the order in which
 * overlapping async work lands is chosen by the test rather than by a timer.
 */
interface HeldCall {
  succeed(): void
  fail(): void
}

function holdGenerations(): HeldCall[] {
  const calls: HeldCall[] = []
  vi.spyOn(services.itinerary, 'generate').mockImplementation(
    (trip, options) =>
      new Promise((resolve, reject) => {
        calls.push({
          succeed: () => resolve(buildItinerary(trip, options?.variant ?? 0)),
          fail: () => reject(new Error(GENERATION_ERROR_MESSAGE)),
        })
      }),
  )
  return calls
}

function holdSuggestions(): HeldCall[] {
  const calls: HeldCall[] = []
  vi.spyOn(services.itinerary, 'suggestAlternative').mockImplementation(
    ({ trip, day, item, variant }) =>
      new Promise((resolve, reject) => {
        calls.push({
          succeed: () => resolve(buildAlternativeItem(trip, day, item, variant ?? 0)),
          fail: () => reject(new Error(GENERATION_ERROR_MESSAGE)),
        })
      }),
  )
  return calls
}

async function land(settle: () => void, pending: Promise<void>): Promise<void> {
  await act(async () => {
    settle()
    await pending
  })
}

function start(run: () => Promise<void>): Promise<void> {
  const box: { pending: Promise<void> | null } = { pending: null }
  act(() => {
    box.pending = run()
  })
  if (!box.pending) throw new Error('the action did not start')
  return box.pending
}

function itemById(tripId: string, itemId: string): ItineraryItem | undefined {
  return (ctx().state.daysByTrip[tripId] ?? [])
    .flatMap((day) => day.items)
    .find((item) => item.id === itemId)
}

function replacedEvents() {
  return services.analytics.events().filter((entry) => entry.event === 'itinerary_item_replaced')
}

const OTHER_TRIP_ID = 'trip_2'

function twoTripState(): PersistedState {
  const base = seededState()
  return {
    ...base,
    trips: [...base.trips, makeTrip({ id: OTHER_TRIP_ID, name: 'Lisbon long weekend' })],
    daysByTrip: {
      ...base.daysByTrip,
      [OTHER_TRIP_ID]: [makeDay(OTHER_TRIP_ID, 1, [makeItem(OTHER_TRIP_ID, 'itm_z')])],
    },
    expensesByTrip: { ...base.expensesByTrip, [OTHER_TRIP_ID]: [] },
    generation: { ...base.generation, [OTHER_TRIP_ID]: idleGeneration() },
  }
}

/**
 * Every async write re-checks the world after its await. The trip-deleted and
 * trip-reflowed guards are covered above; these cover the rest of the class:
 * an older result landing after a newer one, and a swap landing on a stop that
 * has changed underneath it.
 */
describe('TouristProvider overlapping generations', () => {
  it('keeps the newer draft when an older run finishes last', async () => {
    seedState(seededState())
    renderProvider()
    const runs = holdGenerations()

    const older = start(() => ctx().actions.generateItinerary(TRIP_ID, { regenerate: true }))
    const newer = start(() => ctx().actions.generateItinerary(TRIP_ID, { regenerate: true }))
    await land(runs[1].succeed, newer)
    const newest = ctx().state.daysByTrip[TRIP_ID]
    const newestRecord = generationFor(TRIP_ID)
    expect(newestRecord.status).toBe('success')

    await land(runs[0].succeed, older)

    expect(ctx().state.daysByTrip[TRIP_ID]).toBe(newest)
    expect(generationFor(TRIP_ID)).toEqual(newestRecord)
    expect(readStored().daysByTrip[TRIP_ID]).toEqual(newest)
  })

  it('stays loading when an older run finishes while a newer one is still out', async () => {
    seedState(seededState())
    renderProvider()
    const runs = holdGenerations()

    const older = start(() => ctx().actions.generateItinerary(TRIP_ID, { regenerate: true }))
    const newer = start(() => ctx().actions.generateItinerary(TRIP_ID, { regenerate: true }))
    await land(runs[0].succeed, older)

    // The spinner belongs to the run the traveller is waiting on.
    expect(generationFor(TRIP_ID).status).toBe('loading')
    expect(ctx().state.daysByTrip[TRIP_ID]).toEqual(SEEDED_DAYS)

    await land(runs[1].succeed, newer)
    expect(generationFor(TRIP_ID).status).toBe('success')
  })

  it('does not stamp an older failure over a newer success', async () => {
    seedState(seededState())
    renderProvider()
    const runs = holdGenerations()

    const older = start(() => ctx().actions.generateItinerary(TRIP_ID, { regenerate: true }))
    const retry = start(() => ctx().actions.retryGeneration(TRIP_ID))
    await land(runs[1].succeed, retry)
    await land(runs[0].fail, older)

    expect(generationFor(TRIP_ID).status).toBe('success')
    expect(generationFor(TRIP_ID).error).toBeNull()
    expect(readStored().generation[TRIP_ID].status).toBe('success')
  })

  it('writes nothing to storage when a run lands after the provider unmounted', async () => {
    seedState(seededState())
    const view = renderProvider()
    const runs = holdGenerations()

    const pending = start(() => ctx().actions.generateItinerary(TRIP_ID, { regenerate: true }))
    const snapshot = window.localStorage.getItem(STATE_KEY)
    view.unmount()
    await land(runs[0].succeed, pending)

    expect(window.localStorage.getItem(STATE_KEY)).toBe(snapshot)
  })
})

describe('TouristProvider swaps that land on a changed stop', () => {
  it('writes nothing and reports no swap when the stop was removed meanwhile', async () => {
    seedState(seededState())
    renderProvider()
    const swaps = holdSuggestions()

    const pending = start(() => ctx().actions.replaceItem(TRIP_ID, 'itm_a'))
    act(() => {
      ctx().actions.removeItem(TRIP_ID, 'itm_a')
    })
    const afterRemove = ctx().state.daysByTrip[TRIP_ID]
    services.analytics.clear()
    await land(swaps[0].succeed, pending)

    expect(ctx().state.daysByTrip[TRIP_ID]).toBe(afterRemove)
    expect(replacedEvents()).toEqual([])
    expect(ctx().pendingItemId).toBeNull()
  })

  it('keeps the traveller’s hand edit made while the swap was in flight', async () => {
    seedState(seededState())
    renderProvider()
    const swaps = holdSuggestions()

    const pending = start(() => ctx().actions.replaceItem(TRIP_ID, 'itm_a'))
    act(() => {
      ctx().actions.editItem(TRIP_ID, 'itm_a', { title: 'My own pick' })
    })
    await land(swaps[0].succeed, pending)

    expect(itemById(TRIP_ID, 'itm_a')?.title).toBe('My own pick')
    expect(ctx().pendingItemId).toBeNull()
  })

  it('does not drop the suggestion onto the day the stop was moved to', async () => {
    seedState(seededState())
    renderProvider()
    const swaps = holdSuggestions()

    const pending = start(() => ctx().actions.replaceItem(TRIP_ID, 'itm_a'))
    act(() => {
      ctx().actions.moveItem(TRIP_ID, 'itm_a', `${TRIP_ID}_d2`)
    })
    const afterMove = ctx().state.daysByTrip[TRIP_ID]
    await land(swaps[0].succeed, pending)

    expect(ctx().state.daysByTrip[TRIP_ID]).toBe(afterMove)
    expect(itemById(TRIP_ID, 'itm_a')?.title).toBe('Item itm_a')
  })

  it('writes nothing when a regeneration rebuilt the day while the swap was out', async () => {
    seedState(seededState())
    renderProvider()
    const runs = holdGenerations()
    const swaps = holdSuggestions()

    const swap = start(() => ctx().actions.replaceItem(TRIP_ID, 'itm_a'))
    const redraft = start(() => ctx().actions.generateItinerary(TRIP_ID, { regenerate: true }))
    await land(runs[0].succeed, redraft)
    const redrafted = ctx().state.daysByTrip[TRIP_ID]
    // The untouched AI stop was regenerable, so the redraft replaced it.
    expect(itemById(TRIP_ID, 'itm_a')).toBeUndefined()
    services.analytics.clear()

    await land(swaps[0].succeed, swap)

    expect(ctx().state.daysByTrip[TRIP_ID]).toBe(redrafted)
    expect(replacedEvents()).toEqual([])
  })

  it('keeps a swap that lands before an overlapping regeneration', async () => {
    seedState(seededState())
    renderProvider()
    const runs = holdGenerations()
    const swaps = holdSuggestions()

    const swap = start(() => ctx().actions.replaceItem(TRIP_ID, 'itm_a'))
    const redraft = start(() => ctx().actions.generateItinerary(TRIP_ID, { regenerate: true }))
    await land(swaps[0].succeed, swap)
    const swapped = itemById(TRIP_ID, 'itm_a')
    expect(swapped?.editedByUser).toBe(true)

    await land(runs[0].succeed, redraft)

    // A swapped stop is the traveller's choice, so the redraft keeps it.
    expect(itemById(TRIP_ID, 'itm_a')).toEqual(swapped)
  })
})

describe('TouristProvider swap state follows its trip', () => {
  it('clears the swap error when the trip it belongs to is deleted', async () => {
    seedState(twoTripState())
    renderProvider()
    const swaps = holdSuggestions()

    const pending = start(() => ctx().actions.replaceItem(TRIP_ID, 'itm_a'))
    await land(swaps[0].fail, pending)
    expect(ctx().swapError).not.toBeNull()

    act(() => {
      ctx().actions.deleteTrip(TRIP_ID)
    })

    expect(ctx().swapError).toBeNull()
    expect(ctx().pendingItemId).toBeNull()
  })

  it('leaves the swap error alone when a different trip is deleted', async () => {
    seedState(twoTripState())
    renderProvider()
    const swaps = holdSuggestions()

    const pending = start(() => ctx().actions.replaceItem(TRIP_ID, 'itm_a'))
    await land(swaps[0].fail, pending)

    act(() => {
      ctx().actions.deleteTrip(OTHER_TRIP_ID)
    })

    expect(ctx().swapError).not.toBeNull()
  })

  it('clears the swap error on a data reset', async () => {
    seedState(seededState())
    renderProvider()
    const swaps = holdSuggestions()

    const failed = start(() => ctx().actions.replaceItem(TRIP_ID, 'itm_a'))
    await land(swaps[0].fail, failed)
    expect(ctx().swapError).not.toBeNull()

    act(() => {
      ctx().actions.clearAllData()
    })

    expect(ctx().swapError).toBeNull()
  })

  it('does not let an abandoned swap clear or fail a newer swap on another trip', async () => {
    seedState(twoTripState())
    renderProvider()
    const swaps = holdSuggestions()

    const abandoned = start(() => ctx().actions.replaceItem(TRIP_ID, 'itm_a'))
    act(() => {
      ctx().actions.deleteTrip(TRIP_ID)
    })
    const current = start(() => ctx().actions.replaceItem(OTHER_TRIP_ID, 'itm_z'))
    expect(ctx().pendingItemId).toBe('itm_z')

    await land(swaps[0].fail, abandoned)

    // Still the newer swap's spinner, and no error about a trip that is gone.
    expect(ctx().pendingItemId).toBe('itm_z')
    expect(ctx().swapError).toBeNull()

    await land(swaps[1].succeed, current)
    expect(ctx().pendingItemId).toBeNull()
    expect(itemById(OTHER_TRIP_ID, 'itm_z')?.editedByUser).toBe(true)
  })
})

describe('TouristProvider item currency', () => {
  function tripIn(currency: Trip['currency']): PersistedState {
    return { ...seededState(), trips: [makeTrip({ currency })] }
  }

  const HAND_TYPED = {
    title: 'Suya by the water',
    category: 'food',
    startTime: '19:00',
    endTime: null,
    location: '',
    description: '',
    estimatedCost: 4500,
    notes: '',
  } as const

  it('stores the catalogue’s currency, not the trip’s, for a place added to a trip in another currency', async () => {
    seedState(tripIn('NGN'))
    renderProvider()
    const day = ctx().state.daysByTrip[TRIP_ID][0]
    const experience = await ctx().actions.getExperience('exp_eiffel_tower')
    if (!experience) throw new Error('the catalogue record is missing')
    expect(experience.currency).not.toBe('NGN')

    const box: { created: ItineraryItem | null } = { created: null }
    await act(async () => {
      box.created = await ctx().actions.addExperienceToTrip(TRIP_ID, experience.id, {
        dayId: day.id,
      })
    })

    const createdId = box.created?.id ?? ''
    expect(box.created?.currency).toBe(experience.currency)
    expect(itemById(TRIP_ID, createdId)?.currency).toBe(experience.currency)
    const stored = readStored()
      .daysByTrip[TRIP_ID].flatMap((storedDay) => storedDay.items)
      .find((item) => item.id === createdId)
    expect(stored?.currency).toBe(experience.currency)
    // Recorded as quoted, never converted.
    expect(stored?.estimatedCost).toBe(experience.priceFrom)
  })

  it('stores the trip’s currency for a stop typed in by hand', () => {
    seedState(tripIn('NGN'))
    renderProvider()
    const day = ctx().state.daysByTrip[TRIP_ID][0]

    const box: { created: ItineraryItem | null } = { created: null }
    act(() => {
      box.created = ctx().actions.addCustomItem(TRIP_ID, { ...HAND_TYPED }, { dayId: day.id })
    })

    expect(box.created?.currency).toBe('NGN')
    expect(itemById(TRIP_ID, box.created?.id ?? '')?.currency).toBe('NGN')
  })

  it('adds no hand-typed stop to a trip that does not exist', () => {
    seedState(seededState())
    renderProvider()
    const before = ctx().state

    const box: { created: ItineraryItem | null } = { created: null }
    act(() => {
      box.created = ctx().actions.addCustomItem(
        'trip_missing',
        { ...HAND_TYPED },
        { dayId: `${TRIP_ID}_d1` },
      )
    })

    expect(box.created).toBeNull()
    expect(ctx().state).toBe(before)
  })
})

describe('TouristProvider adding a place without a start time', () => {
  function stateWithDay(items: ItineraryItem[], trip: Partial<Trip> = {}): PersistedState {
    return {
      ...seededState(),
      trips: [makeTrip(trip)],
      daysByTrip: { [TRIP_ID]: [makeDay(TRIP_ID, 1, items)] },
    }
  }

  async function add(experienceId: string, startTime?: string): Promise<ItineraryItem | null> {
    const box: { created: ItineraryItem | null } = { created: null }
    await act(async () => {
      box.created = await ctx().actions.addExperienceToTrip(TRIP_ID, experienceId, {
        dayId: `${TRIP_ID}_d1`,
        ...(startTime ? { startTime } : {}),
      })
    })
    return box.created
  }

  it('fits the place into the first gap within its usual hours', async () => {
    seedState(seededState())
    renderProvider()
    const before = ctx().state.daysByTrip[TRIP_ID]

    // Day one holds 08:00 - 10:00 and a 10:00 stop; the Louvre opens at 09:00 and takes three hours.
    const created = await add('exp_louvre_museum')

    expect(created).toMatchObject({ startTime: '11:15', endTime: '14:15', experienceId: 'exp_louvre_museum' })
    const after = ctx().state.daysByTrip[TRIP_ID]
    expect(after[0].items.map((item) => item.startTime)).toEqual(['08:00', '10:00', '11:15'])
    expect(after[0].items[0]).toBe(before[0].items[0])
    expect(after[0].items[1]).toBe(before[0].items[1])
    expect(after[1]).toBe(before[1])
  })

  it('adds nothing to the reported London day instead of putting the Tower at 21:30', async () => {
    const london = { destination: 'London, United Kingdom', destinationId: 'london', currency: 'GBP' } as const
    seedState(
      stateWithDay(
        [
          makeItem(TRIP_ID, 'itm_abbey', { startTime: '09:30', endTime: '11:00' }),
          makeItem(TRIP_ID, 'itm_lunch', { startTime: '12:30', endTime: '13:30', category: 'food' }),
          makeItem(TRIP_ID, 'itm_tate', { startTime: '14:00', endTime: '16:30' }),
          makeItem(TRIP_ID, 'itm_pub', { startTime: '20:00', endTime: '22:00', category: 'nightlife' }),
        ],
        london,
      ),
    )
    renderProvider()
    const before = ctx().state

    expect(await add('exp_london_tower_of_london')).toBeNull()
    expect(ctx().state.daysByTrip).toBe(before.daysByTrip)
    expect(readStored().daysByTrip[TRIP_ID][0].items).toHaveLength(4)

    // A time the traveller types is theirs, even a late one.
    const typed = await add('exp_london_tower_of_london', '21:30')
    expect(typed?.startTime).toBe('21:30')
  })

  it('keeps a place on the final morning clear of the departure, or does not add it', async () => {
    seedState(
      stateWithDay([
        makeItem(TRIP_ID, 'itm_breakfast', { startTime: '08:00', endTime: '09:00', category: 'food' }),
        makeItem(TRIP_ID, 'itm_departure', {
          startTime: '12:00',
          endTime: '13:30',
          category: 'transit',
          role: 'departure',
        }),
      ]),
    )
    renderProvider()

    expect(await add('exp_louvre_museum')).toBeNull()
    const chapel = await add('exp_sainte_chapelle')
    expect(chapel).toMatchObject({ startTime: '09:15', endTime: '10:15' })
  })

  it('never modifies the traveller’s own, edited or moved stops', async () => {
    const own = makeItem(TRIP_ID, 'itm_own', { startTime: '09:00', endTime: '10:00', source: 'user' })
    const edited = makeItem(TRIP_ID, 'itm_edited', { startTime: '13:00', endTime: '14:00', editedByUser: true })
    const moved = makeItem(TRIP_ID, 'itm_moved', {
      startTime: '16:00',
      endTime: null,
      editedByUser: true,
      updatedAt: '2026-02-01T00:00:00.000Z',
    })
    seedState(stateWithDay([own, edited, moved]))
    renderProvider()
    const before = ctx().state.daysByTrip[TRIP_ID][0].items

    const created = await add('exp_sainte_chapelle')

    expect(created?.startTime).toBe('10:15')
    const after = ctx().state.daysByTrip[TRIP_ID][0].items
    expect(after).toHaveLength(4)
    for (const original of before) {
      expect(after.find((item) => item.id === original.id)).toBe(original)
    }
    const stored = readStored().daysByTrip[TRIP_ID][0].items
    expect(stored.find((item) => item.id === 'itm_own')).toEqual(own)
    expect(stored.find((item) => item.id === 'itm_edited')).toEqual(edited)
    expect(stored.find((item) => item.id === 'itm_moved')).toEqual(moved)
  })
})
