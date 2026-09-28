import type { ReactNode } from 'react'

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
 * Editorial photography with a fixed frame, lazy loading and a gradient
 * fallback so a dead image never collapses the layout.
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
  return (
    <div
      className={`image-fallback relative overflow-hidden ${rounded} ${className}`}
      style={{ aspectRatio: ratio }}
    >
      <img
        src={src}
        alt={alt}
        loading={loading}
        decoding="async"
        className="h-full w-full object-cover"
        onError={(event) => {
          event.currentTarget.style.visibility = 'hidden'
        }}
      />
      {children}
    </div>
  )
}
