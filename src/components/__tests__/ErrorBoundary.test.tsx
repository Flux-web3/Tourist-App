import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { ErrorBoundary, RouteErrorBoundary } from '@/components/ErrorBoundary'

function Broken(): never {
  throw new Error('secret internal detail')
}

let consoleError: MockInstance

beforeEach(() => {
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

describe('ErrorBoundary', () => {
  it('renders its children while nothing is wrong', () => {
    render(
      <ErrorBoundary>
        <p>All good</p>
      </ErrorBoundary>,
    )

    expect(screen.getByText('All good')).toBeInTheDocument()
  })

  it('replaces a child that throws with a plain fallback and both ways out', () => {
    render(
      <ErrorBoundary>
        <Broken />
      </ErrorBoundary>,
    )

    expect(
      screen.getByRole('heading', { level: 1, name: 'Something went wrong on this page' }),
    ).toBeInTheDocument()
    expect(screen.getByText(/Your saved trips are untouched/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to trips' })).toHaveAttribute('href', '/trips')
    // Works with no router around it, and is its own page landmark.
    expect(screen.getByRole('main')).toBeInTheDocument()
  })

  it('never shows the error itself, and logs it for the developer', () => {
    render(
      <ErrorBoundary>
        <Broken />
      </ErrorBoundary>,
    )

    expect(screen.queryByText(/secret internal detail/)).not.toBeInTheDocument()
    const logged = consoleError.mock.calls.some((call) =>
      call.some((part) => part instanceof Error && part.message === 'secret internal detail'),
    )
    expect(logged).toBe(true)
  })

  it('reloads the page from the Reload button', async () => {
    const user = userEvent.setup()
    const reload = vi.fn()
    render(
      <ErrorBoundary onReload={reload}>
        <Broken />
      </ErrorBoundary>,
    )

    await user.click(screen.getByRole('button', { name: 'Reload' }))

    expect(reload).toHaveBeenCalledOnce()
  })
})

describe('RouteErrorBoundary', () => {
  function Shell() {
    return (
      <MemoryRouter initialEntries={['/broken']}>
        <nav aria-label="Primary">
          <Link to="/fine">Fine page</Link>
          <Link to="/broken">Broken page</Link>
        </nav>
        <main>
          <RouteErrorBoundary>
            <Routes>
              <Route path="/broken" element={<Broken />} />
              <Route path="/fine" element={<p>A page that works</p>} />
              <Route path="/trips" element={<p>Trips list</p>} />
            </Routes>
          </RouteErrorBoundary>
        </main>
      </MemoryRouter>
    )
  }

  it('keeps the navigation around it usable and clears when the route changes', async () => {
    const user = userEvent.setup()
    render(<Shell />)

    expect(screen.getByRole('heading', { name: 'Something went wrong on this page' })).toBeInTheDocument()
    // Inside the shell it does not add a second main landmark.
    expect(screen.getAllByRole('main')).toHaveLength(1)

    await user.click(screen.getByRole('link', { name: 'Fine page' }))

    expect(screen.getByText('A page that works')).toBeInTheDocument()
    expect(screen.queryByText('Something went wrong on this page')).not.toBeInTheDocument()

    await user.click(screen.getByRole('link', { name: 'Broken page' }))
    expect(screen.getByRole('heading', { name: 'Something went wrong on this page' })).toBeInTheDocument()
  })

  it('takes the traveller back to their trips without a reload', async () => {
    const user = userEvent.setup()
    render(<Shell />)

    await user.click(screen.getByRole('link', { name: 'Back to trips' }))

    expect(screen.getByText('Trips list')).toBeInTheDocument()
  })
})
