import { useId, useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'

/** `min-h-11` keeps every control on the 44px touch floor; `py-2.5` left them at 43. */
export const CONTROL_CLASS =
  'w-full min-h-11 rounded-control border border-field bg-surface px-3 py-2.5 text-body-md text-ink placeholder:text-ink-subtle transition-colors focus:border-navy focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus disabled:bg-surface-low disabled:text-ink-subtle'

function describedBy(id: string, hint?: string, error?: string): string | undefined {
  const ids = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean)
  return ids.length > 0 ? ids.join(' ') : undefined
}

/** Exported so composite controls (`DestinationCombobox`) share the same label, hint and error markup. */
export function FieldShell({
  id,
  label,
  hint,
  error,
  required,
  className = '',
  children,
}: {
  id: string
  label: string
  hint?: string
  error?: string
  required?: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={id} className="text-label-lg text-ink">
        {label}
        {required ? (
          <span className="ml-1 text-terracotta" aria-hidden="true">
            *
          </span>
        ) : null}
        {required ? <span className="sr-only">, required</span> : null}
      </label>
      {hint ? (
        <p id={`${id}-hint`} className="text-body-sm text-ink-subtle">
          {hint}
        </p>
      ) : null}
      {children}
      {error ? (
        <p id={`${id}-error`} className="flex items-center gap-1 text-body-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  )
}

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'className'> {
  id?: string
  label: string
  hint?: string
  error?: string
  className?: string
}

export function TextField({ id, label, hint, error, className = '', ...rest }: TextFieldProps) {
  const generated = useId()
  const fieldId = id ?? generated
  return (
    <FieldShell id={fieldId} label={label} hint={hint} error={error} required={rest.required} className={className}>
      <input
        {...rest}
        id={fieldId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(fieldId, hint, error)}
        className={`${CONTROL_CLASS} ${error ? 'border-danger' : ''}`}
      />
    </FieldShell>
  )
}

export interface TextAreaFieldProps
  extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id' | 'className'> {
  id?: string
  label: string
  hint?: string
  error?: string
  className?: string
}

export function TextAreaField({ id, label, hint, error, className = '', ...rest }: TextAreaFieldProps) {
  const generated = useId()
  const fieldId = id ?? generated
  return (
    <FieldShell id={fieldId} label={label} hint={hint} error={error} required={rest.required} className={className}>
      <textarea
        {...rest}
        id={fieldId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(fieldId, hint, error)}
        className={`${CONTROL_CLASS} min-h-24 resize-y ${error ? 'border-danger' : ''}`}
      />
    </FieldShell>
  )
}

export interface SelectFieldProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id' | 'className'> {
  id?: string
  label: string
  hint?: string
  error?: string
  options: ReadonlyArray<{ value: string; label: string }>
  placeholder?: string
  className?: string
}

export function SelectField({
  id,
  label,
  hint,
  error,
  options,
  placeholder,
  className = '',
  ...rest
}: SelectFieldProps) {
  const generated = useId()
  const fieldId = id ?? generated
  return (
    <FieldShell id={fieldId} label={label} hint={hint} error={error} required={rest.required} className={className}>
      <select
        {...rest}
        id={fieldId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(fieldId, hint, error)}
        className={`${CONTROL_CLASS} ${error ? 'border-danger' : ''}`}
      >
        {placeholder ? <option value="">{placeholder}</option> : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </FieldShell>
  )
}

export interface NumberFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'className' | 'type' | 'value' | 'onChange'> {
  id?: string
  label: string
  hint?: string
  error?: string
  value: number
  onValueChange: (value: number) => void
  prefix?: string
  suffix?: string
  className?: string
}

export function NumberField({
  id,
  label,
  hint,
  error,
  value,
  onValueChange,
  prefix,
  suffix,
  className = '',
  ...rest
}: NumberFieldProps) {
  const generated = useId()
  const fieldId = id ?? generated
  /**
   * The input keeps its own text while it is being edited, so the field can be
   * empty mid-typing. Mapping an empty input straight to `0` meant the box
   * refilled itself with "0" the moment you cleared it, and changing a budget
   * required select-all-then-type.
   */
  const [draft, setDraft] = useState<string | null>(null)
  const shown = draft ?? (Number.isFinite(value) ? String(value) : '')
  return (
    <FieldShell id={fieldId} label={label} hint={hint} error={error} required={rest.required} className={className}>
      <div className="relative">
        {prefix ? (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-body-sm text-ink-subtle">
            {prefix}
          </span>
        ) : null}
        <input
          {...rest}
          id={fieldId}
          type="number"
          inputMode="decimal"
          value={shown}
          onChange={(event) => {
            const next = event.target.value
            setDraft(next)
            const parsed = Number(next)
            onValueChange(next.trim() === '' || Number.isNaN(parsed) ? 0 : parsed)
          }}
          onBlur={(event) => {
            setDraft(null)
            rest.onBlur?.(event)
          }}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(fieldId, hint, error)}
          className={`${CONTROL_CLASS} tnum ${prefix ? 'pl-8' : ''} ${suffix ? 'pr-12' : ''} ${error ? 'border-danger' : ''}`}
        />
        {suffix ? (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-body-sm text-ink-subtle">
            {suffix}
          </span>
        ) : null}
      </div>
    </FieldShell>
  )
}

export interface ChoiceOption<T extends string> {
  value: T
  label: string
  hint?: string
}

/** Real radios styled as chips: keyboard and screen-reader behaviour for free. */
export function RadioChipGroup<T extends string>({
  legend,
  name,
  value,
  onChange,
  options,
  columns = 'auto',
  error,
  hint,
}: {
  legend: string
  name: string
  value: T
  onChange: (value: T) => void
  options: ReadonlyArray<ChoiceOption<T>>
  columns?: 'auto' | 3
  error?: string
  hint?: string
}) {
  const groupId = useId()
  return (
    <fieldset
      className="flex flex-col gap-2"
      aria-describedby={
        [hint ? `${groupId}-hint` : null, error ? `${groupId}-error` : null]
          .filter(Boolean)
          .join(' ') || undefined
      }
      aria-invalid={error ? true : undefined}
    >
      <legend className="text-label-lg text-ink">{legend}</legend>
      {hint ? (
        <p id={`${groupId}-hint`} className="text-body-sm text-ink-subtle">
          {hint}
        </p>
      ) : null}
      <div
        className={
          columns === 3
            ? 'grid gap-2 sm:grid-cols-3'
            : 'flex flex-wrap gap-2'
        }
      >
        {options.map((option) => {
          const id = `${groupId}-${option.value}`
          const checked = option.value === value
          return (
            <div key={option.value} className={columns === 3 ? '' : 'contents'}>
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
                className={`flex min-h-11 cursor-pointer flex-col justify-center border px-4 py-2 transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus ${
                  option.hint ? 'rounded-control' : 'rounded-pill'
                } ${
                  checked
                    ? 'border-btn-primary bg-btn-primary text-btn-primary-fg'
                    : 'border-field bg-surface text-ink hover:bg-surface-low'
                }`}
              >
                <span className="text-label-lg">{option.label}</span>
                {option.hint ? (
                  <span className={`text-body-sm ${checked ? 'opacity-80' : 'text-ink-subtle'}`}>
                    {option.hint}
                  </span>
                ) : null}
              </label>
            </div>
          )
        })}
      </div>
      {error ? (
        <p id={`${groupId}-error`} className="text-body-sm text-danger">
          {error}
        </p>
      ) : null}
    </fieldset>
  )
}

export function CheckboxChipGroup<T extends string>({
  legend,
  name,
  values,
  onChange,
  options,
  error,
  hint,
}: {
  legend: string
  name: string
  values: readonly T[]
  onChange: (values: T[]) => void
  options: ReadonlyArray<ChoiceOption<T>>
  error?: string
  hint?: string
}) {
  const groupId = useId()
  const toggle = (option: T) => {
    onChange(values.includes(option) ? values.filter((entry) => entry !== option) : [...values, option])
  }

  return (
    <fieldset
      className="flex flex-col gap-2"
      aria-describedby={
        [hint ? `${groupId}-hint` : null, error ? `${groupId}-error` : null]
          .filter(Boolean)
          .join(' ') || undefined
      }
      aria-invalid={error ? true : undefined}
    >
      <legend className="text-label-lg text-ink">{legend}</legend>
      {hint ? (
        <p id={`${groupId}-hint`} className="text-body-sm text-ink-subtle">
          {hint}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const id = `${groupId}-${option.value}`
          const checked = values.includes(option.value)
          return (
            <div key={option.value} className="contents">
              <input
                type="checkbox"
                id={id}
                name={name}
                value={option.value}
                checked={checked}
                onChange={() => toggle(option.value)}
                className="peer sr-only"
              />
              <label
                htmlFor={id}
                className={`inline-flex min-h-11 cursor-pointer items-center rounded-pill border px-4 text-label-lg capitalize transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus ${
                  checked
                    ? 'border-btn-primary bg-btn-primary text-btn-primary-fg'
                    : 'border-field bg-surface text-ink-muted hover:bg-surface-low'
                }`}
              >
                {option.label}
              </label>
            </div>
          )
        })}
      </div>
      {error ? (
        <p id={`${groupId}-error`} className="text-body-sm text-danger">
          {error}
        </p>
      ) : null}
    </fieldset>
  )
}
