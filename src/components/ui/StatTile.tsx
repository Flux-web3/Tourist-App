import type { ReactNode } from 'react'

export type StatTone = 'neutral' | 'planned' | 'actual' | 'accent' | 'danger'

const TONE_BORDER: Record<StatTone, string> = {
  neutral: 'border-line',
  planned: 'border-planned-border bg-planned-bg text-planned-ink',
  actual: 'border-actual-border bg-actual-bg text-actual-ink',
  accent: 'border-ai-border bg-ai-bg text-ai-ink',
  danger: 'border-danger-line bg-danger-bg text-danger-ink',
}

export function StatTile({
  label,
  value,
  caption,
  tone = 'neutral',
  icon,
  className = '',
}: {
  label: string
  value: ReactNode
  caption?: ReactNode
  tone?: StatTone
  icon?: ReactNode
  className?: string
}) {
  return (
    <div
      className={`rounded-card border p-4 ${TONE_BORDER[tone]} ${tone === 'neutral' ? 'bg-surface' : ''} ${className}`}
    >
      {/*
        No opacity on the label or caption: on a tinted tile the text colour is
        already the tone's own ink, so dimming it to 80% dropped the AI tile
        from 4.69:1 to 3.34:1 and pushed it below AA.
      */}
      <div className="flex items-center gap-1.5 text-label-sm uppercase tracking-wider">
        {icon}
        {label}
      </div>
      <p className="tnum mt-2 text-headline-md">{value}</p>
      {caption ? <p className="mt-1 text-body-sm">{caption}</p> : null}
    </div>
  )
}

export function ProgressBar({
  value,
  max,
  label,
  tone = 'neutral',
}: {
  value: number
  max: number
  label: string
  tone?: StatTone
}) {
  const safeMax = max <= 0 ? 1 : max
  const ratio = Math.max(0, Math.min(1, value / safeMax))
  const over = value > safeMax
  const fill =
    over || tone === 'danger'
      ? 'bg-danger'
      : tone === 'accent'
        ? 'bg-terracotta'
        : tone === 'actual'
          ? 'bg-sage'
          : 'bg-navy'

  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={safeMax}
      aria-valuenow={Math.round(value)}
      aria-label={label}
      className="h-2 w-full overflow-hidden rounded-pill bg-surface-high"
    >
      <div
        className={`h-full rounded-pill transition-[width] duration-300 ${fill}`}
        style={{ width: `${ratio * 100}%` }}
      />
    </div>
  )
}
