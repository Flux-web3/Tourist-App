import { getDestination, type Destination } from '@/data/destinations'
import { createId } from '@/domain/ids'
import { addDays, eachDay, formatTime, isValidTime, timeToMinutes } from '@/domain/format'
import { estimateTotal, sortItems } from '@/domain/itinerary'
import type {
  CurrencyCode,
  ItineraryCategory,
  ItineraryDay,
  ItineraryItem,
  ItineraryItemRole,
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
 * Where the trip is comes from `trip.destinationId` alone, never from the
 * free-text `trip.destination`: searching that text for "paris" is how a
 * London trip once received the Paris guide. See `draftBankFor` for which
 * bank each destination drafts from and what currency its prices are in.
 * Named places are only used for a curated destination, whose bank is written
 * entirely from real, well-known places in that city; any other destination
 * receives generic activity types that make no claim of local knowledge.
 *
 * A day is laid out by fixed points and one rule. The arrival opens day one at
 * its own time; the departure closes the final day at `DEPARTURE_START_TIME`
 * and is never moved. Every other stop starts at its template's natural time
 * or just after the previous stop ends, whichever is later, and on the final
 * day must also end `FINAL_DAY_BUFFER_MINUTES` before the departure. A stop
 * that cannot fit that way is left out rather than stacked on top of another
 * or pushed past the departure.
 */

/**
 * The reference currency of the template bank, and the currency of any draft
 * that has no catalogue destination.
 *
 * The Paris and generic template costs are not unitless: they are Paris prices
 * in euros (the Eiffel Tower summit is €36, the Louvre €22), with the generic
 * bank pitched at the same level. A catalogue destination's draft is priced in
 * its own currency instead (see `localPrice`), but a trip with no catalogue
 * destination has no local price level to apply, so its stops keep these
 * reference prices and say so with this label. Drafts generated before prices
 * were localised were all quoted this way, which is why the storage migration
 * backfills old AI stops with it.
 *
 * Nothing the traveller entered is ever converted. A stop priced in a currency
 * other than the trip's is left out of that trip's totals and reported as such
 * (`summariseBudget`, `estimateTotal(days, currency)`).
 */
export const DRAFT_PRICE_CURRENCY: CurrencyCode = 'EUR'

/**
 * When the modelled departure leaves for the airport or station, on every
 * bank. The app has no flight or train time, so this is a placeholder, and
 * every departure's description says so and asks the traveller to move it to
 * their ticket. Noon is the conservative guess: it is the usual latest hotel
 * checkout, so a traveller who checks out and leaves has not been planned to
 * sightsee after handing back the room, and an afternoon or evening flight
 * still has the departure early rather than late.
 */
export const DEPARTURE_START_TIME = '12:00'

/**
 * How long before the departure the last ordinary stop of the final day must
 * end. It covers getting back across town, collecting bags and checking out
 * before the departure leaves; the departure itself already includes the
 * transfer to the airport or station. Ninety minutes is deliberately generous:
 * a big-city return trip alone can take most of an hour, and a missed flight
 * costs far more than a shorter last morning. The final day may therefore hold
 * only breakfast or nothing at all, which is correct.
 */
export const FINAL_DAY_BUFFER_MINUTES = 90

/**
 * When the arrival opens a one-day trip. A one-day trip is arrival and
 * departure on the same date, so the arrival's usual mid-afternoon time would
 * land after the noon departure. An early start makes it an honest day trip:
 * arrive, perhaps one stop, leave. Like the departure it is a placeholder the
 * description asks the traveller to move.
 */
const SAME_DAY_ARRIVAL_START = '07:00'

/** Said whenever a swap is asked of an arrival or departure. */
export const ANCHOR_SWAP_MESSAGE =
  'Arrival and departure are travel, not sightseeing, so there is no alternative to swap in. Edit the time to match your ticket instead. Your plan is unchanged.'

/** Said when a final-day stop has no alternative that still leaves time to get away. */
export const NO_ALTERNATIVE_BEFORE_DEPARTURE_MESSAGE =
  'Nothing else fits before your departure with time left to get there. Your plan is unchanged.'

/**
 * Thrown by `buildAlternativeItem` for an arrival or departure. A dedicated
 * class so a caller can tell "this stop is not swappable" apart from a failed
 * suggestion; its message is `ANCHOR_SWAP_MESSAGE` and is safe to show as is.
 */
export class AnchorSwapError extends Error {
  constructor() {
    super(ANCHOR_SWAP_MESSAGE)
    this.name = 'AnchorSwapError'
  }
}

/**
 * Stops placed by rule rather than drawn from the bank: the arrival opens day
 * one, the departure closes the final day. The transfer is kept in the Paris
 * bank as copy but is never scheduled or offered. None of them is ever picked
 * as an ordinary stop, placed on a middle day, or suggested as an alternative.
 */
type AnchorRole = ItineraryItemRole | 'transfer'

interface DraftTemplate {
  id: string
  title: string
  category: ItineraryCategory
  location: string
  description: string
  /**
   * The time this stop naturally happens; the scheduler never moves it
   * earlier. An arrival or departure is placed exactly here.
   */
  startTime: string
  endTime: string | null
  estimatedCost: number
  durationMinutes: number
  interest: TravelInterest | null
  /** Absent for every ordinary, bookable stop. */
  role?: AnchorRole
  /**
   * The meal a food stop is. A day holds at most one of each, so a picnic
   * lunch is never followed by a second, sit-down lunch.
   */
  meal?: 'breakfast' | 'lunch' | 'dinner'
  /**
   * Generic bank only: `location` for a trip with a catalogue destination,
   * with `{city}` standing for the city. `location` itself stays city-free
   * because a trip with no catalogue destination must not be given a guessed
   * one.
   */
  cityLocation?: string
}

/** Said on every arrival and departure: the app never knows the real ticket. */
const PLACEHOLDER_NOTE = 'This time is a placeholder, not your ticket: move it to match your flight or train.'

/**
 * Paris, priced in euros at roughly current adult rates. Every stop is a real,
 * well-known place, street or neighbourhood; prices are illustrative estimates.
 */
const PARIS_TEMPLATES: DraftTemplate[] = [
  {
    id: 'par_cafe',
    title: 'Café crème and a croissant on a Saint-Germain terrace',
    category: 'food',
    location: 'Saint-Germain-des-Prés',
    description:
      'Breakfast facing the street, the way the neighbourhood does it. The famous boulevard terraces charge for the view; the side-street cafés serve the same for less.',
    startTime: '08:30',
    endTime: '09:30',
    estimatedCost: 12,
    durationMinutes: 60,
    interest: 'food',
    meal: 'breakfast',
  },
  {
    id: 'par_louvre',
    title: 'Louvre Museum, Denon wing highlights',
    category: 'culture',
    location: 'Musée du Louvre',
    description:
      'A focused two-hour route through the Denon wing rather than the whole building, finishing at the Mona Lisa. Timed tickets are booked online.',
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
      'Level five for the impressionists, then the great clock window on the same floor, looking across the Seine to the Louvre.',
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
      'Summit tickets are timed, so book ahead and aim to go up about an hour before sunset, so the river lights are part of it.',
    startTime: '17:00',
    endTime: '19:00',
    estimatedCost: 36,
    durationMinutes: 120,
    interest: 'culture',
  },
  {
    id: 'par_marais',
    title: 'Le Marais courtyards and galleries',
    category: 'sightseeing',
    location: 'Le Marais',
    description:
      'A self-guided loop through the courtyards of the old mansions, the Marché des Enfants Rouges and the galleries of the upper Marais.',
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
      'Climb the steps to Sacré-Cœur, take the view from the terrace, then drop into the back streets while they are still quiet.',
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
      'Bread, cheese and something sweet for the day, plus fruit for later, from the stalls on Rue d’Aligre. Go early, before it gets busy.',
    startTime: '08:00',
    endTime: '09:15',
    estimatedCost: 18,
    durationMinutes: 75,
    interest: 'food',
    meal: 'breakfast',
  },
  {
    id: 'par_lunch',
    title: 'Long lunch at a classic bistro',
    category: 'food',
    location: 'Saint-Germain-des-Prés',
    description:
      'The set lunch menu at a traditional neighbourhood bistro. Allow two hours; the pace is part of it.',
    startTime: '13:00',
    endTime: '15:00',
    estimatedCost: 38,
    durationMinutes: 120,
    interest: 'food',
    meal: 'lunch',
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
    // The description used to finish in "the Picpus village", which is in the
    // 12th arrondissement, not at Versailles; the Queen's Hamlet is.
    id: 'par_versailles',
    title: 'Versailles, palace and gardens',
    category: 'outdoors',
    location: 'Château de Versailles',
    description:
      'RER C out to Versailles, the Hall of Mirrors and the state apartments, then the gardens and, if your legs allow, the Queen’s Hamlet.',
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
      'Iron footbridges, locks and plane trees along the canal, with a coffee on the way back.',
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
      'An hour in the green chairs, the carousel if it is running, and the palace on the north side.',
    startTime: '14:00',
    endTime: '15:30',
    estimatedCost: 0,
    durationMinutes: 90,
    interest: 'relaxed',
  },
  {
    // Replaces "Atelier visit: a working studio", an unnamed studio the
    // description invented details for.
    id: 'par_orangerie',
    title: 'Musée de l’Orangerie and Monet’s Water Lilies',
    category: 'culture',
    location: 'Jardin des Tuileries',
    description:
      'Monet’s two oval rooms of Water Lilies, then the impressionist collection downstairs. Small enough to see properly in ninety minutes.',
    startTime: '14:30',
    endTime: '16:00',
    estimatedCost: 13,
    durationMinutes: 90,
    interest: 'culture',
  },
  {
    id: 'par_wine',
    title: 'Natural wine bar crawl',
    category: 'nightlife',
    location: 'Oberkampf / République',
    description:
      'Three natural-wine bars in the 11th, all walkable from each other. The area is full of them, so go wherever has a free table.',
    startTime: '20:00',
    endTime: '23:00',
    estimatedCost: 45,
    durationMinutes: 180,
    interest: 'nightlife',
  },
  {
    // Replaces an unnamed "small theatre" with an invented seat count.
    id: 'par_show',
    title: 'Opera or ballet at the Palais Garnier',
    category: 'nightlife',
    location: 'Opéra',
    description:
      'Whatever is on the programme that night, in Garnier’s gilded auditorium. Seats range from restricted-view to the best boxes, so this price is a mid-range estimate. Book ahead.',
    startTime: '19:30',
    endTime: '22:00',
    estimatedCost: 70,
    durationMinutes: 150,
    interest: 'nightlife',
  },
  {
    // The covered passages this used to mention are in the 2nd, not the
    // Marais; they are their own stop now (`par_passages`).
    id: 'par_shopping',
    title: 'Design and vintage shops in the upper Marais',
    category: 'shopping',
    location: 'Le Marais / Rue du Temple',
    description:
      'A slow run through the design, concept and vintage shops between Rue du Temple and Rue de Bretagne.',
    startTime: '15:00',
    endTime: '17:00',
    estimatedCost: 60,
    durationMinutes: 120,
    interest: 'shopping',
  },
  {
    id: 'par_passages',
    title: 'The covered passages, Galerie Vivienne to Passage Jouffroy',
    category: 'shopping',
    location: 'Grands Boulevards',
    description:
      'The glass-roofed nineteenth-century arcades: Galerie Vivienne and Passage Choiseul, then Passage des Panoramas and Passage Jouffroy either side of the boulevard.',
    startTime: '15:30',
    endTime: '17:00',
    estimatedCost: 20,
    durationMinutes: 90,
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
    estimatedCost: 13,
    durationMinutes: 120,
    interest: null,
    role: 'transfer',
  },
  {
    id: 'par_arrive',
    title: 'Arrive, drop bags, and walk the neighbourhood',
    category: 'transit',
    location: 'Your hotel',
    description: `In from the airport or station, bags left at the hotel, and one slow loop around the block to get your bearings. ${PLACEHOLDER_NOTE}`,
    startTime: '15:00',
    endTime: '16:30',
    estimatedCost: 13,
    durationMinutes: 90,
    interest: 'relaxed',
    role: 'arrival',
  },
  {
    // Replaces "Market picnic in a park", which named no market and put the
    // picnic in the Luxembourg Gardens, where most lawns are off limits.
    id: 'par_picnic',
    title: 'Picnic lunch at the Square du Vert-Galant',
    category: 'food',
    location: 'Île de la Cité',
    description:
      'Bread, cheese and fruit from the shops on the way, eaten by the water at the western tip of the island, below the Pont Neuf.',
    startTime: '12:30',
    endTime: '13:45',
    estimatedCost: 20,
    durationMinutes: 75,
    interest: 'food',
    meal: 'lunch',
  },
  {
    id: 'par_depart',
    title: 'Check out, last coffee, and head for the airport',
    category: 'transit',
    location: 'Your hotel, then Charles de Gaulle',
    description: `Settle the room and take the RER B out to CDG, leaving the extra hour at the airport. Check the airport on your ticket; Orly is a different run entirely. ${PLACEHOLDER_NOTE}`,
    startTime: DEPARTURE_START_TIME,
    endTime: '14:00',
    estimatedCost: 13,
    durationMinutes: 120,
    interest: null,
    role: 'departure',
  },
  {
    // Replaces an unnamed "cellar jazz club" with "no sign", an invented venue.
    id: 'par_jazz',
    title: 'Swing and jazz at Le Caveau de la Huchette',
    category: 'nightlife',
    location: 'Latin Quarter',
    description:
      'A vaulted cellar on Rue de la Huchette that has been a jazz and swing-dancing club since the 1940s. Dance, or just watch.',
    startTime: '21:30',
    endTime: '23:30',
    estimatedCost: 18,
    durationMinutes: 120,
    interest: 'nightlife',
  },
  {
    id: 'par_notre_dame',
    title: 'Notre-Dame Cathedral',
    category: 'culture',
    location: 'Île de la Cité',
    description:
      'The cathedral reopened after the 2019 fire, restored inside and out. Entry is free; a timed slot booked online can shorten the queue.',
    startTime: '09:00',
    endTime: '10:30',
    estimatedCost: 0,
    durationMinutes: 90,
    interest: 'culture',
  },
  {
    id: 'par_sainte_chapelle',
    title: 'Sainte-Chapelle and its stained glass',
    category: 'culture',
    location: 'Île de la Cité',
    description:
      'The upper chapel is almost all glass, fifteen tall windows of it. Go on a bright morning, when the light comes through.',
    startTime: '10:00',
    endTime: '11:00',
    estimatedCost: 16,
    durationMinutes: 60,
    interest: 'culture',
  },
  {
    id: 'par_pere_lachaise',
    title: 'Père Lachaise Cemetery',
    category: 'outdoors',
    location: 'Père Lachaise, 20th arrondissement',
    description:
      'Cobbled, tree-lined avenues and the graves of Chopin, Oscar Wilde, Édith Piaf and Jim Morrison. Take a map; it is easy to get lost.',
    startTime: '10:30',
    endTime: '12:00',
    estimatedCost: 0,
    durationMinutes: 90,
    interest: 'relaxed',
  },
  {
    id: 'par_arc',
    title: 'Arc de Triomphe rooftop at dusk',
    category: 'sightseeing',
    location: 'Place Charles-de-Gaulle',
    description:
      'Nearly three hundred steps up to the roof, with the twelve avenues fanning out below and the city lights coming on.',
    startTime: '18:30',
    endTime: '19:30',
    estimatedCost: 16,
    durationMinutes: 60,
    interest: 'culture',
  },
]

/**
 * Stops that fit any city, priced at the same Paris-euro reference level as
 * `PARIS_TEMPLATES`. They describe a kind of activity, never a venue, because
 * a destination on this bank is one Tourist has no local content for: a
 * catalogue destination gets them with its city in the location and its own
 * local prices (`localiseGeneric`); a trip with no catalogue destination gets
 * them exactly as written. Nothing here may assume a feature only some cities
 * have (an old town, a covered market, a hot climate).
 */
const GENERIC_TEMPLATES: DraftTemplate[] = [
  {
    id: 'gen_breakfast',
    title: 'Café breakfast near where you are staying',
    category: 'food',
    location: 'Near your accommodation',
    cityLocation: 'Near your accommodation in {city}',
    description: 'A short, unhurried breakfast to start the day and get your bearings.',
    startTime: '08:30',
    endTime: '09:30',
    estimatedCost: 12,
    durationMinutes: 60,
    interest: 'food',
    meal: 'breakfast',
  },
  {
    // Breakfast used to be the only generic stop short and early enough for a
    // final morning, so any trip that had it the day before left with nothing.
    id: 'gen_morning_walk',
    title: 'Early walk around your neighbourhood',
    category: 'outdoors',
    location: 'Near your accommodation',
    cityLocation: 'Near your accommodation in {city}',
    description: 'The streets around where you are staying before they get busy, with a coffee on the way back.',
    startTime: '08:00',
    endTime: '09:00',
    estimatedCost: 0,
    durationMinutes: 60,
    interest: 'relaxed',
  },
  {
    id: 'gen_old_town',
    title: 'Self-guided walk through a historic district',
    category: 'sightseeing',
    location: 'A historic district',
    cityLocation: 'A historic district of {city}',
    description:
      'Pick one of the older neighbourhoods and walk it at your own pace. A walking-tour app or a free map fills in the history.',
    startTime: '10:00',
    endTime: '12:00',
    estimatedCost: 0,
    durationMinutes: 120,
    interest: 'culture',
  },
  {
    id: 'gen_museum',
    title: 'A major museum, highlights only',
    category: 'culture',
    location: 'City centre',
    cityLocation: 'Central {city}',
    description:
      'Choose one of the main museums and give it about two hours rather than the whole collection. Check its opening days before you go.',
    startTime: '10:00',
    endTime: '12:00',
    estimatedCost: 18,
    durationMinutes: 120,
    interest: 'culture',
  },
  {
    id: 'gen_market',
    title: 'A neighbourhood food market for lunch',
    category: 'food',
    location: 'City centre',
    cityLocation: 'Central {city}',
    description: 'Eat at the stalls rather than near them; it is usually quicker and cheaper.',
    startTime: '12:30',
    endTime: '14:00',
    estimatedCost: 16,
    durationMinutes: 90,
    interest: 'food',
    meal: 'lunch',
  },
  {
    id: 'gen_viewpoint',
    title: 'A viewpoint over the city',
    category: 'sightseeing',
    location: 'A high point in the city',
    cityLocation: 'A high point in {city}',
    description: 'A hill, park or public terrace with a view across the city, late in the afternoon.',
    startTime: '16:00',
    endTime: '17:30',
    estimatedCost: 0,
    durationMinutes: 90,
    interest: 'outdoors',
  },
  {
    id: 'gen_park',
    title: 'A walk in a city park',
    category: 'outdoors',
    location: 'A city park',
    cityLocation: 'A park in central {city}',
    description: 'Flat paths, somewhere to sit, and an hour at a slower pace.',
    startTime: '15:00',
    endTime: '16:30',
    estimatedCost: 0,
    durationMinutes: 90,
    interest: 'relaxed',
  },
  {
    id: 'gen_shops',
    title: 'Browsing independent shops',
    category: 'shopping',
    location: 'A shopping street',
    cityLocation: 'A shopping area of {city}',
    description: 'A slow run through smaller, independent shops, away from the big chains.',
    startTime: '15:00',
    endTime: '17:00',
    estimatedCost: 40,
    durationMinutes: 120,
    interest: 'shopping',
  },
  {
    id: 'gen_dinner',
    title: 'Dinner at a neighbourhood restaurant',
    category: 'food',
    location: 'A residential neighbourhood',
    cityLocation: 'A residential neighbourhood of {city}',
    description: 'Try the local cuisine somewhere small, then walk back.',
    startTime: '19:30',
    endTime: '21:30',
    estimatedCost: 30,
    durationMinutes: 120,
    interest: 'food',
    meal: 'dinner',
  },
  {
    id: 'gen_night',
    title: 'An evening out for drinks or live music',
    category: 'nightlife',
    location: 'City centre',
    cityLocation: 'Central {city}',
    description: 'A drink or some live music somewhere central. Check what is on that night.',
    startTime: '21:00',
    endTime: '23:00',
    estimatedCost: 35,
    durationMinutes: 120,
    interest: 'nightlife',
  },
  {
    id: 'gen_nature',
    title: 'Half day out of the city',
    category: 'outdoors',
    location: 'Outside the city',
    cityLocation: 'Outside {city}',
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
    cityLocation: 'Your accommodation in {city}',
    description: `Get to where you are staying, drop the bags, and get oriented. ${PLACEHOLDER_NOTE}`,
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
    location: 'Your accommodation, then your airport or station',
    cityLocation: 'Your accommodation, then out of {city}',
    description: `Check out and head for your airport or station, leaving extra time for the transfer. ${PLACEHOLDER_NOTE}`,
    startTime: DEPARTURE_START_TIME,
    endTime: '14:00',
    estimatedCost: 20,
    durationMinutes: 120,
    interest: null,
    role: 'departure',
  },
]

/**
 * London, priced in pounds at roughly current adult rates. Illustrative draft
 * estimates like every other generated price, written in GBP directly rather
 * than scaled from the euro reference. Every stop is a real, well-known place
 * or area; the bank stands alone, with nothing generic mixed in.
 */
const LONDON_TEMPLATES: DraftTemplate[] = [
  {
    id: 'lon_primrose',
    title: 'Morning walk up Primrose Hill',
    category: 'outdoors',
    location: 'Primrose Hill',
    description:
      'A short climb to one of the best-known views of the London skyline, then back down along the edge of Regent’s Park.',
    startTime: '08:00',
    endTime: '09:00',
    estimatedCost: 0,
    durationMinutes: 60,
    interest: 'outdoors',
  },
  {
    // Replaces "Full English at a neighbourhood café", an unnamed café.
    id: 'lon_beigel',
    title: 'Beigels on Brick Lane',
    category: 'food',
    location: 'Brick Lane, Spitalfields',
    description:
      'Salt beef, or smoked salmon and cream cheese, from the long-running beigel bakeries at the top of Brick Lane.',
    startTime: '08:30',
    endTime: '09:30',
    estimatedCost: 8,
    durationMinutes: 60,
    interest: 'food',
    meal: 'breakfast',
  },
  {
    id: 'lon_tower',
    title: 'Tower of London and the Crown Jewels',
    category: 'sightseeing',
    location: 'Tower Hill',
    description:
      'Take the first entry slot and see the Crown Jewels before the queue builds, then join a Yeoman Warder tour of the walls.',
    startTime: '09:30',
    endTime: '12:00',
    estimatedCost: 35,
    durationMinutes: 150,
    interest: 'culture',
  },
  {
    id: 'lon_st_pauls',
    title: 'St Paul’s Cathedral and the Whispering Gallery',
    category: 'culture',
    location: 'City of London',
    description:
      'Wren’s cathedral, then the 257 steps up to the Whispering Gallery, and on to the outside galleries for the view over the City if you have the legs.',
    startTime: '09:30',
    endTime: '11:30',
    estimatedCost: 26,
    durationMinutes: 120,
    interest: 'culture',
  },
  {
    id: 'lon_british_museum',
    title: 'British Museum, Egyptian galleries and the Great Court',
    category: 'culture',
    location: 'Bloomsbury',
    description:
      'Free to enter. Go straight for the Rosetta Stone and the Egyptian rooms before the tour groups arrive, and leave through the Great Court.',
    startTime: '10:00',
    endTime: '12:00',
    estimatedCost: 0,
    durationMinutes: 120,
    interest: 'culture',
  },
  {
    id: 'lon_abbey',
    title: 'Westminster Abbey',
    category: 'culture',
    location: 'Westminster',
    description:
      'Coronation church, royal tombs and Poets’ Corner, with Parliament and Big Ben across the square when you come out.',
    startTime: '10:00',
    endTime: '11:30',
    estimatedCost: 30,
    durationMinutes: 90,
    interest: 'culture',
  },
  {
    id: 'lon_nhm',
    title: 'Natural History Museum',
    category: 'culture',
    location: 'South Kensington',
    description:
      'Free to enter. The blue whale skeleton hanging in Hintze Hall, then the dinosaur gallery before the school groups arrive.',
    startTime: '10:00',
    endTime: '12:00',
    estimatedCost: 0,
    durationMinutes: 120,
    interest: 'culture',
  },
  {
    id: 'lon_kew',
    title: 'Kew Gardens and the Palm House',
    category: 'outdoors',
    location: 'Kew',
    description:
      'The District line out to Kew, the Victorian glasshouses, and the treetop walkway if the weather holds.',
    startTime: '10:00',
    endTime: '14:00',
    estimatedCost: 22,
    durationMinutes: 240,
    interest: 'outdoors',
  },
  {
    id: 'lon_greenwich',
    title: 'Greenwich, the Royal Observatory and the park',
    category: 'sightseeing',
    location: 'Greenwich',
    description:
      'A river boat or the DLR out to Greenwich, the Prime Meridian at the Royal Observatory, and the view back over London from the top of the park.',
    startTime: '10:00',
    endTime: '14:00',
    estimatedCost: 24,
    durationMinutes: 240,
    interest: 'culture',
  },
  {
    id: 'lon_guard',
    title: 'Changing the Guard at Buckingham Palace',
    category: 'sightseeing',
    location: 'Buckingham Palace',
    description:
      'Free, outdoors and crowded, so arrive early for a spot by the railings. It does not run every day; check the schedule the day before.',
    startTime: '10:30',
    endTime: '12:00',
    estimatedCost: 0,
    durationMinutes: 90,
    interest: 'culture',
  },
  {
    id: 'lon_portobello',
    title: 'Portobello Road Market',
    category: 'shopping',
    location: 'Notting Hill',
    description:
      'The pastel terraces of Notting Hill, then the length of Portobello Road. Saturday is the big day, when the antiques stalls are out.',
    startTime: '10:30',
    endTime: '12:30',
    estimatedCost: 25,
    durationMinutes: 120,
    interest: 'shopping',
  },
  {
    id: 'lon_borough',
    title: 'Lunch at Borough Market',
    category: 'food',
    location: 'Southwark',
    description:
      'Graze the stalls rather than sitting down: a hot sandwich, something from the cheese stands, and a coffee to walk off with.',
    startTime: '12:30',
    endTime: '13:45',
    estimatedCost: 18,
    durationMinutes: 75,
    interest: 'food',
    meal: 'lunch',
  },
  {
    id: 'lon_chinatown',
    title: 'Dim sum in Chinatown',
    category: 'food',
    location: 'Chinatown, Soho',
    description:
      'Lunchtime dim sum around Gerrard Street, a short walk from Leicester Square. Order a few plates at a time.',
    startTime: '12:30',
    endTime: '13:45',
    estimatedCost: 22,
    durationMinutes: 75,
    interest: 'food',
    meal: 'lunch',
  },
  {
    id: 'lon_tate_modern',
    title: 'Tate Modern and the Turbine Hall',
    category: 'culture',
    location: 'Bankside',
    description:
      'The collection is free to enter. Start with whatever fills the Turbine Hall, then the viewing level at the top of the Blavatnik Building.',
    startTime: '14:00',
    endTime: '15:30',
    estimatedCost: 0,
    durationMinutes: 90,
    interest: 'culture',
  },
  {
    id: 'lon_national_gallery',
    title: 'National Gallery highlights',
    category: 'culture',
    location: 'Trafalgar Square',
    description:
      'Free to enter. Van Gogh’s Sunflowers, Turner and Constable in ninety minutes, then the steps over the square.',
    startTime: '14:00',
    endTime: '15:30',
    estimatedCost: 0,
    durationMinutes: 90,
    interest: 'culture',
  },
  {
    id: 'lon_regents_park',
    title: 'Regent’s Park and Queen Mary’s Rose Garden',
    category: 'outdoors',
    location: 'Regent’s Park',
    description:
      'The Inner Circle and its rose garden, then round to the boating lake. At its best in June; green all year.',
    startTime: '14:00',
    endTime: '15:30',
    estimatedCost: 0,
    durationMinutes: 90,
    interest: 'relaxed',
  },
  {
    id: 'lon_hyde_park',
    title: 'Hyde Park and Kensington Gardens',
    category: 'outdoors',
    location: 'Hyde Park',
    description:
      'Along the Serpentine to the Italian Gardens and the Round Pond. Flat, green and bigger than it looks.',
    startTime: '14:30',
    endTime: '16:00',
    estimatedCost: 0,
    durationMinutes: 90,
    interest: 'outdoors',
  },
  {
    id: 'lon_camden',
    title: 'Camden Market and the Regent’s Canal',
    category: 'shopping',
    location: 'Camden Town',
    description:
      'Vintage stalls, records and street food around the lock, then a stretch of the canal towpath when it gets busy.',
    startTime: '15:00',
    endTime: '17:00',
    estimatedCost: 30,
    durationMinutes: 120,
    interest: 'shopping',
  },
  {
    id: 'lon_covent_garden',
    title: 'Covent Garden and Neal’s Yard',
    category: 'shopping',
    location: 'Covent Garden',
    description:
      'The market hall and the street performers on the piazza, then the side streets up to the painted courtyard of Neal’s Yard.',
    startTime: '15:30',
    endTime: '17:00',
    estimatedCost: 20,
    durationMinutes: 90,
    interest: 'shopping',
  },
  {
    id: 'lon_tea',
    title: 'Afternoon tea in Mayfair',
    category: 'food',
    location: 'Mayfair',
    description:
      'Sandwiches, scones with clotted cream and a stand of small cakes at one of the grand hotels. Book ahead and do not plan a big dinner.',
    startTime: '15:30',
    endTime: '17:00',
    estimatedCost: 55,
    durationMinutes: 90,
    interest: 'food',
  },
  {
    id: 'lon_south_bank',
    title: 'South Bank walk to Tower Bridge',
    category: 'outdoors',
    location: 'South Bank',
    description:
      'The riverside path from Westminster Bridge past Tate Modern and Shakespeare’s Globe, finishing under Tower Bridge.',
    startTime: '16:00',
    endTime: '17:30',
    estimatedCost: 0,
    durationMinutes: 90,
    interest: 'relaxed',
  },
  {
    id: 'lon_eye',
    title: 'London Eye at dusk',
    category: 'sightseeing',
    location: 'South Bank',
    description:
      'Book a slot near sunset: one slow half-hour rotation as the lights come on along the Thames, with Parliament right below.',
    startTime: '18:00',
    endTime: '19:00',
    estimatedCost: 32,
    durationMinutes: 60,
    interest: 'relaxed',
  },
  {
    id: 'lon_curry',
    title: 'Curry on Brick Lane',
    category: 'food',
    location: 'Brick Lane, Spitalfields',
    description:
      'Dinner on London’s best-known curry street. Walk the length of it before choosing; the menus are posted outside.',
    startTime: '19:00',
    endTime: '20:30',
    estimatedCost: 25,
    durationMinutes: 90,
    interest: 'food',
    meal: 'dinner',
  },
  {
    id: 'lon_theatre',
    title: 'A West End show',
    category: 'nightlife',
    location: 'West End',
    description:
      'Day seats, or the ticket booth in Leicester Square for whatever is playing tonight. Eat before; the interval bar is a scrum.',
    startTime: '19:30',
    endTime: '22:15',
    estimatedCost: 65,
    durationMinutes: 165,
    interest: 'nightlife',
  },
  {
    id: 'lon_globe',
    title: 'A play at Shakespeare’s Globe',
    category: 'nightlife',
    location: 'Bankside',
    description:
      'Standing in the yard is the cheapest way in; this estimate is for a seat. The open-air theatre plays in the warmer months, and the candlelit Sam Wanamaker Playhouse next door in winter.',
    startTime: '19:30',
    endTime: '22:30',
    estimatedCost: 35,
    durationMinutes: 180,
    interest: 'culture',
  },
  {
    id: 'lon_jazz',
    title: 'Live jazz at Ronnie Scott’s',
    category: 'nightlife',
    location: 'Soho',
    description:
      'The Frith Street jazz club, open since the 1950s. Book ahead for the main show.',
    startTime: '20:00',
    endTime: '22:30',
    estimatedCost: 45,
    durationMinutes: 150,
    interest: 'nightlife',
  },
  {
    id: 'lon_pubs',
    title: 'Historic pubs off Fleet Street',
    category: 'nightlife',
    location: 'City of London',
    description:
      'Three old pubs down the narrow courts off Fleet Street, all walkable, finishing at Ye Olde Cheshire Cheese.',
    startTime: '20:00',
    endTime: '22:30',
    estimatedCost: 30,
    durationMinutes: 150,
    interest: 'nightlife',
  },
  {
    id: 'lon_arrive',
    title: 'Arrive via Heathrow or St Pancras and check in',
    category: 'transit',
    location: 'Your hotel',
    description: `The Elizabeth line or the Piccadilly line in from Heathrow, or straight off the train at St Pancras. Drop the bags and take one slow loop around the block. ${PLACEHOLDER_NOTE}`,
    startTime: '15:00',
    endTime: '16:30',
    estimatedCost: 13,
    durationMinutes: 90,
    interest: 'relaxed',
    role: 'arrival',
  },
  {
    id: 'lon_depart',
    title: 'Check out and head for Heathrow or St Pancras',
    category: 'transit',
    location: 'Your hotel, then Heathrow or St Pancras',
    description: `Settle the room and take the Elizabeth line out to Heathrow, or head for the train at St Pancras, leaving the extra hour. Gatwick, Stansted and Luton are different runs entirely, so check the ticket. ${PLACEHOLDER_NOTE}`,
    startTime: DEPARTURE_START_TIME,
    endTime: '14:00',
    estimatedCost: 13,
    durationMinutes: 120,
    interest: null,
    role: 'departure',
  },
]

/**
 * Lagos, priced in naira in whole ₦500 steps. Illustrative draft estimates
 * like every other generated price; street food and market spend vary a lot,
 * and the airport runs are priced as a pre-booked car. Every stop is a real,
 * well-known place, area or local dish; the bank stands alone.
 */
const LAGOS_TEMPLATES: DraftTemplate[] = [
  {
    id: 'lag_breakfast',
    title: 'Akara and pap breakfast',
    category: 'food',
    location: 'Surulere',
    description:
      'Bean fritters fried to order and hot pap from a roadside stall. Go early; the akara sells out.',
    startTime: '08:00',
    endTime: '09:00',
    estimatedCost: 3000,
    durationMinutes: 60,
    interest: 'food',
    meal: 'breakfast',
  },
  {
    id: 'lag_conservation',
    title: 'Lekki Conservation Centre canopy walkway',
    category: 'outdoors',
    location: 'Lekki Peninsula',
    description:
      'The long canopy walkway above the wetland forest before the heat builds. Look for monkeys along the boardwalk below.',
    startTime: '08:30',
    endTime: '11:00',
    estimatedCost: 10000,
    durationMinutes: 150,
    interest: 'outdoors',
  },
  {
    id: 'lag_heritage',
    title: 'Lagos Island heritage walk and the Brazilian Quarter',
    category: 'sightseeing',
    location: 'Lagos Island',
    description:
      'Tinubu Square, the Cathedral Church of Christ and the Afro-Brazilian houses of Popo Aguda, best walked early before the island traffic.',
    startTime: '09:00',
    endTime: '11:00',
    estimatedCost: 0,
    durationMinutes: 120,
    interest: 'culture',
  },
  {
    id: 'lag_tarkwa',
    title: 'Boat to Tarkwa Bay beach',
    category: 'outdoors',
    location: 'Tarkwa Bay',
    description:
      'A short boat ride across the harbour to a sheltered beach with no road in. Rent a shaded spot and keep cash for the boat back.',
    startTime: '09:30',
    endTime: '14:30',
    estimatedCost: 15000,
    durationMinutes: 300,
    interest: 'outdoors',
  },
  {
    id: 'lag_badagry',
    title: 'Day trip to Badagry and the Point of No Return',
    category: 'sightseeing',
    location: 'Badagry',
    description:
      'A long drive west to the old slave port: the Heritage Museum, the Brazilian Barracoon, and the walk to the Point of No Return on the beach. Go with a driver and leave early.',
    startTime: '08:00',
    endTime: '15:00',
    estimatedCost: 30000,
    durationMinutes: 420,
    interest: 'culture',
  },
  {
    id: 'lag_national_museum',
    title: 'National Museum Lagos',
    category: 'culture',
    location: 'Onikan, Lagos Island',
    description:
      'Nigeria’s national collection, with Nok terracottas, Ife heads and Benin bronzes, beside Tafawa Balewa Square.',
    startTime: '10:00',
    endTime: '11:30',
    estimatedCost: 2000,
    durationMinutes: 90,
    interest: 'culture',
  },
  {
    id: 'lag_balogun',
    title: 'Balogun Market fabric run',
    category: 'shopping',
    location: 'Lagos Island',
    description:
      'Ankara and lace by the yard in one of the busiest markets in West Africa. Go with a list and room to haggle.',
    startTime: '10:30',
    endTime: '12:30',
    estimatedCost: 15000,
    durationMinutes: 120,
    interest: 'shopping',
  },
  {
    // Nike Art Gallery is in Lekki Phase 1; the floor count it used to state
    // could not be checked, so it is gone.
    id: 'lag_nike',
    title: 'Nike Art Gallery',
    category: 'culture',
    location: 'Lekki Phase 1',
    description:
      'Floor after floor of Nigerian art, from adire textiles to contemporary painting. Free to enter; take your time on the upper floors.',
    startTime: '11:00',
    endTime: '13:00',
    estimatedCost: 0,
    durationMinutes: 120,
    interest: 'culture',
  },
  {
    id: 'lag_jazzhole',
    title: 'Books and records at the Jazzhole',
    category: 'shopping',
    location: 'Awolowo Road, Ikoyi',
    description:
      'A long-running bookshop and record store with a café at the back. Browse the highlife and Afrobeat shelves.',
    startTime: '11:00',
    endTime: '12:00',
    estimatedCost: 0,
    durationMinutes: 60,
    interest: 'shopping',
  },
  {
    id: 'lag_buka',
    title: 'Amala and ewedu at a local buka',
    category: 'food',
    location: 'Yaba',
    description:
      'A proper buka lunch: amala, ewedu and gbegiri with the stew of the day. Point at what looks good.',
    startTime: '13:00',
    endTime: '14:15',
    estimatedCost: 5000,
    durationMinutes: 75,
    interest: 'food',
    meal: 'lunch',
  },
  {
    id: 'lag_ofada',
    title: 'Ofada rice and ayamase for lunch',
    category: 'food',
    location: 'Ikeja',
    description:
      'Local unpolished rice with ayamase, the green pepper stew, often served in leaves. Ask for it milder if you need to.',
    startTime: '12:30',
    endTime: '13:30',
    estimatedCost: 5000,
    durationMinutes: 60,
    interest: 'food',
    meal: 'lunch',
  },
  {
    id: 'lag_kalakuta',
    title: 'Kalakuta Republic Museum',
    category: 'culture',
    location: 'Ikeja',
    description:
      'Fela Kuti’s former home, now a museum of his rooms, clothes and instruments, with a terrace on the roof.',
    startTime: '13:30',
    endTime: '15:00',
    estimatedCost: 5000,
    durationMinutes: 90,
    interest: 'culture',
  },
  {
    id: 'lag_landmark_beach',
    title: 'An afternoon at Landmark Beach',
    category: 'outdoors',
    location: 'Oniru, Victoria Island',
    description:
      'A managed beach with loungers, food and an entry fee, a short drive from Victoria Island. The Atlantic surf is strong, so swim only where the lifeguards say.',
    startTime: '14:00',
    endTime: '17:00',
    estimatedCost: 10000,
    durationMinutes: 180,
    interest: 'relaxed',
  },
  {
    id: 'lag_art_twenty_one',
    title: 'Art Twenty One gallery',
    category: 'culture',
    location: 'Victoria Island',
    description:
      'A contemporary art space in the Eko Hotel complex, showing Nigerian and African artists. Free to enter.',
    startTime: '15:00',
    endTime: '16:00',
    estimatedCost: 0,
    durationMinutes: 60,
    interest: 'culture',
  },
  {
    id: 'lag_lekki_market',
    title: 'Lekki Arts and Crafts Market',
    category: 'shopping',
    location: 'Lekki',
    description:
      'Carvings, beadwork, leather and adire, stall after stall. Prices start high; settle slowly.',
    startTime: '14:30',
    endTime: '16:30',
    estimatedCost: 20000,
    durationMinutes: 120,
    interest: 'shopping',
  },
  {
    id: 'lag_bridge',
    title: 'Lekki–Ikoyi Link Bridge at sunset',
    category: 'sightseeing',
    location: 'Lekki–Ikoyi Link Bridge',
    description:
      'Walk the cable-stayed bridge as the light goes gold over the lagoon; half the city is out doing the same.',
    startTime: '17:30',
    endTime: '18:30',
    estimatedCost: 0,
    durationMinutes: 60,
    interest: 'relaxed',
  },
  {
    id: 'lag_freedom_park',
    title: 'Evening at Freedom Park',
    category: 'culture',
    location: 'Lagos Island',
    description:
      'The old colonial prison grounds, now a park with a stage. There is often live music or a play at the weekend.',
    startTime: '17:30',
    endTime: '19:30',
    estimatedCost: 2000,
    durationMinutes: 120,
    interest: 'culture',
  },
  {
    id: 'lag_terra_kulture',
    title: 'A play at Terra Kulture',
    category: 'nightlife',
    location: 'Victoria Island',
    description:
      'Nigerian theatre in an intimate arts centre with a restaurant. Plays run mostly at weekends, so check what is on.',
    startTime: '18:00',
    endTime: '20:30',
    estimatedCost: 10000,
    durationMinutes: 150,
    interest: 'nightlife',
  },
  {
    id: 'lag_suya',
    title: 'Suya supper on Victoria Island',
    category: 'food',
    location: 'Victoria Island',
    description:
      'Spiced grilled beef wrapped in paper with onions and yaji, from a grill with a queue. Eat it there, while it is hot.',
    startTime: '19:30',
    endTime: '20:30',
    estimatedCost: 8000,
    durationMinutes: 60,
    interest: 'food',
    meal: 'dinner',
  },
  {
    id: 'lag_bogobiri',
    title: 'Live music at Bogobiri House',
    category: 'nightlife',
    location: 'Ikoyi',
    description:
      'A small, art-filled guesthouse and bar that hosts live music and spoken-word nights. Check which night the band is on.',
    startTime: '20:00',
    endTime: '22:30',
    estimatedCost: 10000,
    durationMinutes: 150,
    interest: 'nightlife',
  },
  {
    id: 'lag_shrine',
    title: 'Live Afrobeat at the New Afrika Shrine',
    category: 'nightlife',
    location: 'Ikeja',
    description:
      'Afrobeat at the venue the Kuti family still plays. The big nights are at the end of the week; the band starts late.',
    startTime: '20:30',
    endTime: '23:30',
    estimatedCost: 5000,
    durationMinutes: 180,
    interest: 'nightlife',
  },
  {
    id: 'lag_arrive',
    title: 'Arrive at Murtala Muhammed Airport and check in',
    category: 'transit',
    location: 'Your hotel',
    description: `Clear arrivals at Murtala Muhammed in Ikeja, then a pre-booked car to the hotel. Allow two hours for the drive; the traffic decides. ${PLACEHOLDER_NOTE}`,
    startTime: '15:00',
    endTime: '17:00',
    estimatedCost: 25000,
    durationMinutes: 120,
    interest: 'relaxed',
    role: 'arrival',
  },
  {
    id: 'lag_depart',
    title: 'Check out and head for Murtala Muhammed Airport',
    category: 'transit',
    location: 'Your hotel, then Murtala Muhammed Airport',
    description: `Settle the room and take a pre-booked car to Ikeja, leaving far more time than the distance suggests; the drive is the unpredictable part of the day. ${PLACEHOLDER_NOTE}`,
    startTime: DEPARTURE_START_TIME,
    endTime: '14:30',
    estimatedCost: 25000,
    durationMinutes: 150,
    interest: null,
    role: 'departure',
  },
]

/**
 * The hand-written bank of each curated destination (`Destination.guide`
 * 'curated'). Each stands alone, anchors included: no generic stop is ever
 * mixed in, so a London plan never offers "a walk in a city park" when Hyde
 * Park is right there. Each holds far more than twice the busiest day's
 * ordinary stops (see `planDay`), so adjacent days never share one.
 */
const CURATED_BANKS: Readonly<Partial<Record<string, readonly DraftTemplate[]>>> = {
  paris: PARIS_TEMPLATES,
  london: LONDON_TEMPLATES,
  lagos: LAGOS_TEMPLATES,
}

/**
 * Anchor titles from every bank, by role. Only used to recognise an arrival
 * or departure saved before items carried a `role`, so a swap on one of those
 * is refused too.
 */
const ANCHOR_ROLE_BY_TITLE: ReadonlyMap<string, AnchorRole> = new Map(
  [...PARIS_TEMPLATES, ...LONDON_TEMPLATES, ...LAGOS_TEMPLATES, ...GENERIC_TEMPLATES]
    .filter((template) => template.role !== undefined)
    .map((template) => [template.title, template.role as AnchorRole]),
)

const PACE_TARGET: Record<TravelPace, number> = {
  relaxed: 2,
  balanced: 3,
  packed: 4,
}

/** The gap left between one stop's end and the next stop's start. */
const BUFFER_MINUTES = 15
/** The latest minute a stop may end on: nothing runs past midnight. */
const LAST_MINUTE = 23 * 60 + 59
/** Nightlife is never offered for a slot that starts before this. */
const EVENING_MINUTES = 17 * 60
/**
 * How far an ordinary stop may be pushed past its natural start before it is
 * left out of the day instead. It is what keeps breakfast in the morning.
 */
const MAX_DRIFT_MINUTES = 180
/**
 * The same for a meal, tighter: a sightseeing stop can move from ten to one,
 * but a lunch pushed three hours is tea, and a breakfast at half eleven is not
 * breakfast.
 */
const MAX_MEAL_DRIFT_MINUTES = 90

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

function isAnchor(template: DraftTemplate): boolean {
  return template.role !== undefined
}

/**
 * The travel role of a stop in a saved plan: its `role`, or, for an AI stop
 * saved before roles were recorded, the role of the anchor template it was
 * drafted from. Null for every ordinary stop, and for anything the traveller
 * added, whatever they called it.
 */
function anchorRoleOf(item: ItineraryItem): AnchorRole | null {
  if (item.role !== undefined) return item.role
  if (item.source !== 'ai') return null
  return ANCHOR_ROLE_BY_TITLE.get(item.title) ?? null
}

/**
 * True for an arrival or departure (or the legacy transfer) in a saved plan:
 * the stops `buildAlternativeItem` refuses to swap. Exported so the UI can
 * withhold the swap action instead of offering one that is bound to fail.
 */
export function isTravelAnchor(item: ItineraryItem): boolean {
  return anchorRoleOf(item) !== null
}

/**
 * A reference price (Paris euro level) as an illustrative local estimate:
 * scaled by the destination's price level and rounded to its step, so a yen
 * estimate is a whole ¥100 and a naira one a whole ₦500. Free stays free, and a
 * paid stop never rounds down to free.
 */
function localPrice(reference: number, destination: Destination): number {
  if (reference <= 0) return 0
  const steps = Math.round((reference * destination.priceLevel) / destination.priceStep)
  return Math.max(1, steps) * destination.priceStep
}

/** A generic stop as drafted for `destination`: its city in the location, its prices. */
function localiseGeneric(template: DraftTemplate, destination: Destination): DraftTemplate {
  return {
    ...template,
    location: template.cityLocation?.replace('{city}', destination.city) ?? template.location,
    estimatedCost: localPrice(template.estimatedCost, destination),
  }
}

interface DraftBank {
  templates: readonly DraftTemplate[]
  /** The currency every stop drawn from `templates` is priced in. */
  currency: CurrencyCode
}

/**
 * The templates a trip drafts from and the currency they are priced in, keyed
 * on `trip.destinationId` only; the free text is never read, so a London trip
 * whose name or destination mentions Paris is still drafted as London.
 *
 * - A curated destination (Paris, London, Lagos): its own bank, standalone,
 *   in its currency.
 * - Any other catalogue destination: the generic bank localised to it.
 * - No catalogue destination: the generic bank as written, at reference
 *   prices labelled `DRAFT_PRICE_CURRENCY`. There is no city to name and no
 *   price level to apply, and guessing one from the text is the bug this
 *   replaced.
 */
function draftBankFor(trip: Trip): DraftBank {
  const destination = getDestination(trip.destinationId)
  if (destination === null) return { templates: GENERIC_TEMPLATES, currency: DRAFT_PRICE_CURRENCY }

  const curated = CURATED_BANKS[destination.id]
  if (curated !== undefined) return { templates: curated, currency: destination.currency }
  return {
    templates: GENERIC_TEMPLATES.map((template) => localiseGeneric(template, destination)),
    currency: destination.currency,
  }
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

/**
 * Times one day's stops, or returns null when they cannot all fit.
 *
 * The arrival and departure are fixed points, placed exactly at their own
 * start. The arrival opens the day. The ordinary stops follow in natural-time
 * order, each at its natural time or `BUFFER_MINUTES` after the previous one
 * ends, whichever is later, so nothing overlaps and nothing starts earlier than
 * it naturally would, which keeps an evening stop in the evening. The departure
 * closes the day.
 *
 * The day does not fit if any stop would end after 23:59, an ordinary stop
 * would be pushed more than `MAX_DRIFT_MINUTES` (`MAX_MEAL_DRIFT_MINUTES` for a
 * meal) past its natural time, or, with
 * a departure, an ordinary stop would end less than `FINAL_DAY_BUFFER_MINUTES`
 * before it. The departure is never pushed later to make room: that is how a
 * final day once read "19:30 dinner, 21:45 check out".
 */
function layOutDay(stops: readonly DraftTemplate[]): Slot[] | null {
  const arrival = stops.find((template) => template.role === 'arrival')
  const departure = stops.find((template) => template.role === 'departure')
  const ordinary = stops
    .filter((template) => !isAnchor(template))
    .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime))

  const departureStart = departure === undefined ? null : timeToMinutes(departure.startTime)
  const latestOrdinaryEnd =
    departureStart === null ? LAST_MINUTE : departureStart - FINAL_DAY_BUFFER_MINUTES

  const slots: Slot[] = []
  let earliest = 0
  if (arrival !== undefined) {
    const start = timeToMinutes(arrival.startTime)
    slots.push({ template: arrival, start, end: start + arrival.durationMinutes })
    earliest = start + arrival.durationMinutes + BUFFER_MINUTES
  }
  for (const template of ordinary) {
    const natural = timeToMinutes(template.startTime)
    const start = Math.max(natural, earliest)
    const end = start + template.durationMinutes
    if (end > latestOrdinaryEnd) return null
    const drift = template.meal === undefined ? MAX_DRIFT_MINUTES : MAX_MEAL_DRIFT_MINUTES
    if (start - natural > drift) return null
    slots.push({ template, start, end })
    earliest = end + BUFFER_MINUTES
  }
  if (departure !== undefined && departureStart !== null) {
    const end = departureStart + departure.durationMinutes
    // Only an arrival can reach this far: an ordinary stop already ended a
    // full final-day buffer before the departure.
    if (departureStart < earliest || end > LAST_MINUTE) return null
    slots.push({ template: departure, start: departureStart, end })
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
 * while anything else remains. A draw that would not fit (see `layOutDay`) is
 * dropped and another is drawn, as is a second breakfast, lunch or dinner, so a
 * crowded day, or a final morning with little time before the departure, ends
 * up shorter rather than stacked.
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
  const anchorSlots = layOutDay(anchors)
  // The anchor times are constants chosen so this cannot happen; failing loudly
  // beats silently dropping the traveller's arrival or departure.
  if (anchorSlots === null) throw new Error('The arrival and departure do not fit on one day.')
  let slots = anchorSlots
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

    if (pick.meal !== undefined && chosen.some((template) => template.meal === pick.meal)) continue
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
  currency: CurrencyCode,
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
    // The bank's currency, never the trip's: the price was set for the
    // destination (see `draftBankFor`), and labelling it with whatever the
    // trip is budgeted in once turned a €29 ticket into ₦29.
    currency,
    source: 'ai',
    editedByUser: false,
    experienceId: null,
    notes: '',
    createdAt: timestamp,
    updatedAt: timestamp,
    // Only the arrival and departure carry a role; the key is left off every
    // other stop rather than set to undefined, matching what storage reads back.
    ...(template.role === 'arrival' || template.role === 'departure' ? { role: template.role } : {}),
    ...overrides,
  }
}

/**
 * Builds a full draft itinerary for a trip. Deterministic for a given
 * (trip.id, variant, trip.startDate) so regeneration is reproducible.
 */
export function buildItinerary(trip: Trip, variant = 0, timestamp = new Date().toISOString()): ItineraryDay[] {
  const { templates: pool, currency } = draftBankFor(trip)
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
    // A one-day trip is a travel day at both ends: arrival first, departure
    // last. Its arrival moves to the morning, since the afternoon one would
    // come after the noon departure.
    const opening =
      isFirst && isLast && arrival !== undefined
        ? { ...arrival, startTime: SAME_DAY_ARRIVAL_START }
        : arrival
    const anchors = [isFirst ? opening : undefined, isLast ? departure : undefined].filter(
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
        toItem(trip, template, currency, timestamp, {
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
 * Refuses an arrival or departure (`isTravelAnchor`) by throwing an
 * `AnchorSwapError`: an airport run has no sightseeing alternative, and
 * returning one would quietly turn the traveller's way home into an attraction.
 * The service passes the rejection on, so the caller shows its message and
 * leaves the plan unchanged.
 *
 * Never offers an arrival, departure or transfer, a stop already on that day,
 * a meal the rest of the day already has, or nightlife for a slot before 17:00
 * (the last two only while anything else is left). Before a departure on the
 * same day, the alternative must end `FINAL_DAY_BUFFER_MINUTES` before it, as a
 * generated stop would; if nothing can, it throws an Error with
 * `NO_ALTERNATIVE_BEFORE_DEPARTURE_MESSAGE` rather than suggest something that
 * makes the traveller late. Among the rest it
 * prefers, in order: the same category, at about its usual time of day and
 * finished before the next stop; the same category finished before the next
 * stop; the same category finished by midnight; any category at about its
 * usual time and finished before the next stop; any finished before the next
 * stop; any finished by midnight. The end time is recomputed from the new
 * stop's own duration.
 *
 * A meal is only ever offered at about its usual time. The later preferences
 * give up on the time of day, which is fine for a walk or a gallery, but for a
 * food stop it offered supper for a 09:15 breakfast slot and breakfast for a
 * 19:30 supper.
 *
 * `tripDays` is the whole trip's days, when the caller has them. A stop already
 * planned on another day is then offered only once nothing new is left: with
 * the one day to go on, about one swap in five on a short trip repeated a stop
 * from elsewhere in the plan. Left out, the swap behaves as it always did.
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
  tripDays: readonly ItineraryDay[] = [],
): ItineraryItem {
  if (isTravelAnchor(item)) throw new AnchorSwapError()

  // The same bank as the plan, so a swap on a London day is a London stop in
  // pounds, never a Paris one in euros.
  const { templates: pool, currency } = draftBankFor(trip)
  const random = mulberry32(
    hashString(`${trip.id}:alt:${day.id}:${item.title}:${item.startTime}:${variant}`),
  )
  const timed = isValidTime(item.startTime)
  const start = timeToMinutes(item.startTime)
  const nextStart = day.items
    .map((other) => timeToMinutes(other.startTime))
    .filter((minutes) => minutes > start)
    .reduce((earliest, minutes) => Math.min(earliest, minutes), LAST_MINUTE + BUFFER_MINUTES)
  const departure = day.items.find(
    (other) => other !== item && anchorRoleOf(other) === 'departure' && isValidTime(other.startTime),
  )
  const departureStart = departure === undefined ? null : timeToMinutes(departure.startTime)
  const beforeDeparture = timed && departureStart !== null && start < departureStart

  const onDay = new Set([item.title, ...day.items.map((other) => other.title)])
  const bookable = pool.filter((template) => !isAnchor(template))
  const inTime = (template: DraftTemplate): boolean =>
    !beforeDeparture ||
    departureStart === null ||
    start + template.durationMinutes <= departureStart - FINAL_DAY_BUFFER_MINUTES
  const offered = bookable.filter(inTime)
  if (offered.length === 0) throw new Error(NO_ALTERNATIVE_BEFORE_DEPARTURE_MESSAGE)
  const daytimeSafe = offered.filter(
    (template) => !timed || start >= EVENING_MINUTES || template.category !== 'nightlife',
  )
  // The meals the rest of the day already has, so a swap does not add a second lunch.
  const mealsElsewhere = new Set(
    day.items
      .filter((other) => other !== item)
      .map((other) => bookable.find((template) => template.title === other.title)?.meal)
      .filter((meal) => meal !== undefined),
  )
  const usualTime = (template: DraftTemplate): boolean =>
    !timed || Math.abs(timeToMinutes(template.startTime) - start) <= MAX_DRIFT_MINUTES
  // Held to on every path below, the last resort included.
  const mealAtMealTime = (template: DraftTemplate): boolean =>
    template.meal === undefined || usualTime(template)
  const fresh = (daytimeSafe.length > 0 ? daytimeSafe : offered).filter(
    (template) =>
      !onDay.has(template.title) &&
      mealAtMealTime(template) &&
      (template.meal === undefined || !mealsElsewhere.has(template.meal)),
  )
  const onOtherDays = new Set(
    tripDays.filter((other) => other.id !== day.id).flatMap((other) => other.items.map((entry) => entry.title)),
  )
  const unplanned = fresh.filter((template) => !onOtherDays.has(template.title))

  const sameCategory = (template: DraftTemplate): boolean => template.category === item.category
  const beforeNext = (template: DraftTemplate): boolean =>
    start + template.durationMinutes <= nextStart - BUFFER_MINUTES
  const beforeMidnight = (template: DraftTemplate): boolean =>
    start + template.durationMinutes <= LAST_MINUTE
  const tiers: Array<(template: DraftTemplate) => boolean> = [
    (template) => sameCategory(template) && usualTime(template) && beforeNext(template),
    (template) => sameCategory(template) && beforeNext(template),
    (template) => sameCategory(template) && beforeMidnight(template),
    (template) => usualTime(template) && beforeNext(template),
    beforeNext,
    beforeMidnight,
    () => true,
  ]
  const firstTier = (templates: readonly DraftTemplate[]): DraftTemplate[] | undefined =>
    tiers.map((tier) => templates.filter(tier)).find((tier) => tier.length > 0)
  const candidates =
    firstTier(unplanned) ??
    firstTier(fresh) ??
    // Only reachable if the day already holds every stop that fits.
    offered.filter((template) => template.title !== item.title && mealAtMealTime(template))
  if (candidates.length === 0) {
    throw new Error(
      beforeDeparture
        ? NO_ALTERNATIVE_BEFORE_DEPARTURE_MESSAGE
        : 'We could not find a different suggestion. Your plan is unchanged.',
    )
  }
  const chosen = choose(candidates, random)

  return toItem(trip, chosen, currency, timestamp, {
    startTime: item.startTime,
    endTime: timed ? minutesToTime(start + chosen.durationMinutes) : item.endTime,
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
