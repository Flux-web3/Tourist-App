import { useState } from 'react';
import { useApp } from '@/context/AppContext';
import { Button, Input, Select, Chip } from '@/components/ui';
import { TripService, analytics } from '@/services';
import { todayISO } from '@/data/demo';
import type { TravelStyle, Interest } from '@/types';
import { ArrowLeft, ArrowRight, Check, MapPin } from 'lucide-react';

const TRAVEL_STYLES: { value: TravelStyle; label: string; desc: string }[] = [
  { value: 'budget', label: 'Budget', desc: 'Cost-conscious travel' },
  { value: 'balanced', label: 'Balanced', desc: 'Comfort meets value' },
  { value: 'comfort', label: 'Comfort', desc: 'Premium experiences' },
  { value: 'luxury', label: 'Luxury', desc: 'Top-tier everything' },
];

const INTERESTS: { value: Interest; label: string }[] = [
  { value: 'food', label: 'Food' },
  { value: 'culture', label: 'Culture' },
  { value: 'nature', label: 'Nature' },
  { value: 'nightlife', label: 'Nightlife' },
  { value: 'shopping', label: 'Shopping' },
  { value: 'history', label: 'History' },
  { value: 'adventure', label: 'Adventure' },
  { value: 'art', label: 'Art' },
];

const CURRENCIES = ['EUR', 'USD', 'GBP', 'NGN'];

export function CreateTrip() {
  const { navigate, addTrip, user } = useApp();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    title: '',
    destination: '',
    startDate: '',
    endDate: '',
    travelerCount: 2,
    budgetAmount: 2000,
    currency: 'EUR',
    travelStyle: 'balanced' as TravelStyle,
    interests: ['food', 'culture'] as Interest[],
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const steps = ['Destination', 'Dates & Travelers', 'Budget & Style'];

  function validateStep(): boolean {
    const errs: Record<string, string> = {};
    if (step === 0) {
      if (!form.destination.trim()) errs.destination = 'Destination is required';
    }
    if (step === 1) {
      if (!form.startDate) errs.startDate = 'Start date is required';
      if (!form.endDate) errs.endDate = 'End date is required';
      if (form.startDate && form.endDate && form.endDate < form.startDate) {
        errs.endDate = 'End date cannot precede start date';
      }
      if (form.travelerCount < 1) errs.travelerCount = 'At least 1 traveler';
      if (form.travelerCount > 20) errs.travelerCount = 'Maximum 20 travelers';
    }
    if (step === 2) {
      if (form.budgetAmount < 0) errs.budgetAmount = 'Budget must be valid';
      if (form.budgetAmount > 1000000) errs.budgetAmount = 'Budget seems too high';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function next() {
    if (!validateStep()) return;
    if (step < 2) setStep(step + 1);
    else submit();
  }

  function back() {
    if (step > 0) setStep(step - 1);
    else navigate('trips');
  }

  function submit() {
    if (!validateStep()) return;
    setSubmitting(true);
    const title = form.title.trim() || form.destination.split(',')[0];
    setTimeout(() => {
      const trip = TripService.create({
        userId: user?.id ?? 'anon',
        title,
        destination: form.destination.trim(),
        startDate: form.startDate,
        endDate: form.endDate,
        travelerCount: form.travelerCount,
        currency: form.currency,
        budgetAmount: form.budgetAmount,
        travelStyle: form.travelStyle,
        interests: form.interests,
      });
      addTrip(trip);
      analytics.track('trip_created', { destination: form.destination });
      analytics.track('trip_details_completed');
      analytics.track('trip_saved');
      setSubmitting(false);
    }, 600);
  }

  function toggleInterest(i: Interest) {
    setForm(f => ({
      ...f,
      interests: f.interests.includes(i) ? f.interests.filter(x => x !== i) : [...f.interests, i],
    }));
  }

  return (
    <div className="min-h-screen bg-app pb-24 sm:pb-8">
      <header className="sticky top-0 z-20 bg-surface/80 backdrop-blur-md border-b border-app px-5 py-4">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <button onClick={back} className="p-2 rounded-lg hover:bg-elevated text-secondary-c" aria-label="Back">
            <ArrowLeft size={20} />
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-semibold text-primary-c">New Journey</h1>
            <p className="text-xs text-muted-c" style={{ color: 'var(--text-muted)' }}>Step {step + 1} of {steps.length}</p>
          </div>
        </div>
        <div className="max-w-2xl mx-auto mt-3 flex gap-1.5">
          {steps.map((_, i) => (
            <div key={i} className="flex-1 h-1.5 rounded-full transition-all duration-300" style={{
              backgroundColor: i <= step ? 'var(--primary)' : 'var(--border)',
            }} />
          ))}
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-5 py-6">
        <div className="animate-fade-in">
          {step === 0 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-2xl font-bold text-primary-c mb-1">Where to?</h2>
                <p className="text-sm text-secondary-c" style={{ color: 'var(--text-secondary)' }}>Tell us where you're headed.</p>
              </div>
              <Input
                label="Trip title (optional)"
                value={form.title}
                onChange={e => setForm({ ...form, title: e.target.value })}
                placeholder="e.g. Summer in Paris"
                hint="We'll use the destination if left blank"
              />
              <Input
                id="destination"
                label="Destination"
                value={form.destination}
                onChange={e => setForm({ ...form, destination: e.target.value })}
                placeholder="e.g. Paris, France"
                error={errors.destination}
              />
              <div className="grid grid-cols-2 gap-2">
                {['Paris, France', 'Tokyo, Japan', 'Lisbon, Portugal', 'Bali, Indonesia'].map(d => (
                  <button key={d} onClick={() => setForm({ ...form, destination: d })}
                    className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-surface border border-app hover:bg-elevated text-sm text-secondary-c transition-colors text-left">
                    <MapPin size={14} className="text-muted-c flex-shrink-0" style={{ color: 'var(--text-muted)' }} />
                    <span className="truncate">{d}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-2xl font-bold text-primary-c mb-1">When & with whom?</h2>
                <p className="text-sm text-secondary-c" style={{ color: 'var(--text-secondary)' }}>Set your dates and travel companions.</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input id="startDate" label="Start date" type="date" value={form.startDate}
                  min={todayISO()}
                  onChange={e => setForm({ ...form, startDate: e.target.value })}
                  error={errors.startDate} />
                <Input id="endDate" label="End date" type="date" value={form.endDate}
                  min={form.startDate || todayISO()}
                  onChange={e => setForm({ ...form, endDate: e.target.value })}
                  error={errors.endDate} />
              </div>
              <div>
                <label className="block text-sm font-medium text-primary-c mb-2">Travelers</label>
                <div className="flex items-center gap-3">
                  <button onClick={() => setForm({ ...form, travelerCount: Math.max(1, form.travelerCount - 1) })}
                    className="w-11 h-11 rounded-xl bg-surface border border-app flex items-center justify-center text-primary-c text-xl hover:bg-elevated">−</button>
                  <span className="text-2xl font-semibold text-primary-c min-w-[3rem] text-center">{form.travelerCount}</span>
                  <button onClick={() => setForm({ ...form, travelerCount: Math.min(20, form.travelerCount + 1) })}
                    className="w-11 h-11 rounded-xl bg-surface border border-app flex items-center justify-center text-primary-c text-xl hover:bg-elevated">+</button>
                </div>
                {errors.travelerCount && <p className="text-xs text-error-c mt-1.5" style={{ color: 'var(--error)' }}>{errors.travelerCount}</p>}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <div>
                <h2 className="text-2xl font-bold text-primary-c mb-1">Budget & preferences</h2>
                <p className="text-sm text-secondary-c" style={{ color: 'var(--text-secondary)' }}>Help us tailor your itinerary.</p>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <Input id="budget" label="Budget" type="number" value={form.budgetAmount}
                    min={0} step={50}
                    onChange={e => setForm({ ...form, budgetAmount: Number(e.target.value) })}
                    error={errors.budgetAmount} />
                </div>
                <Select label="Currency" value={form.currency}
                  onChange={e => setForm({ ...form, currency: e.target.value })}>
                  {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                </Select>
              </div>
              <div>
                <label className="block text-sm font-medium text-primary-c mb-2">Travel style</label>
                <div className="grid grid-cols-2 gap-2">
                  {TRAVEL_STYLES.map(s => (
                    <button key={s.value} onClick={() => setForm({ ...form, travelStyle: s.value })}
                      className={`p-3.5 rounded-xl border text-left transition-all ${
                        form.travelStyle === s.value ? 'border-transparent ring-1' : 'border-app hover:bg-elevated'
                      }`}
                      style={form.travelStyle === s.value ? { backgroundColor: 'color-mix(in srgb, var(--primary) 10%, transparent)', borderColor: 'var(--primary)' } : { backgroundColor: 'var(--surface)' }}>
                      <p className="font-medium text-primary-c text-sm">{s.label}</p>
                      <p className="text-xs text-muted-c mt-0.5" style={{ color: 'var(--text-muted)' }}>{s.desc}</p>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-primary-c mb-2">Interests</label>
                <div className="flex flex-wrap gap-2">
                  {INTERESTS.map(i => (
                    <Chip key={i.value} active={form.interests.includes(i.value)} onClick={() => toggleInterest(i.value)}>
                      {i.label}
                    </Chip>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      <div className="fixed bottom-0 left-0 right-0 z-20 bg-surface border-t border-app px-5 py-3">
        <div className="max-w-2xl mx-auto flex items-center justify-between gap-3">
          <Button variant="ghost" onClick={back} disabled={submitting}>
            {step === 0 ? 'Cancel' : 'Back'}
          </Button>
          <Button onClick={next} loading={submitting} size="md">
            {step < 2 ? <>Continue <ArrowRight size={16} /></> : <>Create Trip <Check size={16} /></>}
          </Button>
        </div>
      </div>
    </div>
  );
}
