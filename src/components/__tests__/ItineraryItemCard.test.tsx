import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ItineraryItemCard } from '@/components/ItineraryItemCard'
import { formatShortDate } from '@/domain/format'
import { PROTOTYPE_LABEL } from '@/lib/labels'
import { renderWithProviders } from '@/test/renderWithProviders'
import type { ItineraryDay, ItineraryItem } from '@/domain/types'

const TRIP_ID = 'trip-under-test'

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
  pendingItemId: string | null
  moving: boolean
  onToggleMove: () => void
  onEdit: () => void
  onReplace: () => void
  onMove: (dayId: string) => void
  onRemove: () => void
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

  it('shows the location, description, note and estimated price', () => {
    renderCard({ item: makeItem({ notes: 'Book the timed entry first.' }) })

    const article = screen.getByRole('article', { name: 'Louvre highlights' })
    expect(within(article).getByText('Rue de Rivoli, Paris')).toBeInTheDocument()
    expect(within(article).getByText('The quiet wing before the crowds arrive.')).toBeInTheDocument()
    expect(within(article).getByText(/Book the timed entry first\./)).toBeInTheDocument()
    expect(within(article).getByText(PROTOTYPE_LABEL.estimatedPrice)).toBeInTheDocument()
    expect(within(article).getByText('€24.00 EUR')).toBeInTheDocument()
  })

  it('omits the optional location, description and note when they are empty', () => {
    renderCard({ item: makeItem({ location: '', description: '', notes: '' }) })

    const article = screen.getByRole('article', { name: 'Louvre highlights' })
    expect(within(article).queryByText('Rue de Rivoli, Paris')).not.toBeInTheDocument()
    expect(within(article).queryByText(/^Note:/)).not.toBeInTheDocument()
  })

  it('wires the edit and remove actions to their callbacks', async () => {
    const user = userEvent.setup()
    const onEdit = vi.fn()
    const onRemove = vi.fn()
    renderCard({ onEdit, onRemove })

    await user.click(screen.getByRole('button', { name: 'Edit' }))
    await user.click(screen.getByRole('button', { name: 'Remove' }))

    expect(onEdit).toHaveBeenCalledOnce()
    expect(onRemove).toHaveBeenCalledOnce()
  })

  it('requests a different suggestion when the stop is replaced', async () => {
    const user = userEvent.setup()
    const onReplace = vi.fn()
    renderCard({ onReplace })

    await user.click(screen.getByRole('button', { name: 'Replace' }))

    expect(onReplace).toHaveBeenCalledOnce()
  })

  it('shows the swap in progress and blocks the other stops from swapping', async () => {
    const user = userEvent.setup()
    const onReplace = vi.fn()
    const { props } = renderCard({
      item: makeItem(),
      pendingItemId: 'item-louvre',
      onReplace,
    })

    const swapping = screen.getByRole('button', { name: 'Swapping' })
    expect(swapping).toBeDisabled()
    expect(swapping).toHaveAttribute('aria-busy', 'true')
    expect(props.pendingItemId).toBe('item-louvre')

    await user.click(swapping)
    expect(onReplace).not.toHaveBeenCalled()
  })

  it('disables replace while another stop is mid-swap', () => {
    renderCard({ pendingItemId: 'item-somewhere-else' })

    expect(screen.getByRole('button', { name: 'Replace' })).toBeDisabled()
  })

  it('offers the move control when there is another day to move to', async () => {
    const user = userEvent.setup()
    const onToggleMove = vi.fn()
    renderCard({ onToggleMove })

    const move = screen.getByRole('button', { name: 'Move' })
    expect(move).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByLabelText('Move Louvre highlights to another day')).not.toBeInTheDocument()

    await user.click(move)
    expect(onToggleMove).toHaveBeenCalledOnce()
  })

  it('hides the move control on a single-day trip', () => {
    renderCard({ days: [DAY_ONE] })

    expect(screen.queryByRole('button', { name: 'Move' })).not.toBeInTheDocument()
  })

  it('lists the other days and moves the stop once a day is chosen', async () => {
    const user = userEvent.setup()
    const onMove = vi.fn()
    renderCard({ days: [DAY_ONE, DAY_TWO], moving: true, onMove })

    expect(screen.getByRole('button', { name: 'Move' })).toHaveAttribute('aria-expanded', 'true')

    const select = screen.getByLabelText('Move Louvre highlights to another day')
    expect(select).toHaveValue('')
    expect(screen.getByRole('option', { name: 'Choose a day' })).toBeInTheDocument()
    expect(
      screen.getByRole('option', { name: `Day 2 · ${formatShortDate('2026-03-11')}` }),
    ).toBeInTheDocument()
    expect(screen.getAllByRole('option')).toHaveLength(2)

    await user.selectOptions(select, 'day-2')

    expect(onMove).toHaveBeenCalledExactlyOnceWith('day-2')
  })
})
