import { MediaFrame } from '@/components/ui/Icon'
import { TripCover } from '@/components/ui/TripCover'
import type { Experience } from '@/domain/types'

export interface PlaceImageProps {
  experience: Pick<Experience, 'name' | 'city' | 'imageUrl' | 'imageAlt'>
  /** CSS aspect-ratio, e.g. `4 / 3`. */
  ratio?: string
  rounded?: string
  loading?: 'lazy' | 'eager'
}

/**
 * A place's licensed photo, or the same drawn cover trips use when there is
 * none. Tourist only has photographs of Paris; a London or Lagos place gets an
 * illustration seeded from its name rather than a stock photo of somewhere
 * else. The drawing itself is decorative, so the wrapper carries `imageAlt` as
 * its accessible name, and that text says it is a drawing.
 */
export function PlaceImage({
  experience,
  ratio = '4 / 3',
  rounded = 'rounded-card',
  loading = 'lazy',
}: PlaceImageProps) {
  if (experience.imageUrl) {
    return (
      <MediaFrame
        src={experience.imageUrl}
        alt={experience.imageAlt}
        ratio={ratio}
        rounded={rounded}
        loading={loading}
      />
    )
  }
  return (
    <div role="img" aria-label={experience.imageAlt}>
      <TripCover destination={`${experience.city} ${experience.name}`} ratio={ratio} rounded={rounded} />
    </div>
  )
}
