import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import {
  SegmentedControl,
  TabPanel,
  Tabs,
  type SegmentedOption,
} from '@/components/ui/SegmentedControl'

type Pace = 'relaxed' | 'balanced' | 'packed'

const PACE_OPTIONS: ReadonlyArray<SegmentedOption<Pace>> = [
  { value: 'relaxed', label: 'Relaxed', icon: 'spa' },
  { value: 'balanced', label: 'Balanced' },
  { value: 'packed', label: 'Packed' },
]

const TAB_OPTIONS = [
  { value: 'sights', label: 'Sights', count: 4 },
  { value: 'food', label: 'Food' },
  { value: 'stays', label: 'Stays' },
]

function PaceControl({ initial = 'balanced' }: { initial?: Pace }) {
  const [value, setValue] = useState<Pace>(initial)
  return <SegmentedControl label="Pace" value={value} onChange={setValue} options={PACE_OPTIONS} />
}

function TabbedSections() {
  const [value, setValue] = useState('sights')
  return (
    <>
      <Tabs label="Trip sections" value={value} onChange={setValue} options={TAB_OPTIONS} />
      <TabPanel value="sights" active={value}>
        Sights panel
      </TabPanel>
      <TabPanel value="food" active={value}>
        Food panel
      </TabPanel>
      <TabPanel value="stays" active={value}>
        Stays panel
      </TabPanel>
    </>
  )
}

describe('SegmentedControl', () => {
  it('exposes its options as one radio group named by the label', () => {
    render(<PaceControl />)

    const group = screen.getByRole('radiogroup', { name: 'Pace' })
    expect(group).toBeInTheDocument()
    expect(screen.getAllByRole('radio')).toHaveLength(3)
  })

  it('checks only the option that matches the current value', () => {
    render(<PaceControl initial="packed" />)

    expect(screen.getByRole('radio', { name: 'Packed' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Relaxed' })).not.toBeChecked()
    expect(screen.getByRole('radio', { name: 'Balanced' })).not.toBeChecked()
  })

  it('keeps the decorative icon out of each option accessible name', () => {
    render(<PaceControl />)

    expect(screen.getByRole('radio', { name: 'Relaxed' })).toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: /spa/i })).not.toBeInTheDocument()
  })

  it('reports the chosen value and moves the checked state to it', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    function Controlled() {
      const [value, setValue] = useState<Pace>('balanced')
      return (
        <SegmentedControl
          label="Pace"
          value={value}
          onChange={(next) => {
            onChange(next)
            setValue(next)
          }}
          options={PACE_OPTIONS}
        />
      )
    }
    render(<Controlled />)

    await user.click(screen.getByRole('radio', { name: 'Relaxed' }))

    expect(onChange).toHaveBeenCalledExactlyOnceWith('relaxed')
    expect(screen.getByRole('radio', { name: 'Relaxed' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Balanced' })).not.toBeChecked()
  })
})

describe('Tabs', () => {
  it('renders a named tablist with one tab per option', () => {
    render(<TabbedSections />)

    expect(screen.getByRole('tablist', { name: 'Trip sections' })).toBeInTheDocument()
    expect(screen.getAllByRole('tab')).toHaveLength(3)
  })

  it('marks the active tab as selected and hides the rest from the tab order', () => {
    render(<TabbedSections />)

    expect(screen.getByRole('tab', { name: 'Sights 4' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Sights 4' })).toHaveAttribute('tabindex', '0')
    expect(screen.getByRole('tab', { name: 'Food' })).toHaveAttribute('aria-selected', 'false')
    expect(screen.getByRole('tab', { name: 'Food' })).toHaveAttribute('tabindex', '-1')
  })

  it('activates the clicked tab and reveals only its panel', async () => {
    const user = userEvent.setup()
    render(<TabbedSections />)

    expect(screen.getByRole('tabpanel')).toHaveTextContent('Sights panel')

    await user.click(screen.getByRole('tab', { name: 'Food' }))

    expect(screen.getByRole('tab', { name: 'Food' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getAllByRole('tabpanel')).toHaveLength(1)
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Food panel')
  })

  it('moves selection and focus with the arrow keys', async () => {
    const user = userEvent.setup()
    render(<TabbedSections />)

    await user.click(screen.getByRole('tab', { name: 'Sights 4' }))
    await user.keyboard('{ArrowRight}')

    expect(screen.getByRole('tab', { name: 'Food' })).toHaveAttribute('aria-selected', 'true')
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Food' }))

    await user.keyboard('{ArrowRight}')

    expect(screen.getByRole('tab', { name: 'Stays' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Stays panel')
  })

  it('wraps backwards and jumps to the first and last tab', async () => {
    const user = userEvent.setup()
    render(<TabbedSections />)

    await user.click(screen.getByRole('tab', { name: 'Sights 4' }))
    await user.keyboard('{ArrowLeft}')

    expect(screen.getByRole('tab', { name: 'Stays' })).toHaveAttribute('aria-selected', 'true')

    await user.keyboard('{Home}')

    expect(screen.getByRole('tab', { name: 'Sights 4' })).toHaveAttribute('aria-selected', 'true')

    await user.keyboard('{End}')

    expect(screen.getByRole('tab', { name: 'Stays' })).toHaveAttribute('aria-selected', 'true')
  })

  it('ignores keys that are not part of the tab pattern', async () => {
    const user = userEvent.setup()
    render(<TabbedSections />)

    await user.click(screen.getByRole('tab', { name: 'Sights 4' }))
    await user.keyboard('a')

    expect(screen.getByRole('tab', { name: 'Sights 4' })).toHaveAttribute('aria-selected', 'true')
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Sights 4' }))
  })
})
