import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { addDays, formatShortDate } from '@/domain/format'
import { PROTOTYPE_LABEL } from '@/lib/labels'
import PlaceDetailsPage from '@/pages/PlaceDetailsPage'
import { FIXTURE_DAY_ONE_DATE, FIXTURE_TRIP_ID, fixtureState, readStoredState } from '@/pages/__tests__/tripFixture'
import { renderWithProviders } from '@/test/renderWithProviders'
import type { PersistedState } from '@/services/contracts'

const DAY_ONE_DATE = FIXTURE_DAY_ONE_DATE
const DAY_TWO_DATE = addDays(FIXTURE_DAY_ONE_DATE, 1)

function renderPlace(experienceId: string, options: { tripId?: string; state?: PersistedState } = {}) {
  const { tripId, state = fixtureState() } = options
  return renderWithProviders(
    <Routes>
      <Route path="/places/:experienceId" element={<PlaceDetailsPage />} />
    </Routes>,
    { route: `/places/${experienceId}${tripId ? `?trip=${tripId}` : ''}`, state },
  )
}

function daySelect(dialog: HTMLElement): HTMLElement {
  return within(dialog).getByLabelText(/^Day/)
}

describe('PlaceDetailsPage', () => {
  it('shows the whole record for one curated place', async () => {
    renderPlace('exp_louvre_museum')

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Louvre Museum' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Culture')).toBeInTheDocument()
    expect(screen.getByText(PROTOTYPE_LABEL.curatedGuide)).toBeInTheDocument()
    expect(
      screen.getByText('The monumental collection, with a timed-entry route that avoids the queue.'),
    ).toBeInTheDocument()
    expect(
      screen.getByText('The world’s largest museum is overwhelming without a plan. Enter through the Richelieu wing, take the Denon wing highlights first, and save the Mona Lisa for the end of the route.'),
    ).toBeInTheDocument()
    expect(screen.getByText('4.7')).toBeInTheDocument()
    expect(screen.getByText('9,840 demo reviews')).toBeInTheDocument()
    expect(screen.getByText('1st arrondissement · Paris, France')).toBeInTheDocument()
    expect(screen.getAllByText('3 hr')).toHaveLength(2)
    expect(screen.getByText('Demo hours: 09:00 - 18:00, closed Tuesdays')).toBeInTheDocument()
    expect(screen.getByText('Morning, at opening')).toBeInTheDocument()
    expect(screen.getByText('€22 EUR and up, hand-written for this prototype')).toBeInTheDocument()
    expect(screen.getByText('museum')).toBeInTheDocument()
    expect(screen.getByText('art')).toBeInTheDocument()
    expect(screen.getByText('monuments')).toBeInTheDocument()
  })

  it('says plainly that nothing on the page can be booked or paid for', async () => {
    renderPlace('exp_louvre_museum')

    await screen.findByRole('heading', { level: 1, name: 'Louvre Museum' })
    expect(screen.getByText('Curated demo record, not a live listing')).toBeInTheDocument()
    expect(
      screen.getByText(
        'Ratings, opening hours and prices here are hand-written demo figures. There is no map, no live availability and no booking or payment anywhere in this prototype.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Booking not available in this prototype' })).toBeDisabled()
    expect(
      screen.getByText(
        'Live availability and opening hours are not integrated, so nothing on this page can be reserved or paid for.',
      ),
    ).toBeInTheDocument()
  })

  it('credits the photograph and says it opens in a new tab', async () => {
    renderPlace('exp_louvre_museum')

    await screen.findByRole('heading', { level: 1, name: 'Louvre Museum' })
    expect(
      screen.getByRole('img', { name: 'The Louvre Museum glass pyramid framed by the palace courtyard' }),
    ).toBeInTheDocument()
    const credit = screen.getByRole('link', { name: /CC BY-SA 3\.0 source on Wikimedia Commons/ })
    expect(credit).toHaveAttribute(
      'href',
      'https://commons.wikimedia.org/wiki/File:Louvre_Museum_Wikimedia_Commons.jpg',
    )
    expect(credit).toHaveAttribute('target', '_blank')
    expect(credit).toHaveAttribute('rel', 'noreferrer')
    expect(screen.getByText('Photo: Benh LIEU SONG ·')).toBeInTheDocument()
  })

  it('calls a free place free rather than quoting zero', async () => {
    renderPlace('exp_luxembourg_gardens')

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Luxembourg Gardens' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Free and up, hand-written for this prototype')).toBeInTheDocument()
    expect(screen.queryByText(/€0/)).not.toBeInTheDocument()
    expect(screen.getByText('Late afternoon')).toBeInTheDocument()
    expect(screen.getByText('Demo hours: 07:30 - sunset daily')).toBeInTheDocument()
  })

  it('points back at the guide, with no trip in the link when there is none', async () => {
    renderPlace('exp_sainte_chapelle')

    await screen.findByRole('heading', { level: 1, name: 'Sainte-Chapelle' })
    expect(screen.getByRole('link', { name: 'Back to explore' })).toHaveAttribute('href', '/explore')
  })

  it('points back at the guide for the trip it came from', async () => {
    renderPlace('exp_sainte_chapelle', { tripId: FIXTURE_TRIP_ID })

    await screen.findByRole('heading', { level: 1, name: 'Sainte-Chapelle' })
    expect(screen.getByRole('link', { name: 'Back to explore' })).toHaveAttribute(
      'href',
      `/trips/${FIXTURE_TRIP_ID}/explore?trip=${FIXTURE_TRIP_ID}`,
    )
  })

  it('asks for a trip before it offers to add the place', async () => {
    renderPlace('exp_sainte_chapelle')

    await screen.findByRole('heading', { level: 1, name: 'Sainte-Chapelle' })
    expect(screen.queryByRole('button', { name: 'Add to trip' })).not.toBeInTheDocument()
    expect(
      screen.getByText('Choose one of your trips to drop this place straight into an itinerary day.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Choose a trip' })).toHaveAttribute('href', '/trips')
  })

  it('offers the trip on the link', async () => {
    renderPlace('exp_sainte_chapelle', { tripId: FIXTURE_TRIP_ID })

    await screen.findByRole('heading', { level: 1, name: 'Sainte-Chapelle' })
    expect(screen.getByRole('button', { name: 'Add to trip' })).toBeInTheDocument()
    expect(
      screen.getByText(
        'Picks a day in Paris in the Spring and inserts this place without touching anything else.',
      ),
    ).toBeInTheDocument()
  })

  it('admits when the place id is not in the guide', async () => {
    renderPlace('exp_not_a_real_place')

    expect(await screen.findByText('Nothing matches that place id')).toBeInTheDocument()
    expect(screen.getByText('We could not find that place')).toBeInTheDocument()
    expect(
      screen.getByText(
        'The curated guide is a fixed set of demo records, so there is no live search behind it.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to explore' })).toHaveAttribute('href', '/explore')
  })

  it('warns when the trip on the link has been deleted', async () => {
    renderPlace('exp_sainte_chapelle', { tripId: 'trip-deleted' })

    await screen.findByRole('heading', { level: 1, name: 'Sainte-Chapelle' })
    expect(screen.getByText('That trip is no longer on this device')).toBeInTheDocument()
    expect(screen.getByText('Pick a trip and the add-to-itinerary action comes back.')).toBeInTheDocument()
    const chooseTrip = screen.getAllByRole('link', { name: 'Choose a trip' })
    expect(chooseTrip).toHaveLength(2)
    for (const link of chooseTrip) {
      expect(link).toHaveAttribute('href', '/trips')
    }
    expect(screen.queryByRole('button', { name: 'Add to trip' })).not.toBeInTheDocument()
  })

  it('adds the place to the first day in the first free slot', async () => {
    const user = userEvent.setup()
    renderPlace('exp_louvre_museum', { tripId: FIXTURE_TRIP_ID })
    await screen.findByRole('heading', { level: 1, name: 'Louvre Museum' })

    await user.click(screen.getByRole('button', { name: 'Add to trip' }))

    const dialog = screen.getByRole('dialog', { name: 'Add to Paris in the Spring' })
    expect(within(dialog).getByText('Choose a day for Louvre Museum.')).toBeInTheDocument()
    expect(within(dialog).getByText('Estimated price: €22 EUR and up')).toBeInTheDocument()
    expect(daySelect(dialog)).toHaveValue('day-1')
    await user.click(within(dialog).getByRole('button', { name: 'Add to itinerary' }))

    await waitFor(() =>
      expect(
        screen.getByText(
          `Louvre Museum was added to Day 1 · ${formatShortDate(DAY_ONE_DATE)} of Paris in the Spring.`,
        ),
      ).toBeInTheDocument(),
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open itinerary' })).toHaveAttribute(
      'href',
      `/trips/${FIXTURE_TRIP_ID}/itinerary`,
    )
    const dayOne = readStoredState().daysByTrip[FIXTURE_TRIP_ID].find((day) => day.id === 'day-1')
    expect(dayOne?.items).toHaveLength(5)
    expect(dayOne?.items[4]).toMatchObject({
      title: 'Louvre Museum',
      category: 'culture',
      startTime: '21:00',
      estimatedCost: 22,
      experienceId: 'exp_louvre_museum',
      location: '1st arrondissement, Paris',
    })
  })

  it('adds the place to the chosen day and time', async () => {
    const user = userEvent.setup()
    renderPlace('exp_sainte_chapelle', { tripId: FIXTURE_TRIP_ID })
    await screen.findByRole('heading', { level: 1, name: 'Sainte-Chapelle' })

    await user.click(screen.getByRole('button', { name: 'Add to trip' }))
    const dialog = screen.getByRole('dialog', { name: 'Add to Paris in the Spring' })
    await user.selectOptions(daySelect(dialog), 'day-2')
    await user.type(within(dialog).getByLabelText('Start time'), '10:15')
    await user.click(within(dialog).getByRole('button', { name: 'Add to itinerary' }))

    await waitFor(() =>
      expect(
        screen.getByText(
          `Sainte-Chapelle was added to Day 2 · ${formatShortDate(DAY_TWO_DATE)} of Paris in the Spring.`,
        ),
      ).toBeInTheDocument(),
    )
    const dayTwo = readStoredState().daysByTrip[FIXTURE_TRIP_ID].find((day) => day.id === 'day-2')
    expect(dayTwo?.items).toHaveLength(2)
    expect(dayTwo?.items[1]).toMatchObject({
      title: 'Sainte-Chapelle',
      startTime: '10:15',
      endTime: '11:15',
      estimatedCost: 13,
      experienceId: 'exp_sainte_chapelle',
    })
  })

  it('can be called off, leaving the itinerary alone', async () => {
    const user = userEvent.setup()
    renderPlace('exp_louvre_museum', { tripId: FIXTURE_TRIP_ID })
    await screen.findByRole('heading', { level: 1, name: 'Louvre Museum' })

    await user.click(screen.getByRole('button', { name: 'Add to trip' }))
    await user.click(
      within(screen.getByRole('dialog', { name: 'Add to Paris in the Spring' })).getByRole('button', {
        name: 'Cancel',
      }),
    )

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByText(/was added to Day/)).not.toBeInTheDocument()
    const days = readStoredState().daysByTrip[FIXTURE_TRIP_ID]
    expect(days.find((day) => day.id === 'day-1')?.items).toHaveLength(4)
    expect(days.find((day) => day.id === 'day-2')?.items).toHaveLength(1)
  })
})
