import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Dialog } from '@/components/ui/Dialog'

function Harness({ onClose }: { onClose: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open trip details
      </button>
      <Dialog
        open={open}
        onClose={() => {
          onClose()
          setOpen(false)
        }}
        title="Trip details"
        description="Everything stays on this device."
        footer={
          <button type="button">
            Save details
          </button>
        }
      >
        <button type="button">Inside the dialog</button>
      </Dialog>
    </>
  )
}

describe('Dialog', () => {
  it('renders nothing while closed', () => {
    render(
      <Dialog open={false} onClose={vi.fn()} title="Trip details">
        <p>Body copy</p>
      </Dialog>,
    )

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByText('Body copy')).not.toBeInTheDocument()
  })

  it('exposes a modal dialog named by its title and described by its description', () => {
    render(
      <Dialog
        open
        onClose={vi.fn()}
        title="Trip details"
        description="Everything stays on this device."
      >
        <p>Body copy</p>
      </Dialog>,
    )

    const dialog = screen.getByRole('dialog', { name: 'Trip details' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAccessibleDescription('Everything stays on this device.')
    expect(screen.getByText('Body copy')).toBeInTheDocument()
  })

  it('moves focus into the dialog when it opens', async () => {
    const user = userEvent.setup()
    render(<Harness onClose={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Open trip details' }))

    const dialog = screen.getByRole('dialog', { name: 'Trip details' })
    expect(dialog).toContainElement(document.activeElement as HTMLElement)
    // The first control in the body, not Close. Close precedes the body in the
    // DOM, so the naive "first focusable" landed every form dialog's opening
    // focus on the one control the traveller did not open the dialog to use.
    expect(document.activeElement).not.toBe(screen.getByRole('button', { name: 'Close dialog' }))
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Inside the dialog' }))
  })

  it('closes on the close button, on Escape and on a backdrop click', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<Harness onClose={onClose} />)

    await user.click(screen.getByRole('button', { name: 'Open trip details' }))
    await user.click(screen.getByRole('button', { name: 'Close dialog' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Open trip details' }))
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(2)

    await user.click(screen.getByRole('button', { name: 'Open trip details' }))
    const dialog = screen.getByRole('dialog', { name: 'Trip details' })
    fireEvent.click(dialog.previousElementSibling as HTMLElement)
    expect(onClose).toHaveBeenCalledTimes(3)
  })

  it('restores focus to the opener and page scrolling after closing', async () => {
    const user = userEvent.setup()
    render(<Harness onClose={vi.fn()} />)

    const trigger = screen.getByRole('button', { name: 'Open trip details' })
    await user.click(trigger)
    expect(document.body.style.overflow).toBe('hidden')

    await user.keyboard('{Escape}')

    expect(document.body.style.overflow).toBe('')
    expect(document.activeElement).toBe(trigger)
  })

  it('keeps Tab focus inside the dialog', async () => {
    const user = userEvent.setup()
    render(<Harness onClose={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Open trip details' }))
    const dialog = screen.getByRole('dialog', { name: 'Trip details' })

    const last = screen.getByRole('button', { name: 'Save details' })
    last.focus()
    expect(document.activeElement).toBe(last)
    await user.tab()
    expect(dialog).toContainElement(document.activeElement as HTMLElement)

    const first = screen.getByRole('button', { name: 'Close dialog' })
    first.focus()
    await user.tab({ shift: true })
    expect(dialog).toContainElement(document.activeElement as HTMLElement)
  })

  it('always calls the newest onClose, even when it changes without reopening', () => {
    const first = vi.fn()
    const second = vi.fn()
    const { rerender } = render(
      <Dialog open onClose={first} title="Trip details">
        <p>Body copy</p>
      </Dialog>,
    )

    rerender(
      <Dialog open onClose={second} title="Trip details">
        <p>Body copy</p>
      </Dialog>,
    )

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(second).toHaveBeenCalledTimes(1)
    expect(first).not.toHaveBeenCalled()
  })
})
