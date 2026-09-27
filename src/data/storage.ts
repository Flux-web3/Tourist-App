import type { Trip, ItineraryDay, Expense } from '@/types';

const TRIPS_KEY = 'tourist-trips';
const ITINERARY_PREFIX = 'tourist-itinerary-';
const EXPENSES_PREFIX = 'tourist-expenses-';
const DEMO_FLAG = 'tourist-is-demo';

export const storage = {
  getTrips(): Trip[] {
    try {
      const raw = localStorage.getItem(TRIPS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  },

  saveTrips(trips: Trip[]) {
    try { localStorage.setItem(TRIPS_KEY, JSON.stringify(trips)); } catch { /* quota or unavailable */ }
  },

  getItinerary(tripId: string): ItineraryDay[] | null {
    try {
      const raw = localStorage.getItem(ITINERARY_PREFIX + tripId);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  },

  saveItinerary(tripId: string, days: ItineraryDay[]) {
    try { localStorage.setItem(ITINERARY_PREFIX + tripId, JSON.stringify(days)); } catch { /* quota or unavailable */ }
  },

  getExpenses(tripId: string): Expense[] {
    try {
      const raw = localStorage.getItem(EXPENSES_PREFIX + tripId);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  },

  saveExpenses(tripId: string, expenses: Expense[]) {
    try { localStorage.setItem(EXPENSES_PREFIX + tripId, JSON.stringify(expenses)); } catch { /* quota or unavailable */ }
  },

  isDemo(): boolean {
    return localStorage.getItem(DEMO_FLAG) === 'true';
  },

  setDemo(val: boolean) {
    try { localStorage.setItem(DEMO_FLAG, String(val)); } catch { /* unavailable */ }
  },
};
