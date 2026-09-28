import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { AppShell } from '@/components/AppShell'
import { PROTOTYPE_LABEL } from '@/lib/labels'
import { createEmptyState, createGuestUser } from '@/services/persistence'
import { demoStateFor, renderWithProviders, TEST_TRIP_ID } from '@/test/renderWithProviders'
import type { PersistedState } from '@/services/contracts'

function renderShell(route: string, state?: PersistedState) {
  return renderWithProviders(
    <AppShell>
      <p>Screen body</p>
    </AppShell>,
    { route, state },
  )
}

describe('AppShell', () => {
  it('offers a skip link that targets the main landmark', () => {
    renderShell('/trips', createEmptyState())

    const skip = screen.getByRole('link', { name: 'Skip to main content' })
    expect(skip).toHaveAttribute('href', '#main-content')
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content')
    expect(screen.getByRole('main')).toHaveTextContent('Screen body')
  })

  it('brands the header with a link back to the trips list', () => {
    renderShell('/explore', createEmptyState())

    expect(screen.getByRole('link', { name: 'Tourist' })).toHaveAttribute('href', '/trips')
  })

  it('renders the desktop and mobile primary navigation with the same label', () => {
    renderShell('/trips', createEmptyState())

    const navs = screen.getAllByRole('navigation', { name: 'Primary' })
    expect(navs).toHaveLength(2)
    for (const nav of navs) {
      expect(within(nav).getByRole('link', { name: 'Trips' })).toHaveAttribute('href', '/trips')
    }
  })

  it('sends Explore to the general catalogue when no trip is in context', () => {
    renderShell('/explore', createEmptyState())

    for (const link of screen.getAllByRole('link', { name: 'Explore' })) {
      expect(link).toHaveAttribute('href', '/explore')
    }
    expect(screen.queryByRole('navigation', { name: 'Trip sections' })).not.toBeInTheDocument()
  })

  it('marks the current section so the traveller knows where they are', () => {
    renderShell('/trips', createEmptyState())

    const [desktop, mobile] = screen.getAllByRole('navigation', { name: 'Primary' })
    expect(within(desktop).getByRole('link', { name: 'Trips' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(within(mobile).getByRole('link', { name: 'Trips' })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  it('labels the traveller as a guest by default', () => {
    renderShell('/trips', createEmptyState())

    expect(screen.getByText(PROTOTYPE_LABEL.guest)).toBeInTheDocument()
    expect(screen.queryByText(createGuestUser().name)).not.toBeInTheDocument()
  })

  it('shows the signed-in name instead of the guest label', () => {
    const user = createGuestUser({ name: 'Ada Lovelace', email: 'ada@example.com', isGuest: false })
    renderShell('/trips', createEmptyState(user))

    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument()
    expect(screen.queryByText(PROTOTYPE_LABEL.guest)).not.toBeInTheDocument()
  })

  it('states in the footer that nothing leaves the device', () => {
    renderShell('/trips', createEmptyState())

    const footer = screen.getByRole('contentinfo')
    expect(footer).toHaveTextContent(
      'Tourist prototype. Trips, plans and expenses stay on this device.',
    )
    expect(footer).toHaveTextContent('Itinerary drafts and prices are estimates, not bookings.')
  })

  describe('with a trip in context', () => {
    it('adds a trip section bar naming the trip', () => {
      renderShell(`/trips/${TEST_TRIP_ID}`, demoStateFor())

      const sections = screen.getByRole('navigation', { name: 'Trip sections' })
      expect(sections).toHaveTextContent('Paris in the Spring')
    })

    it('links each trip section to the matching screen', () => {
      renderShell(`/trips/${TEST_TRIP_ID}`, demoStateFor())

      const sections = screen.getByRole('navigation', { name: 'Trip sections' })
      expect(within(sections).getByRole('link', { name: 'Overview' })).toHaveAttribute(
        'href',
        `/trips/${TEST_TRIP_ID}`,
      )
      expect(within(sections).getByRole('link', { name: 'Itinerary' })).toHaveAttribute(
        'href',
        `/trips/${TEST_TRIP_ID}/itinerary`,
      )
      expect(within(sections).getByRole('link', { name: 'Explore' })).toHaveAttribute(
        'href',
        `/trips/${TEST_TRIP_ID}/explore`,
      )
      expect(within(sections).getByRole('link', { name: 'Budget' })).toHaveAttribute(
        'href',
        `/trips/${TEST_TRIP_ID}/budget`,
      )
    })

    it('scopes every Explore entry point to the trip', () => {
      renderShell(`/trips/${TEST_TRIP_ID}/itinerary`, demoStateFor())

      const exploreLinks = screen.getAllByRole('link', { name: 'Explore' })
      expect(exploreLinks).toHaveLength(3)
      for (const link of exploreLinks) {
        expect(link).toHaveAttribute('href', `/trips/${TEST_TRIP_ID}/explore`)
      }
    })

    it('points the mobile tab bar at the trip screens', () => {
      renderShell(`/trips/${TEST_TRIP_ID}/budget`, demoStateFor())

      const mobile = screen.getAllByRole('navigation', { name: 'Primary' })[1]
      expect(within(mobile).getByRole('link', { name: 'Overview' })).toHaveAttribute(
        'href',
        `/trips/${TEST_TRIP_ID}`,
      )
      expect(within(mobile).getByRole('link', { name: 'Itinerary' })).toHaveAttribute(
        'href',
        `/trips/${TEST_TRIP_ID}/itinerary`,
      )
      expect(within(mobile).getByRole('link', { name: 'Budget' })).toHaveAttribute(
        'href',
        `/trips/${TEST_TRIP_ID}/budget`,
      )
      expect(within(mobile).getByRole('link', { name: 'Budget' })).toHaveAttribute(
        'aria-current',
        'page',
      )
    })

    it('drops the trip sections when the id in the url is unknown', () => {
      renderShell('/trips/does-not-exist', demoStateFor())

      expect(screen.queryByRole('navigation', { name: 'Trip sections' })).not.toBeInTheDocument()
      for (const link of screen.getAllByRole('link', { name: 'Explore' })) {
        expect(link).toHaveAttribute('href', '/explore')
      }
      const mobile = screen.getAllByRole('navigation', { name: 'Primary' })[1]
      expect(within(mobile).getByRole('link', { name: 'Itinerary' })).toHaveAttribute(
        'href',
        '/trips',
      )
    })
  })

  describe('theme', () => {
    it('starts on the system preference', () => {
      renderShell('/trips', createEmptyState())

      const group = screen.getByRole('radiogroup', { name: 'Colour theme' })
      expect(within(group).getByRole('radio', { name: 'System' })).toBeChecked()
      expect(within(group).getByRole('radio', { name: 'Dark' })).not.toBeChecked()
    })

    it('applies and stores a new theme when the traveller picks one', async () => {
      const user = userEvent.setup()
      renderShell('/trips', createEmptyState())

      await user.click(screen.getByRole('radio', { name: 'Dark' }))

      expect(screen.getByRole('radio', { name: 'Dark' })).toBeChecked()
      expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
      expect(document.documentElement).toHaveAttribute('data-theme-preference', 'dark')
      expect(window.localStorage.getItem('tourist.theme')).toBe('dark')
    })
  })

  it('renders its children inside the shell without wrapping them in a route', () => {
    renderWithProviders(
      <Routes>
        <Route
          path="/trips/:tripId/*"
          element={
            <AppShell>
              <p>Nested screen</p>
            </AppShell>
          }
        />
      </Routes>,
      { route: `/trips/${TEST_TRIP_ID}/budget`, state: demoStateFor() },
    )

    expect(screen.getByRole('main')).toHaveTextContent('Nested screen')
    expect(screen.getByRole('navigation', { name: 'Trip sections' })).toBeInTheDocument()
  })
})
