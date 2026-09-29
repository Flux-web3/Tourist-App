import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { EditTripDialog } from '@/components/EditTripDialog'
import { DESTINATION_REQUIRED_MESSAGE } from '@/domain/validation'
import { STORAGE_KEY } from '@/services/persistence'
import { useTourist } from '@/state/useTourist'
import { TEST_TRIP_ID, demoStateFor, renderWithProviders } from '@/test/renderWithProviders'
import type { PersistedState } from '@/services/contracts'
import type { Trip } from '@/domain/types'

function Harness() {
  const { state } = useTourist()
  const [open, setOpen] = useState(true)
  const trip = state.trips.find((candidate) => candidate.id === TEST_TRIP_ID)
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

    await save()
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

    await save()
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
