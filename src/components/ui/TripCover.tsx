import type { ReactNode } from 'react'

/**
 * A generated cover for a trip.
 *
 * Trips go wherever the traveller types, and Tourist has photographs of
 * exactly one city. Showing a stock photograph of somewhere else — or a
 * generic "travel" picture — would be the same class of dishonesty as the
 * invented review counts: it implies the product knows the place. So this
 * draws an illustration instead, seeded from the destination, and never
 * pretends to be a photograph.
 *
 * The same destination always produces the same cover, which is what makes a
 * trip recognisable in a list. Every colour is a palette token, so it follows
 * the theme without a second set of values.
 */

const PALETTES = [
  { sun: 'var(--terracotta)', far: 'var(--navy)', near: 'var(--sage)' },
  { sun: 'var(--sage)', far: 'var(--terracotta)', near: 'var(--navy)' },
  { sun: 'var(--navy)', far: 'var(--sage)', near: 'var(--terracotta)' },
  { sun: 'var(--terracotta)', far: 'var(--sage)', near: 'var(--navy)' },
  { sun: 'var(--sage)', far: 'var(--navy)', near: 'var(--terracotta)' },
] as const

/** FNV-1a. Small, stable across runs, and good enough to scatter short strings. */
function hash(value: string): number {
  let out = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    out ^= value.charCodeAt(index)
    out = Math.imul(out, 0x01000193)
  }
  return out >>> 0
}

export interface TripCoverProps {
  /** Seeds the illustration. The same destination always draws the same cover. */
  destination: string
  /** CSS aspect-ratio, e.g. `16 / 9`. */
  ratio?: string
  rounded?: string
  className?: string
  /** Overlaid content, e.g. a trip name. */
  children?: ReactNode
}

export function TripCover({
  destination,
  ratio = '16 / 9',
  rounded = 'rounded-card',
  className = '',
  children,
}: TripCoverProps) {
  const seed = hash(destination.trim().toLowerCase() || 'somewhere')
  const palette = PALETTES[seed % PALETTES.length]
  const sunX = 60 + ((seed >>> 3) % 280)
  const sunY = 54 + ((seed >>> 7) % 40)
  const sunR = 26 + ((seed >>> 11) % 16)
  const farLift = ((seed >>> 13) % 34) - 17
  const nearLift = ((seed >>> 17) % 30) - 15

  return (
    <div
      className={`relative overflow-hidden bg-surface-low ${rounded} ${className}`}
      style={{ aspectRatio: ratio }}
    >
      <svg
        viewBox="0 0 400 225"
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 h-full w-full"
        aria-hidden="true"
        focusable="false"
      >
        <circle cx={sunX} cy={sunY} r={sunR} fill={palette.sun} opacity="0.5" />
        <path
          d={`M0 ${150 + farLift} C 90 ${112 + farLift}, 150 ${182 + farLift}, 236 ${146 + farLift} S 340 ${
            108 + farLift
          }, 400 ${140 + farLift} L400 225 L0 225 Z`}
          fill={palette.far}
          opacity="0.22"
        />
        <path
          d={`M0 ${182 + nearLift} C 78 ${152 + nearLift}, 138 ${204 + nearLift}, 214 ${180 + nearLift} S 332 ${
            150 + nearLift
          }, 400 ${176 + nearLift} L400 225 L0 225 Z`}
          fill={palette.near}
          opacity="0.34"
        />
      </svg>
      {children ? <div className="relative h-full w-full">{children}</div> : null}
    </div>
  )
}
