import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { EditTripDialog } from '@/components/EditTripDialog'
import { addDays, todayISO } from '@/domain/format'
import { DESTINATION_REQUIRED_MESSAGE } from '@/domain/validation'
import { STORAGE_KEY, createEmptyState, createGuestUser } from '@/services/persistence'
import { tripService } from '@/services/tripService'
import { useTourist } from '@/state/useTourist'
import { TEST_TRIP_ID, demoStateFor, renderWithProviders } from '@/test/renderWithProviders'
import type { PersistedState } from '@/services/contracts'
import type { ItineraryDay, ItineraryItem, Trip } from '@/domain/types'

function Harness({ tripId = TEST_TRIP_ID }: { tripId?: string }) {
  const { state } = useTourist()
  const [open, setOpen] = useState(true)
  const trip = state.trips.find((candidate) => candidate.id === tripId)
  if (!trip) return null
  return (
    <>
      {open ? null : <p>Dialog closed</p>}
      <EditTripDialog trip={trip} open={open} onClose={() => setOpen(false)} />
    </>
  )
}

function renderDialog(tripPatch: Partial<Trip>) {
  const base = demoStateFor()
  const state: PersistedState = {
    ...base,
    trips: base.trips.map((trip) => ({ ...trip, ...tripPatch })),
  }
  renderWithProviders(<Harness />, { state })
}

function stored(): { trip: Trip; itemIds: string[] } {
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (raw === null) throw new Error('nothing was persisted')
  const state = JSON.parse(raw) as PersistedState
  const trip = state.trips.find((candidate) => candidate.id === TEST_TRIP_ID)
  if (!trip) throw new Error('the trip is gone')
  const itemIds = (state.daysByTrip[TEST_TRIP_ID] ?? []).flatMap((day) => day.items.map((item) => item.id))
  return { trip, itemIds }
}

function destination(): HTMLElement {
  return screen.getByRole('combobox', { name: /Destination/ })
}

async function save(): Promise<void> {
  await userEvent.setup().click(screen.getByRole('button', { name: 'Save changes' }))
}

const CHANGE_DESTINATION = 'Change destination and re-draft'

async function saveNewDestination(): Promise<void> {
  await userEvent.setup().click(screen.getByRole('button', { name: CHANGE_DESTINATION }))
}

const LONDON: Partial<Trip> = {
  destination: 'London, United Kingdom',
  destinationId: 'london',
  currency: 'GBP',
}

describe('EditTripDialog destination', () => {
  it('starts from the trip destination', () => {
    renderDialog(LONDON)

    expect(destination()).toHaveValue('London, United Kingdom')
  })

  it('moves the trip to another city, re-flows the draft and keeps the currency', async () => {
    const user = userEvent.setup()
    renderDialog(LONDON)
    const before = stored()

    await user.clear(destination())
    await user.type(destination(), 'paris')
    await user.click(screen.getByRole('option', { name: 'Paris, France' }))

    // Expenses are already in GBP, so the currency is left alone and the
    // traveller is only told the city uses another one.
    expect(screen.getByLabelText(/Currency/)).toHaveValue('GBP')
    expect(destination()).toHaveAccessibleDescription(
      'Paris uses EUR. This trip stays in GBP; change Currency below if you want EUR.',
    )

    await saveNewDestination()
    await screen.findByText('Dialog closed')

    const after = stored()
    expect(after.trip).toMatchObject({ destinationId: 'paris', destination: 'Paris, France', currency: 'GBP' })
    expect(after.itemIds).not.toEqual(before.itemIds)
  })

  it('does not re-flow a save that leaves the destination alone', async () => {
    const user = userEvent.setup()
    renderDialog(LONDON)
    const before = stored()

    await user.clear(screen.getByLabelText(/Trip budget/))
    await user.type(screen.getByLabelText(/Trip budget/), '3100')
    await save()
    await screen.findByText('Dialog closed')

    expect(stored().trip.budget).toBe(3100)
    expect(stored().itemIds).toEqual(before.itemIds)
  })

  it('keeps an unlisted pre-catalogue destination editable without changing city', async () => {
    const user = userEvent.setup()
    renderDialog({ destination: 'Lisbon', destinationId: null })

    expect(destination()).toHaveValue('Lisbon')
    expect(destination()).toHaveAccessibleDescription(
      "Lisbon is not in Tourist's destination list, so Explore and the itinerary draft stay general. Keep it, or pick a listed city.",
    )

    await user.clear(screen.getByLabelText(/Trip budget/))
    await user.type(screen.getByLabelText(/Trip budget/), '900')
    await save()
    await screen.findByText('Dialog closed')

    expect(stored().trip).toMatchObject({ destination: 'Lisbon', destinationId: null, budget: 900 })
  })

  it('moves an unlisted trip onto a listed city', async () => {
    const user = userEvent.setup()
    renderDialog({ destination: 'Lisbon', destinationId: null })

    await user.clear(destination())
    await user.type(destination(), 'barc')
    await user.click(screen.getByRole('option', { name: 'Barcelona, Spain' }))
    expect(screen.queryByText(/not in Tourist's destination list/)).not.toBeInTheDocument()

    await saveNewDestination()
    await screen.findByText('Dialog closed')

    expect(stored().trip).toMatchObject({ destination: 'Barcelona, Spain', destinationId: 'barcelona' })
  })

  it('refuses to save a cleared destination', async () => {
    const user = userEvent.setup()
    renderDialog(LONDON)

    await user.clear(destination())
    await user.tab()
    await save()

    const summary = screen.getByRole('alert')
    expect(within(summary).getByText(DESTINATION_REQUIRED_MESSAGE)).toBeInTheDocument()
    expect(destination()).toHaveAttribute('aria-invalid', 'true')
    expect(screen.queryByText('Dialog closed')).not.toBeInTheDocument()
    expect(stored().trip.destinationId).toBe('london')
  })
})

/**
 * Moving a trip takes the old city's drafted stops and guide places out of the
 * plan, so the traveller is told what goes, with this trip's own counts, before
 * the save and not after it.
 */
describe('EditTripDialog when the destination changes', () => {
  const START = addDays(todayISO(), 30)
  const LONDON_TRIP = 'trip-london'

  function stop(overrides: Partial<ItineraryItem> & { id: string }): ItineraryItem {
    return {
      tripId: LONDON_TRIP,
      title: 'Stop',
      category: 'sightseeing',
      startTime: '12:00',
      endTime: '13:00',
      location: 'London',
      description: '',
      estimatedCost: 0,
      currency: 'GBP',
      source: 'user',
      editedByUser: false,
      experienceId: null,
      notes: '',
      createdAt: START,
      updatedAt: START,
      ...overrides,
    }
  }

  /**
   * A London trip as a traveller would leave it: the generated draft with one
   * AI stop edited, a place added from the London guide, two stops of their
   * own, an expense and a note.
   */
  function londonState(
    shapeDays: (days: ItineraryDay[]) => ItineraryDay[] = (days) => days,
    tripPatch: Partial<Trip> = {},
  ): { state: PersistedState; draftStops: number } {
    const created = tripService.create(
      createEmptyState(createGuestUser()),
      {
        name: 'London long weekend',
        origin: 'Lagos, Nigeria',
        destination: 'London, United Kingdom',
        destinationId: 'london',
        startDate: START,
        endDate: addDays(START, 2),
        travelers: 2,
        budget: 2000,
        currency: 'GBP',
        interests: ['culture'],
        pace: 'balanced',
        notes: '',
      },
      'usr_fixture',
    )
    const generatedId = created.trip?.id ?? ''
    const generated = (created.state.daysByTrip[generatedId] ?? []).map((day, index) => ({
      ...day,
      tripId: LONDON_TRIP,
      items: [
        ...day.items.map((item, position) => ({
          ...item,
          tripId: LONDON_TRIP,
          editedByUser: index === 1 && position === 1,
        })),
        ...(index === 0
          ? [
              stop({
                id: 'itm_tower',
                source: 'catalog',
                title: 'Tower of London',
                experienceId: 'exp_london_tower_of_london',
              }),
              stop({ id: 'itm_dinner', title: 'Dinner with Sam', startTime: '19:30' }),
            ]
          : []),
        ...(index === 1 ? [stop({ id: 'itm_show', title: 'Matinee tickets', startTime: '14:00' })] : []),
      ],
    }))
    const days = shapeDays(generated)
    const draftStops = days.flatMap((day) => day.items).filter((item) => item.source === 'ai').length
    const trip = { ...(created.trip as Trip), id: LONDON_TRIP, ...tripPatch }
    return {
      draftStops,
      state: {
        ...created.state,
        trips: [trip],
        daysByTrip: { [LONDON_TRIP]: days },
        expensesByTrip: {
          [LONDON_TRIP]: [
            {
              id: 'exp_oyster',
              tripId: LONDON_TRIP,
              description: 'Oyster card',
              amount: 40,
              currency: 'GBP',
              category: 'transport',
              date: START,
              notes: '',
              createdAt: START,
              updatedAt: START,
            },
          ],
        },
        notesByTrip: {
          [LONDON_TRIP]: [
            {
              id: 'not_hotel',
              tripId: LONDON_TRIP,
              title: 'Hotel',
              body: 'Near Kings Cross',
              pinned: false,
              createdAt: START,
              updatedAt: START,
            },
          ],
        },
        generation: {},
      },
    }
  }

  function persisted(): PersistedState {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw === null) throw new Error('nothing was persisted')
    return JSON.parse(raw) as PersistedState
  }

  function items(state: PersistedState): ItineraryItem[] {
    return (state.daysByTrip[LONDON_TRIP] ?? []).flatMap((day) => day.items)
  }

  function renderLondon(state: PersistedState): void {
    renderWithProviders(<Harness tripId={LONDON_TRIP} />, { state })
  }

  async function chooseParis(user: ReturnType<typeof userEvent.setup>): Promise<void> {
    await user.clear(destination())
    await user.type(destination(), 'paris')
    await user.click(screen.getByRole('option', { name: 'Paris, France' }))
  }

  it('says what the move removes and keeps, with this trip’s counts', async () => {
    const user = userEvent.setup()
    const { state, draftStops } = londonState()
    renderLondon(state)

    await chooseParis(user)

    const warning = screen.getByText('Changing London to Paris re-drafts the itinerary for Paris.').closest('[role="status"]')
    expect(warning).not.toBeNull()
    expect(warning).toHaveTextContent(
      `${draftStops} London stops and 1 place from the London guide will be removed. Your 2 own stops, expenses and notes are kept.`,
    )
    const button = screen.getByRole('button', { name: CHANGE_DESTINATION })
    expect(button).toHaveAccessibleDescription(
      `Changing London to Paris re-drafts the itinerary for Paris. ${draftStops} London stops and 1 place from the London guide will be removed. Your 2 own stops, expenses and notes are kept.`,
    )
    expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument()
    // The currency hint still stands beside it.
    expect(destination()).toHaveAccessibleDescription(
      'Paris uses EUR. This trip stays in GBP; change Currency below if you want EUR.',
    )
  })

  it('applies the move: London stops out, Paris draft in, own stops, expenses and notes kept', async () => {
    const user = userEvent.setup()
    const { state } = londonState()
    const londonAiIds = new Set(items(state).filter((item) => item.source === 'ai').map((item) => item.id))
    renderLondon(state)

    await chooseParis(user)
    await saveNewDestination()
    await screen.findByText('Dialog closed')

    const after = persisted()
    const afterItems = items(after)
    expect(after.trips[0]).toMatchObject({ destinationId: 'paris', currency: 'GBP', budget: 2000 })
    expect(afterItems.map((item) => item.id)).not.toContain('itm_tower')
    expect(afterItems.some((item) => londonAiIds.has(item.id))).toBe(false)
    expect(afterItems.filter((item) => item.source === 'user').map((item) => item.id).sort()).toEqual([
      'itm_dinner',
      'itm_show',
    ])
    expect(afterItems.filter((item) => item.source === 'ai').every((item) => item.currency === 'EUR')).toBe(true)
    expect(after.expensesByTrip[LONDON_TRIP]).toEqual(state.expensesByTrip[LONDON_TRIP])
    expect(after.notesByTrip?.[LONDON_TRIP]).toEqual(state.notesByTrip?.[LONDON_TRIP])
  })

  it('changes nothing when cancelled after the warning', async () => {
    const user = userEvent.setup()
    const { state } = londonState()
    renderLondon(state)
    const before = JSON.stringify(persisted())

    await chooseParis(user)
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await screen.findByText('Dialog closed')

    expect(JSON.stringify(persisted())).toBe(before)
  })

  it('drops the warning when the destination is put back', async () => {
    const user = userEvent.setup()
    const { state } = londonState()
    renderLondon(state)

    await chooseParis(user)
    await user.clear(destination())
    await user.type(destination(), 'london')
    await user.click(screen.getByRole('option', { name: 'London, United Kingdom' }))

    expect(screen.queryByText(/re-drafts the itinerary for/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save changes' })).not.toHaveAttribute('aria-describedby')
  })

  it('is chosen with the keyboard and confirmed with Enter', async () => {
    const user = userEvent.setup()
    const { state } = londonState()
    renderLondon(state)

    await user.click(destination())
    await user.keyboard('{Control>}a{/Control}{Backspace}')
    await user.keyboard('paris{Enter}')
    expect(destination()).toHaveValue('Paris, France')

    // The dialog's Tab trap measures visibility with offsetParent, which jsdom
    // never sets, so Tab cannot walk the form here. Focus the button directly;
    // what is tested is that it is reachable, named and described for a
    // keyboard user, and that Enter confirms.
    const button = screen.getByRole('button', { name: CHANGE_DESTINATION })
    button.focus()
    expect(button).toHaveFocus()
    await user.keyboard('{Enter}')
    await screen.findByText('Dialog closed')

    expect(persisted().trips[0].destinationId).toBe('paris')
  })

  it('shows no warning for an edit that leaves the destination alone', async () => {
    const user = userEvent.setup()
    const { state } = londonState()
    renderLondon(state)

    await user.clear(screen.getByLabelText(/Trip budget/))
    await user.type(screen.getByLabelText(/Trip budget/), '2500')

    expect(screen.queryByText(/re-drafts the itinerary for/)).not.toBeInTheDocument()
    await save()
    await screen.findByText('Dialog closed')
    expect(items(persisted()).map((item) => item.id)).toEqual(items(state).map((item) => item.id))
  })

  it('shows no warning when the trip has no plan yet', async () => {
    const user = userEvent.setup()
    const { state } = londonState(() => [])
    renderLondon(state)

    await chooseParis(user)

    expect(screen.queryByText(/re-drafts the itinerary for/)).not.toBeInTheDocument()
    await save()
    await screen.findByText('Dialog closed')
    expect(persisted().trips[0].destinationId).toBe('paris')
  })

  it('shows no warning when only the traveller’s own stops are planned', async () => {
    const user = userEvent.setup()
    const { state } = londonState((days) =>
      days.map((day) => ({ ...day, items: day.items.filter((item) => item.source === 'user') })),
    )
    renderLondon(state)

    await chooseParis(user)

    expect(screen.queryByText(/re-drafts the itinerary for/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument()
  })

  it('names a pre-catalogue trip by its own text and its places as saved from Explore', async () => {
    const user = userEvent.setup()
    const { state, draftStops } = londonState(undefined, { destination: 'Lisbon', destinationId: null })
    renderLondon(state)

    await chooseParis(user)

    expect(
      screen.getByText('Changing Lisbon to Paris re-drafts the itinerary for Paris.'),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        `${draftStops} Lisbon stops and 1 place saved from Explore will be removed. Your 2 own stops, expenses and notes are kept.`,
      ),
    ).toBeInTheDocument()
  })

  it('counts a single stop in the singular', async () => {
    const user = userEvent.setup()
    const { state } = londonState((days) =>
      days.map((day, index) => ({
        ...day,
        items: day.items.filter(
          (item) => item.id === 'itm_dinner' || (index === 0 && item.source === 'ai' && item === day.items[0]),
        ),
      })),
    )
    renderLondon(state)

    await chooseParis(user)

    expect(
      screen.getByText('1 London stop will be removed. Your 1 own stop, expenses and notes are kept.'),
    ).toBeInTheDocument()
  })
})
