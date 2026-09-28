import { createId } from '@/domain/ids'
import { addDays, eachDay, formatTime, isValidTime, timeToMinutes } from '@/domain/format'
import { estimateTotal, sortItems } from '@/domain/itinerary'
import type {
  CurrencyCode,
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
 *
 * A day is laid out by three rules: the arrival opens day one, the departure
 * closes the final day, and every other stop starts at its template's natural
 * time or just after the previous stop ends, whichever is later. A stop that
 * cannot fit that way is left out rather than stacked on top of another.
 */

/**
 * The currency every generated price is quoted in.
 *
 * The template costs are not unitless: they are Paris prices in euros (the
 * Eiffel Tower summit is €29, the Louvre €22), and the generic bank is pitched
 * at the same level. So a generated stop is labelled EUR whatever the trip's
 * currency — labelling it with the trip's currency turned a €29 ticket into
 * ₦29 and understated a naira trip by three orders of magnitude.
 *
 * Nothing is converted. A stop priced in a currency other than the trip's is
 * left out of that trip's totals and reported as such (`summariseBudget`,
 * `estimateTotal(days, currency)`), which is the honest answer until the draft
 * carries local prices. For a EUR trip nothing changes.
 */
export const DRAFT_PRICE_CURRENCY: CurrencyCode = 'EUR'

/**
 * Stops placed by rule rather than drawn from the bank: the arrival opens day
 * one, the departure closes the final day. The transfer is kept in the Paris
 * bank as copy but is never scheduled or offered. None of them is ever picked
 * as an ordinary stop, placed on a middle day, or suggested as an alternative.
 */
type AnchorRole = 'arrival' | 'departure' | 'transfer'

interface DraftTemplate {
  id: string
  title: string
  category: ItineraryCategory
  location: string
  description: string
  /** The time this stop naturally happens; the scheduler never moves it earlier. */
  startTime: string
  endTime: string | null
  estimatedCost: number
  durationMinutes: number
  interest: TravelInterest | null
  /** Absent for every ordinary, bookable stop. */
  role?: AnchorRole
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
    role: 'transfer',
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
    role: 'arrival',
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
    role: 'departure',
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
    role: 'arrival',
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
    role: 'departure',
  },
]

const PACE_TARGET: Record<TravelPace, number> = {
  relaxed: 2,
  balanced: 3,
  packed: 4,
}

/** The gap left between one stop's end and the next stop's start. */
const BUFFER_MINUTES = 15
/** The latest minute a stop may end on: nothing runs past midnight. */
const LAST_MINUTE = 23 * 60 + 59
/**
 * How far an ordinary stop may be pushed past its natural start before it is
 * left out of the day instead. It is what keeps breakfast in the morning.
 */
const MAX_DRIFT_MINUTES = 180

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

function choose<T>(items: readonly T[], random: () => number): T {
  return items[Math.floor(random() * items.length)]
}

/** Minutes since midnight as `HH:mm`, clamped to the day. */
function minutesToTime(total: number): string {
  const clamped = Math.max(0, Math.min(24 * 60 - 1, Math.round(total)))
  return `${String(Math.floor(clamped / 60)).padStart(2, '0')}:${String(clamped % 60).padStart(2, '0')}`
}

function isParisTrip(trip: Trip): boolean {
  return trip.destination.toLowerCase().includes('paris')
}

function poolFor(trip: Trip): DraftTemplate[] {
  return isParisTrip(trip) ? PARIS_TEMPLATES : GENERIC_TEMPLATES
}

function isAnchor(template: DraftTemplate): boolean {
  return template.role !== undefined
}

/**
 * Chooses one stop from `candidates`, which the caller has already cleared of
 * anything that may not appear today.
 *
 * Preference: a stop that matches the traveller's interests and has not been
 * used on this trip yet, then any unused stop, then — once a long trip has
 * worked through the bank — the least recently used one. Ties go to the seeded
 * `random()` over a deterministically ordered array, so the same trip and
 * variant always pick the same stops.
 */
function pickTemplate(
  candidates: readonly DraftTemplate[],
  random: () => number,
  lastUsed: ReadonlyMap<string, number>,
  interests: readonly TravelInterest[],
): DraftTemplate | null {
  if (candidates.length === 0) return null
  const fresh = candidates.filter((template) => !lastUsed.has(template.id))
  const preferredFresh = fresh.filter(
    (template) => template.interest !== null && interests.includes(template.interest),
  )
  if (preferredFresh.length > 0) return choose(preferredFresh, random)
  if (fresh.length > 0) return choose(fresh, random)

  const usedOn = (template: DraftTemplate): number => lastUsed.get(template.id) ?? -1
  const oldest = Math.min(...candidates.map(usedOn))
  return choose(
    candidates.filter((template) => usedOn(template) === oldest),
    random,
  )
}

interface Slot {
  template: DraftTemplate
  /** Minutes since midnight. */
  start: number
  end: number
}

/** Arrival first, departure last, every ordinary stop in between. */
function placementRank(template: DraftTemplate): number {
  if (template.role === 'arrival') return 0
  return template.role === undefined ? 1 : 2
}

/**
 * Times one day's stops, or returns null when they cannot all fit.
 *
 * The arrival goes first and the departure last; every other stop is ordered by
 * its natural start. Walking that order, each stop starts at its natural time or
 * `BUFFER_MINUTES` after the previous one ends, whichever is later. So nothing
 * overlaps, and nothing starts earlier than it naturally would — which is what
 * keeps an evening stop in the evening. The day does not fit if a stop would end
 * after 23:59, or an ordinary stop would be pushed more than `MAX_DRIFT_MINUTES`
 * past its natural time. The departure is exempt from the drift limit: it goes
 * whenever the day's last stop is done.
 */
function layOutDay(stops: readonly DraftTemplate[]): Slot[] | null {
  const ordered = [...stops].sort(
    (a, b) =>
      placementRank(a) - placementRank(b) ||
      timeToMinutes(a.startTime) - timeToMinutes(b.startTime),
  )
  const slots: Slot[] = []
  let earliest = 0
  for (const template of ordered) {
    const natural = timeToMinutes(template.startTime)
    const start = Math.max(natural, earliest)
    const end = start + template.durationMinutes
    if (end > LAST_MINUTE) return null
    if (!isAnchor(template) && start - natural > MAX_DRIFT_MINUTES) return null
    slots.push({ template, start, end })
    earliest = end + BUFFER_MINUTES
  }
  return slots
}

/**
 * Fills one day with its anchors plus up to `count` ordinary stops.
 *
 * `daySeen` is the hard per-day rule: a stop already drawn today — placed, or
 * set aside because it did not fit — is never a candidate again, so a day can
 * never show the same stop twice. Yesterday's stops are excluded too whenever
 * the bank holds at least twice the day's count, which always leaves as many
 * candidates as the day asks for; with a smaller bank they are only avoided
 * while anything else remains. A draw that would not fit (see `layOutDay`) is dropped and another
 * is drawn, so a crowded day ends up shorter rather than stacked.
 */
function planDay(
  anchors: readonly DraftTemplate[],
  count: number,
  bookable: readonly DraftTemplate[],
  yesterday: ReadonlySet<string>,
  lastUsed: ReadonlyMap<string, number>,
  interests: readonly TravelInterest[],
  random: () => number,
): Slot[] {
  let slots = layOutDay(anchors) ?? []
  const chosen = [...anchors]
  const daySeen = new Set(anchors.map((template) => template.id))
  const strictlyAvoidYesterday = bookable.length >= 2 * count

  let placed = 0
  while (placed < count) {
    const open = bookable.filter((template) => !daySeen.has(template.id))
    const notYesterday = open.filter((template) => !yesterday.has(template.id))
    const pick = pickTemplate(
      notYesterday.length > 0 || strictlyAvoidYesterday ? notYesterday : open,
      random,
      lastUsed,
      interests,
    )
    if (pick === null) break
    daySeen.add(pick.id)

    const next = layOutDay([...chosen, pick])
    if (next === null) continue
    chosen.push(pick)
    slots = next
    placed += 1
  }
  return slots
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
    // The template costs are euro prices whatever the trip's currency; see
    // `DRAFT_PRICE_CURRENCY`. Labelled honestly, not converted.
    currency: DRAFT_PRICE_CURRENCY,
    source: 'ai',
    editedByUser: false,
    experienceId: null,
    notes: '',
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  }
}

/**
 * Builds a full draft itinerary for a trip. Deterministic for a given
 * (trip.id, variant, trip.startDate) so regeneration is reproducible.
 */
export function buildItinerary(trip: Trip, variant = 0, timestamp = new Date().toISOString()): ItineraryDay[] {
  const pool = poolFor(trip)
  const bookable = pool.filter((template) => !isAnchor(template))
  const arrival = pool.find((template) => template.role === 'arrival')
  const departure = pool.find((template) => template.role === 'departure')
  const random = mulberry32(hashString(`${trip.id}:${variant}:${trip.startDate}`))
  const dates = eachDay(trip.startDate, trip.endDate)
  const lastIndex = dates.length - 1
  const target = PACE_TARGET[trip.pace]
  // The day each template was last placed on, for least-recently-used reuse.
  const lastUsed = new Map<string, number>()
  let yesterday: ReadonlySet<string> = new Set()

  return dates.map((date, dayIndex) => {
    const isFirst = dayIndex === 0
    const isLast = dayIndex === lastIndex
    // A one-day trip is a travel day at both ends: arrival first, departure last.
    const anchors = [isFirst ? arrival : undefined, isLast ? departure : undefined].filter(
      (template): template is DraftTemplate => template !== undefined,
    )
    // Travel days are lighter than full days.
    let count: number
    if (isFirst) count = target >= 4 ? 2 : 1
    else if (isLast) count = 1
    else count = target + (random() > 0.6 ? 1 : 0)

    const slots = planDay(anchors, count, bookable, yesterday, lastUsed, trip.interests, random)
    for (const { template } of slots) lastUsed.set(template.id, dayIndex)
    yesterday = new Set(slots.map(({ template }) => template.id))

    const items = sortItems(
      slots.map(({ template, start, end }) =>
        toItem(trip, template, timestamp, {
          startTime: minutesToTime(start),
          endTime: minutesToTime(end),
        }),
      ),
    )

    return {
      id: `${trip.id}_d${dayIndex + 1}`,
      tripId: trip.id,
      date,
      index: dayIndex + 1,
      title: null,
      items,
    }
  })
}

/**
 * One targeted alternative for a single item: the same start, a different stop.
 *
 * Never an arrival, departure or transfer — an airport run is not an
 * alternative to anything — and never a stop already on that day. Among the
 * rest it prefers, in order: the same category and finished before the next
 * stop; the same category and finished by midnight; any category finished
 * before the next stop; any finished by midnight. The end time is recomputed
 * from the new stop's own duration.
 *
 * Seeded on the slot's content rather than the item's generated id, so the same
 * day, item and variant give the same suggestion in any process.
 */
export function buildAlternativeItem(
  trip: Trip,
  day: ItineraryDay,
  item: ItineraryItem,
  variant = 0,
  timestamp = new Date().toISOString(),
): ItineraryItem {
  const pool = poolFor(trip)
  const random = mulberry32(
    hashString(`${trip.id}:alt:${day.id}:${item.title}:${item.startTime}:${variant}`),
  )
  const start = timeToMinutes(item.startTime)
  const nextStart = day.items
    .map((other) => timeToMinutes(other.startTime))
    .filter((minutes) => minutes > start)
    .reduce((earliest, minutes) => Math.min(earliest, minutes), LAST_MINUTE + BUFFER_MINUTES)

  const onDay = new Set([item.title, ...day.items.map((other) => other.title)])
  const offered = pool.filter((template) => !isAnchor(template))
  const fresh = offered.filter((template) => !onDay.has(template.title))

  const sameCategory = (template: DraftTemplate): boolean => template.category === item.category
  const beforeNext = (template: DraftTemplate): boolean =>
    start + template.durationMinutes <= nextStart - BUFFER_MINUTES
  const beforeMidnight = (template: DraftTemplate): boolean =>
    start + template.durationMinutes <= LAST_MINUTE
  const tiers: Array<(template: DraftTemplate) => boolean> = [
    (template) => sameCategory(template) && beforeNext(template),
    (template) => sameCategory(template) && beforeMidnight(template),
    beforeNext,
    beforeMidnight,
    () => true,
  ]
  const candidates =
    tiers.map((tier) => fresh.filter(tier)).find((tier) => tier.length > 0) ??
    // Only reachable if the day already holds every stop in the bank.
    offered.filter((template) => template.title !== item.title)
  const chosen = choose(candidates, random)

  return toItem(trip, chosen, timestamp, {
    startTime: item.startTime,
    endTime: isValidTime(item.startTime)
      ? minutesToTime(start + chosen.durationMinutes)
      : item.endTime,
    source: 'ai',
  })
}

/**
 * Counts and totals a draft. `currency` is optional and behaves exactly as it
 * does on `estimateTotal`: supplied, `estimate` counts only the stops priced in
 * that currency, on that currency's own scale; omitted, every stop is counted on
 * the two-digit default, which is what this function always did.
 */
export function summariseDraft(
  days: readonly ItineraryDay[],
  currency?: CurrencyCode,
): {
  dayCount: number
  itemCount: number
  estimate: number
} {
  return {
    dayCount: days.length,
    itemCount: days.reduce((total, day) => total + day.items.length, 0),
    estimate: estimateTotal(days, currency),
  }
}

/**
 * One line summarising a whole plan.
 *
 * The daily window is the earliest start and the latest finish across every
 * stop. It previously compared the first day's opening stop with the *last*
 * day's opening stop, which on a typical draft rendered as "8:00 AM - 8:00 AM"
 * and told the traveller nothing.
 */
export function describePlan(trip: Trip, days: readonly ItineraryDay[]): string {
  const { itemCount } = summariseDraft(days)
  const items = days.flatMap((day) => day.items)
  const dayLabel = `${days.length} ${days.length === 1 ? 'day' : 'days'} in ${trip.destination}`
  const stopLabel = `${itemCount} planned ${itemCount === 1 ? 'stop' : 'stops'}`
  if (items.length === 0) return `${dayLabel} · ${stopLabel}`

  const starts = items.map((item) => timeToMinutes(item.startTime))
  const ends = items.map((item) => timeToMinutes(item.endTime ?? item.startTime))
  const window = `${formatTime(minutesToTime(Math.min(...starts)))} - ${formatTime(
    minutesToTime(Math.max(...ends)),
  )}`
  return `${dayLabel} · ${stopLabel} · ${window}`
}

export function extendTripByDays(trip: Trip, extraDays: number): Trip {
  return { ...trip, endDate: addDays(trip.endDate, extraDays) }
}
