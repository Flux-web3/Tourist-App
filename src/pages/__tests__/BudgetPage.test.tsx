import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { formatDate, formatShortDate, todayISO } from '@/domain/format'
import { PROTOTYPE_LABEL } from '@/lib/labels'
import BudgetPage from '@/pages/BudgetPage'
import { renderWithProviders } from '@/test/renderWithProviders'
import {
  FIXTURE_DAY_ONE_DATE,
  FIXTURE_EXPENSE_DESCRIPTIONS,
  FIXTURE_TRIP_ID,
  fixtureState,
  readStoredState,
} from '@/pages/__tests__/tripFixture'
import { addDays } from '@/domain/format'
import type { PersistedState } from '@/services/contracts'

function renderAt(tripId: string, state: PersistedState) {
  return renderWithProviders(
    <Routes>
      <Route path="/trips/:tripId/itinerary" element={<p>Itinerary</p>} />
      <Route path="/trips/:tripId/budget" element={<BudgetPage />} />
    </Routes>,
    { route: `/trips/${tripId}/budget`, state },
  )
}

function renderBudget(state: PersistedState = fixtureState()) {
  return renderAt(FIXTURE_TRIP_ID, state)
}

function summary(): HTMLElement {
  return screen.getByRole('region', { name: 'Budget summary' })
}

describe('BudgetPage', () => {
  it('frames the page around the trip and the two things it can do', () => {
    renderBudget()

    expect(screen.getByRole('heading', { level: 1, name: 'Paris in the Spring' })).toBeInTheDocument()
    expect(screen.getByText('Budget')).toBeInTheDocument()
    expect(
      screen.getByText(
        'Log what you actually spend and this budget stays honest. The itinerary estimate stays a projection and is never counted as a bill.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Trip overview' })).toHaveAttribute(
      'href',
      `/trips/${FIXTURE_TRIP_ID}`,
    )
    expect(screen.getAllByRole('button', { name: 'Add expense' })).toHaveLength(2)
  })

  it('keeps the four figures apart', () => {
    renderBudget()

    expect(within(summary()).getByText(PROTOTYPE_LABEL.tripBudget)).toBeInTheDocument()
    expect(within(summary()).getByText('€2,500.00 EUR')).toBeInTheDocument()
    expect(within(summary()).getByText(PROTOTYPE_LABEL.aiDraftEstimate)).toBeInTheDocument()
    expect(within(summary()).getByText('€129.00 EUR')).toBeInTheDocument()
    expect(within(summary()).getByText(PROTOTYPE_LABEL.actualSpent)).toBeInTheDocument()
    expect(within(summary()).getByText('€1,385.00 EUR')).toBeInTheDocument()
    expect(within(summary()).getByText(PROTOTYPE_LABEL.remaining)).toBeInTheDocument()
    expect(within(summary()).getByText('€1,115.00 EUR')).toBeInTheDocument()
    expect(screen.getByText('This prototype does not convert between currencies.')).toBeInTheDocument()
    expect(screen.getByText('All amounts are in EUR (€)')).toBeInTheDocument()
  })

  it('measures the logged spending against the budget', () => {
    renderBudget()

    expect(screen.getByText(`${PROTOTYPE_LABEL.actualSpent} against ${PROTOTYPE_LABEL.tripBudget}`)).toBeInTheDocument()
    expect(screen.getByText('55% of €2,500.00 EUR')).toBeInTheDocument()
    const bar = screen.getByRole('progressbar', {
      name: `${PROTOTYPE_LABEL.actualSpent} against ${PROTOTYPE_LABEL.tripBudget}`,
    })
    expect(bar).toHaveAttribute('aria-valuenow', '1385')
    expect(bar).toHaveAttribute('aria-valuemax', '2500')
    expect(screen.getByText('€1,115.00 EUR of €2,500.00 EUR still unspent.')).toBeInTheDocument()
  })

  it('explains the overage instead of hiding it in a negative number', () => {
    renderBudget(fixtureState({ trip: { budget: 1000 } }))

    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('You are over budget')
    expect(alert).toHaveTextContent('Logged spending exceeds the trip budget by €385.00 EUR.')
    expect(alert).toHaveTextContent('AI Draft Estimate is not part of this figure')
    expect(screen.getByText('Over budget by €385.00 EUR. Remove an expense, or raise the trip budget.')).toBeInTheDocument()
    expect(screen.getByText('139% of €1,000.00 EUR')).toBeInTheDocument()
    expect(screen.getAllByText('-€385.00 EUR').length).toBeGreaterThan(0)
  })

  it('invites a budget instead of a broken bar when none is set', () => {
    renderBudget(fixtureState({ trip: { budget: 0 } }))

    expect(screen.getByText('No trip budget set yet')).toBeInTheDocument()
    expect(
      screen.getByText('Add a trip budget and this bar starts tracking how far the trip has gone.'),
    ).toBeInTheDocument()
  })

  it('spells out the rules the four figures follow', () => {
    renderBudget()

    const card = screen.getByRole('heading', { name: 'How these numbers work' }).closest('section') as HTMLElement
    expect(
      within(card).getByText(/Your ceiling for the whole trip\. You set it when planning the trip/),
    ).toBeInTheDocument()
    expect(
      within(card).getByText(/A projection from the itinerary, not a booking or a bill\./),
    ).toBeInTheDocument()
    expect(within(card).getByText(/Expenses you have logged\. This is the only settled figure/)).toBeInTheDocument()
    expect(within(card).getByText(/It can go negative, which means you are over budget\./)).toBeInTheDocument()
    expect(within(card).getByText(/never added to your actual spend/)).toBeInTheDocument()
  })

  it('breaks the spending down by category, largest share first', () => {
    renderBudget()

    const card = screen.getByRole('heading', { name: 'Where the money went' }).closest('section') as HTMLElement
    const rows = within(card).getAllByRole('listitem')
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining('Transport'),
      expect.stringContaining('Stay'),
      expect.stringContaining('Food'),
      expect.stringContaining('Activities'),
    ])
    expect(rows[0]).toHaveTextContent('€825.00 EUR')
    expect(rows[0]).toHaveTextContent('60% of €1,385.00 EUR · 2 expenses')
    expect(rows[1]).toHaveTextContent('€420.00 EUR')
    expect(rows[1]).toHaveTextContent('30% of €1,385.00 EUR · 1 expense')
    expect(rows[2]).toHaveTextContent('€96.00 EUR')
    expect(rows[2]).toHaveTextContent('7% of €1,385.00 EUR · 1 expense')
    expect(rows[3]).toHaveTextContent('€44.00 EUR')
    expect(rows[3]).toHaveTextContent('3% of €1,385.00 EUR · 1 expense')
    expect(within(card).getByText('Total logged')).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: 'Transport share of logged spend' })).toHaveAttribute(
      'aria-valuenow',
      '825',
    )
  })

  it('lists the expenses newest first, each with its category, date and amount', () => {
    renderBudget()

    const card = screen.getByRole('heading', { name: 'Expenses' }).closest('section') as HTMLElement
    expect(within(card).getByText('5 expenses logged, newest first.')).toBeInTheDocument()
    const rows = within(card).getAllByRole('listitem')
    expect(rows).toHaveLength(FIXTURE_EXPENSE_DESCRIPTIONS.length)
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining(FIXTURE_EXPENSE_DESCRIPTIONS[4]),
      expect.stringContaining(FIXTURE_EXPENSE_DESCRIPTIONS[3]),
      expect.stringContaining(FIXTURE_EXPENSE_DESCRIPTIONS[2]),
      expect.stringContaining(FIXTURE_EXPENSE_DESCRIPTIONS[1]),
      expect.stringContaining(FIXTURE_EXPENSE_DESCRIPTIONS[0]),
    ])
    expect(rows[0]).toHaveTextContent('€96.00 EUR')
    expect(rows[0]).toHaveTextContent('Food')
    expect(rows[0]).toHaveTextContent(formatShortDate(addDays(FIXTURE_DAY_ONE_DATE, 3)))
    expect(rows[4]).toHaveTextContent('€780.00 EUR')
    expect(rows[4]).toHaveTextContent('Transport')
    expect(rows[4]).toHaveTextContent(formatShortDate(addDays(FIXTURE_DAY_ONE_DATE, -1)))
    expect(within(card).getByText(PROTOTYPE_LABEL.actualSpent)).toBeInTheDocument()
  })

  it('starts from an honest empty budget', () => {
    const state = fixtureState()
    renderBudget({ ...state, expensesByTrip: { [FIXTURE_TRIP_ID]: [] } })

    expect(screen.getByText('No spending to break down yet')).toBeInTheDocument()
    expect(screen.getByText('No expenses logged yet')).toBeInTheDocument()
    expect(screen.getByText('€0.00 EUR')).toBeInTheDocument()
    expect(screen.getByText('0% of €2,500.00 EUR')).toBeInTheDocument()
  })

  it('lists the projection for each day, separate from real spending', () => {
    renderBudget()

    const card = screen.getByRole('heading', { name: 'Planned estimate by day' }).closest('section') as HTMLElement
    const rows = within(card).getAllByRole('listitem')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveTextContent('€84.00 EUR')
    expect(rows[0]).toHaveTextContent('Day 1')
    expect(rows[0]).toHaveTextContent(formatShortDate(FIXTURE_DAY_ONE_DATE))
    expect(rows[1]).toHaveTextContent('€45.00 EUR')
    expect(rows[1]).toHaveTextContent('Day 2')
    expect(rows[1]).toHaveTextContent(formatShortDate(addDays(FIXTURE_DAY_ONE_DATE, 1)))
    expect(within(card).getByText(PROTOTYPE_LABEL.aiDraftEstimate)).toBeInTheDocument()
    expect(within(card).getByText('€129.00 EUR')).toBeInTheDocument()
    expect(screen.getByText(PROTOTYPE_LABEL.aiDraft)).toBeInTheDocument()
  })

  it('sends an undrafted trip to the itinerary', () => {
    const state = fixtureState()
    renderBudget({ ...state, daysByTrip: { [FIXTURE_TRIP_ID]: [] } })

    expect(screen.getByText('No itinerary draft to project from')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open the itinerary' })).toHaveAttribute(
      'href',
      `/trips/${FIXTURE_TRIP_ID}/itinerary`,
    )
  })

  describe('logging an expense', () => {
    it('refuses an entry with no description and no amount', async () => {
      const user = userEvent.setup()
      renderBudget()

      await user.click(screen.getAllByRole('button', { name: 'Add expense' })[0])
      const dialog = screen.getByRole('dialog', { name: 'Add expense' })
      await user.click(within(dialog).getByRole('button', { name: 'Save expense' }))

      const problems = within(screen.getByRole('alert'))
      expect(problems.getByText('2 fields need attention')).toBeInTheDocument()
      expect(problems.getByText('Describe what this was for, in at least 2 characters.')).toBeInTheDocument()
      expect(problems.getByText('Enter an amount greater than 0.')).toBeInTheDocument()
      expect(screen.getByRole('dialog', { name: 'Add expense' })).toBeInTheDocument()
      expect(readStoredState().expensesByTrip[FIXTURE_TRIP_ID]).toHaveLength(5)
    })

    it('adds a real expense and moves the totals with it', async () => {
      const user = userEvent.setup()
      renderBudget()

      await user.click(screen.getAllByRole('button', { name: 'Add expense' })[0])
      const dialog = screen.getByRole('dialog', { name: 'Add expense' })
      await user.type(within(dialog).getByLabelText(/What was it for/), 'Museum tickets')
      const amount = within(dialog).getByLabelText(/Amount/)
      await user.clear(amount)
      await user.type(amount, '35.50')
      await user.selectOptions(within(dialog).getByLabelText(/Category/), 'activities')
      await user.click(within(dialog).getByRole('button', { name: 'Save expense' }))

      expect(screen.queryByRole('dialog', { name: 'Add expense' })).not.toBeInTheDocument()
      expect(screen.getByText('Museum tickets')).toBeInTheDocument()
      expect(screen.getByText('€35.50 EUR')).toBeInTheDocument()
      expect(within(summary()).getByText('€1,420.50 EUR')).toBeInTheDocument()
      expect(within(summary()).getByText('€1,079.50 EUR')).toBeInTheDocument()
      expect(screen.getByText('57% of €2,500.00 EUR')).toBeInTheDocument()
      const stored = readStoredState().expensesByTrip[FIXTURE_TRIP_ID]
      expect(stored).toHaveLength(6)
      expect(stored[5]).toMatchObject({
        description: 'Museum tickets',
        amount: 35.5,
        category: 'activities',
        currency: 'EUR',
        date: todayISO(),
        tripId: FIXTURE_TRIP_ID,
      })
    })
  })

  describe('correcting an expense', () => {
    it('opens the entry with its stored values and saves a correction', async () => {
      const user = userEvent.setup()
      renderBudget()

      const card = screen.getByRole('heading', { name: 'Expenses' }).closest('section') as HTMLElement
      const row = within(card).getAllByRole('listitem')[1]
      await user.click(within(row).getByRole('button', { name: 'Edit' }))

      const dialog = screen.getByRole('dialog', { name: 'Edit expense' })
      expect(within(dialog).getByLabelText(/What was it for/)).toHaveValue(FIXTURE_EXPENSE_DESCRIPTIONS[3])
      expect(within(dialog).getByLabelText(/Amount/)).toHaveValue(44)
      expect(within(dialog).getByLabelText(/Category/)).toHaveValue('activities')
      expect(within(dialog).getByLabelText(/Date paid/)).toHaveValue(
        addDays(FIXTURE_DAY_ONE_DATE, 2),
      )

      const amount = within(dialog).getByLabelText(/Amount/)
      await user.clear(amount)
      await user.type(amount, '60')
      await user.click(within(dialog).getByRole('button', { name: 'Save changes' }))

      expect(screen.queryByRole('dialog', { name: 'Edit expense' })).not.toBeInTheDocument()
      expect(within(summary()).getByText('€1,401.00 EUR')).toBeInTheDocument()
      const stored = readStoredState().expensesByTrip[FIXTURE_TRIP_ID]
      expect(stored).toHaveLength(5)
      expect(stored[3]).toMatchObject({ amount: 60, description: FIXTURE_EXPENSE_DESCRIPTIONS[3] })
    })

    it('rejects a correction that empties the description', async () => {
      const user = userEvent.setup()
      renderBudget()

      const card = screen.getByRole('heading', { name: 'Expenses' }).closest('section') as HTMLElement
      await user.click(within(within(card).getAllByRole('listitem')[0]).getByRole('button', { name: 'Edit' }))
      const dialog = screen.getByRole('dialog', { name: 'Edit expense' })
      await user.clear(within(dialog).getByLabelText(/What was it for/))
      await user.click(within(dialog).getByRole('button', { name: 'Save changes' }))

      expect(
        within(screen.getByRole('alert')).getByText('Describe what this was for, in at least 2 characters.'),
      ).toBeInTheDocument()
      expect(readStoredState().expensesByTrip[FIXTURE_TRIP_ID][4].description).toBe(
        FIXTURE_EXPENSE_DESCRIPTIONS[4],
      )
    })
  })

  describe('removing an expense', () => {
    it('names the entry that is about to go, and can be called off', async () => {
      const user = userEvent.setup()
      renderBudget()

      const card = screen.getByRole('heading', { name: 'Expenses' }).closest('section') as HTMLElement
      await user.click(within(within(card).getAllByRole('listitem')[2]).getByRole('button', { name: 'Delete' }))

      const dialog = screen.getByRole('dialog', { name: 'Delete this expense?' })
      expect(dialog).toHaveAccessibleDescription('This cannot be undone.')
      expect(dialog).toHaveTextContent(FIXTURE_EXPENSE_DESCRIPTIONS[2])
      expect(dialog).toHaveTextContent('€45.00 EUR')
      expect(dialog).toHaveTextContent(
        `${formatDate(addDays(FIXTURE_DAY_ONE_DATE, 1))} · Transport`,
      )
      expect(dialog).toHaveTextContent(
        'Actual Spent and Remaining Budget are recalculated without it. The AI Draft Estimate is never touched.',
      )

      await user.click(within(dialog).getByRole('button', { name: 'Keep it' }))

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(readStoredState().expensesByTrip[FIXTURE_TRIP_ID]).toHaveLength(5)
    })

    it('drops the entry and recalculates the settled figures only', async () => {
      const user = userEvent.setup()
      renderBudget()

      const card = screen.getByRole('heading', { name: 'Expenses' }).closest('section') as HTMLElement
      await user.click(within(within(card).getAllByRole('listitem')[4]).getByRole('button', { name: 'Delete' }))
      const dialog = screen.getByRole('dialog', { name: 'Delete this expense?' })
      await user.click(within(dialog).getByRole('button', { name: 'Delete expense' }))

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(screen.queryByText(FIXTURE_EXPENSE_DESCRIPTIONS[0])).not.toBeInTheDocument()
      expect(screen.queryByText('€780.00 EUR')).not.toBeInTheDocument()
      expect(within(summary()).getByText('€605.00 EUR')).toBeInTheDocument()
      expect(within(summary()).getByText('€1,895.00 EUR')).toBeInTheDocument()
      expect(within(summary()).getByText('€129.00 EUR')).toBeInTheDocument()
      const stored = readStoredState().expensesByTrip[FIXTURE_TRIP_ID]
      expect(stored).toHaveLength(4)
      expect(stored.map((expense) => expense.id)).not.toContain('expense-1')
    })
  })

  describe('when the trip is gone', () => {
    it('explains what happened and offers a way back', () => {
      renderAt('trip-that-no-longer-exists', fixtureState())

      expect(screen.getByRole('heading', { level: 1, name: 'Budget' })).toBeInTheDocument()
      expect(screen.getByText('The trip this budget belonged to is no longer on this device.')).toBeInTheDocument()
      expect(screen.getByText('We could not find that trip')).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Back to trips' })).toHaveAttribute('href', '/trips')
    })
  })
})
