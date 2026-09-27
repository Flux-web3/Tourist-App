import { type ReactNode, type ButtonHTMLAttributes, useEffect } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
  loading?: boolean;
  children: ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  fullWidth,
  loading,
  children,
  className = '',
  disabled,
  ...props
}: ButtonProps) {
  const base = 'inline-flex items-center justify-center gap-2 font-medium rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed select-none';
  const sizes: Record<Size, string> = {
    sm: 'text-sm px-3 py-2 min-h-[36px]',
    md: 'text-sm px-4 py-2.5 min-h-[42px]',
    lg: 'text-base px-6 py-3.5 min-h-[50px]',
  };
  const variants: Record<Variant, string> = {
    primary: 'text-white hover:brightness-105 active:brightness-95 shadow-app',
    secondary: 'bg-elevated text-primary-c border border-app hover:brightness-95 active:brightness-90',
    ghost: 'text-secondary-c hover:bg-elevated',
    danger: 'bg-error-c text-white hover:brightness-105 active:brightness-95',
    outline: 'border-2 text-primary-c hover:bg-elevated',
  };
  const bgClass = variant === 'primary' ? 'bg-primary-c' : variant === 'danger' ? 'bg-error-c' : '';

  return (
    <button
      className={`${base} ${sizes[size]} ${variants[variant]} ${fullWidth ? 'w-full' : ''} ${bgClass} ${className}`}
      style={variant === 'primary' || variant === 'danger' ? { backgroundColor: variant === 'primary' ? 'var(--primary)' : 'var(--error)' } : undefined}
      disabled={disabled || loading}
      {...props}
    >
      {loading && (
        <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
          <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </svg>
      )}
      {children}
    </button>
  );
}

export function Card({ children, className = '', onClick, padded = true }: { children: ReactNode; className?: string; onClick?: () => void; padded?: boolean }) {
  return (
    <div
      onClick={onClick}
      className={`bg-surface rounded-2xl border border-app shadow-app transition-all ${onClick ? 'cursor-pointer hover:shadow-app-md' : ''} ${padded ? 'p-5' : ''} ${className}`}
    >
      {children}
    </div>
  );
}

export function Chip({ children, active, onClick, icon }: { children: ReactNode; active?: boolean; onClick?: () => void; icon?: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border transition-all whitespace-nowrap ${
        active
          ? 'text-white border-transparent'
          : 'bg-surface text-secondary-c border-app hover:bg-elevated'
      }`}
      style={active ? { backgroundColor: 'var(--primary)' } : undefined}
    >
      {icon}
      {children}
    </button>
  );
}

export function Input({
  label, error, hint, ...props
}: {
  label?: string;
  error?: string;
  hint?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="space-y-1.5">
      {label && <label className="block text-sm font-medium text-primary-c">{label}</label>}
      <input
        className={`w-full px-4 py-2.5 rounded-xl bg-surface border text-primary-c placeholder:text-muted-c text-sm transition-all focus:outline-none focus:ring-2 ${
          error ? 'border-error-c' : 'border-app'
        }`}
        style={error ? { borderColor: 'var(--error)' } : undefined}
        aria-invalid={!!error}
        aria-describedby={error ? `${props.id}-error` : undefined}
        {...props}
      />
      {error && <p id={`${props.id}-error`} className="text-xs text-error-c" style={{ color: 'var(--error)' }}>{error}</p>}
      {hint && !error && <p className="text-xs text-muted-c" style={{ color: 'var(--text-muted)' }}>{hint}</p>}
    </div>
  );
}

export function Select({
  label, error, children, ...props
}: {
  label?: string;
  error?: string;
  children: ReactNode;
} & React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="space-y-1.5">
      {label && <label className="block text-sm font-medium text-primary-c">{label}</label>}
      <select
        className={`w-full px-4 py-2.5 rounded-xl bg-surface border text-primary-c text-sm transition-all focus:outline-none focus:ring-2 ${
          error ? 'border-error-c' : 'border-app'
        }`}
        style={error ? { borderColor: 'var(--error)' } : undefined}
        {...props}
      >
        {children}
      </select>
      {error && <p className="text-xs text-error-c" style={{ color: 'var(--error)' }}>{error}</p>}
    </div>
  );
}

export function Textarea({
  label, error, ...props
}: {
  label?: string;
  error?: string;
} & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <div className="space-y-1.5">
      {label && <label className="block text-sm font-medium text-primary-c">{label}</label>}
      <textarea
        className={`w-full px-4 py-2.5 rounded-xl bg-surface border text-primary-c placeholder:text-muted-c text-sm transition-all focus:outline-none focus:ring-2 resize-none ${
          error ? 'border-error-c' : 'border-app'
        }`}
        style={error ? { borderColor: 'var(--error)' } : undefined}
        {...props}
      />
      {error && <p className="text-xs text-error-c" style={{ color: 'var(--error)' }}>{error}</p>}
    </div>
  );
}

export function Modal({
  open, onClose, children, title, maxWidth = 'max-w-md',
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: string;
  maxWidth?: string;
}) {
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40 animate-fade-in" onClick={onClose} />
      <div className={`relative w-full ${maxWidth} bg-surface rounded-t-3xl sm:rounded-2xl shadow-app-lg animate-slide-up sm:animate-scale-in max-h-[90vh] overflow-y-auto`}>
        {title && (
          <div className="sticky top-0 bg-surface px-5 pt-5 pb-3 border-b border-app flex items-center justify-between z-10">
            <h2 className="text-lg font-semibold text-primary-c">{title}</h2>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-elevated text-muted-c" aria-label="Close">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
            </button>
          </div>
        )}
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function EmptyState({ icon, title, message, action }: { icon: ReactNode; title: string; message: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6 animate-fade-in">
      <div className="mb-4 p-4 rounded-2xl bg-elevated text-muted-c">{icon}</div>
      <h3 className="text-lg font-semibold text-primary-c mb-1.5">{title}</h3>
      <p className="text-sm text-secondary-c max-w-xs mb-6" style={{ color: 'var(--text-secondary)' }}>{message}</p>
      {action}
    </div>
  );
}

export function Spinner({ size = 24 }: { size?: number }) {
  return (
    <svg className="animate-spin" width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.2" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function Badge({ children, color = 'neutral' }: { children: ReactNode; color?: 'neutral' | 'ai' | 'cost' | 'spend' | 'success' | 'warning' | 'error' }) {
  const styles: Record<string, string> = {
    neutral: 'bg-elevated text-secondary-c',
    ai: '',
    cost: '',
    spend: '',
    success: '',
    warning: '',
    error: '',
  };
  const colorVar: Record<string, string> = {
    ai: 'var(--ai-draft)',
    cost: 'var(--est-cost)',
    spend: 'var(--actual-spend)',
    success: 'var(--success)',
    warning: 'var(--warning)',
    error: 'var(--error)',
  };
  const style = color !== 'neutral' ? { backgroundColor: `color-mix(in srgb, ${colorVar[color]} 15%, transparent)`, color: colorVar[color] } : undefined;
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${styles[color]}`} style={style}>
      {children}
    </span>
  );
}

export function ProgressBar({ value, max, color = 'var(--primary)' }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="h-2 rounded-full bg-elevated overflow-hidden">
      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: color }} />
    </div>
  );
}
