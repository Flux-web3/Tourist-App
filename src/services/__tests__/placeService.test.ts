import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { EXPERIENCES } from '@/data/experiences'
import type { Experience } from '@/domain/types'
import type { CatalogQuery } from '@/services/contracts'
import { placeService } from '@/services/placeService'

function query(overrides: Partial<CatalogQuery> = {}): CatalogQuery {
  return { text: '', category: 'all', maxPrice: null, ...overrides }
}

function idsOf(experiences: readonly Experience[]): string[] {
  return experiences.map((experience) => experience.id)
}

function assertImageMetadata(experiences: readonly Experience[]): void {
  expect(experiences.length).toBeGreaterThan(0)
  for (const experience of experiences) {
    expect(experience.imageUrl.trim().length).toBeGreaterThan(0)
    expect(experience.imageAlt.trim().length).toBeGreaterThan(0)
    const credit = experience.imageCredit
    if (credit === null) {
      throw new Error(`experience ${experience.id} has no imageCredit`)
    }
    expect(credit.author.trim().length).toBeGreaterThan(0)
    expect(credit.license.trim().length).toBeGreaterThan(0)
    expect(credit.sourceUrl.startsWith('http')).toBe(true)
  }
}

describe('placeService.search with no filters', () => {
  it('returns the whole catalogue', async () => {
    const results = await placeService.search(query())

    expect(results).toHaveLength(EXPERIENCES.length)
    expect(new Set(idsOf(results))).toEqual(new Set(idsOf(EXPERIENCES)))
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
    const freeIds = EXPERIENCES.filter((experience) => experience.isFree).map(
      (experience) => experience.id,
    )
    expect(idsOf(results).sort()).toEqual([...freeIds].sort())
  })

  it('treats a null cap as no cap', async () => {
    const results = await placeService.search(query({ maxPrice: null }))

    expect(results).toHaveLength(EXPERIENCES.length)
  })

  it('treats an absent cap as no cap', async () => {
    const results = await placeService.search({ text: '', category: 'all' })

    expect(results).toHaveLength(EXPERIENCES.length)
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
    assertImageMetadata(await placeService.search(query()))
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

  it('serves every image from this origin rather than hot-linking', () => {
    // Catalogue photography used to be hot-linked from upload.wikimedia.org,
    // which made the only imagery in the product depend on a third party at
    // runtime. The files are ours now, under public/images.
    for (const experience of EXPERIENCES) {
      expect(experience.imageUrl).toMatch(/^\/images\/[\w-]+\.(jpg|jpeg|png|webp)$/)
    }
  })

  it('points every record at a file that actually exists', () => {
    // A typo in a path would otherwise only show up as a blank frame in
    // production, since MediaFrame swallows the load error by design.
    // `process.cwd()`, not `import.meta.url`: under jsdom the module url is an
    // http:// one and `fileURLToPath` rejects it.
    const publicDir = join(process.cwd(), 'public')
    for (const experience of EXPERIENCES) {
      expect(existsSync(join(publicDir, experience.imageUrl))).toBe(true)
    }
  })

  it('credits every image with an author, a licence and a source page', () => {
    for (const experience of EXPERIENCES) {
      expect(experience.imageCredit).not.toBeNull()
      expect(experience.imageCredit?.author.trim()).not.toBe('')
      expect(experience.imageCredit?.license.trim()).not.toBe('')
      expect(experience.imageCredit?.sourceUrl).toMatch(/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/)
    }
  })

  it('gives every record its own distinct image', () => {
    const urls = EXPERIENCES.map((experience) => experience.imageUrl)
    expect(new Set(urls).size).toBe(urls.length)
  })
})
