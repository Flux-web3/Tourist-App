import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '@/App'
import { FIXTURE_TRIP_ID, fixtureState } from '@/pages/__tests__/tripFixture'
import { STORAGE_KEY } from '@/services/persistence'

vi.mock('@/pages/BudgetPage', () => ({
  default: () => {
    throw new Error('the budget page fell over')
  },
}))

beforeEach(() => {
  // React and the boundary both report the error; neither belongs in the test output.
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
})

describe('App when a page fails to render', () => {
  it('shows a calm fallback inside the shell instead of a blank page, and recovers on navigation', async () => {
    const user = userEvent.setup()
    window.history.replaceState(null, '', `/trips/${FIXTURE_TRIP_ID}/budget`)
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fixtureState()))
    const { container } = render(<App />)

    expect(container).not.toBeEmptyDOMElement()
    const main = screen.getByRole('main')
    expect(
      within(main).getByRole('heading', { level: 1, name: 'Something went wrong on this page' }),
    ).toBeInTheDocument()
    expect(within(main).getByText(/Your saved trips are untouched/)).toBeInTheDocument()
    expect(within(main).getByRole('button', { name: 'Reload' })).toBeInTheDocument()
    expect(within(main).getByRole('link', { name: 'Back to trips' })).toHaveAttribute('href', '/trips')
    expect(screen.queryByText(/the budget page fell over/)).not.toBeInTheDocument()

    // The shell is still there, and leaving the broken page clears the fallback.
    await user.click(
      within(screen.getByRole('navigation', { name: 'Trip sections' })).getByRole('link', { name: 'Notes' }),
    )

    expect(screen.queryByText('Something went wrong on this page')).not.toBeInTheDocument()
    expect(await screen.findByText(/Your own record for this trip/)).toBeInTheDocument()
  })
})
