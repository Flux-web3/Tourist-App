import type { ReactNode } from 'react'

export function Card({
  children,
  className = '',
  as: Tag = 'section',
}: {
  children: ReactNode
  className?: string
  as?: 'section' | 'article' | 'div' | 'aside'
}) {
  return <Tag className={`surface-card p-5 ${className}`}>{children}</Tag>
}

export function CardTitle({
  children,
  hint,
  action,
  className = '',
}: {
  children: ReactNode
  hint?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={`mb-4 flex flex-wrap items-start justify-between gap-3 ${className}`}>
      <div className="min-w-0">
        <h2 className="text-headline-sm">{children}</h2>
        {hint ? <p className="mt-1 text-body-sm text-ink-subtle">{hint}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  )
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string
  title: string
  description?: ReactNode
  actions?: ReactNode
}) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow ? (
          <p className="mb-1 text-label-sm uppercase tracking-widest text-terracotta">{eyebrow}</p>
        ) : null}
        <h1 className="text-headline-lg">{title}</h1>
        {description ? (
          <div className="mt-2 max-w-2xl text-body-md text-ink-muted">{description}</div>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  )
}
