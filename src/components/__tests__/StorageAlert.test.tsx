import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppShell } from '@/components/AppShell'
import { STORAGE_VERSION, type PersistedState } from '@/services/contracts'
import { BACKUP_KEY, STORAGE_KEY } from '@/services/persistence'
import type { TouristContextValue } from '@/state/touristContext'
import { useTourist } from '@/state/useTourist'
import { TouristProvider } from '@/state/TouristProvider'
import { demoStateFor, TEST_TRIP_ID } from '@/test/renderWithProviders'

const api: { current: TouristContextValue | null } = { current: null }

function Probe() {
  api.current = useTourist()
  return <p>Screen body</p>
}

function ctx(): TouristContextValue {
  if (!api.current) throw new Error('the probe is not mounted')
  return api.current
}

function mountShell() {
  return render(
    <MemoryRouter initialEntries={['/trips']}>
      <TouristProvider>
        <AppShell>
          <Probe />
        </AppShell>
      </TouristProvider>
    </MemoryRouter>,
  )
}

/** The shell around a probe, hydrated from the given state. */
function renderShell(state: PersistedState = demoStateFor()) {
  return renderShellOver(JSON.stringify(state))
}

/** The same, over a raw payload the provider has to make sense of by itself. */
function renderShellOver(raw: string) {
  window.localStorage.setItem(STORAGE_KEY, raw)
  return mountShell()
}

function quotaExceeded(): never {
  throw new DOMException('The quota has been exceeded.', 'QuotaExceededError')
}

/** Storage that takes every write except the backup copy. */
function refuseBackupWrites() {
  const original = Storage.prototype.setItem
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
    this: Storage,
    key: string,
    value: string,
  ) {
    if (key === BACKUP_KEY) quotaExceeded()
    original.call(this, key, value)
  })
}

afterEach(() => {
  api.current = null
})

function addNote(title: string) {
  act(() => {
    ctx().actions.addNote({ tripId: TEST_TRIP_ID, title, body: 'A note' })
  })
}

describe('StorageAlert in the app shell', () => {
  it('shows nothing when the data loaded cleanly and saves are working', () => {
    renderShell()
    addNote('First')

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByText(/not being saved/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Dismiss' })).not.toBeInTheDocument()
  })

  it('warns, above the page, while changes are not being saved, and clears once a save succeeds', () => {
    renderShell()

    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(quotaExceeded)
    addNote('First')

    const alert = screen.getByRole('alert')
    expect(within(alert).getByText('Your changes are not being saved')).toBeInTheDocument()
    expect(alert).toHaveTextContent(/storage is full or blocked/)
    expect(alert).toHaveTextContent(/will be lost when this page closes/)
    // Persistent: there is nothing to dismiss while the problem is still there.
    expect(within(alert).queryByRole('button')).not.toBeInTheDocument()
    // Inside the main landmark and ahead of the screen it warns about.
    const main = screen.getByRole('main')
    expect(main).toContainElement(alert)
    expect(
      alert.compareDocumentPosition(screen.getByText('Screen body')) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()

    setItem.mockRestore()
    addNote('Second')

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByText('Your changes are not being saved')).not.toBeInTheDocument()
  })

  it('says once that some saved records were left out, and stays dismissed', async () => {
    const user = userEvent.setup()
    const damaged = JSON.parse(JSON.stringify(demoStateFor())) as PersistedState
    ;(damaged.expensesByTrip[TEST_TRIP_ID] as unknown[]).push({ id: 'exp_bad', amount: 'lots' })
    renderShell(damaged)

    const notice = screen.getByRole('status')
    expect(within(notice).getByText('Some of your saved data could not be read')).toBeInTheDocument()
    expect(notice).toHaveTextContent(/kept everything else/)
    expect(notice).toHaveTextContent(/A copy of your data as it was is kept in this browser/)
    expect(screen.getAllByText('Some of your saved data could not be read')).toHaveLength(1)

    await user.click(within(notice).getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByText('Some of your saved data could not be read')).not.toBeInTheDocument()

    addNote('After dismissing')
    expect(screen.queryByText('Some of your saved data could not be read')).not.toBeInTheDocument()
  })

  it('does not claim a backup copy that could not be written', () => {
    const damaged = JSON.parse(JSON.stringify(demoStateFor())) as PersistedState
    ;(damaged.expensesByTrip[TEST_TRIP_ID] as unknown[]).push({ id: 'exp_bad', amount: 'lots' })
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(damaged))
    refuseBackupWrites()
    mountShell()

    const notice = screen.getByRole('status')
    expect(notice).toHaveTextContent(/A copy of your data as it was could not be kept/)
    expect(notice).not.toHaveTextContent(/is kept in this browser/)
  })

  it('says that unreadable data was set aside and Tourist started fresh', () => {
    renderShellOver('{ "trips": [ { "id": "trip_half')

    const notice = screen.getByRole('status')
    expect(within(notice).getByText('Your saved data could not be read')).toBeInTheDocument()
    expect(notice).toHaveTextContent(/started fresh/)
    expect(notice).toHaveTextContent(/A copy of what was saved is kept in this browser/)
    expect(within(notice).getByRole('button', { name: 'Dismiss' })).toBeInTheDocument()
  })

  it('says that data from a newer version was set aside and Tourist started fresh', () => {
    renderShellOver(JSON.stringify({ ...demoStateFor(), version: STORAGE_VERSION + 1 }))

    const notice = screen.getByRole('status')
    expect(within(notice).getByText('Your data was saved by a newer version of Tourist')).toBeInTheDocument()
    expect(notice).toHaveTextContent(/started fresh/)
    expect(notice).toHaveTextContent(/kept in this browser as a backup copy/)
  })

  it('says the data was left untouched, and nothing will be saved, when no backup could be made', () => {
    const future = JSON.stringify({ ...demoStateFor(), version: STORAGE_VERSION + 1 })
    window.localStorage.setItem(STORAGE_KEY, future)
    refuseBackupWrites()
    mountShell()

    const alert = screen.getByRole('alert')
    expect(within(alert).getByText('Your data was saved by a newer version of Tourist')).toBeInTheDocument()
    expect(alert).toHaveTextContent(/could not make a backup copy/)
    expect(alert).toHaveTextContent(/left exactly as it was/)
    expect(alert).toHaveTextContent(/Nothing you do in this session will be saved/)
    expect(within(alert).queryByRole('button')).not.toBeInTheDocument()
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe(future)
  })
})
