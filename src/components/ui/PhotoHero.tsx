import type { ReactNode } from 'react'
import { useImageAttempts } from '@/lib/useImageAttempts'

export interface PhotoHeroProps {
  /** The photograph, or null when Tourist has no honest photo of this place. */
  src: string | null
  /** Describes the photograph. Ignored when there is no photograph to describe. */
  alt: string
  children: ReactNode
  /** Where the photo came from. Sits in a chip pinned to the foot of the hero. */
  credit?: ReactNode
  /**
   * Where the photo sits inside the hero. Defaults to filling it. A screen can
   * anchor it lower so the subject clears the words.
   */
  imageClassName?: string
  /**
   * How the photo is shaded. `reveal` (the default) darkens only where a tall
   * hero puts its words and leaves the subject clear. `cover` shades the whole
   * photo evenly, for a compact hero whose words run from top to bottom.
   */
  shade?: 'reveal' | 'cover'
  /** A sharper file for wide screens, as an `srcset`. Phones keep the smaller `src`. */
  srcSet?: string
  /** Sizing and spacing for the hero itself, e.g. a min-height. */
  className?: string
  loading?: 'lazy' | 'eager'
}

/**
 * Tourist's signature surface: a photograph run edge to edge with the words set
 * straight on top of it, the way the landing page opens.
 *
 * Everything inside sits in the `.on-photo` scope, which re-points the ordinary
 * design tokens at their on-photograph values. Buttons, links, badges and
 * headings therefore need no special variants here: a primary button turns
 * white, a secondary one turns to smoked glass, text turns white.
 *
 * The night-sky ground is painted underneath the photograph, not instead of
 * it, so the words are readable before the photo arrives, if it never does, and
 * when there is no photo at all. A place without a photograph gets the plain
 * night band rather than a picture of somewhere else.
 */
export function PhotoHero({
  src,
  alt,
  children,
  credit,
  srcSet,
  shade = 'reveal',
  imageClassName = 'inset-0 h-full w-full',
  className = '',
  loading = 'eager',
}: PhotoHeroProps) {
  const image = useImageAttempts(src)
  const showPhoto = src !== null && !image.gaveUp

  return (
    <div className={`on-photo photo-hero relative isolate overflow-hidden ${className}`}>
      {showPhoto ? (
        <img
          key={image.key}
          src={src}
          srcSet={srcSet}
          sizes={srcSet ? '100vw' : undefined}
          alt={alt}
          loading={loading}
          decoding="async"
          className={`absolute -z-20 object-cover ${imageClassName}`}
          onError={image.onError}
        />
      ) : null}
      {/* Darkens the photo where the words sit and leaves the subject alone. */}
      <div
        aria-hidden="true"
        className={`absolute inset-0 -z-10 ${shade === 'cover' ? 'photo-hero-shade' : 'photo-hero-scrim'}`}
      />
      {children}
      {/* A credit belongs to a photograph. No photograph on screen, no credit. */}
      {credit && showPhoto ? (
        <p className="photo-credit absolute bottom-3 left-3 right-3 w-fit max-w-[calc(100%-1.5rem)] rounded-control px-3 py-2 text-label-md font-medium sm:bottom-4 sm:left-4">
          {credit}
        </p>
      ) : null}
    </div>
  )
}
