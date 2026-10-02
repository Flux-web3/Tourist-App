import { EXPERIENCES_BY_ID } from '@/data/experiences'
import type { Trip } from '@/domain/types'

const SITE = 'Tourist'

/** The landing page's title, which is also the one written in `index.html`. */
export const LANDING_TITLE = 'Tourist — Plan the trip, then the days inside it'

export const NOT_FOUND_TITLE = `Page not found · ${SITE}`

const TRIP_SECTION_TITLE: ReadonlyMap<string, string> = new Map([
  ['itinerary', 'Itinerary'],
  ['explore', 'Explore'],
  ['budget', 'Budget'],
  ['notes', 'Notes'],
])

function titled(...parts: string[]): string {
  return [...parts, SITE].join(' · ')
}

function decode(segment: string): string {
  try {
    return decodeURIComponent(segment)
  } catch {
    return segment
  }
}

/**
 * The document title for a URL path: the screen first, then the trip it
 * belongs to, then the product, so the part that differs between tabs and in a
 * screen reader's page announcement comes first.
 *
 * It mirrors the route table in `App.tsx`. A path that table does not serve,
 * and a trip or place id that does not exist, are all "Page not found", which
 * is what those screens say on the page too.
 */
export function pageTitle(pathname: string, trips: ReadonlyArray<Pick<Trip, 'id' | 'name'>>): string {
  const segments = pathname.split('/').filter(Boolean).map(decode)
  const [first, second, third] = segments

  if (segments.length === 0) return LANDING_TITLE

  if (segments.length === 1) {
    if (first === 'welcome') return titled('Welcome')
    if (first === 'trips') return titled('Trips')
    if (first === 'explore') return titled('Explore')
    return NOT_FOUND_TITLE
  }

  if (first === 'places' && segments.length === 2) {
    const place = EXPERIENCES_BY_ID.get(second)
    return place ? titled(place.name) : NOT_FOUND_TITLE
  }

  if (first !== 'trips' || segments.length > 3) return NOT_FOUND_TITLE
  if (second === 'new' && segments.length === 2) return titled('New trip')

  const trip = trips.find((candidate) => candidate.id === second)
  if (!trip) return NOT_FOUND_TITLE
  const name = trip.name.trim() || 'Trip'
  if (segments.length === 2) return titled(name)

  const section = TRIP_SECTION_TITLE.get(third)
  return section ? titled(section, name) : NOT_FOUND_TITLE
}
