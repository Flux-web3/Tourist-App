import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ItineraryItemCard } from '@/components/ItineraryItemCard'
import { formatShortDate } from '@/domain/format'
import { PROTOTYPE_LABEL } from '@/lib/labels'
import { renderWithProviders } from '@/test/renderWithProviders'
import type { CurrencyCode, ItineraryDay, ItineraryItem } from '@/domain/types'

type User = ReturnType<typeof userEvent.setup>

const TRIP_ID = 'trip-under-test'
const MENU_LABEL = 'Actions for Louvre highlights'

function makeItem(overrides: Partial<ItineraryItem> = {}): ItineraryItem {
  return {
    id: 'item-louvre',
    tripId: TRIP_ID,
    title: 'Louvre highlights',
    category: 'culture',
    startTime: '09:00',
    endTime: '11:30',
    location: 'Rue de Rivoli, Paris',
    description: 'The quiet wing before the crowds arrive.',
    estimatedCost: 24,
    currency: 'EUR',
    source: 'ai',
    editedByUser: false,
    experienceId: null,
    notes: '',
    createdAt: '2026-03-01T09:00:00.000Z',
    updatedAt: '2026-03-01T09:00:00.000Z',
    ...overrides,
  }
}

function makeDay(id: string, date: string, index: number, items: ItineraryItem[]): ItineraryDay {
  return { id, tripId: TRIP_ID, date, index, title: null, items }
}

const DAY_ONE = makeDay('day-1', '2026-03-10', 0, [makeItem()])
const DAY_TWO = makeDay('day-2', '2026-03-11', 1, [])

function renderCard({
  item = makeItem(),
  day = DAY_ONE,
  days = [DAY_ONE, DAY_TWO],
  ...handlers
}: {
  item?: ItineraryItem
  day?: ItineraryDay
  days?: ItineraryDay[]
} & Partial<{
  currency: CurrencyCode
  pendingItemId: string | null
  moving: boolean
  onToggleMove: () => void
  onEdit: () => void
  onReplace: () => void
  onMove: (dayId: string) => void
  onRemove: () => void
  afterDeparture: boolean
}> = {}) {
  const props = {
    item,
    day,
    days,
    currency: 'EUR' as const,
    pendingItemId: null,
    moving: false,
    onToggleMove: () => undefined,
    onEdit: () => undefined,
    onReplace: () => undefined,
    onMove: () => undefined,
    onRemove: () => undefined,
    ...handlers,
  }
  const result = renderWithProviders(<ItineraryItemCard {...props} />, { route: '/trips' })
  return { ...result, props }
}

/** Every per-stop action now lives one tap away, behind the card's own menu. */
async function openMenu(user: User, label: string = MENU_LABEL): Promise<HTMLElement> {
  await user.click(screen.getByRole('button', { name: label }))
  return screen.getByRole('menu', { name: label })
}

describe('ItineraryItemCard', () => {
  it('presents the stop as a labelled article', () => {
    renderCard()

    expect(screen.getByRole('article', { name: 'Louvre highlights' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Louvre highlights' })).toBeInTheDocument()
  })

  it('shows the start and end time as one range', () => {
    renderCard()

    expect(screen.getByText('9:00 AM – 11:30 AM')).toBeInTheDocument()
  })

  it('drops the time badge when the stored times cannot be parsed', () => {
    renderCard({ item: makeItem({ startTime: 'lunchtime', endTime: '25:99' }) })

    expect(screen.getByRole('article', { name: 'Louvre highlights' })).toBeInTheDocument()
    expect(screen.queryByText(/AM|PM/)).not.toBeInTheDocument()
  })

  it('keeps a valid start time when the end time is missing', () => {
    renderCard({ item: makeItem({ startTime: '09:00', endTime: null }) })

    expect(screen.getByText('9:00 AM')).toBeInTheDocument()
  })

  it('labels the category and the AI draft the stop came from', () => {
    renderCard({ item: makeItem({ category: 'food' }) })

    const article = screen.getByRole('article', { name: 'Louvre highlights' })
    expect(within(article).getByText('Food')).toBeInTheDocument()
    expect(within(article).getByText(PROTOTYPE_LABEL.aiDraft)).toBeInTheDocument()
    expect(within(article).queryByText(PROTOTYPE_LABEL.catalogDemo)).not.toBeInTheDocument()
  })

  it('credits the traveller for a stop they added themselves', () => {
    renderCard({ item: makeItem({ source: 'user' }) })

    const article = screen.getByRole('article', { name: 'Louvre highlights' })
    expect(within(article).getByText('Added by you')).toBeInTheDocument()
    expect(within(article).queryByText(PROTOTYPE_LABEL.aiDraft)).not.toBeInTheDocument()
  })

  it('marks a catalogue stop as a demo and links out to the place', () => {
    renderCard({ item: makeItem({ source: 'catalog', experienceId: 'exp_louvre_museum' }) })

    const article = screen.getByRole('article', { name: 'Louvre highlights' })
    expect(within(article).getByText(PROTOTYPE_LABEL.catalogDemo)).toBeInTheDocument()
    expect(within(article).getByRole('link', { name: 'Open in Explore' })).toHaveAttribute(
      'href',
      '/places/exp_louvre_museum',
    )
  })

  it('does not offer a place link for a stop with no catalogue record', () => {
    renderCard({ item: makeItem({ source: 'catalog', experienceId: null }) })

    expect(screen.queryByRole('link', { name: 'Open in Explore' })).not.toBeInTheDocument()
  })

  it('flags a stop the traveller has edited', () => {
    renderCard({ item: makeItem({ editedByUser: true }) })

    expect(
      within(screen.getByRole('article', { name: 'Louvre highlights' })).getByText('Edited'),
    ).toBeInTheDocument()
  })

  it('shows the location, description and note', () => {
    renderCard({ item: makeItem({ notes: 'Book the timed entry first.' }) })

    const article = screen.getByRole('article', { name: 'Louvre highlights' })
    expect(within(article).getByText('Rue de Rivoli, Paris')).toBeInTheDocument()
    expect(within(article).getByText('The quiet wing before the crowds arrive.')).toBeInTheDocument()
    expect(within(article).getByText(/Book the timed entry first\./)).toBeInTheDocument()
  })

  it('shows the price as a compact marked estimate rather than a captioned figure', () => {
    renderCard()

    const article = screen.getByRole('article', { name: 'Louvre highlights' })
    expect(within(article).getByText('≈ €24')).toBeInTheDocument()
    // The integrity label survives for assistive tech, not as a caption above the number.
    expect(within(article).getByText(`${PROTOTYPE_LABEL.estimatedPrice}:`)).toHaveClass('sr-only')
    expect(within(article).queryByText('€24.00 EUR')).not.toBeInTheDocument()
  })

  it('reads a zero-cost stop as free instead of as a price of nothing', () => {
    renderCard({ item: makeItem({ estimatedCost: 0 }) })

    const article = screen.getByRole('article', { name: 'Louvre highlights' })
    expect(within(article).getByText('Free')).toBeInTheDocument()
    expect(within(article).queryByText(/€0/)).not.toBeInTheDocument()
  })

  it('prices a stop in its own currency, not the trip currency', () => {
    // A catalogue stop keeps the catalogue's euro price inside a naira trip.
    // Formatting it with the trip currency is the bug that turned EUR 22 into
    // NGN 22, so the card must use the item's currency and say it is excluded.
    renderCard({ item: makeItem({ estimatedCost: 22, currency: 'EUR' }), currency: 'NGN' })

    const article = screen.getByRole('article', { name: 'Louvre highlights' })
    expect(within(article).getByText(/€22/)).toBeInTheDocument()
    expect(within(article).queryByText(/₦/)).not.toBeInTheDocument()
    expect(within(article).getByText(/not in the NGN total/)).toBeInTheDocument()
  })

  it('adds no currency note when the stop matches the trip', () => {
    renderCard({ item: makeItem({ estimatedCost: 22, currency: 'EUR' }), currency: 'EUR' })

    const article = screen.getByRole('article', { name: 'Louvre highlights' })
    expect(within(article).queryByText(/not in the/)).not.toBeInTheDocument()
  })

  it('lets a long title and location wrap instead of overflowing a narrow phone', () => {
    renderCard({
      item: makeItem({
        title: 'Musée National des Arts Asiatiques Guimet, afternoon visit',
        location: 'Place d’Iéna, 6 Place d’Iéna, 75116 Paris, Île-de-France, France',
      }),
    })

    expect(
      screen.getByRole('heading', {
        name: 'Musée National des Arts Asiatiques Guimet, afternoon visit',
      }),
    ).toHaveClass('break-words')
    expect(
      screen.getByText('Place d’Iéna, 6 Place d’Iéna, 75116 Paris, Île-de-France, France'),
    ).toHaveClass('break-words')
  })

  it('omits the optional location, description and note when they are empty', () => {
    renderCard({ item: makeItem({ location: '', description: '', notes: '' }) })

    const article = screen.getByRole('article', { name: 'Louvre highlights' })
    expect(within(article).queryByText('Rue de Rivoli, Paris')).not.toBeInTheDocument()
    expect(within(article).queryByText(/^Note:/)).not.toBeInTheDocument()
  })

  describe('the actions menu', () => {
    it('keeps the card to a single control until it is opened', () => {
      renderCard()

      const trigger = screen.getByRole('button', { name: MENU_LABEL })
      expect(trigger).toHaveAttribute('aria-expanded', 'false')
      expect(screen.getAllByRole('button')).toHaveLength(1)
      expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    })

    it('names the trigger after the stop so many cards stay distinguishable', () => {
      renderCard({ item: makeItem({ title: 'Montmartre in the morning' }) })

      expect(
        screen.getByRole('button', { name: 'Actions for Montmartre in the morning' }),
      ).toBeInTheDocument()
    })

    it('offers every action that used to be its own button', async () => {
      const user = userEvent.setup()
      renderCard()

      const menu = await openMenu(user)

      expect(within(menu).getByRole('menuitem', { name: 'Edit' })).toBeInTheDocument()
      expect(within(menu).getByRole('menuitem', { name: 'Replace' })).toBeInTheDocument()
      expect(within(menu).getByRole('menuitem', { name: 'Move to another day' })).toBeInTheDocument()
      expect(within(menu).getByRole('menuitem', { name: 'Remove' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: MENU_LABEL })).toHaveAttribute(
        'aria-expanded',
        'true',
      )
    })

    it('wires edit and remove to their callbacks', async () => {
      const user = userEvent.setup()
      const onEdit = vi.fn()
      const onRemove = vi.fn()
      renderCard({ onEdit, onRemove })

      await user.click(within(await openMenu(user)).getByRole('menuitem', { name: 'Edit' }))
      expect(onEdit).toHaveBeenCalledOnce()

      await user.click(within(await openMenu(user)).getByRole('menuitem', { name: 'Remove' }))
      expect(onRemove).toHaveBeenCalledOnce()
    })

    it('requests a different suggestion when the stop is replaced', async () => {
      const user = userEvent.setup()
      const onReplace = vi.fn()
      renderCard({ onReplace })

      await user.click(within(await openMenu(user)).getByRole('menuitem', { name: 'Replace' }))

      expect(onReplace).toHaveBeenCalledOnce()
    })

    it('opens, moves and selects by keyboard alone', async () => {
      const user = userEvent.setup()
      const onReplace = vi.fn()
      renderCard({ onReplace })

      const trigger = screen.getByRole('button', { name: MENU_LABEL })
      trigger.focus()
      await user.keyboard('{Enter}')

      expect(screen.getByRole('menu', { name: MENU_LABEL })).toBeInTheDocument()
      expect(screen.getByRole('menuitem', { name: 'Edit' })).toHaveFocus()

      await user.keyboard('{ArrowDown}')
      expect(screen.getByRole('menuitem', { name: 'Replace' })).toHaveFocus()

      await user.keyboard('{End}')
      expect(screen.getByRole('menuitem', { name: 'Remove' })).toHaveFocus()

      await user.keyboard('{Home}')
      expect(screen.getByRole('menuitem', { name: 'Edit' })).toHaveFocus()

      await user.keyboard('{ArrowDown}{Enter}')
      expect(onReplace).toHaveBeenCalledOnce()
      expect(trigger).toHaveFocus()
    })

    it('closes on Escape and hands focus back to the trigger', async () => {
      const user = userEvent.setup()
      renderCard()

      await openMenu(user)
      await user.keyboard('{Escape}')

      expect(screen.queryByRole('menu')).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: MENU_LABEL })).toHaveFocus()
    })

    it('shows the swap in progress on the card and blocks a second swap', async () => {
      const user = userEvent.setup()
      const onReplace = vi.fn()
      renderCard({ pendingItemId: 'item-louvre', onReplace })

      const article = screen.getByRole('article', { name: 'Louvre highlights' })
      expect(article).toHaveAttribute('aria-busy', 'true')
      expect(within(article).getByRole('status')).toHaveTextContent('Swapping')

      const swapping = within(await openMenu(user)).getByRole('menuitem', { name: 'Swapping' })
      expect(swapping).toBeDisabled()

      await user.click(swapping)
      expect(onReplace).not.toHaveBeenCalled()
    })

    it('disables replace while another stop is mid-swap', async () => {
      const user = userEvent.setup()
      renderCard({ pendingItemId: 'item-somewhere-else' })

      const article = screen.getByRole('article', { name: 'Louvre highlights' })
      expect(article).not.toHaveAttribute('aria-busy')
      expect(within(article).queryByRole('status')).not.toBeInTheDocument()

      expect(within(await openMenu(user)).getByRole('menuitem', { name: 'Replace' })).toBeDisabled()
    })

    it('asks to move the stop when there is another day to move it to', async () => {
      const user = userEvent.setup()
      const onToggleMove = vi.fn()
      renderCard({ onToggleMove })

      expect(screen.queryByLabelText('Move Louvre highlights to another day')).not.toBeInTheDocument()
      await user.click(
        within(await openMenu(user)).getByRole('menuitem', { name: 'Move to another day' }),
      )

      expect(onToggleMove).toHaveBeenCalledOnce()
    })

    it('hides the move action on a single-day trip', async () => {
      const user = userEvent.setup()
      renderCard({ days: [DAY_ONE] })

      const menu = await openMenu(user)
      expect(within(menu).queryByRole('menuitem', { name: 'Move to another day' })).not.toBeInTheDocument()
      expect(within(menu).getByRole('menuitem', { name: 'Edit' })).toBeInTheDocument()
    })
  })

  describe('the move panel', () => {
    it('lists the other days, takes focus, and moves the stop once a day is chosen', async () => {
      const user = userEvent.setup()
      const onMove = vi.fn()
      renderCard({ days: [DAY_ONE, DAY_TWO], moving: true, onMove })

      const select = screen.getByLabelText('Move Louvre highlights to another day')
      expect(select).toHaveValue('')
      expect(select).toHaveFocus()
      expect(screen.getByRole('option', { name: 'Choose a day' })).toBeInTheDocument()
      expect(
        screen.getByRole('option', { name: `Day 2 · ${formatShortDate('2026-03-11')}` }),
      ).toBeInTheDocument()
      expect(screen.getAllByRole('option')).toHaveLength(2)

      await user.selectOptions(select, 'day-2')

      expect(onMove).toHaveBeenCalledExactlyOnceWith('day-2')
    })

    it('can be dismissed without moving the stop', async () => {
      const user = userEvent.setup()
      const onMove = vi.fn()
      const onToggleMove = vi.fn()
      renderCard({ moving: true, onMove, onToggleMove })

      await user.click(screen.getByRole('button', { name: 'Cancel' }))

      expect(onToggleMove).toHaveBeenCalledOnce()
      expect(onMove).not.toHaveBeenCalled()
    })
  })
})

describe('ItineraryItemCard travel stops', () => {
  const ARRIVAL = makeItem({ id: 'item-arrival', title: 'Arrive and check in', category: 'transit', role: 'arrival' })
  const DEPARTURE = makeItem({ id: 'item-departure', title: 'Head to the airport', category: 'transit', role: 'departure' })

  it.each([
    ['Arrival', ARRIVAL],
    ['Departure', DEPARTURE],
  ])('marks the %s stop as travel and offers no Replace', async (marker, item) => {
    const user = userEvent.setup()
    renderCard({ item, day: makeDay('day-1', '2026-03-10', 0, [item]) })

    const card = screen.getByRole('article', { name: item.title })
    expect(within(card).getByText(marker)).toBeInTheDocument()
    // Tourist has no ticket time: the drafted time must read as a placeholder, at the time itself.
    expect(within(card).getByText('(placeholder)')).toBeInTheDocument()
    expect(
      within(card).getByText(
        `Placeholder time: Tourist does not know your flight or train. Edit this stop to your real ${marker.toLowerCase()} time. It is never swapped for an activity.`,
      ),
    ).toBeInTheDocument()

    const menu = await openMenu(user, `Actions for ${item.title}`)
    expect(within(menu).queryByRole('menuitem', { name: /Replace|Swapping/ })).not.toBeInTheDocument()
    expect(within(menu).getByRole('menuitem', { name: 'Edit' })).toBeInTheDocument()
    expect(within(menu).getByRole('menuitem', { name: 'Move to another day' })).toBeInTheDocument()
    expect(within(menu).getByRole('menuitem', { name: 'Remove' })).toBeInTheDocument()
  })

  it('drops the placeholder wording once the traveller has set the time themselves', () => {
    const edited = { ...DEPARTURE, editedByUser: true, startTime: '18:30', endTime: '20:30' }
    renderCard({ item: edited, day: makeDay('day-1', '2026-03-10', 0, [edited]) })

    const card = screen.getByRole('article', { name: edited.title })
    expect(within(card).queryByText('(placeholder)')).not.toBeInTheDocument()
    expect(within(card).getByText('Travel stop, timed by you. It is never swapped for an activity.')).toBeInTheDocument()
  })

  it('still offers Replace on an ordinary stop and on one from a draft saved before roles', async () => {
    const user = userEvent.setup()
    renderCard()

    expect(screen.queryByText('Arrival')).not.toBeInTheDocument()
    expect(screen.queryByText('Departure')).not.toBeInTheDocument()
    const menu = await openMenu(user)
    expect(within(menu).getByRole('menuitem', { name: 'Replace' })).toBeInTheDocument()
  })

  it('flags a stop that starts after the departure only when told to', () => {
    const { unmount } = renderCard({ afterDeparture: true })
    expect(screen.getByText('After your departure')).toBeInTheDocument()
    unmount()

    renderCard()
    expect(screen.queryByText('After your departure')).not.toBeInTheDocument()
  })
})
