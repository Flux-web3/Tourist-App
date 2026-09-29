import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { addDays, formatShortDate } from '@/domain/format'
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

const DAY_ONE_DATE = FIXTURE_DAY_ONE_DATE
const DAY_TWO_DATE = addDays(FIXTURE_DAY_ONE_DATE, 1)

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
    await waitFor(() => expect(screen.getByText('14 places')).toBeInTheDocument())
    expect(cards()).toHaveLength(14)

    // Nothing is gated behind the provenance disclosure or the filter control.
    expect(screen.queryByLabelText('Max price')).not.toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: 'Food' })).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: 'Free only' })).not.toBeInTheDocument()
    expect(filterToggle()).toHaveAttribute('aria-expanded', 'false')
  })

  it('keeps the demo-catalogue provenance as a one-line claim, one tap from the reasoning', async () => {
    const user = userEvent.setup()
    renderAt(undefined, fixtureState())
    await waitFor(() => expect(screen.getByText('14 places')).toBeInTheDocument())

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
    await waitFor(() => expect(screen.getByText('14 places')).toBeInTheDocument())

    expect(screen.queryAllByText('star')).toHaveLength(0)
    expect(screen.queryByText(/out of 5/)).not.toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/reviews?/i)
    expect(document.body.textContent).not.toMatch(/\b4\.\d\b/)
  })

  it('still marks provenance and the estimate on every card', async () => {
    renderAt(undefined, fixtureState())
    await waitFor(() => expect(screen.getByText('14 places')).toBeInTheDocument())

    const card = cardNamed('Louvre Museum')
    expect(within(card).getByText(PROTOTYPE_LABEL.curatedGuide)).toBeInTheDocument()
    expect(card).toHaveTextContent(PROTOTYPE_LABEL.estimatedPrice)
    expect(within(card).getByText('Culture')).toBeInTheDocument()
    expect(within(card).getByText('Demo hours: 09:00 - 18:00, closed Tuesdays')).toBeInTheDocument()
  })

  it('asks for a trip once, in the header, rather than on all fourteen cards', async () => {
    renderAt(undefined, fixtureState())
    await waitFor(() => expect(screen.getByText('14 places')).toBeInTheDocument())

    expect(screen.queryAllByRole('button', { name: 'Add to trip' })).toHaveLength(0)
    expect(
      screen.getByText('Pick a trip to add places to a day.'),
    ).toBeInTheDocument()
    const chooseTrip = screen.getAllByRole('link', { name: 'Choose a trip' })
    expect(chooseTrip).toHaveLength(1)
    expect(chooseTrip[0]).toHaveAttribute('href', '/trips')
    expect(screen.getAllByRole('link', { name: 'View details' })).toHaveLength(cards().length)
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

    await waitFor(() => expect(screen.getByText('14 places')).toBeInTheDocument())
    expect(cards()).toHaveLength(14)
    // The service still ranks on the demo rating; the figure itself stays private.
    expect(cardNames()[0]).toContain('Orsay')
    expect(cardNames()[1]).toBe('Notre-Dame de Paris')
    expect(within(cardNamed('Louvre Museum')).getByText('€22')).toBeInTheDocument()
    expect(within(cardNamed('Eiffel Tower Summit')).getByText('€29')).toBeInTheDocument()
    expect(within(cardNamed(/Métro/)).getByText('€2.30')).toBeInTheDocument()
  })

  it('marks the free places as free instead of quoting a price', async () => {
    renderAt(undefined, fixtureState())

    await waitFor(() => expect(screen.getByText('14 places')).toBeInTheDocument())
    const freeCard = cardNamed('Luxembourg Gardens')
    expect(within(freeCard).getByText('Free')).toBeInTheDocument()
    expect(within(freeCard).queryByText(/€0/)).not.toBeInTheDocument()
    expect(freeCard).toHaveTextContent(PROTOTYPE_LABEL.estimatedPrice)
  })

  it('waits for a pause in typing before it searches, with no search button to press', async () => {
    const user = userEvent.setup()
    renderAt(undefined, fixtureState())
    await waitFor(() => expect(screen.getByText('14 places')).toBeInTheDocument())

    expect(screen.queryByRole('button', { name: 'Search' })).not.toBeInTheDocument()

    await user.type(searchBox(), 'museum')

    await waitFor(() => expect(screen.getByText('2 places')).toBeInTheDocument())
    expect(cardNames()).toEqual(['Louvre Museum', expect.stringContaining('Orsay')])
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

  it('narrows the guide to one category at a time, through the collapsed control', async () => {
    const user = userEvent.setup()
    renderAt(undefined, fixtureState())
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
    renderAt(undefined, fixtureState())
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
    renderAt(undefined, fixtureState())
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
    renderAt(undefined, fixtureState())
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
    renderAt(undefined, fixtureState())
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
    renderAt(undefined, fixtureState())
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
    renderAt(undefined, fixtureState())
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
    renderAt(undefined, fixtureState())
    await waitFor(() => expect(screen.getByText('14 places')).toBeInTheDocument())

    expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument()

    await user.type(searchBox(), 'museum')
    await waitFor(() => expect(screen.getByText('2 places')).toBeInTheDocument())

    expect(screen.getByRole('button', { name: 'Clear filters' })).toBeInTheDocument()
  })

  it('puts every filter back the way it was', async () => {
    const user = userEvent.setup()
    renderAt(undefined, fixtureState())
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
    renderAt(undefined, fixtureState())

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
      await user.click(
        within(screen.getByRole('dialog', { name: 'Add to Paris in the Spring' })).getByRole('button', {
          name: 'Add to itinerary',
        }),
      )
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

    it('puts the place after the last stop when no time is given', async () => {
      const user = userEvent.setup()
      renderWithTrip()
      await waitFor(() => expect(screen.getByText('14 places')).toBeInTheDocument())

      await user.click(within(cardNamed('Eiffel Tower Summit')).getByRole('button', { name: 'Add to trip' }))
      const dialog = screen.getByRole('dialog', { name: 'Add to Paris in the Spring' })
      expect(daySelect(dialog)).toHaveValue('day-1')
      expect(within(dialog).getByText("Optional. Left empty, it goes after the day's last stop.")).toBeInTheDocument()
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
