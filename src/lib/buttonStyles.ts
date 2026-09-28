export type ButtonVariant = 'primary' | 'accent' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg'

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: 'bg-btn-primary text-btn-primary-fg hover:bg-btn-primary-hover',
  accent: 'bg-btn-accent text-btn-accent-fg hover:bg-btn-accent-hover',
  secondary:
    'bg-surface text-ink border border-line-strong hover:bg-surface-low disabled:hover:bg-surface',
  ghost: 'bg-transparent text-ink-muted hover:bg-surface-low hover:text-ink',
  danger: 'bg-transparent text-danger border border-danger/40 hover:bg-danger-bg',
}

const SIZE_CLASS: Record<ButtonSize, string> = {
  sm: 'min-h-9 px-3 text-label-md gap-1.5',
  md: 'min-h-11 px-4 text-label-lg gap-2',
  lg: 'min-h-12 px-6 text-body-lg gap-2',
}

export function buttonClasses({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  className = '',
}: {
  variant?: ButtonVariant
  size?: ButtonSize
  fullWidth?: boolean
  className?: string
} = {}): string {
  return [
    'inline-flex items-center justify-center rounded-control font-semibold',
    'transition-colors duration-150 select-none',
    'disabled:cursor-not-allowed disabled:opacity-55',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
    SIZE_CLASS[size],
    VARIANT_CLASS[variant],
    fullWidth ? 'w-full' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')
}
