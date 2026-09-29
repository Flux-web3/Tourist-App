import { getDestination, type Destination } from '@/data/destinations'
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
 * Where the trip is comes from `trip.destinationId` alone, never from the
 * free-text `trip.destination`: searching that text for "paris" is how a
 * London trip once received the Paris guide. See `draftBankFor` for which
 * bank each destination drafts from and what currency its prices are in.
 * Landmark names are only used for a destination that has a curated bank;
 * any other destination receives generic, clearly-draft phrasing rather than
 * invented specifics.
 *
 * A day is laid out by three rules: the arrival opens day one, the departure
 * closes the final day, and every other stop starts at its template's natural
 * time or just after the previous stop ends, whichever is later. A stop that
 * cannot fit that way is left out rather than stacked on top of another.
 */

/**
 * The reference currency of the template bank, and the currency of any draft
 * that has no catalogue destination.
 *
 * The Paris and generic template costs are not unitless: they are Paris prices
 * in euros (the Eiffel Tower summit is €29, the Louvre €22), with the generic
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
  /**
   * Generic bank only: `location` for a trip with a catalogue destination,
   * with `{city}` standing for the city. `location` itself stays city-free
   * because a trip with no catalogue destination must not be given a guessed
   * one.
   */
  cityLocation?: string
  /**
   * Set on the London and Lagos entries, which share a pool with generic
   * stops. The picker prefers a landmark over a generic stop it would
   * otherwise tie with, so the draft reads as that city first. Paris's bank is
   * all landmarks with nothing generic mixed in, so it needs no flag.
   */
  landmark?: true
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

/**
 * Stops that fit any city, priced at the same Paris-euro reference level as
 * `PARIS_TEMPLATES`. A catalogue destination gets them with its city in the
 * location and its own local prices (`localiseGeneric`); a trip with no
 * catalogue destination gets them exactly as written.
 */
const GENERIC_TEMPLATES: DraftTemplate[] = [
  {
    id: 'gen_breakfast',
    title: 'Breakfast where the locals eat',
    category: 'food',
    location: 'City centre',
    cityLocation: 'Central {city}',
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
    cityLocation: 'Historic {city}',
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
    cityLocation: '{city} museum quarter',
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
    cityLocation: 'Central market, {city}',
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
    cityLocation: 'Highest accessible point in {city}',
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
    cityLocation: 'A park in central {city}',
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
    cityLocation: 'Old quarter, {city}',
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
    cityLocation: 'A residential neighbourhood of {city}',
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
    cityLocation: '{city} nightlife quarter',
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
    cityLocation: 'Out of {city}',
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
    cityLocation: 'Your accommodation, then out of {city}',
    description: 'A short final loop, then allow the extra hour for the transfer.',
    startTime: '09:00',
    endTime: '11:00',
    estimatedCost: 20,
    durationMinutes: 120,
    interest: null,
    role: 'departure',
  },
]

/**
 * London landmarks, priced in pounds at roughly current adult walk-up rates.
 * They are illustrative draft estimates like every other generated price, and
 * are written in GBP directly rather than scaled from the euro reference.
 */
const LONDON_TEMPLATES: DraftTemplate[] = [
  {
    id: 'lon_breakfast',
    title: 'Full English at a neighbourhood café',
    category: 'food',
    location: 'Marylebone',
    description:
      'Eggs, bacon, beans and a pot of tea at a proper café, the kind with steamed-up windows and a regular in every corner.',
    startTime: '08:30',
    endTime: '09:30',
    estimatedCost: 14,
    durationMinutes: 60,
    interest: 'food',
    landmark: true,
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
    landmark: true,
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
    landmark: true,
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
    landmark: true,
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
    landmark: true,
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
    landmark: true,
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
    landmark: true,
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
    landmark: true,
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
    landmark: true,
  },
  {
    id: 'lon_tea',
    title: 'Afternoon tea',
    category: 'food',
    location: 'Mayfair',
    description:
      'Sandwiches, scones with clotted cream and a stand of small cakes. Book ahead and do not plan a big dinner.',
    startTime: '15:30',
    endTime: '17:00',
    estimatedCost: 55,
    durationMinutes: 90,
    interest: 'food',
    landmark: true,
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
    landmark: true,
  },
  {
    id: 'lon_eye',
    title: 'London Eye at dusk',
    category: 'sightseeing',
    location: 'South Bank',
    description:
      'One slow half-hour rotation as the lights come on along the Thames, with Parliament right below.',
    startTime: '18:00',
    endTime: '19:00',
    estimatedCost: 32,
    durationMinutes: 60,
    interest: 'relaxed',
    landmark: true,
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
    landmark: true,
  },
  {
    id: 'lon_pubs',
    title: 'Historic pubs off Fleet Street',
    category: 'nightlife',
    location: 'The City of London',
    description:
      'Three old pubs down narrow courts, all walkable. Ye Olde Cheshire Cheese is the one to finish in.',
    startTime: '20:00',
    endTime: '22:30',
    estimatedCost: 30,
    durationMinutes: 150,
    interest: 'nightlife',
    landmark: true,
  },
  {
    id: 'lon_arrive',
    title: 'Arrive via Heathrow or St Pancras and check in',
    category: 'transit',
    location: 'Your hotel',
    description:
      'The Elizabeth line or the Piccadilly line in from Heathrow, or straight off the train at St Pancras. Drop the bags and take one slow loop around the block.',
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
    description:
      'Pack, settle the room, and leave the extra hour for the Elizabeth line out to Heathrow. Gatwick, Stansted and Luton are different runs entirely, so check the ticket.',
    startTime: '08:00',
    endTime: '10:00',
    estimatedCost: 13,
    durationMinutes: 120,
    interest: null,
    role: 'departure',
  },
]

/**
 * Lagos landmarks, priced in naira in whole ₦500 steps. Illustrative draft
 * estimates like every other generated price; street food and market spend
 * vary a lot, and the airport runs are priced as a pre-booked car.
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
    landmark: true,
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
    landmark: true,
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
    landmark: true,
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
    landmark: true,
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
    landmark: true,
  },
  {
    id: 'lag_nike',
    title: 'Nike Art Gallery',
    category: 'culture',
    location: 'Lekki',
    description:
      'Four floors of Nigerian art, from adire textiles to contemporary painting. Free to enter; take your time on the top floor.',
    startTime: '11:00',
    endTime: '13:00',
    estimatedCost: 0,
    durationMinutes: 120,
    interest: 'culture',
    landmark: true,
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
    landmark: true,
  },
  {
    id: 'lag_kalakuta',
    title: 'Kalakuta Republic Museum',
    category: 'culture',
    location: 'Ikeja',
    description:
      'Fela Kuti’s former home, now a museum of his rooms, instruments and stage costumes, with a terrace on the roof.',
    startTime: '13:30',
    endTime: '15:00',
    estimatedCost: 5000,
    durationMinutes: 90,
    interest: 'culture',
    landmark: true,
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
    landmark: true,
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
    landmark: true,
  },
  {
    id: 'lag_freedom_park',
    title: 'Evening at Freedom Park',
    category: 'culture',
    location: 'Lagos Island',
    description:
      'The old colonial prison grounds, now a park with a stage. There is usually live music or a play at the weekend.',
    startTime: '17:30',
    endTime: '19:30',
    estimatedCost: 2000,
    durationMinutes: 120,
    interest: 'culture',
    landmark: true,
  },
  {
    id: 'lag_terra_kulture',
    title: 'A play at Terra Kulture',
    category: 'nightlife',
    location: 'Victoria Island',
    description:
      'Nigerian theatre in an intimate arts centre. Eat at its restaurant first; the show starts on time.',
    startTime: '18:00',
    endTime: '20:30',
    estimatedCost: 10000,
    durationMinutes: 150,
    interest: 'nightlife',
    landmark: true,
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
    landmark: true,
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
    landmark: true,
  },
  {
    id: 'lag_arrive',
    title: 'Arrive at Murtala Muhammed Airport and check in',
    category: 'transit',
    location: 'Your hotel',
    description:
      'Clear arrivals at Murtala Muhammed in Ikeja, then a pre-booked car to the hotel. Allow two hours for the drive; the traffic decides.',
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
    description:
      'Settle the room and leave far more time than the distance suggests; the drive to Ikeja is the unpredictable part of the day.',
    startTime: '08:00',
    endTime: '10:30',
    estimatedCost: 25000,
    durationMinutes: 150,
    interest: null,
    role: 'departure',
  },
]

/**
 * A curated bank for one catalogue destination.
 *
 * `mixGeneric` false means the bank stands alone: Paris has its own food,
 * nightlife and anchors, and drafts exactly as it did before destinations had
 * ids. True means the bank is that city's anchors plus a short list of
 * landmarks, topped up with the localised generic bank minus `supersedes`, so
 * a long trip never runs dry and the pool stays at least twice the busiest
 * day, which is what lets adjacent days never share a stop.
 */
interface LandmarkBank {
  templates: readonly DraftTemplate[]
  mixGeneric: boolean
  /** Generic stops a landmark already does better, e.g. breakfast in London. */
  supersedes: readonly string[]
}

const LANDMARK_BANKS: Readonly<Partial<Record<string, LandmarkBank>>> = {
  paris: { templates: PARIS_TEMPLATES, mixGeneric: false, supersedes: [] },
  london: {
    templates: LONDON_TEMPLATES,
    mixGeneric: true,
    supersedes: ['gen_breakfast', 'gen_museum', 'gen_market', 'gen_night'],
  },
  lagos: {
    templates: LAGOS_TEMPLATES,
    mixGeneric: true,
    supersedes: ['gen_breakfast', 'gen_old_town', 'gen_market', 'gen_night', 'gen_shops'],
  },
}

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

function isAnchor(template: DraftTemplate): boolean {
  return template.role !== undefined
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
 * - A destination with a standalone bank (Paris): that bank, in its currency.
 * - A destination with a landmark bank (London, Lagos): its landmarks and
 *   anchors, topped up with the generic bank localised to it.
 * - Any other catalogue destination: the generic bank localised to it.
 * - No catalogue destination: the generic bank as written, at reference
 *   prices labelled `DRAFT_PRICE_CURRENCY`. There is no city to name and no
 *   price level to apply, and guessing one from the text is the bug this
 *   replaced.
 */
function draftBankFor(trip: Trip): DraftBank {
  const destination = getDestination(trip.destinationId)
  if (destination === null) return { templates: GENERIC_TEMPLATES, currency: DRAFT_PRICE_CURRENCY }

  const bank = LANDMARK_BANKS[destination.id]
  const generic = GENERIC_TEMPLATES.map((template) => localiseGeneric(template, destination))
  if (bank === undefined) return { templates: generic, currency: destination.currency }
  if (!bank.mixGeneric) return { templates: bank.templates, currency: destination.currency }
  return {
    templates: [
      ...bank.templates,
      // The bank brings its own arrival and departure; generic ones would be
      // a second airport run.
      ...generic.filter((template) => !isAnchor(template) && !bank.supersedes.includes(template.id)),
    ],
    currency: destination.currency,
  }
}

/**
 * Chooses one stop from `candidates`, which the caller has already cleared of
 * anything that may not appear today.
 *
 * Preference: a stop that matches the traveller's interests and has not been
 * used on this trip yet, then any unused stop, then — once a long trip has
 * worked through the bank — the least recently used one. Within either unused
 * tier a landmark beats a generic stop, so a London draft leads with London
 * rather than "Old town walking loop"; a bank with no landmark flags (Paris,
 * generic) is unaffected. Ties go to the seeded `random()` over a
 * deterministically ordered array, so the same trip and variant always pick
 * the same stops.
 */
function pickTemplate(
  candidates: readonly DraftTemplate[],
  random: () => number,
  lastUsed: ReadonlyMap<string, number>,
  interests: readonly TravelInterest[],
): DraftTemplate | null {
  if (candidates.length === 0) return null
  const landmarksFirst = (tier: readonly DraftTemplate[]): readonly DraftTemplate[] => {
    const landmarks = tier.filter((template) => template.landmark === true)
    return landmarks.length > 0 ? landmarks : tier
  }
  const fresh = candidates.filter((template) => !lastUsed.has(template.id))
  const preferredFresh = fresh.filter(
    (template) => template.interest !== null && interests.includes(template.interest),
  )
  if (preferredFresh.length > 0) return choose(landmarksFirst(preferredFresh), random)
  if (fresh.length > 0) return choose(landmarksFirst(fresh), random)

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
  // The same bank as the plan, so a swap on a London day is a London stop in
  // pounds, never a Paris one in euros.
  const { templates: pool, currency } = draftBankFor(trip)
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

  return toItem(trip, chosen, currency, timestamp, {
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
