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
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a8/Tour_Eiffel_Wikimedia_Commons.jpg/960px-Tour_Eiffel_Wikimedia_Commons.jpg',
    alt: 'The Eiffel Tower rising above the Paris skyline on a clear day',
    credit: commons('Benh LIEU SONG', 'Public domain', 'File:Tour_Eiffel_Wikimedia_Commons.jpg'),
  },
  louvre: {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/66/Louvre_Museum_Wikimedia_Commons.jpg/960px-Louvre_Museum_Wikimedia_Commons.jpg',
    alt: 'The Louvre Museum glass pyramid framed by the palace courtyard',
    credit: commons('Benh LIEU SONG', 'CC BY-SA 3.0', 'File:Louvre_Museum_Wikimedia_Commons.jpg'),
  },
  orsay: {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e0/Musee_d_Orsay_main_hall_Paris_2023_dllu.jpg/960px-Musee_d_Orsay_main_hall_Paris_2023_dllu.jpg',
    alt: 'The grand main hall of the Musee d Orsay with its arched ceiling and clock',
    credit: commons('Daniel Lu', 'CC BY-SA 4.0', 'File:Musee_d_Orsay_main_hall_Paris_2023_dllu.jpg'),
  },
  sainteChapelle: {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/36/Sainte_Chapelle_Interior_Stained_Glass.jpg/960px-Sainte_Chapelle_Interior_Stained_Glass.jpg',
    alt: 'Sunlight passing through the stained glass windows of Sainte-Chapelle',
    credit: commons('Oldmanisold', 'CC BY-SA 4.0', 'File:Sainte_Chapelle_Interior_Stained_Glass.jpg'),
  },
  sacreCoeur: {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a9/Sacre_Coeur_cor_Jesu-DSC_1455w.jpg/960px-Sacre_Coeur_cor_Jesu-DSC_1455w.jpg',
    alt: 'The white domes of the Sacre-Coeur basilica above Montmartre',
    credit: commons('P e z i', 'CC BY-SA 3.0', 'File:Sacre_Coeur_cor_Jesu-DSC_1455w.jpg'),
  },
  luxembourg: {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/53/Albert_Edelfelt_-_The_Luxembourg_Gardens%2C_Paris.jpg/960px-Albert_Edelfelt_-_The_Luxembourg_Gardens%2C_Paris.jpg',
    alt: 'A painting of the Luxembourg Gardens with tree-lined gravel walks',
    credit: commons('Albert Edelfelt', 'Public domain', 'File:Albert_Edelfelt_-_The_Luxembourg_Gardens,_Paris.jpg'),
  },
  seine: {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e5/Seine_wide.jpg/960px-Seine_wide.jpg',
    alt: 'The Seine river in Paris lit up at night with bridges in view',
    credit: commons('Jean-Pierre Lavoie', 'CC BY-SA 3.0', 'File:Seine_wide.jpg'),
  },
  montmartre: {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3f/Basilique_du_Sacr%C3%A9-C%C5%93ur_de_Montmartre_-_Paris_-_GT-01_-_2024.jpg/960px-Basilique_du_Sacr%C3%A9-C%C5%93ur_de_Montmartre_-_Paris_-_GT-01_-_2024.jpg',
    alt: 'The Basilica of the Sacre-Coeur and the rooftops of Montmartre',
    credit: commons('Terragio67', 'CC BY-SA 4.0', 'File:Basilique_du_Sacr%C3%A9-C%C5%93ur_de_Montmartre_-_Paris_-_GT-01_-_2024.jpg'),
  },
  palaisRoyal: {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/72/Palais_Royal%2C_Paris_%28courtyard_-_interior%29.jpg/960px-Palais_Royal%2C_Paris_%28courtyard_-_interior%29.jpg',
    alt: 'The arcaded courtyard of the Palais Royal with its colonnaded walkways',
    credit: commons('Britchi Mirela', 'CC BY-SA 3.0', 'File:Palais_Royal,_Paris_(courtyard_-_interior).jpg'),
  },
  notreDame: {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/42/Notre_Dame_Paris_front_facade_lower.jpg/960px-Notre_Dame_Paris_front_facade_lower.jpg',
    alt: 'The lower western facade and towers of Notre-Dame de Paris',
    credit: commons('Benh LIEU SONG', 'CC BY-SA 3.0', 'File:Notre_Dame_Paris_front_facade_lower.jpg'),
  },
  versailles: {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/51/Water_reflection_of_the_Orangerie_garden_and_Palace_of_Versailles_with_blue_sky_in_France.jpg/960px-Water_reflection_of_the_Orangerie_garden_and_Palace_of_Versailles_with_blue_sky_in_France.jpg',
    alt: 'Still water reflecting the Orangerie garden and Palace of Versailles',
    credit: commons('Basile Morin', 'CC BY-SA 4.0', 'File:Water_reflection_of_the_Orangerie_garden_and_Palace_of_Versailles_with_blue_sky_in_France.jpg'),
  },
  canal: {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d2/Paris_Canal_St-Martin_%C3%A9cluses_R%C3%A9collets_2013.jpg/960px-Paris_Canal_St-Martin_%C3%A9cluses_R%C3%A9collets_2013.jpg',
    alt: 'Canal Saint-Martin in Paris with its stone lock gates and tree-lined banks',
    credit: commons('JLPC', 'CC BY-SA 3.0', 'File:Paris_Canal_St-Martin_%C3%A9cluses_R%C3%A9collets_2013.jpg'),
  },
  marais: {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7e/H%C3%B4tel_H%C3%A9rouet%2C_Le_Marais%2C_Paris_May_2017.jpg/960px-H%C3%B4tel_H%C3%A9rouet%2C_Le_Marais%2C_Paris_May_2017.jpg',
    alt: 'A historic townhouse facade on a quiet street in Le Marais',
    credit: commons('Guilhem Vellut', 'CC BY 2.0', 'File:H%C3%B4tel_H%C3%A9rouet,_Le_Marais,_Paris_May_2017.jpg'),
  },
  metro: {
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/ce/Paris_Metro_2_Porte_Dauphine_Libellule.JPG/960px-Paris_Metro_2_Porte_Dauphine_Libellule.JPG',
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
    image: 'marais',
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
