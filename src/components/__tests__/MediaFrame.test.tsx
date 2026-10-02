import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MediaFrame } from '@/components/ui/Icon'

const LOUVRE = { src: '/images/louvre.jpg', alt: 'The Louvre pyramid at dusk' }
const ORSAY = { src: '/images/musee-dorsay.jpg', alt: 'The main hall of the Musée d’Orsay' }

/** The photo currently mounted, or null once the frame has given up on it. */
function photo(): HTMLImageElement | null {
  return document.querySelector('img')
}

describe('MediaFrame', () => {
  it('shows the photo with its alt text and never hides it by default', () => {
    render(<MediaFrame {...LOUVRE} />)

    const image = screen.getByRole('img', { name: LOUVRE.alt })
    expect(image).toHaveAttribute('src', LOUVRE.src)
    expect(image).toBeVisible()
  })

  it('asks for a photo again after one failed load instead of hiding it', () => {
    render(<MediaFrame {...LOUVRE} />)
    const first = photo()

    fireEvent.error(first as HTMLImageElement)

    // A dropped request on a phone used to hide the photo until a full reload.
    const second = photo()
    expect(second).not.toBeNull()
    expect(second).not.toBe(first)
    expect(second).toHaveAttribute('src', LOUVRE.src)
    expect(second).toBeVisible()
    expect(screen.queryByText('Photo unavailable')).not.toBeInTheDocument()
  })

  it('shows an intentional placeholder, named for the photo, once it really cannot load', () => {
    render(<MediaFrame {...LOUVRE} />)

    fireEvent.error(photo() as HTMLImageElement)
    fireEvent.error(photo() as HTMLImageElement)

    expect(photo()).toBeNull()
    expect(screen.getByText('Photo unavailable')).toBeInTheDocument()
    expect(
      screen.getByRole('img', { name: `${LOUVRE.alt} (photo unavailable)` }),
    ).toBeInTheDocument()
  })

  it('does not carry one photo’s failure over to the next photo in the same frame', () => {
    const { rerender } = render(<MediaFrame {...LOUVRE} />)
    fireEvent.error(photo() as HTMLImageElement)
    fireEvent.error(photo() as HTMLImageElement)
    expect(screen.getByText('Photo unavailable')).toBeInTheDocument()

    // Place A to Place B: React reuses the frame, and the old code left B hidden.
    rerender(<MediaFrame {...ORSAY} />)

    const next = screen.getByRole('img', { name: ORSAY.alt })
    expect(next).toHaveAttribute('src', ORSAY.src)
    expect(next).toBeVisible()
    expect(screen.queryByText('Photo unavailable')).not.toBeInTheDocument()
  })

  it('tries a photo again when the traveller comes back to it', () => {
    const { rerender } = render(<MediaFrame {...LOUVRE} />)
    fireEvent.error(photo() as HTMLImageElement)
    fireEvent.error(photo() as HTMLImageElement)

    rerender(<MediaFrame {...ORSAY} />)
    rerender(<MediaFrame {...LOUVRE} />)

    expect(screen.getByRole('img', { name: LOUVRE.alt })).toBeVisible()
  })

  it('keeps the frame’s shape whether the photo loads or not', () => {
    const { container } = render(<MediaFrame {...LOUVRE} ratio="16 / 9" />)
    const frame = container.firstElementChild as HTMLElement
    expect(frame.style.aspectRatio).toBe('16 / 9')

    fireEvent.error(photo() as HTMLImageElement)
    fireEvent.error(photo() as HTMLImageElement)

    expect((container.firstElementChild as HTMLElement).style.aspectRatio).toBe('16 / 9')
  })
})
