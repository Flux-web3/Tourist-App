import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { addDays, formatShortDate } from '@/domain/format'
import { PROTOTYPE_LABEL } from '@/lib/labels'
import ExplorePage from '@/pages/ExplorePage'
import {
  FIXTURE_DAY_ONE_DATE,
  FIXTURE_TRIP_ID,
  fixtureState,
  readStoredState,
} from '@/pages/__tests__/tripFixture'
import { renderWithProviders } from '@/test/renderWithProviders'
import type { PersistedState } from '@/services/contracts'

const DAY_ONE_DATE = FIXTURE_DAY_ONE_DATE
const DAY_TWO_DATE = addDays(FIXTURE_DAY_ONE_DATE, 1)

function renderAt(tripId: string | undefined, state: PersistedState) {
  return renderWithProviders(
    <Routes>
      <Route path="/trips/:tripId/explore" element={<ExplorePage />} />
      <Route path="/explore" element={<ExplorePage />} />
    </Routes>,
    { route: tripId ? `/trips/${tripId}/explore` : '/explore', state },
  )
}

function renderWithTrip(state: PersistedState = fixtureState()) {
  return renderAt(FIXTURE_TRIP_ID, state)
}

function places(): HTMLElement {
  return screen.getByRole('region', { name: 'Places' })
}

function cards(): HTMLElement[] {
  return within(places()).getAllByRole('article')
}

function cardNamed(name: string | RegExp): HTMLElement {
  return screen.getByRole('heading', { level: 3, name }).closest('article') as HTMLElement
}

/** The demo review count, e.g. `9,840 demo reviews`. */
function reviewsOf(card: HTMLElement): number {
  const label = within(card).getByText(/demo reviews$/)
  const match = label.textContent?.match(/([\d,]+) demo reviews$/) ?? null
  if (!match) throw new Error('no review count on this card')
  return Number(match[1].replace(',', ''))
}

/** The star rating span, e.g. `4.7`, ignoring the adjacent "out of 5" text. */
function ratingOf(card: HTMLElement): number {
  const match = card.textContent?.match(/(\d\.\d)out of 5/) ?? null
  if (!match) throw new Error('no rating on this card')
  return Number(match[1])
}

/** The search input, without also matching the search landmark that wraps it. */
function searchBox(): HTMLElement {
  return screen.getByRole('searchbox', { name: 'Search places' })
}

/** The required day picker, whose label carries a "*, required" suffix. */
function daySelect(dialog: HTMLElement): HTMLElement {
  return within(dialog).getByLabelText(/^Day/)
}

describe('ExplorePage', () => {
  it('introduces the guide and says out loud that it is demo data', () => {
    renderAt(undefined, fixtureState())

    expect(screen.getByRole('heading', { level: 1, name: 'Explore' })).toBeInTheDocument()
    expect(screen.getByText(PROTOTYPE_LABEL.curatedGuide)).toBeInTheDocument()
    expect(
      screen.getByText(
        'Browse the curated Paris guide, then pick a trip to drop places straight into an itinerary day.',
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Curated demo catalogue, not a live listings feed'),
    ).toBeInTheDocument()
  })

  it('asks for a trip before it offers to add anything, and links the way out', async () => {
    renderAt(undefined, fixtureState())
    await waitFor(() => expect(screen.getByText('14 places')).toBeInTheDocument())

    expect(screen.queryAllByRole('button', { name: 'Add to trip' })).toHaveLength(0)
    expect(
      screen.getAllByText('Pick a trip first and this place can be dropped straight into an itinerary day.'),
    ).toHaveLength(cards().length)
    expect(screen.getAllByRole('link', { name: 'Choose a trip' })).toHaveLength(cards().length)
    expect(screen.getAllByRole('link', { name: 'Choose a trip' })[0]).toHaveAttribute('href', '/trips')
  })

  it('drops the trip query from the details link when there is no trip', async () => {
    renderAt(undefined, fixtureState())
    await waitFor(() => expect(screen.getByText('14 places')).toBeInTheDocument())

    expect(within(cardNamed('Louvre Museum')).getByRole('link', { name: 'View details' })).toHaveAttribute(
      'href',
      '/places/exp_louvre_museum',
    )
  })

  it('frames the guide around the trip and offers to add from every card', async () => {
    renderWithTrip()
    await waitFor(() => expect(screen.getByText('14 places')).toBeInTheDocument())

    expect(screen.getByText('Paris in the Spring')).toBeInTheDocument()
    expect(
      screen.getByText('Curated Paris places you can add to Paris in the Spring, one day at a time.'),
    ).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Add to trip' })).toHaveLength(cards().length)
    expect(within(cardNamed('Louvre Museum')).getByRole('link', { name: 'View details' })).toHaveAttribute(
      'href',
      `/places/exp_louvre_museum?trip=${FIXTURE_TRIP_ID}`,
    )
  })

  it('lists the whole guide, best rated first', async () => {
    renderAt(undefined, fixtureState())

    await waitFor(() => expect(screen.getByText('14 places')).toBeInTheDocument())
    expect(cards()).toHaveLength(14)
    const ratings = cards().map(ratingOf)
    expect(ratings).toEqual([...ratings].sort((a, b) => b - a))
    expect(ratings[0]).toBe(4.8)
    expect(reviewsOf(cardNamed('Louvre Museum'))).toBe(9840)
    expect(within(cardNamed('Louvre Museum')).getByText('€22 EUR')).toBeInTheDocument()
    expect(within(cardNamed('Eiffel Tower Summit')).getByText('€29 EUR')).toBeInTheDocument()
  })

  it('marks the free places as free instead of quoting a price', async () => {
    renderAt(undefined, fixtureState())

    await waitFor(() => expect(screen.getByText('14 places')).toBeInTheDocument())
    const freeCard = cardNamed('Luxembourg Gardens')
    expect(within(freeCard).getByText('Free')).toBeInTheDocument()
    expect(within(freeCard).queryByText('€0')).not.toBeInTheDocument()
    expect(freeCard).toHaveTextContent(PROTOTYPE_LABEL.estimatedPrice)
  })

  it('waits for a pause in typing before it searches', async () => {
    const user = userEvent.setup()
    renderAt(undefined, fixtureState())
    await waitFor(() => expect(screen.getByText('14 places')).toBeInTheDocument())

    await user.type(searchBox(), 'museum')

    await waitFor(() => expect(screen.getByText('2 places')).toBeInTheDocument())
    expect(cards().map((card) => within(card).getByRole('heading', { level: 3 }).textContent)).toEqual([
      'Louvre Museum',
      expect.stringContaining('Orsay'),
    ])
    expect(screen.queryByRole('heading', { level: 3, name: 'Eiffel Tower Summit' })).not.toBeInTheDocument()
  })

  it('searches tags and neighbourhoods, not just names', async () => {
    const user = userEvent.setup()
    renderAt(undefined, fixtureState())
    await waitFor(() => expect(screen.getByText('14 places')).toBeInTheDocument())

    await user.type(searchBox(), 'montmartre')

    await waitFor(() => expect(screen.getByText('1 place')).toBeInTheDocument())
    expect(cards()).toHaveLength(1)
    expect(cards()[0]).toHaveTextContent('Montmartre')
  })

  it('narrows the guide to one category at a time', async () => {
    const user = userEvent.setup()
    renderAt(undefined, fixtureState())
    await waitFor(() => expect(screen.getByText('14 places')).toBeInTheDocument())

    await user.click(screen.getByRole('radio', { name: 'Food' }))

    await waitFor(() => expect(screen.getByText('1 place')).toBeInTheDocument())
    expect(cards()).toHaveLength(1)
    expect(cards()[0]).toHaveTextContent('Food Walk')
    expect(screen.getByRole('radio', { name: 'Food' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'All' })).not.toBeChecked()
  })

  it('caps the guide at the highest estimate the traveller will pay', async () => {
    const user = userEvent.setup()
    renderAt(undefined, fixtureState())
    await waitFor(() => expect(screen.getByText('14 places')).toBeInTheDocument())

    const maxPrice = screen.getByLabelText('Max price')
    await user.clear(maxPrice)
    await user.type(maxPrice, '20')

    await waitFor(() => expect(screen.getByText('10 places')).toBeInTheDocument())
    expect(maxPrice).toHaveValue(20)
    expect(screen.queryByRole('heading', { level: 3, name: 'Eiffel Tower Summit' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 3, name: /Food Walk/ })).not.toBeInTheDocument()
    expect(cardNamed(/Orsay/)).toHaveTextContent('€16 EUR')
  })

  it('treats no price cap as no cap at all', async () => {
    const user = userEvent.setup()
    renderAt(undefined, fixtureState())
    await waitFor(() => expect(screen.getByText('14 places')).toBeInTheDocument())

    const maxPrice = screen.getByLabelText('Max price')
    await user.type(maxPrice, '20')
    await waitFor(() => expect(screen.getByText('10 places')).toBeInTheDocument())

    await user.clear(maxPrice)

    await waitFor(() => expect(screen.getByText('14 places')).toBeInTheDocument())
    expect(maxPrice).toHaveValue(0)
  })

  it('can strip the paid places out entirely', async () => {
    const user = userEvent.setup()
    renderAt(undefined, fixtureState())
    await waitFor(() => expect(screen.getByText('14 places')).toBeInTheDocument())

    await user.click(screen.getByRole('checkbox', { name: 'Free only' }))

    await waitFor(() => expect(screen.getByText('6 places')).toBeInTheDocument())
    expect(cards()).toHaveLength(6)
    for (const card of cards()) {
      expect(within(card).getByText('Free')).toBeInTheDocument()
    }
    expect(screen.queryByRole('heading', { level: 3, name: 'Eiffel Tower Summit' })).not.toBeInTheDocument()
    expect(cardNamed('Luxembourg Gardens')).toBeInTheDocument()
  })

  it('combines a category with a price filter', async () => {
    const user = userEvent.setup()
    renderAt(undefined, fixtureState())
    await waitFor(() => expect(screen.getByText('14 places')).toBeInTheDocument())

    await user.click(screen.getByRole('radio', { name: 'Sightseeing' }))
    await waitFor(() => expect(screen.getByText('6 places')).toBeInTheDocument())

    await user.click(screen.getByRole('checkbox', { name: 'Free only' }))

    await waitFor(() => expect(screen.getByText('3 places')).toBeInTheDocument())
    expect(cards().map((card) => within(card).getByRole('heading', { level: 3 }).textContent).sort()).toEqual([
      'Le Marais Walking Route',
      'Notre-Dame de Paris',
      expect.stringContaining('Montmartre'),
    ])
  })

  it('says so, and offers a way back, when nothing matches', async () => {
    const user = userEvent.setup()
    renderAt(undefined, fixtureState())
    await waitFor(() => expect(screen.getByText('14 places')).toBeInTheDocument())

    await user.type(searchBox(), 'zzzz')

    await waitFor(() =>
      expect(screen.getAllByText('No places match those filters')).toHaveLength(2),
    )
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
    expect(
      screen.getByText(
        'Try a different search term, another category, or widen the price filter to see more of the guide.',
      ),
    ).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Clear filters' })).toHaveLength(2)
  })

  it('leaves clearing disabled until there is something to clear', async () => {
    const user = userEvent.setup()
    renderAt(undefined, fixtureState())
    await waitFor(() => expect(screen.getByText('14 places')).toBeInTheDocument())

    expect(screen.getByRole('button', { name: 'Clear filters' })).toBeDisabled()
    expect(screen.getByText('Showing the whole curated guide. No filters applied.')).toBeInTheDocument()

    await user.type(searchBox(), 'museum')
    await waitFor(() => expect(screen.getByText('2 places')).toBeInTheDocument())

    expect(screen.getByRole('button', { name: 'Clear filters' })).toBeEnabled()
    expect(screen.getByText('Filters are applied to the guide below.')).toBeInTheDocument()
  })

  it('puts every filter back the way it was', async () => {
    const user = userEvent.setup()
    renderAt(undefined, fixtureState())
    await waitFor(() => expect(screen.getByText('14 places')).toBeInTheDocument())

    await user.type(searchBox(), 'museum')
    await user.click(screen.getByRole('radio', { name: 'Culture' }))
    await user.click(screen.getByRole('checkbox', { name: 'Free only' }))
    await waitFor(() =>
      expect(screen.getAllByText('No places match those filters')).toHaveLength(2),
    )

    await user.click(screen.getAllByRole('button', { name: 'Clear filters' })[0])

    await waitFor(() => expect(screen.getByText('14 places')).toBeInTheDocument())
    expect(searchBox()).toHaveValue('')
    expect(screen.getByLabelText('Max price')).toHaveValue(0)
    expect(screen.getByRole('radio', { name: 'All' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Free only' })).not.toBeChecked()
    expect(screen.getByRole('button', { name: 'Clear filters' })).toBeDisabled()
  })

  it('clears an impossible search from the empty state as well', async () => {
    const user = userEvent.setup()
    renderAt(undefined, fixtureState())
    await waitFor(() => expect(screen.getByText('14 places')).toBeInTheDocument())

    await user.type(searchBox(), 'zzzz')
    await waitFor(() =>
      expect(screen.getAllByText('No places match those filters')).toHaveLength(2),
    )

    await user.click(screen.getAllByRole('button', { name: 'Clear filters' })[1])

    await waitFor(() => expect(screen.getByText('14 places')).toBeInTheDocument())
  })

  it('tells the traveller when the trip on the link is gone', () => {
    renderAt('trip-does-not-exist', fixtureState())

    expect(screen.getByText('We could not find that trip')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Explore without a trip' })).toHaveAttribute(
      'href',
      '/explore',
    )
    expect(screen.queryByRole('button', { name: 'Add to trip' })).not.toBeInTheDocument()
  })

  describe('adding a place to a trip', () => {
    it('names the place and the day it went into', async () => {
      const user = userEvent.setup()
      renderWithTrip()
      await waitFor(() => expect(screen.getByText('14 places')).toBeInTheDocument())

      await user.click(within(cardNamed('Louvre Museum')).getByRole('button', { name: 'Add to trip' }))

      const dialog = screen.getByRole('dialog', { name: 'Add to Paris in the Spring' })
      expect(within(dialog).getByText('Choose a day for Louvre Museum.')).toBeInTheDocument()
      expect(daySelect(dialog)).toHaveValue('day-1')
      expect(within(dialog).getByLabelText('Start time')).toHaveValue('')
      expect(within(dialog).getByRole('option', { name: `Day 1 · ${formatShortDate(DAY_ONE_DATE)}` })).toBeInTheDocument()
      expect(within(dialog).getByRole('option', { name: `Day 2 · ${formatShortDate(DAY_TWO_DATE)}` })).toBeInTheDocument()

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
    })

    it('puts the place in the day the traveller picked, at the time they gave', async () => {
      const user = userEvent.setup()
      renderWithTrip()
      await waitFor(() => expect(screen.getByText('14 places')).toBeInTheDocument())

      await user.click(within(cardNamed('Eiffel Tower Summit')).getByRole('button', { name: 'Add to trip' }))
      const dialog = screen.getByRole('dialog', { name: 'Add to Paris in the Spring' })
      await user.selectOptions(daySelect(dialog), 'day-2')
      await user.type(within(dialog).getByLabelText('Start time'), '14:00')
      await user.click(within(dialog).getByRole('button', { name: 'Add to itinerary' }))

      await waitFor(() =>
        expect(
          screen.getByText(
            `Eiffel Tower Summit was added to Day 2 · ${formatShortDate(DAY_TWO_DATE)} of Paris in the Spring.`,
          ),
        ).toBeInTheDocument(),
      )
      const dayTwo = readStoredState().daysByTrip[FIXTURE_TRIP_ID].find((day) => day.id === 'day-2')
      expect(dayTwo?.items).toHaveLength(2)
      const added = dayTwo?.items[1]
      expect(added?.title).toBe('Eiffel Tower Summit')
      expect(added?.startTime).toBe('14:00')
      expect(added?.endTime).toBe('16:30')
      expect(added?.estimatedCost).toBe(29)
      expect(added?.category).toBe('sightseeing')
      expect(added?.location).toBe('7th arrondissement, Paris')
      expect(added?.experienceId).toBe('exp_eiffel_tower')
    })

    it('finds the first free slot when no time is given', async () => {
      const user = userEvent.setup()
      renderWithTrip()
      await waitFor(() => expect(screen.getByText('14 places')).toBeInTheDocument())

      await user.click(within(cardNamed('Eiffel Tower Summit')).getByRole('button', { name: 'Add to trip' }))
      const dialog = screen.getByRole('dialog', { name: 'Add to Paris in the Spring' })
      expect(daySelect(dialog)).toHaveValue('day-1')
      await user.click(within(dialog).getByRole('button', { name: 'Add to itinerary' }))

      await waitFor(() => expect(screen.getByRole('link', { name: 'Open itinerary' })).toBeInTheDocument())
      const dayOne = readStoredState().daysByTrip[FIXTURE_TRIP_ID].find((day) => day.id === 'day-1')
      expect(dayOne?.items).toHaveLength(5)
      expect(dayOne?.items[4].startTime).toBe('21:00')
    })

    it('leaves the itinerary untouched when the traveller backs out', async () => {
      const user = userEvent.setup()
      renderWithTrip()
      await waitFor(() => expect(screen.getByText('14 places')).toBeInTheDocument())

      await user.click(within(cardNamed('Louvre Museum')).getByRole('button', { name: 'Add to trip' }))
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
})
