import type { ReactNode } from 'react'

export type AlertTone = 'info' | 'success' | 'warning' | 'danger' | 'prototype'

const TONE_CLASS: Record<AlertTone, string> = {
  info: 'bg-planned-bg text-planned-ink border-planned-border',
  success: 'bg-actual-bg text-actual-ink border-actual-border',
  warning: 'bg-ai-bg text-ai-ink border-ai-border',
  danger: 'bg-danger-bg text-danger-ink border-danger-line',
  prototype: 'bg-catalog-bg text-catalog-ink border-catalog-border',
}

const ROLE: Record<AlertTone, 'alert' | 'status'> = {
  info: 'status',
  success: 'status',
  warning: 'status',
  danger: 'alert',
  prototype: 'status',
}

export interface AlertProps {
  tone?: AlertTone
  title: string
  children?: ReactNode
  action?: ReactNode
  className?: string
}

export function Alert({ tone = 'info', title, children, action, className = '' }: AlertProps) {
  return (
    <div
      role={ROLE[tone]}
      className={`flex flex-wrap items-start justify-between gap-3 rounded-control border px-4 py-3 ${TONE_CLASS[tone]} ${className}`}
    >
      <div className="min-w-0 flex-1">
        <p className="text-label-lg">{title}</p>
        {children ? <div className="mt-1 text-body-sm">{children}</div> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  )
}
