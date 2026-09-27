import { useState, useMemo, useEffect } from 'react';
import { useApp } from '@/context/AppContext';
import { Card, Chip, EmptyState, Spinner, Badge, Button, Modal, Select } from '@/components/ui';
import { BottomNav } from '@/components/BottomNav';
import { PlacesService, ItineraryService, analytics } from '@/services';
import { formatMoney, formatDate } from '@/data/demo';
import type { Experience, PlaceCategory } from '@/types';
import { Search, MapPin, Utensils, Landmark, TreePalm, Moon, Compass, Plus, Info, AlertCircle } from 'lucide-react';

const CATEGORIES: { value: PlaceCategory | 'all'; label: string; icon: typeof Search }[] = [
  { value: 'all', label: 'All', icon: Compass },
  { value: 'restaurants', label: 'Restaurants', icon: Utensils },
  { value: 'attractions', label: 'Attractions', icon: Landmark },
  { value: 'parks', label: 'Parks', icon: TreePalm },
  { value: 'nightlife', label: 'Nightlife', icon: Moon },
  { value: 'activities', label: 'Activities', icon: Compass },
];

export function Explore() {
  const { activeTrip, navigate, openPlaceDetail, placeDetailId } = useApp();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<PlaceCategory | 'all'>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [results, setResults] = useState<Experience[]>([]);

  useEffect(() => {
    setLoading(true);
    setError(false);
    const timer = setTimeout(() => {
      try {
        setResults(PlacesService.search(query, category));
        setLoading(false);
      } catch {
        setError(true);
        setLoading(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [query, category]);

  const selectedPlace = useMemo(() => placeDetailId ? PlacesService.getById(placeDetailId) : null, [placeDetailId]);

  if (!activeTrip) {
    return (
      <div className="min-h-screen bg-app flex items-center justify-center p-5">
        <Card className="text-center max-w-sm">
          <p className="text-secondary-c mb-4" style={{ color: 'var(--text-secondary)' }}>No active trip selected.</p>
          <Button onClick={() => navigate('trips')}>Back to Trips</Button>
        </Card>
      </div>
    );
  }

  function handleSearch(q: string) {
    setQuery(q);
    if (q.trim()) analytics.track('experience_searched', { query: q });
  }

  return (
    <div className="min-h-screen bg-app pb-24 sm:pb-8">
      <header className="sticky top-0 z-20 bg-surface/80 backdrop-blur-md border-b border-app px-5 py-4">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-xl font-bold text-primary-c">Explore Places</h1>
          <p className="text-sm text-secondary-c mt-0.5" style={{ color: 'var(--text-secondary)' }}>Discover curated places in {activeTrip.destination.split(',')[0]}</p>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-5 py-6">
        {/* Search */}
        <div className="relative mb-4">
          <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-c" style={{ color: 'var(--text-muted)' }} />
          <input
            type="text"
            value={query}
            onChange={e => handleSearch(e.target.value)}
            placeholder="Search places, neighborhoods…"
            className="w-full pl-11 pr-4 py-3 rounded-xl bg-surface border border-app text-primary-c placeholder:text-muted-c text-sm focus:outline-none focus:ring-2"
            style={{ outlineColor: 'var(--focus)' }}
            aria-label="Search places"
          />
        </div>

        {/* Category filters */}
        <div className="flex gap-2 overflow-x-auto pb-2 mb-5 -mx-1 px-1">
          {CATEGORIES.map(cat => (
            <Chip key={cat.value} active={category === cat.value} onClick={() => setCategory(cat.value)}>
              <cat.icon size={14} /> {cat.label}
            </Chip>
          ))}
        </div>

        {/* Info banner */}
        <div className="mb-4 p-3 rounded-xl flex items-start gap-2" style={{ backgroundColor: 'color-mix(in srgb, var(--info) 8%, transparent)' }}>
          <Info size={14} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--info)' }} />
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            Catalog demo with curated guides. Estimated prices and information may change — please verify before visiting.
          </p>
        </div>

        {/* States */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-20">
            <Spinner size={28} />
            <p className="text-sm text-muted-c mt-3" style={{ color: 'var(--text-muted)' }}>Finding places…</p>
          </div>
        )}

        {error && (
          <EmptyState
            icon={<AlertCircle size={40} />}
            title="Something went wrong"
            message="We couldn't load places. Please try again."
            action={<Button onClick={() => { setError(false); setQuery(''); }}>Retry</Button>}
          />
        )}

        {!loading && !error && results.length === 0 && (
          <EmptyState
            icon={<Search size={40} />}
            title="No results found"
            message="Try a different search term or category filter."
          />
        )}

        {!loading && !error && results.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2 animate-fade-in">
            {results.map(place => (
              <Card key={place.id} onClick={() => openPlaceDetail(place.id)} className="group">
                <div className="flex items-start justify-between mb-2">
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'color-mix(in srgb, var(--accent) 12%, transparent)' }}>
                    {place.category === 'restaurants' && <Utensils size={20} style={{ color: 'var(--accent)' }} />}
                    {place.category === 'attractions' && <Landmark size={20} style={{ color: 'var(--accent)' }} />}
                    {place.category === 'parks' && <TreePalm size={20} style={{ color: 'var(--success)' }} />}
                    {place.category === 'nightlife' && <Moon size={20} style={{ color: 'var(--accent)' }} />}
                    {place.category === 'activities' && <Compass size={20} style={{ color: 'var(--primary)' }} />}
                  </div>
                  <span className="text-xs font-medium" style={{ color: 'var(--est-cost)' }}>
                    {place.estimatedPrice > 0 ? `~${formatMoney(place.estimatedPrice, activeTrip.currency)}` : 'Free'}
                  </span>
                </div>
                <h3 className="font-semibold text-primary-c text-sm mb-1">{place.name}</h3>
                <p className="text-xs text-secondary-c mb-2 line-clamp-2" style={{ color: 'var(--text-secondary)' }}>{place.description}</p>
                <div className="flex items-center gap-1 text-xs text-muted-c" style={{ color: 'var(--text-muted)' }}>
                  <MapPin size={11} /> {place.neighborhood}
                </div>
                <div className="mt-2 pt-2 border-t border-app">
                  <Badge color="neutral">{place.source}</Badge>
                </div>
              </Card>
            ))}
          </div>
        )}
      </main>

      {/* Place Detail Modal */}
      <PlaceDetailModal place={selectedPlace ?? null} onClose={() => openPlaceDetail(null)} />

      <BottomNav />
    </div>
  );
}

function PlaceDetailModal({ place, onClose }: { place: Experience | null; onClose: () => void }) {
  const { activeTrip } = useApp();
  const [addToDayOpen, setAddToDayOpen] = useState(false);
  const [selectedDayId, setSelectedDayId] = useState('');
  const [added, setAdded] = useState(false);

  const itinerary = activeTrip ? ItineraryService.get(activeTrip.id) : null;

  useEffect(() => {
    if (place) {
      setAdded(false);
      setAddToDayOpen(false);
      if (itinerary && itinerary.length > 0) {
        setSelectedDayId(itinerary[0].id);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [place]);

  if (!place || !activeTrip) return null;

  function addPlace() {
    if (!place || !activeTrip || !selectedDayId) return;
    ItineraryService.addPlaceToDay(activeTrip.id, selectedDayId, place);
    analytics.track('experience_added', { placeId: place.id });
    setAdded(true);
    setTimeout(() => {
      onClose();
    }, 1200);
  }

  return (
    <Modal open={!!place} onClose={onClose} title={place.name} maxWidth="max-w-lg">
      <div className="space-y-4">
        {/* Category & price */}
        <div className="flex items-center justify-between">
          <span className="px-3 py-1.5 rounded-full text-xs font-medium capitalize" style={{
            backgroundColor: 'color-mix(in srgb, var(--accent) 12%, transparent)', color: 'var(--accent)',
          }}>
            {place.category}
          </span>
          <span className="text-sm font-semibold" style={{ color: 'var(--est-cost)' }}>
            {place.estimatedPrice > 0 ? `~${formatMoney(place.estimatedPrice, activeTrip.currency)}` : 'Free entry'}
          </span>
        </div>

        {/* Description */}
        <p className="text-sm text-secondary-c leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{place.description}</p>

        {/* Location */}
        <div className="flex items-center gap-2 text-sm text-secondary-c" style={{ color: 'var(--text-secondary)' }}>
          <MapPin size={16} style={{ color: 'var(--text-muted)' }} />
          {place.location} · {place.neighborhood}
        </div>

        {/* Freshness / source */}
        <div className="p-3 rounded-xl flex items-start gap-2" style={{ backgroundColor: 'var(--elevated)' }}>
          <Info size={14} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--text-muted)' }} />
          <div>
            <p className="text-xs font-medium text-primary-c">{place.source} · {place.freshnessLabel}</p>
            <p className="text-xs text-muted-c mt-0.5" style={{ color: 'var(--text-muted)' }}>Catalog demo — information may change. Please verify before visiting.</p>
          </div>
        </div>

        {/* Add to trip */}
        {added ? (
          <div className="p-3 rounded-xl flex items-center gap-2 animate-scale-in" style={{ backgroundColor: 'color-mix(in srgb, var(--success) 12%, transparent)' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--success)" strokeWidth="2" strokeLinecap="round"><path d="M20 6L9 17l-5-5" /></svg>
            <span className="text-sm font-medium" style={{ color: 'var(--success)' }}>Added to your itinerary!</span>
          </div>
        ) : (
          <>
            {!addToDayOpen ? (
              <Button fullWidth size="lg" onClick={() => setAddToDayOpen(true)}>
                <Plus size={18} /> Add to Trip
              </Button>
            ) : (
              <div className="space-y-3">
                <Select label="Add to which day?" value={selectedDayId} onChange={e => setSelectedDayId(e.target.value)}>
                  {itinerary && itinerary.length > 0 ? (
                    itinerary.map(day => (
                      <option key={day.id} value={day.id}>
                        Day {day.position + 1} — {formatDate(day.date, { weekday: 'short', month: 'short', day: 'numeric' })}
                      </option>
                    ))
                  ) : (
                    <option value="">Generate an itinerary first</option>
                  )}
                </Select>
                <p className="text-xs text-muted-c" style={{ color: 'var(--text-muted)' }}>
                  This will be appended to the selected day. Existing activities won't be affected.
                </p>
                <div className="flex gap-2">
                  <Button variant="secondary" fullWidth onClick={() => setAddToDayOpen(false)}>Cancel</Button>
                  <Button fullWidth onClick={addPlace} disabled={!selectedDayId || !itinerary?.length}>
                    <Plus size={16} /> Add Place
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
