import { describe, expect, it, vi } from 'vitest'
import { addDays, eachDay, isValidTime, timeToMinutes } from '@/domain/format'
import type { CurrencyCode, ItineraryDay, ItineraryItem, TravelPace, Trip } from '@/domain/types'
import {
  ANCHOR_SWAP_MESSAGE,
  AnchorSwapError,
  DEPARTURE_START_TIME,
  DRAFT_PRICE_CURRENCY,
  FINAL_DAY_BUFFER_MINUTES,
  NO_ALTERNATIVE_BEFORE_DEPARTURE_MESSAGE,
  buildAlternativeItem,
  buildItinerary,
  isTravelAnchor,
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
// several variants and every destination (the three curated banks, all five
// general catalogue cities and a trip with no catalogue destination), with the
// trip currency rotating so the currency rule is exercised on every plan too.
// ---------------------------------------------------------------------------

const LENGTHS = [1, 2, 3, 7, 14, 30] as const
const PACES: readonly TravelPace[] = ['relaxed', 'balanced', 'packed']
const VARIANTS = [0, 1, 2, 5] as const
const CURRENCIES: readonly CurrencyCode[] = ['EUR', 'USD', 'GBP', 'NGN', 'JPY', 'AED']

/**
 * Every ordinary stop of the generic bank. None of them may appear in a
 * curated city's plan, and nothing else may appear in a general one.
 */
const GENERIC_STOPS = [
  'Café breakfast near where you are staying',
  'Early walk around your neighbourhood',
  'Self-guided walk through a historic district',
  'A major museum, highlights only',
  'A neighbourhood food market for lunch',
  'A viewpoint over the city',
  'A walk in a city park',
  'Browsing independent shops',
  'Dinner at a neighbourhood restaurant',
  'An evening out for drinks or live music',
  'Half day out of the city',
]
const GENERIC_EVENING = ['Dinner at a neighbourhood restaurant', 'An evening out for drinks or live music']
const GENERIC_ARRIVAL = 'Arrive and settle in'
const GENERIC_DEPARTURE = 'Last look, then head out'

const PARIS_STOPS = [
  'Café crème and a croissant on a Saint-Germain terrace',
  'Louvre Museum, Denon wing highlights',
  'Musée d’Orsay, impressionist floor',
  'Eiffel Tower summit slot',
  'Le Marais courtyards and galleries',
  'Montmartre before the crowds',
  'Market breakfast and produce run',
  'Long lunch at a classic bistro',
  'Seine cruise from Pont de l’Alma',
  'Versailles, palace and gardens',
  'Canal Saint-Martin towpath walk',
  'Luxembourg Gardens and the Medici Fountain',
  'Musée de l’Orangerie and Monet’s Water Lilies',
  'Natural wine bar crawl',
  'Opera or ballet at the Palais Garnier',
  'Design and vintage shops in the upper Marais',
  'The covered passages, Galerie Vivienne to Passage Jouffroy',
  'Picnic lunch at the Square du Vert-Galant',
  'Swing and jazz at Le Caveau de la Huchette',
  'Notre-Dame Cathedral',
  'Sainte-Chapelle and its stained glass',
  'Père Lachaise Cemetery',
  'Arc de Triomphe rooftop at dusk',
]

const LONDON_STOPS = [
  'Morning walk up Primrose Hill',
  'Beigels on Brick Lane',
  'Tower of London and the Crown Jewels',
  'St Paul’s Cathedral and the Whispering Gallery',
  'British Museum, Egyptian galleries and the Great Court',
  'Westminster Abbey',
  'Natural History Museum',
  'Kew Gardens and the Palm House',
  'Greenwich, the Royal Observatory and the park',
  'Changing the Guard at Buckingham Palace',
  'Portobello Road Market',
  'Lunch at Borough Market',
  'Dim sum in Chinatown',
  'Tate Modern and the Turbine Hall',
  'National Gallery highlights',
  'Regent’s Park and Queen Mary’s Rose Garden',
  'Hyde Park and Kensington Gardens',
  'Camden Market and the Regent’s Canal',
  'Covent Garden and Neal’s Yard',
  'Afternoon tea in Mayfair',
  'South Bank walk to Tower Bridge',
  'London Eye at dusk',
  'Curry on Brick Lane',
  'A West End show',
  'A play at Shakespeare’s Globe',
  'Live jazz at Ronnie Scott’s',
  'Historic pubs off Fleet Street',
]

const LAGOS_STOPS = [
  'Akara and pap breakfast',
  'Lekki Conservation Centre canopy walkway',
  'Lagos Island heritage walk and the Brazilian Quarter',
  'Boat to Tarkwa Bay beach',
  'Day trip to Badagry and the Point of No Return',
  'National Museum Lagos',
  'Balogun Market fabric run',
  'Nike Art Gallery',
  'Books and records at the Jazzhole',
  'Amala and ewedu at a local buka',
  'Ofada rice and ayamase for lunch',
  'Kalakuta Republic Museum',
  'An afternoon at Landmark Beach',
  'Art Twenty One gallery',
  'Lekki Arts and Crafts Market',
  'Lekki–Ikoyi Link Bridge at sunset',
  'Evening at Freedom Park',
  'A play at Terra Kulture',
  'Suya supper on Victoria Island',
  'Live music at Bogobiri House',
  'Live Afrobeat at the New Afrika Shrine',
]

/** Anything Parisian that must never appear in a draft for anywhere else. */
const PARIS_ISMS =
  /Paris|Seine|arrondissement|Montmartre|Louvre|Orsay|Eiffel|Métro|€|Versailles|Marais|Saint-Germain|Luxembourg Gardens|Charles de Gaulle|\bCDG\b|Orly|\bRER\b/

interface TableDestination {
  destination: string
  destinationId: string | null
  /** The city a general destination's locations must name; null for no catalogue city. */
  city: string | null
  /** The currency every stop must be priced in, whatever the trip's. */
  currency: CurrencyCode
  /** What local prices are rounded to (`Destination.priceStep`); 1 for reference prices. */
  priceStep: number
  arrival: string
  departure: string
  /** Templates that naturally start at or after 17:00. */
  evening: readonly string[]
  /** Every ordinary stop a plan may contain: the city's own bank, or the generic one. */
  stops: readonly string[]
  curated: boolean
}

function general(
  destination: string,
  destinationId: string | null,
  city: string | null,
  currency: CurrencyCode,
  priceStep: number,
): TableDestination {
  return {
    destination,
    destinationId,
    city,
    currency,
    priceStep,
    arrival: GENERIC_ARRIVAL,
    departure: GENERIC_DEPARTURE,
    evening: GENERIC_EVENING,
    stops: GENERIC_STOPS,
    curated: false,
  }
}

const DESTINATIONS: readonly TableDestination[] = [
  {
    destination: 'Paris, France',
    destinationId: 'paris',
    city: 'Paris',
    currency: 'EUR',
    priceStep: 1,
    arrival: 'Arrive, drop bags, and walk the neighbourhood',
    departure: 'Check out, last coffee, and head for the airport',
    evening: [
      'Eiffel Tower summit slot',
      'Seine cruise from Pont de l’Alma',
      'Opera or ballet at the Palais Garnier',
      'Natural wine bar crawl',
      'Swing and jazz at Le Caveau de la Huchette',
      'Arc de Triomphe rooftop at dusk',
    ],
    stops: PARIS_STOPS,
    curated: true,
  },
  {
    destination: 'London, United Kingdom',
    destinationId: 'london',
    city: 'London',
    currency: 'GBP',
    priceStep: 1,
    arrival: 'Arrive via Heathrow or St Pancras and check in',
    departure: 'Check out and head for Heathrow or St Pancras',
    evening: [
      'London Eye at dusk',
      'Curry on Brick Lane',
      'A West End show',
      'A play at Shakespeare’s Globe',
      'Live jazz at Ronnie Scott’s',
      'Historic pubs off Fleet Street',
    ],
    stops: LONDON_STOPS,
    curated: true,
  },
  {
    destination: 'Lagos, Nigeria',
    destinationId: 'lagos',
    city: 'Lagos',
    currency: 'NGN',
    priceStep: 500,
    arrival: 'Arrive at Murtala Muhammed Airport and check in',
    departure: 'Check out and head for Murtala Muhammed Airport',
    evening: [
      'Lekki–Ikoyi Link Bridge at sunset',
      'Evening at Freedom Park',
      'A play at Terra Kulture',
      'Suya supper on Victoria Island',
      'Live music at Bogobiri House',
      'Live Afrobeat at the New Afrika Shrine',
    ],
    stops: LAGOS_STOPS,
    curated: true,
  },
  general('New York, United States', 'new-york', 'New York', 'USD', 1),
  general('Tokyo, Japan', 'tokyo', 'Tokyo', 'JPY', 100),
  general('Dubai, United Arab Emirates', 'dubai', 'Dubai', 'AED', 5),
  general('Rome, Italy', 'rome', 'Rome', 'EUR', 1),
  general('Barcelona, Spain', 'barcelona', 'Barcelona', 'EUR', 1),
  general('Lisbon, Portugal', null, null, DRAFT_PRICE_CURRENCY, 1),
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

  /**
   * A curated city's plan is that city throughout: no "walk in a city park"
   * in London when Hyde Park is in the bank. A general destination's plan is
   * the generic bank throughout, so it never names a venue it cannot vouch for.
   */
  it('draws every ordinary stop from the destination’s own bank, and a curated one never from the generic bank', () => {
    const generic = new Set(GENERIC_STOPS)
    for (const plan of PLANS) {
      const allowed = new Set(plan.place.stops)
      const ordinary = plan.days.flatMap((day) => day.items).filter((item) => !isTravelAnchor(item))
      const foreign = ordinary.filter((item) => !allowed.has(item.title)).map((item) => item.title)
      const genericInCurated = plan.place.curated
        ? ordinary.filter((item) => generic.has(item.title)).map((item) => item.title)
        : []

      expect(foreign, plan.label).toEqual([])
      expect(genericInCurated, plan.label).toEqual([])
    }
  })

  it('names the city in every location of a general destination, and no city without one', () => {
    for (const plan of PLANS.filter((entry) => !entry.place.curated)) {
      const locations = plan.days.flatMap((day) => day.items.map((item) => item.location))
      const { city } = plan.place

      if (city === null) {
        expect(
          locations.filter((location) => /Paris|London|Lagos|Lisbon|Tokyo/.test(location)),
          plan.label,
        ).toEqual([])
      } else {
        expect(
          locations.filter((location) => !location.includes(city)),
          plan.label,
        ).toEqual([])
      }
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

  it('gives a one-day trip an arrival first, a departure last, and a stop between', () => {
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
   * Every bank holds at least twice the busiest day's ordinary stops (23 in
   * Paris, 27 in London, 21 in Lagos, 11 generic, against at most 5 a day), so
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

  it('never serves the same meal twice in a day', () => {
    const meals = [/lunch|Lunch|Dim sum|buka/, /breakfast|Beigels|croissant/]
    for (const plan of PLANS) {
      const doubled = plan.days
        .filter((day) =>
          meals.some((meal) => day.items.filter((item) => !isTravelAnchor(item) && meal.test(item.title)).length > 1),
        )
        .map((day) => `day ${String(day.index)}: ${day.items.map((item) => item.title).join(' / ')}`)

      expect(doubled, plan.label).toEqual([])
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

// ---------------------------------------------------------------------------
// The final day. The departure is a fixed point at `DEPARTURE_START_TIME`; an
// ordinary stop on the last day must end `FINAL_DAY_BUFFER_MINUTES` before it,
// and nothing ever follows it. It used to go wherever the day's last stop
// ended, so a last day could read "19:30 dinner, 21:45 check out".
// ---------------------------------------------------------------------------

describe('the final day and the departure', () => {
  const finalDays = PLANS.map((plan) => ({ plan, day: plan.days[plan.days.length - 1] }))

  it('models the departure at noon with a ninety-minute buffer before it', () => {
    expect(DEPARTURE_START_TIME).toBe('12:00')
    expect(FINAL_DAY_BUFFER_MINUTES).toBe(90)
  })

  it('always closes the final day with the departure, at the modelled time', () => {
    for (const { plan, day } of finalDays) {
      const departure = day.items[day.items.length - 1]

      expect(departure.role, plan.label).toBe('departure')
      expect(departure.title, plan.label).toBe(plan.departure)
      expect(departure.startTime, plan.label).toBe(DEPARTURE_START_TIME)
    }
  })

  it('starts nothing at or after the departure', () => {
    for (const { plan, day } of finalDays) {
      const departure = day.items[day.items.length - 1]
      const late = day.items
        .slice(0, -1)
        .filter((item) => startOf(item) >= startOf(departure))
        .map((item) => `${item.startTime} ${item.title}`)

      expect(late, plan.label).toEqual([])
    }
  })

  it('ends every ordinary final-day stop at least the buffer before the departure', () => {
    for (const { plan, day } of finalDays) {
      const departure = day.items[day.items.length - 1]
      const tight = day.items
        .filter((item) => !isTravelAnchor(item))
        .filter((item) => endOf(item) > startOf(departure) - FINAL_DAY_BUFFER_MINUTES)
        .map((item) => `${item.startTime}-${String(item.endTime)} ${item.title}`)

      expect(tight, plan.label).toEqual([])
    }
  })

  it('usually still leaves time for one last stop on the final morning', () => {
    const withStop = finalDays.filter(({ day }) => day.items.some((item) => !isTravelAnchor(item)))

    expect(withStop.length / finalDays.length).toBeGreaterThan(0.85)
  })

  it('starts day one’s other stops only after the arrival is done', () => {
    for (const plan of PLANS) {
      const [arrival, ...rest] = plan.days[0].items
      const early = rest
        .filter((item) => !isTravelAnchor(item) && startOf(item) < endOf(arrival) + 15)
        .map((item) => `${item.startTime} ${item.title}`)

      expect(arrival.role, plan.label).toBe('arrival')
      expect(early, plan.label).toEqual([])
    }
  })

  it('sets a role on exactly the arrival and the departure, and on nothing else', () => {
    for (const plan of PLANS) {
      const lastIndex = plan.days.length - 1
      const wrong = plan.days.flatMap((day, dayIndex) =>
        day.items
          .filter((item, itemIndex) => {
            if (dayIndex === 0 && itemIndex === 0) return item.role !== 'arrival'
            if (dayIndex === lastIndex && itemIndex === day.items.length - 1) return item.role !== 'departure'
            return 'role' in item
          })
          .map((item) => `day ${String(day.index)}: ${item.title} role=${String(item.role)}`),
      )

      expect(wrong, plan.label).toEqual([])
    }
  })

  it('never puts the departure or the arrival on any other day', () => {
    for (const plan of PLANS) {
      const lastIndex = plan.days.length - 1
      const stray = plan.days.flatMap((day, dayIndex) =>
        day.items
          .filter(
            (item) =>
              ((item.role === 'departure' || item.title === plan.departure) && dayIndex !== lastIndex) ||
              ((item.role === 'arrival' || item.title === plan.arrival) && dayIndex !== 0),
          )
          .map((item) => `day ${String(day.index)}: ${item.title}`),
      )

      expect(stray, plan.label).toEqual([])
    }
  })

  /**
   * The reported plan: a four-day London trip whose last day was "19:30 Dinner
   * where the tables are local, 21:45 Check out and head for Heathrow or St
   * Pancras". Literal values on purpose, so this fails on the old scheduler.
   */
  it('no longer ends a London trip with an evening stop and a late-night departure', () => {
    const trip: Trip = {
      ...TRIP,
      id: 'trip_london_4',
      destination: 'London, United Kingdom',
      destinationId: 'london',
      startDate: '2026-04-01',
      endDate: '2026-04-04',
      pace: 'balanced',
      currency: 'GBP',
      interests: ['culture', 'food'],
    }
    const days = buildItinerary(trip, 0, TIMESTAMP)
    const last = days[days.length - 1].items
    const departure = last[last.length - 1]

    expect(departure.title).toBe('Check out and head for Heathrow or St Pancras')
    expect(departure.startTime).toBe('12:00')
    expect(last.filter((item) => item.startTime >= '17:00').map((item) => item.title)).toEqual([])
    expect(last.slice(0, -1).filter((item) => (item.endTime ?? '') > '10:30').map((item) => item.title)).toEqual([])
  })

  it('says in every departure that its time is a placeholder to move', () => {
    for (const { plan, day } of finalDays.filter(({ plan: entry }) => entry.variant === 0 && entry.length === 2)) {
      const departure = day.items[day.items.length - 1]

      expect(departure.description, plan.label).toMatch(/placeholder/)
      expect(departure.description, plan.label).toMatch(/move it to match/)
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
      day.items
        .filter((item) => !isTravelAnchor(item))
        .map((item) => ({
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

  it('never suggests an arrival, transfer or departure, and never gives a suggestion a role', () => {
    const airport = swaps
      .filter(
        ({ alternative }) =>
          TRAVEL_STOPS.has(alternative.title) || alternative.category === 'transit' || 'role' in alternative,
      )
      .map(({ plan, item, alternative }) => `${plan.label}: ${item.title} -> ${alternative.title}`)

    expect(airport.slice(0, 5)).toEqual([])
  })

  it('never suggests nightlife for a daytime slot', () => {
    const early = swaps
      .filter(({ alternative }) => alternative.category === 'nightlife' && startOf(alternative) < EVENING)
      .map(({ plan, item, alternative }) => `${plan.label}: ${item.startTime} ${item.title} -> ${alternative.title}`)

    expect(early.slice(0, 5)).toEqual([])
  })

  it('keeps a final-day suggestion clear of the departure by the full buffer', () => {
    const tight = swaps
      .filter(({ plan, day }) => day === plan.days[plan.days.length - 1])
      .filter(({ day, alternative }) => {
        const departure = day.items[day.items.length - 1]
        return endOf(alternative) > startOf(departure) - FINAL_DAY_BUFFER_MINUTES
      })
      .map(({ plan, item, alternative }) => `${plan.label}: ${item.title} -> ${alternative.title} ${String(alternative.endTime)}`)

    expect(tight.slice(0, 5)).toEqual([])
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

  it('never suggests a Parisian stop for anywhere else, or a generic one for a curated city', () => {
    const generic = new Set(GENERIC_STOPS)
    const wrong = swaps
      .filter(
        ({ plan, alternative }) =>
          (plan.place.destinationId !== 'paris' &&
            PARIS_ISMS.test(`${alternative.title} ${alternative.location} ${alternative.description}`)) ||
          (plan.place.curated && generic.has(alternative.title)),
      )
      .map(({ plan, alternative }) => `${plan.label}: ${alternative.title}`)

    expect(wrong.slice(0, 5)).toEqual([])
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
        if (isTravelAnchor(item)) return

        const first = buildAlternativeItem(plan.trip, day, item, 1, TIMESTAMP)
        const second = buildAlternativeItem(plan.trip, regenerated[dayIndex], twin, 1, TIMESTAMP)
        expect(second.title).toBe(first.title)
      })
    })
  })
})

/**
 * The swap contract for travel stops: `buildAlternativeItem` throws an
 * `AnchorSwapError` (message `ANCHOR_SWAP_MESSAGE`) for an arrival or a
 * departure rather than turning the way home into sightseeing.
 */
describe('buildAlternativeItem and the arrival and departure', () => {
  it('refuses to swap the arrival or the departure, for any variant', () => {
    for (const plan of PLANS.filter((entry) => entry.variant === 0)) {
      const firstDay = plan.days[0]
      const lastDay = plan.days[plan.days.length - 1]
      const anchors = [
        { day: firstDay, item: firstDay.items[0] },
        { day: lastDay, item: lastDay.items[lastDay.items.length - 1] },
      ]
      for (const { day, item } of anchors) {
        expect(isTravelAnchor(item), plan.label).toBe(true)
        for (const variant of [0, 1, 7]) {
          const attempt = () => buildAlternativeItem(plan.trip, day, item, variant, TIMESTAMP)
          expect(attempt, plan.label).toThrow(AnchorSwapError)
          expect(attempt, plan.label).toThrow(ANCHOR_SWAP_MESSAGE)
        }
      }
    }
  })

  it('recognises an arrival or departure saved before items carried a role', () => {
    const days = buildItinerary({ ...TRIP, endDate: '2026-04-03' }, 0, TIMESTAMP)
    const lastDay = days[days.length - 1]
    const legacy = lastDay.items.map(({ role: _role, ...rest }) => rest)
    const departure = legacy[legacy.length - 1]

    expect('role' in departure).toBe(false)
    expect(isTravelAnchor(departure)).toBe(true)
    expect(() => buildAlternativeItem(TRIP, { ...lastDay, items: legacy }, departure, 0, TIMESTAMP)).toThrow(
      AnchorSwapError,
    )
  })

  it('treats a stop the traveller added as ordinary, whatever they called it', () => {
    const days = buildItinerary(TRIP, 0, TIMESTAMP)
    const day = days[1]
    const mine: ItineraryItem = { ...day.items[0], title: 'Arrive and settle in', source: 'user' }
    const withMine: ItineraryDay = { ...day, items: [mine, ...day.items.slice(1)] }

    expect(isTravelAnchor(mine)).toBe(false)
    expect(buildAlternativeItem(TRIP, withMine, mine, 0, TIMESTAMP).title).not.toBe(mine.title)
  })

  it('says so plainly when nothing else fits before the departure', () => {
    const days = buildItinerary({ ...TRIP, endDate: '2026-04-03' }, 0, TIMESTAMP)
    const lastDay = days[days.length - 1]
    const departure = lastDay.items[lastDay.items.length - 1]
    // A stop the traveller moved to 11:00 leaves no room to finish anything by 10:30.
    const moved: ItineraryItem = { ...lastDay.items[0], startTime: '11:00', endTime: '11:30' }

    expect(() =>
      buildAlternativeItem(TRIP, { ...lastDay, items: [moved, departure] }, moved, 0, TIMESTAMP),
    ).toThrow(NO_ALTERNATIVE_BEFORE_DEPARTURE_MESSAGE)
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
   * Pinned Paris output. Re-captured deliberately when the departure became a
   * fixed noon with a final-morning buffer, the bank was audited (Picpus, the
   * invented atelier, theatre and jazz cellar, and the misplaced covered
   * passages were replaced) and a day stopped holding two of the same meal.
   * Any other change to it is a regression.
   */
  it('drafts Paris exactly as pinned', () => {
    const days = buildItinerary(TRIP, 0, TIMESTAMP)

    expect(titlesOn(days.slice(0, 3))).toEqual([
      [
        '15:00 Arrive, drop bags, and walk the neighbourhood',
        '16:45 Musée de l’Orangerie and Monet’s Water Lilies',
        '18:30 Arc de Triomphe rooftop at dusk',
      ],
      [
        '09:00 Notre-Dame Cathedral',
        '10:45 Louvre Museum, Denon wing highlights',
        '13:00 Sainte-Chapelle and its stained glass',
        '14:15 Long lunch at a classic bistro',
        '17:00 Eiffel Tower summit slot',
      ],
      [
        '08:00 Montmartre before the crowds',
        '10:15 Musée d’Orsay, impressionist floor',
        '12:30 Picnic lunch at the Square du Vert-Galant',
        '20:00 Natural wine bar crawl',
      ],
    ])
    expect(days[0].items.map((item) => item.estimatedCost)).toEqual([13, 13, 16])

    const short = buildItinerary({ ...TRIP, endDate: '2026-04-03', pace: 'balanced' }, 1, TIMESTAMP)
    expect(titlesOn(short)).toEqual([
      ['15:00 Arrive, drop bags, and walk the neighbourhood', '16:45 Musée de l’Orangerie and Monet’s Water Lilies'],
      [
        '10:00 Sainte-Chapelle and its stained glass',
        '11:15 Musée d’Orsay, impressionist floor',
        '13:30 Long lunch at a classic bistro',
        '17:00 Eiffel Tower summit slot',
      ],
      // The departure at its fixed noon, after a stop that ends two hours before it.
      ['08:00 Montmartre before the crowds', '12:00 Check out, last coffee, and head for the airport'],
    ])
    expect(short.flatMap((day) => day.items).every((item) => item.currency === 'EUR')).toBe(true)

    const swap = buildAlternativeItem(TRIP, days[1], days[1].items[0], 0, TIMESTAMP)
    expect([swap.title, swap.startTime, swap.endTime, swap.currency]).toEqual([
      'Musée de l’Orangerie and Monet’s Water Lilies',
      '09:00',
      '10:30',
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
    const london = new Set(LONDON_STOPS)

    expect(items[0].title).toBe('Arrive via Heathrow or St Pancras and check in')
    expect(items[items.length - 1].title).toBe('Check out and head for Heathrow or St Pancras')
    expect(items.filter((item) => !isTravelAnchor(item) && !london.has(item.title))).toEqual([])
    expect(items.every((item) => item.currency === 'GBP')).toBe(true)
    expect(
      items.filter((item) => PARIS_ISMS.test(`${item.title} ${item.location} ${item.description}`)),
    ).toEqual([])

    for (const day of days) {
      for (const item of day.items.filter((entry) => !isTravelAnchor(entry))) {
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
    const london = new Set(LONDON_STOPS)

    // The text is not read at all: the same trip under another name is the same plan.
    expect(project(asLondon)).toEqual(project(asLisbon))
    expect(items.every((item) => item.currency === DRAFT_PRICE_CURRENCY)).toBe(true)
    expect(items[0].title).toBe(GENERIC_ARRIVAL)
    // Nothing names a city, London or otherwise.
    expect(
      items.filter((item) => /London|Heathrow|Paris/.test(`${item.title} ${item.location} ${item.description}`)),
    ).toEqual([])
    expect(items.some((item) => london.has(item.title))).toBe(false)
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
   * dinner (30), and the historic-district walk, which stays free.
   */
  it('converts generic reference prices into local estimates on the price step', () => {
    const expected: Record<string, Record<string, number>> = {
      tokyo: {
        'Café breakfast near where you are staying': 1800,
        'A neighbourhood food market for lunch': 2400,
        'A major museum, highlights only': 2700,
        'Self-guided walk through a historic district': 0,
      },
      dubai: {
        'Café breakfast near where you are staying': 55,
        'A neighbourhood food market for lunch': 70,
        'A major museum, highlights only': 80,
      },
      'new-york': {
        'Café breakfast near where you are staying': 14,
        'A neighbourhood food market for lunch': 19,
        'A major museum, highlights only': 22,
      },
      rome: { 'A major museum, highlights only': 17, 'Dinner at a neighbourhood restaurant': 29 },
      barcelona: { 'A major museum, highlights only': 16, 'Dinner at a neighbourhood restaurant': 27 },
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

  it('opens and closes a one-day curated trip on its own airports, with a local stop between', () => {
    for (const place of DESTINATIONS.filter((entry) => entry.curated)) {
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
        expect(titles.some((title) => place.stops.includes(title)), label).toBe(true)
      }
    }
  })
})

/**
 * The meals of every bank and the time each is naturally eaten. A swap used to
 * fall back to "same category" with the time-of-day test dropped, which for a
 * food stop meant supper offered for a breakfast slot and breakfast for supper.
 */
const MEAL_TIMES: ReadonlyMap<string, string> = new Map([
  ['Café crème and a croissant on a Saint-Germain terrace', '08:30'],
  ['Market breakfast and produce run', '08:00'],
  ['Long lunch at a classic bistro', '13:00'],
  ['Picnic lunch at the Square du Vert-Galant', '12:30'],
  ['Beigels on Brick Lane', '08:30'],
  ['Lunch at Borough Market', '12:30'],
  ['Dim sum in Chinatown', '12:30'],
  ['Curry on Brick Lane', '19:00'],
  ['Akara and pap breakfast', '08:00'],
  ['Amala and ewedu at a local buka', '13:00'],
  ['Ofada rice and ayamase for lunch', '12:30'],
  ['Suya supper on Victoria Island', '19:30'],
  ['Café breakfast near where you are staying', '08:30'],
  ['A neighbourhood food market for lunch', '12:30'],
  ['Dinner at a neighbourhood restaurant', '19:30'],
])
/** The generator's MAX_DRIFT_MINUTES: how far from its usual time a swap may sit. */
const USUAL_TIME_MINUTES = 180

describe('buildAlternativeItem and the time of day of a meal', () => {
  it('never offers a meal for a slot far from when that meal is eaten', () => {
    const wrong: string[] = []
    let meals = 0
    for (const plan of PLANS) {
      for (const day of plan.days) {
        for (const item of day.items) {
          if (isTravelAnchor(item)) continue
          for (const variant of [plan.variant, plan.variant + 1]) {
            const alternative = buildAlternativeItem(plan.trip, day, item, variant, TIMESTAMP)
            const usual = MEAL_TIMES.get(alternative.title)
            if (usual === undefined) continue
            meals += 1
            if (Math.abs(timeToMinutes(usual) - startOf(alternative)) > USUAL_TIME_MINUTES) {
              wrong.push(`${plan.label}: ${item.startTime} ${item.title} -> ${alternative.title}`)
            }
          }
        }
      }
    }

    expect(meals).toBeGreaterThan(100)
    expect(wrong.slice(0, 5)).toEqual([])
  })

  it('does not turn a Lagos breakfast into supper, or supper into breakfast', () => {
    const lagos = PLANS.filter((plan) => plan.place.destinationId === 'lagos')
    const swaps = lagos.flatMap((plan) =>
      plan.days.flatMap((day) =>
        day.items
          .filter((item) => MEAL_TIMES.has(item.title))
          .flatMap((item) =>
            [0, 1, 2, 3].map((variant) => ({
              from: item,
              to: buildAlternativeItem(plan.trip, day, item, variant, TIMESTAMP),
            })),
          ),
      ),
    )
    const morningSupper = swaps.filter(
      ({ from, to }) => startOf(from) < 11 * 60 && to.title === 'Suya supper on Victoria Island',
    )
    const eveningBreakfast = swaps.filter(
      ({ from, to }) => startOf(from) >= EVENING && to.title === 'Akara and pap breakfast',
    )

    expect(swaps.length).toBeGreaterThan(100)
    expect(morningSupper.map(({ from }) => `${from.startTime} ${from.title}`).slice(0, 5)).toEqual([])
    expect(eveningBreakfast.map(({ from }) => `${from.startTime} ${from.title}`).slice(0, 5)).toEqual([])
  })
})

/**
 * A swap only ever saw the one day, so on a short curated trip about one swap
 * in five offered a stop the traveller already had on another day. Given the
 * whole trip's days, it offers something new while anything new is left.
 */
describe('buildAlternativeItem and stops planned on other days', () => {
  const curated = PLANS.filter((plan) => plan.place.curated && (plan.length === 2 || plan.length === 3))

  function repeats(withTripDays: boolean): string[] {
    const found: string[] = []
    for (const plan of curated) {
      // The last morning has only a handful of stops short enough to fit
      // before the departure, so it can run out of new ones; every other day
      // has most of the bank still unused.
      for (const day of plan.days.slice(0, -1)) {
        const elsewhere = new Set(
          plan.days.filter((other) => other !== day).flatMap((other) => other.items.map((entry) => entry.title)),
        )
        for (const item of day.items) {
          if (isTravelAnchor(item)) continue
          const alternative = withTripDays
            ? buildAlternativeItem(plan.trip, day, item, plan.variant, TIMESTAMP, plan.days)
            : buildAlternativeItem(plan.trip, day, item, plan.variant, TIMESTAMP)
          if (elsewhere.has(alternative.title)) {
            found.push(`${plan.label} day ${String(day.index)}: ${item.title} -> ${alternative.title}`)
          }
        }
      }
    }
    return found
  }

  it('offers a stop that is on no other day when given the trip’s days', () => {
    // Without the days the swap cannot know, and does repeat: the bug as reported.
    expect(repeats(false).length).toBeGreaterThan(0)
    expect(repeats(true).slice(0, 5)).toEqual([])
  })

  it('still never offers a stop already on the same day', () => {
    for (const plan of curated) {
      for (const day of plan.days) {
        for (const item of day.items.filter((entry) => !isTravelAnchor(entry))) {
          const alternative = buildAlternativeItem(plan.trip, day, item, plan.variant, TIMESTAMP, plan.days)
          expect(day.items.map((entry) => entry.title), plan.label).not.toContain(alternative.title)
        }
      }
    }
  })

  it('repeats a stop rather than fail once every stop in the bank is planned', () => {
    const plan = PLANS.find((entry) => entry.place.curated && entry.length === 30 && entry.trip.pace === 'packed')
    if (!plan) throw new Error('the table has no 30-day packed curated plan')
    const day = plan.days[10]
    const item = day.items[0]

    const alternative = buildAlternativeItem(plan.trip, day, item, plan.variant, TIMESTAMP, plan.days)

    expect(alternative.title).not.toBe(item.title)
    expect(day.items.map((entry) => entry.title)).not.toContain(alternative.title)
  })

  it('gives the same suggestion as before when the days are left out or hold only that day', () => {
    for (const plan of curated.slice(0, 12)) {
      for (const day of plan.days) {
        for (const item of day.items.filter((entry) => !isTravelAnchor(entry))) {
          const without = buildAlternativeItem(plan.trip, day, item, plan.variant, TIMESTAMP)
          const alone = buildAlternativeItem(plan.trip, day, item, plan.variant, TIMESTAMP, [day])
          expect(alone.title, plan.label).toBe(without.title)
          expect(alone.endTime, plan.label).toBe(without.endTime)
        }
      }
    }
  })

  it('still refuses to swap an arrival or departure', () => {
    const plan = curated[0]
    const arrival = plan.days[0].items.find((entry) => entry.role === 'arrival')
    if (!arrival) throw new Error('the plan has no arrival')

    expect(() => buildAlternativeItem(plan.trip, plan.days[0], arrival, 0, TIMESTAMP, plan.days)).toThrow(
      AnchorSwapError,
    )
  })
})
