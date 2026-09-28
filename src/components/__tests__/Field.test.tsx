import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import {
  CheckboxChipGroup,
  NumberField,
  RadioChipGroup,
  SelectField,
  TextAreaField,
  TextField,
} from '@/components/ui/Field'

describe('TextField', () => {
  it('associates the label with the input and types into it', async () => {
    const user = userEvent.setup()
    render(<TextField label="Destination city" defaultValue="Paris" />)

    const input = screen.getByRole('textbox', { name: 'Destination city' })
    expect(input).toHaveValue('Paris')

    await user.clear(input)
    await user.type(input, 'Lisbon')
    expect(input).toHaveValue('Lisbon')
  })

  it('links hint text and flags invalid state with an error message', () => {
    render(
      <TextField
        label="Trip name"
        hint="You can rename this later"
        error="Give the trip a name"
        defaultValue="  "
      />,
    )

    const input = screen.getByRole('textbox', { name: 'Trip name' })
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAccessibleDescription('You can rename this later Give the trip a name')
    expect(screen.getByText('Give the trip a name')).toBeInTheDocument()
  })

  it('exposes required fields with a text marker for assistive tech', () => {
    render(<TextField label="Origin" required />)

    const input = screen.getByRole('textbox', { name: /Origin/ })
    expect(input).toBeRequired()
    expect(input).toHaveAttribute('required')
    expect(input).toHaveAccessibleName(/required/)
    expect(screen.getByText('*')).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getByText(', required')).toBeInTheDocument()
  })
})

describe('TextAreaField', () => {
  it('labels a multiline control and accepts typing', async () => {
    const user = userEvent.setup()
    render(<TextAreaField label="Trip notes" placeholder="Anything we should remember" />)

    const textarea = screen.getByRole('textbox', { name: 'Trip notes' })
    await user.type(textarea, 'Window seat')

    expect(textarea).toHaveValue('Window seat')
  })
})

describe('SelectField', () => {
  it('renders a placeholder plus options and reports the chosen value', async () => {
    const user = userEvent.setup()
    const chosen: string[] = []
    render(
      <SelectField
        label="Trip currency"
        placeholder="Choose a currency"
        value=""
        onChange={(event) => chosen.push(event.target.value)}
        options={[
          { value: 'EUR', label: 'EUR - Euro' },
          { value: 'USD', label: 'USD - US dollar' },
        ]}
      />,
    )

    const select = screen.getByRole('combobox', { name: 'Trip currency' })
    expect(select).toHaveValue('')
    expect(screen.getByRole('option', { name: 'Choose a currency' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'EUR - Euro' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'USD - US dollar' })).toBeInTheDocument()

    await user.selectOptions(select, 'USD')

    expect(chosen).toEqual(['USD'])
  })
})

describe('NumberField', () => {
  it('shows the prefix and suffix next to a numeric value', () => {
    render(
      <NumberField label="Total budget" value={2500} onValueChange={vi.fn()} prefix="€" suffix="EUR" />,
    )

    const input = screen.getByRole('spinbutton', { name: 'Total budget' })
    expect(input).toHaveValue(2500)
    expect(input).toHaveAttribute('inputmode', 'decimal')
    expect(screen.getByText('€')).toBeInTheDocument()
    expect(screen.getByText('EUR')).toBeInTheDocument()
  })

  it('reports numbers and falls back to zero when cleared', async () => {
    const user = userEvent.setup()

    function ControlledNumber() {
      const [value, setValue] = useState(2)
      return <NumberField label="Travellers" value={value} onValueChange={setValue} />
    }
    render(<ControlledNumber />)

    const input = screen.getByRole('spinbutton', { name: 'Travellers' })
    await user.clear(input)
    expect(input).toHaveValue(0)

    await user.type(input, '4')
    expect(input).toHaveValue(4)
  })

  it('reports the parsed number without waiting for a re-render', async () => {
    const user = userEvent.setup()
    const onValueChange = vi.fn()
    render(<NumberField label="Travellers" value={2} onValueChange={onValueChange} />)

    const input = screen.getByRole('spinbutton', { name: 'Travellers' })
    await user.clear(input)
    expect(onValueChange).toHaveBeenLastCalledWith(0)
  })
})

describe('RadioChipGroup', () => {
  const options = [
    { value: 'relaxed' as const, label: 'Relaxed', hint: 'One or two stops a day' },
    { value: 'balanced' as const, label: 'Balanced' },
    { value: 'packed' as const, label: 'Packed' },
  ]

  it('is a named group of radios with the current option checked', () => {
    render(
      <RadioChipGroup legend="Pace" name="pace" value="balanced" onChange={vi.fn()} options={options} />,
    )

    expect(screen.getByRole('group', { name: 'Pace' })).toBeInTheDocument()
    expect(screen.getAllByRole('radio')).toHaveLength(3)
    expect(screen.getByRole('radio', { name: /Balanced/ })).toBeChecked()
    expect(screen.getByRole('radio', { name: /Relaxed/ })).not.toBeChecked()
    expect(screen.getByRole('radio', { name: /Packed/ })).not.toBeChecked()
    expect(screen.getByText('One or two stops a day')).toBeInTheDocument()
  })

  it('reports the newly chosen value', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <RadioChipGroup legend="Pace" name="pace" value="balanced" onChange={onChange} options={options} />,
    )

    await user.click(screen.getByRole('radio', { name: /Packed/ }))

    expect(onChange).toHaveBeenCalledWith('packed')
  })

  it('marks the group invalid and describes it with the error', () => {
    render(
      <RadioChipGroup
        legend="Pace"
        name="pace"
        value="balanced"
        onChange={vi.fn()}
        options={options}
        error="Pick a pace"
      />,
    )

    const group = screen.getByRole('group', { name: 'Pace' })
    expect(group).toHaveAttribute('aria-invalid', 'true')
    expect(group).toHaveAccessibleDescription('Pick a pace')
    expect(screen.getByText('Pick a pace')).toBeInTheDocument()
  })
})

describe('CheckboxChipGroup', () => {
  const options = [
    { value: 'culture' as const, label: 'Culture' },
    { value: 'food' as const, label: 'Food' },
    { value: 'relaxed' as const, label: 'Slow mornings' },
  ]

  it('checks the selected values', () => {
    render(
      <CheckboxChipGroup
        legend="Interests"
        name="interests"
        values={['culture', 'relaxed']}
        onChange={vi.fn()}
        options={options}
      />,
    )

    expect(screen.getByRole('group', { name: 'Interests' })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Culture' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Food' })).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Slow mornings' })).toBeChecked()
  })

  it('adds an unchecked value and keeps it once chosen', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const { rerender } = render(
      <CheckboxChipGroup
        legend="Interests"
        name="interests"
        values={['culture']}
        onChange={onChange}
        options={options}
      />,
    )

    await user.click(screen.getByRole('checkbox', { name: 'Food' }))
    expect(onChange).toHaveBeenCalledWith(['culture', 'food'])

    rerender(
      <CheckboxChipGroup
        legend="Interests"
        name="interests"
        values={['culture', 'food']}
        onChange={onChange}
        options={options}
      />,
    )
    expect(screen.getByRole('checkbox', { name: 'Food' })).toBeChecked()
  })

  it('removes a value that is already selected', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <CheckboxChipGroup
        legend="Interests"
        name="interests"
        values={['culture', 'food']}
        onChange={onChange}
        options={options}
      />,
    )

    await user.click(screen.getByRole('checkbox', { name: 'Culture' }))

    expect(onChange).toHaveBeenCalledWith(['food'])
  })
})
