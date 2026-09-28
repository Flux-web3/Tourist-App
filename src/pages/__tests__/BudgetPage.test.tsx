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

/**
 * The block inside the summary that carries one of the four figures, found by
 * its own label. Each figure has to stay individually identifiable: that is the
 * whole point of the page, so it is asserted structurally rather than by
 * counting money strings that might collide.
 */
function figure(label: string): HTMLElement {
  return within(summary()).getByText(label).closest('div') as HTMLElement
}

function expenseCard(): HTMLElement {
  return screen.getByRole('heading', { name: 'Expenses' }).closest('section') as HTMLElement
}

async function openRowMenu(
  user: ReturnType<typeof userEvent.setup>,
  row: HTMLElement,
  description: string,
) {
  await user.click(within(row).getByRole('button', { name: `Actions for ${description}` }))
}

describe('BudgetPage', () => {
  it('frames the page around the trip and the two things it can do', () => {
    renderBudget()

    expect(screen.getByRole('heading', { level: 1, name: 'Paris in the Spring' })).toBeInTheDocument()
    expect(screen.getByText('Budget')).toBeInTheDocument()
    expect(
      screen.getByText(
        'Log what you spend and this stays honest: the itinerary estimate is a projection, never a bill.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Trip overview' })).toHaveAttribute(
      'href',
      `/trips/${FIXTURE_TRIP_ID}`,
    )
    expect(screen.getAllByRole('button', { name: 'Add expense' })).toHaveLength(2)
  })

  it('keeps the four figures apart, each with its own amount', () => {
    renderBudget()

    expect(figure(PROTOTYPE_LABEL.tripBudget)).toHaveTextContent('€2,500')
    expect(figure(PROTOTYPE_LABEL.aiDraftEstimate)).toHaveTextContent('€129')
    expect(figure(PROTOTYPE_LABEL.actualSpent)).toHaveTextContent('€1,385')
    expect(figure(PROTOTYPE_LABEL.remaining)).toHaveTextContent('€1,115')
  })

  it('keeps the AI estimate marked as a projection, never as money spent', () => {
    renderBudget()

    expect(figure(PROTOTYPE_LABEL.aiDraftEstimate)).toHaveTextContent('a projection')
    expect(figure(PROTOTYPE_LABEL.actualSpent)).toHaveTextContent('settled')
    expect(figure(PROTOTYPE_LABEL.tripBudget)).toHaveTextContent('your ceiling')
  })

  it('works remaining out from the budget and logged spending only', () => {
    // Trip budget 2,500 - actual spent 1,385 = 1,115. Mixing the 129 estimate
    // in either direction would give 986 or 1,244.
    renderBudget()

    const remaining = figure(PROTOTYPE_LABEL.remaining)
    expect(remaining).toHaveTextContent('€1,115')
    expect(remaining).toHaveTextContent(
      `${PROTOTYPE_LABEL.tripBudget} minus ${PROTOTYPE_LABEL.actualSpent}.`,
    )
    expect(summary().textContent).not.toContain('€986')
    expect(summary().textContent).not.toContain('€1,244')
  })

  it('states the currency once instead of against every figure', () => {
    renderBudget()

    expect(screen.getByText('All amounts in EUR (€).')).toBeInTheDocument()
    expect(summary().textContent).not.toContain('EUR')
    expect(screen.queryAllByText(/EUR/)).toHaveLength(1)
  })

  it('measures the logged spending against the budget', () => {
    renderBudget()

    expect(screen.getByText('Budget used')).toBeInTheDocument()
    expect(screen.getByText('55% of €2,500')).toBeInTheDocument()
    const bar = screen.getByRole('progressbar', { name: 'Budget used' })
    expect(bar).toHaveAttribute('aria-valuenow', '1385')
    expect(bar).toHaveAttribute('aria-valuemax', '2500')
  })

  it('reads a negative remaining calmly, in the danger tokens', () => {
    renderBudget(fixtureState({ trip: { budget: 1000 } }))

    const remaining = figure(PROTOTYPE_LABEL.remaining)
    expect(remaining).toHaveTextContent('-€385')
    expect(remaining).toHaveTextContent(
      '€385 past your Trip Budget. Log less, remove an expense, or raise the budget.',
    )
    // Tokens, not a hard-coded red, and not an alarm-role banner.
    expect(remaining).toHaveClass('border-danger/50')
    expect(within(remaining).getByText('-€385')).toHaveClass('text-danger')
    expect(remaining).toHaveAttribute('role', 'status')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByText('139% of €1,000')).toBeInTheDocument()
  })

  it('invites a budget instead of a broken bar when none is set', () => {
    renderBudget(fixtureState({ trip: { budget: 0 } }))

    expect(screen.getByText('No trip budget set yet')).toBeInTheDocument()
    expect(
      screen.getByText('Add a trip budget and this bar starts tracking how far the trip has gone.'),
    ).toBeInTheDocument()
  })

  it('keeps the rules the four figures follow one tap away', () => {
    renderBudget()

    const explainer = screen.getByText('All amounts in EUR (€).').closest('details') as HTMLElement
    expect(
      within(explainer).getByText(/Your ceiling for the whole trip\. You set it when planning the trip/),
    ).toBeInTheDocument()
    expect(
      within(explainer).getByText(/A projection from the itinerary, not a booking or a bill\./),
    ).toBeInTheDocument()
    expect(
      within(explainer).getByText(/Expenses you have logged\. This is the only settled figure/),
    ).toBeInTheDocument()
    expect(
      within(explainer).getByText(/It can go negative, which means you are over budget\./),
    ).toBeInTheDocument()
    expect(within(explainer).getByText(/never added to your actual spend/)).toBeInTheDocument()
    expect(within(explainer).getByText(/no currency conversion happens anywhere in Tourist/)).toBeInTheDocument()
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
    expect(rows[0]).toHaveTextContent('€825')
    expect(rows[0]).toHaveTextContent('60% · 2 expenses')
    expect(rows[1]).toHaveTextContent('€420')
    expect(rows[1]).toHaveTextContent('30% · 1 expense')
    expect(rows[2]).toHaveTextContent('€96')
    expect(rows[3]).toHaveTextContent('€44')
    expect(within(card).getByText('Total logged')).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: 'Transport share of logged spend' })).toHaveAttribute(
      'aria-valuenow',
      '825',
    )
  })

  it('lists the expenses newest first, each with its category, date and amount', () => {
    renderBudget()

    const card = expenseCard()
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
    expect(rows[0]).toHaveTextContent('€96')
    expect(rows[0]).toHaveTextContent('Food')
    expect(rows[0]).toHaveTextContent(formatShortDate(addDays(FIXTURE_DAY_ONE_DATE, 3)))
    expect(rows[4]).toHaveTextContent('€780')
    expect(rows[4]).toHaveTextContent('Transport')
    expect(rows[4]).toHaveTextContent(formatShortDate(addDays(FIXTURE_DAY_ONE_DATE, -1)))
    expect(within(card).getByText(PROTOTYPE_LABEL.actualSpent)).toBeInTheDocument()
  })

  it('puts each row’s actions behind one named menu button', async () => {
    const user = userEvent.setup()
    renderBudget()

    const card = expenseCard()
    // One control per row, not an Edit and a Delete on all five.
    expect(within(card).queryAllByRole('button', { name: 'Edit' })).toHaveLength(0)
    expect(within(card).queryAllByRole('button', { name: 'Delete' })).toHaveLength(0)
    for (const description of FIXTURE_EXPENSE_DESCRIPTIONS) {
      expect(
        within(card).getByRole('button', { name: `Actions for ${description}` }),
      ).toBeInTheDocument()
    }

    const row = within(card).getAllByRole('listitem')[0]
    await openRowMenu(user, row, FIXTURE_EXPENSE_DESCRIPTIONS[4])
    const menu = within(row).getByRole('menu', { name: `Actions for ${FIXTURE_EXPENSE_DESCRIPTIONS[4]}` })
    expect(within(menu).getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'editEdit',
      'delete_outlineDelete',
    ])
  })

  it('starts from an honest empty budget', () => {
    const state = fixtureState()
    renderBudget({ ...state, expensesByTrip: { [FIXTURE_TRIP_ID]: [] } })

    expect(screen.getByText('No spending to break down yet')).toBeInTheDocument()
    expect(screen.getByText('No expenses logged yet')).toBeInTheDocument()
    expect(figure(PROTOTYPE_LABEL.actualSpent)).toHaveTextContent('€0')
    expect(figure(PROTOTYPE_LABEL.remaining)).toHaveTextContent('€2,500')
    expect(screen.getByText('0% of €2,500')).toBeInTheDocument()
  })

  it('lists the projection for each day, separate from real spending', () => {
    renderBudget()

    const card = screen.getByRole('heading', { name: 'Planned estimate by day' }).closest('section') as HTMLElement
    const rows = within(card).getAllByRole('listitem')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveTextContent('€84')
    expect(rows[0]).toHaveTextContent('Day 1')
    expect(rows[0]).toHaveTextContent(formatShortDate(FIXTURE_DAY_ONE_DATE))
    expect(rows[1]).toHaveTextContent('€45')
    expect(rows[1]).toHaveTextContent('Day 2')
    expect(rows[1]).toHaveTextContent(formatShortDate(addDays(FIXTURE_DAY_ONE_DATE, 1)))
    expect(within(card).getByText(PROTOTYPE_LABEL.aiDraftEstimate)).toBeInTheDocument()
    expect(within(card).getByText('€129')).toBeInTheDocument()
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

    it('states the currency once in the form, not twice in the amount field', async () => {
      const user = userEvent.setup()
      renderBudget()

      await user.click(screen.getAllByRole('button', { name: 'Add expense' })[0])
      const dialog = screen.getByRole('dialog', { name: 'Add expense' })
      expect(
        within(dialog).getByText(
          'Amounts are in EUR (€) and never converted. Anything paid before departure counts too.',
        ),
      ).toBeInTheDocument()
      expect(within(dialog).queryAllByText('EUR')).toHaveLength(0)
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
      expect(within(expenseCard()).getByText('€35.50')).toBeInTheDocument()
      expect(figure(PROTOTYPE_LABEL.actualSpent)).toHaveTextContent('€1,420.50')
      expect(figure(PROTOTYPE_LABEL.remaining)).toHaveTextContent('€1,079.50')
      expect(figure(PROTOTYPE_LABEL.aiDraftEstimate)).toHaveTextContent('€129')
      expect(screen.getByText('57% of €2,500')).toBeInTheDocument()
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

      const row = within(expenseCard()).getAllByRole('listitem')[1]
      await openRowMenu(user, row, FIXTURE_EXPENSE_DESCRIPTIONS[3])
      await user.click(within(row).getByRole('menuitem', { name: 'Edit' }))

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
      expect(figure(PROTOTYPE_LABEL.actualSpent)).toHaveTextContent('€1,401')
      const stored = readStoredState().expensesByTrip[FIXTURE_TRIP_ID]
      expect(stored).toHaveLength(5)
      expect(stored[3]).toMatchObject({ amount: 60, description: FIXTURE_EXPENSE_DESCRIPTIONS[3] })
    })

    it('rejects a correction that empties the description', async () => {
      const user = userEvent.setup()
      renderBudget()

      const row = within(expenseCard()).getAllByRole('listitem')[0]
      await openRowMenu(user, row, FIXTURE_EXPENSE_DESCRIPTIONS[4])
      await user.click(within(row).getByRole('menuitem', { name: 'Edit' }))
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
    it('never deletes on a single click, and can be called off', async () => {
      const user = userEvent.setup()
      renderBudget()

      const row = within(expenseCard()).getAllByRole('listitem')[2]
      await openRowMenu(user, row, FIXTURE_EXPENSE_DESCRIPTIONS[2])
      await user.click(within(row).getByRole('menuitem', { name: 'Delete' }))

      // Choosing Delete opens a confirmation; nothing has gone yet.
      expect(readStoredState().expensesByTrip[FIXTURE_TRIP_ID]).toHaveLength(5)
      const dialog = screen.getByRole('dialog', { name: 'Delete this expense?' })
      expect(dialog).toHaveAccessibleDescription('This cannot be undone.')
      expect(dialog).toHaveTextContent(FIXTURE_EXPENSE_DESCRIPTIONS[2])
      expect(dialog).toHaveTextContent('€45')
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

      const row = within(expenseCard()).getAllByRole('listitem')[4]
      await openRowMenu(user, row, FIXTURE_EXPENSE_DESCRIPTIONS[0])
      await user.click(within(row).getByRole('menuitem', { name: 'Delete' }))
      const dialog = screen.getByRole('dialog', { name: 'Delete this expense?' })
      await user.click(within(dialog).getByRole('button', { name: 'Delete expense' }))

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(screen.queryByText(FIXTURE_EXPENSE_DESCRIPTIONS[0])).not.toBeInTheDocument()
      expect(figure(PROTOTYPE_LABEL.actualSpent)).toHaveTextContent('€605')
      expect(figure(PROTOTYPE_LABEL.remaining)).toHaveTextContent('€1,895')
      // The projection is untouched by a change to real spending.
      expect(figure(PROTOTYPE_LABEL.aiDraftEstimate)).toHaveTextContent('€129')
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
