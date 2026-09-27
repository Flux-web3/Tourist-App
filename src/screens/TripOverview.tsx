import { useApp } from '@/context/AppContext';
import { Card, Button, Badge, ProgressBar } from '@/components/ui';
import { BottomNav } from '@/components/BottomNav';
import { ExpenseService, ItineraryService } from '@/services';
import { formatDate, formatMoney, daysBetween } from '@/data/demo';
import { Calendar, Users, Wallet, MapPin, CalendarDays, Compass, Search, Receipt, ArrowRight, Clock, Sparkles, TrendingDown, PiggyBank, AlertCircle } from 'lucide-react';

export function TripOverview() {
  const { activeTrip, navigate } = useApp();

  if (!activeTrip) {
    return (
      <div className="min-h-screen bg-app flex items-center justify-center">
        <Card className="text-center max-w-sm">
          <AlertCircle size={32} className="text-muted-c mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
          <p className="text-secondary-c" style={{ color: 'var(--text-secondary)' }}>No active trip selected.</p>
          <Button className="mt-4" onClick={() => navigate('trips')}>Back to Trips</Button>
        </Card>
      </div>
    );
  }

  const trip = activeTrip;
  const expenses = ExpenseService.getAll(trip.id);
  const actualSpent = ExpenseService.getTotal(expenses);
  const itinerary = ItineraryService.get(trip.id);
  const aiEstimate = ItineraryService.getEstimatedTotal(itinerary);
  const remaining = trip.budgetAmount - actualSpent;
  const numDays = daysBetween(trip.startDate, trip.endDate);

  // Find next activity
  const today = new Date().toISOString().slice(0, 10);
  let nextActivity: { title: string; time: string; dayLabel: string } | null = null;
  if (itinerary) {
    for (const day of itinerary) {
      for (const item of day.items) {
        if (day.date >= today) {
          nextActivity = { title: item.title, time: item.startTime, dayLabel: formatDate(day.date, { weekday: 'short', month: 'short', day: 'numeric' }) };
          break;
        }
      }
      if (nextActivity) break;
    }
  }

  const quickActions = [
    { label: 'View Itinerary', icon: CalendarDays, screen: 'itinerary' as const, color: 'var(--accent)' },
    { label: 'Explore Places', icon: Search, screen: 'explore' as const, color: 'var(--success)' },
    { label: 'Add Expense', icon: Receipt, screen: 'budget' as const, color: 'var(--warning)' },
    { label: 'All Trips', icon: Compass, screen: 'trips' as const, color: 'var(--accent)' },
  ];

  return (
    <div className="min-h-screen bg-app pb-24 sm:pb-8">
      <header className="sticky top-0 z-20 bg-surface/80 backdrop-blur-md border-b border-app px-5 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-primary-c">{trip.title}</h1>
            <p className="text-sm text-secondary-c flex items-center gap-1 mt-0.5" style={{ color: 'var(--text-secondary)' }}>
              <MapPin size={13} /> {trip.destination}
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => navigate('trips')}>All Trips</Button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-5 py-6 space-y-5 animate-fade-in">
        {/* Trip meta */}
        <div className="grid grid-cols-3 gap-3">
          <Card className="text-center !p-4">
            <Calendar size={18} className="mx-auto mb-1.5 text-muted-c" style={{ color: 'var(--text-muted)' }} />
            <p className="text-xs text-muted-c" style={{ color: 'var(--text-muted)' }}>Dates</p>
            <p className="text-sm font-medium text-primary-c mt-0.5">{formatDate(trip.startDate, { month: 'short', day: 'numeric' })}</p>
            <p className="text-xs text-muted-c" style={{ color: 'var(--text-muted)' }}>{numDays} days</p>
          </Card>
          <Card className="text-center !p-4">
            <Users size={18} className="mx-auto mb-1.5 text-muted-c" style={{ color: 'var(--text-muted)' }} />
            <p className="text-xs text-muted-c" style={{ color: 'var(--text-muted)' }}>Travelers</p>
            <p className="text-sm font-medium text-primary-c mt-0.5">{trip.travelerCount}</p>
            <p className="text-xs text-muted-c" style={{ color: 'var(--text-muted)' }}>{trip.travelStyle}</p>
          </Card>
          <Card className="text-center !p-4">
            <Wallet size={18} className="mx-auto mb-1.5 text-muted-c" style={{ color: 'var(--text-muted)' }} />
            <p className="text-xs text-muted-c" style={{ color: 'var(--text-muted)' }}>Budget</p>
            <p className="text-sm font-medium text-primary-c mt-0.5">{formatMoney(trip.budgetAmount, trip.currency)}</p>
            <p className="text-xs text-muted-c" style={{ color: 'var(--text-muted)' }}>{trip.currency}</p>
          </Card>
        </div>

        {/* Budget Summary */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-primary-c">Budget Summary</h2>
            <button onClick={() => navigate('budget')} className="text-xs font-medium text-primary-action flex items-center gap-1" style={{ color: 'var(--primary)' }}>
              Details <ArrowRight size={12} />
            </button>
          </div>
          <div className="space-y-3.5">
            <div className="flex items-center justify-between">
              <span className="text-sm text-secondary-c" style={{ color: 'var(--text-secondary)' }}>Trip Budget</span>
              <span className="text-sm font-semibold text-primary-c">{formatMoney(trip.budgetAmount, trip.currency)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm flex items-center gap-1.5" style={{ color: 'var(--ai-draft)' }}>
                <Sparkles size={13} /> AI Draft Estimate
              </span>
              <span className="text-sm font-medium" style={{ color: 'var(--ai-draft)' }}>{formatMoney(aiEstimate, trip.currency)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm flex items-center gap-1.5" style={{ color: 'var(--actual-spend)' }}>
                <TrendingDown size={13} /> Actual Spent
              </span>
              <span className="text-sm font-medium" style={{ color: 'var(--actual-spend)' }}>{formatMoney(actualSpent, trip.currency)}</span>
            </div>
            <div className="h-px" style={{ backgroundColor: 'var(--border)' }} />
            <div className="flex items-center justify-between">
              <span className="text-sm flex items-center gap-1.5 font-medium text-primary-c">
                <PiggyBank size={15} /> Remaining
              </span>
              <span className="text-lg font-bold" style={{ color: remaining >= 0 ? 'var(--success)' : 'var(--error)' }}>
                {formatMoney(remaining, trip.currency)}
              </span>
            </div>
            <div>
              <ProgressBar value={actualSpent} max={trip.budgetAmount} color="var(--actual-spend)" />
              <p className="text-xs text-muted-c mt-1.5" style={{ color: 'var(--text-muted)' }}>
                {trip.budgetAmount > 0 ? Math.round((actualSpent / trip.budgetAmount) * 100) : 0}% of budget used
              </p>
            </div>
          </div>
          <div className="mt-3 p-3 rounded-xl flex items-start gap-2" style={{ backgroundColor: 'color-mix(in srgb, var(--ai-draft) 8%, transparent)' }}>
            <AlertCircle size={14} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--ai-draft)' }} />
            <p className="text-xs" style={{ color: 'var(--ai-draft)' }}>
              The AI estimate is a planning draft, not money spent. Your actual expenses are tracked separately.
            </p>
          </div>
        </Card>

        {/* Next Activity */}
        {nextActivity && (
          <Card onClick={() => navigate('itinerary')} className="group">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-c" style={{ color: 'var(--text-muted)' }}>Next Activity</span>
              <Badge color="ai"><Sparkles size={10} /> AI Draft</Badge>
            </div>
            <h3 className="font-semibold text-primary-c">{nextActivity.title}</h3>
            <div className="flex items-center gap-3 mt-2">
              <span className="text-xs text-secondary-c flex items-center gap-1" style={{ color: 'var(--text-secondary)' }}>
                <Clock size={12} /> {nextActivity.time}
              </span>
              <span className="text-xs text-secondary-c flex items-center gap-1" style={{ color: 'var(--text-secondary)' }}>
                <Calendar size={12} /> {nextActivity.dayLabel}
              </span>
            </div>
          </Card>
        )}

        {/* Quick Actions */}
        <div>
          <h2 className="font-semibold text-primary-c mb-3">Quick Actions</h2>
          <div className="grid grid-cols-2 gap-3">
            {quickActions.map(action => (
              <button key={action.label} onClick={() => navigate(action.screen)}
                className="flex items-center gap-3 p-4 rounded-2xl bg-surface border border-app hover:shadow-app-md transition-all text-left">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `color-mix(in srgb, ${action.color} 15%, transparent)` }}>
                  <action.icon size={20} style={{ color: action.color }} />
                </div>
                <span className="text-sm font-medium text-primary-c">{action.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Interests */}
        {trip.interests.length > 0 && (
          <Card>
            <h2 className="font-semibold text-primary-c mb-3">Your Interests</h2>
            <div className="flex flex-wrap gap-2">
              {trip.interests.map(i => (
                <span key={i} className="px-3 py-1.5 rounded-full text-xs font-medium capitalize"
                  style={{ backgroundColor: 'color-mix(in srgb, var(--accent) 12%, transparent)', color: 'var(--accent)' }}>
                  {i}
                </span>
              ))}
            </div>
          </Card>
        )}
      </main>

      <BottomNav />
    </div>
  );
}
