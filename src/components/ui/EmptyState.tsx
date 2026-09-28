import type { ReactNode } from 'react'
import { Icon } from './Icon'

export function EmptyState({
  icon = 'travel_explore',
  title,
  description,
  action,
  headingLevel,
  className = '',
}: {
  icon?: string
  title: string
  description?: ReactNode
  action?: ReactNode
  /**
   * Renders the title as a real heading. Pass `1` where the empty state IS the
   * page — a 404, or a trip that no longer exists — which previously left
   * those screens with no heading at all.
   */
  headingLevel?: 1 | 2 | 3
  className?: string
}) {
  const Title = headingLevel ? (`h${headingLevel}` as const) : 'p'
  return (
    <div
      className={`flex flex-col items-center gap-3 rounded-card border border-dashed border-line-strong bg-surface-low px-6 py-10 text-center ${className}`}
    >
      <Icon name={icon} size={28} className="text-ink-subtle" />
      <Title className="text-headline-sm">{title}</Title>
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
