import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Link, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { addDays, formatShortDate } from '@/domain/format'
import { EXPERIENCES } from '@/data/experiences'
import { PROTOTYPE_LABEL } from '@/lib/labels'
import ExplorePage from '@/pages/ExplorePage'
import {
  FIXTURE_DAY_ONE_DATE,
  FIXTURE_ITEM_TITLES,
  FIXTURE_TRIP_ID,
  fixtureState,
  readStoredState,
} from '@/pages/__tests__/tripFixture'
import { renderWithProviders } from '@/test/renderWithProviders'
import type { PersistedState } from '@/services/contracts'
import type { Trip } from '@/domain/types'

const DAY_ONE_DATE = FIXTURE_DAY_ONE_DATE
const DAY_TWO_DATE = addDays(FIXTURE_DAY_ONE_DATE, 1)

/** The general guide's count: every city's places. */
const ALL_PLACES = `${EXPERIENCES.length} places`

const PARIS_NAMES = EXPERIENCES.filter((experience) => experience.destinationId === 'paris').map(
  (experience) => experience.name,
)
const LONDON_NAMES = EXPERIENCES.filter((experience) => experience.destinationId === 'london').map(
  (experience) => experience.name,
)
const LAGOS_NAMES = EXPERIENCES.filter((experience) => experience.destinationId === 'lagos').map(
  (experience) => experience.name,
)

const LONDON_TRIP: Partial<Trip> = {
  name: 'London Calling',
  destination: 'London, United Kingdom',
  destinationId: 'london',
  currency: 'GBP',
}

const LAGOS_TRIP: Partial<Trip> = {
  name: 'Home to Lagos',
  destination: 'Lagos, Nigeria',
  destinationId: 'lagos',
  currency: 'NGN',
}

/** No Paris place name anywhere on the page, not just in the cards. */
function expectNoParisPlaces(): void {
  const text = document.body.textContent ?? ''
  for (const name of PARIS_NAMES) {
    expect(text).not.toContain(name)
  }
}

type User = ReturnType<typeof userEvent.setup>

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

function cardNames(): (string | null)[] {
  return cards().map((card) => within(card).getByRole('heading', { level: 3 }).textContent)
}

function cardNamed(name: string | RegExp): HTMLElement {
  return screen.getByRole('heading', { level: 3, name }).closest('article') as HTMLElement
}

/** The search input, without also matching the search landmark that wraps it. */
function searchBox(): HTMLElement {
  return screen.getByRole('searchbox', { name: 'Search places' })
}

/** The collapsed control that holds max price, free-only and category. */
function filterToggle(): HTMLElement {
  return screen.getByRole('button', { name: /^Filters/ })
}

async function openFilters(user: User): Promise<void> {
  await user.click(filterToggle())
}

/** The required day picker, whose label carries a "*, required" suffix. */
function daySelect(dialog: HTMLElement): HTMLElement {
  return within(dialog).getByLabelText(/^Day/)
}

describe('ExplorePage', () => {
  it('puts the catalogue on screen without expanding anything first', async () => {
    renderAt(undefined, fixtureState())

    expect(screen.getByRole('heading', { level: 1, name: 'Explore' })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText(ALL_PLACES)).toBeInTheDocument())
    expect(cards()).toHaveLength(EXPERIENCES.length)

    // Nothing is gated behind the provenance disclosure or the filter control.
    expect(screen.queryByLabelText('Max price')).not.toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: 'Food' })).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: 'Free only' })).not.toBeInTheDocument()
    expect(filterToggle()).toHaveAttribute('aria-expanded', 'false')
  })

  it('keeps the demo-catalogue provenance as a one-line claim, one tap from the reasoning', async () => {
    const user = userEvent.setup()
    renderAt(undefined, fixtureState())
    await waitFor(() => expect(screen.getByText(ALL_PLACES)).toBeInTheDocument())

    const summary = screen.getByText('Curated demo catalogue, not live data')
    const details = summary.closest('details') as HTMLElement
    expect(details).not.toHaveAttribute('open')
    expect(details).toHaveTextContent('hand-written prototype data rather than a live listings feed')
    expect(details).toHaveTextContent('nothing in this prototype can be booked or paid for')
    expect(details).toHaveTextContent(PROTOTYPE_LABEL.informationMayChange)

    await user.click(summary)
    expect(details).toHaveAttribute('open')
  })

  it('never renders the invented ratings or review counts', async () => {
    renderAt(undefined, fixtureState())
    await waitFor(() => expect(screen.getByText(ALL_PLACES)).toBeInTheDocument())

    expect(screen.queryAllByText('star')).toHaveLength(0)
    expect(screen.queryByText(/out of 5/)).not.toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/reviews?/i)
    expect(document.body.textContent).not.toMatch(/\b4\.\d\b/)
  })

  it('still marks provenance and the estimate on every card', async () => {
    renderAt(undefined, fixtureState())
    await waitFor(() => expect(screen.getByText(ALL_PLACES)).toBeInTheDocument())

    const card = cardNamed('Louvre Museum')
    expect(within(card).getByText(PROTOTYPE_LABEL.curatedGuide)).toBeInTheDocument()
    expect(card).toHaveTextContent(PROTOTYPE_LABEL.estimatedPrice)
    expect(within(card).getByText('Culture')).toBeInTheDocument()
    expect(within(card).getByText('Demo hours: 09:00 - 18:00, closed Tuesdays')).toBeInTheDocument()
  })

  it('asks for a trip once, in the header, rather than on every card', async () => {
    renderAt(undefined, fixtureState())
    await waitFor(() => expect(screen.getByText(ALL_PLACES)).toBeInTheDocument())

    expect(screen.queryAllByRole('button', { name: 'Add to trip' })).toHaveLength(0)
    expect(
      screen.getByText('Curated places in Paris, London and Lagos. Pick a trip to add places to a day.'),
    ).toBeInTheDocument()
    const chooseTrip = screen.getAllByRole('link', { name: 'Choose a trip' })
    expect(chooseTrip).toHaveLength(1)
    expect(chooseTrip[0]).toHaveAttribute('href', '/trips')
    expect(screen.getAllByRole('link', { name: 'View details' })).toHaveLength(cards().length)
  })

  it('drops the trip query from the details link when there is no trip', async () => {
    renderAt(undefined, fixtureState())
    await waitFor(() => expect(screen.getByText(ALL_PLACES)).toBeInTheDocument())

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
      screen.getByText('Curated Paris places you can add to any day of Paris in the Spring.'),
    ).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Add to trip' })).toHaveLength(cards().length)
    expect(within(cardNamed('Louvre Museum')).getByRole('link', { name: 'View details' })).toHaveAttribute(
      'href',
      `/places/exp_louvre_museum?trip=${FIXTURE_TRIP_ID}`,
    )
  })

  it('lists the whole guide, best rated first, without quoting the rating', async () => {
    renderAt(undefined, fixtureState())

    await waitFor(() => expect(screen.getByText(ALL_PLACES)).toBeInTheDocument())
    expect(cards()).toHaveLength(EXPERIENCES.length)
    // The service still ranks on the demo rating; the figure itself stays private.
    expect(cardNames()[0]).toContain('Orsay')
    expect(cardNames()[1]).toBe('Notre-Dame de Paris')
    expect(within(cardNamed('Louvre Museum')).getByText('€22')).toBeInTheDocument()
    expect(within(cardNamed('Eiffel Tower Summit')).getByText('€29')).toBeInTheDocument()
    expect(within(cardNamed(/Métro/)).getByText('€2.30')).toBeInTheDocument()
    // Every city's places, each priced in its own currency and naming its city.
    expect(within(cardNamed('Tower of London')).getByText('£35')).toBeInTheDocument()
    expect(within(cardNamed('Tower of London')).getByText('Tower Hill · London')).toBeInTheDocument()
    expect(within(cardNamed('Lekki Conservation Centre')).getByText('₦5,000')).toBeInTheDocument()
    expect(within(cardNamed('Lekki Conservation Centre')).getByText('Lekki · Lagos')).toBeInTheDocument()
  })

  it('marks the free places as free instead of quoting a price', async () => {
    renderAt(undefined, fixtureState())

    await waitFor(() => expect(screen.getByText(ALL_PLACES)).toBeInTheDocument())
    const freeCard = cardNamed('Luxembourg Gardens')
    expect(within(freeCard).getByText('Free')).toBeInTheDocument()
    expect(within(freeCard).queryByText(/€0/)).not.toBeInTheDocument()
    expect(freeCard).toHaveTextContent(PROTOTYPE_LABEL.estimatedPrice)
  })

  it('waits for a pause in typing before it searches, with no search button to press', async () => {
    const user = userEvent.setup()
    renderWithTrip()
    await waitFor(() => expect(screen.getByText('14 places')).toBeInTheDocument())

    expect(screen.queryByRole('button', { name: 'Search' })).not.toBeInTheDocument()

    await user.type(searchBox(), 'museum')

    await waitFor(() => expect(screen.getByText('2 places')).toBeInTheDocument())
    expect(cardNames()).toEqual(['Louvre Museum', expect.stringContaining('Orsay')])
    expect(screen.queryByRole('heading', { level: 3, name: 'Eiffel Tower Summit' })).not.toBeInTheDocument()
  })

  it('searches tags and neighbourhoods, not just names', async () => {
    const user = userEvent.setup()
    renderWithTrip()
    await waitFor(() => expect(screen.getByText('14 places')).toBeInTheDocument())

    await user.type(searchBox(), 'montmartre')

    await waitFor(() => expect(screen.getByText('1 place')).toBeInTheDocument())
    expect(cards()).toHaveLength(1)
    expect(cards()[0]).toHaveTextContent('Montmartre')
  })

  it('narrows the guide to one category at a time, through the collapsed control', async () => {
    const user = userEvent.setup()
    renderWithTrip()
    await waitFor(() => expect(screen.getByText('14 places')).toBeInTheDocument())

    await openFilters(user)
    expect(filterToggle()).toHaveAttribute('aria-expanded', 'true')
    await user.click(screen.getByRole('radio', { name: 'Food' }))

    await waitFor(() => expect(screen.getByText('1 place')).toBeInTheDocument())
    expect(cards()).toHaveLength(1)
    expect(cards()[0]).toHaveTextContent('Food Walk')
    expect(screen.getByRole('radio', { name: 'Food' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'All' })).not.toBeChecked()
  })

  it('says on the closed control how many filters are hidden behind it', async () => {
    const user = userEvent.setup()
    renderWithTrip()
    await waitFor(() => expect(screen.getByText('14 places')).toBeInTheDocument())

    expect(filterToggle()).toHaveAccessibleName('Filters')

    await openFilters(user)
    await user.click(screen.getByRole('radio', { name: 'Sightseeing' }))
    await user.click(screen.getByRole('checkbox', { name: 'Free only' }))
    await waitFor(() => expect(screen.getByText('3 places')).toBeInTheDocument())

    await user.click(filterToggle())

    expect(filterToggle()).toHaveAccessibleName('Filters (2)')
    expect(screen.queryByRole('radio', { name: 'Sightseeing' })).not.toBeInTheDocument()
    expect(cards()).toHaveLength(3)
  })

  it('caps the guide at the highest estimate the traveller will pay', async () => {
    const user = userEvent.setup()
    renderWithTrip()
    await waitFor(() => expect(screen.getByText('14 places')).toBeInTheDocument())

    await openFilters(user)
    const maxPrice = screen.getByLabelText('Max price')
    await user.clear(maxPrice)
    await user.type(maxPrice, '20')

    await waitFor(() => expect(screen.getByText('10 places')).toBeInTheDocument())
    expect(maxPrice).toHaveValue(20)
    expect(screen.queryByRole('heading', { level: 3, name: 'Eiffel Tower Summit' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 3, name: /Food Walk/ })).not.toBeInTheDocument()
    expect(within(cardNamed(/Orsay/)).getByText('€16')).toBeInTheDocument()
  })

  it('treats no price cap as no cap at all, and says so once', async () => {
    const user = userEvent.setup()
    renderWithTrip()
    await waitFor(() => expect(screen.getByText('14 places')).toBeInTheDocument())

    await openFilters(user)
    expect(screen.getByText('Leave 0 for no upper limit.')).toBeInTheDocument()

    const maxPrice = screen.getByLabelText('Max price')
    await user.type(maxPrice, '20')
    await waitFor(() => expect(screen.getByText('10 places')).toBeInTheDocument())

    await user.clear(maxPrice)

    // An emptied box reads the same as 0: the whole guide comes back and the
    // closed control reports nothing hidden behind it.
    await waitFor(() => expect(screen.getByText('14 places')).toBeInTheDocument())
    expect(filterToggle()).toHaveAccessibleName('Filters')

    await user.type(maxPrice, '20')
    await waitFor(() => expect(screen.getByText('10 places')).toBeInTheDocument())
    expect(maxPrice).toHaveValue(20)
  })

  it('can strip the paid places out entirely', async () => {
    const user = userEvent.setup()
    renderWithTrip()
    await waitFor(() => expect(screen.getByText('14 places')).toBeInTheDocument())

    await openFilters(user)
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
    renderWithTrip()
    await waitFor(() => expect(screen.getByText('14 places')).toBeInTheDocument())

    await openFilters(user)
    await user.click(screen.getByRole('radio', { name: 'Sightseeing' }))
    await waitFor(() => expect(screen.getByText('6 places')).toBeInTheDocument())

    await user.click(screen.getByRole('checkbox', { name: 'Free only' }))

    await waitFor(() => expect(screen.getByText('3 places')).toBeInTheDocument())
    expect(cardNames().sort()).toEqual([
      'Le Marais Walking Route',
      'Notre-Dame de Paris',
      expect.stringContaining('Montmartre'),
    ])
  })

  it('offers a warm way back when nothing matches', async () => {
    const user = userEvent.setup()
    renderWithTrip()
    await waitFor(() => expect(screen.getByText('14 places')).toBeInTheDocument())

    await user.type(searchBox(), 'zzzz')

    await waitFor(() =>
      expect(screen.getAllByText('No places match those filters')).toHaveLength(2),
    )
    expect(screen.queryByRole('article')).not.toBeInTheDocument()
    expect(
      screen.getByText(
        'The rest of the guide is still here. Try a shorter search, another category, or a higher price cap.',
      ),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Show the whole guide' }))

    await waitFor(() => expect(screen.getByText('14 places')).toBeInTheDocument())
    expect(searchBox()).toHaveValue('')
  })

  it('offers clearing only once there is something to clear', async () => {
    const user = userEvent.setup()
    renderWithTrip()
    await waitFor(() => expect(screen.getByText('14 places')).toBeInTheDocument())

    expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument()

    await user.type(searchBox(), 'museum')
    await waitFor(() => expect(screen.getByText('2 places')).toBeInTheDocument())

    expect(screen.getByRole('button', { name: 'Clear filters' })).toBeInTheDocument()
  })

  it('puts every filter back the way it was', async () => {
    const user = userEvent.setup()
    renderWithTrip()
    await waitFor(() => expect(screen.getByText('14 places')).toBeInTheDocument())

    await user.type(searchBox(), 'museum')
    await openFilters(user)
    await user.click(screen.getByRole('radio', { name: 'Culture' }))
    await user.click(screen.getByRole('checkbox', { name: 'Free only' }))
    await waitFor(() =>
      expect(screen.getAllByText('No places match those filters')).toHaveLength(2),
    )

    await user.click(screen.getByRole('button', { name: 'Clear filters' }))

    await waitFor(() => expect(screen.getByText('14 places')).toBeInTheDocument())
    expect(searchBox()).toHaveValue('')
    expect(screen.getByLabelText('Max price')).toHaveValue(0)
    expect(screen.getByRole('radio', { name: 'All' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Free only' })).not.toBeChecked()
    expect(filterToggle()).toHaveAccessibleName('Filters')
    expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument()
  })

  it('announces the result count to assistive tech as the filters change', async () => {
    const user = userEvent.setup()
    renderWithTrip()

    const count = await waitFor(() => screen.getByText('14 places'))
    expect(count).toHaveAttribute('aria-live', 'polite')

    await user.type(searchBox(), 'montmartre')
    await waitFor(() => expect(screen.getByText('1 place')).toBeInTheDocument())
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
    it('shows the chosen day, what is already in it, and names where the place went', async () => {
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

      // Day one already holds four stops, and the sheet shows them before asking for a time.
      for (const title of FIXTURE_ITEM_TITLES.slice(0, 4)) {
        expect(within(dialog).getByText(title)).toBeInTheDocument()
      }
      expect(within(dialog).getByText('9:00 AM')).toBeInTheDocument()

      // Three hours of Louvre do not fit around day one's stops, so a time is typed.
      await user.type(within(dialog).getByLabelText('Start time'), '10:15')
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

    it('swaps the day preview when another day is picked', async () => {
      const user = userEvent.setup()
      renderWithTrip()
      await waitFor(() => expect(screen.getByText('14 places')).toBeInTheDocument())

      await user.click(within(cardNamed('Louvre Museum')).getByRole('button', { name: 'Add to trip' }))
      const dialog = screen.getByRole('dialog', { name: 'Add to Paris in the Spring' })
      await user.selectOptions(daySelect(dialog), 'day-2')

      expect(within(dialog).getByText(FIXTURE_ITEM_TITLES[4])).toBeInTheDocument()
      expect(within(dialog).queryByText(FIXTURE_ITEM_TITLES[0])).not.toBeInTheDocument()
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

    it('refuses to put the same place on the same day twice', async () => {
      const user = userEvent.setup()
      renderWithTrip()
      await waitFor(() => expect(screen.getByText('14 places')).toBeInTheDocument())

      await user.click(within(cardNamed('Louvre Museum')).getByRole('button', { name: 'Add to trip' }))
      const first = screen.getByRole('dialog', { name: 'Add to Paris in the Spring' })
      await user.type(within(first).getByLabelText('Start time'), '10:15')
      await user.click(within(first).getByRole('button', { name: 'Add to itinerary' }))
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      const louvresOnDayOne = () =>
        readStoredState()
          .daysByTrip[FIXTURE_TRIP_ID].find((day) => day.id === 'day-1')
          ?.items.filter((item) => item.experienceId === 'exp_louvre_museum').length

      expect(louvresOnDayOne()).toBe(1)

      // A second attempt on the same day is stopped, and says why.
      await user.click(within(cardNamed('Louvre Museum')).getByRole('button', { name: 'Add to trip' }))
      const dialog = screen.getByRole('dialog', { name: 'Add to Paris in the Spring' })
      expect(within(dialog).getByText('Louvre Museum is already on this day')).toBeInTheDocument()
      const add = within(dialog).getByRole('button', { name: 'Add to itinerary' })
      expect(add).toBeDisabled()
      await user.click(add)
      expect(louvresOnDayOne()).toBe(1)

      // Another day is still fine.
      await user.selectOptions(daySelect(dialog), 'day-2')
      expect(within(dialog).queryByText('Louvre Museum is already on this day')).not.toBeInTheDocument()
      expect(within(dialog).getByRole('button', { name: 'Add to itinerary' })).toBeEnabled()
    })

    it('suggests a time within the place’s usual hours when none is given', async () => {
      const user = userEvent.setup()
      renderWithTrip()
      await waitFor(() => expect(screen.getByText('14 places')).toBeInTheDocument())

      await user.click(within(cardNamed('Eiffel Tower Summit')).getByRole('button', { name: 'Add to trip' }))
      const dialog = screen.getByRole('dialog', { name: 'Add to Paris in the Spring' })
      expect(daySelect(dialog)).toHaveValue('day-1')
      expect(
        within(dialog).getByText(
          "Optional. Left empty, Tourist suggests a time within the place's usual hours that fits around the day's other stops.",
        ),
      ).toBeInTheDocument()
      expect(within(dialog).queryByText("Optional. Left empty, it goes after the day's last stop.")).not.toBeInTheDocument()
      // Day one runs 9:00, 13:00, 16:00 and 19:30; 2 hr 30 min fit between the first two.
      expect(
        within(dialog).getByText('Suggested: 10:15 AM, within its usual hours 09:30–23:45. You can change it.'),
      ).toBeInTheDocument()

      // Typing a time replaces the suggestion.
      await user.type(within(dialog).getByLabelText('Start time'), '14:00')
      expect(within(dialog).queryByText(/^Suggested:/)).not.toBeInTheDocument()
      await user.clear(within(dialog).getByLabelText('Start time'))
      expect(within(dialog).getByText(/^Suggested: 10:15 AM/)).toBeInTheDocument()

      await user.click(within(dialog).getByRole('button', { name: 'Add to itinerary' }))

      await waitFor(() =>
        expect(
          screen.getByText('Tourist suggested the 10:15 AM start; you can change it in the itinerary.'),
        ).toBeInTheDocument(),
      )
      const dayOne = readStoredState().daysByTrip[FIXTURE_TRIP_ID].find((day) => day.id === 'day-1')
      expect(dayOne?.items).toHaveLength(5)
      const added = dayOne?.items.find((item) => item.experienceId === 'exp_eiffel_tower')
      expect(added).toMatchObject({ startTime: '10:15', endTime: '12:45' })
      expect(dayOne?.items.map((item) => item.startTime)).toEqual(['09:00', '10:15', '13:00', '16:00', '19:30'])
    })

    it('says when nothing fits, and adds only once a time is typed or another day is chosen', async () => {
      const user = userEvent.setup()
      renderWithTrip()
      await waitFor(() => expect(screen.getByText('14 places')).toBeInTheDocument())

      await user.click(within(cardNamed('Louvre Museum')).getByRole('button', { name: 'Add to trip' }))
      const dialog = screen.getByRole('dialog', { name: 'Add to Paris in the Spring' })
      expect(within(dialog).getByText('No time fits on Day 1')).toBeInTheDocument()
      expect(
        within(dialog).getByText(
          "Louvre Museum (3 hr) does not fit within its usual hours 09:00–18:00 around this day's other stops. Enter a start time, or choose another day.",
        ),
      ).toBeInTheDocument()
      expect(within(dialog).queryByText(/^Suggested:/)).not.toBeInTheDocument()
      const add = within(dialog).getByRole('button', { name: 'Add to itinerary' })
      expect(add).toBeDisabled()
      await user.click(add)
      expect(readStoredState().daysByTrip[FIXTURE_TRIP_ID].find((day) => day.id === 'day-1')?.items).toHaveLength(4)

      // Another day with room gets a suggestion and can be saved.
      await user.selectOptions(daySelect(dialog), 'day-2')
      expect(within(dialog).queryByText('No time fits on Day 2')).not.toBeInTheDocument()
      expect(within(dialog).getByText(/^Suggested: 10:45 AM, within its usual hours 09:00–18:00/)).toBeInTheDocument()
      expect(within(dialog).getByRole('button', { name: 'Add to itinerary' })).toBeEnabled()

      // Back on the full day, a typed time is the traveller's choice and is kept as given.
      await user.selectOptions(daySelect(dialog), 'day-1')
      expect(within(dialog).getByRole('button', { name: 'Add to itinerary' })).toBeDisabled()
      await user.type(within(dialog).getByLabelText('Start time'), '20:45')
      expect(within(dialog).queryByText('No time fits on Day 1')).not.toBeInTheDocument()
      await user.click(within(dialog).getByRole('button', { name: 'Add to itinerary' }))

      await waitFor(() => expect(screen.getByText(/Louvre Museum was added to Day 1/)).toBeInTheDocument())
      expect(screen.queryByText(/Tourist suggested/)).not.toBeInTheDocument()
      const dayOne = readStoredState().daysByTrip[FIXTURE_TRIP_ID].find((day) => day.id === 'day-1')
      expect(dayOne?.items.find((item) => item.experienceId === 'exp_louvre_museum')?.startTime).toBe('20:45')
    })

    it('suggests an evening slot for an evening venue', async () => {
      const user = userEvent.setup()
      renderAt(FIXTURE_TRIP_ID, fixtureState({ trip: LONDON_TRIP }))
      await waitFor(() => expect(cardNamed('West End Theatre Night')).toBeInTheDocument())

      await user.click(within(cardNamed('West End Theatre Night')).getByRole('button', { name: 'Add to trip' }))
      const dialog = screen.getByRole('dialog', { name: 'Add to London Calling' })
      await user.selectOptions(daySelect(dialog), 'day-2')
      expect(
        within(dialog).getByText('Suggested: 7:30 PM, within its usual hours from 19:30. You can change it.'),
      ).toBeInTheDocument()
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

  describe('follows the trip to its destination', () => {
    it('shows a London trip only London places, and nothing from Paris', async () => {
      renderWithTrip(fixtureState({ trip: LONDON_TRIP }))

      await waitFor(() => expect(screen.getByText(`${LONDON_NAMES.length} places`)).toBeInTheDocument())
      expect(
        screen.getByText('Curated London places you can add to any day of London Calling.'),
      ).toBeInTheDocument()
      expect([...cardNames()].sort()).toEqual([...LONDON_NAMES].sort())
      for (const card of cards()) {
        expect(card).toHaveTextContent('London')
      }
      expectNoParisPlaces()
      expect(document.body.textContent).not.toMatch(/Paris/)
    })

    it('prices a London trip in pounds, down to the price cap', async () => {
      const user = userEvent.setup()
      renderWithTrip(fixtureState({ trip: LONDON_TRIP }))
      await waitFor(() => expect(screen.getByText(`${LONDON_NAMES.length} places`)).toBeInTheDocument())

      expect(within(cardNamed('Tower of London')).getByText('£35')).toBeInTheDocument()
      expect(document.body.textContent).not.toContain('€')

      await openFilters(user)
      const maxPrice = screen.getByLabelText('Max price')
      const field = maxPrice.closest('div') as HTMLElement
      expect(within(field).getByText('GBP')).toBeInTheDocument()
      expect(within(field).getByText('£')).toBeInTheDocument()
      expect(screen.queryByText('EUR')).not.toBeInTheDocument()

      await user.type(maxPrice, '20')
      await waitFor(() => expect(screen.queryByRole('heading', { level: 3, name: 'Tower of London' })).not.toBeInTheDocument())
      expect(cardNamed('Borough Market')).toBeInTheDocument()
      expectNoParisPlaces()
    })

    it('shows a Lagos trip only Lagos places, priced in naira', async () => {
      const user = userEvent.setup()
      renderWithTrip(fixtureState({ trip: LAGOS_TRIP }))

      await waitFor(() => expect(screen.getByText(`${LAGOS_NAMES.length} places`)).toBeInTheDocument())
      expect([...cardNames()].sort()).toEqual([...LAGOS_NAMES].sort())
      expect(
        screen.getByText('Curated Lagos places you can add to any day of Home to Lagos.'),
      ).toBeInTheDocument()
      expect(within(cardNamed('Lekki Conservation Centre')).getByText('₦5,000')).toBeInTheDocument()
      expectNoParisPlaces()

      await openFilters(user)
      const field = screen.getByLabelText('Max price').closest('div') as HTMLElement
      expect(within(field).getByText('NGN')).toBeInTheDocument()
      expect(within(field).getByText('₦')).toBeInTheDocument()
    })

    it('shows a Paris trip only Paris places', async () => {
      renderWithTrip()

      await waitFor(() => expect(screen.getByText(`${PARIS_NAMES.length} places`)).toBeInTheDocument())
      expect([...cardNames()].sort()).toEqual([...PARIS_NAMES].sort())
      const text = document.body.textContent ?? ''
      for (const name of [...LONDON_NAMES, ...LAGOS_NAMES]) {
        expect(text).not.toContain(name)
      }
    })

    it('follows the route from a London trip to a Paris trip without a stale result', async () => {
      const user = userEvent.setup()
      const londonTrip = {
        ...fixtureState({ trip: LONDON_TRIP }).trips[0],
        id: 'trip-london',
      }
      const state = fixtureState({ extraTrips: [londonTrip] })
      renderWithProviders(
        <>
          <nav>
            <Link to={`/trips/${FIXTURE_TRIP_ID}/explore`}>Go to the Paris trip</Link>
            <Link to="/trips/trip-london/explore">Go to the London trip</Link>
          </nav>
          <Routes>
            <Route path="/trips/:tripId/explore" element={<ExplorePage />} />
          </Routes>
        </>,
        { route: '/trips/trip-london/explore', state },
      )

      await waitFor(() => expect(screen.getByText(`${LONDON_NAMES.length} places`)).toBeInTheDocument())
      expectNoParisPlaces()

      // Same route pattern, same page component; only the param changes.
      await user.click(screen.getByRole('link', { name: 'Go to the Paris trip' }))

      // Never a moment where the London list is shown under the Paris trip.
      expect(screen.queryByRole('heading', { level: 3, name: 'Tower of London' })).not.toBeInTheDocument()
      await waitFor(() => expect(screen.getByText(`${PARIS_NAMES.length} places`)).toBeInTheDocument())
      expect(
        screen.getByText('Curated Paris places you can add to any day of Paris in the Spring.'),
      ).toBeInTheDocument()
      expect([...cardNames()].sort()).toEqual([...PARIS_NAMES].sort())
      for (const name of LONDON_NAMES) {
        expect(document.body.textContent).not.toContain(name)
      }

      await user.click(screen.getByRole('link', { name: 'Go to the London trip' }))
      await waitFor(() => expect(screen.getByText(`${LONDON_NAMES.length} places`)).toBeInTheDocument())
      expectNoParisPlaces()
    })

    it('says plainly when the destination has no places yet, and shows nothing from Paris', async () => {
      renderWithTrip(
        fixtureState({
          trip: { name: 'Tokyo Lights', destination: 'Tokyo, Japan', destinationId: 'tokyo', currency: 'JPY' },
        }),
      )

      expect(
        await screen.findByRole('heading', { level: 2, name: 'Explore is still growing for Tokyo' }),
      ).toBeInTheDocument()
      expect(screen.getByText(/does not have curated places in Tokyo yet/)).toHaveTextContent(
        'will not show places from other cities instead',
      )
      expect(screen.getByRole('link', { name: 'Open itinerary' })).toHaveAttribute(
        'href',
        `/trips/${FIXTURE_TRIP_ID}/itinerary`,
      )
      expect(screen.queryByRole('article')).not.toBeInTheDocument()
      expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Add to trip' })).not.toBeInTheDocument()
      expectNoParisPlaces()
      for (const name of [...LONDON_NAMES, ...LAGOS_NAMES]) {
        expect(document.body.textContent).not.toContain(name)
      }
    })

    it('says plainly when a legacy trip has a destination the guide does not know', async () => {
      renderWithTrip(
        fixtureState({
          trip: { name: 'Lisbon Weekend', destination: 'Lisbon, Portugal', destinationId: null },
        }),
      )

      expect(
        await screen.findByRole('heading', {
          level: 2,
          name: 'Explore does not cover Lisbon, Portugal yet',
        }),
      ).toBeInTheDocument()
      expect(screen.getByText(/will not show places from another city instead/)).toBeInTheDocument()
      expect(screen.queryByRole('article')).not.toBeInTheDocument()
      expectNoParisPlaces()
    })
  })

  describe('the general guide', () => {
    it('filters by city with a labelled, keyboard-operable radio group', async () => {
      const user = userEvent.setup()
      renderAt(undefined, fixtureState())
      await waitFor(() => expect(screen.getByText(ALL_PLACES)).toBeInTheDocument())

      const group = screen.getByRole('group', { name: 'City' })
      const options = within(group).getAllByRole('radio')
      expect(options.map((option) => option.getAttribute('value'))).toEqual([
        'all',
        'paris',
        'london',
        'lagos',
      ])
      // Only cities that have places are offered.
      expect(within(group).queryByRole('radio', { name: 'Tokyo' })).not.toBeInTheDocument()
      expect(within(group).getByRole('radio', { name: 'All cities' })).toBeChecked()

      await user.click(within(group).getByRole('radio', { name: 'London' }))
      await waitFor(() => expect(screen.getByText(`${LONDON_NAMES.length} places`)).toBeInTheDocument())
      expect([...cardNames()].sort()).toEqual([...LONDON_NAMES].sort())
      expectNoParisPlaces()

      // Arrow keys move between radios in a group, as they should.
      await user.keyboard('{ArrowRight}')
      expect(within(group).getByRole('radio', { name: 'Lagos' })).toBeChecked()
      await waitFor(() => expect(screen.getByText(`${LAGOS_NAMES.length} places`)).toBeInTheDocument())
      expect([...cardNames()].sort()).toEqual([...LAGOS_NAMES].sort())

      await user.click(within(group).getByRole('radio', { name: 'All cities' }))
      await waitFor(() => expect(screen.getByText(ALL_PLACES)).toBeInTheDocument())
    })

    it('offers a price cap only once one city, and so one currency, is chosen', async () => {
      const user = userEvent.setup()
      renderAt(undefined, fixtureState())
      await waitFor(() => expect(screen.getByText(ALL_PLACES)).toBeInTheDocument())

      await openFilters(user)
      expect(screen.queryByLabelText('Max price')).not.toBeInTheDocument()
      expect(screen.getByText(/Each city is priced in its own currency/)).toBeInTheDocument()

      await user.click(screen.getByRole('radio', { name: 'Lagos' }))
      const field = screen.getByLabelText('Max price').closest('div') as HTMLElement
      expect(within(field).getByText('NGN')).toBeInTheDocument()

      await user.type(screen.getByLabelText('Max price'), '4000')
      await waitFor(() => expect(screen.getByText('3 places')).toBeInTheDocument())

      // Switching city drops a cap that was typed in another currency.
      await user.click(screen.getByRole('radio', { name: 'London' }))
      expect(screen.getByLabelText('Max price')).toHaveValue(0)
      await waitFor(() => expect(screen.getByText(`${LONDON_NAMES.length} places`)).toBeInTheDocument())
    })
  })

  it('only points the Filters button at its panel while the panel exists', async () => {
    const user = userEvent.setup()
    renderAt(undefined, fixtureState())
    await waitFor(() => expect(screen.getByText(ALL_PLACES)).toBeInTheDocument())

    // Closed, the panel is not rendered, so there is nothing for the id to name.
    expect(filterToggle()).toHaveAttribute('aria-expanded', 'false')
    expect(filterToggle()).not.toHaveAttribute('aria-controls')

    await openFilters(user)
    expect(filterToggle()).toHaveAttribute('aria-expanded', 'true')
    const panelId = filterToggle().getAttribute('aria-controls')
    expect(panelId).toBeTruthy()
    expect(document.getElementById(panelId ?? '')).toContainElement(screen.getByRole('radio', { name: 'Food' }))

    await openFilters(user)
    expect(filterToggle()).not.toHaveAttribute('aria-controls')
  })
})
