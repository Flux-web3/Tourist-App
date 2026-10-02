import type { CurrencyCode } from '@/domain/types'

/**
 * The destinations a trip can be planned for.
 *
 * This is the one place a destination's identity lives. A trip stores the
 * `id` (`Trip.destinationId`) plus the `displayName` it showed when chosen
 * (`Trip.destination`), and everything downstream (Explore, place details,
 * itinerary drafting, draft prices) keys off the id, never off the text.
 * Destination used to be free text, and "is this Paris?" was answered by
 * searching that text, so a London trip got the Paris guide.
 *
 * Deliberately small: enough to prove nothing is Paris-shaped, not a gazetteer.
 * Adding a city is one entry here; giving it Explore places is entries in
 * `experiences.ts` with its `destinationId`.
 */
export interface Destination {
  /** Stable slug. Stored on trips and places; never rename one. */
  id: string
  city: string
  country: string
  /** What the traveller sees and what `Trip.destination` holds. */
  displayName: string
  /** The local currency: the default for a new trip and for draft prices. */
  currency: CurrencyCode
  /**
   * Local price level for itinerary draft estimates, as a multiplier on the
   * draft template bank's reference prices (set at Paris euro levels), and the
   * step those estimates are rounded to. Draft prices are illustrative
   * estimates in the destination's own currency, labelled as such; this is
   * not an exchange rate and no user figure is ever converted with it.
   */
  priceLevel: number
  priceStep: number
  /** Extra words a search should match: "UK", "NYC", "Big Apple". */
  aliases: readonly string[]
  /**
   * How much Tourist actually knows about the place, said out loud wherever
   * it matters so a thin destination never passes for a covered one.
   * - `curated`: hand-written Explore places and a local itinerary bank.
   * - `general`: no Explore places; drafts use general activity types named
   *   for the city, not local recommendations.
   */
  guide: 'curated' | 'general'
}

export const DESTINATIONS: readonly Destination[] = [
  {
    id: 'paris',
    city: 'Paris',
    country: 'France',
    displayName: 'Paris, France',
    currency: 'EUR',
    priceLevel: 1,
    priceStep: 1,
    aliases: [],
    guide: 'curated',
  },
  {
    id: 'london',
    city: 'London',
    country: 'United Kingdom',
    displayName: 'London, United Kingdom',
    currency: 'GBP',
    priceLevel: 0.9,
    priceStep: 1,
    aliases: ['UK', 'England', 'Britain', 'Great Britain'],
    guide: 'curated',
  },
  {
    id: 'lagos',
    city: 'Lagos',
    country: 'Nigeria',
    displayName: 'Lagos, Nigeria',
    currency: 'NGN',
    priceLevel: 900,
    priceStep: 500,
    aliases: [],
    guide: 'curated',
  },
  {
    id: 'new-york',
    city: 'New York',
    country: 'United States',
    displayName: 'New York, United States',
    currency: 'USD',
    priceLevel: 1.2,
    priceStep: 1,
    aliases: ['NYC', 'USA', 'US', 'America', 'Manhattan', 'Big Apple'],
    guide: 'general',
  },
  {
    id: 'tokyo',
    city: 'Tokyo',
    country: 'Japan',
    displayName: 'Tokyo, Japan',
    currency: 'JPY',
    priceLevel: 150,
    priceStep: 100,
    aliases: [],
    guide: 'general',
  },
  {
    id: 'dubai',
    city: 'Dubai',
    country: 'United Arab Emirates',
    displayName: 'Dubai, United Arab Emirates',
    currency: 'AED',
    priceLevel: 4.5,
    priceStep: 5,
    aliases: ['UAE', 'Emirates'],
    guide: 'general',
  },
  {
    id: 'rome',
    city: 'Rome',
    country: 'Italy',
    displayName: 'Rome, Italy',
    currency: 'EUR',
    priceLevel: 0.95,
    priceStep: 1,
    aliases: ['Roma'],
    guide: 'general',
  },
  {
    id: 'barcelona',
    city: 'Barcelona',
    country: 'Spain',
    displayName: 'Barcelona, Spain',
    currency: 'EUR',
    priceLevel: 0.9,
    priceStep: 1,
    aliases: [],
    guide: 'general',
  },
]

export const DESTINATIONS_BY_ID: ReadonlyMap<string, Destination> = new Map(
  DESTINATIONS.map((destination) => [destination.id, destination]),
)

export function getDestination(id: string | null | undefined): Destination | null {
  if (!id) return null
  return DESTINATIONS_BY_ID.get(id) ?? null
}

/**
 * Text folded for matching: accents and ligatures flattened (`Cœur` is `coeur`),
 * apostrophes dropped (`d’Orsay`, `d'Orsay` and `dOrsay` agree), lower case,
 * every other run of punctuation or whitespace one space. Shared by the
 * destination selector and Explore's text search so the two cannot disagree
 * about what counts as the same word.
 */
export function normalise(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .replace(/['‘’`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Words that dress a destination name without being part of it: "New York City", "the UK". */
const FILLER_WORDS: ReadonlySet<string> = new Set(['of', 'the', 'city'])

/**
 * Destinations where every word of `query` starts a word of the city, country
 * or an alias, case- and accent-insensitive; cities that start with the query
 * first. Word starts, not substrings: "lon" is London, not Barce-lon-a. The
 * filler words "of", "the" and "city" are ignored when other words are present,
 * so "new york city", "the uk" and "united states of america" find their
 * destination. An empty query returns the whole list in catalogue order.
 */
export function searchDestinations(query: string): Destination[] {
  const typed = normalise(query).split(' ').filter(Boolean)
  if (typed.length === 0) return [...DESTINATIONS]
  const significant = typed.filter((word) => !FILLER_WORDS.has(word))
  const words = significant.length > 0 ? significant : typed
  const needle = words.join(' ')
  return DESTINATIONS.filter((destination) => {
    const haystack = normalise(
      [destination.city, destination.country, ...destination.aliases].join(' '),
    ).split(' ')
    return words.every((word) => haystack.some((part) => part.startsWith(word)))
  }).sort((a, b) => {
    const rank = (d: Destination) => (normalise(d.city).startsWith(needle) ? 0 : 1)
    return rank(a) - rank(b)
  })
}

/**
 * The catalogue destination a free-text destination names, or null. Used only
 * to bring trips saved before the catalogue existed onto it: "Paris, France",
 * "Paris France", "paris", "New York City" and "London, UK" resolve; "Lisbon",
 * "Paris, Texas" and "London, Ukraine" do not, and stay unmatched rather than
 * being guessed into the wrong city.
 *
 * The qualifier (whatever follows the city) has to contain the destination's
 * country or one of its aliases as whole words. Without a comma, what follows
 * the city must be exactly a country or alias: "Paris France", "London UK".
 */
export function matchDestination(text: string): Destination | null {
  const [cityPart, ...rest] = text.split(',')
  const cityWords = normalise(cityPart).split(' ').filter(Boolean)
  if (cityWords.length === 0) return null
  const hasComma = rest.length > 0

  for (const destination of DESTINATIONS) {
    const nameWords = normalise(destination.city).split(' ')
    if (!nameWords.every((word, index) => cityWords[index] === word)) continue
    // The city may be followed by the filler word "city" ("New York City").
    let tail = cityWords.slice(nameWords.length)
    if (tail[0] === 'city') tail = tail.slice(1)

    const accepted = [destination.country, ...destination.aliases].map(normalise)
    if (hasComma) {
      if (tail.length > 0) continue
      const qualifier = normalise(rest.join(' '))
      if (!qualifier) return destination
      const padded = ` ${qualifier} `
      return accepted.some((name) => padded.includes(` ${name} `)) ? destination : null
    }
    if (tail.length === 0) return destination
    return accepted.includes(tail.join(' ')) ? destination : null
  }
  return null
}
