import { useId } from 'react'

export interface SegmentedOption<T extends string> {
  value: T
  label: string
  icon?: string
}

/**
 * Radiogroup semantics so arrow keys and screen readers behave as expected.
 * Used for the theme switcher and other single-choice filters.
 */
export function SegmentedControl<T extends string>({
  label,
  value,
  onChange,
  options,
  size = 'md',
  className = '',
}: {
  label: string
  value: T
  onChange: (value: T) => void
  options: ReadonlyArray<SegmentedOption<T>>
  size?: 'sm' | 'md'
  className?: string
}) {
  const name = useId()
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={`inline-flex rounded-pill border border-line-strong bg-surface-low p-1 ${className}`}
    >
      {options.map((option) => {
        const id = `${name}-${option.value}`
        const checked = option.value === value
        return (
          <div key={option.value} className="contents">
            <input
              type="radio"
              id={id}
              name={name}
              value={option.value}
              checked={checked}
              onChange={() => onChange(option.value)}
              className="peer sr-only"
            />
            <label
              htmlFor={id}
              /*
                Selected is the product colour, as on every other selected
                state. The old `bg-surface shadow-card` was 1.08:1 against the
                track in dark mode, so the chosen theme was invisible on the
                control that switches it; the primary fill reads in both.
              */
              className={`flex min-h-9 cursor-pointer items-center gap-1.5 rounded-pill border font-semibold capitalize transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus ${
                size === 'sm' ? 'px-3 py-1 text-label-sm' : 'px-3.5 py-1.5 text-label-md'
              } ${
                checked
                  ? 'border-transparent bg-btn-primary text-btn-primary-fg'
                  : 'border-transparent text-ink-muted hover:text-ink'
              }`}
            >
              {option.icon ? (
                <span className="material-symbols-outlined" style={{ fontSize: size === 'sm' ? 14 : 16 }} aria-hidden="true">
                  {option.icon}
                </span>
              ) : null}
              {option.label}
            </label>
          </div>
        )
      })}
    </div>
  )
}

export interface TabOption {
  value: string
  label: string
  count?: number
}

/**
 * Tabs with arrow-key navigation.
 *
 * No `aria-controls` on the tabs: `TabPanel` renders no matching id, and a
 * dangling reference is worse for assistive tech than none at all.
 */
export function Tabs({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: ReadonlyArray<TabOption>
}) {
  const name = useId()

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const index = options.findIndex((option) => option.value === value)
    if (index < 0) return
    let next = index
    if (event.key === 'ArrowRight') next = (index + 1) % options.length
    else if (event.key === 'ArrowLeft') next = (index - 1 + options.length) % options.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = options.length - 1
    else return
    event.preventDefault()
    onChange(options[next].value)
    document.getElementById(`${name}-${options[next].value}`)?.focus()
  }

  return (
    <div
      role="tablist"
      aria-label={label}
      onKeyDown={onKeyDown}
      className="flex gap-1 overflow-x-auto border-b border-line pb-px"
    >
      {options.map((option) => {
        const selected = option.value === value
        return (
          <button
            key={option.value}
            id={`${name}-${option.value}`}
            role="tab"
            type="button"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(option.value)}
            className={`-mb-px min-h-11 shrink-0 border-b-2 px-3 py-2.5 text-label-lg transition-colors ${
              selected
                ? 'border-terracotta text-ink'
                : 'border-transparent text-ink-subtle hover:border-line-strong hover:text-ink'
            }`}
          >
            {option.label}
            {option.count !== undefined ? (
              <span className="tnum ml-1.5 text-body-sm text-ink-subtle">{option.count}</span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}

export function TabPanel({
  value,
  active,
  children,
  className = '',
}: {
  value: string
  active: string
  children: React.ReactNode
  className?: string
}) {
  if (value !== active) return null
  return (
    <div role="tabpanel" className={`pt-4 ${className}`}>
      {children}
    </div>
  )
}
