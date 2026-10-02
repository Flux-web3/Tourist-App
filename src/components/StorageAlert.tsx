import { useTourist } from '@/state/useTourist'
import type { StorageStatus } from '@/state/touristContext'
import { Alert, type AlertTone } from './ui/Alert'
import { Button } from './ui/Button'

interface Message {
  tone: AlertTone
  title: string
  body: string
}

const NEWER_VERSION_TITLE = 'Your data was saved by a newer version of Tourist'
const UNREADABLE_TITLE = 'Your saved data could not be read'

/**
 * The session is writing nothing, on purpose: what is stored could not be read
 * and is the only copy, so it has been left alone. This stays up for as long
 * as that is true, because everything done meanwhile is lost on reload.
 */
function readOnlyMessage(storage: StorageStatus): Message {
  if (storage.fromOtherTab) {
    return storage.load === 'future'
      ? {
          tone: 'danger',
          title: 'Another tab is using a newer version of Tourist',
          body: 'This tab cannot read what that tab saved, so it has left your saved data exactly as it is. Nothing you do in this tab will be saved. Reload this page to carry on.',
        }
      : {
          tone: 'danger',
          title: 'Your saved data was changed in another tab',
          body: 'This tab cannot read what is saved now, so it has left it exactly as it is. Nothing you do in this tab will be saved. Reload this page to carry on.',
        }
  }
  return storage.load === 'future'
    ? {
        tone: 'danger',
        title: NEWER_VERSION_TITLE,
        body: 'This version cannot read it and could not make a backup copy of it, so it has been left exactly as it was. Nothing you do in this session will be saved. This usually means the browser storage is full or blocked. Free up some space, then reload this page.',
      }
    : {
        tone: 'danger',
        title: UNREADABLE_TITLE,
        body: 'Tourist could not make a backup copy of it either, so it has been left exactly as it was. Nothing you do in this session will be saved. This usually means the browser storage is full or blocked. Free up some space, then reload this page.',
      }
}

const SAVE_FAILING: Message = {
  tone: 'danger',
  title: 'Your changes are not being saved',
  body: 'Tourist could not save to this device, most likely because the browser storage is full or blocked. You can keep working, but anything you change will be lost when this page closes. Free up some space, or allow this site to store data, and your next change will be saved.',
}

/**
 * What happened to the saved data when it was read, for the three outcomes a
 * traveller would otherwise never hear about. It is only ever as reassuring as
 * the facts: a backup copy is mentioned when one was actually written.
 */
function loadMessage(storage: StorageStatus): Message | null {
  switch (storage.load) {
    case 'salvaged':
      return {
        tone: 'warning',
        title: 'Some of your saved data could not be read',
        body: storage.backedUp
          ? 'Tourist left out the parts it could not read and kept everything else. A copy of your data as it was is kept in this browser.'
          : 'Tourist left out the parts it could not read and kept everything else. A copy of your data as it was could not be kept.',
      }
    case 'unreadable':
      return {
        tone: 'warning',
        title: UNREADABLE_TITLE,
        body: 'Tourist has started fresh. A copy of what was saved is kept in this browser.',
      }
    case 'future':
      return {
        tone: 'warning',
        title: NEWER_VERSION_TITLE,
        body: 'This version cannot read it, so Tourist has started fresh. The original is kept in this browser as a backup copy.',
      }
    default:
      return null
  }
}

/**
 * Says out loud what the browser's storage is doing when it is not simply
 * working. Tourist keeps everything on this device and carries on in memory
 * when a save fails, so without this a traveller finds out only after a
 * reload, when the work is already gone.
 *
 * Mounted once, in `AppShell`, above the page. Renders nothing when the data
 * loaded cleanly and saves are landing.
 */
export function StorageAlert() {
  const { storage, actions } = useTourist()

  /**
   * A read-only session outranks both of the others: its saves are not failing,
   * they are deliberately not happening, and the load notice would repeat it.
   */
  const standing = storage.readOnly
    ? readOnlyMessage(storage)
    : storage.saving === 'failing'
      ? SAVE_FAILING
      : null
  const notice = storage.readOnly || storage.noticeDismissed ? null : loadMessage(storage)

  if (!standing && !notice) return null

  return (
    <div className="mb-6 flex flex-col gap-3">
      {standing ? (
        <Alert tone={standing.tone} title={standing.title}>
          {standing.body}
        </Alert>
      ) : null}
      {notice ? (
        <Alert
          tone={notice.tone}
          title={notice.title}
          action={
            <Button variant="ghost" size="sm" onClick={actions.dismissStorageNotice}>
              Dismiss
            </Button>
          }
        >
          {notice.body}
        </Alert>
      ) : null}
    </div>
  )
}
