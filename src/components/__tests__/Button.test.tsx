import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Button } from '@/components/ui/Button'

describe('Button', () => {
  it('renders its children inside a button and defaults to type="button"', () => {
    render(<Button>Start planning</Button>)

    const button = screen.getByRole('button', { name: 'Start planning' })
    expect(button).toBeEnabled()
    expect(button).toHaveAttribute('type', 'button')
  })

  it('calls onClick once when activated', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Draft itinerary</Button>)

    await user.click(screen.getByRole('button', { name: 'Draft itinerary' }))

    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('ignores clicks while disabled', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(
      <Button disabled onClick={onClick}>
        Draft itinerary
      </Button>,
    )

    const button = screen.getByRole('button', { name: 'Draft itinerary' })
    expect(button).toBeDisabled()
    await user.click(button)

    expect(onClick).not.toHaveBeenCalled()
  })

  it('announces busy state, blocks clicks and swaps the label while loading', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(
      <Button loading loadingLabel="Drafting your days" onClick={onClick}>
        Draft itinerary
      </Button>,
    )

    const button = screen.getByRole('button')
    expect(button).toHaveAttribute('aria-busy', 'true')
    expect(button).toBeDisabled()
    expect(button).toHaveTextContent('Drafting your days')
    expect(button).not.toHaveTextContent('Draft itinerary')
    expect(screen.queryByText('Draft itinerary')).not.toBeInTheDocument()

    await user.click(button)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('falls back to a default loading label', () => {
    render(<Button loading>Draft itinerary</Button>)

    expect(screen.getByRole('button')).toHaveTextContent('Working')
  })

  it('honours an explicit submit type and forwards extra props', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn((event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault()
    })
    render(
      <form onSubmit={onSubmit}>
        <Button type="submit" aria-describedby="hint">
          Save trip
        </Button>
      </form>,
    )

    const button = screen.getByRole('button', { name: 'Save trip' })
    expect(button).toHaveAttribute('type', 'submit')
    expect(button).toHaveAttribute('aria-describedby', 'hint')

    await user.click(button)
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })
})
