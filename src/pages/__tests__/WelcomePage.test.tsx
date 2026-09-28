import { Route, Routes } from 'react-router-dom'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { User } from '@/domain/types'
import { PROTOTYPE_LABEL } from '@/lib/labels'
import type { PersistedState } from '@/services/contracts'
import { STORAGE_KEY, createEmptyState, createGuestUser } from '@/services/persistence'
import WelcomePage from '@/pages/WelcomePage'
import { renderWithProviders } from '@/test/renderWithProviders'

function readPersisted(): PersistedState {
  const raw = window.localStorage.getItem(STORAGE_KEY)
  return raw === null ? createEmptyState() : (JSON.parse(raw) as PersistedState)
}

function renderWelcome(user?: User) {
  return renderWithProviders(
    <Routes>
      <Route path="/welcome" element={<WelcomePage />} />
      <Route path="/trips" element={<p>Trips list</p>} />
      <Route path="/trips/new" element={<p>Create trip form</p>} />
    </Routes>,
    { route: '/welcome', user },
  )
}

describe('WelcomePage', () => {
  it('asks only for a name, and makes clear that is all a profile does', () => {
    renderWelcome()

    expect(
      screen.getByRole('heading', { level: 1, name: 'Let us name the trip, or skip it' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Your name' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Email' })).toBeInTheDocument()
  })

  it('offers a real way in even when the name is skipped', () => {
    renderWelcome()

    expect(screen.getByRole('link', { name: 'Plan a trip' })).toHaveAttribute('href', '/trips/new')
    expect(screen.getByRole('button', { name: 'Try the demo trip' })).toBeEnabled()
  })

  it('labels the prototype honestly and leaves social sign-in disabled', () => {
    renderWelcome()

    expect(screen.getByText(PROTOTYPE_LABEL.noAccount)).toBeInTheDocument()
    expect(screen.getByText(PROTOTYPE_LABEL.localOnly)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Continue with Apple' })).toBeDisabled()
    expect(
      screen.getByText('Not available in this prototype — nothing is sent anywhere.'),
    ).toBeInTheDocument()
  })

  it('loads the demo rather than linking to a trip that may not exist', async () => {
    const user = userEvent.setup()
    renderWelcome()

    expect(readPersisted().trips).toHaveLength(0)

    await user.click(screen.getByRole('button', { name: 'Try the demo trip' }))

    expect(await screen.findByText('Trips list')).toBeInTheDocument()
    await waitFor(() => {
      expect(readPersisted().trips.map((trip) => trip.name)).toEqual(['Paris in the Spring'])
    })
  })

  it('keeps the traveller trips when the demo is loaded from the entry flow', async () => {
    const user = userEvent.setup()
    const state = createEmptyState()
    state.trips = [
      {
        id: 'trip-mine',
        userId: state.user.id,
        name: 'My Own Trip',
        origin: 'Accra, Ghana',
        destination: 'Lisbon, Portugal',
        startDate: '2026-03-01',
        endDate: '2026-03-05',
        travelers: 1,
        budget: 900,
        currency: 'EUR',
        interests: ['food'],
        pace: 'relaxed',
        notes: '',
        status: 'itinerary_ready',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ]
    renderWithProviders(
      <Routes>
        <Route path="/welcome" element={<WelcomePage />} />
        <Route path="/trips" element={<p>Trips list</p>} />
      </Routes>,
      { route: '/welcome', state },
    )

    await user.click(screen.getByRole('button', { name: 'Try the demo trip' }))

    expect(await screen.findByText('Trips list')).toBeInTheDocument()
    await waitFor(() => {
      expect(readPersisted().trips.map((trip) => trip.name)).toEqual([
        'My Own Trip',
        'Paris in the Spring',
      ])
    })
  })

  it('goes straight to the create form from the secondary action', async () => {
    const user = userEvent.setup()
    renderWelcome()

    await user.click(screen.getByRole('link', { name: 'Plan a trip' }))

    expect(await screen.findByText('Create trip form')).toBeInTheDocument()
  })

  it('saves the entered name and email on this device, then continues to the trips list', async () => {
    const user = userEvent.setup()
    renderWelcome()

    await user.type(screen.getByRole('textbox', { name: 'Your name' }), '  Ada  ')
    await user.type(screen.getByRole('textbox', { name: 'Email' }), 'ada@example.com')
    await user.click(screen.getByRole('button', { name: /Save and continue/ }))

    expect(await screen.findByText('Trips list')).toBeInTheDocument()
    await waitFor(() => {
      const persisted = readPersisted()
      expect(persisted.user).toMatchObject({ name: 'Ada', email: 'ada@example.com', isGuest: false })
    })
  })

  it('keeps the existing profile name when the name field is submitted blank', async () => {
    const user = userEvent.setup()
    renderWelcome()

    await user.click(screen.getByRole('button', { name: /Save and continue/ }))

    await waitFor(() => {
      const persisted = readPersisted()
      expect(persisted.user.name).toBe('Adaeze N.')
      expect(persisted.user.email).toBeNull()
      expect(persisted.user.isGuest).toBe(false)
    })
    expect(await screen.findByText('Trips list')).toBeInTheDocument()
  })

  it('confirms the local profile when the device already has a saved name', () => {
    renderWelcome({ ...createGuestUser(), name: 'Ada', isGuest: false, email: 'ada@example.com' })

    expect(screen.getByText(/Saved on this device as/)).toBeInTheDocument()
    expect(screen.getByText('Ada')).toBeInTheDocument()
  })

  it('does not claim a saved profile while the device is still a guest', () => {
    renderWelcome()

    expect(screen.queryByText(/Saved on this device as/)).not.toBeInTheDocument()
  })

  it('explains what happens after the entry step', () => {
    const { container } = renderWelcome()

    expect(screen.getByRole('heading', { name: 'What happens next' })).toBeInTheDocument()
    expect(container).toHaveTextContent(/day-by-day itinerary and prices every stop/)
    expect(container).toHaveTextContent(/draft never looks like a quote/)
  })
})
