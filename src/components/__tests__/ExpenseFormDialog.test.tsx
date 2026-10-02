import { fireEvent, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ExpenseFormDialog } from '@/components/ExpenseFormDialog'
import { maxBudgetFor } from '@/domain/validation'
import { FIXTURE_TRIP_ID, fixtureState, readStoredState } from '@/pages/__tests__/tripFixture'
import { useTourist } from '@/state/useTourist'
import { renderWithProviders } from '@/test/renderWithProviders'
import type { CurrencyCode } from '@/domain/types'

const TOO_MUCH = 'That amount looks unrealistic. Enter a lower amount.'

function Harness({ onClose }: { onClose: () => void }) {
  const { state } = useTourist()
  const trip = state.trips.find((candidate) => candidate.id === FIXTURE_TRIP_ID)
  return trip ? <ExpenseFormDialog trip={trip} open onClose={onClose} /> : null
}

function renderDialog(currency: CurrencyCode = 'EUR') {
  const onClose = vi.fn()
  renderWithProviders(<Harness onClose={onClose} />, { state: fixtureState({ trip: { currency }, expenses: [] }) })
  return { onClose }
}

async function submit(amount: string) {
  const user = userEvent.setup()
  await user.type(screen.getByLabelText(/What was it for/), 'Dinner')
  fireEvent.change(screen.getByLabelText(/Amount/), { target: { value: amount } })
  await user.click(screen.getByRole('button', { name: 'Save expense' }))
}

function storedAmounts(): number[] {
  return (readStoredState().expensesByTrip[FIXTURE_TRIP_ID] ?? []).map((expense) => expense.amount)
}

describe('ExpenseFormDialog amount ceiling', () => {
  it.each(['1e21', '1000000.01'])('refuses %s, an amount above the trip budget ceiling', async (amount) => {
    const { onClose } = renderDialog()

    await submit(amount)

    expect(screen.getByRole('alert')).toHaveTextContent(TOO_MUCH)
    expect(screen.getByLabelText(/Amount/)).toHaveAttribute('aria-invalid', 'true')
    expect(onClose).not.toHaveBeenCalled()
    expect(storedAmounts()).toEqual([])
  })

  it('accepts an amount exactly at the ceiling', async () => {
    const { onClose } = renderDialog()

    await submit(String(maxBudgetFor('EUR')))

    expect(onClose).toHaveBeenCalledOnce()
    expect(storedAmounts()).toEqual([maxBudgetFor('EUR')])
  })

  it('scales the ceiling with the currency, as the budget field does', async () => {
    const { onClose } = renderDialog('NGN')

    // More than the euro ceiling, well inside the naira one.
    await submit(String(maxBudgetFor('EUR') * 2))

    expect(maxBudgetFor('NGN')).toBeGreaterThan(maxBudgetFor('EUR') * 2)
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('tells the browser the same ceiling', () => {
    renderDialog()

    expect(screen.getByLabelText(/Amount/)).toHaveAttribute('max', String(maxBudgetFor('EUR')))
  })
})
