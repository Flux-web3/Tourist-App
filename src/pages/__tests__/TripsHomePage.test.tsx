import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { formatDateRange } from '@/domain/format'
import { PROTOTYPE_LABEL } from '@/lib/labels'
import { DEMO_TRIP_ID, createEmptyState } from '@/services/persistence'
import TripsHomePage from '@/pages/TripsHomePage'
import { demoStateFor, renderWithProviders, TEST_TRIP_ID } from '@/test/renderWithProviders'

function renderTripsHome() {
  return renderWithProviders(<TripsHomePage />, { route: '/trips', state: demoStateFor() })
}

function renderEmptyTripsHome() {
  return renderWithProviders(<TripsHomePage />, { route: '/trips', state: createEmptyState() })
}

const MENU_LABEL = 'Sample data and reset options'

describe('TripsHomePage', () => {
  it('leads with the trips and keeps the entry point to a new one', () => {
    renderTripsHome()

    expect(screen.getByRole('heading', { level: 1, name: 'Your trips' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Plan a new trip' })).toHaveAttribute('href', '/trips/new')
  })

  it('puts the trip above the standing explanation of how it is stored', () => {
    renderTripsHome()

    const tripHeading = screen.getByRole('heading', { name: 'Paris in the Spring' })
    const storageClaim = screen.getByText(PROTOTYPE_LABEL.localOnly)

    expect(
      tripHeading.compareDocumentPosition(storageClaim) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('keeps the honesty as a one-line claim that opens for the detail', async () => {
    const user = userEvent.setup()
    renderTripsHome()

    const claim = screen.getByText(PROTOTYPE_LABEL.localOnly)
    const details = claim.closest('details') as HTMLDetailsElement
    expect(details).not.toBeNull()
    expect(details.open).toBe(false)

    await user.click(claim)

    expect(details.open).toBe(true)
    expect(screen.getByText(new RegExp(PROTOTYPE_LABEL.noAccount))).toBeInTheDocument()
    expect(
      screen.getByText('Itinerary drafts and prices are estimates, not bookings.'),
    ).toBeInTheDocument()
  })

  it('no longer puts developer controls above the traveller content', () => {
    renderTripsHome()

    expect(screen.queryByRole('button', { name: 'Clear all data' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Restore demo trip' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Demo data' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: MENU_LABEL })).toBeInTheDocument()
  })

  describe('the first run, when the device is genuinely empty', () => {
    it('makes planning the first trip the only primary action', () => {
      renderEmptyTripsHome()

      expect(screen.getByRole('heading', { level: 1, name: 'Your trips' })).toBeInTheDocument()
      expect(screen.getByText('Plan your first trip')).toBeInTheDocument()
      expect(
        screen.getByText(/Tell Tourist where you are going and it drafts a day-by-day itinerary/),
      ).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Plan a trip' })).toHaveAttribute('href', '/trips/new')

      // The header CTA stands down so the empty state carries a single primary action.
      expect(screen.queryByRole('link', { name: 'Plan a new trip' })).not.toBeInTheDocument()
    })

    it('offers the sample trip as a clearly secondary way to look around', async () => {
      const user = userEvent.setup()
      renderEmptyTripsHome()

      await user.click(screen.getByRole('button', { name: 'Look around a sample trip' }))

      expect(await screen.findByRole('heading', { name: 'Paris in the Spring' })).toBeInTheDocument()
      expect(screen.getByText('The sample trip has been added to your trips.')).toBeInTheDocument()
      expect(screen.queryByText('Plan your first trip')).not.toBeInTheDocument()
    })

    it('cannot wipe the device when there is nothing stored', async () => {
      const user = userEvent.setup()
      renderEmptyTripsHome()

      await user.click(screen.getByRole('button', { name: MENU_LABEL }))

      expect(screen.getByRole('menuitem', { name: 'Clear all data on this device' })).toBeDisabled()
    })
  })

  describe('telling sample data apart from the traveller own trips', () => {
    it('marks the loaded demo trip as sample data', async () => {
      const user = userEvent.setup()
      renderEmptyTripsHome()

      await user.click(screen.getByRole('button', { name: 'Look around a sample trip' }))

      const card = (await screen.findByRole('heading', { name: 'Paris in the Spring' })).closest(
        'article',
      ) as HTMLElement
      expect(within(card).getByText('Sample trip')).toBeInTheDocument()
    })

    it('leaves a trip the traveller planned unmarked', () => {
      renderTripsHome()

      expect(screen.getByRole('heading', { name: 'Paris in the Spring' })).toBeInTheDocument()
      expect(screen.queryByText('Sample trip')).not.toBeInTheDocument()
    })

    it('will not add the sample trip twice', async () => {
      const user = userEvent.setup()
      renderWithProviders(<TripsHomePage />, { route: '/trips', state: demoStateFor(DEMO_TRIP_ID) })

      await user.click(screen.getByRole('button', { name: MENU_LABEL }))

      expect(screen.getByRole('menuitem', { name: 'Sample trip already added' })).toBeDisabled()
      expect(screen.queryByRole('menuitem', { name: 'Add the sample trip' })).not.toBeInTheDocument()
    })
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

  it('separates the trip budget from actual spend and what is left, stating the currency once', () => {
    renderTripsHome()

    expect(screen.getByText(PROTOTYPE_LABEL.tripBudget)).toBeInTheDocument()
    expect(screen.getByText('€2,500')).toBeInTheDocument()
    expect(screen.getByText(PROTOTYPE_LABEL.actualSpent)).toBeInTheDocument()
    expect(screen.getByText('€1,385')).toBeInTheDocument()
    expect(screen.getByText(PROTOTYPE_LABEL.remaining)).toBeInTheDocument()
    expect(screen.getByText('€1,115')).toBeInTheDocument()

    // The code is stated once for the card rather than against every figure.
    expect(screen.getByText('EUR')).toBeInTheDocument()
    expect(screen.queryByText(/€2,500 EUR/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Over budget by/)).not.toBeInTheDocument()
  })

  it('flags the remaining budget as negative once spending passes the ceiling', () => {
    const state = demoStateFor()
    const overBudget = {
      ...state,
      trips: state.trips.map((trip) => ({ ...trip, budget: 1000 })),
    }

    renderWithProviders(<TripsHomePage />, { route: '/trips', state: overBudget })

    expect(screen.getByText('-€385')).toBeInTheDocument()
    expect(screen.getByText('Over budget by €385')).toBeInTheDocument()
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

  describe('clearing everything on this device', () => {
    async function openClearConfirmation(user: ReturnType<typeof userEvent.setup>) {
      await user.click(screen.getByRole('button', { name: MENU_LABEL }))
      await user.click(screen.getByRole('menuitem', { name: 'Clear all data on this device' }))
      return screen.getByRole('dialog', { name: 'Clear all data?' })
    }

    it('is reachable only through a deliberate menu, never as a bare link', async () => {
      const user = userEvent.setup()
      renderTripsHome()

      expect(screen.queryByRole('menuitem', { name: 'Clear all data on this device' })).not.toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: MENU_LABEL }))

      const item = screen.getByRole('menuitem', { name: 'Clear all data on this device' })
      expect(item).toBeEnabled()
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('lists every trip that will be lost, and can be cancelled', async () => {
      const user = userEvent.setup()
      renderTripsHome()

      const dialog = await openClearConfirmation(user)

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

      const dialog = await openClearConfirmation(user)
      await user.click(within(dialog).getByRole('button', { name: 'Clear all data' }))

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(screen.getByText('Plan your first trip')).toBeInTheDocument()
      expect(
        screen.getByText('All saved trips, itineraries and expenses have been cleared.'),
      ).toBeInTheDocument()
      expect(screen.queryByRole('link', { name: 'Overview' })).not.toBeInTheDocument()
    })

    it('can put the sample trip back afterwards', async () => {
      const user = userEvent.setup()
      renderTripsHome()

      const dialog = await openClearConfirmation(user)
      await user.click(within(dialog).getByRole('button', { name: 'Clear all data' }))
      await user.click(screen.getByRole('button', { name: 'Look around a sample trip' }))

      expect(await screen.findByRole('heading', { name: 'Paris in the Spring' })).toBeInTheDocument()
      expect(screen.getByText('Sample trip')).toBeInTheDocument()
    })
  })
})
