import type { ReactNode } from 'react'
import { useImageAttempts } from '@/lib/useImageAttempts'

export interface IconProps {
  /** Material Symbols ligature name, e.g. `flight_takeoff`. */
  name: string
  size?: number
  className?: string
  /** Provide a label to expose the icon to assistive tech. */
  label?: string
}

export function Icon({ name, size = 20, className = '', label }: IconProps) {
  return (
    <span
      className={`material-symbols-outlined ${className}`}
      style={{ fontSize: size }}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : 'true'}
    >
      {name}
    </span>
  )
}

export interface MediaFrameProps {
  src: string
  alt: string
  /** CSS aspect-ratio value, e.g. `16 / 9`. */
  ratio?: string
  className?: string
  rounded?: string
  loading?: 'lazy' | 'eager'
  children?: ReactNode
}

/**
 * Editorial photography with a fixed frame and lazy loading. The frame keeps
 * its shape whatever happens to the photo, so a dead image never collapses the
 * layout.
 *
 * A failed load used to set `visibility: hidden` on the <img> node itself, and
 * nothing ever cleared it. One dropped request on a phone hid that photo until
 * a full reload, and because React reuses the node when `src` changes, the
 * next place shown in the same frame inherited the hidden state. The failure
 * now lives in state tied to the `src` it happened to: a new photo starts
 * clean, a failed one is requested once more, and only then is it replaced by
 * a placeholder that says what happened.
 */
export function MediaFrame({
  src,
  alt,
  ratio = '4 / 3',
  className = '',
  rounded = 'rounded-card',
  loading = 'lazy',
  children,
}: MediaFrameProps) {
  const image = useImageAttempts(src)

  return (
    <div
      className={`image-fallback relative overflow-hidden ${rounded} ${className}`}
      style={{ aspectRatio: ratio }}
    >
      {image.gaveUp ? (
        <div
          role="img"
          aria-label={`${alt} (photo unavailable)`}
          className="flex h-full w-full flex-col items-center justify-center gap-1 px-3 text-center text-ink-subtle"
        >
          <Icon name="image_not_supported" size={24} />
          <span className="text-label-md">Photo unavailable</span>
        </div>
      ) : (
        <img
          key={image.key}
          src={src}
          alt={alt}
          loading={loading}
          decoding="async"
          className="h-full w-full object-cover"
          onError={image.onError}
        />
      )}
      {children}
    </div>
  )
}
