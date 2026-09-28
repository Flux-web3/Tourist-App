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
  makeFixtureTrip,
  readStoredState,
} from '@/pages/__tests__/tripFixture'
import { addDays } from '@/domain/format'
import { formatAmount, fromCents, sumAmounts, toCents } from '@/domain/money'
import type { Expense } from '@/domain/types'
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

function breakdownCard(): HTMLElement {
  return screen.getByRole('heading', { name: 'Where the money went' }).closest('section') as HTMLElement
}

/** Text that is a money figure and nothing else, e.g. `-€1,079.50` or `¥4,602`. */
const MONEY = /^-?[€$£₦¥][\d,]+(\.\d+)?$/

/** `-€1,079.50` → -1079.5. Only for reading figures back off the page. */
function parseMoney(text: string | null): number {
  return Number((text ?? '').replace(/[^0-9.-]/g, ''))
}

function figureAmount(label: string): number {
  return parseMoney(within(figure(label)).getByText(MONEY).textContent)
}

/** Each category row's amount, read from the page in display order. */
function breakdownAmounts(): number[] {
  return within(breakdownCard())
    .getAllByRole('listitem')
    .map((row) => parseMoney(within(row).getByText(MONEY).textContent))
}

function expenseRow(description: string): HTMLElement {
  return within(expenseCard()).getByText(description).closest('li') as HTMLElement
}

function makeExpense(overrides: Partial<Expense> & Pick<Expense, 'id' | 'description'>): Expense {
  return {
    tripId: FIXTURE_TRIP_ID,
    amount: 10,
    currency: 'EUR',
    category: 'food',
    date: FIXTURE_DAY_ONE_DATE,
    notes: '',
    createdAt: '2026-02-01T08:00:00.000Z',
    updatedAt: '2026-02-01T08:00:00.000Z',
    ...overrides,
  }
}

/**
 * A trip that started in EUR and was switched to NGN. Two expenses were
 * logged in EUR before the switch, three in NGN after it.
 *
 *   counted (NGN):  60,000 stay + 15,000 food + 8,500.50 transport = 83,500.50
 *   left out (EUR): €1,200 stay + €44.50 activities
 */
const NGN_BUDGET = 500_000
const NGN_ACTUAL = 83_500.5
const NGN_EXPENSES: Expense[] = [
  makeExpense({ id: 'exp-eur-hotel', description: 'Hotel in Le Marais', amount: 1200, currency: 'EUR', category: 'stay' }),
  makeExpense({ id: 'exp-eur-louvre', description: 'Louvre entry', amount: 44.5, currency: 'EUR', category: 'activities' }),
  makeExpense({ id: 'exp-ngn-hotel', description: 'Hotel in Ikeja', amount: 60_000, currency: 'NGN', category: 'stay' }),
  makeExpense({ id: 'exp-ngn-suya', description: 'Suya at the airport', amount: 15_000, currency: 'NGN', category: 'food' }),
  makeExpense({ id: 'exp-ngn-taxi', description: 'Taxi to Ikeja', amount: 8_500.5, currency: 'NGN', category: 'transport' }),
]

function ngnState(expenses: Expense[] = NGN_EXPENSES): PersistedState {
  return fixtureState({ trip: { currency: 'NGN', budget: NGN_BUDGET }, expenses })
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

  describe('Remaining Budget with an estimate present', () => {
    // The fixture always carries a €129 AI Draft Estimate and €1,385 of logged
    // spend. Remaining must be the budget minus the spend and nothing else: not
    // shifted by the estimate in either direction, at any sign.
    it.each([
      { case: 'positive', budget: 2500, remaining: 1115 },
      { case: 'zero', budget: 1385, remaining: 0 },
      { case: 'negative', budget: 1000, remaining: -385 },
    ])('is Trip Budget minus Actual Spent when it is $case', ({ budget, remaining }) => {
      renderBudget(fixtureState({ trip: { budget } }))

      const tripBudget = figureAmount(PROTOTYPE_LABEL.tripBudget)
      const actualSpent = figureAmount(PROTOTYPE_LABEL.actualSpent)
      const shown = figureAmount(PROTOTYPE_LABEL.remaining)
      const estimate = figureAmount(PROTOTYPE_LABEL.aiDraftEstimate)

      expect(estimate).toBe(129)
      expect(tripBudget).toBe(budget)
      expect(actualSpent).toBe(1385)
      expect(toCents(shown)).toBe(toCents(tripBudget) - toCents(actualSpent))
      expect(shown).toBe(remaining)
      expect(within(figure(PROTOTYPE_LABEL.remaining)).getByText(formatAmount(remaining, 'EUR'))).toBeInTheDocument()
      // Either direction of mixing the estimate in would give one of these.
      expect(toCents(shown)).not.toBe(toCents(budget) - toCents(1385) - toCents(estimate))
      expect(toCents(shown)).not.toBe(toCents(budget) - toCents(1385) + toCents(estimate))

      const pastBudget = within(figure(PROTOTYPE_LABEL.remaining)).queryByText(/past your/)
      if (remaining < 0) expect(pastBudget).toBeInTheDocument()
      else expect(pastBudget).not.toBeInTheDocument()
    })
  })

  describe('an expense logged in another currency', () => {
    it('lists each expense in its own currency, never relabelled with the trip’s', () => {
      renderBudget(ngnState())

      const hotel = expenseRow('Hotel in Le Marais')
      expect(within(hotel).getByText('€1,200')).toBeInTheDocument()
      expect(hotel).not.toHaveTextContent('₦1,200')
      expect(hotel).toHaveTextContent('EUR · not in the NGN total')

      const louvre = expenseRow('Louvre entry')
      expect(within(louvre).getByText('€44.50')).toBeInTheDocument()
      expect(louvre).not.toHaveTextContent('₦44.50')
      expect(louvre).toHaveTextContent('EUR · not in the NGN total')

      // Expenses already in the trip currency carry no note.
      const taxi = expenseRow('Taxi to Ikeja')
      expect(within(taxi).getByText('₦8,500.50')).toBeInTheDocument()
      expect(taxi).not.toHaveTextContent('not in the')
      expect(expenseRow('Hotel in Ikeja')).not.toHaveTextContent('not in the')

      // The note is small print in the subtle ink, not a second amount.
      expect(within(hotel).getByText('EUR · not in the NGN total')).toHaveClass('text-ink-subtle', 'tnum')
    })

    it('confirms a delete in the expense’s own currency, and says no total moves', async () => {
      const user = userEvent.setup()
      renderBudget(ngnState())

      const hotel = expenseRow('Hotel in Le Marais')
      await openRowMenu(user, hotel, 'Hotel in Le Marais')
      await user.click(within(hotel).getByRole('menuitem', { name: 'Delete' }))

      const dialog = screen.getByRole('dialog', { name: 'Delete this expense?' })
      expect(within(dialog).getByText('€1,200')).toBeInTheDocument()
      expect(dialog).not.toHaveTextContent('₦1,200')
      expect(dialog).toHaveTextContent('EUR · not in the NGN total')
      expect(dialog).toHaveTextContent(
        'It is not counted in Actual Spent, so Actual Spent and Remaining Budget stay as they are. The AI Draft Estimate is never touched.',
      )
      expect(dialog).not.toHaveTextContent('recalculated without it')

      await user.click(within(dialog).getByRole('button', { name: 'Delete expense' }))

      expect(figureAmount(PROTOTYPE_LABEL.actualSpent)).toBe(NGN_ACTUAL)
      expect(figureAmount(PROTOTYPE_LABEL.remaining)).toBe(NGN_BUDGET - NGN_ACTUAL)
      expect(screen.getByText('1 expense is not counted in this total')).toBeInTheDocument()
    })

    it('still confirms a same-currency delete as a recalculation', async () => {
      const user = userEvent.setup()
      renderBudget(ngnState())

      const taxi = expenseRow('Taxi to Ikeja')
      await openRowMenu(user, taxi, 'Taxi to Ikeja')
      await user.click(within(taxi).getByRole('menuitem', { name: 'Delete' }))

      const dialog = screen.getByRole('dialog', { name: 'Delete this expense?' })
      expect(within(dialog).getByText('₦8,500.50')).toBeInTheDocument()
      expect(dialog).not.toHaveTextContent('not in the NGN total')
      expect(dialog).toHaveTextContent('Actual Spent and Remaining Budget are recalculated without it.')
    })

    it('edits the expense in its own currency and keeps it there', async () => {
      const user = userEvent.setup()
      renderBudget(ngnState())

      const hotel = expenseRow('Hotel in Le Marais')
      await openRowMenu(user, hotel, 'Hotel in Le Marais')
      await user.click(within(hotel).getByRole('menuitem', { name: 'Edit' }))

      const dialog = screen.getByRole('dialog', { name: 'Edit expense' })
      expect(dialog).toHaveTextContent('Amounts are in EUR (€) and never converted.')
      expect(dialog).not.toHaveTextContent('Amounts are in NGN')
      expect(dialog).toHaveTextContent(
        'This expense was logged in EUR and this trip is in NGN, so it is not in the NGN total. Saving keeps it in EUR.',
      )
      expect(within(dialog).getByText('€')).toBeInTheDocument()
      expect(within(dialog).queryByText('₦')).not.toBeInTheDocument()

      const amount = within(dialog).getByLabelText(/Amount/)
      await user.clear(amount)
      await user.type(amount, '1250.005')
      await user.click(within(dialog).getByRole('button', { name: 'Save changes' }))

      const stored = readStoredState().expensesByTrip[FIXTURE_TRIP_ID].find(
        (expense) => expense.id === 'exp-eur-hotel',
      )
      expect(stored).toMatchObject({ amount: 1250.01, currency: 'EUR' })
      expect(within(expenseRow('Hotel in Le Marais')).getByText('€1,250.01')).toBeInTheDocument()
      // Still not part of the naira totals.
      expect(figureAmount(PROTOTYPE_LABEL.actualSpent)).toBe(NGN_ACTUAL)
    })

    it('breaks down only the trip-currency spend, and the rows add up to Actual Spent', () => {
      renderBudget(ngnState())

      const rows = within(breakdownCard()).getAllByRole('listitem')
      expect(rows.map((row) => row.textContent)).toEqual([
        expect.stringContaining('Stay'),
        expect.stringContaining('Food'),
        expect.stringContaining('Transport'),
      ])
      // €44.50 of activities is the only activity spend, and it is not in NGN.
      expect(breakdownCard()).not.toHaveTextContent('Activities')
      // 61,200 or 60,044.50 would be naira and euros added together.
      expect(breakdownAmounts()).toEqual([60_000, 15_000, 8_500.5])
      expect(rows[0]).toHaveTextContent('₦60,000')
      expect(rows[0]).toHaveTextContent('72% · 1 expense')
      expect(rows[2]).toHaveTextContent('₦8,500.50')

      const actualSpent = figureAmount(PROTOTYPE_LABEL.actualSpent)
      expect(actualSpent).toBe(NGN_ACTUAL)
      expect(sumAmounts(breakdownAmounts(), 'NGN')).toBe(actualSpent)
      expect(within(breakdownCard()).getByText('₦83,500.50')).toBeInTheDocument()
      expect(screen.getByRole('progressbar', { name: 'Stay share of logged spend' })).toHaveAttribute(
        'aria-valuenow',
        '60000',
      )
      expect(within(breakdownCard()).getByText('Not counted here: 2 expenses in EUR.')).toBeInTheDocument()

      expect(figureAmount(PROTOTYPE_LABEL.remaining)).toBe(NGN_BUDGET - NGN_ACTUAL)
    })

    it('has nothing to break down when every expense is in another currency', () => {
      renderBudget(ngnState(NGN_EXPENSES.filter((expense) => expense.currency === 'EUR')))

      expect(screen.getByText('Nothing in NGN to break down yet')).toBeInTheDocument()
      expect(
        screen.getByText(
          'Your 2 expenses are in EUR, kept exactly as logged. Each category appears here once you log spending in NGN.',
        ),
      ).toBeInTheDocument()
      expect(within(breakdownCard()).queryAllByRole('listitem')).toHaveLength(0)
      expect(figureAmount(PROTOTYPE_LABEL.actualSpent)).toBe(0)
      expect(figureAmount(PROTOTYPE_LABEL.remaining)).toBe(NGN_BUDGET)
      // Both are still listed, each in its own currency.
      expect(within(expenseRow('Hotel in Le Marais')).getByText('€1,200')).toBeInTheDocument()
    })
  })

  describe('the warning about expenses in another currency', () => {
    it('gives only advice the product can follow', async () => {
      const user = userEvent.setup()
      renderBudget(ngnState())

      const warning = screen.getByText('2 expenses are not counted in this total').closest('[role="status"]') as HTMLElement
      expect(warning).toHaveTextContent(
        "They were logged in EUR and this trip is in NGN. Tourist does not convert between currencies, so they are kept exactly as logged and left out of Actual Spent. Set the trip's currency back to EUR from Edit trip on the overview and they count again.",
      )
      // The old copy promised an edit the expense form cannot perform.
      expect(warning).not.toHaveTextContent(/Edit them/i)
      expect(warning).not.toHaveTextContent(/to NGN/)

      // And the form really cannot: there is no currency control on it.
      const hotel = expenseRow('Hotel in Le Marais')
      await openRowMenu(user, hotel, 'Hotel in Le Marais')
      await user.click(within(hotel).getByRole('menuitem', { name: 'Edit' }))
      const dialog = screen.getByRole('dialog', { name: 'Edit expense' })
      expect(within(dialog).getAllByRole('combobox')).toHaveLength(1)
      expect(within(dialog).getByRole('combobox', { name: /Category/ })).toBeInTheDocument()
      expect(within(dialog).queryByRole('combobox', { name: /Currency/i })).not.toBeInTheDocument()
    })

    it('reads naturally for a single expense', () => {
      renderBudget(ngnState(NGN_EXPENSES.filter((expense) => expense.id !== 'exp-eur-louvre')))

      const warning = screen.getByText('1 expense is not counted in this total').closest('[role="status"]') as HTMLElement
      expect(warning).toHaveTextContent(
        "It was logged in EUR and this trip is in NGN. Tourist does not convert between currencies, so it is kept exactly as logged and left out of Actual Spent. Set the trip's currency back to EUR from Edit trip on the overview and it counts again.",
      )
    })

    it('does not name a single currency to switch back to when there are several', () => {
      const withYen = [
        ...NGN_EXPENSES,
        makeExpense({ id: 'exp-jpy', description: 'Ramen in Shinjuku', amount: 1200, currency: 'JPY' }),
      ]
      renderBudget(ngnState(withYen))

      const warning = screen.getByText('3 expenses are not counted in this total').closest('[role="status"]') as HTMLElement
      expect(warning).toHaveTextContent('They were logged in EUR, JPY and this trip is in NGN.')
      expect(warning).toHaveTextContent(
        "Set the trip's currency to one of those from Edit trip on the overview and the expenses logged in it count again.",
      )
      expect(within(breakdownCard()).getByText('Not counted here: 3 expenses in EUR, JPY.')).toBeInTheDocument()
    })
  })

  describe('a trip in yen', () => {
    it('totals the category rows in whole yen, with no minor unit', () => {
      // Fractions of a yen can only come from older data; each rounds to a
      // whole yen, exactly as Actual Spent rounds it.
      const expenses = [
        makeExpense({ id: 'exp-ramen', description: 'Ramen', amount: 1200.6, currency: 'JPY', category: 'food' }),
        makeExpense({ id: 'exp-sushi', description: 'Sushi', amount: 3400.6, currency: 'JPY', category: 'food' }),
        makeExpense({ id: 'exp-rail', description: 'Rail pass', amount: 5000, currency: 'JPY', category: 'transport' }),
        makeExpense({ id: 'exp-eur', description: 'Airport coffee', amount: 22.5, currency: 'EUR', category: 'food' }),
      ]
      renderBudget(fixtureState({ trip: { currency: 'JPY', budget: 150_000 }, expenses }))

      expect(breakdownAmounts()).toEqual([5000, 4602])
      expect(breakdownAmounts().every(Number.isInteger)).toBe(true)
      const rows = within(breakdownCard()).getAllByRole('listitem')
      expect(within(rows[1]).getByText('¥4,602')).toBeInTheDocument()
      expect(rows[1]).toHaveTextContent('2 expenses')
      expect(screen.getByRole('progressbar', { name: 'Food share of logged spend' })).toHaveAttribute(
        'aria-valuenow',
        '4602',
      )

      const actualSpent = figureAmount(PROTOTYPE_LABEL.actualSpent)
      expect(actualSpent).toBe(9602)
      expect(sumAmounts(breakdownAmounts(), 'JPY')).toBe(actualSpent)
      expect(figureAmount(PROTOTYPE_LABEL.remaining)).toBe(150_000 - 9602)
      expect(within(expenseRow('Airport coffee')).getByText('€22.50')).toBeInTheDocument()
    })
  })

  describe('rounding an entered amount', () => {
    async function addExpense(user: ReturnType<typeof userEvent.setup>, description: string, typed: string) {
      await user.click(screen.getAllByRole('button', { name: 'Add expense' })[0])
      const dialog = screen.getByRole('dialog', { name: 'Add expense' })
      await user.type(within(dialog).getByLabelText(/What was it for/), description)
      const amount = within(dialog).getByLabelText(/Amount/)
      await user.clear(amount)
      await user.type(amount, typed)
      await user.click(within(dialog).getByRole('button', { name: 'Save expense' }))
    }

    function storedByDescription(description: string): Expense | undefined {
      return readStoredState().expensesByTrip[FIXTURE_TRIP_ID].find(
        (expense) => expense.description === description,
      )
    }

    it('stores 1.005 exactly as toCents rounds it', async () => {
      const user = userEvent.setup()
      renderBudget()

      await addExpense(user, 'Half-cent coffee', '1.005')

      const expected = fromCents(toCents(1.005, 'EUR'), 'EUR')
      expect(expected).toBe(1.01)
      expect(storedByDescription('Half-cent coffee')?.amount).toBe(expected)
      expect(within(expenseRow('Half-cent coffee')).getByText('€1.01')).toBeInTheDocument()
      expect(figureAmount(PROTOTYPE_LABEL.actualSpent)).toBe(1386.01)
    })

    it('rounds a correction the same way', async () => {
      const user = userEvent.setup()
      renderBudget()

      const row = expenseRow(FIXTURE_EXPENSE_DESCRIPTIONS[3])
      await openRowMenu(user, row, FIXTURE_EXPENSE_DESCRIPTIONS[3])
      await user.click(within(row).getByRole('menuitem', { name: 'Edit' }))
      const dialog = screen.getByRole('dialog', { name: 'Edit expense' })
      const amount = within(dialog).getByLabelText(/Amount/)
      await user.clear(amount)
      await user.type(amount, '1.005')
      await user.click(within(dialog).getByRole('button', { name: 'Save changes' }))

      expect(storedByDescription(FIXTURE_EXPENSE_DESCRIPTIONS[3])?.amount).toBe(
        fromCents(toCents(1.005, 'EUR'), 'EUR'),
      )
    })

    it('rounds yen once, to whole yen, rather than to hundredths first', async () => {
      const user = userEvent.setup()
      renderBudget(fixtureState({ trip: { currency: 'JPY', budget: 150_000 }, expenses: [] }))

      // Hundredths first gives 1,500.50, which then rounds up to 1,501.
      await addExpense(user, 'Train ticket', '1500.499')

      expect(storedByDescription('Train ticket')).toMatchObject({
        amount: fromCents(toCents(1500.499, 'JPY'), 'JPY'),
        currency: 'JPY',
      })
      expect(storedByDescription('Train ticket')?.amount).toBe(1500)
      expect(figureAmount(PROTOTYPE_LABEL.actualSpent)).toBe(1500)
    })

    it('refuses an amount smaller than the currency’s smallest unit', async () => {
      const user = userEvent.setup()
      renderBudget(fixtureState({ trip: { currency: 'JPY', budget: 150_000 }, expenses: [] }))

      await addExpense(user, 'Sweet', '0.4')

      expect(within(screen.getByRole('alert')).getByText('Enter at least ¥1.')).toBeInTheDocument()
      expect(screen.getByRole('dialog', { name: 'Add expense' })).toBeInTheDocument()
      expect(readStoredState().expensesByTrip[FIXTURE_TRIP_ID]).toHaveLength(0)
    })
  })

  describe('keeping each trip’s money to itself', () => {
    const VENICE_ID = 'trip-venice'
    const VENICE_DESCRIPTIONS = ['Gondola ride', 'Hotel on the Grand Canal']

    /** The fixture trip plus a second EUR trip with its own expenses. */
    function twoTripState(): PersistedState {
      const base = fixtureState({
        extraTrips: [
          makeFixtureTrip({ id: VENICE_ID, name: 'Venice in Autumn', budget: 1000 }),
        ],
      })
      return {
        ...base,
        daysByTrip: { ...base.daysByTrip, [VENICE_ID]: [] },
        expensesByTrip: {
          ...base.expensesByTrip,
          [VENICE_ID]: [
            makeExpense({ id: 'exp-gondola', tripId: VENICE_ID, description: VENICE_DESCRIPTIONS[0], amount: 80, category: 'activities' }),
            makeExpense({ id: 'exp-canal', tripId: VENICE_ID, description: VENICE_DESCRIPTIONS[1], amount: 300, category: 'stay' }),
          ],
        },
      }
    }

    /**
     * Everything the fixture trip's page shows must come from its own
     * expenses: Actual Spent, Remaining, and rows that add up to Actual Spent,
     * with nothing from the Venice trip anywhere on the page or in its store.
     */
    function expectParisFigures(actualSpent: number, rows: number[]) {
      expect(figureAmount(PROTOTYPE_LABEL.actualSpent)).toBe(actualSpent)
      expect(toCents(figureAmount(PROTOTYPE_LABEL.remaining))).toBe(toCents(2500) - toCents(actualSpent))
      expect(breakdownAmounts()).toEqual(rows)
      expect(sumAmounts(breakdownAmounts(), 'EUR')).toBe(actualSpent)
      for (const description of VENICE_DESCRIPTIONS) {
        expect(screen.queryByText(description)).not.toBeInTheDocument()
      }
      const venice = readStoredState().expensesByTrip[VENICE_ID]
      expect(venice.map((expense) => [expense.description, expense.amount, expense.category])).toEqual([
        [VENICE_DESCRIPTIONS[0], 80, 'activities'],
        [VENICE_DESCRIPTIONS[1], 300, 'stay'],
      ])
    }

    it('keeps totals and rows right through add, edit, recategorise and delete', async () => {
      const user = userEvent.setup()
      const view = renderBudget(twoTripState())

      // transport 825 · stay 420 · food 96 · activities 44
      expectParisFigures(1385, [825, 420, 96, 44])

      // Add €35.50 of activities.
      await user.click(screen.getAllByRole('button', { name: 'Add expense' })[0])
      let dialog = screen.getByRole('dialog', { name: 'Add expense' })
      await user.type(within(dialog).getByLabelText(/What was it for/), 'Museum tickets')
      let amount = within(dialog).getByLabelText(/Amount/)
      await user.clear(amount)
      await user.type(amount, '35.50')
      await user.selectOptions(within(dialog).getByLabelText(/Category/), 'activities')
      await user.click(within(dialog).getByRole('button', { name: 'Save expense' }))
      expectParisFigures(1420.5, [825, 420, 96, 79.5])

      // Edit the Louvre tickets from €44 to €60.
      let row = expenseRow(FIXTURE_EXPENSE_DESCRIPTIONS[3])
      await openRowMenu(user, row, FIXTURE_EXPENSE_DESCRIPTIONS[3])
      await user.click(within(row).getByRole('menuitem', { name: 'Edit' }))
      dialog = screen.getByRole('dialog', { name: 'Edit expense' })
      amount = within(dialog).getByLabelText(/Amount/)
      await user.clear(amount)
      await user.type(amount, '60')
      await user.click(within(dialog).getByRole('button', { name: 'Save changes' }))
      expectParisFigures(1436.5, [825, 420, 96, 95.5])

      // Move the Louvre tickets from activities to food.
      row = expenseRow(FIXTURE_EXPENSE_DESCRIPTIONS[3])
      await openRowMenu(user, row, FIXTURE_EXPENSE_DESCRIPTIONS[3])
      await user.click(within(row).getByRole('menuitem', { name: 'Edit' }))
      dialog = screen.getByRole('dialog', { name: 'Edit expense' })
      await user.selectOptions(within(dialog).getByLabelText(/Category/), 'food')
      await user.click(within(dialog).getByRole('button', { name: 'Save changes' }))
      expectParisFigures(1436.5, [825, 420, 156, 35.5])
      expect(within(breakdownCard()).getAllByRole('listitem')[2]).toHaveTextContent('Food')
      expect(within(breakdownCard()).getAllByRole('listitem')[2]).toHaveTextContent('2 expenses')

      // Delete the €780 flights.
      row = expenseRow(FIXTURE_EXPENSE_DESCRIPTIONS[0])
      await openRowMenu(user, row, FIXTURE_EXPENSE_DESCRIPTIONS[0])
      await user.click(within(row).getByRole('menuitem', { name: 'Delete' }))
      await user.click(
        within(screen.getByRole('dialog', { name: 'Delete this expense?' })).getByRole('button', {
          name: 'Delete expense',
        }),
      )
      // stay 420 · food 156 · transport 45 · activities 35.50
      expectParisFigures(656.5, [420, 156, 45, 35.5])

      // The Venice page, rendered from what was saved, has only its own money.
      view.unmount()
      renderAt(VENICE_ID, readStoredState())
      expect(screen.getByRole('heading', { level: 1, name: 'Venice in Autumn' })).toBeInTheDocument()
      expect(figureAmount(PROTOTYPE_LABEL.actualSpent)).toBe(380)
      expect(figureAmount(PROTOTYPE_LABEL.remaining)).toBe(620)
      expect(breakdownAmounts()).toEqual([300, 80])
      expect(within(expenseCard()).getAllByRole('listitem')).toHaveLength(2)
      for (const description of [...FIXTURE_EXPENSE_DESCRIPTIONS, 'Museum tickets']) {
        expect(screen.queryByText(description)).not.toBeInTheDocument()
      }
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
