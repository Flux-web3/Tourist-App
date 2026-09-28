import type { ReactNode } from 'react'
import { Icon } from './Icon'

export function EmptyState({
  icon = 'travel_explore',
  title,
  description,
  action,
  className = '',
}: {
  icon?: string
  title: string
  description?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div
      className={`flex flex-col items-center gap-3 rounded-card border border-dashed border-line-strong bg-surface-low px-6 py-10 text-center ${className}`}
    >
      <Icon name={icon} size={28} className="text-ink-subtle" />
      <p className="text-headline-sm">{title}</p>
      {description ? (
        <p className="max-w-sm text-body-sm text-ink-muted">{description}</p>
      ) : null}
      {action}
    </div>
  )
}

export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-control bg-surface-high ${className}`}
      aria-hidden="true"
    />
  )
}
