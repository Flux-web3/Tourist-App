import { useState, type ReactNode } from 'react'

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

/** How many times a photo is requested before the frame gives up on it. */
const MAX_IMAGE_ATTEMPTS = 2

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
  const [load, setLoad] = useState({ src, attempts: 0 })
  // A different photo starts from nothing, including one the frame gave up on
  // earlier: coming back to a place is a fresh chance for its photo to load.
  if (load.src !== src) setLoad({ src, attempts: 0 })
  const attempts = load.src === src ? load.attempts : 0
  const gaveUp = attempts >= MAX_IMAGE_ATTEMPTS

  return (
    <div
      className={`image-fallback relative overflow-hidden ${rounded} ${className}`}
      style={{ aspectRatio: ratio }}
    >
      {gaveUp ? (
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
          // A new key remounts the element, which is what makes the browser ask again.
          key={`${src}#${attempts}`}
          src={src}
          alt={alt}
          loading={loading}
          decoding="async"
          className="h-full w-full object-cover"
          onError={() => setLoad({ src, attempts: attempts + 1 })}
        />
      )}
      {children}
    </div>
  )
}
