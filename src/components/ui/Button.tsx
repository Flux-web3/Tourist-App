import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react'
import { buttonClasses, type ButtonSize, type ButtonVariant } from '@/lib/buttonStyles'

export type { ButtonSize, ButtonVariant }

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  loadingLabel?: string
  icon?: ReactNode
  iconAfter?: ReactNode
  fullWidth?: boolean
  ref?: Ref<HTMLButtonElement>
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  loadingLabel = 'Working',
  icon,
  iconAfter,
  fullWidth = false,
  className = '',
  children,
  disabled,
  type = 'button',
  ref,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClasses({ variant, size, fullWidth, className })}
    >
      {loading ? <Spinner size={size === 'lg' ? 18 : 16} /> : icon}
      <span>{loading ? loadingLabel : children}</span>
      {!loading && iconAfter}
    </button>
  )
}

export function Spinner({ size = 16, className = '' }: { size?: number; className?: string }) {
  return (
    <span
      className={`inline-block shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent ${className}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    />
  )
}
