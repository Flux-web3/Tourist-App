import type { ReactNode } from 'react'
import { Link, type LinkProps } from 'react-router-dom'
import { buttonClasses, type ButtonSize, type ButtonVariant } from '@/lib/buttonStyles'

export interface ButtonLinkProps extends Omit<LinkProps, 'className'> {
  variant?: ButtonVariant
  size?: ButtonSize
  icon?: ReactNode
  iconAfter?: ReactNode
  fullWidth?: boolean
  className?: string
  children: ReactNode
}

export function ButtonLink({
  variant = 'primary',
  size = 'md',
  icon,
  iconAfter,
  fullWidth = false,
  className = '',
  children,
  ...rest
}: ButtonLinkProps) {
  return (
    <Link {...rest} className={buttonClasses({ variant, size, fullWidth, className })}>
      {icon}
      <span>{children}</span>
      {iconAfter}
    </Link>
  )
}
