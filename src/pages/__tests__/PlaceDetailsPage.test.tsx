import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { AddToTripDialog } from '@/components/AddToTripDialog'
import { EXPERIENCES_BY_ID } from '@/data/experiences'
import { addDays, formatShortDate } from '@/domain/format'
import { PROTOTYPE_LABEL } from '@/lib/labels'
import PlaceDetailsPage from '@/pages/PlaceDetailsPage'
import { FIXTURE_DAY_ONE_DATE, FIXTURE_TRIP_ID, fixtureState, readStoredState } from '@/pages/__tests__/tripFixture'
import { renderWithProviders } from '@/test/renderWithProviders'
import type { PersistedState } from '@/services/contracts'
import { useTourist, useTrip } from '@/state/useTourist'
import type { ItineraryItem, Trip } from '@/domain/types'

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

const LONDON_TRIP: Partial<Trip> = {
  name: 'London Calling',
  destination: 'London, United Kingdom',
  destinationId: 'london',
  currency: 'GBP',
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
    expect(screen.getByText('1st arrondissement · Paris, France')).toBeInTheDocument()
    expect(screen.getAllByText('3 hr')).toHaveLength(2)
    expect(screen.getByText('Demo hours: 09:00 - 18:00, closed Tuesdays')).toBeInTheDocument()
    expect(screen.getByText('Morning, at opening')).toBeInTheDocument()
    expect(screen.getByText('museum')).toBeInTheDocument()
    expect(screen.getByText('art')).toBeInTheDocument()
    expect(screen.getByText('monuments')).toBeInTheDocument()
  })

  it('marks the price as an estimate, and states the currency once', async () => {
    renderPlace('exp_louvre_museum')

    await screen.findByRole('heading', { level: 1, name: 'Louvre Museum' })
    // One figure on the page, marked as an estimate, with the currency beside it.
    expect(screen.getByText('€22')).toBeInTheDocument()
    expect(screen.getByText(`${PROTOTYPE_LABEL.estimatedPrice} from`)).toBeInTheDocument()
    expect(screen.getByText(`EUR · ${PROTOTYPE_LABEL.informationMayChange}`)).toBeInTheDocument()
    expect(screen.queryByText(/€22\.00/)).not.toBeInTheDocument()
    expect(screen.queryByText(/EUR and up/)).not.toBeInTheDocument()
  })

  it('never renders the invented rating or review count', async () => {
    renderPlace('exp_louvre_museum')

    await screen.findByRole('heading', { level: 1, name: 'Louvre Museum' })
    expect(screen.queryAllByText('star')).toHaveLength(0)
    expect(screen.queryByText(/out of 5/)).not.toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/reviews?/i)
    expect(document.body.textContent).not.toMatch(/\b4\.\d\b/)
  })

  it('keeps the demo-record provenance as a one-line claim, one tap from the reasoning', async () => {
    const user = userEvent.setup()
    renderPlace('exp_louvre_museum')

    await screen.findByRole('heading', { level: 1, name: 'Louvre Museum' })
    const summary = screen.getByText('Curated demo record, not a live listing')
    const details = summary.closest('details') as HTMLElement
    expect(details).not.toHaveAttribute('open')
    expect(details).toHaveTextContent('hand-written prototype data, not a live listing')
    expect(details).toHaveTextContent('there is no map behind this page')

    await user.click(summary)
    expect(details).toHaveAttribute('open')
  })

  it('says plainly that nothing on the page can be booked or paid for', async () => {
    renderPlace('exp_louvre_museum')

    await screen.findByRole('heading', { level: 1, name: 'Louvre Museum' })
    expect(screen.getByText('No booking or payment in this prototype.')).toBeInTheDocument()
    // The old dead "Booking not available" control is gone; the claim is not.
    expect(screen.queryByRole('button', { name: /Booking/ })).not.toBeInTheDocument()
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
    expect(screen.getByText('Free')).toBeInTheDocument()
    expect(screen.getByText(PROTOTYPE_LABEL.estimatedPrice)).toBeInTheDocument()
    expect(screen.queryByText(/€0/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Free from|from Free/i)).not.toBeInTheDocument()
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
    expect(screen.getByText('Pick a trip to drop this place into a day.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Choose a trip' })).toHaveAttribute('href', '/trips')
  })

  it('offers the trip on the link', async () => {
    renderPlace('exp_sainte_chapelle', { tripId: FIXTURE_TRIP_ID })

    await screen.findByRole('heading', { level: 1, name: 'Sainte-Chapelle' })
    expect(screen.getByRole('button', { name: 'Add to trip' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Choose a trip' })).not.toBeInTheDocument()
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
    expect(within(dialog).getByText('Estimated price: €22 and up')).toBeInTheDocument()
    expect(daySelect(dialog)).toHaveValue('day-1')
    expect(within(dialog).getByText('Louvre highlights')).toBeInTheDocument()
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

  describe('places outside Paris', () => {
    it('shows a London place with its own city, a drawn cover and no photo credit', async () => {
      renderPlace('exp_london_tower_of_london')

      expect(await screen.findByRole('heading', { level: 1, name: 'Tower of London' })).toBeInTheDocument()
      expect(screen.getByText('Tower Hill · London, United Kingdom')).toBeInTheDocument()
      expect(
        screen.getByRole('img', { name: 'A drawn cover for the Tower of London, not a photograph' }),
      ).toBeInTheDocument()
      expect(document.querySelector('img')).toBeNull()
      expect(screen.queryByText(/^Photo:/)).not.toBeInTheDocument()
      expect(screen.queryByRole('link', { name: /Wikimedia Commons/ })).not.toBeInTheDocument()
      expect(screen.getByText('£35')).toBeInTheDocument()
      expect(screen.getByText(`GBP · ${PROTOTYPE_LABEL.informationMayChange}`)).toBeInTheDocument()
      expect(document.body.textContent).not.toMatch(/Paris|€/)
    })

    it('prices a Lagos place in naira', async () => {
      renderPlace('exp_lagos_lekki_conservation_centre')

      expect(
        await screen.findByRole('heading', { level: 1, name: 'Lekki Conservation Centre' }),
      ).toBeInTheDocument()
      expect(screen.getByText('Lekki · Lagos, Nigeria')).toBeInTheDocument()
      expect(screen.getByText('₦5,000')).toBeInTheDocument()
      expect(screen.getByText(`NGN · ${PROTOTYPE_LABEL.informationMayChange}`)).toBeInTheDocument()
    })

    it('adds a London place to a London trip, priced in pounds', async () => {
      const user = userEvent.setup()
      renderPlace('exp_london_tower_of_london', {
        tripId: FIXTURE_TRIP_ID,
        state: fixtureState({ trip: LONDON_TRIP }),
      })
      await screen.findByRole('heading', { level: 1, name: 'Tower of London' })

      await user.click(screen.getByRole('button', { name: 'Add to trip' }))
      const dialog = screen.getByRole('dialog', { name: 'Add to London Calling' })
      expect(within(dialog).getByText('Estimated price: £35 and up')).toBeInTheDocument()
      await user.click(within(dialog).getByRole('button', { name: 'Add to itinerary' }))

      await waitFor(() => expect(screen.getByText(/Tower of London was added to Day 1/)).toBeInTheDocument())
      const dayOne = readStoredState().daysByTrip[FIXTURE_TRIP_ID].find((day) => day.id === 'day-1')
      expect(dayOne?.items.at(-1)).toMatchObject({
        experienceId: 'exp_london_tower_of_london',
        currency: 'GBP',
        estimatedCost: 35,
        location: 'Tower Hill, London',
      })
    })
  })

  describe('a place in a different city from the trip', () => {
    it('does not offer a Paris trip a London place, and says why', async () => {
      renderPlace('exp_london_tower_of_london', { tripId: FIXTURE_TRIP_ID })

      await screen.findByRole('heading', { level: 1, name: 'Tower of London' })
      expect(screen.queryByRole('button', { name: 'Add to trip' })).not.toBeInTheDocument()
      expect(
        screen.getByText(
          'Tower of London is in London, and Paris in the Spring is going to Paris, so it cannot be added to that trip.',
        ),
      ).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Explore places for Paris in the Spring' })).toHaveAttribute(
        'href',
        `/trips/${FIXTURE_TRIP_ID}/explore`,
      )
    })

    it('does not offer a London trip a Paris place', async () => {
      renderPlace('exp_louvre_museum', {
        tripId: FIXTURE_TRIP_ID,
        state: fixtureState({ trip: LONDON_TRIP }),
      })

      await screen.findByRole('heading', { level: 1, name: 'Louvre Museum' })
      expect(screen.queryByRole('button', { name: 'Add to trip' })).not.toBeInTheDocument()
      expect(
        screen.getByText(
          'Louvre Museum is in Paris, and London Calling is going to London, so it cannot be added to that trip.',
        ),
      ).toBeInTheDocument()
    })

    it('treats a legacy trip with no known destination as a different city', async () => {
      renderPlace('exp_louvre_museum', {
        tripId: FIXTURE_TRIP_ID,
        state: fixtureState({
          trip: { name: 'Lisbon Weekend', destination: 'Lisbon, Portugal', destinationId: null },
        }),
      })

      await screen.findByRole('heading', { level: 1, name: 'Louvre Museum' })
      expect(screen.queryByRole('button', { name: 'Add to trip' })).not.toBeInTheDocument()
      expect(
        screen.getByText(
          'Louvre Museum is in Paris, and Lisbon Weekend is going to Lisbon, Portugal, so it cannot be added to that trip.',
        ),
      ).toBeInTheDocument()
    })

    it('has the add sheet refuse a place from another city if one is ever passed in', async () => {
      const user = userEvent.setup()
      const tower = EXPERIENCES_BY_ID.get('exp_london_tower_of_london')
      if (!tower) throw new Error('catalogue is missing the Tower of London')

      function Sheet() {
        const trip = useTrip(FIXTURE_TRIP_ID)
        return trip ? (
          <AddToTripDialog trip={trip} experience={tower as NonNullable<typeof tower>} onClose={() => {}} onAdded={() => {}} />
        ) : null
      }
      renderWithProviders(<Sheet />, { state: fixtureState() })

      const dialog = await screen.findByRole('dialog', { name: 'Add to Paris in the Spring' })
      expect(within(dialog).getByText('Tower of London is not in Paris')).toBeInTheDocument()
      expect(
        within(dialog).getByText(
          'It is in London, and Paris in the Spring is going to Paris, so it cannot be added to this trip.',
        ),
      ).toBeInTheDocument()
      const add = within(dialog).getByRole('button', { name: 'Add to itinerary' })
      expect(add).toBeDisabled()
      await user.click(add)
      expect(readStoredState().daysByTrip[FIXTURE_TRIP_ID].find((day) => day.id === 'day-1')?.items).toHaveLength(4)
      // The existing reassurance stays.
      expect(within(dialog).getByText('Only this day changes, and you can move or remove the stop later.')).toBeInTheDocument()
    })

    it('has the provider refuse a cross-destination add without touching the itinerary', async () => {
      const user = userEvent.setup()

      function Probe() {
        const { actions, hydrated } = useTourist()
        const [result, setResult] = useState<string>('none yet')
        const attempt = async (experienceId: string) => {
          const item: ItineraryItem | null = await actions.addExperienceToTrip(FIXTURE_TRIP_ID, experienceId, {
            dayId: 'day-1',
          })
          setResult(item ? `added ${item.experienceId}` : 'refused')
        }
        return (
          <>
            <button type="button" disabled={!hydrated} onClick={() => void attempt('exp_london_tower_of_london')}>
              Add London place
            </button>
            <button type="button" disabled={!hydrated} onClick={() => void attempt('exp_louvre_museum')}>
              Add Paris place
            </button>
            <p>{result}</p>
          </>
        )
      }
      renderWithProviders(<Probe />, { state: fixtureState() })

      await user.click(screen.getByRole('button', { name: 'Add London place' }))
      expect(await screen.findByText('refused')).toBeInTheDocument()
      expect(readStoredState().daysByTrip[FIXTURE_TRIP_ID].find((day) => day.id === 'day-1')?.items).toHaveLength(4)

      // Same trip, same day, a Paris place: still allowed.
      await user.click(screen.getByRole('button', { name: 'Add Paris place' }))
      expect(await screen.findByText('added exp_louvre_museum')).toBeInTheDocument()
    })

    it('has the provider refuse any place for a legacy trip with no destination', async () => {
      const user = userEvent.setup()

      function Probe() {
        const { actions, hydrated } = useTourist()
        const [result, setResult] = useState<string>('none yet')
        return (
          <>
            <button
              type="button"
              disabled={!hydrated}
              onClick={() =>
                void actions
                  .addExperienceToTrip(FIXTURE_TRIP_ID, 'exp_louvre_museum', { dayId: 'day-1' })
                  .then((item) => setResult(item ? 'added' : 'refused'))
              }
            >
              Add Paris place
            </button>
            <p>{result}</p>
          </>
        )
      }
      renderWithProviders(<Probe />, {
        state: fixtureState({ trip: { destination: 'Lisbon, Portugal', destinationId: null } }),
      })

      await user.click(screen.getByRole('button', { name: 'Add Paris place' }))
      expect(await screen.findByText('refused')).toBeInTheDocument()
    })
  })
})
