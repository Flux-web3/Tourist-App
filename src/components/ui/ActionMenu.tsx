import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { Icon } from './Icon'

export interface ActionMenuItem {
  /** Visible label. Also the accessible name of the row. */
  label: string
  icon?: string
  onSelect: () => void
  /** Renders the row in the danger colour. Destructive rows sort to the end. */
  destructive?: boolean
  disabled?: boolean
}

/**
 * An overflow menu for the secondary actions on a repeated record.
 *
 * Itinerary stops used to carry Edit, Replace, Move and Remove as four visible
 * buttons each, so a seven day plan put roughly ninety buttons on one page and
 * the plan itself became hard to read. The actions all still exist and none of
 * them moved further than one tap away; they simply stop competing with the
 * traveller's own itinerary for attention.
 *
 * Implements the WAI-ARIA menu button pattern: Escape closes and restores
 * focus, arrow keys move between items, Home/End jump, and a click elsewhere
 * dismisses.
 */
export function ActionMenu({
  label,
  items,
  align = 'end',
}: {
  /** Accessible name for the trigger, e.g. `Actions for Louvre Museum`. */
  label: string
  items: ActionMenuItem[]
  align?: 'start' | 'end'
}) {
  const [open, setOpen] = useState(false)
  const [dropUp, setDropUp] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuId = useId()
  const enabled = items.filter((item) => !item.disabled)

  const close = useCallback((returnFocus: boolean) => {
    setOpen(false)
    if (returnFocus) triggerRef.current?.focus()
  }, [])

  useEffect(() => {
    if (!open) return
    const menu = menuRef.current
    menu?.querySelector<HTMLButtonElement>('button:not([disabled])')?.focus()

    const rows = () => [...(menu?.querySelectorAll<HTMLButtonElement>('button:not([disabled])') ?? [])]

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        close(true)
        return
      }
      const focusable = rows()
      if (focusable.length === 0) return
      const index = focusable.indexOf(document.activeElement as HTMLButtonElement)

      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()
        const step = event.key === 'ArrowDown' ? 1 : -1
        const next = (index + step + focusable.length) % focusable.length
        focusable[index === -1 ? 0 : next].focus()
      } else if (event.key === 'Home') {
        event.preventDefault()
        focusable[0].focus()
      } else if (event.key === 'End') {
        event.preventDefault()
        focusable[focusable.length - 1].focus()
      } else if (event.key === 'Tab') {
        // Closing without moving focus would unmount the focused row and drop
        // focus to <body>. Park it back on the trigger instead.
        event.preventDefault()
        close(true)
      }
    }

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (menu?.contains(target) || triggerRef.current?.contains(target)) return
      close(false)
    }

    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('mousedown', onPointerDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('mousedown', onPointerDown)
    }
  }, [open, close])

  if (enabled.length === 0) return null

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => {
          if (open) {
            close(false)
            return
          }
          // Open upwards when there is not enough room below, so the last stop
          // in a long itinerary does not drop its menu off the viewport.
          const box = triggerRef.current?.getBoundingClientRect()
          const needed = Math.min(items.length, 5) * 44 + 16
          setDropUp(Boolean(box && window.innerHeight - box.bottom < needed && box.top > needed))
          setOpen(true)
        }}
        className="grid h-11 w-11 place-items-center rounded-control text-ink-muted transition-colors hover:bg-surface-low hover:text-ink"
      >
        <Icon name="more_horiz" size={20} />
        <span className="sr-only">{label}</span>
      </button>

      {open ? (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={label}
          className={`surface-raised absolute z-40 flex min-w-48 flex-col p-1 ${
            align === 'end' ? 'right-0' : 'left-0'
          } ${dropUp ? 'bottom-full mb-1' : 'top-full mt-1'}`}
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              tabIndex={-1}
              disabled={item.disabled}
              onClick={() => {
                close(true)
                item.onSelect()
              }}
              className={`flex min-h-11 items-center gap-2 rounded-control px-3 text-left text-label-lg transition-colors disabled:cursor-not-allowed disabled:opacity-55 ${
                item.destructive
                  ? 'text-danger hover:bg-danger-bg'
                  : 'text-ink hover:bg-surface-low'
              }`}
            >
              {item.icon ? <Icon name={item.icon} size={18} className="shrink-0 opacity-80" /> : null}
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
