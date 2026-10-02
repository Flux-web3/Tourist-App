import { normalise } from '@/data/destinations'
import { EXPERIENCES, EXPERIENCES_BY_ID } from '@/data/experiences'
import type { Experience } from '@/domain/types'
import type { PlaceService } from './contracts'

/**
 * Every word of the query has to appear somewhere in the place's text, in any
 * order, with accents, apostrophes, case and spacing ignored on both sides:
 * `sacre coeur`, `d'orsay` and `tower london` all find their place.
 */
function matchesText(experience: Experience, words: readonly string[]): boolean {
  if (words.length === 0) return true
  const haystack = normalise(
    [
      experience.name,
      experience.summary,
      experience.neighborhood,
      experience.city,
      experience.category,
      ...experience.tags,
    ].join(' '),
  )
  return words.every((word) => haystack.includes(word))
}

function score(experience: Experience, needle: string): number {
  if (!needle) return 0
  const name = normalise(experience.name)
  if (name.startsWith(needle)) return 3
  if (name.includes(needle)) return 2
  if (experience.tags.some((tag) => normalise(tag).includes(needle))) return 1
  return 0
}

/**
 * Resolves immediately; the async signature keeps a real provider droppable in.
 * Whether a destination has any places at all is `destinationHasPlaces` in
 * `data/experiences`, so a page can tell "nothing matches" from "no guide yet".
 */
export const placeService: PlaceService = {
  async search(query) {
    const words = normalise(query.text).split(' ').filter(Boolean)
    const needle = words.join(' ')
    const maxPrice = query.maxPrice
    const destinationId = query.destinationId

    return EXPERIENCES.filter((experience) => {
      // Destination first: a trip's Explore must never see another city's
      // places, whatever the text or filters. Null is the general guide; a
      // caller that leaves the field out entirely gets nothing, not everything.
      if (destinationId !== null && experience.destinationId !== destinationId) return false
      if (query.category !== 'all' && experience.category !== query.category) return false
      if (maxPrice !== null && maxPrice !== undefined && experience.priceFrom > maxPrice) return false
      return matchesText(experience, words)
    }).sort((a, b) => {
      const byScore = score(b, needle) - score(a, needle)
      if (byScore !== 0) return byScore
      if (b.rating !== a.rating) return b.rating - a.rating
      return a.name.localeCompare(b.name)
    })
  },

  async getById(id) {
    return EXPERIENCES_BY_ID.get(id) ?? null
  },
}
