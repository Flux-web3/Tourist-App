import { describe, expect, it } from 'vitest'
import {
  DESTINATIONS,
  getDestination,
  matchDestination,
  searchDestinations,
} from '@/data/destinations'
import { destinationHasPlaces } from '@/data/experiences'
import { CURRENCIES } from '@/domain/money'

const cities = (query: string) => searchDestinations(query).map((destination) => destination.city)

describe('the destination catalogue', () => {
  it('covers Paris, London and Lagos in their own currencies', () => {
    expect(getDestination('paris')?.currency).toBe('EUR')
    expect(getDestination('london')?.currency).toBe('GBP')
    expect(getDestination('lagos')?.currency).toBe('NGN')
  })

  it('gives every destination a unique id and a currency the app can track', () => {
    const ids = DESTINATIONS.map((destination) => destination.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const destination of DESTINATIONS) {
      expect(CURRENCIES).toContain(destination.currency)
      expect(destination.displayName).toBe(`${destination.city}, ${destination.country}`)
      expect(destination.priceLevel).toBeGreaterThan(0)
      expect(destination.priceStep).toBeGreaterThan(0)
    }
  })

  it('calls a destination curated exactly when it has Explore places', () => {
    // The label the traveller sees must match what Tourist can actually show.
    for (const destination of DESTINATIONS) {
      expect(destination.guide === 'curated').toBe(destinationHasPlaces(destination.id))
    }
    expect(DESTINATIONS.filter((d) => d.guide === 'curated').map((d) => d.id)).toEqual([
      'paris',
      'london',
      'lagos',
    ])
  })

  it('knows nothing about an id it does not list', () => {
    expect(getDestination('atlantis')).toBeNull()
    expect(getDestination(null)).toBeNull()
    expect(getDestination('')).toBeNull()
  })
})

describe('searchDestinations', () => {
  it('matches a whole or partial city name in any case', () => {
    expect(cities('London')).toEqual(['London'])
    expect(cities('lon')).toEqual(['London'])
    expect(cities('LAGOS')).toEqual(['Lagos'])
    // Word starts, not substrings: "lon" is not Barce-lon-a.
    expect(cities('lon')).not.toContain('Barcelona')
  })

  it('matches country names and common aliases', () => {
    expect(cities('nigeria')).toEqual(['Lagos'])
    expect(cities('United Kingdom')).toEqual(['London'])
    expect(cities('uk')).toEqual(['London'])
    expect(cities('nyc')).toEqual(['New York'])
  })

  it('ignores accents and punctuation', () => {
    expect(cities('  pàris, ')).toEqual(['Paris'])
  })

  it('returns nothing, rather than a guess, for a city it does not cover', () => {
    expect(cities('Lisbon')).toEqual([])
  })

  it('lists every destination for an empty query', () => {
    expect(searchDestinations('')).toHaveLength(DESTINATIONS.length)
    expect(searchDestinations('   ')).toHaveLength(DESTINATIONS.length)
  })
})

describe('matchDestination', () => {
  it('resolves the ways a pre-catalogue trip may have been typed', () => {
    expect(matchDestination('Paris, France')?.id).toBe('paris')
    expect(matchDestination('paris')?.id).toBe('paris')
    expect(matchDestination('London')?.id).toBe('london')
    expect(matchDestination('London, UK')?.id).toBe('london')
    expect(matchDestination('london, england')?.id).toBe('london')
    expect(matchDestination('Lagos, Nigeria')?.id).toBe('lagos')
  })

  it('leaves unknown or contradictory text unmatched instead of guessing', () => {
    expect(matchDestination('Lisbon, Portugal')).toBeNull()
    expect(matchDestination('Paris, Texas')).toBeNull()
    expect(matchDestination('London, Ontario')).toBeNull()
    expect(matchDestination('')).toBeNull()
  })
})
