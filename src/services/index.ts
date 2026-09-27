import type { Trip, ItineraryDay, ItineraryItem, Expense, Experience } from '@/types';
import { uid, addDays, daysBetween, getDemoData, PLACES } from '@/data/demo';
import { storage } from '@/data/storage';

// ─── Trip Service ────────────────────────────────────────────

export const TripService = {
  getAll(): Trip[] {
    return storage.getTrips();
  },

  getById(id: string): Trip | undefined {
    return storage.getTrips().find(t => t.id === id);
  },

  create(data: Omit<Trip, 'id' | 'createdAt' | 'updatedAt' | 'status'>): Trip {
    const trip: Trip = {
      ...data,
      id: uid(),
      status: 'planning',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const trips = storage.getTrips();
    trips.push(trip);
    storage.saveTrips(trips);
    return trip;
  },

  update(id: string, updates: Partial<Trip>): Trip | undefined {
    const trips = storage.getTrips();
    const idx = trips.findIndex(t => t.id === id);
    if (idx === -1) return undefined;
    trips[idx] = { ...trips[idx], ...updates, updatedAt: new Date().toISOString() };
    storage.saveTrips(trips);
    return trips[idx];
  },

  delete(id: string): void {
    const trips = storage.getTrips().filter(t => t.id !== id);
    storage.saveTrips(trips);
  },

  loadDemo(): void {
    const { trip, itinerary, expenses } = getDemoData();
    const trips = storage.getTrips();
    if (!trips.find(t => t.id === trip.id)) {
      trips.push(trip);
      storage.saveTrips(trips);
      storage.saveItinerary(trip.id, itinerary);
      storage.saveExpenses(trip.id, expenses);
    }
    storage.setDemo(true);
  },

  isDemoMode(): boolean {
    return storage.isDemo();
  },
};

// ─── Itinerary Service (mock AI generation) ───────────────────

const ACTIVITY_TEMPLATES: Record<string, { title: string; category: string; desc: string; startTime: string; endTime: string; cost: number; location: string }[]> = {
  food: [
    { title: 'Breakfast at Local Café', category: 'Food', desc: 'Start your day with freshly baked pastries and coffee at a neighborhood café.', startTime: '08:30', endTime: '09:30', cost: 18, location: 'Local café' },
    { title: 'Lunch at Bistro', category: 'Food', desc: 'Enjoy a leisurely lunch at a well-reviewed local bistro.', startTime: '13:00', endTime: '14:30', cost: 35, location: 'City center' },
    { title: 'Dinner & Wine Tasting', category: 'Food', desc: 'Evening dinner with regional wine selections at a recommended restaurant.', startTime: '19:30', endTime: '22:00', cost: 60, location: 'Old town' },
    { title: 'Street Food Market Visit', category: 'Food', desc: 'Explore a local food market and sample regional specialties.', startTime: '12:00', endTime: '14:00', cost: 25, location: 'Market district' },
  ],
  culture: [
    { title: 'Museum Visit', category: 'Culture', desc: 'Explore the city\'s premier museum with its extensive permanent collection.', startTime: '10:00', endTime: '13:00', cost: 22, location: 'Museum quarter' },
    { title: 'Historical Walking Tour', category: 'Culture', desc: 'Guided walk through the historic center covering key landmarks and stories.', startTime: '14:00', endTime: '16:30', cost: 18, location: 'Historic center' },
    { title: 'Cultural Performance', category: 'Culture', desc: 'Evening performance featuring traditional or contemporary local arts.', startTime: '20:00', endTime: '22:00', cost: 40, location: 'Theater district' },
  ],
  nature: [
    { title: 'City Park Stroll', category: 'Nature', desc: 'Relaxing walk through the city\'s most beautiful park and gardens.', startTime: '10:00', endTime: '12:00', cost: 0, location: 'Central park' },
    { title: 'Riverside Walk', category: 'Nature', desc: 'Scenic walk along the river with photo opportunities at key bridges.', startTime: '16:00', endTime: '18:00', cost: 0, location: 'Riverfront' },
    { title: 'Sunset Viewpoint', category: 'Nature', desc: 'Visit the best sunset viewpoint in the city.', startTime: '18:30', endTime: '20:00', cost: 0, location: 'Hilltop area' },
  ],
  history: [
    { title: 'Historical Monument Visit', category: 'History', desc: 'Visit a significant historical monument and learn about its importance.', startTime: '10:00', endTime: '12:00', cost: 12, location: 'Old city' },
    { title: 'Heritage District Walk', category: 'History', desc: 'Walk through a preserved heritage district with architecture spanning centuries.', startTime: '14:30', endTime: '16:30', cost: 0, location: 'Heritage quarter' },
    { title: 'Historical Museum', category: 'History', desc: 'Dedicated museum covering the region\'s rich history.', startTime: '15:00', endTime: '17:00', cost: 10, location: 'City center' },
  ],
  art: [
    { title: 'Art Gallery Visit', category: 'Art', desc: 'Visit a renowned art gallery featuring works from multiple periods.', startTime: '10:30', endTime: '12:30', cost: 15, location: 'Gallery district' },
    { title: 'Street Art Tour', category: 'Art', desc: 'Discover the city\'s vibrant street art scene on a self-guided walk.', startTime: '15:00', endTime: '17:00', cost: 0, location: 'Arts quarter' },
  ],
  shopping: [
    { title: 'Boutique Shopping Street', category: 'Shopping', desc: 'Browse local boutiques and designers on the city\'s fashionable shopping street.', startTime: '14:00', endTime: '17:00', cost: 0, location: 'Shopping district' },
    { title: 'Antique Market', category: 'Shopping', desc: 'Hunt for treasures at the city\'s famous antique market.', startTime: '10:00', endTime: '12:30', cost: 0, location: 'Market area' },
  ],
  nightlife: [
    { title: 'Rooftop Bar', category: 'Nightlife', desc: 'Drinks with panoramic city views at a stylish rooftop bar.', startTime: '21:00', endTime: '23:00', cost: 30, location: 'City center' },
    { title: 'Live Music Venue', category: 'Nightlife', desc: 'Enjoy live music at an intimate, well-regarded local venue.', startTime: '20:30', endTime: '23:00', cost: 25, location: 'Entertainment district' },
  ],
  adventure: [
    { title: 'Bike Tour', category: 'Adventure', desc: 'Guided cycling tour covering major sights and hidden corners.', startTime: '09:00', endTime: '12:00', cost: 35, location: 'City center' },
    { title: 'Kayaking Excursion', category: 'Adventure', desc: 'See the city from the water on a guided kayaking excursion.', startTime: '14:00', endTime: '17:00', cost: 45, location: 'Riverside' },
  ],
};

const REPLACEMENT_ACTIVITIES = [
  { title: 'Musée de Cluny', category: 'Art', desc: 'National museum of the Middle Ages, housed in a Gallo-Roman baths complex.', startTime: '10:00', endTime: '12:30', cost: 12, location: '5th arrondissement' },
  { title: 'Picasso Museum', category: 'Art', desc: 'Extensive collection of Picasso\'s works in a stunning Marais mansion.', startTime: '11:00', endTime: '13:00', cost: 14, location: 'Le Marais' },
  { title: 'Rodin Museum', category: 'Art', desc: 'Sculptures by Rodin in a beautiful garden setting.', startTime: '10:00', endTime: '12:00', cost: 13, location: '7th arrondissement' },
  { title: 'Sainte-Chapelle', category: 'History', desc: 'Gothic chapel with breathtaking stained glass windows.', startTime: '14:00', endTime: '15:30', cost: 13, location: 'Île de la Cité' },
  { title: 'Père Lachaise Cemetery', category: 'Culture', desc: 'Historic cemetery with ornate tombs of notable figures.', startTime: '10:00', endTime: '12:00', cost: 0, location: '20th arrondissement' },
  { title: 'Canal Saint-Martin Walk', category: 'Nature', desc: 'Trendy canal area with iron footbridges and waterside cafés.', startTime: '15:00', endTime: '17:00', cost: 0, location: '10th arrondissement' },
  { title: 'Arc de Triomphe', category: 'Attractions', desc: 'Iconic arch with panoramic views from the top.', startTime: '16:00', endTime: '17:30', cost: 13, location: 'Place Charles de Gaulle' },
  { title: 'Centre Pompidou', category: 'Art', desc: 'Modern art museum in an iconic inside-out building.', startTime: '11:00', endTime: '14:00', cost: 15, location: 'Beaubourg' },
];

export const ItineraryService = {
  get(tripId: string): ItineraryDay[] | null {
    const stored = storage.getItinerary(tripId);
    return stored ?? null;
  },

  save(tripId: string, days: ItineraryDay[]) {
    storage.saveItinerary(tripId, days);
  },

  generate(trip: Trip): Promise<ItineraryDay[]> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        try {
          const days = this.generateSync(trip);
          storage.saveItinerary(trip.id, days);
          resolve(days);
        } catch (e) {
          reject(e);
        }
      }, 1800);

      // Simulate occasional failure (~10% chance) — retry will succeed
      if (Math.random() < 0.1) {
        clearTimeout(timer);
        setTimeout(() => reject(new Error('Failed to generate itinerary. Please try again.')), 1500);
      }
    });
  },

  generateSync(trip: Trip): ItineraryDay[] {
    const numDays = Math.min(daysBetween(trip.startDate, trip.endDate), 14);
    const interests = trip.interests.length > 0 ? trip.interests : ['culture', 'food', 'nature'];
    const days: ItineraryDay[] = [];

    // Build a pool of activities from the trip's interests
    type Template = typeof ACTIVITY_TEMPLATES[string][number];
    const pool: Template[] = [];
    for (const interest of interests) {
      const templates = ACTIVITY_TEMPLATES[interest];
      if (templates) pool.push(...templates);
    }
    // Ensure at least some variety
    if (pool.length < 3) {
      pool.push(...ACTIVITY_TEMPLATES.culture, ...ACTIVITY_TEMPLATES.food);
    }

    for (let i = 0; i < numDays; i++) {
      const dayId = uid();
      const items: ItineraryItem[] = [];
      // 3 activities per day
      for (let j = 0; j < 3; j++) {
        const template = pool[(i * 3 + j) % pool.length];
        items.push({
          id: uid(),
          dayId,
          title: template.title,
          description: template.desc,
          category: template.category,
          location: template.location,
          startTime: template.startTime,
          endTime: template.endTime,
          estimatedCost: template.cost,
          sourceLabel: 'AI-generated draft',
          position: j,
          notes: '',
        });
      }
      days.push({
        id: dayId,
        tripId: trip.id,
        date: addDays(trip.startDate, i),
        position: i,
        items,
      });
    }
    return days;
  },

  updateItem(tripId: string, dayId: string, itemId: string, updates: Partial<ItineraryItem>): ItineraryDay[] | null {
    const days = storage.getItinerary(tripId);
    if (!days) return null;
    for (const day of days) {
      if (day.id === dayId) {
        const idx = day.items.findIndex(i => i.id === itemId);
        if (idx !== -1) {
          day.items[idx] = { ...day.items[idx], ...updates };
        }
      }
    }
    storage.saveItinerary(tripId, days);
    return days;
  },

  removeItem(tripId: string, dayId: string, itemId: string): ItineraryDay[] | null {
    const days = storage.getItinerary(tripId);
    if (!days) return null;
    for (const day of days) {
      if (day.id === dayId) {
        day.items = day.items.filter(i => i.id !== itemId);
      }
    }
    storage.saveItinerary(tripId, days);
    return days;
  },

  replaceItem(tripId: string, dayId: string, itemId: string): ItineraryDay[] | null {
    const days = storage.getItinerary(tripId);
    if (!days) return null;
    for (const day of days) {
      if (day.id === dayId) {
        const idx = day.items.findIndex(i => i.id === itemId);
        if (idx !== -1) {
          const replacement = REPLACEMENT_ACTIVITIES[Math.floor(Math.random() * REPLACEMENT_ACTIVITIES.length)];
          day.items[idx] = {
            ...day.items[idx],
            title: replacement.title,
            description: replacement.desc,
            category: replacement.category,
            location: replacement.location,
            startTime: replacement.startTime,
            endTime: replacement.endTime,
            estimatedCost: replacement.cost,
            sourceLabel: 'AI-generated draft',
          };
        }
      }
    }
    storage.saveItinerary(tripId, days);
    return days;
  },

  addPlaceToDay(tripId: string, dayId: string, place: Experience, position?: number): ItineraryDay[] | null {
    const days = storage.getItinerary(tripId);
    if (!days) return null;
    for (const day of days) {
      if (day.id === dayId) {
        const pos = position ?? day.items.length;
        day.items.push({
          id: uid(),
          dayId,
          title: place.name,
          description: place.description,
          category: place.category.charAt(0).toUpperCase() + place.category.slice(1, -1),
          location: place.location,
          startTime: '14:00',
          endTime: '16:00',
          estimatedCost: place.estimatedPrice,
          sourceLabel: 'Curated guide',
          position: pos,
          notes: '',
        });
      }
    }
    storage.saveItinerary(tripId, days);
    return days;
  },

  getEstimatedTotal(days: ItineraryDay[] | null): number {
    if (!days) return 0;
    return days.reduce((sum, day) => sum + day.items.reduce((s, i) => s + i.estimatedCost, 0), 0);
  },
};

// ─── Expense Service ─────────────────────────────────────────

export const ExpenseService = {
  getAll(tripId: string): Expense[] {
    return storage.getExpenses(tripId);
  },

  add(tripId: string, data: Omit<Expense, 'id' | 'tripId'>): Expense {
    const expenses = storage.getExpenses(tripId);
    const expense: Expense = { ...data, id: uid(), tripId };
    expenses.push(expense);
    storage.saveExpenses(tripId, expenses);
    return expense;
  },

  update(tripId: string, id: string, updates: Partial<Expense>): Expense | undefined {
    const expenses = storage.getExpenses(tripId);
    const idx = expenses.findIndex(e => e.id === id);
    if (idx === -1) return undefined;
    expenses[idx] = { ...expenses[idx], ...updates };
    storage.saveExpenses(tripId, expenses);
    return expenses[idx];
  },

  delete(tripId: string, id: string): void {
    const expenses = storage.getExpenses(tripId).filter(e => e.id !== id);
    storage.saveExpenses(tripId, expenses);
  },

  getTotal(expenses: Expense[]): number {
    return expenses.reduce((sum, e) => sum + e.amount, 0);
  },
};

// ─── Places Service ──────────────────────────────────────────

export const PlacesService = {
  getAll(): Experience[] {
    return PLACES;
  },

  search(query: string, category?: string): Experience[] {
    let results = PLACES;
    if (category && category !== 'all') {
      results = results.filter(p => p.category === category);
    }
    if (query.trim()) {
      const q = query.toLowerCase();
      results = results.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.neighborhood.toLowerCase().includes(q) ||
        p.location.toLowerCase().includes(q)
      );
    }
    return results;
  },

  getById(id: string): Experience | undefined {
    return PLACES.find(p => p.id === id);
  },
};

// ─── Analytics stub ──────────────────────────────────────────

type AnalyticsEvent =
  | 'signup_completed' | 'trip_created' | 'trip_details_completed'
  | 'itinerary_generation_started' | 'itinerary_generation_succeeded' | 'itinerary_generation_failed'
  | 'itinerary_item_edited' | 'itinerary_item_replaced'
  | 'experience_searched' | 'experience_added'
  | 'expense_added' | 'trip_saved';

export const analytics = {
  track(event: AnalyticsEvent, props?: Record<string, unknown>) {
    // Lightweight stub — no data sent. Replace with real provider later.
    void event; void props;
  },
};
