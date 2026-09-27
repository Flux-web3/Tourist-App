import { useState, useRef, useEffect } from 'react';
import { useTheme } from '@/hooks/useTheme';
import type { ThemeMode } from '@/types';
import { Sun, Moon, Monitor, ChevronDown } from 'lucide-react';

export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const options: { mode: ThemeMode; label: string; icon: typeof Sun }[] = [
    { mode: 'system', label: 'System', icon: Monitor },
    { mode: 'light', label: 'Light', icon: Sun },
    { mode: 'dark', label: 'Dark', icon: Moon },
  ];

  const current = options.find(o => o.mode === theme)!;
  const CurrentIcon = current.icon;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-elevated text-secondary-c hover:text-primary-c transition-colors text-sm border border-app"
        aria-label="Change theme"
        aria-expanded={open}
      >
        <CurrentIcon size={16} />
        <span className="hidden sm:inline">{current.label}</span>
        <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-36 bg-surface rounded-xl shadow-app-lg border border-app py-1 animate-scale-in z-50">
          {options.map(({ mode, label, icon: Icon }) => (
            <button
              key={mode}
              onClick={() => { setTheme(mode); setOpen(false); }}
              className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors ${
                theme === mode ? 'text-primary-c font-medium' : 'text-secondary-c hover:text-primary-c'
              }`}
              style={theme === mode ? { color: 'var(--primary)' } : undefined}
            >
              <Icon size={16} />
              {label}
              {theme === mode && <span className="ml-auto text-primary-action" style={{ color: 'var(--primary)' }}>•</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
