import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { addDays, formatDateRange, formatLongDate } from '@/domain/format'
import { PROTOTYPE_LABEL } from '@/lib/labels'
import ItineraryPage from '@/pages/ItineraryPage'
import {
  FIXTURE_DAY_ONE_DATE,
  FIXTURE_ITEM_TITLES,
  FIXTURE_TRIP_ID,
  fixtureState,
  makeFixtureDays,
  makeFixtureTrip,
  makeGeneration,
  readStoredState,
} from '@/pages/__tests__/tripFixture'
import { renderWithProviders } from '@/test/renderWithProviders'
import type { PersistedState } from '@/services/contracts'
import type { ItineraryDay } from '@/domain/types'

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

function storedDays(): ItineraryDay[] {
  return readStoredState().daysByTrip[FIXTURE_TRIP_ID] ?? []
}

function storedItem(id: string) {
  return storedDays()
    .flatMap((day) => day.items)
    .find((item) => item.id === id)
}

async function openDialog(name: string): Promise<HTMLElement> {
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name }))
  return screen.getByRole('dialog')
}

describe('ItineraryPage', () => {
  describe('the plan it shows', () => {
    it('summarises stops, days and the draft estimate', async () => {
      renderItinerary()

      expect(await screen.findByRole('heading', { level: 1, name: TRIP.name })).toBeInTheDocument()
      expect(screen.getByText(/2 days in Paris, France/)).toBeInTheDocument()
      expect(screen.getByText(/5 planned stops/)).toBeInTheDocument()

      const summary = within(screen.getByRole('region', { name: 'Plan summary' }))
      expect(summary.getByText('Planned stops')).toBeInTheDocument()
      expect(summary.getByText('5')).toBeInTheDocument()
      expect(summary.getByText('Across 2 days')).toBeInTheDocument()
      expect(summary.getByText('Days')).toBeInTheDocument()
      expect(summary.getByText(formatDateRange(TRIP.startDate, TRIP.endDate))).toBeInTheDocument()
      expect(summary.getByText(PROTOTYPE_LABEL.aiDraftEstimate)).toBeInTheDocument()
      expect(summary.getByText('€129 EUR')).toBeInTheDocument()
    })

    it('groups stops under numbered day headings with a per-day total', async () => {
      renderItinerary()

      expect(await screen.findByRole('heading', { level: 1, name: TRIP.name })).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'Day by day' })).toBeInTheDocument()
      expect(screen.getByText('Day 1')).toBeInTheDocument()
      expect(screen.getByText('Day 2')).toBeInTheDocument()
      expect(screen.getByText('4 stops · €84.00 EUR estimated')).toBeInTheDocument()
      expect(screen.getByText('1 stop · €45.00 EUR estimated')).toBeInTheDocument()

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
      expect(draftStop.getByText('€30.00 EUR')).toBeInTheDocument()
      expect(draftStop.getByText('9:00 AM')).toBeInTheDocument()

      const curatedStop = within(stopCard(FIXTURE_ITEM_TITLES[1]))
      expect(curatedStop.getByText('Culture')).toBeInTheDocument()
      expect(curatedStop.getByText(PROTOTYPE_LABEL.catalogDemo)).toBeInTheDocument()
      expect(curatedStop.queryByText(PROTOTYPE_LABEL.aiDraft)).not.toBeInTheDocument()
    })

    it('explains that regeneration keeps the traveller’s own work', async () => {
      renderItinerary()

      expect(await screen.findByRole('heading', { level: 1, name: TRIP.name })).toBeInTheDocument()
      expect(screen.getByText('Regenerating never takes your own work away')).toBeInTheDocument()
      expect(
        screen.getByText(/it always keeps the activities you added yourself/i),
      ).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Regenerate itinerary' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Add activity' })).toBeInTheDocument()
      // A drafted plan is redrafted or edited, never generated again from scratch.
      expect(screen.queryByRole('button', { name: 'Generate itinerary' })).not.toBeInTheDocument()
    })

    it('marks the generator as a local prototype rather than a live service', async () => {
      renderItinerary()

      expect(await screen.findByRole('heading', { level: 1, name: TRIP.name })).toBeInTheDocument()
      expect(
        screen.getByText('These drafts come from a local prototype generator'),
      ).toBeInTheDocument()
      expect(
        screen.getByText(
          'This plan is saved on this device. Nothing is being generated right now.',
        ),
      ).toBeInTheDocument()
      expect(screen.getByLabelText(/Simulate a failure on the next generation/)).toBeDefined()
      expect(screen.getByRole('radio', { name: 'No failure' })).toBeChecked()
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
      expect(screen.getByText('2 stops · €71.00 EUR estimated')).toBeInTheDocument()
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
      await user.click(within(stopCard(FIXTURE_ITEM_TITLES[0])).getByRole('button', { name: 'Edit' }))

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
      await user.click(within(stopCard(FIXTURE_ITEM_TITLES[0])).getByRole('button', { name: 'Edit' }))

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
      const card = within(stopCard(FIXTURE_ITEM_TITLES[0]))
      const move = card.getByRole('button', { name: 'Move' })
      expect(move).toHaveAttribute('aria-expanded', 'false')
      await user.click(move)
      expect(
        within(stopCard(FIXTURE_ITEM_TITLES[0])).getByRole('button', { name: 'Move' }),
      ).toHaveAttribute('aria-expanded', 'true')

      await user.selectOptions(
        screen.getByLabelText(`Move ${FIXTURE_ITEM_TITLES[0]} to another day`),
        'day-2',
      )

      const days = storedDays()
      expect(days[0].items.map((item) => item.title)).not.toContain(FIXTURE_ITEM_TITLES[0])
      expect(days[1].items.map((item) => item.title)).toContain(FIXTURE_ITEM_TITLES[0])
      expect(days[0].items).toHaveLength(3)
      expect(days[1].items).toHaveLength(2)
      expect(screen.getByText('3 stops · €54.00 EUR estimated')).toBeInTheDocument()
    })

    it('keeps the stop when the traveller backs out of the removal', async () => {
      const user = userEvent.setup()
      renderItinerary()

      expect(await screen.findByRole('heading', { level: 1, name: TRIP.name })).toBeInTheDocument()
      await user.click(
        within(stopCard(FIXTURE_ITEM_TITLES[0])).getByRole('button', { name: 'Remove' }),
      )

      const dialog = screen.getByRole('dialog')
      expect(
        within(dialog).getByRole('heading', { level: 2, name: `Remove ${FIXTURE_ITEM_TITLES[0]}?` }),
      ).toBeInTheDocument()
      expect(
        within(dialog).getByText('09:00 · Champ de Mars, Paris · €30.00 EUR estimated.'),
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
      await user.click(
        within(stopCard(FIXTURE_ITEM_TITLES[0])).getByRole('button', { name: 'Remove' }),
      )
      await user.click(
        within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove activity' }),
      )

      await waitFor(() => {
        expect(storedItem('item-1')).toBeUndefined()
      })
      expect(storedDays()[0].items).toHaveLength(3)
      expect(screen.queryByText(FIXTURE_ITEM_TITLES[0])).not.toBeInTheDocument()
      expect(screen.getByText('3 stops · €54.00 EUR estimated')).toBeInTheDocument()
    })
  })

  describe('replacing a stop with an alternative', () => {
    it('swaps one stop for an AI alternative and leaves the rest of the day alone', async () => {
      const user = userEvent.setup()
      renderItinerary()

      expect(await screen.findByRole('heading', { level: 1, name: TRIP.name })).toBeInTheDocument()
      await user.click(
        within(stopCard(FIXTURE_ITEM_TITLES[1])).getByRole('button', { name: 'Replace' }),
      )

      await waitFor(() => {
        expect(
          within(stopCard(FIXTURE_ITEM_TITLES[1])).getByRole('button', { name: 'Swapping' }),
        ).toBeInTheDocument()
      })
      const others = screen
        .getAllByRole('button', { name: 'Replace' })
        .filter((button) => button.closest('article') !== stopCard(FIXTURE_ITEM_TITLES[1]))
      expect(others.length).toBe(4)
      for (const button of others) {
        expect(button).toBeDisabled()
      }

      await waitFor(
        () => {
          expect(screen.queryByRole('button', { name: 'Swapping' })).not.toBeInTheDocument()
          expect(screen.queryByText(FIXTURE_ITEM_TITLES[1])).not.toBeInTheDocument()
        },
      )

      const firstDay = storedDays()[0]
      expect(firstDay.items).toHaveLength(4)
      const replacement = firstDay.items.find((item) => item.id === 'item-2')
      expect(replacement).toMatchObject({
        source: 'ai',
        editedByUser: true,
        startTime: '13:00',
        endTime: null,
      })
      expect(replacement?.title).not.toBe(FIXTURE_ITEM_TITLES[1])
      expect(firstDay.items.map((item) => item.title)).toContain(
        FIXTURE_ITEM_TITLES[0],
      )
      expect(storedDays()[1].items.map((item) => item.title)).toEqual([FIXTURE_ITEM_TITLES[4]])
  })
  })

  describe('generating a draft', () => {
    it('offers generation only when the plan has no stops', async () => {
      renderItinerary(fixtureState({ days: EMPTY_DAYS }))

      expect(await screen.findByRole('heading', { level: 1, name: TRIP.name })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Generate itinerary' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Regenerate itinerary' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Add activity' })).toBeEnabled()
      expect(
        screen.getAllByText('Nothing planned yet. This day is wide open.'),
      ).toHaveLength(2)
      expect(screen.getAllByRole('button', { name: 'Add an activity' })).toHaveLength(2)
      expect(screen.getByText('No draft has been generated for this trip yet.')).toBeInTheDocument()
      expect(screen.queryAllByRole('article')).toHaveLength(0)
    })

    it('drafts an itinerary and reports the result', async () => {
      const user = userEvent.setup()
      renderItinerary(fixtureState({ days: EMPTY_DAYS }))

      expect(await screen.findByRole('heading', { level: 1, name: TRIP.name })).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'Generate itinerary' }))

      expect(
        await screen.findByRole('button', { name: 'Drafting' }),
      ).toBeInTheDocument()
      expect(screen.getByText('Drafting your itinerary…')).toBeInTheDocument()
      expect(
        screen.getByText(
          'The days and stops already on screen stay exactly where they are while the new draft is prepared.',
        ),
      ).toBeInTheDocument()

      const success = await screen.findByText('Your draft is ready', undefined)
      expect(success).toBeInTheDocument()
      expect(screen.getByText('Your itinerary draft is ready.')).toBeInTheDocument()
      const days = storedDays()
      expect(days).toHaveLength(2)
      expect(days.map((day) => day.index)).toEqual([1, 2])
      expect(days.flatMap((day) => day.items).length).toBeGreaterThan(0)
      expect(screen.getAllByRole('article').length).toBe(
        days.flatMap((day) => day.items).length,
      )
      expect(
        within(screen.getByRole('region', { name: 'Plan summary' })).getByText(
          `Across ${days.length} days`,
        ),
      ).toBeInTheDocument()
  })
    it('keeps the traveller’s own stops and the current plan on screen while redrafting', async () => {
      const user = userEvent.setup()
      renderItinerary()

      expect(await screen.findByRole('heading', { level: 1, name: TRIP.name })).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'Regenerate itinerary' }))

      expect(
        await screen.findByRole('button', { name: 'Regenerating' }),
      ).toBeInTheDocument()
      expect(screen.getByText(FIXTURE_ITEM_TITLES[0])).toBeInTheDocument()
      expect(storedDays()[0].items).toHaveLength(4)

      await waitFor(
        () => {
          expect(screen.getByText('Your itinerary draft is ready.')).toBeInTheDocument()
        },
      )
      const days = storedDays()
      const kept = days.flatMap((day) => day.items).filter((item) => item.source === 'user')
      expect(kept).toHaveLength(0)
      expect(days.flatMap((day) => day.items).length).toBeGreaterThanOrEqual(5)
  })
  })

  describe('when generation fails', () => {
    it('reports the failure, leaves the plan untouched and recovers on retry', async () => {
      const user = userEvent.setup()
      renderItinerary(
        fixtureState({ days: EMPTY_DAYS, generation: makeGeneration({ shouldFail: true }) }),
      )

      expect(await screen.findByRole('heading', { level: 1, name: TRIP.name })).toBeInTheDocument()
      expect(screen.getByRole('radio', { name: 'Fail next run' })).toBeChecked()
      await user.click(screen.getByRole('button', { name: 'Generate itinerary' }))

      const error = await screen.findByText('The itinerary draft could not be generated')
      expect(error).toBeInTheDocument()
      expect(
        screen.getByText(
          'The itinerary draft could not be generated. The plan you already had is untouched.',
        ),
      ).toBeInTheDocument()
      expect(
        screen.getByText(/We could not draft an itinerary just now\. Nothing was changed/),
      ).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
      expect(screen.getAllByText('Nothing planned yet. This day is wide open.')).toHaveLength(2)
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
          shouldFail: false,
          error: null,
        })
      })
      expect(screen.getByRole('radio', { name: 'No failure' })).toBeChecked()
    })
  })
})
