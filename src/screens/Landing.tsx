import { useState, useEffect } from 'react';
import { useApp } from '@/context/AppContext';
import { ThemeSwitcher } from '@/components/ThemeSwitcher';
import { Button } from '@/components/ui';
import {
  Compass, ArrowRight, Menu, X, CalendarDays, Search, Receipt,
  Notebook, Sparkles, MapPin, Wallet, TrendingDown, PiggyBank,
  AlertCircle, Plane, Clock,
} from 'lucide-react';

export function Landing() {
  const { navigate, enterDemo } = useApp();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [mobileMenuOpen]);

  function scrollToId(id: string) {
    setMobileMenuOpen(false);
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function handlePlanTrip() {
    navigate('welcome');
  }

  function handleDemo() {
    enterDemo();
  }

  const navLinks = [
    { label: 'How it Works', id: 'how-it-works' },
    { label: 'Features', id: 'features' },
  ];

  return (
    <div className="min-h-screen bg-app">
      {/* ─── Header ─────────────────────────────── */}
      <header className="sticky top-0 z-40 bg-surface/90 backdrop-blur-md border-b border-app">
        <div className="max-w-6xl mx-auto px-5 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'var(--primary)' }}>
              <Compass size={20} className="text-white" aria-hidden="true" />
            </div>
            <span className="text-lg font-semibold text-primary-c">Tourist</span>
          </div>

          <nav className="hidden md:flex items-center gap-1" aria-label="Main navigation">
            {navLinks.map(link => (
              <button
                key={link.id}
                onClick={() => scrollToId(link.id)}
                className="px-4 py-2 text-sm font-medium text-secondary-c hover:text-primary-c transition-colors rounded-lg"
                style={{ color: 'var(--text-secondary)' }}
              >
                {link.label}
              </button>
            ))}
            <button
              onClick={handlePlanTrip}
              className="px-4 py-2 text-sm font-medium text-secondary-c hover:text-primary-c transition-colors rounded-lg"
              style={{ color: 'var(--text-secondary)' }}
            >
              Sign In
            </button>
            <Button size="sm" onClick={handlePlanTrip} className="ml-2">
              Plan Your Trip <ArrowRight size={14} />
            </Button>
          </nav>

          <div className="flex items-center gap-2 md:hidden">
            <ThemeSwitcher />
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-lg bg-elevated border border-app text-secondary-c"
              style={{ color: 'var(--text-secondary)' }}
              aria-label="Toggle menu"
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>

          <div className="hidden md:block">
            <ThemeSwitcher />
          </div>
        </div>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-app bg-surface animate-slide-down">
            <nav className="px-5 py-4 space-y-1" aria-label="Mobile navigation">
              {navLinks.map(link => (
                <button
                  key={link.id}
                  onClick={() => scrollToId(link.id)}
                  className="block w-full text-left px-4 py-3 text-sm font-medium text-secondary-c hover:text-primary-c hover:bg-elevated rounded-xl transition-colors"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {link.label}
                </button>
              ))}
              <button
                onClick={() => { setMobileMenuOpen(false); handlePlanTrip(); }}
                className="block w-full text-left px-4 py-3 text-sm font-medium text-secondary-c hover:text-primary-c hover:bg-elevated rounded-xl transition-colors"
                style={{ color: 'var(--text-secondary)' }}
              >
                Sign In
              </button>
              <div className="pt-2">
                <Button fullWidth onClick={() => { setMobileMenuOpen(false); handlePlanTrip(); }}>
                  Plan Your Trip <ArrowRight size={16} />
                </Button>
              </div>
            </nav>
          </div>
        )}
      </header>

      {/* ─── Hero ───────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div className="max-w-6xl mx-auto px-5 pt-12 pb-10 md:pt-20 md:pb-16">
          <div className="grid md:grid-cols-2 gap-10 md:gap-12 items-center">
            <div className="animate-slide-up">
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium mb-5"
                style={{ backgroundColor: 'color-mix(in srgb, var(--primary) 12%, transparent)', color: 'var(--primary)' }}>
                <Sparkles size={12} /> AI-Powered Travel Companion
              </div>
              <h1 className="text-3xl sm:text-4xl md:text-[2.75rem] font-bold text-primary-c leading-[1.15] tracking-tight mb-4">
                Travel planning, without the planning overload.
              </h1>
              <p className="text-base md:text-lg text-secondary-c leading-relaxed mb-6 max-w-md" style={{ color: 'var(--text-secondary)' }}>
                Create a trip, get an AI-generated itinerary draft, explore places, track your spending, and keep important travel notes in one place.
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <Button size="lg" onClick={handlePlanTrip}>
                  Plan Your Trip <ArrowRight size={18} />
                </Button>
                <Button variant="secondary" size="lg" onClick={handleDemo}>
                  Try the Demo
                </Button>
              </div>
              <p className="text-xs text-muted-c mt-5 flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
                <AlertCircle size={12} className="flex-shrink-0" />
                AI-generated suggestions · Estimated costs · Review before relying on your plan
              </p>
            </div>

            {/* Product visual — faithful mockup of Trip Overview */}
            <div className="animate-fade-in hidden md:block">
              <ProductPreview />
            </div>
          </div>
        </div>
      </section>

      {/* Mobile product preview */}
      <div className="md:hidden px-5 pb-10">
        <ProductPreview />
      </div>

      {/* ─── How it Works ───────────────────────── */}
      <section id="how-it-works" className="border-t border-app bg-surface">
        <div className="max-w-5xl mx-auto px-5 py-14 md:py-20">
          <div className="text-center mb-10 md:mb-14">
            <h2 className="text-2xl md:text-3xl font-bold text-primary-c mb-3">How Tourist Works</h2>
            <p className="text-sm md:text-base text-secondary-c max-w-lg mx-auto" style={{ color: 'var(--text-secondary)' }}>
              Three steps from blank page to a plan you can adjust.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-6 md:gap-8">
            <StepCard
              num="01"
              title="Create your trip"
              desc="Set your destination, dates, travelers, budget, style, and interests."
            />
            <StepCard
              num="02"
              title="Shape your itinerary"
              desc="Generate an AI-powered draft, then edit, replace, or remove activities until the plan works for you."
            />
            <StepCard
              num="03"
              title="Stay organized"
              desc="Explore places, track actual expenses, and keep important trip notes together."
            />
          </div>
        </div>
      </section>

      {/* ─── Core Features ──────────────────────── */}
      <section id="features" className="border-t border-app">
        <div className="max-w-5xl mx-auto px-5 py-14 md:py-20">
          <div className="text-center mb-10 md:mb-14">
            <h2 className="text-2xl md:text-3xl font-bold text-primary-c mb-3">Core Features</h2>
            <p className="text-sm md:text-base text-secondary-c max-w-lg mx-auto" style={{ color: 'var(--text-secondary)' }}>
              Everything you need to plan, adjust, and stay on top of one trip.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 gap-5 md:gap-6">
            <FeatureCard
              icon={<CalendarDays size={20} />}
              color="var(--accent)"
              title="AI Itinerary"
              desc="Generate a day-by-day draft based on your trip details and interests."
            />
            <FeatureCard
              icon={<Search size={20} />}
              color="var(--success)"
              title="Explore Places"
              desc="Browse a curated catalog of places and add experiences to your itinerary."
            />
            <FeatureCard
              icon={<Receipt size={20} />}
              color="var(--warning)"
              title="Budget Clarity"
              desc="Keep your trip budget, estimated itinerary costs, and actual spending clearly separated."
            />
            <FeatureCard
              icon={<Notebook size={20} />}
              color="var(--primary)"
              title="Trip Notes"
              desc="Keep reservation details, directions, reminders, and other important information in one place."
            />
            <FeatureCard
              icon={<Compass size={20} />}
              color="var(--accent)"
              title="Your Trip, Your Decisions"
              desc="Edit, replace, remove, and organize the plan yourself. AI suggestions remain drafts for you to review."
            />
          </div>
        </div>
      </section>

      {/* ─── Financial Transparency ────────────── */}
      <section className="border-t border-app bg-surface">
        <div className="max-w-4xl mx-auto px-5 py-14 md:py-20">
          <div className="text-center mb-10">
            <h2 className="text-2xl md:text-3xl font-bold text-primary-c mb-3">
              Know what you're planning. Know what you're actually spending.
            </h2>
            <p className="text-sm md:text-base text-secondary-c max-w-lg mx-auto" style={{ color: 'var(--text-secondary)' }}>
              Tourist keeps planning estimates and real spending in separate views, so you always know which number is which.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 md:gap-4">
            <FlowStep icon={<Wallet size={18} />} label="Trip Budget" color="var(--accent)" />
            <FlowArrow />
            <FlowStep icon={<Sparkles size={18} />} label="AI Draft Estimate" color="var(--ai-draft)" />
            <FlowArrow />
            <FlowStep icon={<TrendingDown size={18} />} label="Actual Spent" color="var(--actual-spend)" />
            <FlowArrow />
            <FlowStep icon={<PiggyBank size={18} />} label="Remaining" color="var(--success)" />
          </div>

          <div className="mt-8 max-w-md mx-auto p-4 rounded-xl flex items-start gap-3"
            style={{ backgroundColor: 'color-mix(in srgb, var(--warning) 10%, transparent)' }}>
            <AlertCircle size={16} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--warning)' }} />
            <p className="text-xs md:text-sm" style={{ color: 'var(--text-secondary)' }}>
              <span className="font-medium" style={{ color: 'var(--warning)' }}>AI Draft Estimate ≠ Actual Spent.</span>{' '}
              Actual spending only comes from expenses you record yourself.
            </p>
          </div>
        </div>
      </section>

      {/* ─── AI Transparency ────────────────────── */}
      <section className="border-t border-app">
        <div className="max-w-3xl mx-auto px-5 py-14 md:py-20 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-5"
            style={{ backgroundColor: 'color-mix(in srgb, var(--ai-draft) 12%, transparent)' }}>
            <Sparkles size={26} style={{ color: 'var(--ai-draft)' }} aria-hidden="true" />
          </div>
          <h2 className="text-2xl md:text-3xl font-bold text-primary-c mb-4">
            AI helps with the draft. You stay in control.
          </h2>
          <p className="text-sm md:text-base text-secondary-c leading-relaxed max-w-xl mx-auto" style={{ color: 'var(--text-secondary)' }}>
            Tourist uses AI-style itinerary generation to help create a starting point. Activities and costs are estimates, not guarantees. Review and adjust your plan before relying on it.
          </p>
        </div>
      </section>

      {/* ─── Final CTA ──────────────────────────── */}
      <section className="border-t border-app bg-surface">
        <div className="max-w-3xl mx-auto px-5 py-16 md:py-24 text-center">
          <h2 className="text-2xl md:text-4xl font-bold text-primary-c mb-4 leading-tight">
            Ready to plan your next trip?
          </h2>
          <p className="text-sm md:text-base text-secondary-c mb-8 max-w-md mx-auto" style={{ color: 'var(--text-secondary)' }}>
            Start with the details that matter. Shape the plan yourself.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button size="lg" onClick={handlePlanTrip}>
              Plan Your Trip <ArrowRight size={18} />
            </Button>
            <Button variant="secondary" size="lg" onClick={handleDemo}>
              Try the Demo
            </Button>
          </div>
        </div>
      </section>

      {/* ─── Footer ─────────────────────────────── */}
      <footer className="border-t border-app">
        <div className="max-w-6xl mx-auto px-5 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--primary)' }}>
              <Compass size={14} className="text-white" aria-hidden="true" />
            </div>
            <span className="text-sm font-semibold text-primary-c">Tourist</span>
          </div>
          <p className="text-xs text-muted-c text-center sm:text-right max-w-md" style={{ color: 'var(--text-muted)' }}>
            AI-generated suggestions · Estimated costs · Curated places · Review before relying on your plan
          </p>
        </div>
      </footer>
    </div>
  );
}

// ─── Product Preview (faithful UI mockup) ──────────

function ProductPreview() {
  return (
    <div className="rounded-2xl border border-app bg-surface shadow-app-lg overflow-hidden">
      {/* Mock header */}
      <div className="px-5 py-4 border-b border-app flex items-center justify-between">
        <div>
          <p className="text-sm font-bold text-primary-c">Paris Adventure</p>
          <p className="text-xs flex items-center gap-1 mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            <MapPin size={10} /> Paris, France
          </p>
        </div>
        <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'var(--primary)' }}>
          <Plane size={14} className="text-white" />
        </div>
      </div>

      {/* Mock countdown */}
      <div className="px-5 py-4 border-b border-app">
        <div className="flex items-center gap-1.5 mb-1">
          <Plane size={12} style={{ color: 'var(--primary)' }} />
          <span className="text-[10px] font-medium uppercase tracking-wide" style={{ color: 'var(--primary)' }}>
            Departure Countdown
          </span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold text-primary-c">14</span>
          <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>days until Oct 12</span>
        </div>
      </div>

      {/* Mock meta cards */}
      <div className="px-5 py-4 border-b border-app grid grid-cols-3 gap-2">
        <MetaTile label="Dates" value="Oct 12" sub="5 days" icon={<CalendarDays size={14} />} />
        <MetaTile label="Travelers" value="2" sub="Leisure" icon={<Compass size={14} />} />
        <MetaTile label="Budget" value="€2,500" sub="EUR" icon={<Wallet size={14} />} />
      </div>

      {/* Mock budget summary */}
      <div className="px-5 py-4 border-b border-app">
        <p className="text-xs font-semibold text-primary-c mb-3">Budget Summary</p>
        <div className="space-y-2">
          <BudgetRow label="Trip Budget" value="€2,500" color="var(--text-primary)" />
          <BudgetRow label="AI Draft Estimate" value="€1,820" color="var(--ai-draft)" icon={<Sparkles size={11} />} />
          <BudgetRow label="Actual Spent" value="€340" color="var(--actual-spend)" icon={<TrendingDown size={11} />} />
          <div className="h-px" style={{ backgroundColor: 'var(--border)' }} />
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-primary-c flex items-center gap-1.5">
              <PiggyBank size={13} /> Remaining
            </span>
            <span className="text-sm font-bold" style={{ color: 'var(--success)' }}>€2,160</span>
          </div>
          <div className="h-1.5 rounded-full bg-elevated overflow-hidden mt-2">
            <div className="h-full rounded-full" style={{ width: '14%', backgroundColor: 'var(--actual-spend)' }} />
          </div>
        </div>
      </div>

      {/* Mock next activity */}
      <div className="px-5 py-4">
        <p className="text-[10px] font-medium uppercase tracking-wide mb-2" style={{ color: 'var(--text-muted)' }}>
          Next Activity
        </p>
        <p className="text-sm font-semibold text-primary-c mb-1.5">Museum Visit</p>
        <div className="flex items-center gap-3">
          <span className="text-xs flex items-center gap-1" style={{ color: 'var(--text-secondary)' }}>
            <Clock size={10} /> 10:00
          </span>
          <span className="text-xs flex items-center gap-1" style={{ color: 'var(--text-secondary)' }}>
            <CalendarDays size={10} /> Sat, Oct 12
          </span>
        </div>
      </div>
    </div>
  );
}

function MetaTile({ label, value, sub, icon }: { label: string; value: string; sub: string; icon: React.ReactNode }) {
  return (
    <div className="text-center">
      <div className="flex justify-center mb-1" style={{ color: 'var(--text-muted)' }}>{icon}</div>
      <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{label}</p>
      <p className="text-xs font-medium text-primary-c mt-0.5">{value}</p>
      <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{sub}</p>
    </div>
  );
}

function BudgetRow({ label, value, color, icon }: { label: string; value: string; color: string; icon?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs flex items-center gap-1.5" style={{ color }}>
        {icon} {label}
      </span>
      <span className="text-xs font-medium" style={{ color }}>{value}</span>
    </div>
  );
}

// ─── Section helpers ───────────────────────────────

function StepCard({ num, title, desc }: { num: string; title: string; desc: string }) {
  return (
    <div className="relative p-6 rounded-2xl bg-surface border border-app">
      <span className="text-3xl font-bold mb-3 block" style={{ color: 'color-mix(in srgb, var(--primary) 50%, var(--text-muted))' }}>
        {num}
      </span>
      <h3 className="text-lg font-semibold text-primary-c mb-2">{title}</h3>
      <p className="text-sm text-secondary-c leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{desc}</p>
    </div>
  );
}

function FeatureCard({ icon, color, title, desc }: { icon: React.ReactNode; color: string; title: string; desc: string }) {
  return (
    <div className="p-6 rounded-2xl bg-surface border border-app hover:shadow-app-md transition-shadow">
      <div className="w-11 h-11 rounded-xl flex items-center justify-center mb-4 flex-shrink-0"
        style={{ backgroundColor: `color-mix(in srgb, ${color} 15%, transparent)`, color }}>
        {icon}
      </div>
      <h3 className="text-base font-semibold text-primary-c mb-2">{title}</h3>
      <p className="text-sm text-secondary-c leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{desc}</p>
    </div>
  );
}

function FlowStep({ icon, label, color }: { icon: React.ReactNode; label: string; color: string }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-4 rounded-xl bg-elevated border border-app min-w-[110px]">
      <div className="w-10 h-10 rounded-xl flex items-center justify-center"
        style={{ backgroundColor: `color-mix(in srgb, ${color} 15%, transparent)`, color }}>
        {icon}
      </div>
      <span className="text-xs font-medium text-primary-c text-center">{label}</span>
    </div>
  );
}

function FlowArrow() {
  return (
    <ArrowRight size={18} className="flex-shrink-0 hidden sm:block" style={{ color: 'var(--text-muted)' }} aria-hidden="true" />
  );
}
