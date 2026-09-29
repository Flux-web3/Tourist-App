import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import LandingPage from '@/pages/LandingPage'
import { STORAGE_KEY, createEmptyState } from '@/services/persistence'
import { renderWithProviders } from '@/test/renderWithProviders'
import type { PersistedState } from '@/services/contracts'

function renderLanding(state?: PersistedState) {
  return renderWithProviders(
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/welcome" element={<p>Welcome entry</p>} />
      <Route path="/trips" element={<p>Trips list</p>} />
      <Route path="/explore" element={<p>Explore catalog</p>} />
    </Routes>,
    { route: '/', state: state ?? createEmptyState() },
  )
}

function readStored(): PersistedState {
  return JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}') as PersistedState
}

function readTripNames(): string[] {
  return (readStored().trips ?? []).map((trip) => trip.name)
}

function makeTrip(id: string, userId: string, name: string): PersistedState['trips'][number] {
  return {
    id,
    userId,
    name,
    origin: 'Lagos, Nigeria',
    destination: 'Paris, France',
    destinationId: 'paris',
    startDate: '2026-04-01',
    endDate: '2026-04-07',
    travelers: 2,
    budget: 2500,
    currency: 'EUR',
    interests: ['culture'],
    pace: 'balanced',
    notes: '',
    status: 'itinerary_ready',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

describe('LandingPage', () => {
  it('leads with the promise and offers the two real ways in', () => {
    renderLanding()

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: /Plan the trip first\. Then plan the days inside it\./,
      }),
    ).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'Plan your trip' })).not.toHaveLength(0)
    expect(screen.getAllByRole('button', { name: 'Try the demo' })).toHaveLength(2)
  })

  it('explains the three steps in plain words', () => {
    renderLanding()

    const steps = screen.getByRole('region', { name: 'How it works' })
    expect(steps).toHaveTextContent('what you enjoy, and your budget limit.')
    expect(steps).toHaveTextContent('Move it, rewrite it, or remove what doesn’t fit.')
    expect(steps).toHaveTextContent('keep the details you need right in your trip notes.')
  })

  it('sends Plan your trip to the entry flow, not straight into a new trip', async () => {
    const user = userEvent.setup()
    renderLanding()

    await user.click(screen.getAllByRole('link', { name: 'Plan your trip' })[0])

    expect(await screen.findByText('Welcome entry')).toBeInTheDocument()
  })

  it('loads the real demo trip before entering the app', async () => {
    const user = userEvent.setup()
    renderLanding()

    expect(readTripNames()).toHaveLength(0)

    await user.click(screen.getAllByRole('button', { name: 'Try the demo' })[0])

    expect(await screen.findByText('Trips list')).toBeInTheDocument()
    expect(readTripNames()).toEqual(['Paris in the Spring'])
  })

  it('adds the demo alongside trips the traveller already had', async () => {
    const user = userEvent.setup()
    const existing = createEmptyState()
    existing.trips = [makeTrip('trip-mine', existing.user.id, 'My Own Trip')]
    renderLanding(existing)

    await user.click(screen.getAllByRole('button', { name: 'Try the demo' })[0])

    await screen.findByText('Trips list')
    expect(readTripNames()).toEqual(['My Own Trip', 'Paris in the Spring'])
  })

  it('tells a returning traveller they already have trips here', () => {
    const state = createEmptyState()
    state.trips = [makeTrip('trip-a', state.user.id, 'Lagos to Paris')]
    renderLanding(state)

    expect(screen.getByRole('main')).toHaveTextContent(/You already have a trip on this device\./)
  })

  it('pluralises the returning-traveller note', () => {
    const state = createEmptyState()
    state.trips = [
      makeTrip('trip-a', state.user.id, 'Lagos to Paris'),
      makeTrip('trip-b', state.user.id, 'Accra to Lisbon'),
    ]
    renderLanding(state)

    expect(screen.getByRole('main')).toHaveTextContent(/You already have 2 trips on this device\./)
  })

  it('says nothing about returning trips to a first-time visitor', () => {
    renderLanding()

    expect(screen.getByRole('main')).not.toHaveTextContent(/You already have/)
  })

  it('quotes the demo trip exactly as the demo data builds it', () => {
    renderLanding()
    const facts = screen.getByRole('region', { name: 'The demo is a real trip' })

    expect(within(facts).getByText('Lagos, Nigeria to Paris, France')).toBeInTheDocument()
    expect(within(facts).getByText('7 days')).toBeInTheDocument()
    expect(within(facts).getByText('2')).toBeInTheDocument()
    expect(within(facts).getByText('Balanced')).toBeInTheDocument()
    expect(within(facts).getByText('€2,500')).toBeInTheDocument()
  })

  it('advertises Trip Notes now that they really exist', () => {
    renderLanding()
    const notesCard = screen.getByRole('heading', { name: 'Trip Notes' }).closest('article')

    expect(notesCard).not.toBeNull()
    expect(notesCard).toHaveTextContent(/Pinned, editable, and never regenerated/)
  })

  it('makes no countdown or live-booking claim it cannot keep', () => {
    renderLanding()
    const page = screen.getByRole('main')

    expect(page).toHaveTextContent(/It does not book anything/)
    expect(page).toHaveTextContent(/not quotes/)
    expect(page).toHaveTextContent(/no account and no server/)
    expect(page).not.toHaveTextContent(/days left|days to go|countdown|book now|reserve now/i)
  })

  it('names every guide city instead of implying Paris is the only one', () => {
    renderLanding()
    const page = screen.getByRole('main')
    const exploreCard = screen.getByRole('heading', { name: 'Explore' }).closest('article')

    expect(exploreCard).toHaveTextContent(/Curated guides for Paris, London and Lagos/)
    expect(page).toHaveTextContent(
      /The Explore catalog is a small, fixed set of places in Paris, London and Lagos, not a live listing/,
    )
    expect(page).not.toHaveTextContent(/curated Paris guide|set of Paris places/i)
  })

  it('keeps the Paris hero photo that matches the demo route, credited', () => {
    renderLanding()

    expect(screen.getByRole('img', { name: /Eiffel Tower/ })).toBeInTheDocument()
    expect(screen.getByText(/Eiffel Tower Summit, 7th arrondissement\./)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Matthias Süßen' })).toHaveAttribute(
      'href',
      expect.stringMatching(/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/),
    )
  })

  it('keeps the prototype and no-account labels visible', () => {
    renderLanding()
    expect(screen.getAllByText('Prototype: saved on this device only')).not.toHaveLength(0)
    expect(screen.getAllByText('No account needed')).not.toHaveLength(0)
  })

  it('exposes the small-screen menu as a real disclosure', async () => {
    const user = userEvent.setup()
    renderLanding()
    const toggle = screen.getByRole('button', { name: 'Menu' })

    // Three lines, not a globe and the word "Menu": the word is for screen readers only.
    expect(toggle.querySelector('[aria-hidden="true"]')).toHaveTextContent('menu')
    expect(within(toggle).getByText('Menu')).toHaveClass('sr-only')

    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(toggle).toHaveAttribute('aria-controls', 'landing-menu')
    expect(document.getElementById('landing-menu')).not.toBeVisible()

    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(document.getElementById('landing-menu')).toBeVisible()

    await user.keyboard('{Escape}')
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(document.getElementById('landing-menu')).not.toBeVisible()
    expect(toggle).toHaveFocus()
  })

  it('moves focus into the open menu and returns it to the first link', async () => {
    const user = userEvent.setup()
    renderLanding()

    await user.click(screen.getByRole('button', { name: 'Menu' }))

    const panel = document.getElementById('landing-menu') as HTMLElement
    expect(within(panel).getByRole('link', { name: 'Start planning' })).toHaveFocus()
  })

  it('closes the menu on Escape without stealing the trip back on', async () => {
    const user = userEvent.setup()
    renderLanding()

    await user.click(screen.getByRole('button', { name: 'Menu' }))
    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('link', { name: 'Start planning' }))

    expect(await screen.findByText('Welcome entry')).toBeInTheDocument()
  })

  it('labels the page once and gives landmarks', () => {
    renderLanding()

    expect(screen.getByRole('banner')).toBeInTheDocument()
    expect(screen.getByRole('main')).toBeInTheDocument()
    expect(screen.getByRole('contentinfo')).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Primary' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Tourist, home' })).toHaveAttribute('href', '/')
  })

  it('has a skip link ahead of everything else', () => {
    renderLanding()

    const skip = screen.getByRole('link', { name: 'Skip to main content' })
    expect(skip).toHaveAttribute('href', '#main-content')
    expect(document.getElementById('main-content')).toBeInTheDocument()
  })
})
