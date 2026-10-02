import type { ReactNode } from 'react'

/**
 * A drawn cover for a trip, used when Tourist has no photograph of the place.
 *
 * Trips go wherever the traveller types, and Tourist has photographs of
 * exactly one city. Showing a stock photograph of somewhere else — or a
 * generic "travel" picture — would be the same class of dishonesty as the
 * invented review counts: it implies the product knows the place. So this
 * draws an illustration instead, and never pretends to be a photograph.
 *
 * It is drawn in the landing page's own language: the night sky as the ground
 * (`photo-hero`, inside the `on-photo` scope so the gold is the on-photograph
 * gold), a low gold sun, and three calm ridges that fade from a warm dusk tone
 * to the night itself. Nothing on it is a hex value; the tones are mixes of the
 * `--night` and `--gold` tokens, which do not change with the theme, so the
 * cover is the same in light and dark just as a photograph would be.
 *
 * The seed (the destination) only moves the sun, the stars and the height of
 * the ridges, so the same destination always draws the same cover. That is
 * what makes a trip recognisable in a list.
 */

/** FNV-1a. Small, stable across runs, and good enough to scatter short strings. */
function hash(value: string): number {
  let out = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    out ^= value.charCodeAt(index)
    out = Math.imul(out, 0x01000193)
  }
  return out >>> 0
}

/** Ridge fills, far to near. Each steps closer to the pure night ground. */
const FAR_RIDGE = 'color-mix(in srgb, var(--night) 74%, var(--gold) 26%)'
const MID_RIDGE = 'color-mix(in srgb, var(--night) 86%, var(--gold) 14%)'
const NEAR_RIDGE = 'var(--night)'

export interface TripCoverProps {
  /** Seeds the illustration. The same destination always draws the same cover. */
  destination: string
  /** CSS aspect-ratio, e.g. `16 / 9`. */
  ratio?: string
  rounded?: string
  className?: string
  /** Overlaid content, e.g. a trip name. It sits in the on-photo scope. */
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
  const sunX = 70 + ((seed >>> 3) % 260)
  const sunY = 78 + ((seed >>> 7) % 34)
  const sunR = 20 + ((seed >>> 11) % 14)
  const farLift = ((seed >>> 13) % 30) - 15
  const midLift = ((seed >>> 17) % 24) - 12
  const nearLift = ((seed >>> 21) % 20) - 10

  // A handful of stars in the upper sky, scattered by the same seed.
  const stars = [0, 1, 2, 3, 4].map((index) => {
    const bits = hash(`${seed}:${index}`)
    return {
      x: 12 + (bits % 376),
      y: 10 + ((bits >>> 9) % 52),
      r: bits % 3 === 0 ? 1.6 : 1.1,
      o: 0.35 + ((bits >>> 17) % 4) * 0.1,
    }
  })

  return (
    <div
      className={`on-photo photo-hero relative overflow-hidden ${rounded} ${className}`}
      style={{ aspectRatio: ratio }}
    >
      <svg
        viewBox="0 0 400 225"
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 h-full w-full"
        aria-hidden="true"
        focusable="false"
      >
        {stars.map((star, index) => (
          <circle key={index} cx={star.x} cy={star.y} r={star.r} fill="var(--ink)" opacity={star.o} />
        ))}
        <circle cx={sunX} cy={sunY} r={sunR * 2.1} fill="var(--gold)" opacity="0.14" />
        <circle cx={sunX} cy={sunY} r={sunR * 1.45} fill="var(--gold)" opacity="0.22" />
        <circle cx={sunX} cy={sunY} r={sunR} fill="var(--gold)" />
        <path
          d={`M0 ${140 + farLift} C 80 ${112 + farLift}, 150 ${160 + farLift}, 236 ${132 + farLift} S 340 ${
            108 + farLift
          }, 400 ${128 + farLift} L400 225 L0 225 Z`}
          fill={FAR_RIDGE}
        />
        <path
          d={`M0 ${170 + midLift} C 90 ${142 + midLift}, 150 ${190 + midLift}, 230 ${164 + midLift} S 340 ${
            146 + midLift
          }, 400 ${164 + midLift} L400 225 L0 225 Z`}
          fill={MID_RIDGE}
        />
        <path
          d={`M0 ${196 + nearLift} C 70 ${180 + nearLift}, 140 ${214 + nearLift}, 220 ${198 + nearLift} S 340 ${
            184 + nearLift
          }, 400 ${196 + nearLift} L400 225 L0 225 Z`}
          fill={NEAR_RIDGE}
        />
      </svg>
      {children ? <div className="relative h-full w-full">{children}</div> : null}
    </div>
  )
}
