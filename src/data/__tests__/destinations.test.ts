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

  it('ignores the filler words of and the, and a trailing city', () => {
    expect(cities('new york city')).toEqual(['New York'])
    expect(cities('United States of America')).toEqual(['New York'])
    expect(cities('the uk')).toEqual(['London'])
    expect(cities('the United Kingdom')).toEqual(['London'])
    expect(cities('london city')).toEqual(['London'])
  })

  it('matches an alias written as a phrase', () => {
    expect(cities('big apple')).toEqual(['New York'])
    expect(cities('Big Apple')).toEqual(['New York'])
    expect(cities('great britain')).toEqual(['London'])
  })

  it('still finds nothing for filler words alone or for a stray city word', () => {
    expect(cities('of the')).toEqual([])
    expect(cities('apple')).toEqual(['New York'])
    expect(cities('paris city of lisbon')).toEqual([])
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

  it('accepts the city and its country without a comma', () => {
    expect(matchDestination('Paris France')?.id).toBe('paris')
    expect(matchDestination('London UK')?.id).toBe('london')
    expect(matchDestination('london united kingdom')?.id).toBe('london')
    expect(matchDestination('Rome Italy')?.id).toBe('rome')
    expect(matchDestination('New York City')?.id).toBe('new-york')
    expect(matchDestination('New York USA')?.id).toBe('new-york')
  })

  it('accepts "City" after a catalogue city, with or without a country', () => {
    expect(matchDestination('New York City, USA')?.id).toBe('new-york')
    expect(matchDestination('New York City, United States')?.id).toBe('new-york')
  })

  it('compares the qualifier by whole words, not by a name hidden inside another', () => {
    // "Ukraine" starts with the alias "UK", "Romania" with "Roma", "Brussels" ends with "us".
    expect(matchDestination('London, Ukraine')).toBeNull()
    expect(matchDestination('Rome, Romania')).toBeNull()
    expect(matchDestination('New York, Brussels')).toBeNull()
    expect(matchDestination('London Ukraine')).toBeNull()
    expect(matchDestination('Rome Romania')).toBeNull()
    // Still true when the real name is one word among several.
    expect(matchDestination('London, Greater London, UK')?.id).toBe('london')
    expect(matchDestination('New York, United States of America')?.id).toBe('new-york')
  })

  it('leaves unknown or contradictory text unmatched instead of guessing', () => {
    expect(matchDestination('Paris Texas')).toBeNull()
    expect(matchDestination('London Ontario')).toBeNull()
    expect(matchDestination('Lisbon, Portugal')).toBeNull()
    expect(matchDestination('Paris, Texas')).toBeNull()
    expect(matchDestination('London, Ontario')).toBeNull()
    expect(matchDestination('')).toBeNull()
  })
})
