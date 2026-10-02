import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { addDays, formatDateRange, formatLongDate, todayISO } from '@/domain/format'
import { PROTOTYPE_LABEL } from '@/lib/labels'
import TripOverviewPage from '@/pages/TripOverviewPage'
import { services } from '@/services'
import { DEMO_TRIP_ID } from '@/services/persistence'
import { demoStateFor, renderWithProviders } from '@/test/renderWithProviders'
import {
  FIXTURE_DAY_ONE_DATE,
  FIXTURE_EXPENSE_DESCRIPTIONS,
  FIXTURE_ITINERARY_ESTIMATE,
  FIXTURE_ITEM_TITLES,
  FIXTURE_TRIP_ID,
  fixtureState,
  fixtureStateStartingToday,
  makeGeneration,
  readStoredState,
} from '@/pages/__tests__/tripFixture'
import type { PersistedState } from '@/services/contracts'
import { act } from 'react'
import ExplorePage from '@/pages/ExplorePage'
import { useTourist } from '@/state/useTourist'

const START = FIXTURE_DAY_ONE_DATE
const END = addDays(START, 1)
const DATE_RANGE = formatDateRange(START, END)
const MENU_LABEL = 'More actions for this trip'

function renderAt(tripId: string, state: PersistedState) {
  return renderWithProviders(
    <Routes>
      <Route path="/trips" element={<p>Trips list</p>} />
      <Route path="/trips/:tripId" element={<TripOverviewPage />} />
    </Routes>,
    { route: `/trips/${tripId}`, state },
  )
}

function renderOverview(state: PersistedState = fixtureState()) {
  return renderAt(FIXTURE_TRIP_ID, state)
}

type User = ReturnType<typeof userEvent.setup>

async function openMenu(user: User): Promise<void> {
  await user.click(screen.getByRole('button', { name: MENU_LABEL }))
}

describe('TripOverviewPage', () => {
  it('summarises the route, the dates and the travellers on one scannable line', () => {
    renderOverview()

    const summary = screen.getByRole('region', { name: 'Trip summary' })
    expect(within(summary).getByRole('heading', { level: 1, name: 'Paris in the Spring' })).toBeInTheDocument()
    expect(within(summary).getByText('Lagos, Nigeria')).toBeInTheDocument()
    expect(within(summary).getByText('Paris, France')).toBeInTheDocument()
    expect(within(summary).getByText(DATE_RANGE)).toBeInTheDocument()
    expect(within(summary).getByText('2 days')).toBeInTheDocument()
    expect(within(summary).getByText('2 travellers')).toBeInTheDocument()
    expect(within(summary).getByText('Balanced pace')).toBeInTheDocument()
    expect(within(summary).getByText('Culture')).toBeInTheDocument()
    expect(within(summary).getByText('Food')).toBeInTheDocument()
    expect(within(summary).getByText('Slow mornings')).toBeInTheDocument()
    expect(within(summary).getByRole('link', { name: 'All trips' })).toHaveAttribute('href', '/trips')
  })

  it('drops the uppercase label rows that repeated their own values', () => {
    renderOverview()

    const summary = screen.getByRole('region', { name: 'Trip summary' })
    expect(within(summary).queryByText('TRAVELLERS')).not.toBeInTheDocument()
    expect(within(summary).queryByText('DATES')).not.toBeInTheDocument()
    expect(within(summary).queryByText('PACE')).not.toBeInTheDocument()
  })

  it('separates the ceiling, the projection, the spend and what is left', () => {
    renderOverview()

    expect(screen.getByRole('heading', { level: 2, name: 'Money' })).toBeInTheDocument()
    expect(screen.getByText(PROTOTYPE_LABEL.tripBudget)).toBeInTheDocument()
    expect(screen.getByText('€2,500')).toBeInTheDocument()
    expect(screen.getByText(PROTOTYPE_LABEL.aiDraftEstimate)).toBeInTheDocument()
    expect(screen.getByText(`€${FIXTURE_ITINERARY_ESTIMATE}`)).toBeInTheDocument()
    expect(screen.getByText(PROTOTYPE_LABEL.actualSpent)).toBeInTheDocument()
    expect(screen.getByText('€1,385')).toBeInTheDocument()
    expect(screen.getByText(PROTOTYPE_LABEL.remaining)).toBeInTheDocument()
    expect(screen.getByText('€1,115')).toBeInTheDocument()
  })

  it('states the currency once for the section instead of against every figure', () => {
    renderOverview()

    expect(screen.getByText('EUR')).toBeInTheDocument()
    expect(screen.queryByText('€2,500.00 EUR')).not.toBeInTheDocument()
  })

  it('shows how much of the budget the logged spending uses', () => {
    renderOverview()

    expect(screen.getByText('Budget used')).toBeInTheDocument()
    expect(screen.getByText('55% of €2,500')).toBeInTheDocument()
    const bar = screen.getByRole('progressbar', { name: 'Trip budget used' })
    expect(bar).toHaveAttribute('aria-valuenow', '1385')
    expect(bar).toHaveAttribute('aria-valuemin', '0')
    expect(bar).toHaveAttribute('aria-valuemax', '2500')
    expect(screen.getByText('€1,115 still available.')).toBeInTheDocument()
  })

  it('flags the budget as exceeded once the logged spending passes it', () => {
    renderOverview(fixtureState({ trip: { budget: 1000 } }))

    expect(
      screen.getByText('Over budget by €385. Trim an expense or raise the trip budget.'),
    ).toBeInTheDocument()
    expect(screen.getByText('-€385')).toBeInTheDocument()
    expect(screen.getByText('139% of €1,000')).toBeInTheDocument()
    expect(screen.queryByText(/still available/)).not.toBeInTheDocument()
    // The overspend is in the text above. The bar itself stays a valid range:
    // full, never a value beyond its own maximum.
    const bar = screen.getByRole('progressbar', { name: 'Trip budget used' })
    expect(bar).toHaveAttribute('aria-valuenow', '1000')
    expect(bar).toHaveAttribute('aria-valuemax', '1000')
  })

  it('falls back to a plain message when no budget is set', () => {
    renderOverview(fixtureState({ trip: { budget: 0 } }))

    expect(screen.getByText('No trip budget set yet')).toBeInTheDocument()
    // With no budget the bar measures against 1, and stays inside that range.
    const bar = screen.getByRole('progressbar', { name: 'Trip budget used' })
    expect(bar).toHaveAttribute('aria-valuemax', '1')
    expect(bar).toHaveAttribute('aria-valuenow', '1')
  })

  it('previews the first three stops of the first planned day', () => {
    renderOverview()

    const nextUp = screen.getByRole('heading', { name: 'Next up' }).closest('section') as HTMLElement
    expect(nextUp).toHaveTextContent(formatLongDate(START))
    expect(nextUp).toHaveTextContent('Day 1 of 2')
    const stops = within(nextUp).getAllByRole('listitem')
    expect(stops).toHaveLength(3)
    expect(within(stops[0]).getByText('9:00 AM')).toBeInTheDocument()
    expect(within(stops[0]).getByText(FIXTURE_ITEM_TITLES[0])).toBeInTheDocument()
    expect(within(stops[0]).getByText('Champ de Mars, Paris')).toBeInTheDocument()
    expect(within(stops[2]).getByText(FIXTURE_ITEM_TITLES[2])).toBeInTheDocument()
    expect(within(nextUp).queryByText(FIXTURE_ITEM_TITLES[3])).not.toBeInTheDocument()
    expect(within(nextUp).getByText('1 more stop that day in the full itinerary.')).toBeInTheDocument()
  })

  it('counts the remaining stops in the plural', () => {
    const state = fixtureState()
    const [dayOne] = state.daysByTrip[FIXTURE_TRIP_ID]
    const extra = {
      ...dayOne.items[0],
      id: 'item-extra',
      title: 'Extra evening walk',
    }
    const withFive = {
      ...state,
      daysByTrip: {
        [FIXTURE_TRIP_ID]: [{ ...dayOne, items: [...dayOne.items, extra] }, ...state.daysByTrip[FIXTURE_TRIP_ID].slice(1)],
      },
    }

    renderOverview(withFive)

    expect(screen.getByText('2 more stops that day in the full itinerary.')).toBeInTheDocument()
  })

  it('calls the day today when the trip has started', () => {
    renderOverview(fixtureStateStartingToday())

    expect(screen.getByRole('heading', { name: 'Next up today' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Next up' })).not.toBeInTheDocument()
  })

  it('leaves the day label alone when the trip has not started', () => {
    renderOverview()

    expect(screen.getByRole('heading', { name: 'Next up' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Next up today' })).not.toBeInTheDocument()
  })

  it('lists everything that can be changed about the trip', () => {
    renderOverview()

    const details = screen.getByRole('heading', { name: 'Trip details' }).closest('section') as HTMLElement
    expect(within(details).getByText('Lagos, Nigeria')).toBeInTheDocument()
    expect(within(details).getByText('Paris, France')).toBeInTheDocument()
    expect(within(details).getByText('EUR (€)')).toBeInTheDocument()
    expect(within(details).getByText('Balanced')).toBeInTheDocument()
    expect(
      within(details).getByText('Keep one day light so we can follow the weather.'),
    ).toBeInTheDocument()
    expect(within(details).getByText(`${DATE_RANGE} · 2 days`)).toBeInTheDocument()
    expect(within(details).getByText('1 Feb 2026')).toBeInTheDocument()
  })

  it('says so plainly when the trip has no notes', () => {
    renderOverview(fixtureState({ trip: { notes: '' } }))

    const details = screen.getByRole('heading', { name: 'Trip details' }).closest('section') as HTMLElement
    expect(within(details).getByText('No notes yet')).toBeInTheDocument()
  })

  describe('the action hierarchy', () => {
    it('makes opening the itinerary the primary action once a plan exists', () => {
      renderOverview()

      const actions = screen.getByRole('region', { name: 'Trip actions' })
      expect(within(actions).getByRole('link', { name: 'Open the itinerary' })).toHaveAttribute(
        'href',
        `/trips/${FIXTURE_TRIP_ID}/itinerary`,
      )
      expect(within(actions).queryByRole('button', { name: 'Generate itinerary' })).not.toBeInTheDocument()
    })

    it('keeps editing and the money and notes routes as secondary actions', () => {
      renderOverview()

      const actions = screen.getByRole('region', { name: 'Trip actions' })
      expect(within(actions).getByRole('button', { name: 'Edit trip' })).toBeInTheDocument()
      expect(within(actions).getByRole('link', { name: 'Add expense' })).toHaveAttribute(
        'href',
        `/trips/${FIXTURE_TRIP_ID}/budget`,
      )
      expect(within(actions).getByRole('link', { name: 'Notes (3)' })).toHaveAttribute(
        'href',
        `/trips/${FIXTURE_TRIP_ID}/notes`,
      )
    })

    it('demotes regenerate and delete out of the visible tier', () => {
      renderOverview()

      expect(screen.queryByRole('button', { name: 'Delete trip' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Regenerate itinerary' })).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: MENU_LABEL })).toBeInTheDocument()
    })

    it('offers both of them from the overflow menu', async () => {
      const user = userEvent.setup()
      renderOverview()

      await openMenu(user)

      const menu = screen.getByRole('menu', { name: MENU_LABEL })
      expect(within(menu).getByRole('menuitem', { name: 'Regenerate itinerary' })).toBeEnabled()
      expect(within(menu).getByRole('menuitem', { name: 'Delete trip' })).toBeEnabled()
    })

    it('makes generating the draft the primary action while there is no plan', async () => {
      const user = userEvent.setup()
      const state = fixtureState()
      renderOverview({ ...state, daysByTrip: { [FIXTURE_TRIP_ID]: [] } })

      const actions = screen.getByRole('region', { name: 'Trip actions' })
      expect(within(actions).getByRole('button', { name: 'Generate itinerary' })).toBeInTheDocument()
      expect(within(actions).queryByRole('link', { name: 'Open the itinerary' })).not.toBeInTheDocument()

      await openMenu(user)
      expect(screen.getByRole('menuitem', { name: 'Regenerate itinerary' })).toBeDisabled()
    })

    it('offers to generate a draft when the trip has no stops yet, without a second button', () => {
      const state = fixtureState()
      renderOverview({ ...state, daysByTrip: { [FIXTURE_TRIP_ID]: [] } })

      expect(screen.getByText('No itinerary yet')).toBeInTheDocument()
      expect(screen.getAllByRole('button', { name: 'Generate itinerary' })).toHaveLength(1)
      expect(screen.queryByText(FIXTURE_ITEM_TITLES[0])).not.toBeInTheDocument()
      expect(screen.queryByText('1 more stop that day in the full itinerary.')).not.toBeInTheDocument()
    })
  })

  describe('marking the sample trip', () => {
    it('says so on the overview of the demo trip, and explains what that means', async () => {
      const user = userEvent.setup()
      renderAt(DEMO_TRIP_ID, demoStateFor(DEMO_TRIP_ID))

      const summary = screen.getByRole('region', { name: 'Trip summary' })
      expect(within(summary).getByText('Sample trip')).toBeInTheDocument()

      const claim = within(summary).getByText("This is Tourist's sample trip, not one you planned")
      await user.click(claim)

      expect((claim.closest('details') as HTMLDetailsElement).open).toBe(true)
      expect(within(summary).getByText(/it only exists in this browser/)).toBeInTheDocument()
    })

    it('leaves a trip the traveller planned unmarked', () => {
      renderOverview()

      expect(screen.queryByText('Sample trip')).not.toBeInTheDocument()
      expect(
        screen.queryByText("This is Tourist's sample trip, not one you planned"),
      ).not.toBeInTheDocument()
    })
  })

  describe('editing the trip', () => {
    it('opens the edit form with the current trip details and saves a change', async () => {
      const user = userEvent.setup()
      renderOverview()

      await user.click(screen.getByRole('button', { name: 'Edit trip' }))

      const dialog = screen.getByRole('dialog', { name: 'Edit trip' })
      const name = within(dialog).getByLabelText(/Trip name/)
      expect(name).toHaveValue('Paris in the Spring')
      await user.clear(name)
      await user.type(name, 'Paris in June')
      await user.click(within(dialog).getByRole('button', { name: 'Save changes' }))

      expect(screen.queryByRole('dialog', { name: 'Edit trip' })).not.toBeInTheDocument()
      expect(screen.getByRole('heading', { level: 1, name: 'Paris in June' })).toBeInTheDocument()
      expect(readStoredState().trips[0].name).toBe('Paris in June')
    })

    it('names the budget field after the chosen currency, which the symbol alone cannot announce', async () => {
      const user = userEvent.setup()
      renderOverview()

      await user.click(screen.getByRole('button', { name: 'Edit trip' }))

      const dialog = screen.getByRole('dialog', { name: 'Edit trip' })
      expect(within(dialog).getByLabelText(/Trip budget \(EUR\)/)).toHaveValue(2500)
    })

    it('renames a trip from the destination when the name is cleared', async () => {
      const user = userEvent.setup()
      renderOverview()

      await user.click(screen.getByRole('button', { name: 'Edit trip' }))
      const dialog = screen.getByRole('dialog', { name: 'Edit trip' })
      await user.clear(within(dialog).getByLabelText(/Trip name/))
      await user.clear(within(dialog).getByLabelText(/Destination/))
      await user.type(within(dialog).getByLabelText(/Destination/), 'rome')
      await user.click(within(dialog).getByRole('option', { name: /Rome/ }))
      await user.click(within(dialog).getByRole('button', { name: 'Change destination and re-draft' }))

      const [trip] = readStoredState().trips
      // Named after the city alone, not "Rome, Italy in May".
      expect(trip.name).toMatch(/^Rome in [A-Z][a-z]+$/)
      expect(trip.destinationId).toBe('rome')
    })

    it('keeps the edit form open and explains what is wrong', async () => {
      const user = userEvent.setup()
      renderOverview()

      await user.click(screen.getByRole('button', { name: 'Edit trip' }))
      const dialog = screen.getByRole('dialog', { name: 'Edit trip' })
      const destination = within(dialog).getByLabelText(/Destination/)
      await user.clear(destination)
      await user.click(within(dialog).getByRole('button', { name: 'Save changes' }))

      expect(screen.getByRole('dialog', { name: 'Edit trip' })).toBeInTheDocument()
      const summary = within(screen.getByRole('alert'))
      expect(summary.getByText('1 field needs attention')).toBeInTheDocument()
      expect(summary.getByText('Choose a destination from the list.')).toBeInTheDocument()
      expect(destination).toHaveAttribute('aria-invalid', 'true')
      expect(readStoredState().trips[0].destination).toBe('Paris, France')
    })

    it('warns that the trip has already started when the edit form opens in the past', async () => {
      const user = userEvent.setup()
      renderOverview(fixtureState({ firstDate: addDays(todayISO(), -10) }))

      await user.click(screen.getByRole('button', { name: 'Edit trip' }))

      const dialog = screen.getByRole('dialog', { name: 'Edit trip' })
      expect(within(dialog).getByText('This trip has already started')).toBeInTheDocument()
    })
  })

  describe('regenerating the draft', () => {
    it('shows the failure and reassures that manual edits are safe', () => {
      renderOverview(
        fixtureState({
          generation: makeGeneration({ status: 'error', error: 'The draft service timed out.' }),
        }),
      )

      const alert = screen.getByRole('alert')
      expect(alert).toHaveTextContent('The itinerary draft could not be regenerated')
      expect(alert).toHaveTextContent(
        'The draft service timed out. Everything you added or edited yourself is untouched.',
      )
      expect(screen.getByText('The itinerary draft could not be regenerated.')).toBeInTheDocument()
    })

    it('announces the run while it is working, and shows it without a spare button', async () => {
      const user = userEvent.setup()
      renderOverview()

      expect(screen.queryByText('Regenerating the itinerary draft.')).not.toBeInTheDocument()

      await openMenu(user)
      await user.click(screen.getByRole('menuitem', { name: 'Regenerate itinerary' }))

      expect(await screen.findByText('Regenerating the itinerary draft.')).toBeInTheDocument()
      expect(
        screen.getByText('Drafting a new itinerary. Anything you edited yourself is kept.'),
      ).toBeInTheDocument()
    })

    it('will not start a second run while one is in flight', async () => {
      const user = userEvent.setup()
      // A real run held open. A `loading` status read back from storage is not
      // in flight: the provider settles it on load, since nothing survives a reload.
      const generate = vi
        .spyOn(services.itinerary, 'generate')
        .mockImplementation(() => new Promise(() => {}))
      renderOverview()

      await openMenu(user)
      await user.click(screen.getByRole('menuitem', { name: 'Regenerate itinerary' }))
      expect(await screen.findByText('Regenerating the itinerary draft.')).toBeInTheDocument()

      await openMenu(user)
      expect(screen.getByRole('menuitem', { name: 'Regenerate itinerary' })).toBeDisabled()
      expect(generate).toHaveBeenCalledTimes(1)
    })

    it('offers Regenerate again after a reload interrupted the last run', async () => {
      const user = userEvent.setup()
      renderOverview(fixtureState({ generation: makeGeneration({ status: 'loading' }) }))

      expect(screen.getByRole('alert')).toHaveTextContent(/closed or reloaded/)
      await openMenu(user)
      expect(screen.getByRole('menuitem', { name: 'Regenerate itinerary' })).toBeEnabled()
    })
  })

  describe('deleting the trip', () => {
    async function openDeleteConfirmation(user: User): Promise<HTMLElement> {
      await openMenu(user)
      await user.click(screen.getByRole('menuitem', { name: 'Delete trip' }))
      return screen.getByRole('dialog', { name: 'Delete Paris in the Spring?' })
    }

    it('never deletes straight from the menu', async () => {
      const user = userEvent.setup()
      renderOverview()

      await openMenu(user)

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(readStoredState().trips).toHaveLength(1)
    })

    it('counts everything that will be lost, and can be cancelled', async () => {
      const user = userEvent.setup()
      renderOverview()

      const dialog = await openDeleteConfirmation(user)

      expect(dialog).toHaveAccessibleDescription('This cannot be undone.')
      expect(within(dialog).getByText(/The trip itself/)).toHaveTextContent(
        `The trip itself: ${DATE_RANGE} in Paris, France`,
      )
      expect(within(dialog).getByText('The itinerary draft, with 5 planned stops')).toBeInTheDocument()
      expect(
        within(dialog).getByText(`Every logged expense, ${FIXTURE_EXPENSE_DESCRIPTIONS.length} entries`),
      ).toBeInTheDocument()
      expect(within(dialog).getByText('3 notes saved against this trip')).toBeInTheDocument()

      await user.click(within(dialog).getByRole('button', { name: 'Keep this trip' }))

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(screen.getByRole('heading', { level: 1, name: 'Paris in the Spring' })).toBeInTheDocument()
      expect(readStoredState().trips).toHaveLength(1)
    })

    it('counts the losses differently when there is nothing to lose', async () => {
      const user = userEvent.setup()
      const state = fixtureState()
      renderOverview({
        ...state,
        daysByTrip: { [FIXTURE_TRIP_ID]: [] },
        expensesByTrip: { [FIXTURE_TRIP_ID]: [] },
      })

      const dialog = await openDeleteConfirmation(user)

      expect(within(dialog).getByText('The itinerary draft, which has no stops yet')).toBeInTheDocument()
      expect(within(dialog).getByText('No logged expenses to lose')).toBeInTheDocument()
    })

    it('removes the trip and everything attached to it', async () => {
      const user = userEvent.setup()
      renderOverview()

      const dialog = await openDeleteConfirmation(user)
      await user.click(within(dialog).getByRole('button', { name: 'Delete trip' }))

      expect(await screen.findByText('Trips list')).toBeInTheDocument()
      const stored = readStoredState()
      expect(stored.trips).toHaveLength(0)
      expect(stored.daysByTrip[FIXTURE_TRIP_ID]).toBeUndefined()
      expect(stored.expensesByTrip[FIXTURE_TRIP_ID]).toBeUndefined()
    })
  })

  describe('when the trip is gone', () => {
    it('explains what happened and offers a way back', () => {
      renderAt('trip-that-no-longer-exists', fixtureState())

      expect(screen.getByText('We could not find that trip')).toBeInTheDocument()
      expect(
        screen.getByText(/It may have been deleted, or the link is out of date\./),
      ).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Back to trips' })).toHaveAttribute('href', '/trips')
    })
  })
})

/**
 * Moving a trip to another city from its overview leaves a plan for that city
 * only, and the rest of the app follows the stored destination: another city's
 * place is still refused, and Explore shows the new city's guide.
 */
describe('TripOverviewPage moving a trip to another city', () => {
  const LONDON_TRIP = 'trip-moving'
  const START = addDays(todayISO(), 30)

  function londonState(): PersistedState {
    const created = services.trips.create(
      fixtureState(),
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
      'user-fixture',
    )
    const tripId = created.trip?.id ?? ''
    const days = (created.state.daysByTrip[tripId] ?? []).map((day, index) => ({
      ...day,
      tripId: LONDON_TRIP,
      items: [
        ...day.items.map((item) => ({ ...item, tripId: LONDON_TRIP })),
        ...(index === 0
          ? [
              {
                ...day.items[0],
                id: 'itm_tower',
                tripId: LONDON_TRIP,
                title: 'Tower of London',
                source: 'catalog' as const,
                experienceId: 'exp_london_tower_of_london',
                currency: 'GBP' as const,
                role: undefined,
              },
              {
                ...day.items[0],
                id: 'itm_dinner',
                tripId: LONDON_TRIP,
                title: 'Dinner with Sam',
                source: 'user' as const,
                startTime: '19:30',
                role: undefined,
              },
            ]
          : []),
      ],
    }))
    return {
      ...created.state,
      trips: created.state.trips.map((trip) => (trip.id === tripId ? { ...trip, id: LONDON_TRIP } : trip)),
      daysByTrip: { ...created.state.daysByTrip, [LONDON_TRIP]: days },
      expensesByTrip: { ...created.state.expensesByTrip, [LONDON_TRIP]: [] },
    }
  }

  let actions: ReturnType<typeof useTourist>['actions'] | null = null
  function ActionsProbe() {
    actions = useTourist().actions
    return null
  }

  it('re-drafts the plan for Paris, refuses a London place and scopes Explore to Paris', async () => {
    const user = userEvent.setup()
    const view = renderWithProviders(
      <>
        <ActionsProbe />
        <Routes>
          <Route path="/trips/:tripId" element={<TripOverviewPage />} />
        </Routes>
      </>,
      { route: `/trips/${LONDON_TRIP}`, state: londonState() },
    )

    await user.click(screen.getByRole('button', { name: 'Edit trip' }))
    const dialog = screen.getByRole('dialog', { name: 'Edit trip' })
    const destination = within(dialog).getByRole('combobox', { name: /Destination/ })
    await user.clear(destination)
    await user.type(destination, 'paris')
    await user.click(within(dialog).getByRole('option', { name: 'Paris, France' }))
    expect(within(dialog).getByText(/1 place from the London guide will be removed/)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Change destination and re-draft' }))

    const stored = readStoredState()
    const trip = stored.trips.find((candidate) => candidate.id === LONDON_TRIP)
    const items = (stored.daysByTrip[LONDON_TRIP] ?? []).flatMap((day) => day.items)
    expect(trip).toMatchObject({ destinationId: 'paris', currency: 'GBP' })
    expect(items.map((item) => item.id)).not.toContain('itm_tower')
    expect(items.map((item) => item.id)).toContain('itm_dinner')
    expect(items.filter((item) => item.source === 'ai').every((item) => item.currency === 'EUR')).toBe(true)
    // The other trip in the state is not touched by the move.
    expect(stored.daysByTrip[FIXTURE_TRIP_ID]).toEqual(fixtureState().daysByTrip[FIXTURE_TRIP_ID])

    const dayId = stored.daysByTrip[LONDON_TRIP]?.[0]?.id ?? ''
    let refused: unknown = 'not called'
    let accepted: unknown = null
    await act(async () => {
      // Explicit times, so the refusal can only come from the city guard, not from a full day.
      refused = await actions?.addExperienceToTrip(LONDON_TRIP, 'exp_london_tower_of_london', { dayId, startTime: '10:00' })
      accepted = await actions?.addExperienceToTrip(LONDON_TRIP, 'exp_louvre_museum', { dayId, startTime: '10:00' })
    })
    expect(refused).toBeNull()
    expect(accepted).toMatchObject({ experienceId: 'exp_louvre_museum', source: 'catalog' })

    view.unmount()
    renderWithProviders(
      <Routes>
        <Route path="/trips/:tripId/explore" element={<ExplorePage />} />
      </Routes>,
      { route: `/trips/${LONDON_TRIP}/explore`, state: readStoredState() },
    )

    expect(
      await screen.findByText('Curated Paris places you can add to any day of London long weekend.'),
    ).toBeInTheDocument()
    expect(await screen.findByRole('heading', { level: 3, name: 'Louvre Museum' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 3, name: 'Tower of London' })).not.toBeInTheDocument()
  })
})

describe('TripOverviewPage guide coverage', () => {
  it('tells a Tokyo trip there is no curated guide before it opens an empty Explore', async () => {
    renderOverview(fixtureState({ trip: { destination: 'Tokyo, Japan', destinationId: 'tokyo', currency: 'JPY' } }))

    const summary = await screen.findByRole('region', { name: 'Trip summary' })
    expect(within(summary).getByText('No curated guide for Tokyo yet')).toBeInTheDocument()
    expect(
      within(summary).getByText(
        'Explore has no places for Tokyo, and the itinerary draft uses general activity types, not local recommendations. Everything else, from budget to notes, works as usual.',
      ),
    ).toBeInTheDocument()
    const guide = screen.getByText('Guide').closest('div')
    expect(guide).toHaveTextContent('General suggestions only, no Explore places')
  })

  it('treats a destination outside the list the same way, by its typed name', async () => {
    renderOverview(fixtureState({ trip: { destination: 'Lisbon', destinationId: null } }))

    expect(await screen.findByText('No curated guide for Lisbon yet')).toBeInTheDocument()
  })

  it('says nothing is missing for a curated destination', async () => {
    renderOverview(fixtureState({ trip: { destination: 'London, United Kingdom', destinationId: 'london', currency: 'GBP' } }))

    await screen.findByRole('region', { name: 'Trip summary' })
    expect(screen.queryByText(/No curated guide/)).not.toBeInTheDocument()
    expect(screen.getByText('Guide').closest('div')).toHaveTextContent('Curated guide in Explore')
  })

  it('gives the trip-not-found screen a real page heading', () => {
    renderAt('no-such-trip', fixtureState())

    expect(
      screen.getByRole('heading', { level: 1, name: 'We could not find that trip' }),
    ).toBeInTheDocument()
  })
})
