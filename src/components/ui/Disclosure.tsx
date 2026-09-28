import type { ReactNode } from 'react'
import { Icon } from './Icon'

export type DisclosureTone = 'quiet' | 'ai' | 'catalog'

const TONE_CLASS: Record<DisclosureTone, string> = {
  quiet: 'border-line bg-surface-low text-ink-muted',
  ai: 'border-ai-border bg-ai-bg text-ai-ink',
  catalog: 'border-catalog-border bg-catalog-bg text-catalog-ink',
}

/**
 * A one-line claim the traveller can open for the full explanation.
 *
 * Tourist is deliberately candid about what is drafted, estimated, curated or
 * demo data. That candour used to be written as paragraphs stacked above the
 * content, which pushed the actual trip off the first screen on a phone. Here
 * the claim stays visible and the reasoning is one tap away, so the product
 * keeps its honesty without spending the screen on it.
 *
 * Built on native `<details>`, so keyboard support, Enter/Space toggling and
 * screen-reader expanded state come from the platform rather than from ARIA we
 * would have to maintain.
 */
export function Disclosure({
  summary,
  children,
  tone = 'quiet',
  icon,
  className = '',
}: {
  summary: ReactNode
  children: ReactNode
  tone?: DisclosureTone
  icon?: string
  className?: string
}) {
  return (
    <details className={`group rounded-control border ${TONE_CLASS[tone]} ${className}`}>
      <summary
        className={
          'flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-body-sm ' +
          'rounded-control [&::-webkit-details-marker]:hidden'
        }
      >
        {icon ? <Icon name={icon} size={16} className="shrink-0 opacity-80" /> : null}
        <span className="min-w-0 flex-1">{summary}</span>
        <Icon
          name="expand_more"
          size={18}
          className="shrink-0 opacity-70 transition-transform duration-150 group-open:rotate-180"
        />
      </summary>
      <div className="px-3 pb-3 pt-0 text-body-sm opacity-90">{children}</div>
    </details>
  )
}
