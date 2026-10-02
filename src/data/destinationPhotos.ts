import type { ImageCredit } from '@/domain/types'
import { EXPERIENCES_BY_ID } from './experiences'

export interface DestinationPhoto {
  src: string
  alt: string
  /** Shown beside the credit, e.g. "Eiffel Tower Summit, 7th arrondissement". */
  caption: string
  credit: ImageCredit | null
}

function commons(author: string, license: string, source: string): ImageCredit {
  return { author, license, sourceUrl: `https://commons.wikimedia.org/wiki/${source}` }
}

/**
 * The photograph that stands for each destination. A destination is listed
 * only when Tourist holds a licensed photograph taken there, so a trip to
 * anywhere else gets the plain night band rather than a picture of somewhere
 * it is not. Paris borrows the photograph of its own best-known place.
 */
const HERO: Record<string, DestinationPhoto | { placeId: string }> = {
  paris: { placeId: 'exp_eiffel_tower' },
  london: {
    src: '/images/london-skyline.jpg',
    alt: 'Tower Bridge and the Thames winding east towards the towers of Canary Wharf, seen from above at dusk under a pink sky',
    caption: 'Tower Bridge and the Thames, London',
    credit: commons(
      'Colin',
      'CC BY-SA 4.0',
      'File:Tower_Bridge_from_the_Shard_London_Bridge._Evening_2019-09-22.jpg',
    ),
  },
  lagos: {
    src: '/images/lagos-link-bridge.jpg',
    alt: 'The cable-stayed pylon of the Lekki-Ikoyi Link Bridge in Lagos under a grey sky, with the lagoon and waterside houses to one side',
    caption: 'Lekki-Ikoyi Link Bridge, Lagos',
    credit: commons('Chippla', 'CC BY-SA 3.0', 'File:Lekki_Ikoyi_Link_Bridge.jpg'),
  },
}

/** The destination's hero photograph, or null when Tourist has no honest one. */
export function destinationPhoto(destinationId: string | null | undefined): DestinationPhoto | null {
  if (!destinationId) return null
  const entry = HERO[destinationId]
  if (!entry) return null
  if (!('placeId' in entry)) return entry

  const place = EXPERIENCES_BY_ID.get(entry.placeId)
  if (!place || !place.imageUrl) return null
  return {
    src: place.imageUrl,
    alt: place.imageAlt,
    caption: `${place.name}, ${place.neighborhood}`,
    credit: place.imageCredit,
  }
}
