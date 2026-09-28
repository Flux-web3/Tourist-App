import type { Experience, ImageCredit, ItineraryCategory } from '@/domain/types'

/**
 * Curated demo catalogue.
 *
 * Every record is local, hand-written data for a Paris prototype: prices are
 * estimates, ratings are illustrative demo figures, and opening hours are
 * typical ranges rather than live availability. The UI labels this as a demo
 * catalogue so nothing reads as a live booking quote.
 *
 * Photography comes from Wikimedia Commons and is attributed per record.
 */

interface SeedImage {
  url: string
  alt: string
  credit: ImageCredit
}

function commons(author: string, license: string, source: string): SeedImage['credit'] {
  return {
    author,
    license,
    sourceUrl: `https://commons.wikimedia.org/wiki/${source}`,
  }
}

const IMAGES = {
  eiffel: {
    url: '/images/eiffel-tower.jpg',
    alt: 'The Eiffel Tower seen across the Trocadero fountains at sunset, with the Champ de Mars and the low Paris skyline behind it',
    credit: commons(
      'Matthias Süßen',
      'CC BY-SA 4.0',
      'File:Eiffel_Tower_from_Trocadero-2026-07-msu--.jpg',
    ),
  },
  louvre: {
    url: '/images/louvre.jpg',
    alt: 'The Louvre Museum glass pyramid framed by the palace courtyard',
    credit: commons('Benh LIEU SONG', 'CC BY-SA 3.0', 'File:Louvre_Museum_Wikimedia_Commons.jpg'),
  },
  orsay: {
    url: '/images/musee-dorsay.jpg',
    alt: 'The grand main hall of the Musee d Orsay with its arched ceiling and clock',
    credit: commons('Daniel Lu', 'CC BY-SA 4.0', 'File:Musee_d_Orsay_main_hall_Paris_2023_dllu.jpg'),
  },
  sainteChapelle: {
    url: '/images/sainte-chapelle.jpg',
    alt: 'Sunlight passing through the stained glass windows of Sainte-Chapelle',
    credit: commons('Oldmanisold', 'CC BY-SA 4.0', 'File:Sainte_Chapelle_Interior_Stained_Glass.jpg'),
  },
  sacreCoeur: {
    url: '/images/sacre-coeur.jpg',
    alt: 'The pale stone facade and domes of the Sacre-Coeur basilica in evening light, with visitors gathered along the terrace below',
    credit: commons(
      'iMahesh',
      'CC BY-SA 4.0',
      'File:Sacr%C3%A9-C%C5%93ur_Basilica_-_Main_facade_and_white_domes_from_the_steps.jpg',
    ),
  },
  luxembourg: {
    url: '/images/luxembourg-gardens.jpg',
    alt: 'The Luxembourg Palace behind the long formal lawn of the Luxembourg Gardens, with flower beds and palms in the foreground',
    credit: commons('The wub', 'CC BY-SA 4.0', 'File:Jardin_du_Luxembourg_2025-09-05_(3).jpg'),
  },
  seine: {
    url: '/images/seine.jpg',
    alt: 'The Seine in Paris seen from a bridge, with barges moored along both quays and a stone arch bridge downstream',
    credit: commons(
      'Guilhem Vellut',
      'CC BY 2.0',
      'File:Seine_from_Pont_Alexandre_III_@_Paris_(33517532784).jpg',
    ),
  },
  palaisRoyal: {
    url: '/images/palais-royal.jpg',
    alt: 'A gravel walk through the Palais Royal garden between two rows of closely clipped lime trees, with the arcaded galleries at the far end',
    credit: commons('Hameltion', 'CC BY-SA 4.0', 'File:Jardin_du_Palais-Royal_(2023-05-28).jpg'),
  },
  notreDame: {
    url: '/images/notre-dame.jpg',
    alt: 'The restored west front of Notre-Dame de Paris, showing both towers, the rose window, the gallery of stone kings and the three portals',
    credit: commons(
      'Diego Delso',
      'CC BY-SA 4.0',
      'File:Catedral_de_Notre_Dame,_Par%C3%ADs,_Francia,_2026-04-05,_DD_57.jpg',
    ),
  },
  versailles: {
    url: '/images/versailles.jpg',
    alt: 'Still water reflecting the Orangerie garden and Palace of Versailles',
    credit: commons('Basile Morin', 'CC BY-SA 4.0', 'File:Water_reflection_of_the_Orangerie_garden_and_Palace_of_Versailles_with_blue_sky_in_France.jpg'),
  },
  canal: {
    url: '/images/canal-saint-martin.jpg',
    alt: 'Canal Saint-Martin in Paris with its stone lock gates and tree-lined banks',
    credit: commons('JLPC', 'CC BY-SA 3.0', 'File:Paris_Canal_St-Martin_%C3%A9cluses_R%C3%A9collets_2013.jpg'),
  },
  marais: {
    url: '/images/le-marais.jpg',
    alt: 'The brick and stone arcaded facades of the Place des Vosges in Le Marais, with the central fountain and lawn in front of them',
    credit: commons(
      'Diego Delso',
      'CC BY-SA 4.0',
      'File:Plaza_de_los_Vosgos,_Par%C3%ADs,_Francia,_2022-10-30,_DD_58.jpg',
    ),
  },
  market: {
    url: '/images/food-market.jpg',
    alt: 'Fruit and vegetable stalls under awnings at a Paris street market, with chalkboard price signs above the produce and shoppers walking past',
    credit: commons(
      'Sanshiro KUBOTA',
      'CC BY 2.0',
      'File:March%C3%A9_Bastille,_Paris_6_August_2020.jpg',
    ),
  },
  metro: {
    url: '/images/metro-art.jpg',
    alt: 'A Paris Metro entrance with its decorative Art Nouveau signage',
    credit: commons('Bellomonte', 'CC0', 'File:Paris_Metro_2_Porte_Dauphine_Libellule.JPG'),
  },
} as const satisfies Record<string, SeedImage>

type ImageKey = keyof typeof IMAGES

interface SeedSpec {
  id: string
  name: string
  neighborhood: string
  category: ItineraryCategory
  summary: string
  description: string
  durationMinutes: number
  priceFrom: number
  isFree?: boolean
  rating: number
  reviewCount: number
  image: ImageKey
  tags: string[]
  hoursNote: string
  bestTime: string
}

const SEED_SPECS: SeedSpec[] = [
  {
    id: 'exp_eiffel_tower',
    name: 'Eiffel Tower Summit',
    neighborhood: '7th arrondissement',
    category: 'sightseeing',
    summary: 'Lift to the summit for the classic rooftop view over the Seine.',
    description:
      'Ride the lift to the top of the tower and walk the outer summit platform. Best booked for the hour before sunset, when the city reads warm and the lights come on across the river.',
    durationMinutes: 150,
    priceFrom: 29,
    rating: 4.7,
    reviewCount: 3120,
    image: 'eiffel',
    tags: ['iconic', 'views', 'sunset'],
    hoursNote: 'Demo hours: roughly 09:30 - 23:45 daily',
    bestTime: 'Late afternoon',
  },
  {
    id: 'exp_louvre_museum',
    name: 'Louvre Museum',
    neighborhood: '1st arrondissement',
    category: 'culture',
    summary: 'The monumental collection, with a timed-entry route that avoids the queue.',
    description:
      'The world\u2019s largest museum is overwhelming without a plan. Enter through the Richelieu wing, take the Denon wing highlights first, and save the Mona Lisa for the end of the route.',
    durationMinutes: 180,
    priceFrom: 22,
    rating: 4.7,
    reviewCount: 9840,
    image: 'louvre',
    tags: ['museum', 'art', 'monuments'],
    hoursNote: 'Demo hours: 09:00 - 18:00, closed Tuesdays',
    bestTime: 'Morning, at opening',
  },
  {
    id: 'exp_musee_dorsay',
    name: 'Musée d\u2019Orsay',
    neighborhood: '7th arrondissement',
    category: 'culture',
    summary: 'Impressionist masterpieces inside a converted Beaux-Arts station.',
    description:
      'A gentler museum than the Louvre, with a superb clock window on the fifth floor and the impressionist collection on level five. Pairs well with a walk along the Esplanade des Invalides.',
    durationMinutes: 150,
    priceFrom: 16,
    rating: 4.8,
    reviewCount: 4210,
    image: 'orsay',
    tags: ['museum', 'impressionism', 'architecture'],
    hoursNote: 'Demo hours: 09:30 - 18:00, closed Mondays',
    bestTime: 'Late morning',
  },
  {
    id: 'exp_sainte_chapelle',
    name: 'Sainte-Chapelle',
    neighborhood: 'Île de la Cité',
    category: 'sightseeing',
    summary: 'A wall of medieval stained glass in a chapel built for exactly that.',
    description:
      'Fifteen windows of 13th-century glass, held in a chapel that is startlingly bright when the sun is out. Go with Notre-Dame next door, then walk to Pont Neuf for the oldest bridge in the city.',
    durationMinutes: 60,
    priceFrom: 13,
    rating: 4.7,
    reviewCount: 5140,
    image: 'sainteChapelle',
    tags: ['architecture', 'stained glass', 'quick'],
    hoursNote: 'Demo hours: 09:00 - 17:00 daily',
    bestTime: 'Midday, for the light',
  },
  {
    id: 'exp_sacre_coeur',
    name: 'Sacré-Cœur & Montmartre',
    neighborhood: 'Montmartre',
    category: 'sightseeing',
    summary: 'The hilltop basilica, the artists\u2019 square, and the lanes behind it.',
    description:
      'Climb the steps past the artists setting up their easels, look back over the rooftops from the terrace, then drop into the back streets for a village feel that is hard to believe is minutes from the city centre.',
    durationMinutes: 120,
    priceFrom: 0,
    isFree: true,
    rating: 4.7,
    reviewCount: 8630,
    image: 'sacreCoeur',
    tags: ['views', 'free', 'neighbourhood'],
    hoursNote: 'Demo hours: basilica open all day, square always open',
    bestTime: 'Early morning, before the crowds',
  },
  {
    id: 'exp_luxembourg_gardens',
    name: 'Luxembourg Gardens',
    neighborhood: '6th arrondissement',
    category: 'outdoors',
    summary: 'Formal lawns, a big carousel, and the best people-watching in the 6th.',
    description:
      'Perfect for a slow hour between museum blocks. The green chairs are free, the palace sits just north of the gardens, and the Medici Fountain is at the south end.',
    durationMinutes: 90,
    priceFrom: 0,
    isFree: true,
    rating: 4.6,
    reviewCount: 5470,
    image: 'luxembourg',
    tags: ['free', 'gardens', 'relaxed'],
    hoursNote: 'Demo hours: 07:30 - sunset daily',
    bestTime: 'Late afternoon',
  },
  {
    id: 'exp_seine_cruise',
    name: 'Seine Sunset Cruise',
    neighborhood: 'Port de la Conférence',
    category: 'sightseeing',
    summary: 'An hour on the river as the bridges light up one by one.',
    description:
      'The cheapest way to understand the city\u2019s geography. Board near Pont de l\u2019Alma and watch the Louvre, Notre-Dame and the Eiffel Tower pass in sequence.',
    durationMinutes: 90,
    priceFrom: 18,
    rating: 4.6,
    reviewCount: 6720,
    image: 'seine',
    tags: ['river', 'sunset', 'orientation'],
    hoursNote: 'Demo hours: hourly departures in season',
    bestTime: 'Sunset',
  },
  {
    id: 'exp_palais_royal',
    name: 'Palais Royal Courtyard',
    neighborhood: '1st arrondissement',
    category: 'culture',
    summary: 'A quiet arcaded courtyard with a columned gallery of shops.',
    description:
      'The most restful walk in the 1st. The arcades are free, the courtyard is planted with trimmed lime trees, and the galleries are a good place to browse without buying anything.',
    durationMinutes: 60,
    priceFrom: 0,
    isFree: true,
    rating: 4.5,
    reviewCount: 2180,
    image: 'palaisRoyal',
    tags: ['free', 'architecture', 'sheltered'],
    hoursNote: 'Demo hours: open all day, galleries 10:00 - 19:00',
    bestTime: 'Mid-morning',
  },
  {
    id: 'exp_notre_dame',
    name: 'Notre-Dame de Paris',
    neighborhood: 'Île de la Cité',
    category: 'sightseeing',
    summary: 'The restored cathedral square, and the park behind it.',
    description:
      'The square is worth the walk on its own after the restoration. The quiet park at the back, tucked against the river, is the part most visitors skip.',
    durationMinutes: 90,
    priceFrom: 0,
    isFree: true,
    rating: 4.8,
    reviewCount: 7340,
    image: 'notreDame',
    tags: ['cathedral', 'free', 'history'],
    hoursNote: 'Demo hours: 07:50 - 19:00 daily',
    bestTime: 'Morning',
  },
  {
    id: 'exp_versailles',
    name: 'Versailles Day Trip',
    neighborhood: 'Versailles',
    category: 'outdoors',
    summary: 'The palace, the gardens, and a long walk back through the grounds.',
    description:
      'A full day outside the city. Take the RER C from central Paris, do the Hall of Mirrors and a few state rooms, then lose yourself in the gardens and the village of Picpus next door.',
    durationMinutes: 300,
    priceFrom: 32,
    rating: 4.7,
    reviewCount: 4920,
    image: 'versailles',
    tags: ['day trip', 'palace', 'gardens'],
    hoursNote: 'Demo hours: 09:00 - 18:30 daily',
    bestTime: 'Full day, arriving at opening',
  },
  {
    id: 'exp_canal_saint_martin',
    name: 'Canal Saint-Martin Stroll',
    neighborhood: '10th arrondissement',
    category: 'outdoors',
    summary: 'Footbridges, canal-side benches and the most relaxed walk in north Paris.',
    description:
      'Walk the towpath past the lock gates and the footbridges, stop for a coffee, and see how completely different the city feels away from the monuments.',
    durationMinutes: 90,
    priceFrom: 0,
    isFree: true,
    rating: 4.5,
    reviewCount: 3260,
    image: 'canal',
    tags: ['free', 'canal', 'local'],
    hoursNote: 'Demo hours: always open, best in daylight',
    bestTime: 'Mid-morning',
  },
  {
    id: 'exp_marais_walk',
    name: 'Le Marais Walking Route',
    neighborhood: 'Le Marais',
    category: 'sightseeing',
    summary: 'Courtyards, historic facades and independent shops in one loop.',
    description:
      'A self-guided loop through the oldest part of the city: hidden courtyards at number 137, a covered market, and the run of galleries behind Rue des Rosiers.',
    durationMinutes: 120,
    priceFrom: 0,
    isFree: true,
    rating: 4.6,
    reviewCount: 2940,
    image: 'marais',
    tags: ['free', 'neighbourhood', 'shops'],
    hoursNote: 'Demo hours: streets always open, shops 10:00 - 19:00',
    bestTime: 'Late morning, when the shops open',
  },
  {
    id: 'exp_metro_art_ride',
    name: 'Paris Métro Art Ride',
    neighborhood: 'Citywide',
    category: 'transit',
    summary: 'A metro hop between the stations with the best kept artwork.',
    description:
      'Every Paris metro station was commissioned to a named artist. Ride between a handful of the best and treat the journey as the attraction. Fare is a standard single ticket.',
    durationMinutes: 90,
    priceFrom: 2.3,
    rating: 4.4,
    reviewCount: 1930,
    image: 'metro',
    tags: ['transport', 'art', 'cheap'],
    hoursNote: 'Demo hours: 05:30 - 00:30, roughly every 5 minutes',
    bestTime: 'Off-peak, to avoid crowding',
  },
  {
    id: 'exp_food_market_walk',
    name: 'Marché Food Walk',
    neighborhood: 'Bastille & 12th',
    category: 'food',
    summary: 'Cheese, charcuterie and a bakery stop, guided by a market regular.',
    description:
      'A walk through the covered market with a guide who knows every stall, ending with bread, cheese and a charcuterie box to take home. Booked in the prototype as a guided demo experience.',
    durationMinutes: 120,
    priceFrom: 38,
    rating: 4.7,
    reviewCount: 1540,
    image: 'market',
    tags: ['food', 'market', 'guided'],
    hoursNote: 'Demo hours: 10:00 - 15:00, market closed Mondays',
    bestTime: 'Late morning',
  },
]

export const EXPERIENCES: Experience[] = SEED_SPECS.map((spec) => ({
  id: spec.id,
  name: spec.name,
  city: 'Paris',
  country: 'France',
  neighborhood: spec.neighborhood,
  category: spec.category,
  summary: spec.summary,
  description: spec.description,
  durationMinutes: spec.durationMinutes,
  priceFrom: spec.priceFrom,
  currency: 'EUR',
  isFree: spec.isFree ?? spec.priceFrom === 0,
  rating: spec.rating,
  reviewCount: spec.reviewCount,
  imageUrl: IMAGES[spec.image].url,
  imageAlt: IMAGES[spec.image].alt,
  imageCredit: IMAGES[spec.image].credit,
  tags: spec.tags,
  hoursNote: spec.hoursNote,
  bestTime: spec.bestTime,
}))

export const EXPERIENCES_BY_ID: ReadonlyMap<string, Experience> = new Map(
  EXPERIENCES.map((experience) => [experience.id, experience]),
)

export const CATEGORIES: ReadonlyArray<{ value: ItineraryCategory | 'all'; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'sightseeing', label: 'Sightseeing' },
  { value: 'culture', label: 'Culture' },
  { value: 'food', label: 'Food' },
  { value: 'outdoors', label: 'Outdoors' },
  { value: 'shopping', label: 'Shopping' },
  { value: 'nightlife', label: 'Nightlife' },
]
