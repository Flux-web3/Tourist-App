export type ThemeMode = 'system' | 'light' | 'dark';

export type TravelStyle = 'budget' | 'balanced' | 'comfort' | 'luxury';

export type Interest = 'food' | 'culture' | 'nature' | 'nightlife' | 'shopping' | 'history' | 'adventure' | 'art';

export type ExpenseCategory = 'food' | 'transport' | 'accommodation' | 'activities' | 'shopping' | 'other';

export type PlaceCategory = 'restaurants' | 'attractions' | 'parks' | 'nightlife' | 'activities';

export type TripStatus = 'planning' | 'upcoming' | 'active' | 'completed';

export interface Trip {
  id: string;
  userId: string;
  title: string;
  destination: string;
  startDate: string;
  endDate: string;
  travelerCount: number;
  currency: string;
  budgetAmount: number;
  travelStyle: TravelStyle;
  interests: Interest[];
  status: TripStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ItineraryDay {
  id: string;
  tripId: string;
  date: string;
  position: number;
  items: ItineraryItem[];
}

export interface ItineraryItem {
  id: string;
  dayId: string;
  title: string;
  description: string;
  category: string;
  location: string;
  startTime: string;
  endTime: string;
  estimatedCost: number;
  sourceLabel: string;
  position: number;
  notes: string;
}

export interface Expense {
  id: string;
  tripId: string;
  title: string;
  category: ExpenseCategory;
  amount: number;
  currency: string;
  date: string;
  note: string;
}

export interface Experience {
  id: string;
  name: string;
  category: PlaceCategory;
  description: string;
  location: string;
  estimatedPrice: number;
  source: string;
  freshnessLabel: string;
  neighborhood: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  isDemo: boolean;
}
