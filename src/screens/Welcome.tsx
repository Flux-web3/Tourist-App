import { useApp } from '@/context/AppContext';
import { ThemeSwitcher } from '@/components/ThemeSwitcher';
import { Button } from '@/components/ui';
import { Compass, Mail, ArrowRight, Globe } from 'lucide-react';
import { useState } from 'react';

export function WelcomeScreen() {
  const { enterDemo, signIn } = useApp();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) {
      setError('Please enter your email');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError('Please enter a valid email address');
      return;
    }
    setError('');
    setLoading(true);
    setTimeout(() => {
      const name = trimmed.split('@')[0].charAt(0).toUpperCase() + trimmed.split('@')[0].slice(1);
      signIn(trimmed, name);
      setLoading(false);
    }, 800);
  }

  return (
    <div className="min-h-screen bg-app flex flex-col">
      <header className="flex items-center justify-between px-5 py-4">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'var(--primary)' }}>
            <Compass size={20} className="text-white" />
          </div>
          <span className="text-lg font-semibold text-primary-c">Tourist</span>
        </div>
        <ThemeSwitcher />
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-5 py-8 max-w-md mx-auto w-full">
        <div className="w-full animate-slide-up">
          <div className="text-center mb-10">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-6 shadow-app-md" style={{ backgroundColor: 'var(--primary)' }}>
              <Globe size={32} className="text-white" />
            </div>
            <h1 className="text-3xl font-bold text-primary-c mb-3 leading-tight">
              Your AI travel companion
            </h1>
            <p className="text-base text-secondary-c leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              Plan one trip beautifully. Generate itineraries, discover places, and track your budget — all in one calm, focused space.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3 mb-4">
            <div className="space-y-1.5">
              <label htmlFor="email" className="block text-sm font-medium text-primary-c">Email</label>
              <div className="relative">
                <Mail size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-c" style={{ color: 'var(--text-muted)' }} />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className={`w-full pl-11 pr-4 py-3 rounded-xl bg-surface border text-primary-c placeholder:text-muted-c text-sm transition-all focus:outline-none focus:ring-2 ${error ? 'border-error-c' : 'border-app'}`}
                  style={error ? { borderColor: 'var(--error)' } : undefined}
                  aria-invalid={!!error}
                  aria-describedby={error ? 'email-error' : undefined}
                />
              </div>
              {error && <p id="email-error" className="text-xs text-error-c" style={{ color: 'var(--error)' }}>{error}</p>}
            </div>
            <Button type="submit" fullWidth size="lg" loading={loading}>
              Sign in
              {!loading && <ArrowRight size={18} />}
            </Button>
          </form>

          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px bg-app" style={{ backgroundColor: 'var(--border)' }} />
            <span className="text-xs text-muted-c" style={{ color: 'var(--text-muted)' }}>or</span>
            <div className="flex-1 h-px" style={{ backgroundColor: 'var(--border)' }} />
          </div>

          <Button variant="secondary" fullWidth size="lg" onClick={enterDemo}>
            Explore demo trip
            <ArrowRight size={18} />
          </Button>

          <p className="text-center text-xs text-muted-c mt-6" style={{ color: 'var(--text-muted)' }}>
            No account needed. Your data stays on this device.
          </p>
        </div>
      </main>
    </div>
  );
}
