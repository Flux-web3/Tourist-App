import { describe, expect, it, vi } from 'vitest'
import { addDays, eachDay, isValidTime, timeToMinutes } from '@/domain/format'
import type { CurrencyCode, ItineraryDay, ItineraryItem, TravelPace, Trip } from '@/domain/types'
import {
  DRAFT_PRICE_CURRENCY,
  buildAlternativeItem,
  buildItinerary,
  summariseDraft,
} from '@/services/itineraryGenerator'

const START = '2026-04-01'
/** Inclusive, so this is the 30-day worst case the template bank has to cover. */
const LONG_END = '2026-04-30'

const TRIP: Trip = {
  id: 'trip_generator_fixture',
  userId: 'usr_fixture',
  name: 'Paris in the Spring',
  origin: 'Lagos, Nigeria',
  destination: 'Paris, France',
  destinationId: 'paris',
  startDate: START,
  endDate: LONG_END,
  travelers: 2,
  budget: 2500,
  currency: 'EUR',
  interests: ['culture', 'food'],
  pace: 'packed',
  notes: '',
  status: 'draft',
  createdAt: '2026-03-15T09:30:00.000Z',
  updatedAt: '2026-03-15T09:30:00.000Z',
}

/**
 * A trip saved before the destination catalogue whose typed destination names
 * no catalogue city. It drafts from the generic bank at reference prices.
 */
const UNCATALOGUED: Trip = { ...TRIP, destination: 'Lisbon, Portugal', destinationId: null }

const TIMESTAMP = '2026-03-15T09:30:01.400Z'

/** Ids carry a counter and a random suffix, so compare everything else. */
function project(days: readonly ItineraryDay[]): unknown[] {
  return days.map((day) => ({
    date: day.date,
    index: day.index,
    title: day.title,
    items: day.items.map((item) => ({
      title: item.title,
      category: item.category,
      startTime: item.startTime,
      endTime: item.endTime,
      location: item.location,
      description: item.description,
      estimatedCost: item.estimatedCost,
      currency: item.currency,
      source: item.source,
      editedByUser: item.editedByUser,
    })),
  }))
}

function daysWithInternalDuplicate(days: readonly ItineraryDay[]): string[] {
  return days
    .filter((day) => {
      const titles = day.items.map((item) => item.title)
      return new Set(titles).size !== titles.length
    })
    .map((day) => day.date)
}

describe('buildItinerary', () => {
  it('covers every trip date', () => {
    const days = buildItinerary(TRIP, 0, TIMESTAMP)

    expect(days).toHaveLength(30)
    expect(days.map((day) => day.date)).toEqual(eachDay(START, LONG_END))
  })

  it('never repeats a template inside a single day at the worst case', () => {
    const days = buildItinerary(TRIP, 0, TIMESTAMP)

    expect(daysWithInternalDuplicate(days)).toEqual([])
  })

  it('never repeats a template inside a single day for any variant or pace', () => {
    for (const pace of ['relaxed', 'balanced', 'packed'] as const) {
      for (const variant of [0, 1, 2, 3, 4, 5, 6, 7]) {
        const days = buildItinerary({ ...TRIP, pace }, variant, TIMESTAMP)

        expect(daysWithInternalDuplicate(days), `pace=${pace} variant=${variant}`).toEqual([])
      }
    }
  })

  it('never repeats a template inside a single day for a generic destination', () => {
    const days = buildItinerary(UNCATALOGUED, 0, TIMESTAMP)

    expect(daysWithInternalDuplicate(days)).toEqual([])
  })

  it('stays deterministic for the same trip and variant', () => {
    const first = buildItinerary(TRIP, 0, TIMESTAMP)
    const second = buildItinerary(TRIP, 0, TIMESTAMP)

    expect(project(second)).toEqual(project(first))
  })

  it('stays deterministic for an explicit variant', () => {
    const first = buildItinerary(TRIP, 3, TIMESTAMP)
    const second = buildItinerary(TRIP, 3, TIMESTAMP)

    expect(project(second)).toEqual(project(first))
  })

  it('still fills a long trip rather than running out of stops', () => {
    const days = buildItinerary(TRIP, 0, TIMESTAMP)

    for (const day of days) {
      expect(day.items.length).toBeGreaterThan(0)
    }
    expect(days.reduce((total, day) => total + day.items.length, 0)).toBeGreaterThan(100)
  })
})

/**
 * A generated stop is priced in its destination's currency (Paris in euros,
 * the Eiffel Tower summit at 29), never the trip's own: labelling it with the
 * trip's currency turned a EUR 29 ticket into NGN 29. A trip with no catalogue
 * destination keeps the reference prices, labelled `DRAFT_PRICE_CURRENCY`.
 * Nothing the traveller entered is converted: totals in another currency
 * leave these stops out.
 */
describe('buildItinerary and the currency of a generated stop', () => {
  it('keeps euros as the reference currency of the template bank', () => {
    expect(DRAFT_PRICE_CURRENCY).toBe('EUR')
  })

  it('labels every stop of a EUR trip with the draft price currency', () => {
    for (const day of buildItinerary(TRIP, 0, TIMESTAMP)) {
      for (const item of day.items) {
        expect(item.currency).toBe(DRAFT_PRICE_CURRENCY)
      }
    }
  })

  it('labels every stop with the draft price currency whatever the trip currency', () => {
    for (const currency of ['EUR', 'USD', 'GBP', 'NGN', 'JPY'] as const) {
      const days = buildItinerary({ ...TRIP, currency }, 0, TIMESTAMP)
      const items = days.flatMap((day) => day.items)

      expect(items.length).toBeGreaterThan(0)
      expect(
        items.every((item) => item.currency === DRAFT_PRICE_CURRENCY),
        `currency=${currency}`,
      ).toBe(true)
    }
  })

  it('labels a trip with no catalogue destination the same way', () => {
    const days = buildItinerary({ ...UNCATALOGUED, currency: 'NGN' }, 0, TIMESTAMP)

    expect(days.flatMap((day) => day.items).every((item) => item.currency === DRAFT_PRICE_CURRENCY)).toBe(
      true,
    )
  })

  it('changes nothing at all when only the trip currency changes', () => {
    const asEur = buildItinerary(TRIP, 0, TIMESTAMP)
    const asNgn = buildItinerary({ ...TRIP, currency: 'NGN' }, 0, TIMESTAMP)

    expect(project(asNgn)).toEqual(project(asEur))
  })

  it('leaves euro stops out of a JPY total instead of counting euros as yen', () => {
    const asEur = buildItinerary(TRIP, 0, TIMESTAMP)
    const asJpy = buildItinerary({ ...TRIP, currency: 'JPY' }, 0, TIMESTAMP)

    expect(summariseDraft(asJpy, 'JPY').estimate).toBe(0)
    expect(summariseDraft(asJpy, 'JPY').itemCount).toBe(summariseDraft(asEur).itemCount)
    expect(summariseDraft(asJpy, DRAFT_PRICE_CURRENCY).estimate).toBeGreaterThan(0)
    expect(summariseDraft(asJpy, DRAFT_PRICE_CURRENCY).estimate).toBe(
      summariseDraft(asEur, 'EUR').estimate,
    )
  })

  it('leaves a foreign stop out of a summarised draft', () => {
    const days = buildItinerary(TRIP, 0, TIMESTAMP)
    const foreign: ItineraryDay[] = [
      { ...days[0], items: days[0].items.map((item) => ({ ...item, currency: 'NGN' as const })) },
      ...days.slice(1),
    ]

    expect(summariseDraft(foreign, 'EUR').estimate).toBeLessThan(summariseDraft(days, 'EUR').estimate)
    expect(summariseDraft(foreign, 'EUR').itemCount).toBe(summariseDraft(days, 'EUR').itemCount)
  })
})

describe('buildAlternativeItem and the currency of a swapped stop', () => {
  it('labels the alternative with the draft price currency', () => {
    const days = buildItinerary(TRIP, 0, TIMESTAMP)
    const day = days[1]
    const item = day.items[0]

    const alternative = buildAlternativeItem(TRIP, day, item, 0, TIMESTAMP)

    expect(alternative.currency).toBe(DRAFT_PRICE_CURRENCY)
  })

  it('labels the alternative in euros on a trip in another currency', () => {
    const trip = { ...TRIP, currency: 'NGN' as const }
    const days = buildItinerary(trip, 0, TIMESTAMP)
    const day = days[1]

    const alternative = buildAlternativeItem(trip, day, day.items[0], 0, TIMESTAMP)

    expect(alternative.currency).toBe(DRAFT_PRICE_CURRENCY)
    expect(alternative.source).toBe('ai')
  })

  it('swaps into a day without disturbing how its total is counted', () => {
    const trip = { ...TRIP, currency: 'JPY' as const }
    const days = buildItinerary(trip, 0, TIMESTAMP)
    const day = days[1]
    const original = day.items[0]

    const alternative = buildAlternativeItem(trip, day, original, 0, TIMESTAMP)
    const swapped: ItineraryDay = {
      ...day,
      items: day.items.map((entry) => (entry.id === original.id ? alternative : entry)),
    }

    expect(swapped.items.every((entry) => entry.currency === DRAFT_PRICE_CURRENCY)).toBe(true)
    // Counted in euros like the stops around it, and left out of a yen total.
    const expected = swapped.items.reduce((total, entry) => total + entry.estimatedCost, 0)
    expect(summariseDraft([swapped], DRAFT_PRICE_CURRENCY).estimate).toBeCloseTo(expected, 2)
    expect(summariseDraft([swapped], 'JPY').estimate).toBe(0)
    expect(summariseDraft([swapped], 'JPY').itemCount).toBe(day.items.length)
  })
})

// ---------------------------------------------------------------------------
// The schedule, table-driven: every length and pace the product offers, over
// several variants and destinations (a standalone bank, both landmark banks,
// generic-only catalogue cities and a trip with no catalogue destination),
// with the trip currency rotating so the currency rule is exercised on every
// plan too.
// ---------------------------------------------------------------------------

const LENGTHS = [1, 2, 3, 7, 14, 30] as const
const PACES: readonly TravelPace[] = ['relaxed', 'balanced', 'packed']
const VARIANTS = [0, 1, 2, 5] as const
const CURRENCIES: readonly CurrencyCode[] = ['EUR', 'USD', 'GBP', 'NGN', 'JPY', 'AED']

const GENERIC_EVENING = ['Dinner where the tables are local', 'Evening in the local bar scene']
const GENERIC_ARRIVAL = 'Arrive and settle in'
const GENERIC_DEPARTURE = 'Last look, then head out'

const LONDON_LANDMARKS = [
  'Full English at a neighbourhood café',
  'Tower of London and the Crown Jewels',
  'British Museum, Egyptian galleries and the Great Court',
  'Westminster Abbey',
  'Kew Gardens and the Palm House',
  'Lunch at Borough Market',
  'National Gallery highlights',
  'Hyde Park and Kensington Gardens',
  'Camden Market and the Regent’s Canal',
  'Afternoon tea',
  'South Bank walk to Tower Bridge',
  'London Eye at dusk',
  'A West End show',
  'Historic pubs off Fleet Street',
]

const LAGOS_LANDMARKS = [
  'Akara and pap breakfast',
  'Lekki Conservation Centre canopy walkway',
  'Lagos Island heritage walk and the Brazilian Quarter',
  'Boat to Tarkwa Bay beach',
  'Balogun Market fabric run',
  'Nike Art Gallery',
  'Amala and ewedu at a local buka',
  'Kalakuta Republic Museum',
  'Lekki Arts and Crafts Market',
  'Lekki–Ikoyi Link Bridge at sunset',
  'Evening at Freedom Park',
  'A play at Terra Kulture',
  'Suya supper on Victoria Island',
  'Live Afrobeat at the New Afrika Shrine',
]

/** Anything Parisian that must never appear in a draft for anywhere else. */
const PARIS_ISMS =
  /Paris|Seine|arrondissement|Montmartre|Louvre|Orsay|Eiffel|Métro|€|Versailles|Marais|Saint-Germain|Luxembourg Gardens|Charles de Gaulle|\bCDG\b|Orly|\bRER\b/

interface TableDestination {
  destination: string
  destinationId: string | null
  /** The currency every stop must be priced in, whatever the trip's. */
  currency: CurrencyCode
  /** What local prices are rounded to (`Destination.priceStep`); 1 for reference prices. */
  priceStep: number
  arrival: string
  departure: string
  /** Templates that naturally start at or after 17:00. */
  evening: readonly string[]
  /** Curated stops, at least one of which every plan must contain. */
  landmarks: readonly string[]
}

const DESTINATIONS: readonly TableDestination[] = [
  {
    destination: 'Paris, France',
    destinationId: 'paris',
    currency: 'EUR',
    priceStep: 1,
    arrival: 'Arrive, drop bags, and walk the neighbourhood',
    departure: 'Check out, last coffee, and head for the airport',
    evening: [
      'Eiffel Tower summit slot',
      'Seine cruise from Pont de l’Alma',
      'Evening performance at a small theatre',
      'Natural wine bar crawl',
      'Late set in a cellar jazz club',
    ],
    landmarks: [],
  },
  {
    destination: 'London, United Kingdom',
    destinationId: 'london',
    currency: 'GBP',
    priceStep: 1,
    arrival: 'Arrive via Heathrow or St Pancras and check in',
    departure: 'Check out and head for Heathrow or St Pancras',
    evening: [
      'London Eye at dusk',
      'A West End show',
      'Historic pubs off Fleet Street',
      'Dinner where the tables are local',
    ],
    landmarks: LONDON_LANDMARKS,
  },
  {
    destination: 'Lagos, Nigeria',
    destinationId: 'lagos',
    currency: 'NGN',
    priceStep: 500,
    arrival: 'Arrive at Murtala Muhammed Airport and check in',
    departure: 'Check out and head for Murtala Muhammed Airport',
    evening: [
      'Lekki–Ikoyi Link Bridge at sunset',
      'Evening at Freedom Park',
      'A play at Terra Kulture',
      'Suya supper on Victoria Island',
      'Live Afrobeat at the New Afrika Shrine',
      'Dinner where the tables are local',
    ],
    landmarks: LAGOS_LANDMARKS,
  },
  {
    destination: 'Tokyo, Japan',
    destinationId: 'tokyo',
    currency: 'JPY',
    priceStep: 100,
    arrival: GENERIC_ARRIVAL,
    departure: GENERIC_DEPARTURE,
    evening: GENERIC_EVENING,
    landmarks: [],
  },
  {
    destination: 'Dubai, United Arab Emirates',
    destinationId: 'dubai',
    currency: 'AED',
    priceStep: 5,
    arrival: GENERIC_ARRIVAL,
    departure: GENERIC_DEPARTURE,
    evening: GENERIC_EVENING,
    landmarks: [],
  },
  {
    destination: 'New York, United States',
    destinationId: 'new-york',
    currency: 'USD',
    priceStep: 1,
    arrival: GENERIC_ARRIVAL,
    departure: GENERIC_DEPARTURE,
    evening: GENERIC_EVENING,
    landmarks: [],
  },
  {
    destination: 'Lisbon, Portugal',
    destinationId: null,
    currency: DRAFT_PRICE_CURRENCY,
    priceStep: 1,
    arrival: GENERIC_ARRIVAL,
    departure: GENERIC_DEPARTURE,
    evening: GENERIC_EVENING,
    landmarks: [],
  },
]

/** Every stop that is about getting to or from the airport, in any bank. */
const TRAVEL_STOPS = new Set<string>([
  ...DESTINATIONS.flatMap(({ arrival, departure }) => [arrival, departure]),
  'Airport transfer and check-in',
])

const EVENING = 17 * 60

interface PlanCase {
  label: string
  trip: Trip
  variant: number
  length: number
  place: TableDestination
  arrival: string
  departure: string
  evening: ReadonlySet<string>
}

const CASES: PlanCase[] = DESTINATIONS.flatMap((place) =>
  LENGTHS.flatMap((length) =>
    PACES.flatMap((pace) =>
      VARIANTS.map((variant, index): PlanCase => ({
        label: `${place.destination} ${String(length)}d ${pace} v${String(variant)}`,
        trip: {
          ...TRIP,
          id: `trip_table_${place.destination.slice(0, 5)}_${String(length)}_${pace}`,
          destination: place.destination,
          destinationId: place.destinationId,
          startDate: START,
          endDate: addDays(START, length - 1),
          pace,
          currency: CURRENCIES[(length + index) % CURRENCIES.length],
        },
        variant,
        length,
        place,
        arrival: place.arrival,
        departure: place.departure,
        evening: new Set<string>(place.evening),
      })),
    ),
  ),
)

const PLANS = CASES.map((entry) => ({ ...entry, days: buildItinerary(entry.trip, entry.variant, TIMESTAMP) }))

function startOf(item: ItineraryItem): number {
  return timeToMinutes(item.startTime)
}

function endOf(item: ItineraryItem): number {
  return timeToMinutes(item.endTime ?? '')
}

/** Every broken timing rule in a plan, as readable strings. */
function timingViolations(days: readonly ItineraryDay[]): string[] {
  const found: string[] = []
  for (const day of days) {
    day.items.forEach((item, index) => {
      const where = `day ${String(day.index)} ${item.startTime} ${item.title}`
      if (!isValidTime(item.startTime)) found.push(`${where}: invalid start`)
      if (item.endTime === null || !isValidTime(item.endTime)) {
        found.push(`${where}: invalid end ${String(item.endTime)}`)
        return
      }
      if (endOf(item) <= startOf(item)) found.push(`${where}: ends ${item.endTime}, not after it starts`)
      const previous = day.items[index - 1]
      if (previous && startOf(item) < endOf(previous)) {
        found.push(`${where}: starts before ${previous.title} ends at ${String(previous.endTime)}`)
      }
      if (previous && startOf(item) < startOf(previous)) found.push(`${where}: out of order`)
    })
  }
  return found
}

describe('the draft schedule', () => {
  it('builds every combination in the table', () => {
    expect(PLANS).toHaveLength(DESTINATIONS.length * LENGTHS.length * PACES.length * VARIANTS.length)
    for (const plan of PLANS) {
      expect(plan.days, plan.label).toHaveLength(plan.length)
      for (const day of plan.days) expect(day.items.length, plan.label).toBeGreaterThan(0)
    }
  })

  it('prices every stop in the destination currency, whatever the trip currency', () => {
    for (const plan of PLANS) {
      const labels = new Set(plan.days.flatMap((day) => day.items.map((item) => item.currency)))

      expect([...labels], `${plan.label} (${plan.trip.currency})`).toEqual([plan.place.currency])
    }
  })

  it('rounds every price to the destination price step, and JPY to whole yen', () => {
    for (const plan of PLANS) {
      const off = plan.days
        .flatMap((day) => day.items)
        .filter(
          (item) =>
            !Number.isInteger(item.estimatedCost) ||
            item.estimatedCost < 0 ||
            item.estimatedCost % plan.place.priceStep !== 0,
        )
        .map((item) => `${item.title} ${String(item.estimatedCost)}`)

      expect(off, plan.label).toEqual([])
    }
  })

  it('never puts anything Parisian in a plan for anywhere else', () => {
    for (const plan of PLANS.filter((entry) => entry.place.destinationId !== 'paris')) {
      const parisian = plan.days
        .flatMap((day) => day.items)
        .filter((item) => PARIS_ISMS.test(`${item.title} ${item.location} ${item.description}`))
        .map((item) => `${item.title} @ ${item.location}`)

      expect(parisian, plan.label).toEqual([])
    }
  })

  it('includes at least one curated landmark in every London and Lagos plan', () => {
    for (const plan of PLANS.filter((entry) => entry.place.landmarks.length > 0)) {
      const landmarks = new Set(plan.place.landmarks)
      const titles = plan.days.flatMap((day) => day.items.map((item) => item.title))

      expect(titles.some((title) => landmarks.has(title)), plan.label).toBe(true)
    }
  })

  it('never overlaps, never ends before it starts and never runs past 23:59', () => {
    for (const plan of PLANS) {
      expect(timingViolations(plan.days), plan.label).toEqual([])
    }
  })

  it('keeps nightlife and other evening stops in the evening', () => {
    for (const plan of PLANS) {
      const early = plan.days
        .flatMap((day) => day.items)
        .filter((item) => (item.category === 'nightlife' || plan.evening.has(item.title)) && startOf(item) < EVENING)
        .map((item) => `${item.startTime} ${item.title}`)

      expect(early, plan.label).toEqual([])
    }
  })

  it('actually schedules evenings rather than ending every day by mid-afternoon', () => {
    const days = PLANS.flatMap((plan) => plan.days)
    const withEvening = days.filter((day) => day.items.some((item) => startOf(item) >= EVENING))

    expect(withEvening.length / days.length).toBeGreaterThan(0.4)
  })

  it('opens day one with the arrival and closes the final day with the departure', () => {
    for (const plan of PLANS) {
      const first = plan.days[0].items
      const last = plan.days[plan.days.length - 1].items

      expect(first[0]?.title, plan.label).toBe(plan.arrival)
      expect(last[last.length - 1]?.title, plan.label).toBe(plan.departure)
    }
  })

  it('gives a one-day trip both an arrival first and a departure last', () => {
    for (const plan of PLANS.filter((entry) => entry.length === 1)) {
      const titles = plan.days[0].items.map((item) => item.title)

      expect(titles[0], plan.label).toBe(plan.arrival)
      expect(titles[titles.length - 1], plan.label).toBe(plan.departure)
      expect(titles.length, plan.label).toBeGreaterThan(2)
    }
  })

  it('never puts an arrival, transfer or departure anywhere else', () => {
    for (const plan of PLANS) {
      const lastIndex = plan.days.length - 1
      const misplaced = plan.days.flatMap((day, dayIndex) =>
        day.items
          .filter((item, itemIndex) => {
            if (!TRAVEL_STOPS.has(item.title) && item.category !== 'transit') return false
            const isOpeningArrival = dayIndex === 0 && itemIndex === 0 && item.title === plan.arrival
            const isClosingDeparture =
              dayIndex === lastIndex && itemIndex === day.items.length - 1 && item.title === plan.departure
            return !isOpeningArrival && !isClosingDeparture
          })
          .map((item) => `day ${String(day.index)}: ${item.title}`),
      )

      expect(misplaced, plan.label).toEqual([])
    }
  })

  /**
   * Every bank holds at least twice the busiest day's ordinary stops (18 in
   * Paris, 20 in London, 19 in Lagos, 10 generic, against at most 5 a day), so
   * no pair of adjacent days ever needs to share a stop.
   */
  it('never repeats a stop on two adjacent days', () => {
    for (const plan of PLANS) {
      const repeats = plan.days.slice(1).flatMap((day, index) => {
        const yesterday = new Set(plan.days[index].items.map((item) => item.title))
        return day.items
          .filter((item) => yesterday.has(item.title))
          .map((item) => `days ${String(index + 1)}-${String(day.index)}: ${item.title}`)
      })

      expect(repeats, plan.label).toEqual([])
    }
  })

  it('keeps the packed pace busier than the relaxed one', () => {
    const perDay = (pace: TravelPace): number => {
      const days = PLANS.filter((plan) => plan.trip.pace === pace).flatMap((plan) => plan.days)
      return days.reduce((total, day) => total + day.items.length, 0) / days.length
    }

    expect(perDay('packed')).toBeGreaterThan(perDay('balanced'))
    expect(perDay('balanced')).toBeGreaterThan(perDay('relaxed'))
  })

  it('produces the same content for the same trip and variant', () => {
    for (const plan of PLANS) {
      expect(project(buildItinerary(plan.trip, plan.variant, TIMESTAMP)), plan.label).toEqual(
        project(plan.days),
      )
    }
  })

  it('produces the same content from a fresh module instance with a fresh id counter', async () => {
    vi.resetModules()
    const fresh = await import('@/services/itineraryGenerator')

    for (const plan of PLANS.filter((entry) => entry.variant === 0)) {
      const again = fresh.buildItinerary(plan.trip, plan.variant, TIMESTAMP)

      expect(again[0].items[0].id).not.toBe(plan.days[0].items[0].id)
      expect(project(again), plan.label).toEqual(project(plan.days))
    }
  })
})

/** Each generated stop's duration, keyed by title; the same title always takes as long. */
function generatedDurations(): Map<string, number> {
  const durations = new Map<string, number>()
  for (const plan of PLANS) {
    for (const item of plan.days.flatMap((day) => day.items)) {
      const minutes = endOf(item) - startOf(item)
      const known = durations.get(item.title)
      if (known !== undefined && known !== minutes) {
        throw new Error(`${item.title} runs ${String(known)} and ${String(minutes)} minutes`)
      }
      durations.set(item.title, minutes)
    }
  }
  return durations
}

describe('buildAlternativeItem suggestions', () => {
  const durations = generatedDurations()
  const swaps = PLANS.flatMap((plan) =>
    plan.days.flatMap((day) =>
      day.items.map((item) => ({
        plan,
        day,
        item,
        alternative: buildAlternativeItem(plan.trip, day, item, plan.variant, TIMESTAMP),
      })),
    ),
  )

  it('gives every generated stop a single, fixed duration', () => {
    expect(durations.size).toBeGreaterThan(20)
  })

  it('never suggests a stop that is already on that day', () => {
    const duplicates = swaps
      .filter(({ day, alternative }) => day.items.some((other) => other.title === alternative.title))
      .map(({ plan, day, item, alternative }) => `${plan.label} day ${String(day.index)}: ${item.title} -> ${alternative.title}`)

    expect(duplicates.slice(0, 5)).toEqual([])
  })

  it('never suggests an arrival, transfer or departure', () => {
    const airport = swaps
      .filter(({ alternative }) => TRAVEL_STOPS.has(alternative.title) || alternative.category === 'transit')
      .map(({ plan, item, alternative }) => `${plan.label}: ${item.title} -> ${alternative.title}`)

    expect(airport.slice(0, 5)).toEqual([])
  })

  it('never offers another airport stop in place of the arrival, for any variant', () => {
    for (const plan of PLANS.filter((entry) => entry.variant === 0)) {
      const day = plan.days[0]
      const arrival = day.items[0]
      for (let variant = 0; variant < 50; variant += 1) {
        const alternative = buildAlternativeItem(plan.trip, day, arrival, variant, TIMESTAMP)

        expect(TRAVEL_STOPS.has(alternative.title), `${plan.label} v${String(variant)}`).toBe(false)
      }
    }
  })

  it('keeps the start and ends when the new stop does, not when the old one did', () => {
    const wrong = swaps
      .filter(({ item, alternative }) => {
        const minutes = durations.get(alternative.title)
        return (
          alternative.startTime !== item.startTime ||
          alternative.endTime === null ||
          minutes === undefined ||
          endOf(alternative) - startOf(alternative) !== minutes
        )
      })
      .map(({ plan, item, alternative }) =>
        `${plan.label}: ${item.title} ${item.startTime}-${String(item.endTime)} -> ${alternative.title} ${alternative.startTime}-${String(alternative.endTime)}`,
      )

    expect(wrong.slice(0, 5)).toEqual([])
  })

  it('prices every alternative in the destination currency, on its price step', () => {
    const wrong = swaps
      .filter(
        ({ plan, alternative }) =>
          alternative.currency !== plan.place.currency ||
          !Number.isInteger(alternative.estimatedCost) ||
          alternative.estimatedCost % plan.place.priceStep !== 0,
      )
      .map(({ plan, alternative }) => `${plan.label}: ${alternative.title} ${String(alternative.estimatedCost)} ${alternative.currency}`)

    expect(wrong.slice(0, 5)).toEqual([])
  })

  it('never suggests a Parisian stop for anywhere else', () => {
    const parisian = swaps
      .filter(
        ({ plan, alternative }) =>
          plan.place.destinationId !== 'paris' &&
          PARIS_ISMS.test(`${alternative.title} ${alternative.location} ${alternative.description}`),
      )
      .map(({ plan, alternative }) => `${plan.label}: ${alternative.title}`)

    expect(parisian.slice(0, 5)).toEqual([])
  })

  it('suggests the same stop for the same day, item and variant', () => {
    for (const { plan, day, item, alternative } of swaps.slice(0, 200)) {
      const again = buildAlternativeItem(plan.trip, day, item, plan.variant, TIMESTAMP)

      expect(again.title).toBe(alternative.title)
      expect(again.startTime).toBe(alternative.startTime)
      expect(again.endTime).toBe(alternative.endTime)
    }
  })

  it('suggests the same stop when the same plan was generated with different ids', () => {
    const plan = PLANS.find((entry) => entry.length === 7 && entry.trip.pace === 'packed')
    if (!plan) throw new Error('the table has no 7-day packed plan')
    const regenerated = buildItinerary(plan.trip, plan.variant, TIMESTAMP)

    plan.days.forEach((day, dayIndex) => {
      day.items.forEach((item, itemIndex) => {
        const twin = regenerated[dayIndex].items[itemIndex]
        expect(twin.id).not.toBe(item.id)

        const first = buildAlternativeItem(plan.trip, day, item, 1, TIMESTAMP)
        const second = buildAlternativeItem(plan.trip, regenerated[dayIndex], twin, 1, TIMESTAMP)
        expect(second.title).toBe(first.title)
      })
    })
  })
})

// ---------------------------------------------------------------------------
// Where a trip is comes from `destinationId`, never from the typed text. The
// text used to be searched for "paris", so a London trip got the Paris guide
// and every other trip got Paris-level euro prices.
// ---------------------------------------------------------------------------

describe('drafting by destination id', () => {
  const titlesOn = (days: readonly ItineraryDay[]): string[][] =>
    days.map((day) => day.items.map((item) => `${item.startTime} ${item.title}`))

  /**
   * Captured from the generator before drafting moved to destination ids: a
   * Paris trip must draft exactly as it did. (A full before/after comparison
   * over every length, pace and variant, swaps included, was byte-identical
   * when the change was made; these rows keep it pinned.)
   */
  it('drafts Paris exactly as before', () => {
    const days = buildItinerary(TRIP, 0, TIMESTAMP)

    expect(titlesOn(days.slice(0, 3))).toEqual([
      [
        '15:00 Arrive, drop bags, and walk the neighbourhood',
        '16:45 Atelier visit: a working studio',
        '19:00 Eiffel Tower summit slot',
      ],
      [
        '08:00 Montmartre before the crowds',
        '10:15 Flat white and a pastry on a terrace',
        '12:30 Market picnic in a park',
        '14:00 Long lunch at a classic bistro',
      ],
      [
        '08:00 Market breakfast and produce run',
        '09:30 Louvre Museum, Denon wing highlights',
        '11:45 Musée d’Orsay, impressionist floor',
        '18:00 Seine cruise from Pont de l’Alma',
        '20:00 Natural wine bar crawl',
      ],
    ])
    expect(days[0].items.map((item) => item.estimatedCost)).toEqual([12, 35, 29])

    const short = buildItinerary({ ...TRIP, endDate: '2026-04-03', pace: 'balanced' }, 1, TIMESTAMP)
    expect(titlesOn(short)).toEqual([
      ['15:00 Arrive, drop bags, and walk the neighbourhood', '16:45 Atelier visit: a working studio'],
      [
        '08:00 Montmartre before the crowds',
        '10:15 Musée d’Orsay, impressionist floor',
        '12:30 Market picnic in a park',
        '17:00 Eiffel Tower summit slot',
      ],
      [
        '08:30 Flat white and a pastry on a terrace',
        '09:45 Check out, last coffee, and head for the airport',
      ],
    ])
    expect(short.flatMap((day) => day.items).every((item) => item.currency === 'EUR')).toBe(true)

    const swap = buildAlternativeItem(TRIP, days[1], days[1].items[0], 0, TIMESTAMP)
    expect([swap.title, swap.startTime, swap.endTime, swap.currency]).toEqual([
      'Le Marais courtyards and galleries',
      '08:00',
      '10:00',
      'EUR',
    ])
  })

  it('drafts a London trip as London even when its text says Paris', () => {
    const trip: Trip = {
      ...TRIP,
      name: 'Paris in the Spring',
      destination: 'Paris, France',
      destinationId: 'london',
      endDate: '2026-04-07',
    }
    const days = buildItinerary(trip, 0, TIMESTAMP)
    const items = days.flatMap((day) => day.items)
    const landmarks = new Set(LONDON_LANDMARKS)

    expect(items[0].title).toBe('Arrive via Heathrow or St Pancras and check in')
    expect(items[items.length - 1].title).toBe('Check out and head for Heathrow or St Pancras')
    expect(items.filter((item) => landmarks.has(item.title)).length).toBeGreaterThan(5)
    expect(items.every((item) => item.currency === 'GBP')).toBe(true)
    expect(
      items.filter((item) => PARIS_ISMS.test(`${item.title} ${item.location} ${item.description}`)),
    ).toEqual([])

    for (const day of days) {
      for (const item of day.items) {
        const swap = buildAlternativeItem(trip, day, item, 3, TIMESTAMP)
        expect(swap.currency).toBe('GBP')
        expect(PARIS_ISMS.test(`${swap.title} ${swap.location} ${swap.description}`), swap.title).toBe(false)
      }
    }
  })

  it('drafts a Paris trip as Paris even when its text says London', () => {
    const days = buildItinerary({ ...TRIP, destination: 'London, United Kingdom' }, 0, TIMESTAMP)

    expect(project(days)).toEqual(project(buildItinerary(TRIP, 0, TIMESTAMP)))
  })

  it('drafts a trip with no catalogue destination generically, in reference euros, whatever its text', () => {
    const asLondon = buildItinerary(
      { ...UNCATALOGUED, destination: 'London, United Kingdom', currency: 'GBP' },
      0,
      TIMESTAMP,
    )
    const asLisbon = buildItinerary(UNCATALOGUED, 0, TIMESTAMP)
    const items = asLondon.flatMap((day) => day.items)
    const landmarks = new Set(LONDON_LANDMARKS)

    // The text is not read at all: the same trip under another name is the same plan.
    expect(project(asLondon)).toEqual(project(asLisbon))
    expect(items.every((item) => item.currency === DRAFT_PRICE_CURRENCY)).toBe(true)
    expect(items[0].title).toBe(GENERIC_ARRIVAL)
    // Nothing names a city, London or otherwise.
    expect(
      items.filter((item) => /London|Heathrow|Paris/.test(`${item.title} ${item.location} ${item.description}`)),
    ).toEqual([])
    expect(items.some((item) => landmarks.has(item.title))).toBe(false)
  })

  it('names the city in generic locations for a catalogue destination', () => {
    const days = buildItinerary({ ...TRIP, destinationId: 'tokyo', destination: 'Tokyo, Japan' }, 0, TIMESTAMP)
    const items = days.flatMap((day) => day.items)

    expect(items.length).toBeGreaterThan(50)
    expect(items.filter((item) => !item.location.includes('Tokyo')).map((item) => item.location)).toEqual([])
  })

  /**
   * Generic reference prices scaled by the destination's price level and
   * rounded to its step: breakfast (12), market lunch (16), museum (18),
   * dinner (30), and the old town walk, which stays free.
   */
  it('converts generic reference prices into local estimates on the price step', () => {
    const expected: Record<string, Record<string, number>> = {
      tokyo: {
        'Breakfast where the locals eat': 1800,
        'Covered market lunch': 2400,
        'City museum, highlights floor': 2700,
        'Old town walking loop': 0,
      },
      dubai: {
        'Breakfast where the locals eat': 55,
        'Covered market lunch': 70,
        'City museum, highlights floor': 80,
      },
      'new-york': {
        'Breakfast where the locals eat': 14,
        'Covered market lunch': 19,
        'City museum, highlights floor': 22,
      },
      lagos: { 'City museum, highlights floor': 16000, 'Dinner where the tables are local': 27000 },
      london: { 'Dinner where the tables are local': 27, 'Old town walking loop': 0 },
    }

    for (const [destinationId, prices] of Object.entries(expected)) {
      const seen = new Map<string, Set<number>>()
      for (const variant of [0, 1, 2, 3]) {
        const trip: Trip = { ...TRIP, destinationId, interests: [] }
        for (const item of buildItinerary(trip, variant, TIMESTAMP).flatMap((day) => day.items)) {
          if (!(item.title in prices)) continue
          seen.set(item.title, (seen.get(item.title) ?? new Set<number>()).add(item.estimatedCost))
        }
      }

      for (const [title, price] of Object.entries(prices)) {
        expect([...(seen.get(title) ?? [])], `${destinationId}: ${title}`).toEqual([price])
      }
    }
  })

  it('opens and closes a one-day London or Lagos trip on its own airports, with a landmark between', () => {
    for (const place of DESTINATIONS.filter((entry) => entry.landmarks.length > 0)) {
      for (const variant of [0, 1, 2, 3, 4, 5, 6, 7]) {
        const label = `${place.destination} v${String(variant)}`
        const trip: Trip = {
          ...TRIP,
          destinationId: place.destinationId,
          startDate: START,
          endDate: START,
          pace: 'relaxed',
        }
        const titles = buildItinerary(trip, variant, TIMESTAMP)[0].items.map((item) => item.title)

        expect(titles[0], label).toBe(place.arrival)
        expect(titles[titles.length - 1], label).toBe(place.departure)
        expect(titles.some((title) => place.landmarks.includes(title)), label).toBe(true)
      }
    }
  })
})
