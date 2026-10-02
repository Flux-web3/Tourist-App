import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '@/App'
import { EXPERIENCES } from '@/data/experiences'
import { LANDING_TITLE } from '@/lib/pageTitle'
import { FIXTURE_TRIP_ID, fixtureState } from '@/pages/__tests__/tripFixture'
import { STORAGE_KEY } from '@/services/persistence'

const TRIP_NAME = 'Paris in the Spring'
const PLACE = EXPERIENCES[0]

/** `App` owns a real `BrowserRouter`, so the starting URL is set on the window. */
function renderAppAt(path: string) {
  window.history.replaceState(null, '', path)
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fixtureState()))
  return render(<App />)
}

function primaryNav(): HTMLElement {
  return screen.getByRole('navigation', { name: 'Primary' })
}

/** A navigation the app did not start itself, as a link elsewhere on the page would make. */
function pushUrl(url: string) {
  act(() => {
    window.history.pushState(null, '', url)
    window.dispatchEvent(new PopStateEvent('popstate'))
  })
}

beforeEach(() => {
  document.title = ''
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined)
})

describe('App page titles', () => {
  it.each([
    ['/', LANDING_TITLE],
    ['/welcome', 'Welcome · Tourist'],
    ['/trips', 'Trips · Tourist'],
    ['/trips/new', 'New trip · Tourist'],
    [`/trips/${FIXTURE_TRIP_ID}`, `${TRIP_NAME} · Tourist`],
    [`/trips/${FIXTURE_TRIP_ID}/itinerary`, `Itinerary · ${TRIP_NAME} · Tourist`],
    [`/trips/${FIXTURE_TRIP_ID}/explore`, `Explore · ${TRIP_NAME} · Tourist`],
    [`/trips/${FIXTURE_TRIP_ID}/budget`, `Budget · ${TRIP_NAME} · Tourist`],
    [`/trips/${FIXTURE_TRIP_ID}/notes`, `Notes · ${TRIP_NAME} · Tourist`],
    ['/explore', 'Explore · Tourist'],
    [`/places/${PLACE.id}`, `${PLACE.name} · Tourist`],
    ['/nowhere', 'Page not found · Tourist'],
    ['/trips/no-such-trip', 'Page not found · Tourist'],
    ['/trips/no-such-trip/budget', 'Page not found · Tourist'],
    ['/places/no-such-place', 'Page not found · Tourist'],
  ])('names %s', async (path, title) => {
    renderAppAt(path)

    await waitFor(() => expect(document.title).toBe(title))
  })

  it('renames the page when the traveller moves to another screen', async () => {
    const user = userEvent.setup()
    renderAppAt('/trips')
    await waitFor(() => expect(document.title).toBe('Trips · Tourist'))

    await user.click(within(primaryNav()).getByRole('link', { name: 'Explore' }))

    await waitFor(() => expect(document.title).toBe('Explore · Tourist'))
  })
})

describe('App focus on navigation', () => {
  it('leaves focus alone on first load', () => {
    renderAppAt('/trips')

    expect(document.body).toHaveFocus()
  })

  it('moves focus to the main region when the page changes', async () => {
    const user = userEvent.setup()
    renderAppAt('/trips')

    await user.click(within(primaryNav()).getByRole('link', { name: 'Explore' }))

    await waitFor(() => expect(screen.getByRole('main')).toHaveFocus())
  })

  it('does not move focus when the new URL points at a part of the page', async () => {
    renderAppAt('/trips')
    const link = within(primaryNav()).getByRole('link', { name: 'Explore' })
    link.focus()

    pushUrl('/explore#top')

    await waitFor(() => expect(document.title).toBe('Explore · Tourist'))
    expect(screen.getByRole('main')).not.toHaveFocus()
  })

  it('does not take focus out of an open dialog', async () => {
    renderAppAt('/trips')
    const dialog = document.createElement('div')
    dialog.setAttribute('role', 'dialog')
    dialog.setAttribute('aria-modal', 'true')
    dialog.tabIndex = -1
    document.body.appendChild(dialog)
    try {
      dialog.focus()
      pushUrl('/explore')

      await waitFor(() => expect(document.title).toBe('Explore · Tourist'))
      expect(dialog).toHaveFocus()
    } finally {
      dialog.remove()
    }
  })
})

describe('App scroll position', () => {
  it('jumps to the top of a new page without animating', async () => {
    const user = userEvent.setup()
    renderAppAt('/trips')
    const scrollTo = vi.mocked(window.scrollTo)
    scrollTo.mockClear()

    await user.click(within(primaryNav()).getByRole('link', { name: 'Explore' }))

    await waitFor(() => expect(document.title).toBe('Explore · Tourist'))
    expect(scrollTo).toHaveBeenCalledExactlyOnceWith({ top: 0, left: 0, behavior: 'instant' })
  })

  it('leaves the position to the browser on first load and on Back', async () => {
    const user = userEvent.setup()
    renderAppAt('/trips')
    const scrollTo = vi.mocked(window.scrollTo)
    expect(scrollTo).not.toHaveBeenCalled()

    await user.click(within(primaryNav()).getByRole('link', { name: 'Explore' }))
    await waitFor(() => expect(document.title).toBe('Explore · Tourist'))
    scrollTo.mockClear()

    act(() => window.history.back())

    await waitFor(() => expect(document.title).toBe('Trips · Tourist'))
    expect(scrollTo).not.toHaveBeenCalled()
  })
})
