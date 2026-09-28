import { createId } from '@/domain/ids'
import { addDays, eachDay, formatTime, timeToMinutes } from '@/domain/format'
import { sumAmounts } from '@/domain/money'
import { sortItems } from '@/domain/itinerary'
import type {
  ItineraryCategory,
  ItineraryDay,
  ItineraryItem,
  TravelInterest,
  TravelPace,
  Trip,
} from '@/domain/types'

/**
 * Deterministic itinerary generator.
 *
 * This is the prototype's stand-in for a real model: it composes a believable
 * day-by-day draft from a template bank using a seeded PRNG, so the same
 * (trip, variant) always produces the same plan and tests stay deterministic
 * while "regenerate" can still return something visibly different.
 *
 * Landmark names are only used when the trip is actually in Paris; any other
 * destination receives generic, clearly-draft phrasing rather than invented
 * specifics.
 */

interface DraftTemplate {
  id: string
  title: string
  category: ItineraryCategory
  location: string
  description: string
  startTime: string
  endTime: string | null
  estimatedCost: number
  durationMinutes: number
  interest: TravelInterest | null
}

const PARIS_TEMPLATES: DraftTemplate[] = [
  {
    id: 'par_cafe',
    title: 'Flat white and a pastry on a terrace',
    category: 'food',
    location: 'Saint-Germain-des-Prés',
    description:
      'Ease into the day at a neighbourhood café. Sit outside, order slowly, and let the street wake up around you.',
    startTime: '08:30',
    endTime: '09:30',
    estimatedCost: 14,
    durationMinutes: 60,
    interest: 'food',
  },
  {
    id: 'par_louvre',
    title: 'Louvre Museum, Denon wing highlights',
    category: 'culture',
    location: 'Musée du Louvre',
    description:
      'A focused two-hour route through the Denon wing rather than the whole building, finishing at the Mona Lisa.',
    startTime: '09:30',
    endTime: '11:30',
    estimatedCost: 22,
    durationMinutes: 120,
    interest: 'culture',
  },
  {
    id: 'par_orsay',
    title: 'Musée d’Orsay, impressionist floor',
    category: 'culture',
    location: 'Musée d’Orsay',
    description:
      'Level five for the impressionists, then the fifth-floor clock window before the crowds arrive.',
    startTime: '10:00',
    endTime: '12:00',
    estimatedCost: 16,
    durationMinutes: 120,
    interest: 'culture',
  },
  {
    id: 'par_eiffel',
    title: 'Eiffel Tower summit slot',
    category: 'sightseeing',
    location: 'Champ de Mars',
    description:
      'A pre-booked summit slot. Head up about an hour before sunset so the river lights are part of it.',
    startTime: '17:00',
    endTime: '19:00',
    estimatedCost: 29,
    durationMinutes: 120,
    interest: 'culture',
  },
  {
    id: 'par_marais',
    title: 'Le Marais courtyards and galleries',
    category: 'sightseeing',
    location: 'Le Marais',
    description:
      'A self-guided loop through the hidden courtyards, the covered market and the galleries off Rue des Rosiers.',
    startTime: '11:00',
    endTime: '13:00',
    estimatedCost: 0,
    durationMinutes: 120,
    interest: 'shopping',
  },
  {
    id: 'par_montmartre',
    title: 'Montmartre before the crowds',
    category: 'sightseeing',
    location: 'Montmartre',
    description:
      'Climb the steps past the artists, take the terrace view, then drop into the back streets while they are still quiet.',
    startTime: '08:00',
    endTime: '10:00',
    estimatedCost: 0,
    durationMinutes: 120,
    interest: 'culture',
  },
  {
    id: 'par_market',
    title: 'Market breakfast and produce run',
    category: 'food',
    location: 'Marché d’Aligre',
    description:
      'Bread, cheese and something sweet for the day, plus fruit for later. Go early; the best stalls go by ten.',
    startTime: '08:00',
    endTime: '09:15',
    estimatedCost: 18,
    durationMinutes: 75,
    interest: 'food',
  },
  {
    id: 'par_lunch',
    title: 'Long lunch at a classic bistro',
    category: 'food',
    location: 'Saint-Germain-des-Prés',
    description:
      'The set menu at a no-reservation neighbourhood spot. Allow two hours; the pace is part of it.',
    startTime: '13:00',
    endTime: '15:00',
    estimatedCost: 38,
    durationMinutes: 120,
    interest: 'food',
  },
  {
    id: 'par_seine',
    title: 'Seine cruise from Pont de l’Alma',
    category: 'sightseeing',
    location: 'Port de la Conférence',
    description:
      'An hour on the river for orientation, with the bridges lighting up as you come back.',
    startTime: '18:00',
    endTime: '19:30',
    estimatedCost: 18,
    durationMinutes: 90,
    interest: 'relaxed',
  },
  {
    id: 'par_versailles',
    title: 'Versailles, palace and gardens',
    category: 'outdoors',
    location: 'Versailles',
    description:
      'RER C out to Versailles, the Hall of Mirrors and a few rooms, then the gardens and the Picpus village.',
    startTime: '09:00',
    endTime: '14:00',
    estimatedCost: 32,
    durationMinutes: 300,
    interest: 'outdoors',
  },
  {
    id: 'par_canal',
    title: 'Canal Saint-Martin towpath walk',
    category: 'outdoors',
    location: 'Canal Saint-Martin',
    description:
      'Flat, shaded and quiet. Footbridges, water, and a coffee on the way back.',
    startTime: '15:00',
    endTime: '16:30',
    estimatedCost: 0,
    durationMinutes: 90,
    interest: 'relaxed',
  },
  {
    id: 'par_gardens',
    title: 'Luxembourg Gardens and the Medici Fountain',
    category: 'outdoors',
    location: 'Luxembourg Gardens',
    description:
      'An hour on the lawns, the carousel if it is running, and the palace on the north side.',
    startTime: '14:00',
    endTime: '15:30',
    estimatedCost: 0,
    durationMinutes: 90,
    interest: 'relaxed',
  },
  {
    id: 'par_workshop',
    title: 'Atelier visit: a working studio',
    category: 'culture',
    location: 'Oberkampf',
    description:
      'A small group visit to a working atelier in the 11th, with time to talk to the artist afterwards.',
    startTime: '14:30',
    endTime: '16:30',
    estimatedCost: 35,
    durationMinutes: 120,
    interest: 'culture',
  },
  {
    id: 'par_wine',
    title: 'Natural wine bar crawl',
    category: 'nightlife',
    location: 'Oberkampf / République',
    description:
      'Three small bars, all natural wine, all walkable. The last one is usually the best one.',
    startTime: '20:00',
    endTime: '23:00',
    estimatedCost: 45,
    durationMinutes: 180,
    interest: 'nightlife',
  },
  {
    id: 'par_show',
    title: 'Evening performance at a small theatre',
    category: 'nightlife',
    location: 'Bastille',
    description:
      'A short evening show in a 500-seat room, the kind that plays in English and in French.',
    startTime: '19:30',
    endTime: '22:00',
    estimatedCost: 42,
    durationMinutes: 150,
    interest: 'nightlife',
  },
  {
    id: 'par_shopping',
    title: 'Independent design shops',
    category: 'shopping',
    location: 'Le Marais / Rue du Temple',
    description:
      'A slow run through the design and vintage shops, with the covered passages in between.',
    startTime: '15:00',
    endTime: '17:00',
    estimatedCost: 60,
    durationMinutes: 120,
    interest: 'shopping',
  },
  {
    id: 'par_transfer',
    title: 'Airport transfer and check-in',
    category: 'transit',
    location: 'Charles de Gaulle',
    description: 'Allow the extra hour. RER B to CDG, check-in, and a coffee before the flight.',
    startTime: '10:00',
    endTime: '12:00',
    estimatedCost: 24,
    durationMinutes: 120,
    interest: null,
  },
  {
    id: 'par_arrive',
    title: 'Arrive, drop bags, and walk the neighbourhood',
    category: 'transit',
    location: 'Your hotel',
    description:
      'Check in, leave the bags, and take one slow loop around the block before dinner.',
    startTime: '15:00',
    endTime: '16:30',
    estimatedCost: 12,
    durationMinutes: 90,
    interest: 'relaxed',
  },
  {
    id: 'par_picnic',
    title: 'Market picnic in a park',
    category: 'food',
    location: 'Luxembourg Gardens',
    description:
      'Buy lunch from the market, find a bench out of the sun, and eat like a local for the price of a sandwich.',
    startTime: '12:30',
    endTime: '13:45',
    estimatedCost: 20,
    durationMinutes: 75,
    interest: 'food',
  },
  {
    id: 'par_depart',
    title: 'Check out, last coffee, and head for the airport',
    category: 'transit',
    location: 'Your hotel, then Charles de Gaulle',
    description:
      'Pack, settle the room, and leave the extra hour for the RER B out to CDG. Check the airport on your ticket; Orly is a different run entirely.',
    startTime: '08:00',
    endTime: '10:00',
    estimatedCost: 24,
    durationMinutes: 120,
    interest: null,
  },
  {
    id: 'par_jazz',
    title: 'Late set in a cellar jazz club',
    category: 'nightlife',
    location: 'Saint-Germain-des-Prés',
    description: 'Small room, no sign, two sets a night. Arrive ten minutes early.',
    startTime: '21:30',
    endTime: '23:30',
    estimatedCost: 35,
    durationMinutes: 120,
    interest: 'nightlife',
  },
]

const GENERIC_TEMPLATES: DraftTemplate[] = [
  {
    id: 'gen_breakfast',
    title: 'Breakfast where the locals eat',
    category: 'food',
    location: 'City centre',
    description: 'A short, unhurried breakfast to start the day and get your bearings.',
    startTime: '08:30',
    endTime: '09:30',
    estimatedCost: 12,
    durationMinutes: 60,
    interest: 'food',
  },
  {
    id: 'gen_old_town',
    title: 'Old town walking loop',
    category: 'sightseeing',
    location: 'Historic centre',
    description:
      'A self-guided loop through the oldest streets, with a couple of stops that are easy to miss.',
    startTime: '10:00',
    endTime: '12:00',
    estimatedCost: 0,
    durationMinutes: 120,
    interest: 'culture',
  },
  {
    id: 'gen_museum',
    title: 'City museum, highlights floor',
    category: 'culture',
    location: 'Museum quarter',
    description: 'The collection that explains the city, in about two hours.',
    startTime: '10:00',
    endTime: '12:00',
    estimatedCost: 18,
    durationMinutes: 120,
    interest: 'culture',
  },
  {
    id: 'gen_market',
    title: 'Covered market lunch',
    category: 'food',
    location: 'Central market',
    description: 'Eat at the market rather than near it. Cheaper, and better.',
    startTime: '12:30',
    endTime: '14:00',
    estimatedCost: 16,
    durationMinutes: 90,
    interest: 'food',
  },
  {
    id: 'gen_viewpoint',
    title: 'Viewpoint over the rooftops',
    category: 'sightseeing',
    location: 'Highest accessible point',
    description: 'The best free view in the city, usually at the top of something.',
    startTime: '16:00',
    endTime: '17:30',
    estimatedCost: 0,
    durationMinutes: 90,
    interest: 'outdoors',
  },
  {
    id: 'gen_park',
    title: 'Park and green space walk',
    category: 'outdoors',
    location: 'City park',
    description: 'Flat paths, some shade, and a good hour out of the heat.',
    startTime: '15:00',
    endTime: '16:30',
    estimatedCost: 0,
    durationMinutes: 90,
    interest: 'relaxed',
  },
  {
    id: 'gen_shops',
    title: 'Independent shops and market stalls',
    category: 'shopping',
    location: 'Old quarter',
    description: 'A slow run through the local shops, away from the main shopping streets.',
    startTime: '15:00',
    endTime: '17:00',
    estimatedCost: 40,
    durationMinutes: 120,
    interest: 'shopping',
  },
  {
    id: 'gen_dinner',
    title: 'Dinner where the tables are local',
    category: 'food',
    location: 'Residential quarter',
    description: 'Something the neighbourhood eats, with a walk afterwards.',
    startTime: '19:30',
    endTime: '21:30',
    estimatedCost: 30,
    durationMinutes: 120,
    interest: 'food',
  },
  {
    id: 'gen_night',
    title: 'Evening in the local bar scene',
    category: 'nightlife',
    location: 'Nightlife quarter',
    description: 'A couple of low-key places, all walkable, all busy at the weekend.',
    startTime: '21:00',
    endTime: '23:00',
    estimatedCost: 35,
    durationMinutes: 120,
    interest: 'nightlife',
  },
  {
    id: 'gen_nature',
    title: 'Half day outside the city',
    category: 'outdoors',
    location: 'Regional park',
    description: 'A half-day trip out, with trails or water depending on the weather.',
    startTime: '09:00',
    endTime: '13:00',
    estimatedCost: 28,
    durationMinutes: 240,
    interest: 'outdoors',
  },
  {
    id: 'gen_arrive',
    title: 'Arrive and settle in',
    category: 'transit',
    location: 'Your accommodation',
    description: 'Check in, drop the bags, and get oriented before the first proper day.',
    startTime: '14:00',
    endTime: '16:00',
    estimatedCost: 15,
    durationMinutes: 120,
    interest: 'relaxed',
  },
  {
    id: 'gen_depart',
    title: 'Last look, then head out',
    category: 'transit',
    location: 'Departure point',
    description: 'A short final loop, then allow the extra hour for the transfer.',
    startTime: '09:00',
    endTime: '11:00',
    estimatedCost: 20,
    durationMinutes: 120,
    interest: null,
  },
]

const PACE_TARGET: Record<TravelPace, number> = {
  relaxed: 2,
  balanced: 3,
  packed: 4,
}

function hashString(value: string): number {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function mulberry32(seed: number): () => number {
  let state = seed
  return () => {
    state += 0x6d2b79f5
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function isParisTrip(trip: Trip): boolean {
  return trip.destination.toLowerCase().includes('paris')
}

function pickTemplate(
  pool: DraftTemplate[],
  random: () => number,
  used: Set<string>,
  interests: readonly TravelInterest[],
): DraftTemplate {
  const bookable = pool.filter((template) => !isArrivalOrDeparture(template))
  const preferred = bookable.filter(
    (template) => template.interest !== null && interests.includes(template.interest),
  )
  const preferredFresh = preferred.filter((template) => !used.has(template.id))
  if (preferredFresh.length > 0) {
    return preferredFresh[Math.floor(random() * preferredFresh.length)]
  }

  const fresh = bookable.filter((template) => !used.has(template.id))
  const candidates = fresh.length > 0 ? fresh : bookable
  return candidates[Math.floor(random() * candidates.length)]
}

function spreadTimes(templates: DraftTemplate[]): DraftTemplate[] {
  const sorted = [...templates].sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime))
  const span = 8 * 60
  const step = Math.max(90, Math.floor(span / Math.max(sorted.length, 1)))
  return sorted.map((template, index) => {
    const startMinutes = Math.min(8 * 60 + step * index, 20 * 60)
    const hours = Math.floor(startMinutes / 60)
    const minutes = startMinutes % 60
    const start = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
    const endMinutes = startMinutes + template.durationMinutes
    const endHours = Math.floor(endMinutes / 60)
    const endRest = endMinutes % 60
    return {
      ...template,
      startTime: start,
      endTime: endHours >= 24 ? '23:59' : `${String(endHours).padStart(2, '0')}:${String(endRest).padStart(2, '0')}`,
    }
  })
}

function toItem(
  trip: Trip,
  template: DraftTemplate,
  timestamp: string,
  overrides: Partial<ItineraryItem> = {},
): ItineraryItem {
  return {
    id: createId('itm'),
    tripId: trip.id,
    title: template.title,
    category: template.category,
    startTime: template.startTime,
    endTime: template.endTime,
    location: template.location,
    description: template.description,
    estimatedCost: template.estimatedCost,
    source: 'ai',
    editedByUser: false,
    experienceId: null,
    notes: '',
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  }
}

function isArrivalOrDeparture(template: DraftTemplate): boolean {
  return template.id.endsWith('arrive') || template.id.endsWith('depart')
}

/**
 * Builds a full draft itinerary for a trip. Deterministic for a given
 * (trip.id, variant) pair so regeneration is reproducible.
 */
export function buildItinerary(trip: Trip, variant = 0, timestamp = new Date().toISOString()): ItineraryDay[] {
  const pool = isParisTrip(trip) ? PARIS_TEMPLATES : GENERIC_TEMPLATES
  const random = mulberry32(hashString(`${trip.id}:${variant}:${trip.startDate}`))
  const dates = eachDay(trip.startDate, trip.endDate)
  const total = dates.length
  const target = PACE_TARGET[trip.pace]
  const used = new Set<string>(pool.filter(isArrivalOrDeparture).map((template) => template.id))
  const dayIds = dates.map((_, index) => `${trip.id}_d${index + 1}`)

  return dates.map((date, dayIndex) => {
    const dayId = dayIds[dayIndex]
    const isFirst = dayIndex === 0
    const isLast = dayIndex === total - 1

    const chosen: DraftTemplate[] = []

    if (isFirst) {
      chosen.push(pool.find((template) => template.id.endsWith('arrive')) ?? pool[0])
      const anchor = pickTemplate(pool, random, used, trip.interests)
      used.add(anchor.id)
      chosen.push(anchor)
      if (target >= 4) {
        const extra = pickTemplate(pool, random, used, trip.interests)
        used.add(extra.id)
        chosen.push(extra)
      }
    } else if (isLast) {
      const departure = pool.find((template) => template.id.endsWith('depart')) ?? pool[pool.length - 1]
      chosen.unshift(departure)
      const anchor = pickTemplate(pool, random, used, trip.interests)
      used.add(anchor.id)
      chosen.push(anchor)
    } else {
      const count = target + (random() > 0.6 ? 1 : 0)
      for (let slot = 0; slot < count; slot += 1) {
        const template = pickTemplate(pool, random, used, trip.interests)
        used.add(template.id)
        chosen.push(template)
      }
    }

    const timed = spreadTimes(chosen)
    const items = sortItems(timed.map((template) => toItem(trip, template, timestamp)))

    return {
      id: dayId,
      tripId: trip.id,
      date,
      index: dayIndex + 1,
      title: null,
      items,
    }
  })
}

/** One targeted alternative for a single item, same slot, different suggestion. */
export function buildAlternativeItem(
  trip: Trip,
  day: ItineraryDay,
  item: ItineraryItem,
  variant = 0,
  timestamp = new Date().toISOString(),
): ItineraryItem {
  const pool = isParisTrip(trip) ? PARIS_TEMPLATES : GENERIC_TEMPLATES
  const random = mulberry32(hashString(`${trip.id}:alt:${day.id}:${item.id}:${variant}`))
  const sameCategory = pool.filter(
    (template) => template.category === item.category && template.title !== item.title,
  )
  const candidates = sameCategory.length > 0 ? sameCategory : pool.filter((template) => template.title !== item.title)
  const chosen = candidates.length > 0
    ? candidates[Math.floor(random() * candidates.length)]
    : pool[0]

  return toItem(trip, chosen, timestamp, {
    startTime: item.startTime,
    endTime: item.endTime,
    source: 'ai',
  })
}

export function summariseDraft(days: readonly ItineraryDay[]): {
  dayCount: number
  itemCount: number
  estimate: number
} {
  return {
    dayCount: days.length,
    itemCount: days.reduce((total, day) => total + day.items.length, 0),
    estimate: sumAmounts(days.flatMap((day) => day.items.map((item) => item.estimatedCost))),
  }
}

/** Human summary line used by the itinerary screen header. */
export function describePlan(trip: Trip, days: readonly ItineraryDay[]): string {
  const { itemCount } = summariseDraft(days)
  const first = days[0]?.items[0]
  const last = days[days.length - 1]?.items[0]
  const window = `${formatTime(first?.startTime ?? '09:00')} - ${formatTime(last?.startTime ?? '18:00')}`
  return `${days.length} days in ${trip.destination} · ${itemCount} planned stops · ${window}`
}

export function extendTripByDays(trip: Trip, extraDays: number): Trip {
  return { ...trip, endDate: addDays(trip.endDate, extraDays) }
}
