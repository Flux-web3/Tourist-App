import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from './Icon'

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export interface DialogProps {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children: ReactNode
  footer?: ReactNode
  size?: 'md' | 'lg'
}

/**
 * Makes everything on the page except `overlay` inert, and returns the undo.
 *
 * The dialog is portalled to `<body>`, so the page behind it is the overlay's
 * siblings there (`#root` in the app). `aria-modal` alone is only a hint: the
 * page stayed reachable by Tab, by a screen reader's browse mode and by a click
 * that slipped past the scrim. Anything already inert is left alone, so it is
 * still inert afterwards.
 */
function makeBackgroundInert(overlay: HTMLElement | null): () => void {
  if (!overlay?.parentElement) return () => undefined
  const silenced = [...overlay.parentElement.children].filter(
    (element) => element !== overlay && !element.hasAttribute('inert'),
  )
  silenced.forEach((element) => element.setAttribute('inert', ''))
  return () => silenced.forEach((element) => element.removeAttribute('inert'))
}

/**
 * Accessible modal: labelled, Escape to close, focus moved in on open and
 * restored on close, Tab kept inside the dialog, and the page behind it inert
 * for as long as it is open.
 */
export function Dialog({ open, onClose, title, description, children, footer, size = 'md' }: DialogProps) {
  const overlayRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const restoreRef = useRef<HTMLElement | null>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const titleId = useId()
  const descriptionId = useId()

  useEffect(() => {
    if (!open) return
    restoreRef.current = document.activeElement as HTMLElement | null
    const panel = panelRef.current
    /*
     * Land on the first control in the body, not on Close. Close comes first in
     * the DOM, so the naive "first focusable" put every form dialog's opening
     * focus on the dismiss button — the one control the traveller did not open
     * the dialog to use. Falls back to Close, then to the panel itself.
     */
    const focusable = [...(panel?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])]
    const target = focusable.find((element) => element.dataset.dialogClose !== 'true')
    ;(target ?? focusable[0] ?? panel)?.focus()

    const close = () => onCloseRef.current()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        close()
        return
      }
      if (event.key !== 'Tab' || !panel) return
      /*
       * Hidden controls (a closed disclosure, say) are not tab stops. A browser
       * says so through `offsetParent`; an environment with no layout at all
       * reports null for everything, the panel included, and there nothing is
       * filtered out.
       */
      const hasLayout = panel.offsetParent !== null
      const active = document.activeElement
      const focusable = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (element) => !hasLayout || element.offsetParent !== null || element === active,
      )
      if (focusable.length === 0) {
        event.preventDefault()
        panel.focus()
        return
      }
      const firstElement = focusable[0]
      const lastElement = focusable[focusable.length - 1]
      /*
       * Focus can sit on the panel itself (it takes focus when its text is
       * clicked, and it is not a tab stop) or, should anything ever put it
       * there, outside the dialog. From either place the browser's own Tab
       * order leads out to the page behind, so Tab is answered here.
       */
      const isAdrift = active === panel || !panel.contains(active)
      if (event.shiftKey && (isAdrift || active === firstElement)) {
        event.preventDefault()
        lastElement.focus()
      } else if (!event.shiftKey && (isAdrift || active === lastElement)) {
        event.preventDefault()
        firstElement.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown, true)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const restoreBackground = makeBackgroundInert(overlayRef.current)

    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      document.body.style.overflow = previousOverflow
      // Before focus goes back: an inert opener cannot take it.
      restoreBackground()
      /*
       * Deleting a record from its own menu removes the control that opened the
       * dialog, and focusing a detached node silently drops focus to <body>,
       * sending screen readers back to the top of the document. The page's main
       * region is the nearest place that still exists.
       */
      const opener = restoreRef.current
      if (opener?.isConnected) opener.focus()
      else document.getElementById('main-content')?.focus()
    }
  }, [open])

  if (!open) return null

  return createPortal(
    <div ref={overlayRef} className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6">
      <div
        className="absolute inset-0 bg-scrim"
        onClick={() => onCloseRef.current()}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={`surface-raised relative max-h-[92dvh] w-full overflow-y-auto rounded-t-sheet p-5 sm:rounded-sheet ${
          size === 'lg' ? 'sm:max-w-3xl' : 'sm:max-w-lg'
        }`}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-headline-md">
              {title}
            </h2>
            {description ? (
              <p id={descriptionId} className="mt-1 text-body-sm text-ink-muted">
                {description}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            data-dialog-close="true"
            onClick={onClose}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-pill text-ink-muted transition-colors hover:bg-surface-low hover:text-ink"
          >
            <Icon name="close" size={20} />
            <span className="sr-only">Close dialog</span>
          </button>
        </div>
        {children}
        {footer ? <div className="mt-5 flex flex-wrap justify-end gap-2">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  )
}
