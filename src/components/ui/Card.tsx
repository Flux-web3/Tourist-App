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
  id,
  className = '',
}: {
  children: ReactNode
  hint?: ReactNode
  action?: ReactNode
  id?: string
  className?: string
}) {
  return (
    <div className={`mb-4 flex flex-wrap items-start justify-between gap-3 ${className}`}>
      <div className="min-w-0">
        <h2 id={id} className="text-headline-sm">
          {children}
        </h2>
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
    // `page-header` drops the bottom margin when the page already spaces its
    // sections with a flex gap, so the two never add up to a double gap.
    <header className="page-header mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow ? (
          <p className="eyebrow mb-2">{eyebrow}</p>
        ) : null}
        <h1 className="text-headline-lg text-ink">{title}</h1>
        {description ? (
          <div className="mt-2 max-w-2xl text-body-md text-ink-muted sm:text-body-lg">{description}</div>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  )
}
