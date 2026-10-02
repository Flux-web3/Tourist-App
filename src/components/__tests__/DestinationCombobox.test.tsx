import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { DestinationCombobox } from '@/components/ui/DestinationCombobox'
import { Dialog } from '@/components/ui/Dialog'
import { DESTINATIONS, type Destination } from '@/data/destinations'

function Harness({
  initial = null,
  unlistedText,
  error,
  onSelect = () => undefined,
}: {
  initial?: string | null
  unlistedText?: string
  error?: string
  onSelect?: (destination: Destination | null) => void
}) {
  const [value, setValue] = useState<string | null>(initial)
  return (
    <DestinationCombobox
      label="Destination"
      required
      value={value}
      unlistedText={value === null ? unlistedText : undefined}
      error={error}
      onSelect={(destination) => {
        onSelect(destination)
        setValue(destination?.id ?? null)
      }}
    />
  )
}

function combobox(): HTMLElement {
  return screen.getByRole('combobox', { name: /Destination/ })
}

function optionNames(): string[] {
  return screen.queryAllByRole('option').map((option) => option.getAttribute('aria-label') ?? '')
}

describe('DestinationCombobox', () => {
  it('is a labelled, required ARIA combobox that controls a listbox', () => {
    render(<Harness />)

    const input = combobox()
    expect(input).toBeRequired()
    expect(input).toHaveAttribute('aria-autocomplete', 'list')
    expect(input).toHaveAttribute('aria-expanded', 'false')
    expect(input).not.toHaveAttribute('aria-activedescendant')
    const listboxId = input.getAttribute('aria-controls')
    expect(listboxId).toBeTruthy()
    expect(document.getElementById(listboxId ?? '')).toHaveAttribute('role', 'listbox')
    expect(screen.getByText('Destination').closest('label')).toHaveAttribute('for', input.id)
  })

  it('wires an error message to the input', () => {
    render(<Harness error="Choose a destination from the list." />)

    expect(combobox()).toHaveAttribute('aria-invalid', 'true')
    expect(combobox()).toHaveAccessibleDescription('Choose a destination from the list.')
  })

  it('filters by city whatever the case', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.type(combobox(), 'London')
    expect(combobox()).toHaveAttribute('aria-expanded', 'true')
    expect(optionNames()).toEqual(['London, United Kingdom'])

    await user.clear(combobox())
    await user.type(combobox(), 'lon')
    expect(optionNames()).toEqual(['London, United Kingdom'])

    await user.clear(combobox())
    await user.type(combobox(), 'LON')
    expect(optionNames()).toEqual(['London, United Kingdom'])
  })

  it('finds a city by its country or an alias', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.type(combobox(), 'Nigeria')
    expect(optionNames()).toEqual(['Lagos, Nigeria'])

    await user.clear(combobox())
    await user.type(combobox(), 'UK')
    expect(optionNames()).toEqual(['London, United Kingdom'])

    await user.clear(combobox())
    await user.type(combobox(), 'NYC')
    expect(optionNames()).toEqual(['New York, United States'])
  })

  it('shows each option as city and country, with its currency', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.type(combobox(), 'Lagos')
    const option = screen.getByRole('option', { name: 'Lagos, Nigeria' })
    expect(within(option).getByText('Lagos')).toBeInTheDocument()
    expect(within(option).getByText('Nigeria')).toBeInTheDocument()
    expect(within(option).getByText('NGN')).toBeInTheDocument()
  })

  it('says when nothing matches, without offering anything to select', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.type(combobox(), 'xyz')

    expect(screen.queryAllByRole('option')).toHaveLength(0)
    expect(screen.getByText('No destinations match "xyz"')).toBeInTheDocument()
    expect(
      screen.getByText('Tourist covers a fixed set of cities in this prototype. Clear the search to see them all.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('No destinations match "xyz"')
    expect(combobox()).not.toHaveAttribute('aria-activedescendant')

    await user.keyboard('{Enter}')
    expect(combobox()).toHaveValue('xyz')
  })

  it('opens on ArrowDown, moves with the arrows, wraps, and selects with Enter', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(<Harness onSelect={onSelect} />)

    await user.click(combobox())
    await user.keyboard('{Escape}')
    expect(combobox()).toHaveAttribute('aria-expanded', 'false')

    await user.keyboard('{ArrowDown}')
    expect(combobox()).toHaveAttribute('aria-expanded', 'true')
    expect(optionNames()).toHaveLength(DESTINATIONS.length)
    const first = screen.getByRole('option', { name: DESTINATIONS[0].displayName })
    expect(first).toHaveAttribute('aria-selected', 'true')
    expect(combobox()).toHaveAttribute('aria-activedescendant', first.id)

    await user.keyboard('{ArrowUp}')
    const last = screen.getByRole('option', { name: DESTINATIONS[DESTINATIONS.length - 1].displayName })
    expect(combobox()).toHaveAttribute('aria-activedescendant', last.id)

    await user.keyboard('{ArrowDown}{ArrowDown}')
    const london = screen.getByRole('option', { name: 'London, United Kingdom' })
    expect(london).toHaveAttribute('aria-selected', 'true')
    expect(first).toHaveAttribute('aria-selected', 'false')

    await user.keyboard('{Enter}')
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'london' }))
    expect(combobox()).toHaveValue('London, United Kingdom')
    expect(combobox()).toHaveAttribute('aria-expanded', 'false')
    expect(combobox()).toHaveFocus()
  })

  it('highlights the first match while typing, so Enter picks it', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.type(combobox(), 'tok{Enter}')

    expect(combobox()).toHaveValue('Tokyo, Japan')
  })

  it('selects on click, closes the list and keeps focus on the input', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(<Harness onSelect={onSelect} />)

    await user.click(combobox())
    expect(combobox()).toHaveAttribute('aria-expanded', 'true')
    await user.click(screen.getByRole('option', { name: 'Rome, Italy' }))

    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'rome' }))
    expect(combobox()).toHaveValue('Rome, Italy')
    expect(combobox()).toHaveAttribute('aria-expanded', 'false')
    expect(combobox()).toHaveFocus()
  })

  it('reopens on the whole list with the committed choice highlighted', async () => {
    const user = userEvent.setup()
    render(<Harness initial="dubai" />)

    await user.click(combobox())

    expect(optionNames()).toHaveLength(DESTINATIONS.length)
    expect(screen.getByRole('option', { name: 'Dubai, United Arab Emirates' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
  })

  it('closes on Escape and restores the committed text', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(<Harness initial="london" onSelect={onSelect} />)

    await user.clear(combobox())
    await user.type(combobox(), 'tok')
    await user.keyboard('{Escape}')

    expect(combobox()).toHaveAttribute('aria-expanded', 'false')
    expect(combobox()).toHaveValue('London, United Kingdom')
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('reverts half-typed text when focus leaves', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(
      <>
        <Harness initial="london" onSelect={onSelect} />
        <button type="button">Next</button>
      </>,
    )

    await user.clear(combobox())
    await user.type(combobox(), 'Lisb')
    await user.tab()

    expect(combobox()).toHaveValue('London, United Kingdom')
    expect(combobox()).toHaveAttribute('aria-expanded', 'false')
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('takes text that names exactly one listed city when focus leaves', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(<Harness onSelect={onSelect} />)

    await user.type(combobox(), 'tokyo')
    await user.tab()

    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'tokyo' }))
    expect(combobox()).toHaveValue('Tokyo, Japan')
  })

  it('clears the choice when the text is cleared and focus leaves', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(<Harness initial="paris" onSelect={onSelect} />)

    await user.clear(combobox())
    await user.tab()

    expect(onSelect).toHaveBeenCalledWith(null)
    expect(combobox()).toHaveValue('')
  })

  it('shows an unlisted legacy destination as its current value', () => {
    render(<Harness unlistedText="Lisbon" />)

    expect(combobox()).toHaveValue('Lisbon')
  })

  it('keeps Enter from submitting the form while the list is open', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn((event: SubmitEvent) => event.preventDefault())
    render(
      <form onSubmit={(event) => onSubmit(event.nativeEvent as SubmitEvent)}>
        <Harness />
      </form>,
    )

    await user.type(combobox(), 'rom{Enter}')

    expect(combobox()).toHaveValue('Rome, Italy')
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('closes its list on Escape inside a dialog without closing the dialog', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(
      <Dialog open onClose={onClose} title="Edit trip">
        <Harness initial="paris" />
      </Dialog>,
    )

    await user.click(combobox())
    expect(combobox()).toHaveAttribute('aria-expanded', 'true')
    await user.keyboard('{Escape}')

    expect(combobox()).toHaveAttribute('aria-expanded', 'false')
    expect(onClose).not.toHaveBeenCalled()

    // With nothing left to dismiss, Escape belongs to the dialog again.
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

describe('DestinationCombobox support level', () => {
  it('describes every option as a curated guide or general suggestions, never by colour alone', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.click(combobox())

    for (const destination of DESTINATIONS) {
      const option = screen.getByRole('option', { name: destination.displayName })
      const expected = destination.guide === 'curated' ? 'Curated guide' : 'General suggestions'
      expect(option).toHaveAccessibleDescription(expected)
      expect(within(option).getByText(expected)).toBeInTheDocument()
    }
    expect(screen.getByRole('option', { name: 'Paris, France' })).toHaveAccessibleDescription('Curated guide')
    expect(screen.getByRole('option', { name: 'Tokyo, Japan' })).toHaveAccessibleDescription('General suggestions')
  })

  it('never gives two options the same name', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    const displayNames = DESTINATIONS.map((destination) => destination.displayName)
    expect(new Set(displayNames).size).toBe(displayNames.length)

    await user.click(combobox())
    const rendered = optionNames()
    expect(rendered).toHaveLength(DESTINATIONS.length)
    expect(new Set(rendered).size).toBe(rendered.length)
  })

  it.each([
    ['UK', 'london', 'London, United Kingdom'],
    ['NYC', 'new-york', 'New York, United States'],
    ['nigeria', 'lagos', 'Lagos, Nigeria'],
    ['united states', 'new-york', 'New York, United States'],
  ])('commits the full display name when "%s" is chosen', async (query, id, displayName) => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(<Harness onSelect={onSelect} />)

    await user.type(combobox(), `${query}{Enter}`)

    expect(onSelect).toHaveBeenLastCalledWith(expect.objectContaining({ id, displayName }))
    expect(combobox()).toHaveValue(displayName)
    await user.tab()
    expect(combobox()).toHaveValue(displayName)
  })

  it('commits the full display name when an alias match is clicked', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.type(combobox(), 'uk')
    await user.click(screen.getByRole('option', { name: 'London, United Kingdom' }))

    expect(combobox()).toHaveValue('London, United Kingdom')
  })

  it('says under the field that a general destination has no curated guide', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.type(combobox(), 'tokyo{Enter}')

    const hint =
      'Tourist has no curated guide for Tokyo yet: Explore is empty and the draft uses general activity types, not local picks.'
    expect(screen.getByText(hint)).toBeInTheDocument()
    expect(combobox()).toHaveAccessibleDescription(hint)
  })

  it('adds no guide hint for a curated destination', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.type(combobox(), 'london{Enter}')

    expect(screen.queryByText(/no curated guide/)).not.toBeInTheDocument()
    expect(combobox()).not.toHaveAttribute('aria-describedby')
  })

  it('announces no results as a status, not as an option', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.type(combobox(), 'lisbon')

    expect(screen.queryAllByRole('option')).toHaveLength(0)
    expect(screen.getByRole('status')).toHaveTextContent(
      'No destinations match "lisbon". Tourist covers a fixed set of cities in this prototype.',
    )
    // The empty list itself is not rendered: see the next test.
    expect(screen.queryByRole('listbox', { hidden: true })).not.toBeInTheDocument()
  })

  it('shows no empty listbox when nothing matches, and says so truthfully', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.type(combobox(), 'lisbon')

    // A listbox with no options is announced as a list of nothing.
    expect(screen.queryByRole('listbox', { hidden: true })).not.toBeInTheDocument()
    expect(combobox()).toHaveAttribute('aria-expanded', 'false')
    expect(combobox()).not.toHaveAttribute('aria-controls')
    expect(screen.getByText('No destinations match "lisbon"')).toBeVisible()

    // A query that matches again brings the list, and the wiring, back.
    await user.clear(combobox())
    await user.type(combobox(), 'lon')

    expect(combobox()).toHaveAttribute('aria-expanded', 'true')
    const listboxId = combobox().getAttribute('aria-controls')
    expect(document.getElementById(listboxId ?? '')).toBe(screen.getByRole('listbox'))
    expect(optionNames()).toEqual(['London, United Kingdom'])
  })
})
