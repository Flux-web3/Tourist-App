import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { Brand } from '@/components/Brand'
import { PhotoHero } from '@/components/ui/PhotoHero'
import { destinationPhoto } from '@/data/destinationPhotos'
import { DESTINATIONS } from '@/data/destinations'

const EIFFEL = { src: '/images/eiffel-tower.jpg', alt: 'The Eiffel Tower at sunset' }

function photo(): HTMLImageElement | null {
  return document.querySelector('img')
}

describe('PhotoHero', () => {
  it('sets its content on the photograph, inside the on-photo scope', () => {
    const { container } = render(
      <PhotoHero {...EIFFEL}>
        <h1>Paris in the Spring</h1>
      </PhotoHero>,
    )

    expect(screen.getByRole('img', { name: EIFFEL.alt })).toHaveAttribute('src', EIFFEL.src)
    expect(screen.getByRole('heading', { name: 'Paris in the Spring' })).toBeInTheDocument()
    expect(container.firstElementChild).toHaveClass('on-photo', 'photo-hero')
  })

  it('is a plain night band, with no image at all, when there is no photograph', () => {
    render(
      <PhotoHero src={null} alt="">
        <h1>Tokyo in October</h1>
      </PhotoHero>,
    )

    expect(photo()).toBeNull()
    expect(screen.getByRole('heading', { name: 'Tokyo in October' })).toBeVisible()
  })

  it('keeps the words when the photograph cannot load, and drops the dead image and its credit', () => {
    render(
      <PhotoHero {...EIFFEL} credit="Photo by Someone (CC BY-SA 4.0).">
        <h1>Paris in the Spring</h1>
      </PhotoHero>,
    )

    fireEvent.error(photo() as HTMLImageElement)
    // One failure is retried rather than given up on.
    expect(photo()).not.toBeNull()
    fireEvent.error(photo() as HTMLImageElement)

    expect(photo()).toBeNull()
    expect(screen.getByRole('heading', { name: 'Paris in the Spring' })).toBeVisible()
    // Crediting a photograph that is not on screen would be a false claim.
    expect(screen.queryByText('Photo by Someone (CC BY-SA 4.0).')).toBeNull()
  })

  it('does not carry one photograph’s failure over to the next', () => {
    const { rerender } = render(
      <PhotoHero {...EIFFEL}>
        <p>Trip</p>
      </PhotoHero>,
    )
    fireEvent.error(photo() as HTMLImageElement)
    fireEvent.error(photo() as HTMLImageElement)
    expect(photo()).toBeNull()

    rerender(
      <PhotoHero src="/images/louvre.jpg" alt="The Louvre pyramid">
        <p>Trip</p>
      </PhotoHero>,
    )

    expect(screen.getByRole('img', { name: 'The Louvre pyramid' })).toHaveAttribute(
      'src',
      '/images/louvre.jpg',
    )
  })
})

describe('destinationPhoto', () => {
  it('gives Paris its own credited photograph', () => {
    const paris = destinationPhoto('paris')

    expect(paris).not.toBeNull()
    expect(paris?.src).toBe('/images/eiffel-tower.jpg')
    expect(paris?.alt).toMatch(/Eiffel Tower/)
    expect(paris?.credit?.sourceUrl).toMatch(/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/)
  })

  it('never lends one destination another destination’s photograph', () => {
    const seen = new Map<string, string>()
    for (const destination of DESTINATIONS) {
      const found = destinationPhoto(destination.id)
      if (!found) continue
      expect(seen.has(found.src), `${destination.id} reuses ${found.src}`).toBe(false)
      seen.set(found.src, destination.id)
    }
  })

  it('gives London and Lagos photographs of their own, credited', () => {
    for (const id of ['london', 'lagos']) {
      const found = destinationPhoto(id)
      expect(found?.src, id).toContain(`/images/${id}-`)
      expect(found?.credit?.sourceUrl, id).toMatch(
        /^https:\/\/commons\.wikimedia\.org\/wiki\/File:/,
      )
    }
  })

  it('points every destination photograph at a file that exists', () => {
    for (const destination of DESTINATIONS) {
      const found = destinationPhoto(destination.id)
      if (!found) continue
      expect(existsSync(join(process.cwd(), 'public', found.src)), found.src).toBe(true)
    }
  })

  it('has nothing for a destination without a photograph, or for no destination', () => {
    expect(destinationPhoto('tokyo')).toBeNull()
    expect(destinationPhoto('nowhere')).toBeNull()
    expect(destinationPhoto(null)).toBeNull()
  })
})

describe('Brand', () => {
  it('is one link home, named once, with a decorative mark', () => {
    render(
      <MemoryRouter>
        <Brand />
      </MemoryRouter>,
    )

    const link = screen.getByRole('link', { name: 'Tourist, home' })
    expect(link).toHaveAttribute('href', '/')
    expect(link.querySelector('.brand-mark')).toHaveAttribute('aria-hidden', 'true')
    expect(screen.queryByRole('img')).toBeNull()
  })
})
