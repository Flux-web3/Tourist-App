import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DESTINATIONS, getDestination } from '@/data/destinations'
import {
  EXPERIENCES,
  GUIDE_CITY_LIST,
  GUIDE_DESTINATIONS,
  destinationHasPlaces,
} from '@/data/experiences'
import type { Experience } from '@/domain/types'
import type { CatalogQuery } from '@/services/contracts'
import { placeService } from '@/services/placeService'

/**
 * Most of these tests are about the Paris records by name, so the default
 * query is scoped to Paris. The whole catalogue is `destinationId: null`.
 */
function query(overrides: Partial<CatalogQuery> = {}): CatalogQuery {
  return { text: '', category: 'all', maxPrice: null, destinationId: 'paris', ...overrides }
}

const PARIS = EXPERIENCES.filter((experience) => experience.destinationId === 'paris')
const PHOTOGRAPHED = EXPERIENCES.filter((experience) => experience.imageUrl !== null)

function idsOf(experiences: readonly Experience[]): string[] {
  return experiences.map((experience) => experience.id)
}

/**
 * A photo always comes with its credit; a record without a photo has no
 * credit and an alt text that says it is a drawing, not a photograph.
 */
function assertImageMetadata(experiences: readonly Experience[]): void {
  expect(experiences.length).toBeGreaterThan(0)
  for (const experience of experiences) {
    expect(experience.imageAlt.trim().length).toBeGreaterThan(0)
    const credit = experience.imageCredit
    if (experience.imageUrl === null) {
      expect(credit).toBeNull()
      expect(experience.imageAlt).toMatch(/drawn cover/i)
      expect(experience.imageAlt).toMatch(/not a photograph/i)
      continue
    }
    expect(experience.imageUrl.trim().length).toBeGreaterThan(0)
    if (credit === null) {
      throw new Error(`experience ${experience.id} has no imageCredit`)
    }
    expect(credit.author.trim().length).toBeGreaterThan(0)
    expect(credit.license.trim().length).toBeGreaterThan(0)
    expect(credit.sourceUrl.startsWith('http')).toBe(true)
  }
}

describe('placeService.search by destination', () => {
  it('returns the whole catalogue, every city, for the general guide (null)', async () => {
    const results = await placeService.search(query({ destinationId: null }))

    expect(results).toHaveLength(EXPERIENCES.length)
    expect(new Set(idsOf(results))).toEqual(new Set(idsOf(EXPERIENCES)))
    expect(new Set(results.map((experience) => experience.destinationId))).toEqual(
      new Set(['paris', 'london', 'lagos']),
    )
  })

  it('returns only Paris places for Paris', async () => {
    const results = await placeService.search(query({ destinationId: 'paris' }))

    expect(results).toHaveLength(14)
    expect(new Set(idsOf(results))).toEqual(new Set(idsOf(PARIS)))
  })

  it('returns only London places for London, and no Paris place', async () => {
    const results = await placeService.search(query({ destinationId: 'london' }))

    expect(results.length).toBeGreaterThanOrEqual(6)
    for (const experience of results) {
      expect(experience.destinationId).toBe('london')
      expect(experience.city).toBe('London')
      expect(experience.currency).toBe('GBP')
    }
    expect(idsOf(results)).not.toContain('exp_eiffel_tower')
    expect(results.map((experience) => experience.name)).toContain('British Museum')
  })

  it('returns only Lagos places for Lagos, priced in naira', async () => {
    const results = await placeService.search(query({ destinationId: 'lagos' }))

    expect(results.length).toBeGreaterThanOrEqual(5)
    for (const experience of results) {
      expect(experience.destinationId).toBe('lagos')
      expect(experience.city).toBe('Lagos')
      expect(experience.currency).toBe('NGN')
    }
  })

  it('returns nothing for a destination with no places, never another city', async () => {
    expect(await placeService.search(query({ destinationId: 'tokyo' }))).toEqual([])
    expect(await placeService.search(query({ destinationId: 'no-such-city' }))).toEqual([])
  })

  it('keeps the destination filter whatever the text says', async () => {
    const results = await placeService.search(query({ destinationId: 'london', text: 'Eiffel' }))

    expect(results).toEqual([])
  })

  it('finds places by city name in the general guide', async () => {
    const results = await placeService.search(query({ destinationId: null, text: 'lagos' }))

    expect(results.length).toBeGreaterThan(0)
    expect(results.every((experience) => experience.city === 'Lagos')).toBe(true)
  })

  it('fails closed when a caller leaves the destination out entirely', async () => {
    // Not reachable from typed code; guards an untyped caller from getting
    // every city's places by omission.
    const loose = { text: '', category: 'all', maxPrice: null } as unknown as CatalogQuery

    expect(await placeService.search(loose)).toEqual([])
  })
})

describe('catalogue destinations', () => {
  it('files every place under a real destination and takes city, country and currency from it', () => {
    for (const experience of EXPERIENCES) {
      const destination = getDestination(experience.destinationId)
      if (!destination) throw new Error(`${experience.id} has an unknown destination`)
      expect(experience.city).toBe(destination.city)
      expect(experience.country).toBe(destination.country)
      expect(experience.currency).toBe(destination.currency)
    }
  })

  it('has places for Paris, London and Lagos only, and says which', () => {
    expect(GUIDE_DESTINATIONS.map((destination) => destination.id)).toEqual(['paris', 'london', 'lagos'])
    expect(GUIDE_CITY_LIST).toBe('Paris, London and Lagos')
    for (const destination of DESTINATIONS) {
      expect(destinationHasPlaces(destination.id)).toBe(
        ['paris', 'london', 'lagos'].includes(destination.id),
      )
    }
    expect(destinationHasPlaces(null)).toBe(false)
    expect(destinationHasPlaces(undefined)).toBe(false)
  })

  it('gives every place a unique id', () => {
    const ids = idsOf(EXPERIENCES)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('labels every opening-hours line as demo hours', () => {
    for (const experience of EXPERIENCES) {
      expect(experience.hoursNote.startsWith('Demo hours:')).toBe(true)
    }
  })

  it('marks a place free exactly when its estimate is zero', () => {
    for (const experience of EXPERIENCES) {
      expect(experience.isFree).toBe(experience.priceFrom === 0)
    }
  })
})

describe('placeService.search with no filters', () => {
  it('returns the whole Paris guide', async () => {
    const results = await placeService.search(query())

    expect(results).toHaveLength(PARIS.length)
    expect(new Set(idsOf(results))).toEqual(new Set(idsOf(PARIS)))
  })

  it('returns every catalogue record exactly once', async () => {
    const results = await placeService.search(query())
    const ids = idsOf(results)

    expect(new Set(ids).size).toBe(ids.length)
  })

  it('does not return the array it searched', async () => {
    const results = await placeService.search(query())
    const mutated = [...results].sort((a, b) => a.name.localeCompare(b.name))

    expect(mutated[0]?.name).not.toBe(results[0]?.name)
  })
})

describe('placeService.search with a text query', () => {
  it('matches on the name', async () => {
    const results = await placeService.search(query({ text: 'Eiffel' }))

    expect(idsOf(results)).toContain('exp_eiffel_tower')
    expect(idsOf(results)).toEqual(['exp_eiffel_tower'])
  })

  it('matches on the neighbourhood', async () => {
    const results = await placeService.search(query({ text: 'Montmartre' }))

    expect(idsOf(results)).toContain('exp_sacre_coeur')
    expect(idsOf(results)).toEqual(['exp_sacre_coeur'])
  })

  it('matches on a tag', async () => {
    const results = await placeService.search(query({ text: 'stained glass' }))

    expect(idsOf(results)).toContain('exp_sainte_chapelle')
    expect(idsOf(results)).toEqual(['exp_sainte_chapelle'])
  })

  it('matches on the summary text', async () => {
    const results = await placeService.search(query({ text: 'charcuterie' }))

    expect(idsOf(results)).toEqual(['exp_food_market_walk'])
  })

  it('returns an empty array when nothing matches', async () => {
    const results = await placeService.search(query({ text: 'zzzznotathing' }))

    expect(results).toEqual([])
  })

  it('ignores surrounding whitespace', async () => {
    const padded = await placeService.search(query({ text: '  Eiffel  ' }))
    const bare = await placeService.search(query({ text: 'Eiffel' }))

    expect(idsOf(padded)).toEqual(idsOf(bare))
  })

  it('is case insensitive', async () => {
    const lower = await placeService.search(query({ text: 'orsay' }))
    const upper = await placeService.search(query({ text: 'ORSAY' }))
    const mixed = await placeService.search(query({ text: 'OrSaY' }))

    expect(idsOf(lower)).toEqual(['exp_musee_dorsay'])
    expect(idsOf(upper)).toEqual(idsOf(lower))
    expect(idsOf(mixed)).toEqual(idsOf(lower))
  })

  it('ranks a name match above a tag match', async () => {
    const results = await placeService.search(query({ text: 'museum' }))

    expect(idsOf(results)).toEqual(['exp_louvre_museum', 'exp_musee_dorsay'])
  })
})

describe('placeService.search with a category filter', () => {
  it('returns only the requested category', async () => {
    const results = await placeService.search(query({ category: 'culture' }))

    expect(results.length).toBeGreaterThan(0)
    for (const experience of results) {
      expect(experience.category).toBe('culture')
    }
    expect(idsOf(results).sort()).toEqual([
      'exp_louvre_museum',
      'exp_musee_dorsay',
      'exp_palais_royal',
    ])
  })

  it('returns nothing for a category with no catalogue entries', async () => {
    const results = await placeService.search(query({ category: 'stay' }))

    expect(results).toEqual([])
  })

  it('combines a category filter with a text query', async () => {
    const results = await placeService.search(query({ text: 'museum', category: 'culture' }))

    expect(idsOf(results).sort()).toEqual(['exp_louvre_museum', 'exp_musee_dorsay'])
  })
})

describe('placeService.search with a price cap', () => {
  it('never returns anything dearer than the cap', async () => {
    const results = await placeService.search(query({ maxPrice: 20 }))

    expect(results.length).toBeGreaterThan(0)
    for (const experience of results) {
      expect(experience.priceFrom).toBeLessThanOrEqual(20)
    }
  })

  it('drops the priced entries above the cap and keeps the affordable ones', async () => {
    const results = await placeService.search(query({ maxPrice: 20 }))
    const ids = idsOf(results)

    expect(ids).toContain('exp_metro_art_ride')
    expect(ids).toContain('exp_seine_cruise')
    expect(ids).not.toContain('exp_eiffel_tower')
    expect(ids).not.toContain('exp_louvre_museum')
    expect(ids).not.toContain('exp_versailles')
    expect(ids).not.toContain('exp_food_market_walk')
  })

  it('keeps every free experience under a zero cap', async () => {
    const results = await placeService.search(query({ maxPrice: 0 }))

    expect(results.length).toBeGreaterThan(0)
    for (const experience of results) {
      expect(experience.priceFrom).toBe(0)
      expect(experience.isFree).toBe(true)
    }
    const freeIds = PARIS.filter((experience) => experience.isFree).map(
      (experience) => experience.id,
    )
    expect(idsOf(results).sort()).toEqual([...freeIds].sort())
  })

  it('treats a null cap as no cap', async () => {
    const results = await placeService.search(query({ maxPrice: null }))

    expect(results).toHaveLength(PARIS.length)
  })

  it('treats an absent cap as no cap', async () => {
    const results = await placeService.search({ text: '', category: 'all', destinationId: 'paris' })

    expect(results).toHaveLength(PARIS.length)
  })

  it('returns nothing under a negative cap', async () => {
    const results = await placeService.search(query({ maxPrice: -1 }))

    expect(results).toEqual([])
  })

  it('combines a cap with a category filter', async () => {
    const results = await placeService.search(query({ category: 'outdoors', maxPrice: 10 }))
    const ids = idsOf(results)

    expect(ids.sort()).toEqual(['exp_canal_saint_martin', 'exp_luxembourg_gardens'])
  })
})

describe('placeService.getById', () => {
  it('returns the catalogue record for a known id', async () => {
    const found = await placeService.getById('exp_louvre_museum')

    expect(found?.id).toBe('exp_louvre_museum')
    expect(found?.name).toBe('Louvre Museum')
    expect(found).toBe(EXPERIENCES.find((experience) => experience.id === 'exp_louvre_museum'))
  })

  it('returns the same record the search returns', async () => {
    const [first] = await placeService.search(query({ text: 'Eiffel' }))
    const found = await placeService.getById(first?.id ?? '')

    expect(found).toBe(first)
  })

  it('returns null for an unknown id', async () => {
    expect(await placeService.getById('exp_does_not_exist')).toBeNull()
  })

  it('returns null for an empty id', async () => {
    expect(await placeService.getById('')).toBeNull()
  })

  it('returns null for a whitespace id', async () => {
    expect(await placeService.getById('   ')).toBeNull()
  })

  it('is case sensitive on the id', async () => {
    expect(await placeService.getById('EXP_LOUVRE_MUSEUM')).toBeNull()
  })

  it('resolves every catalogue id', async () => {
    for (const experience of EXPERIENCES) {
      const found = await placeService.getById(experience.id)
      expect(found?.id).toBe(experience.id)
    }
  })
})

describe('catalogue image metadata', () => {
  it('covers every record returned by an unfiltered search', async () => {
    assertImageMetadata(await placeService.search(query({ destinationId: null })))
  })

  it('covers every record returned by a text search', async () => {
    assertImageMetadata(await placeService.search(query({ text: 'free' })))
  })

  it('covers every record returned by a category search', async () => {
    assertImageMetadata(await placeService.search(query({ category: 'sightseeing' })))
  })

  it('covers every record returned by getById', async () => {
    const records: Experience[] = []
    for (const experience of EXPERIENCES) {
      const found = await placeService.getById(experience.id)
      if (found === null) throw new Error(`expected ${experience.id} to resolve`)
      records.push(found)
    }

    assertImageMetadata(records)
  })

  it('has a photo for every Paris place and none borrowed for London or Lagos', () => {
    // Only Paris has licensed photography. Anything else is a drawn cover,
    // never a photo of another city passed off as this one.
    for (const experience of EXPERIENCES) {
      if (experience.destinationId === 'paris') {
        expect(experience.imageUrl).not.toBeNull()
      } else {
        expect(experience.imageUrl).toBeNull()
        expect(experience.imageCredit).toBeNull()
      }
    }
  })

  it('serves every image from this origin rather than hot-linking', () => {
    // Catalogue photography used to be hot-linked from upload.wikimedia.org,
    // which made the only imagery in the product depend on a third party at
    // runtime. The files are ours now, under public/images.
    for (const experience of PHOTOGRAPHED) {
      expect(experience.imageUrl).toMatch(/^\/images\/[\w-]+\.(jpg|jpeg|png|webp)$/)
    }
  })

  it('points every record at a file that actually exists', () => {
    // A typo in a path would otherwise only show up as a blank frame in
    // production, since MediaFrame swallows the load error by design.
    // `process.cwd()`, not `import.meta.url`: under jsdom the module url is an
    // http:// one and `fileURLToPath` rejects it.
    const publicDir = join(process.cwd(), 'public')
    for (const experience of PHOTOGRAPHED) {
      expect(existsSync(join(publicDir, experience.imageUrl ?? ''))).toBe(true)
    }
  })

  it('credits every image with an author, a licence and a source page', () => {
    for (const experience of PHOTOGRAPHED) {
      expect(experience.imageCredit).not.toBeNull()
      expect(experience.imageCredit?.author.trim()).not.toBe('')
      expect(experience.imageCredit?.license.trim()).not.toBe('')
      expect(experience.imageCredit?.sourceUrl).toMatch(/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/)
    }
  })

  it('gives every record its own distinct image', () => {
    const urls = PHOTOGRAPHED.map((experience) => experience.imageUrl)
    expect(new Set(urls).size).toBe(urls.length)
  })
})
