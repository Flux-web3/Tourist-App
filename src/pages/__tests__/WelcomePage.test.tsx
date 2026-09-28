import { Route, Routes } from 'react-router-dom'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { EXPERIENCES } from '@/data/experiences'
import type { User } from '@/domain/types'
import { PROTOTYPE_LABEL } from '@/lib/labels'
import type { PersistedState } from '@/services/contracts'
import { STORAGE_KEY, createEmptyState, createGuestUser } from '@/services/persistence'
import WelcomePage from '@/pages/WelcomePage'
import { renderWithProviders } from '@/test/renderWithProviders'

const FEATURED = EXPERIENCES[0]

function readPersisted(): PersistedState {
  const raw = window.localStorage.getItem(STORAGE_KEY)
  return raw === null ? createEmptyState() : (JSON.parse(raw) as PersistedState)
}

function renderWelcome(user?: User) {
  return renderWithProviders(
    <Routes>
      <Route path="/" element={<WelcomePage />} />
      <Route path="/trips" element={<p>Trips list</p>} />
    </Routes>,
    { route: '/', user },
  )
}

describe('WelcomePage', () => {
  it('states the promise up front and offers both ways into the product', () => {
    renderWelcome()

    expect(
      screen.getByRole('heading', { level: 1, name: 'Plan the trip first. Then plan the days inside it.' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Plan a trip' })).toHaveAttribute('href', '/trips/new')
    expect(screen.getByRole('link', { name: 'Open the demo trip' })).toHaveAttribute('href', '/trips')
    expect(screen.getByText(/Nothing here books anything/)).toBeInTheDocument()
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

  it('credits the featured photograph and opens the credit in a new tab', () => {
    renderWelcome()

    expect(screen.getByRole('img', { name: FEATURED.imageAlt })).toBeInTheDocument()
    expect(
      screen.getByText(`${FEATURED.name}, ${FEATURED.neighborhood}.`, { exact: false }),
    ).toBeInTheDocument()

    const credit = screen.getByRole('link', { name: 'Benh LIEU SONG' })
    expect(credit).toHaveAttribute('href', expect.stringContaining('wikimedia.org'))
    expect(credit).toHaveAttribute('target', '_blank')
    expect(credit).toHaveAttribute('rel', 'noreferrer')
  })

  it('explains the three steps and the four product areas', () => {
    renderWelcome()

    expect(screen.getByText('Tell us the trip')).toBeInTheDocument()
    expect(screen.getByText('Get a draft itinerary you can edit')).toBeInTheDocument()
    expect(screen.getByText('Track what you actually spend')).toBeInTheDocument()
    expect(screen.getByText('Every journey you are planning, in one list.')).toBeInTheDocument()
    expect(screen.getByText('A curated Paris catalog with honest, estimated prices.')).toBeInTheDocument()
    expect(screen.getByText('Planned estimates kept separate from what you really spent.')).toBeInTheDocument()
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
})
