import { fireEvent, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { addDays, formatDateRange, todayISO } from '@/domain/format'
import { TRIP_LIMITS } from '@/domain/validation'
import { PROTOTYPE_LABEL } from '@/lib/labels'
import CreateTripPage from '@/pages/CreateTripPage'
import { STORAGE_KEY, createEmptyState } from '@/services/persistence'
import { renderWithProviders } from '@/test/renderWithProviders'
import type { PersistedState } from '@/services/contracts'

const TODAY = todayISO()

function renderCreate() {
  return renderWithProviders(
    <Routes>
      <Route path="/trips/new" element={<CreateTripPage />} />
      <Route path="/trips" element={<p>Trips list</p>} />
      <Route path="/trips/:tripId/itinerary" element={<p>Itinerary screen</p>} />
    </Routes>,
    { route: '/trips/new', state: createEmptyState() },
  )
}

function storedTrips(): PersistedState['trips'] {
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (raw === null) throw new Error('nothing was persisted')
  return (JSON.parse(raw) as PersistedState).trips
}

async function fillMinimalTrip(): Promise<void> {
  const user = userEvent.setup()
  await user.type(screen.getByLabelText(/Travelling from/), 'Lagos, Nigeria')
  await user.type(screen.getByLabelText(/Destination/), 'Lisbon, Portugal')
  fireEvent.change(screen.getByLabelText(/Start date/), { target: { value: addDays(TODAY, 30) } })
  fireEvent.change(screen.getByLabelText(/End date/), { target: { value: addDays(TODAY, 32) } })
  await user.click(screen.getByRole('checkbox', { name: 'Culture' }))
}

function setDate(label: RegExp, value: string): void {
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
}

/** Validation problems are surfaced twice: in the summary and on the field. */
function expectFieldError(message: string, label: RegExp): void {
  expect(screen.getByRole('alert')).toHaveTextContent(message)
  expect(screen.getAllByText(message)).toHaveLength(2)
  expect(screen.getByLabelText(label)).toHaveAttribute('aria-invalid', 'true')
}

function dateSummary(): HTMLElement {
  const node = document.querySelector('[aria-live="polite"]')
  if (!(node instanceof HTMLElement)) throw new Error('the date summary is not rendered')
  return node
}

describe('CreateTripPage', () => {
  it('introduces the form and states that the trip never leaves the device', () => {
    renderCreate()

    expect(screen.getByRole('heading', { level: 1, name: 'Plan a trip' })).toBeInTheDocument()
    expect(screen.getByText('New trip')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent(PROTOTYPE_LABEL.localOnly)
    expect(screen.getByRole('status')).toHaveTextContent(
      `${PROTOTYPE_LABEL.noAccount}. The trip, its draft itinerary and every expense stay in this browser.`,
    )
  })

  it('starts from sensible defaults so only the essentials are left to answer', () => {
    renderCreate()

    expect(screen.getByLabelText(/Travellers/)).toHaveValue(2)
    expect(screen.getByLabelText(/Trip budget/)).toHaveValue(2500)
    expect(screen.getByLabelText(/Currency/)).toHaveValue('EUR')
    expect(screen.getByRole('radio', { name: /Balanced/ })).toBeChecked()
    expect(screen.getByLabelText(/Trip name/)).toHaveValue('')
    expect(screen.getByText('No dates chosen yet')).toBeInTheDocument()
  })

  it('refuses to create anything while the required answers are missing', async () => {
    const user = userEvent.setup()
    renderCreate()

    await user.click(screen.getByRole('button', { name: 'Create trip and draft itinerary' }))

    const summary = screen.getByRole('alert')
    expect(summary).toHaveTextContent('Check 5 details below')
    expect(summary).toHaveTextContent('Enter where you are travelling from.')
    expect(summary).toHaveTextContent('Enter a destination with at least 2 characters.')
    expect(summary).toHaveTextContent('Choose a start date.')
    expect(summary).toHaveTextContent('Choose an end date.')
    expect(summary).toHaveTextContent('Choose at least one interest so the draft matches you.')
    expect(summary).toHaveFocus()
    expect(storedTrips()).toHaveLength(0)
  })

  it('revalidates as the traveller answers, so the summary shrinks', async () => {
    const user = userEvent.setup()
    renderCreate()

    await user.click(screen.getByRole('button', { name: 'Create trip and draft itinerary' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Check 5 details below')

    await user.type(screen.getByLabelText(/Destination/), 'Lisbon, Portugal')

    expect(screen.getByRole('alert')).toHaveTextContent('Check 4 details below')
    expect(screen.getByRole('alert')).not.toHaveTextContent(
      'Enter a destination with at least 2 characters.',
    )
  })

  it('sends the traveller to the draft itinerary once the trip is created', async () => {
    const user = userEvent.setup()
    renderCreate()
    await fillMinimalTrip()

    await user.click(screen.getByRole('button', { name: 'Create trip and draft itinerary' }))

    expect(await screen.findByText('Itinerary screen')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Create trip and draft itinerary' })).not.toBeInTheDocument()
  })

  it('stores the answers the traveller gave', async () => {
    const user = userEvent.setup()
    renderCreate()
    await fillMinimalTrip()
    await user.type(screen.getByLabelText(/Notes/), 'Vegetarian, no museums before 11am.')
    await user.clear(screen.getByLabelText(/Trip budget/))
    await user.type(screen.getByLabelText(/Trip budget/), '1800')
    await user.selectOptions(screen.getByLabelText(/Currency/), 'USD')
    await user.click(screen.getByRole('radio', { name: /Packed/ }))

    await user.click(screen.getByRole('button', { name: 'Create trip and draft itinerary' }))
    await screen.findByText('Itinerary screen')

    const [trip] = storedTrips()
    expect(trip).toMatchObject({
      origin: 'Lagos, Nigeria',
      destination: 'Lisbon, Portugal',
      startDate: addDays(TODAY, 30),
      endDate: addDays(TODAY, 32),
      budget: 1800,
      currency: 'USD',
      interests: ['culture'],
      pace: 'packed',
      notes: 'Vegetarian, no museums before 11am.',
      status: 'draft',
    })
  })

  it('accepts a blank trip name and names the trip after the destination and month', async () => {
    const user = userEvent.setup()
    renderCreate()
    await fillMinimalTrip()

    await user.click(screen.getByRole('button', { name: 'Create trip and draft itinerary' }))
    await screen.findByText('Itinerary screen')

    const [trip] = storedTrips()
    expect(trip.name).toMatch(/^Lisbon, Portugal in [A-Z][a-z]+$/)
  })

  it('accepts a name made only of spaces and falls back to the suggestion', async () => {
    const user = userEvent.setup()
    renderCreate()
    await fillMinimalTrip()
    await user.type(screen.getByLabelText(/Trip name/), '   ')

    await user.click(screen.getByRole('button', { name: 'Create trip and draft itinerary' }))
    await screen.findByText('Itinerary screen')

    const [trip] = storedTrips()
    expect(trip.name).toMatch(/^Lisbon, Portugal in [A-Z][a-z]+$/)
  })

  it('keeps the name the traveller typed', async () => {
    const user = userEvent.setup()
    renderCreate()
    await fillMinimalTrip()
    await user.type(screen.getByLabelText(/Trip name/), '  Long weekend in Lisbon  ')

    await user.click(screen.getByRole('button', { name: 'Create trip and draft itinerary' }))
    await screen.findByText('Itinerary screen')

    expect(storedTrips()[0].name).toBe('Long weekend in Lisbon')
  })

  it('rejects a name longer than the limit', async () => {
    const user = userEvent.setup()
    renderCreate()
    await fillMinimalTrip()
    const tooLong = 'a'.repeat(TRIP_LIMITS.maxNameLength + 1)
    fireEvent.change(screen.getByLabelText(/Trip name/), { target: { value: tooLong } })

    await user.click(screen.getByRole('button', { name: 'Create trip and draft itinerary' }))

    expect(screen.getByRole('alert')).toHaveTextContent('Check 1 detail below')
    expectFieldError(
      `Keep the name to ${TRIP_LIMITS.maxNameLength} characters or fewer.`,
      /Trip name/,
    )
    expect(storedTrips()).toHaveLength(0)
  })

  it('counts the days between the chosen dates', async () => {
    const user = userEvent.setup()
    renderCreate()

    await user.click(screen.getByRole('button', { name: 'Long weekend · 3 days' }))

    const start = addDays(TODAY, 0)
    const end = addDays(TODAY, 2)
    expect(screen.getByLabelText(/Start date/)).toHaveValue(start)
    expect(screen.getByLabelText(/End date/)).toHaveValue(end)
    expect(screen.getByText(formatDateRange(start, end))).toBeInTheDocument()
    expect(screen.getByText('3 days')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Long weekend · 3 days' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('offers each quick pick and marks only the one that matches', async () => {
    const user = userEvent.setup()
    renderCreate()

    const presets = screen.getByRole('group', { name: 'Quick date presets' })
    expect(within(presets).getAllByRole('button')).toHaveLength(3)

    await user.click(within(presets).getByRole('button', { name: 'One week · 7 days' }))

    expect(within(presets).getByRole('button', { name: 'One week · 7 days' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(within(presets).getByRole('button', { name: 'Two weeks · 14 days' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    expect(screen.getByText('7 days')).toBeInTheDocument()
  })

  it('warns when the end date falls before the start date', () => {
    renderCreate()

    setDate(/Start date/, addDays(TODAY, 10))
    setDate(/End date/, addDays(TODAY, 8))

    expect(screen.getByText('The end date is before the start date.')).toBeInTheDocument()
    expect(within(dateSummary()).queryByText(/\d+ days/)).not.toBeInTheDocument()
    expect(within(dateSummary()).getByText(formatDateRange(addDays(TODAY, 10), addDays(TODAY, 8))))
      .toBeInTheDocument()
  })

  it('refuses a start date in the past', async () => {
    const user = userEvent.setup()
    renderCreate()
    await fillMinimalTrip()

    setDate(/Start date/, addDays(TODAY, -1))
    await user.click(screen.getByRole('button', { name: 'Create trip and draft itinerary' }))

    expectFieldError('Start date cannot be in the past.', /Start date/)
    expect(storedTrips()).toHaveLength(0)
  })

  it('refuses an end date before the start date', async () => {
    const user = userEvent.setup()
    renderCreate()
    await fillMinimalTrip()

    setDate(/End date/, addDays(TODAY, 29))
    await user.click(screen.getByRole('button', { name: 'Create trip and draft itinerary' }))

    expectFieldError('End date must be on or after the start date.', /End date/)
    expect(storedTrips()).toHaveLength(0)
  })

  it('refuses a trip longer than the limit', async () => {
    const user = userEvent.setup()
    renderCreate()
    await fillMinimalTrip()

    setDate(/End date/, addDays(TODAY, 30 + TRIP_LIMITS.maxDays))
    await user.click(screen.getByRole('button', { name: 'Create trip and draft itinerary' }))

    expectFieldError(`Keep trips to ${TRIP_LIMITS.maxDays} days or fewer.`, /End date/)
    expect(storedTrips()).toHaveLength(0)
  })

  it('refuses a budget that is not a positive amount', async () => {
    const user = userEvent.setup()
    renderCreate()
    await fillMinimalTrip()

    await user.clear(screen.getByLabelText(/Trip budget/))
    await user.click(screen.getByRole('button', { name: 'Create trip and draft itinerary' }))

    expectFieldError('Enter a budget greater than 0.', /Trip budget/)
    expect(storedTrips()).toHaveLength(0)
  })

  it('refuses more travellers than the prototype allows', async () => {
    const user = userEvent.setup()
    renderCreate()
    await fillMinimalTrip()

    await user.clear(screen.getByLabelText(/Travellers/))
    await user.type(screen.getByLabelText(/Travellers/), '20')
    await user.click(screen.getByRole('button', { name: 'Create trip and draft itinerary' }))

    expectFieldError(`Up to ${TRIP_LIMITS.maxTravelers} travellers.`, /Travellers/)
    expect(storedTrips()).toHaveLength(0)
  })

  it('requires at least one interest and clears the error once one is chosen', async () => {
    const user = userEvent.setup()
    renderCreate()

    const interests = screen.getByRole('group', { name: 'Interests' })
    await user.type(screen.getByLabelText(/Travelling from/), 'Lagos, Nigeria')
    await user.type(screen.getByLabelText(/Destination/), 'Lisbon, Portugal')
    setDate(/Start date/, addDays(TODAY, 30))
    setDate(/End date/, addDays(TODAY, 32))
    await user.click(screen.getByRole('button', { name: 'Create trip and draft itinerary' }))

    expect(within(interests).getByText('Choose at least one interest so the draft matches you.'))
      .toBeInTheDocument()
    expect(interests).toHaveAttribute('aria-invalid', 'true')

    await user.click(within(interests).getByRole('checkbox', { name: 'Food' }))

    expect(within(interests).getByRole('checkbox', { name: 'Food' })).toBeChecked()
    expect(
      within(interests).queryByText('Choose at least one interest so the draft matches you.'),
    ).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('adds and removes interests as chips are toggled', async () => {
    const user = userEvent.setup()
    renderCreate()
    const interests = screen.getByRole('group', { name: 'Interests' })

    await user.click(within(interests).getByRole('checkbox', { name: 'Food' }))
    await user.click(within(interests).getByRole('checkbox', { name: 'Outdoors' }))
    await user.click(within(interests).getByRole('checkbox', { name: 'Food' }))

    expect(within(interests).getByRole('checkbox', { name: 'Outdoors' })).toBeChecked()
    expect(within(interests).getByRole('checkbox', { name: 'Food' })).not.toBeChecked()
  })

  it('only offers a suggested name once there is a destination to name it after', async () => {
    const user = userEvent.setup()
    renderCreate()

    const suggest = screen.getByRole('button', { name: 'Use suggested name' })
    expect(suggest).toBeDisabled()
    expect(screen.getByLabelText(/Trip name/)).toHaveAttribute('placeholder', 'Untitled trip')

    await user.type(screen.getByLabelText(/Destination/), 'Lisbon, Portugal')
    expect(suggest).toBeEnabled()
    expect(screen.getByLabelText(/Trip name/)).toHaveAttribute(
      'placeholder',
      'Trip to Lisbon, Portugal',
    )

    setDate(/Start date/, addDays(TODAY, 30))
    await user.click(suggest)

    const suggested = (screen.getByLabelText(/Trip name/) as HTMLInputElement).value
    expect(suggested).toMatch(/^Lisbon, Portugal in [A-Z][a-z]+$/)
  })

  it('relabels the budget field when the currency changes', async () => {
    const user = userEvent.setup()
    renderCreate()

    await user.selectOptions(screen.getByLabelText(/Currency/), 'NGN')

    const budget = screen.getByLabelText(/Trip budget/)
    expect(budget.closest('div')?.parentElement).toHaveTextContent('₦')
    expect(budget.closest('div')?.parentElement).toHaveTextContent('NGN')
  })

  it('describes how the pace will shape the days', () => {
    renderCreate()

    const pace = screen.getByRole('group', { name: 'Pace' })
    expect(within(pace).getByRole('radio', { name: /Relaxed/ })).toHaveAccessibleName(
      expect.stringContaining('One anchor a day'),
    )
    expect(within(pace).getAllByRole('radio')).toHaveLength(3)
  })

  it('offers a way back without creating anything', () => {
    renderCreate()

    expect(screen.getByRole('link', { name: 'Cancel' })).toHaveAttribute('href', '/trips')
    expect(storedTrips()).toHaveLength(0)
  })
})
