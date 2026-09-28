import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { formatDateRange } from '@/domain/format'
import { PROTOTYPE_LABEL } from '@/lib/labels'
import { createEmptyState } from '@/services/persistence'
import TripsHomePage from '@/pages/TripsHomePage'
import { demoStateFor, renderWithProviders, TEST_TRIP_ID } from '@/test/renderWithProviders'

function renderTripsHome() {
  return renderWithProviders(<TripsHomePage />, { route: '/trips', state: demoStateFor() })
}

describe('TripsHomePage', () => {
  it('frames the page as on-device only and offers the trip creation entry point', () => {
    renderWithProviders(<TripsHomePage />, { route: '/trips', state: createEmptyState() })

    expect(screen.getByRole('heading', { level: 1, name: 'Your trips' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent(PROTOTYPE_LABEL.localOnly)
    expect(screen.getByRole('status')).toHaveTextContent(
      `${PROTOTYPE_LABEL.noAccount}. Itinerary drafts and prices are estimates, not bookings.`,
    )
    expect(screen.getByRole('link', { name: 'Plan a new trip' })).toHaveAttribute('href', '/trips/new')
  })

  it('invites the first trip when the device has none', async () => {
    const user = userEvent.setup()
    renderWithProviders(<TripsHomePage />, { route: '/trips', state: createEmptyState() })

    expect(screen.getByText('No trips yet')).toBeInTheDocument()
    expect(
      screen.getByText(/Plan your first trip and Tourist will draft a day-by-day itinerary/),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Plan a trip' })).toHaveAttribute('href', '/trips/new')

    await user.click(screen.getByRole('button', { name: 'Restore the demo trip' }))

    expect(await screen.findByRole('heading', { name: 'Paris in the Spring' })).toBeInTheDocument()
    expect(screen.getByText('The demo trip has been restored.')).toBeInTheDocument()
  })

  it('summarises the seeded trip with its route, size and readiness', () => {
    renderTripsHome()

    expect(screen.getByRole('heading', { name: 'Paris in the Spring' })).toBeInTheDocument()
    expect(screen.getByText('Lagos, Nigeria')).toBeInTheDocument()
    expect(screen.getByText('Paris, France')).toBeInTheDocument()
    expect(screen.getByText('2 travellers')).toBeInTheDocument()
    expect(screen.getByText('7 days')).toBeInTheDocument()
    expect(screen.getByText('Itinerary ready')).toBeInTheDocument()
  })

  it('shows the date range and a pluralised count of planned stops', () => {
    const state = demoStateFor()
    const [trip] = state.trips

    renderTripsHome()

    expect(screen.getByText(formatDateRange(trip.startDate, trip.endDate))).toBeInTheDocument()
    expect(screen.getByText(/\d+ planned stops/)).toBeInTheDocument()
  })

  it('separates the trip budget from actual spend and what is left', () => {
    renderTripsHome()

    expect(screen.getByText(PROTOTYPE_LABEL.tripBudget)).toBeInTheDocument()
    expect(screen.getByText('€2,500 EUR')).toBeInTheDocument()
    expect(screen.getByText(PROTOTYPE_LABEL.actualSpent)).toBeInTheDocument()
    expect(screen.getByText('€1,385 EUR')).toBeInTheDocument()
    expect(screen.getByText(PROTOTYPE_LABEL.remaining)).toBeInTheDocument()
    expect(screen.getByText('€1,115 EUR')).toBeInTheDocument()
    expect(screen.queryByText(/Over budget by/)).not.toBeInTheDocument()
  })

  it('flags the remaining budget as negative once spending passes the ceiling', () => {
    const state = demoStateFor()
    const overBudget = {
      ...state,
      trips: state.trips.map((trip) => ({ ...trip, budget: 1000 })),
    }

    renderWithProviders(<TripsHomePage />, { route: '/trips', state: overBudget })

    expect(screen.getByText('-€385 EUR')).toBeInTheDocument()
    expect(screen.getByText('Over budget by €385 EUR')).toBeInTheDocument()
  })

  it('links each trip to its overview, itinerary and budget screens', () => {
    renderTripsHome()

    expect(screen.getByRole('link', { name: 'Overview' })).toHaveAttribute(
      'href',
      `/trips/${TEST_TRIP_ID}`,
    )
    expect(screen.getByRole('link', { name: 'Itinerary' })).toHaveAttribute(
      'href',
      `/trips/${TEST_TRIP_ID}/itinerary`,
    )
    expect(screen.getByRole('link', { name: 'Budget' })).toHaveAttribute(
      'href',
      `/trips/${TEST_TRIP_ID}/budget`,
    )
  })

  it('lists every trip that will be lost before clearing, and can be cancelled', async () => {
    const user = userEvent.setup()
    renderTripsHome()

    await user.click(screen.getByRole('button', { name: 'Clear all data' }))

    const dialog = screen.getByRole('dialog', { name: 'Clear all data?' })
    expect(dialog).toHaveAccessibleDescription(
      'This removes everything Tourist has stored in this browser. It cannot be undone.',
    )
    expect(within(dialog).getByText(/Paris in the Spring/)).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: 'Keep my data' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Paris in the Spring' })).toBeInTheDocument()
  })

  it('empties the device once the destructive action is confirmed', async () => {
    const user = userEvent.setup()
    renderTripsHome()

    await user.click(screen.getByRole('button', { name: 'Clear all data' }))
    const dialog = screen.getByRole('dialog', { name: 'Clear all data?' })
    await user.click(within(dialog).getByRole('button', { name: 'Clear all data' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByText('No trips yet')).toBeInTheDocument()
    expect(
      screen.getByText('All saved trips, itineraries and expenses have been cleared.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Overview' })).not.toBeInTheDocument()
  })

  it('replaces cleared data with a freshly generated demo trip', async () => {
    const user = userEvent.setup()
    renderWithProviders(<TripsHomePage />, { route: '/trips', state: createEmptyState() })

    await user.click(screen.getByRole('button', { name: 'Restore demo trip' }))

    expect(await screen.findByRole('heading', { name: 'Paris in the Spring' })).toBeInTheDocument()
    expect(screen.getByText('The demo trip has been restored.')).toBeInTheDocument()
    expect(screen.queryByText('No trips yet')).not.toBeInTheDocument()
  })
})
