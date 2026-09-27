import { useApp } from '@/context/AppContext';
import { Button, Card, EmptyState } from '@/components/ui';
import { ThemeSwitcher } from '@/components/ThemeSwitcher';
import { formatDate, formatMoney, daysBetween } from '@/data/demo';
import { Plane, Plus, Users, Wallet, Calendar, Compass, Trash2, ArrowRight } from 'lucide-react';

export function TripsHome() {
  const { trips, navigate, openTrip, user, deleteTrip } = useApp();

  return (
    <div className="min-h-screen bg-app pb-24 sm:pb-8">
      <header className="sticky top-0 z-20 bg-surface/80 backdrop-blur-md border-b border-app px-5 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--primary)' }}>
              <Compass size={18} className="text-white" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-primary-c leading-none">Tourist</h1>
              <p className="text-xs text-muted-c mt-0.5" style={{ color: 'var(--text-muted)' }}>
                {user?.isDemo ? 'Demo mode' : `Hi, ${user?.name}`}
              </p>
            </div>
          </div>
          <ThemeSwitcher />
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-5 py-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-2xl font-bold text-primary-c">Your Trips</h2>
            <p className="text-sm text-secondary-c mt-0.5" style={{ color: 'var(--text-secondary)' }}>
              {trips.length === 0 ? 'Start planning your first journey' : `${trips.length} ${trips.length === 1 ? 'trip' : 'trips'} planned`}
            </p>
          </div>
          <Button onClick={() => navigate('create-trip')} size="sm" className="hidden sm:inline-flex">
            <Plus size={16} /> Plan New Journey
          </Button>
        </div>

        {trips.length === 0 ? (
          <EmptyState
            icon={<Plane size={40} />}
            title="No trips yet"
            message="Your next adventure starts here. Create your first trip and let AI help you plan it."
            action={
              <Button onClick={() => navigate('create-trip')}>
                <Plus size={18} /> Plan New Journey
              </Button>
            }
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {trips.map(trip => {
              const numDays = daysBetween(trip.startDate, trip.endDate);
              return (
                <Card key={trip.id} onClick={() => openTrip(trip.id)} className="group">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'color-mix(in srgb, var(--primary) 15%, transparent)' }}>
                        <Plane size={22} style={{ color: 'var(--primary)' }} />
                      </div>
                      <div>
                        <h3 className="font-semibold text-primary-c text-base leading-tight">{trip.title}</h3>
                        <p className="text-sm text-secondary-c mt-0.5" style={{ color: 'var(--text-secondary)' }}>{trip.destination}</p>
                      </div>
                    </div>
                    <span className="text-xs font-medium px-2.5 py-1 rounded-full capitalize" style={{
                      backgroundColor: 'color-mix(in srgb, var(--accent) 15%, transparent)',
                      color: 'var(--accent)',
                    }}>
                      {trip.status}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-3 mb-4">
                    <div className="flex items-center gap-1.5">
                      <Calendar size={14} className="text-muted-c" style={{ color: 'var(--text-muted)' }} />
                      <div>
                        <p className="text-xs text-muted-c" style={{ color: 'var(--text-muted)' }}>Dates</p>
                        <p className="text-xs font-medium text-primary-c">{formatDate(trip.startDate, { month: 'short', day: 'numeric' })}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Users size={14} className="text-muted-c" style={{ color: 'var(--text-muted)' }} />
                      <div>
                        <p className="text-xs text-muted-c" style={{ color: 'var(--text-muted)' }}>Travelers</p>
                        <p className="text-xs font-medium text-primary-c">{trip.travelerCount}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Wallet size={14} className="text-muted-c" style={{ color: 'var(--text-muted)' }} />
                      <div>
                        <p className="text-xs text-muted-c" style={{ color: 'var(--text-muted)' }}>Budget</p>
                        <p className="text-xs font-medium text-primary-c">{formatMoney(trip.budgetAmount, trip.currency)}</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-app">
                    <span className="text-xs text-muted-c" style={{ color: 'var(--text-muted)' }}>{numDays} days</span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteTrip(trip.id); }}
                        className="p-1.5 rounded-lg text-muted-c hover:text-error-c hover:bg-elevated transition-colors"
                        aria-label="Delete trip"
                      >
                        <Trash2 size={16} />
                      </button>
                      <span className="text-xs font-medium text-primary-action flex items-center gap-1 group-hover:gap-2 transition-all" style={{ color: 'var(--primary)' }}>
                        Open <ArrowRight size={14} />
                      </span>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </main>

      <div className="fixed bottom-0 left-0 right-0 sm:hidden z-20">
        <div className="bg-surface border-t border-app px-5 py-3">
          <Button fullWidth onClick={() => navigate('create-trip')}>
            <Plus size={18} /> Plan New Journey
          </Button>
        </div>
      </div>
    </div>
  );
}
