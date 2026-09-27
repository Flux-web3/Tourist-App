import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import type { Trip, User } from '@/types';
import { TripService, analytics } from '@/services';
import { getDemoData } from '@/data/demo';
import { storage } from '@/data/storage';

type Screen = 'welcome' | 'trips' | 'create-trip' | 'overview' | 'itinerary' | 'explore' | 'budget';

interface AppState {
  user: User | null;
  trips: Trip[];
  activeTrip: Trip | null;
  screen: Screen;
  placeDetailId: string | null;
}

interface AppContextValue extends AppState {
  enterDemo: () => void;
  signIn: (email: string, name: string) => void;
  signOut: () => void;
  navigate: (screen: Screen) => void;
  openTrip: (tripId: string) => void;
  refreshTrips: () => void;
  addTrip: (trip: Trip) => void;
  updateTrip: (id: string, updates: Partial<Trip>) => void;
  deleteTrip: (id: string) => void;
  openPlaceDetail: (id: string | null) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [activeTrip, setActiveTrip] = useState<Trip | null>(null);
  const [screen, setScreen] = useState<Screen>('welcome');
  const [placeDetailId, setPlaceDetailId] = useState<string | null>(null);

  useEffect(() => {
    // On mount: check if demo mode was previously enabled
    if (storage.isDemo()) {
      const { user } = getDemoData();
      setUser(user);
      const loadedTrips = TripService.getAll();
      setTrips(loadedTrips);
      setScreen('trips');
    }
  }, []);

  const refreshTrips = useCallback(() => {
    setTrips(TripService.getAll());
  }, []);

  const enterDemo = useCallback(() => {
    TripService.loadDemo();
    const { user, trip } = getDemoData();
    setUser(user);
    setTrips(TripService.getAll());
    setActiveTrip(trip);
    setScreen('overview');
    analytics.track('signup_completed', { mode: 'demo' });
  }, []);

  const signIn = useCallback((email: string, name: string) => {
    const u: User = { id: 'user-' + Math.random().toString(36).slice(2, 8), email, name, isDemo: false };
    setUser(u);
    setTrips(TripService.getAll());
    setScreen('trips');
    analytics.track('signup_completed', { mode: 'email' });
  }, []);

  const signOut = useCallback(() => {
    setUser(null);
    setActiveTrip(null);
    setScreen('welcome');
    storage.setDemo(false);
  }, []);

  const navigate = useCallback((s: Screen) => {
    setScreen(s);
  }, []);

  const openTrip = useCallback((tripId: string) => {
    const trip = TripService.getById(tripId);
    if (trip) {
      setActiveTrip(trip);
      setScreen('overview');
    }
  }, []);

  const addTrip = useCallback((trip: Trip) => {
    setTrips(prev => [...prev, trip]);
    setActiveTrip(trip);
  }, []);

  const updateTrip = useCallback((id: string, updates: Partial<Trip>) => {
    const updated = TripService.update(id, updates);
    if (updated) {
      setTrips(TripService.getAll());
      setActiveTrip(prev => prev?.id === id ? updated : prev);
    }
  }, []);

  const deleteTrip = useCallback((id: string) => {
    TripService.delete(id);
    setTrips(TripService.getAll());
    setActiveTrip(null);
  }, []);

  const openPlaceDetail = useCallback((id: string | null) => {
    setPlaceDetailId(id);
  }, []);

  return (
    <AppContext.Provider value={{
      user, trips, activeTrip, screen, placeDetailId,
      enterDemo, signIn, signOut, navigate, openTrip, refreshTrips,
      addTrip, updateTrip, deleteTrip, openPlaceDetail,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
