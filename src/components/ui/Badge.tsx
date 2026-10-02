import type { ReactNode } from 'react'

export type BadgeTone = 'neutral' | 'ai' | 'catalog' | 'planned' | 'actual' | 'danger' | 'accent'

const TONE_CLASS: Record<BadgeTone, string> = {
  neutral: 'bg-surface-high text-ink-muted border-line',
  ai: 'bg-ai-bg text-ai-ink border-ai-border',
  catalog: 'bg-catalog-bg text-catalog-ink border-catalog-border',
  planned: 'bg-planned-bg text-planned-ink border-planned-border',
  actual: 'bg-actual-bg text-actual-ink border-actual-border',
  danger: 'bg-danger-bg text-danger-ink border-danger-line',
  accent: 'bg-surface text-terracotta border-terracotta/30',
}

export interface BadgeProps {
  tone?: BadgeTone
  children: ReactNode
  icon?: ReactNode
  className?: string
}

export function Badge({ tone = 'neutral', children, icon, className = '' }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-pill border px-2.5 py-1 text-label-sm ${TONE_CLASS[tone]} ${className}`}
    >
      {icon}
      {children}
    </span>
  )
}
