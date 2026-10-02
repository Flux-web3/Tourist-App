import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import {
  getDestination,
  matchDestination,
  searchDestinations,
  type Destination,
} from '@/data/destinations'
import { GUIDE_LABEL, generalGuideHint } from '@/lib/labels'
import { CONTROL_CLASS, FieldShell } from './Field'
import { Icon } from './Icon'

export interface DestinationComboboxProps {
  id?: string
  label: string
  /** The committed destination id, or null when nothing from the list is chosen. */
  value: string | null
  /**
   * Text to show while `value` is null: a trip saved before destinations came
   * from the catalogue keeps its typed destination, and the field must show it
   * rather than pretend the trip has none.
   */
  unlistedText?: string
  /** Called with the chosen destination, or null when the traveller clears the field. */
  onSelect: (destination: Destination | null) => void
  hint?: string
  error?: string
  required?: boolean
  placeholder?: string
  className?: string
  /** Extra guidance under the input, read out with the field (e.g. a legacy-trip note). */
  note?: ReactNode
  /**
   * Whether a committed general destination says, under the field, that it has
   * no curated guide. On by default so every place a destination is chosen is
   * candid about it; turn off only where the same sentence is already shown.
   */
  guideHint?: boolean
}

/**
 * Picks a trip's destination from the curated catalogue.
 *
 * Destination used to be free text, so nothing downstream could tell which
 * city a trip was in. The value here can only ever be a catalogue entry: typed
 * text is a search, never a destination. That is why leaving the field with a
 * half-typed query puts the committed choice back instead of keeping the text.
 *
 * ARIA 1.2 editable combobox with list autocomplete and automatic highlight
 * (the first match is highlighted while typing, so "lon" then Enter picks
 * London). The highlight wraps at both ends of the list; `aria-selected` marks
 * the highlighted option, as in the APG example, and a check marks the
 * committed one. Escape closes and restores the committed text; it never clears
 * a committed choice, because in a dialog a second Escape belongs to the dialog.
 */
export function DestinationCombobox({
  id,
  label,
  value,
  unlistedText,
  onSelect,
  hint,
  error,
  required,
  placeholder = 'Search cities, e.g. London',
  className = '',
  note,
  guideHint = true,
}: DestinationComboboxProps) {
  const generated = useId()
  const fieldId = id ?? generated
  const listboxId = `${fieldId}-listbox`
  const noteId = `${fieldId}-note`
  const guideId = `${fieldId}-guide`
  const inputRef = useRef<HTMLInputElement>(null)

  const committed = getDestination(value)
  const committedText = committed?.displayName ?? unlistedText ?? ''
  const showGuideHint = guideHint && committed?.guide === 'general'

  /** What the traveller is typing; null while the input simply shows the committed choice. */
  const [query, setQuery] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)

  const options = useMemo(() => searchDestinations(query ?? ''), [query])
  const active = open && activeIndex >= 0 ? options[activeIndex] : undefined
  const optionId = (destination: Destination) => `${fieldId}-option-${destination.id}`
  const trimmedQuery = (query ?? '').trim()
  const noMatches = open && options.length === 0
  /*
    With nothing to offer there is no listbox at all: an empty one is announced
    as a list of nothing. The no-match message takes its place, and the input
    stops claiming an expanded popup or pointing at an id that is not there.
  */
  const hasOptions = options.length > 0

  const close = () => {
    setQuery(null)
    setOpen(false)
    setActiveIndex(-1)
  }

  const choose = (destination: Destination) => {
    close()
    if (destination.id !== value) onSelect(destination)
    inputRef.current?.focus()
  }

  /** Opening without typing starts on the committed choice, so the list shows where you are. */
  const openList = (from: 'first' | 'last') => {
    setOpen(true)
    if (options.length === 0) {
      setActiveIndex(-1)
      return
    }
    const current = committed ? options.findIndex((option) => option.id === committed.id) : -1
    setActiveIndex(current >= 0 ? current : from === 'first' ? 0 : options.length - 1)
  }

  /**
   * Leaving the field settles it. Cleared text clears the choice, so the form's
   * required-field error can show; text that names exactly one catalogue city
   * ("London", "tokyo") is taken as that city rather than thrown away; anything
   * else was only a search and the committed choice comes back.
   */
  const settle = () => {
    if (query === null) {
      setOpen(false)
      setActiveIndex(-1)
      return
    }
    const text = query.trim()
    close()
    if (text === '') {
      if (value !== null || committedText !== '') onSelect(null)
      return
    }
    const exact = matchDestination(text)
    if (exact && exact.id !== value) onSelect(exact)
  }

  /*
    Escape is caught on window in the capture phase, ahead of everything else.
    Dialog listens on document in the capture phase too, so a plain onKeyDown
    here would never see the key: the first Escape inside Edit trip closed the
    whole dialog instead of the list. Only registered while there is a list or
    a half-typed query to dismiss, so a second Escape still closes the dialog.
  */
  useEffect(() => {
    if (!open && query === null) return
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape' || event.target !== inputRef.current) return
      event.preventDefault()
      event.stopPropagation()
      setQuery(null)
      setOpen(false)
      setActiveIndex(-1)
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [open, query])

  useEffect(() => {
    if (!active) return
    document.getElementById(`${fieldId}-option-${active.id}`)?.scrollIntoView?.({ block: 'nearest' })
  }, [active, fieldId])

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const down = event.key === 'ArrowDown'
      if (!open || event.altKey) {
        openList(down ? 'first' : 'last')
        return
      }
      if (options.length === 0) return
      const last = options.length - 1
      setActiveIndex((index) => (down ? (index >= last ? 0 : index + 1) : index <= 0 ? last : index - 1))
      return
    }
    if (event.key === 'Enter' && open) {
      // An open list owns Enter: it must never submit the form behind it.
      event.preventDefault()
      if (active) choose(active)
    }
  }

  const describedBy =
    [
      hint ? `${fieldId}-hint` : null,
      showGuideHint ? guideId : null,
      note ? noteId : null,
      error ? `${fieldId}-error` : null,
    ]
      .filter(Boolean)
      .join(' ') || undefined

  return (
    <FieldShell id={fieldId} label={label} hint={hint} error={error} required={required} className={className}>
      <div className="relative">
        <input
          ref={inputRef}
          id={fieldId}
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open && hasOptions}
          aria-controls={hasOptions ? listboxId : undefined}
          aria-activedescendant={active ? optionId(active) : undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          required={required}
          autoComplete="off"
          autoCapitalize="words"
          spellCheck={false}
          placeholder={placeholder}
          value={query ?? committedText}
          onChange={(event) => {
            const next = event.target.value
            setQuery(next)
            setOpen(true)
            setActiveIndex(next.trim() !== '' && searchDestinations(next).length > 0 ? 0 : -1)
          }}
          onClick={() => {
            if (!open) openList('first')
          }}
          onKeyDown={onKeyDown}
          onBlur={settle}
          className={`${CONTROL_CLASS} pr-10 ${error ? 'border-danger' : ''}`}
        />
        <Icon
          name={open ? 'expand_less' : 'expand_more'}
          size={20}
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-subtle"
        />

        {/*
          Pressing an option must not blur the input first: blur settles the
          field and would put the old choice back before the click lands.
        */}
        <div
          hidden={!open}
          onMouseDown={(event) => event.preventDefault()}
          className="surface-raised absolute inset-x-0 top-full z-40 mt-1 max-h-72 rounded-control overflow-y-auto overscroll-contain p-1"
        >
          {hasOptions ? (
          <ul id={listboxId} role="listbox" aria-label="Cities">
            {options.map((destination, index) => {
              const highlighted = index === activeIndex
              const isCommitted = destination.id === committed?.id
              const guideLabelId = `${optionId(destination)}-guide`
              /*
                The name stays the display name, the value the field commits;
                the guide level is the option's description, so a screen
                reader hears "Tokyo, Japan" then "General suggestions" and no
                two options ever share a name.
              */
              return (
                <li
                  key={destination.id}
                  id={optionId(destination)}
                  role="option"
                  aria-selected={highlighted}
                  aria-label={destination.displayName}
                  aria-describedby={guideLabelId}
                  onClick={() => choose(destination)}
                  onMouseMove={() => {
                    if (!highlighted) setActiveIndex(index)
                  }}
                  className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-control px-3 py-2 ${
                    highlighted ? 'bg-surface-high shadow-[inset_3px_0_0_var(--navy)]' : ''
                  }`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-label-lg font-semibold text-ink">{destination.city}</span>
                    <span className="block truncate text-body-sm text-ink-subtle">{destination.country}</span>
                    <span
                      id={guideLabelId}
                      className={`mt-0.5 flex items-center gap-1 text-label-sm ${
                        destination.guide === 'curated' ? 'text-catalog-ink' : 'text-ink-subtle'
                      }`}
                    >
                      <Icon
                        name={destination.guide === 'curated' ? 'menu_book' : 'lightbulb'}
                        size={14}
                        className="shrink-0"
                      />
                      {GUIDE_LABEL[destination.guide]}
                    </span>
                  </span>
                  <span className="text-label-md text-ink-subtle">{destination.currency}</span>
                  <Icon
                    name="check"
                    size={18}
                    className={isCommitted ? 'text-navy' : 'invisible'}
                  />
                </li>
              )
            })}
          </ul>
          ) : null}
          {noMatches ? (
            <div aria-hidden="true" className="px-3 py-2">
              <p className="text-label-lg text-ink">{`No destinations match "${trimmedQuery}"`}</p>
              <p className="text-body-sm text-ink-subtle">
                Tourist covers a fixed set of cities in this prototype. Clear the search to see them all.
              </p>
            </div>
          ) : null}
        </div>
      </div>
      {/* The visible no-match row is not an option, so it is announced here instead. */}
      <p role="status" className="sr-only">
        {noMatches
          ? `No destinations match "${trimmedQuery}". Tourist covers a fixed set of cities in this prototype.`
          : ''}
      </p>
      {showGuideHint && committed ? (
        <p id={guideId} className="flex items-start gap-1.5 text-body-sm text-ink-muted">
          <Icon name="info" size={16} className="mt-0.5 shrink-0 text-ink-subtle" />
          <span className="min-w-0">{generalGuideHint(committed.city)}</span>
        </p>
      ) : null}
      {note ? (
        <div id={noteId} className="text-body-sm text-ink-muted">
          {note}
        </div>
      ) : null}
    </FieldShell>
  )
}
