import type {
  Trip,
  ItineraryDay,
  ItineraryItem,
  Expense,
  Experience,
  User,
} from '@/types';

export function uid(): string {
  return Math.random().toString(36).slice(2, 11) + Date.now().toString(36).slice(-4);
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(start: string, end: string): number {
  const s = new Date(start);
  const e = new Date(end);
  return Math.round((e.getTime() - s.getTime()) / 86400000) + 1;
}

export function formatDate(dateStr: string, opts?: Intl.DateTimeFormatOptions): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', opts ?? { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatDateShort(dateStr: string): string {
  return formatDate(dateStr, { month: 'short', day: 'numeric' });
}

export function formatMoney(amount: number, currency = 'EUR'): string {
  const symbols: Record<string, string> = { EUR: '€', USD: '$', GBP: '£', NGN: '₦' };
  const sym = symbols[currency] ?? currency + ' ';
  return `${sym}${amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

// ─── Demo Data ──────────────────────────────────────────────

const DEMO_USER: User = {
  id: 'demo-user',
  email: 'demo@tourist.app',
  name: 'Demo Traveler',
  isDemo: true,
};

export const DEMO_TRIP: Trip = {
  id: 'demo-paris-trip',
  userId: DEMO_USER.id,
  title: 'Lagos → Paris',
  destination: 'Paris, France',
  startDate: addDays(todayISO(), 14),
  endDate: addDays(todayISO(), 20),
  travelerCount: 2,
  currency: 'EUR',
  budgetAmount: 2500,
  travelStyle: 'balanced',
  interests: ['food', 'culture', 'history', 'art'],
  status: 'upcoming',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const DEMO_ITINERARY: ItineraryDay[] = generateDemoItinerary();

function generateDemoItinerary(): ItineraryDay[] {
  const days: ItineraryDay[] = [];
  const activities = [
    { title: 'Arrival & Check-in', time: '14:00', endTime: '15:00', category: 'Transport', location: 'Hotel Marais', cost: 0, desc: 'Settle into your hotel in the Marais district.' },
    { title: 'Seine River Walk', time: '16:00', endTime: '18:00', category: 'Nature', location: 'Banks of the Seine', cost: 0, desc: 'Stroll along the Seine and take in iconic Parisian bridges.' },
    { title: 'Dinner at Le Comptoir', time: '19:30', endTime: '21:30', category: 'Food', location: 'Le Comptoir du Relais', cost: 65, desc: 'Classic French bistro dining in the 6th arrondissement.' },
    { title: 'Louvre Museum', time: '09:30', endTime: '13:00', category: 'Culture', location: 'Rue de Rivoli', cost: 22, desc: 'Explore the world\'s largest art museum. Focus on the Denon wing.' },
    { title: 'Lunch at Café Marly', time: '13:30', endTime: '15:00', category: 'Food', location: 'Inside the Louvre', cost: 45, desc: 'Elegant lunch overlooking the Louvre courtyard.' },
    { title: 'Tuileries Garden', time: '15:30', endTime: '17:00', category: 'Nature', location: 'Jardin des Tuileries', cost: 0, desc: 'Relax in the formal gardens between the Louvre and Place de la Concorde.' },
    { title: 'Montmartre & Sacré-Cœur', time: '10:00', endTime: '13:00', category: 'Culture', location: 'Butte Montmartre', cost: 0, desc: 'Explore the artistic quarter and visit the basilica with panoramic city views.' },
    { title: 'Lunch at Le Moulin de la Galette', time: '13:30', endTime: '15:00', category: 'Food', location: 'Rue Lepic', cost: 38, desc: 'Historic windmill restaurant serving traditional French cuisine.' },
    { title: 'Musée d\'Orsay', time: '16:00', endTime: '19:00', category: 'Art', location: 'Esplanade Valéry Giscard d\'Estaing', cost: 16, desc: 'Impressionist masterpieces in a stunning former railway station.' },
    { title: 'Eiffel Tower', time: '09:00', endTime: '11:30', category: 'Attractions', location: 'Champ de Mars', cost: 28, desc: 'Ascend the Eiffel Tower for breathtaking morning views of Paris.' },
    { title: 'Lunch Cruise on the Seine', time: '12:30', endTime: '14:30', category: 'Food', location: 'Port de la Bourdonnais', cost: 75, desc: 'Scenic lunch cruise along the Seine with commentary.' },
    { title: 'Champs-Élysées Walk', time: '15:30', endTime: '17:30', category: 'Shopping', location: 'Avenue des Champs-Élysées', cost: 0, desc: 'Stroll down the most famous avenue in Paris.' },
    { title: 'Jardin du Luxembourg', time: '10:00', endTime: '12:30', category: 'Nature', location: '6th arrondissement', cost: 0, desc: 'Beautiful French gardens with fountains, statues, and the Luxembourg Palace.' },
    { title: 'Lunch at Le Luxembourg', time: '13:00', endTime: '14:30', category: 'Food', location: 'Boulevard Saint-Michel', cost: 32, desc: 'Charming café near the gardens serving seasonal French dishes.' },
    { title: 'Panthéon Visit', time: '15:00', endTime: '17:00', category: 'History', location: 'Place du Panthéon', cost: 11, desc: 'Mausoleum housing remains of distinguished French citizens.' },
    { title: 'Versailles Day Trip', time: '08:30', endTime: '17:00', category: 'Culture', location: 'Palace of Versailles', cost: 30, desc: 'Day trip to the opulent Palace of Versailles and its magnificent gardens.' },
    { title: 'Le Marais Food Tour', time: '18:30', endTime: '21:00', category: 'Food', location: 'Le Marais district', cost: 55, desc: 'Guided food tour through one of Paris\'s oldest and most delicious neighborhoods.' },
    { title: 'Orangerie Museum', time: '10:00', endTime: '12:00', category: 'Art', location: 'Jardin des Tuileries', cost: 13, desc: 'Monet\'s Water Lilies in a purpose-built oval gallery.' },
    { title: 'Lunch at Les Cocottes', time: '13:00', endTime: '14:30', category: 'Food', location: 'Rue Saint-Dominique', cost: 42, desc: 'Modern French cuisine by chef Christian Constant.' },
    { title: 'Notre-Dame Area', time: '15:00', endTime: '17:00', category: 'History', location: 'Île de la Cité', cost: 0, desc: 'Explore the area around Notre-Dame and Sainte-Chapelle.' },
    { title: 'Packing & Departure Prep', time: '10:00', endTime: '12:00', category: 'Transport', location: 'Hotel', cost: 0, desc: 'Pack and prepare for departure.' },
    { title: 'Saint-Germain Shopping', time: '13:00', endTime: '16:00', category: 'Shopping', location: 'Saint-Germain-des-Prés', cost: 0, desc: 'Final shopping in the chic Saint-Germain neighborhood.' },
    { title: 'Farewell Dinner', time: '19:00', endTime: '21:30', category: 'Food', location: 'Brasserie Lipp', cost: 70, desc: 'Iconic Alsatian brasserie for a memorable farewell dinner.' },
  ];

  let actIdx = 0;
  for (let i = 0; i < 7; i++) {
    const dayId = `demo-day-${i + 1}`;
    const itemsPerDay = i === 6 ? 3 : 3;
    const items: ItineraryItem[] = [];
    for (let j = 0; j < itemsPerDay; j++) {
      const act = activities[actIdx % activities.length];
      items.push({
        id: `demo-item-${actIdx + 1}`,
        dayId,
        title: act.title,
        description: act.desc,
        category: act.category,
        location: act.location,
        startTime: act.time,
        endTime: act.endTime,
        estimatedCost: act.cost,
        sourceLabel: 'AI-generated draft',
        position: j,
        notes: '',
      });
      actIdx++;
    }
    days.push({
      id: dayId,
      tripId: DEMO_TRIP.id,
      date: addDays(DEMO_TRIP.startDate, i),
      position: i,
      items,
    });
  }
  return days;
}

const DEMO_EXPENSES: Expense[] = [
  { id: 'exp-1', tripId: DEMO_TRIP.id, title: 'Hotel booking deposit', category: 'accommodation', amount: 200, currency: 'EUR', date: addDays(todayISO(), -5), note: 'Deposit for Hotel Marais' },
  { id: 'exp-2', tripId: DEMO_TRIP.id, title: 'Flight tickets', category: 'transport', amount: 180, currency: 'EUR', date: addDays(todayISO(), -3), note: 'Lagos to Paris round trip' },
  { id: 'exp-3', tripId: DEMO_TRIP.id, title: 'Travel insurance', category: 'other', amount: 40, currency: 'EUR', date: addDays(todayISO(), -2), note: '' },
];

const PLACES: Experience[] = [
  { id: 'p1', name: 'Le Comptoir du Relais', category: 'restaurants', description: 'Beloved neighborhood bistro serving refined French classics in an intimate setting.', location: '6th arrondissement', estimatedPrice: 65, source: 'Curated guide', freshnessLabel: 'Updated monthly', neighborhood: 'Saint-Germain' },
  { id: 'p2', name: 'Breizh Café', category: 'restaurants', description: 'Authentic Breton crêpes made with organic buckwheat and fresh ingredients.', location: '3rd arrondissement', estimatedPrice: 25, source: 'Curated guide', freshnessLabel: 'Updated monthly', neighborhood: 'Le Marais' },
  { id: 'p3', name: 'Septime', category: 'restaurants', description: 'Trendy Michelin-starred restaurant offering a seasonal tasting menu.', location: '11th arrondissement', estimatedPrice: 120, source: 'Curated guide', freshnessLabel: 'Updated monthly', neighborhood: 'Charonne' },
  { id: 'p4', name: 'Louvre Museum', category: 'attractions', description: 'The world\'s largest art museum, home to the Mona Lisa, Venus de Milo, and thousands of masterworks.', location: '1st arrondissement', estimatedPrice: 22, source: 'Curated guide', freshnessLabel: 'Updated monthly', neighborhood: 'Palais Royal' },
  { id: 'p5', name: 'Eiffel Tower', category: 'attractions', description: 'Paris\'s most iconic landmark. Ascend to the summit for panoramic city views.', location: '7th arrondissement', estimatedPrice: 28, source: 'Curated guide', freshnessLabel: 'Updated monthly', neighborhood: 'Gros-Caillou' },
  { id: 'p6', name: 'Musée d\'Orsay', category: 'attractions', description: 'Housed in a former railway station, featuring Impressionist and Post-Impressionist masterpieces.', location: '7th arrondissement', estimatedPrice: 16, source: 'Curated guide', freshnessLabel: 'Updated monthly', neighborhood: 'Saint-Thomas-d\'Aquin' },
  { id: 'p7', name: 'Jardin du Luxembourg', category: 'parks', description: '23 hectares of formal French gardens, fountains, statues, and the beautiful Luxembourg Palace.', location: '6th arrondissement', estimatedPrice: 0, source: 'Curated guide', freshnessLabel: 'Updated monthly', neighborhood: 'Odéon' },
  { id: 'p8', name: 'Parc des Buttes-Chaumont', category: 'parks', description: 'Dramatic hilly park with cliffs, a lake, and a temple perched on a rocky island.', location: '19th arrondissement', estimatedPrice: 0, source: 'Curated guide', freshnessLabel: 'Updated monthly', neighborhood: 'Belleville' },
  { id: 'p9', name: 'Tuileries Garden', category: 'parks', description: 'Classic French formal garden between the Louvre and Place de la Concorde.', location: '1st arrondissement', estimatedPrice: 0, source: 'Curated guide', freshnessLabel: 'Updated monthly', neighborhood: 'Palais Royal' },
  { id: 'p10', name: 'Le Comptoir Général', category: 'nightlife', description: 'Eclectic bar and cultural venue celebrating African diaspora culture.', location: '10th arrondissement', estimatedPrice: 20, source: 'Curated guide', freshnessLabel: 'Updated monthly', neighborhood: 'Canal Saint-Martin' },
  { id: 'p11', name: 'Candelaria', category: 'nightlife', description: 'Hidden cocktail bar behind a taco counter. One of the best speakeasies in Paris.', location: '11th arrondissement', estimatedPrice: 25, source: 'Curated guide', freshnessLabel: 'Updated monthly', neighborhood: 'Faubourg du Temple' },
  { id: 'p12', name: 'La Félicita', category: 'nightlife', description: 'Massive Italian-themed food hall and bar in a converted railway warehouse.', location: '13th arrondissement', estimatedPrice: 30, source: 'Curated guide', freshnessLabel: 'Updated monthly', neighborhood: 'Station F' },
  { id: 'p13', name: 'Seine River Cruise', category: 'activities', description: 'Scenic one-hour cruise along the Seine passing Notre-Dame, the Eiffel Tower, and more.', location: 'Port de la Bourdonnais', estimatedPrice: 15, source: 'Curated guide', freshnessLabel: 'Updated monthly', neighborhood: 'Gros-Caillou' },
  { id: 'p14', name: 'Montmartre Walking Tour', category: 'activities', description: 'Guided walk through the artistic quarter, Sacré-Cœur, and Place du Tertre.', location: '18th arrondissement', estimatedPrice: 25, source: 'Curated guide', freshnessLabel: 'Updated monthly', neighborhood: 'Montmartre' },
  { id: 'p15', name: 'Versailles Day Trip', category: 'activities', description: 'Guided day trip to the Palace of Versailles and its magnificent gardens.', location: 'Versailles', estimatedPrice: 30, source: 'Curated guide', freshnessLabel: 'Updated monthly', neighborhood: 'Outside Paris' },
];

export function getDemoData() {
  return {
    user: DEMO_USER,
    trip: DEMO_TRIP,
    itinerary: DEMO_ITINERARY,
    expenses: DEMO_EXPENSES,
    places: PLACES,
  };
}

export { PLACES };
