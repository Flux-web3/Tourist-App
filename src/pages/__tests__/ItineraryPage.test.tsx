import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes, useNavigate } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { addDays, formatLongDate } from '@/domain/format'
import { PROTOTYPE_LABEL } from '@/lib/labels'
import ItineraryPage from '@/pages/ItineraryPage'
import {
  FIXTURE_DAY_ONE_DATE,
  FIXTURE_ITEM_TITLES,
  FIXTURE_TRIP_ID,
  fixtureState,
  makeFixtureDays,
  makeFixtureTrip,
  readStoredState,
} from '@/pages/__tests__/tripFixture'
import {
  GENERATION_ERROR_MESSAGE,
  buildAlternativeItem,
  buildItinerary,
  services,
} from '@/services'
import { renderWithProviders } from '@/test/renderWithProviders'
import type { PersistedState } from '@/services/contracts'
import type { ItineraryDay, ItineraryItem } from '@/domain/types'

type User = ReturnType<typeof userEvent.setup>

const DAY_ONE = FIXTURE_DAY_ONE_DATE
const DAY_TWO = addDays(FIXTURE_DAY_ONE_DATE, 1)
const TRIP = makeFixtureTrip()

/** Days that exist but hold nothing, so generation controls are reachable. */
const EMPTY_DAYS: ItineraryDay[] = makeFixtureDays().map((day) => ({ ...day, items: [] }))

function renderItinerary(state: PersistedState = fixtureState()) {
  return renderWithProviders(
    <Routes>
      <Route path="/trips/:tripId/itinerary" element={<ItineraryPage />} />
      <Route path="/trips" element={<p>Trips list</p>} />
    </Routes>,
    { route: `/trips/${FIXTURE_TRIP_ID}/itinerary`, state },
  )
}

function daySection(index: number): HTMLElement {
  const heading = screen.getAllByRole('heading', { level: 3 })[index]
  expect(heading).toHaveTextContent(index === 0 ? formatLongDate(DAY_ONE) : formatLongDate(DAY_TWO))
  const list = heading.closest('li')
  if (!list) throw new Error(`no list item for day ${index + 1}`)
  return list
}

function stopCard(title: string): HTMLElement {
  const heading = screen.getByRole('heading', { level: 4, name: title })
  const article = heading.closest('article')
  if (!article) throw new Error(`no card for ${title}`)
  return article
}

/**
 * Edit, Replace, Move and Remove are one tap away inside each stop's own menu
 * rather than four buttons on every card, so a test reaches them the way a
 * traveller does.
 */
async function chooseStopAction(user: User, title: string, action: string): Promise<void> {
  await user.click(within(stopCard(title)).getByRole('button', { name: `Actions for ${title}` }))
  await user.click(within(stopCard(title)).getByRole('menuitem', { name: action }))
}

function storedDays(): ItineraryDay[] {
  return readStoredState().daysByTrip[FIXTURE_TRIP_ID] ?? []
}

function storedItem(id: string) {
  return storedDays()
    .flatMap((day) => day.items)
    .find((item) => item.id === id)
}

/**
 * A service call the test holds open, then settles when it is ready to look.
 *
 * The mock services resolve on a real timer, so their result used to land
 * outside React's `act`. React then committed the new DOM and ran the effect
 * that writes localStorage in separate turns, and a test that waited for the
 * DOM and then read localStorage could read the snapshot from before the
 * change. Under a loaded parallel run it did, roughly one run in twenty: the
 * swap test found the original catalogue stop in storage with its replacement
 * already on screen, and the first-draft test found an empty plan in storage
 * with four new stops on screen. No timeout can fix that; the read is simply
 * early. Settling inside `act` makes React flush the commit and the persistence
 * effect before the test goes on, and holding the call open until then means
 * the in-progress state cannot finish before the test has looked at it.
 */
interface HeldCall {
  settle(): Promise<void>
}

function settleInAct(release: () => (() => void) | null, what: string): Promise<void> {
  return act(async () => {
    const resolve = release()
    if (!resolve) throw new Error(`the ${what} was never requested`)
    resolve()
  })
}

function holdSuggestion(): HeldCall & { suggested(): ItineraryItem } {
  let resolve: (() => void) | null = null
  let suggested: ItineraryItem | null = null
  vi.spyOn(services.itinerary, 'suggestAlternative').mockImplementation(
    ({ trip, day, item, variant }) =>
      new Promise((done) => {
        resolve = () => {
          suggested = buildAlternativeItem(trip, day, item, variant ?? 0)
          done(suggested)
        }
      }),
  )
  return {
    settle: () => settleInAct(() => resolve, 'suggestion'),
    suggested: () => {
      if (!suggested) throw new Error('the suggestion has not been settled')
      return suggested
    },
  }
}

function holdGeneration(): HeldCall {
  let resolve: (() => void) | null = null
  vi.spyOn(services.itinerary, 'generate').mockImplementation(
    (trip, options) =>
      new Promise((done) => {
        resolve = () => done(buildItinerary(trip, options?.variant ?? 0))
      }),
  )
  return { settle: () => settleInAct(() => resolve, 'generation') }
}

async function openDialog(name: string): Promise<HTMLElement> {
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name }))
  return screen.getByRole('dialog')
}

describe('ItineraryPage', () => {
  describe('the plan it shows', () => {
    it('summarises days, stops and the draft estimate on one line', async () => {
      renderItinerary()

      expect(await screen.findByRole('heading', { level: 1, name: TRIP.name })).toBeInTheDocument()
      expect(screen.getByText(/2 days in Paris, France/)).toBeInTheDocument()
      expect(screen.getByText(/5 planned stops/)).toBeInTheDocument()
      // One AI-marked figure, stating the currency once for the whole screen.
      expect(screen.getByText(PROTOTYPE_LABEL.aiDraftEstimate)).toBeInTheDocument()
      expect(screen.getByText('€129 EUR')).toBeInTheDocument()

      // The three stat tiles that used to sit between the header and Day 1 are gone.
      expect(screen.queryByRole('region', { name: 'Plan summary' })).not.toBeInTheDocument()
      expect(screen.queryByText('Planned stops')).not.toBeInTheDocument()
      expect(screen.queryByText('A projection from this draft, not a booking')).not.toBeInTheDocument()
    })

    it('puts the first day above every explanation', async () => {
      renderItinerary()

      expect(await screen.findByRole('heading', { level: 1, name: TRIP.name })).toBeInTheDocument()
      const headings = screen
        .getAllByRole('heading')
        .map((heading) => heading.textContent ?? '')
        .filter((text) => text !== '')

      // h1, the screen-reader-only region name, then straight into Day 1.
      expect(headings[0]).toBe(TRIP.name)
      expect(headings[1]).toBe('Day by day')
      expect(headings[2]).toContain(formatLongDate(DAY_ONE))
      expect(headings[3]).toBe(FIXTURE_ITEM_TITLES[0])
      // Nothing between the header and the timeline needs opening to read the plan.
      expect(within(daySection(0)).getAllByRole('article')).toHaveLength(4)
    })

    it('groups stops under numbered day headings with a per-day total', async () => {
      renderItinerary()

      expect(await screen.findByRole('heading', { level: 1, name: TRIP.name })).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'Day by day' })).toBeInTheDocument()
      expect(screen.getByText('Day 1')).toBeInTheDocument()
      expect(screen.getByText('Day 2')).toBeInTheDocument()
      expect(screen.getByText('4 stops · €84 estimated')).toBeInTheDocument()
      expect(screen.getByText('1 stop · €45 estimated')).toBeInTheDocument()

      const firstDay = within(daySection(0))
      expect(firstDay.getByText('Day 1')).toBeInTheDocument()
      expect(firstDay.getAllByRole('article')).toHaveLength(4)
      expect(firstDay.getByText(FIXTURE_ITEM_TITLES[3])).toBeInTheDocument()
      expect(within(daySection(1)).getAllByRole('article')).toHaveLength(1)
    })

    it('says where every stop came from', async () => {
      renderItinerary()

      expect(await screen.findByRole('heading', { level: 1, name: TRIP.name })).toBeInTheDocument()
      const draftStop = within(stopCard(FIXTURE_ITEM_TITLES[0]))
      expect(draftStop.getByText('Sightseeing')).toBeInTheDocument()
      expect(draftStop.getByText(PROTOTYPE_LABEL.aiDraft)).toBeInTheDocument()
      expect(draftStop.queryByText('Edited')).not.toBeInTheDocument()
      expect(draftStop.getByText('Champ de Mars, Paris')).toBeInTheDocument()
      expect(draftStop.getByText('≈ €30')).toBeInTheDocument()
      expect(draftStop.getByText('9:00 AM')).toBeInTheDocument()

      const curatedStop = within(stopCard(FIXTURE_ITEM_TITLES[1]))
      expect(curatedStop.getByText('Culture')).toBeInTheDocument()
      expect(curatedStop.getByText(PROTOTYPE_LABEL.catalogDemo)).toBeInTheDocument()
      expect(curatedStop.queryByText(PROTOTYPE_LABEL.aiDraft)).not.toBeInTheDocument()
    })

    it('gives each stop one menu instead of four buttons', async () => {
      renderItinerary()

      expect(await screen.findByRole('heading', { level: 1, name: TRIP.name })).toBeInTheDocument()
      // Five stops, five triggers, each named after its own stop.
      for (const title of FIXTURE_ITEM_TITLES) {
        expect(screen.getByRole('button', { name: `Actions for ${title}` })).toBeInTheDocument()
      }
      expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Replace' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument()
      expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    })

    it('keeps the regeneration promise and the draft provenance one tap away', async () => {
      renderItinerary()

      expect(await screen.findByRole('heading', { level: 1, name: TRIP.name })).toBeInTheDocument()
      // The claim is visible; the reasoning is inside a disclosure, not an essay.
      expect(screen.getByText(`${PROTOTYPE_LABEL.aiDraft}.`)).toBeInTheDocument()
      expect(screen.getByText(/Made on this device, not booked/)).toBeInTheDocument()
      expect(screen.getByText(/deterministic generator/)).toBeInTheDocument()
      expect(
        screen.getByText('Regenerating never takes your own work away.'),
      ).toBeInTheDocument()
      expect(
        screen.getByText(/it always keeps the activities you added yourself/i),
      ).toBeInTheDocument()

      expect(screen.getByRole('button', { name: 'Regenerate' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Add activity' })).toBeInTheDocument()
      // A drafted plan is redrafted or edited, never generated again from scratch.
      expect(screen.queryByRole('button', { name: 'Generate itinerary' })).not.toBeInTheDocument()
    })

    it('ships no prototype debug control and no standing status card', async () => {
      renderItinerary()

      expect(await screen.findByRole('heading', { level: 1, name: TRIP.name })).toBeInTheDocument()
      expect(screen.queryByLabelText(/Simulate a failure/)).not.toBeInTheDocument()
      expect(screen.queryAllByRole('radio')).toHaveLength(0)
      expect(screen.queryByText(/Nothing is being generated right now/)).not.toBeInTheDocument()
      expect(screen.queryByText('Your draft is ready')).not.toBeInTheDocument()
    })
  })

  describe('when the trip is missing', () => {
    it('explains that the link is out of date and links back to trips', async () => {
      renderItinerary(fixtureState({ trip: { id: 'other-trip' } as never, days: [] }))

      expect(
        await screen.findByRole('heading', { level: 1, name: 'Itinerary not found' }),
      ).toBeInTheDocument()
      expect(screen.getByText('We could not find that trip')).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Back to trips' })).toHaveAttribute('href', '/trips')
    })
  })

  describe('adding an activity by hand', () => {
    it('opens on the first day at the next free slot', async () => {
      renderItinerary()

      expect(await screen.findByRole('heading', { level: 1, name: TRIP.name })).toBeInTheDocument()
      const dialog = await openDialog('Add activity')

      expect(within(dialog).getByRole('heading', { level: 2, name: 'Add an activity' })).toBeInTheDocument()
      expect(
        within(dialog).getByText(
          'Anything you add here is yours: the next regeneration keeps it exactly as you typed it.',
        ),
      ).toBeInTheDocument()
      expect(within(dialog).getByLabelText(/^Day/)).toHaveValue('day-1')
      expect(within(dialog).getByLabelText(/^Start time/)).toHaveValue('21:00')
      expect(within(dialog).getByLabelText(/^Activity/)).toHaveValue('')
    })

    it('saves a new stop on the chosen day', async () => {
      const user = userEvent.setup()
      renderItinerary()

      expect(await screen.findByRole('heading', { level: 1, name: TRIP.name })).toBeInTheDocument()
      const dialog = await openDialog('Add activity')
      await user.selectOptions(within(dialog).getByLabelText(/^Day/), 'day-2')
      await user.type(within(dialog).getByLabelText(/^Activity/), 'Canal-side picnic')
      await user.type(within(dialog).getByLabelText(/^Location/), 'Canal Saint-Martin')
      await user.clear(within(dialog).getByLabelText(/^Start time/))
      await user.type(within(dialog).getByLabelText(/^Start time/), '12:30')
      await user.type(within(dialog).getByLabelText(/^Estimated cost/), '26')
      await user.click(within(dialog).getByRole('button', { name: 'Add activity' }))

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      })
      const added = storedDays()[1].items.find((item) => item.title === 'Canal-side picnic')
      expect(added).toMatchObject({
        startTime: '12:30',
        endTime: null,
        location: 'Canal Saint-Martin',
        estimatedCost: 26,
        source: 'user',
        editedByUser: false,
      })
      expect(added?.category).toBe('sightseeing')
      expect(storedItem(added?.id ?? '')?.id).toBe(added?.id)
      expect(within(daySection(1)).getByText('Canal-side picnic')).toBeInTheDocument()
      expect(within(daySection(1)).getByText('Added by you')).toBeInTheDocument()
      expect(screen.getByText('2 stops · €71 estimated')).toBeInTheDocument()
    })

    it('refuses to save an activity with no name and explains why', async () => {
      const user = userEvent.setup()
      renderItinerary()

      expect(await screen.findByRole('heading', { level: 1, name: TRIP.name })).toBeInTheDocument()
      const dialog = await openDialog('Add activity')
      await user.click(within(dialog).getByRole('button', { name: 'Add activity' }))

      const alert = await within(dialog).findByRole('alert')
      expect(alert).toHaveTextContent('1 field needs attention')
      expect(
        alert).toHaveTextContent('Give this activity a name so you can spot it later.')
      expect(within(dialog).getByLabelText(/^Activity/)).toHaveAttribute('aria-invalid', 'true')
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(storedDays().flatMap((day) => day.items)).toHaveLength(5)
    })

    it('closes without saving when the traveller cancels', async () => {
      const user = userEvent.setup()
      renderItinerary()

      expect(await screen.findByRole('heading', { level: 1, name: TRIP.name })).toBeInTheDocument()
      const dialog = await openDialog('Add activity')
      await user.type(within(dialog).getByLabelText(/^Activity/), 'Never saved')
      await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      })
      expect(screen.queryByText('Never saved')).not.toBeInTheDocument()
      expect(storedDays().flatMap((day) => day.items)).toHaveLength(5)
    })
  })

  describe('editing a stop', () => {
    it('prefills the existing details and marks the stop as edited on save', async () => {
      const user = userEvent.setup()
      renderItinerary()

      expect(await screen.findByRole('heading', { level: 1, name: TRIP.name })).toBeInTheDocument()
      await chooseStopAction(user, FIXTURE_ITEM_TITLES[0], 'Edit')

      const dialog = screen.getByRole('dialog')
      expect(within(dialog).getByRole('heading', { level: 2, name: 'Edit activity' })).toBeInTheDocument()
      expect(
        within(dialog).getByText(
          'Editing marks this stop as yours, so regeneration will leave it alone from now on.',
        ),
      ).toBeInTheDocument()
      expect(within(dialog).queryByLabelText(/^Day/)).not.toBeInTheDocument()
      expect(within(dialog).getByLabelText(/^Activity/)).toHaveValue(FIXTURE_ITEM_TITLES[0])
      expect(within(dialog).getByLabelText(/^Start time/)).toHaveValue('09:00')
      expect(within(dialog).getByLabelText(/^Location/)).toHaveValue('Champ de Mars, Paris')
      expect(within(dialog).getByLabelText(/^Estimated cost/)).toHaveValue(30)

      await user.type(within(dialog).getByLabelText(/^Activity/), ' with the kids')
      await user.type(within(dialog).getByLabelText(/^Notes/), 'Bring the pram')
      await user.click(within(dialog).getByRole('button', { name: 'Save changes' }))

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      })
      const edited = storedItem('item-1')
      expect(edited).toMatchObject({
        title: `${FIXTURE_ITEM_TITLES[0]} with the kids`,
        notes: 'Bring the pram',
        editedByUser: true,
      })
      expect(edited?.startTime).toBe('09:00')
      const card = within(stopCard(`${FIXTURE_ITEM_TITLES[0]} with the kids`))
      expect(card.getByText('Edited')).toBeInTheDocument()
      expect(card.getByText('Note:')).toBeInTheDocument()
    })

    it('rejects an end time that is not after the start time', async () => {
      const user = userEvent.setup()
      renderItinerary()

      expect(await screen.findByRole('heading', { level: 1, name: TRIP.name })).toBeInTheDocument()
      await chooseStopAction(user, FIXTURE_ITEM_TITLES[0], 'Edit')

      const dialog = screen.getByRole('dialog')
      await user.type(within(dialog).getByLabelText(/^End time/), '08:00')
      await user.click(within(dialog).getByRole('button', { name: 'Save changes' }))

      const alert = await within(dialog).findByRole('alert')
      expect(alert).toHaveTextContent('The end time has to be after the start time.')
      expect(storedItem('item-1')?.title).toBe(FIXTURE_ITEM_TITLES[0])
    })
  })

  describe('moving and removing stops', () => {
    it('moves a stop to another day', async () => {
      const user = userEvent.setup()
      renderItinerary()

      expect(await screen.findByRole('heading', { level: 1, name: TRIP.name })).toBeInTheDocument()
      await chooseStopAction(user, FIXTURE_ITEM_TITLES[0], 'Move to another day')

      await user.selectOptions(
        screen.getByLabelText(`Move ${FIXTURE_ITEM_TITLES[0]} to another day`),
        'day-2',
      )

      const days = storedDays()
      expect(days[0].items.map((item) => item.title)).not.toContain(FIXTURE_ITEM_TITLES[0])
      expect(days[1].items.map((item) => item.title)).toContain(FIXTURE_ITEM_TITLES[0])
      expect(days[0].items).toHaveLength(3)
      expect(days[1].items).toHaveLength(2)
      expect(screen.getByText('3 stops · €54 estimated')).toBeInTheDocument()
    })

    it('keeps the stop when the traveller backs out of the removal', async () => {
      const user = userEvent.setup()
      renderItinerary()

      expect(await screen.findByRole('heading', { level: 1, name: TRIP.name })).toBeInTheDocument()
      await chooseStopAction(user, FIXTURE_ITEM_TITLES[0], 'Remove')

      const dialog = screen.getByRole('dialog')
      expect(
        within(dialog).getByRole('heading', { level: 2, name: `Remove ${FIXTURE_ITEM_TITLES[0]}?` }),
      ).toBeInTheDocument()
      expect(
        within(dialog).getByText('09:00 · Champ de Mars, Paris · €30 estimated.'),
      ).toBeInTheDocument()
      await user.click(within(dialog).getByRole('button', { name: 'Keep it' }))

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      })
      expect(storedItem('item-1')?.title).toBe(FIXTURE_ITEM_TITLES[0])
    })

    it('removes only the confirmed stop', async () => {
      const user = userEvent.setup()
      renderItinerary()

      expect(await screen.findByRole('heading', { level: 1, name: TRIP.name })).toBeInTheDocument()
      await chooseStopAction(user, FIXTURE_ITEM_TITLES[0], 'Remove')
      await user.click(
        within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove activity' }),
      )

      await waitFor(() => {
        expect(storedItem('item-1')).toBeUndefined()
      })
      expect(storedDays()[0].items).toHaveLength(3)
      expect(screen.queryByText(FIXTURE_ITEM_TITLES[0])).not.toBeInTheDocument()
      expect(screen.getByText('3 stops · €54 estimated')).toBeInTheDocument()
    })
  })

  describe('replacing a stop with an alternative', () => {
    it('swaps one stop for an AI alternative and leaves the rest of the day alone', async () => {
      const user = userEvent.setup()
      const suggestion = holdSuggestion()
      renderItinerary()

      expect(await screen.findByRole('heading', { level: 1, name: TRIP.name })).toBeInTheDocument()
      await chooseStopAction(user, FIXTURE_ITEM_TITLES[1], 'Replace')

      // The suggestion is still out, so the in-progress state is on screen by construction.
      expect(within(stopCard(FIXTURE_ITEM_TITLES[1])).getByRole('status')).toHaveTextContent(
        'Swapping',
      )
      expect(stopCard(FIXTURE_ITEM_TITLES[1])).toHaveAttribute('aria-busy', 'true')

      await suggestion.settle()

      expect(screen.queryByText(FIXTURE_ITEM_TITLES[1])).not.toBeInTheDocument()
      const firstDay = storedDays()[0]
      expect(firstDay.items).toHaveLength(4)
      const replacement = firstDay.items.find((item) => item.id === 'item-2')
      const suggested = suggestion.suggested()
      // Same slot, but the new stop's own end time: the old stop had none, and
      // the alternative is timed from its own duration, not the stop it replaced.
      expect(suggested.endTime).not.toBeNull()
      expect(replacement).toMatchObject({
        source: 'ai',
        editedByUser: true,
        startTime: '13:00',
        endTime: suggested.endTime,
        title: suggested.title,
      })
      expect(replacement?.title).not.toBe(FIXTURE_ITEM_TITLES[1])
      // What was saved is what the traveller is looking at.
      expect(stopCard(replacement?.title ?? '')).not.toHaveAttribute('aria-busy')
      expect(firstDay.items.map((item) => item.title)).toContain(FIXTURE_ITEM_TITLES[0])
      expect(storedDays()[1].items.map((item) => item.title)).toEqual([FIXTURE_ITEM_TITLES[4]])
    })

    it("keeps a failed swap's error on its own trip, not the next itinerary opened", async () => {
      const user = userEvent.setup()
      vi.spyOn(services.itinerary, 'suggestAlternative').mockRejectedValue(
        new Error('No alternative right now.'),
      )
      const base = fixtureState()
      const second = { ...base.trips[0], id: 'trip-second', name: 'Second trip' }
      const state: PersistedState = {
        ...base,
        trips: [...base.trips, second],
        daysByTrip: { ...base.daysByTrip, [second.id]: base.daysByTrip[FIXTURE_TRIP_ID] ?? [] },
      }
      function OpenSecond() {
        const navigate = useNavigate()
        return (
          <button type="button" onClick={() => navigate(`/trips/${second.id}/itinerary`)}>
            Open second trip
          </button>
        )
      }
      renderWithProviders(
        <>
          <OpenSecond />
          <Routes>
            <Route path="/trips/:tripId/itinerary" element={<ItineraryPage />} />
          </Routes>
        </>,
        { route: `/trips/${FIXTURE_TRIP_ID}/itinerary`, state },
      )

      expect(await screen.findByRole('heading', { level: 1, name: TRIP.name })).toBeInTheDocument()
      await chooseStopAction(user, FIXTURE_ITEM_TITLES[1], 'Replace')
      expect(await screen.findByText('We could not swap that activity')).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: 'Open second trip' }))
      expect(await screen.findByRole('heading', { level: 1, name: 'Second trip' })).toBeInTheDocument()
      expect(screen.queryByText('We could not swap that activity')).not.toBeInTheDocument()
    })
  })

  describe('generating a first draft', () => {
    it('makes generation the single obvious action and skips the wall of caveats', async () => {
      renderItinerary(fixtureState({ days: EMPTY_DAYS }))

      expect(await screen.findByRole('heading', { level: 1, name: TRIP.name })).toBeInTheDocument()
      expect(screen.getByText('Your 2 days in Paris, France are wide open')).toBeInTheDocument()
      expect(
        screen.getByText(
          'Draft a plan to start from, then change anything you like. Whatever you add yourself is always kept.',
        ),
      ).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Generate itinerary' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Add activity' })).toBeEnabled()

      // No empty-day filler and nothing to regenerate yet.
      expect(screen.queryByRole('button', { name: 'Regenerate' })).not.toBeInTheDocument()
      expect(
        screen.queryByText('Nothing planned yet. This day is wide open.'),
      ).not.toBeInTheDocument()
      expect(screen.queryAllByRole('article')).toHaveLength(0)
    })

    it('drafts an itinerary and reports the result', async () => {
      const user = userEvent.setup()
      const generation = holdGeneration()
      renderItinerary(fixtureState({ days: EMPTY_DAYS }))

      expect(await screen.findByRole('heading', { level: 1, name: TRIP.name })).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'Generate itinerary' }))

      expect(await screen.findByText('Drafting your itinerary…')).toBeInTheDocument()
      expect(
        screen.getByText(
          'Drafting your itinerary. Nothing already on your plan will be moved or removed.',
        ),
      ).toBeInTheDocument()

      await generation.settle()

      expect(await screen.findByText('Your draft is ready')).toBeInTheDocument()
      expect(screen.getByText('Your itinerary draft is ready.')).toBeInTheDocument()
      const days = storedDays()
      expect(days).toHaveLength(2)
      expect(days.map((day) => day.index)).toEqual([1, 2])
      expect(days.flatMap((day) => day.items).length).toBeGreaterThan(0)
      expect(screen.getAllByRole('article').length).toBe(days.flatMap((day) => day.items).length)
      expect(screen.getByText(/2 days in Paris, France/)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Regenerate' })).toBeInTheDocument()
    })

    it('keeps the traveller’s own stops and the current plan on screen while redrafting', async () => {
      const user = userEvent.setup()
      const generation = holdGeneration()
      renderItinerary()

      expect(await screen.findByRole('heading', { level: 1, name: TRIP.name })).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'Regenerate' }))

      expect(await screen.findByRole('button', { name: 'Regenerating' })).toBeInTheDocument()
      expect(screen.getByText(FIXTURE_ITEM_TITLES[0])).toBeInTheDocument()
      expect(storedDays()[0].items).toHaveLength(4)

      await generation.settle()

      expect(await screen.findByText('Your itinerary draft is ready.')).toBeInTheDocument()
      const days = storedDays()
      const items = days.flatMap((day) => day.items)
      const kept = items.filter((item) => item.source === 'user')
      expect(kept).toHaveLength(0)
      expect(items.length).toBeGreaterThanOrEqual(5)
      /**
       * A stale read used to pass these two checks as well, because the old plan
       * also has five stops and none of them the traveller's. So also pin down
       * that the redraft itself was saved: the catalogue stops survive, the AI
       * drafts they sat beside are gone, and storage matches the screen.
       */
      const ids = items.map((item) => item.id)
      expect(ids).toEqual(expect.arrayContaining(['item-2', 'item-4']))
      expect(ids).not.toContain('item-1')
      expect(ids).not.toContain('item-3')
      expect(ids).not.toContain('item-5')
      expect(screen.getAllByRole('article')).toHaveLength(items.length)
    })

    it('leaves the day list in place once a single stop exists', async () => {
      const [firstDay, secondDay] = makeFixtureDays()
      renderItinerary(
        fixtureState({
          days: [{ ...firstDay, items: firstDay.items.slice(0, 1) }, { ...secondDay, items: [] }],
        }),
      )

      expect(await screen.findByRole('heading', { level: 1, name: TRIP.name })).toBeInTheDocument()
      expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(2)
      expect(screen.getByText('Nothing planned yet. This day is wide open.')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Add an activity' })).toBeInTheDocument()
      expect(screen.getByText('1 stop · €30 estimated')).toBeInTheDocument()
    })
  })

  describe('when generation fails', () => {
    it('reports the failure, leaves the plan untouched and recovers on retry', async () => {
      const user = userEvent.setup()
      // The prototype's simulate-failure switch is no longer shipped in the UI,
      // so the failure path is driven through the service it used to toggle.
      vi.spyOn(services.itinerary, 'generate').mockRejectedValueOnce(
        new Error(GENERATION_ERROR_MESSAGE),
      )
      renderItinerary(fixtureState({ days: EMPTY_DAYS }))

      expect(await screen.findByRole('heading', { level: 1, name: TRIP.name })).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'Generate itinerary' }))

      expect(
        await screen.findByText('The itinerary draft could not be generated'),
      ).toBeInTheDocument()
      expect(
        screen.getByText(
          'The itinerary draft could not be generated. The plan you already had is untouched.',
        ),
      ).toBeInTheDocument()
      expect(
        screen.getByText(/We could not draft an itinerary just now/),
      ).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
      // The invitation is still the one obvious way forward.
      expect(screen.getByText('Your 2 days in Paris, France are wide open')).toBeInTheDocument()
      await waitFor(() => {
        expect(storedDays().every((day) => day.items.length === 0)).toBe(true)
        expect(readStoredState().generation[FIXTURE_TRIP_ID]?.status).toBe('error')
      })

      await user.click(screen.getByRole('button', { name: 'Try again' }))

      expect(await screen.findByText('Your itinerary draft is ready.')).toBeInTheDocument()
      expect(screen.queryByText('The itinerary draft could not be generated')).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument()
      await waitFor(() => {
        expect(storedDays().flatMap((day) => day.items).length).toBeGreaterThan(0)
        expect(readStoredState().generation[FIXTURE_TRIP_ID]).toMatchObject({
          status: 'success',
          error: null,
        })
      })
    })
  })
})
