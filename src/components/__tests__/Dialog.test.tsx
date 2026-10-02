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

  it('falls back to the main region when the opener was deleted, not to <body>', async () => {
    function DeleteHarness() {
      const [open, setOpen] = useState(false)
      const [deleted, setDeleted] = useState(false)
      return (
        <main id="main-content" tabIndex={-1}>
          {deleted ? null : (
            <button type="button" onClick={() => setOpen(true)}>
              Delete expense
            </button>
          )}
          <Dialog open={open} onClose={() => setOpen(false)} title="Delete this expense?">
            <button
              type="button"
              onClick={() => {
                setDeleted(true)
                setOpen(false)
              }}
            >
              Confirm delete
            </button>
          </Dialog>
        </main>
      )
    }
    const user = userEvent.setup()
    render(<DeleteHarness />)

    await user.click(screen.getByRole('button', { name: 'Delete expense' }))
    await user.click(screen.getByRole('button', { name: 'Confirm delete' }))

    expect(screen.queryByRole('button', { name: 'Delete expense' })).not.toBeInTheDocument()
    expect(document.activeElement).toBe(screen.getByRole('main'))
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

  it('sends Shift+Tab from the dialog panel itself to the last control inside it', async () => {
    const user = userEvent.setup()
    render(<Harness onClose={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Open trip details' }))
    const dialog = screen.getByRole('dialog', { name: 'Trip details' })

    // Clicking the dialog's text focuses the panel, which is not a tab stop,
    // so Shift+Tab used to walk straight out to the page behind.
    dialog.focus()
    expect(document.activeElement).toBe(dialog)
    await user.tab({ shift: true })
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Save details' }))

    dialog.focus()
    await user.tab()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close dialog' }))
  })

  it('pulls focus back in when Tab is pressed from outside the dialog', async () => {
    const user = userEvent.setup()
    render(<Harness onClose={vi.fn()} />)

    const trigger = screen.getByRole('button', { name: 'Open trip details' })
    await user.click(trigger)

    trigger.focus()
    await user.tab()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close dialog' }))

    trigger.focus()
    await user.tab({ shift: true })
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Save details' }))
  })

  it('makes the page behind inert while open, and gives it back on close', async () => {
    const user = userEvent.setup()
    render(<Harness onClose={vi.fn()} />)

    const trigger = screen.getByRole('button', { name: 'Open trip details' })
    expect(trigger.closest('[inert]')).toBeNull()

    await user.click(trigger)
    const dialog = screen.getByRole('dialog', { name: 'Trip details' })
    expect(trigger.closest('[inert]')).not.toBeNull()
    // The dialog is portalled beside the page, so it stays interactive.
    expect(dialog.closest('[inert]')).toBeNull()

    await user.keyboard('{Escape}')
    expect(document.querySelector('[inert]')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  it('gives the page back when an open dialog is unmounted', () => {
    const { unmount } = render(
      <>
        <p>Page behind</p>
        <Dialog open onClose={vi.fn()} title="Trip details">
          <p>Body copy</p>
        </Dialog>
      </>,
    )
    expect(screen.getByText('Page behind').closest('[inert]')).not.toBeNull()

    unmount()
    expect(document.querySelector('[inert]')).toBeNull()
  })

  it('leaves inert alone on anything that was already inert, and survives a re-render', () => {
    const outsider = document.createElement('div')
    outsider.setAttribute('inert', '')
    document.body.appendChild(outsider)
    try {
      const { rerender, unmount } = render(
        <Dialog open onClose={vi.fn()} title="Trip details">
          <p>Body copy</p>
        </Dialog>,
      )
      rerender(
        <Dialog open onClose={vi.fn()} title="Trip details, renamed">
          <p>Body copy</p>
        </Dialog>,
      )
      expect(screen.getByRole('dialog').closest('[inert]')).toBeNull()

      unmount()
      expect(outsider).toHaveAttribute('inert')
    } finally {
      outsider.remove()
    }
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
