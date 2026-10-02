import { useCallback, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { EditNoteDialog, NoteFormDialog } from '@/components/NoteFormDialog'
import { ActionMenu } from '@/components/ui/ActionMenu'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { ButtonLink } from '@/components/ui/ButtonLink'
import { Card, PageHeader } from '@/components/ui/Card'
import { Dialog } from '@/components/ui/Dialog'
import { Disclosure } from '@/components/ui/Disclosure'
import { EmptyState, Skeleton } from '@/components/ui/EmptyState'
import { Icon } from '@/components/ui/Icon'
import { formatDate, formatDateTime } from '@/domain/format'
import { PROTOTYPE_LABEL } from '@/lib/labels'
import { useTourist, useTrip, useTripNotes } from '@/state/useTourist'
import type { TripNote } from '@/domain/types'

function displayTitle(note: TripNote): string {
  const trimmed = note.title.trim()
  if (trimmed) return trimmed
  const firstLine = note.body.trim().split('\n').find((line) => line.trim().length > 0)
  return firstLine ? firstLine.trim() : 'Untitled note'
}

function countLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`
}

const MINUTE = 60_000
const HOUR = 3_600_000
const DAY = 86_400_000

/**
 * A timestamp the way a person would say it.
 *
 * `1 Feb 2026, 08:00` is precise and unreadable at a glance, and every note
 * carried two of them. Anything from the last week reads relatively; older
 * notes fall back to the plain date, and the exact instant stays in the
 * `<time datetime>` attribute for anything that needs it.
 */
function naturalTime(iso: string): string | null {
  const parsed = new Date(iso)
  if (typeof iso !== 'string' || Number.isNaN(parsed.getTime())) return null
  const elapsed = Date.now() - parsed.getTime()
  if (elapsed < 0) return formatDateTime(iso)
  if (elapsed < MINUTE) return 'just now'
  if (elapsed < HOUR) {
    const minutes = Math.floor(elapsed / MINUTE)
    return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago`
  }
  if (elapsed < DAY) {
    const hours = Math.floor(elapsed / HOUR)
    return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`
  }
  if (elapsed < 2 * DAY) return 'yesterday'
  if (elapsed < 7 * DAY) return `${Math.floor(elapsed / DAY)} days ago`
  return formatDate(iso.slice(0, 10))
}

function Stamp({ prefix, iso, value }: { prefix: string; iso: string; value: string }) {
  return (
    <span className="tnum">
      {`${prefix} `}
      <time dateTime={iso}>{value}</time>
    </span>
  )
}

export default function NotesPage() {
  const { tripId } = useParams<{ tripId: string }>()
  const { actions, hydrated } = useTourist()
  const trip = useTrip(tripId)
  const notes = useTripNotes(tripId)
  const [addOpen, setAddOpen] = useState(false)
  const [editing, setEditing] = useState<TripNote | null>(null)
  const [deleting, setDeleting] = useState<TripNote | null>(null)

  const openAdd = useCallback(() => setAddOpen(true), [])
  const closeAdd = useCallback(() => setAddOpen(false), [])
  const closeEdit = useCallback(() => setEditing(null), [])
  const closeDelete = useCallback(() => setDeleting(null), [])

  /**
   * `selectNotes` already sorts pinned first. Splitting that ordering into two
   * labelled groups makes it legible rather than something the traveller has to
   * infer from a badge halfway down the list.
   */
  const groups = useMemo(() => {
    const pinned = notes.filter((note) => note.pinned)
    const rest = notes.filter((note) => !note.pinned)
    if (pinned.length === 0) return [{ key: 'all', title: 'Your notes', notes: rest }]
    return [
      { key: 'pinned', title: 'Pinned', notes: pinned },
      { key: 'rest', title: 'Everything else', notes: rest },
    ].filter((group) => group.notes.length > 0)
  }, [notes])

  if (!hydrated) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Notes" description="Restoring your notes from this device." />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    )
  }

  if (!trip) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Notes" description="The trip these notes belonged to is no longer on this device." />
        <EmptyState
          icon="search_off"
          title="We could not find that trip"
          description="It may have been deleted, or the link is out of date. Your other trips and their notes are still saved here."
          action={
            <ButtonLink to="/trips" variant="primary" icon={<Icon name="arrow_back" size={18} />}>
              Back to trips
            </ButtonLink>
          }
        />
      </div>
    )
  }

  const pinnedCount = notes.filter((note) => note.pinned).length
  const confirmDelete = () => {
    if (!deleting) return
    actions.removeNote(trip.id, deleting.id)
    closeDelete()
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Notes"
        title={trip.name}
        description="Your own record for this trip: flight references, door codes, booking confirmations."
        actions={
          <>
            <ButtonLink
              to={`/trips/${trip.id}`}
              variant="secondary"
              icon={<Icon name="arrow_back" size={18} />}
            >
              Trip overview
            </ButtonLink>
            <Button variant="primary" icon={<Icon name="note_add" size={18} />} onClick={openAdd}>
              New note
            </Button>
          </>
        }
      />

      <Disclosure icon="lock" summary={<><strong className="font-semibold">These notes are yours.</strong> Stored on this device only.</>}>
        <p>
          Notes are stored only in this browser. Clearing site data deletes them, and nothing in here
          is generated, estimated or shared. A note is never regenerated, never re-costed, and never
          counted towards your budget. {PROTOTYPE_LABEL.localOnly}.
        </p>
      </Disclosure>

      {notes.length === 0 ? (
        <EmptyState
          icon="sticky_note_2"
          title="Nothing written down yet"
          description="Keep the details you will actually want on the day: the flight number, the address, the key safe code. Line breaks stay exactly as you type them, and pinned notes rise to the top."
          action={
            <Button variant="primary" icon={<Icon name="add" size={18} />} onClick={openAdd}>
              Write the first note
            </Button>
          }
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="catalog" icon={<Icon name="sticky_note_2" size={14} />}>
              {countLabel(notes.length, 'note', 'notes')}
            </Badge>
            {pinnedCount > 0 ? (
              <Badge tone="accent" icon={<Icon name="push_pin" size={14} />}>
                {countLabel(pinnedCount, 'pinned', 'pinned')}
              </Badge>
            ) : null}
          </div>

          {groups.map((group) => (
            <section key={group.key} aria-labelledby={`notes-${group.key}`} className="flex flex-col gap-3">
              <div className="flex items-center gap-1.5 text-terracotta">
                {group.key === 'pinned' ? (
                  <Icon name="push_pin" size={14} className="shrink-0" />
                ) : null}
                <h2 id={`notes-${group.key}`} className="eyebrow">
                  {group.title}
                </h2>
              </div>
              <ul className="flex list-none flex-col gap-3">
                {group.notes.map((note) => {
                  const title = displayTitle(note)
                  const added = naturalTime(note.createdAt)
                  /**
                   * `Updated`, not `Edited`: pinning a note bumps `updatedAt`
                   * in the store as well, so claiming the text was edited would
                   * be wrong. A second stamp is only worth the room when it
                   * actually reads differently from the first.
                   */
                  const updated =
                    note.updatedAt === note.createdAt ? null : naturalTime(note.updatedAt)
                  return (
                    <li key={note.id}>
                      <Card
                        as="article"
                        className={`flex flex-col gap-3 ${
                          note.pinned ? 'border-terracotta/40 bg-surface-bright' : ''
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div className="min-w-0 flex-1">
                            <h3 className="text-headline-sm break-words">{title}</h3>
                            <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-body-sm text-ink-subtle">
                              {note.pinned ? (
                                <Badge tone="accent" icon={<Icon name="push_pin" size={12} />}>
                                  Pinned
                                </Badge>
                              ) : null}
                              {added ? (
                                <Stamp prefix="Added" iso={note.createdAt} value={added} />
                              ) : null}
                              {updated && updated !== added ? (
                                <Stamp prefix="Updated" iso={note.updatedAt} value={updated} />
                              ) : null}
                            </div>
                          </div>
                          <ActionMenu
                            label={`Actions for ${title}`}
                            items={[
                              {
                                label: note.pinned ? 'Unpin' : 'Pin',
                                icon: note.pinned ? 'keep_off' : 'push_pin',
                                onSelect: () => actions.toggleNotePin(trip.id, note.id),
                              },
                              { label: 'Edit', icon: 'edit', onSelect: () => setEditing(note) },
                              {
                                label: 'Delete',
                                icon: 'delete_outline',
                                destructive: true,
                                onSelect: () => setDeleting(note),
                              },
                            ]}
                          />
                        </div>

                        <p className="whitespace-pre-wrap break-words text-body-md text-ink">
                          {note.body}
                        </p>
                      </Card>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </>
      )}

      <NoteFormDialog trip={trip} open={addOpen} onClose={closeAdd} />
      <EditNoteDialog trip={trip} note={editing} open={editing !== null} onClose={closeEdit} />

      <Dialog
        open={deleting !== null}
        onClose={closeDelete}
        title="Delete this note?"
        description="This cannot be undone, and nothing else is affected."
        footer={
          <>
            <Button variant="ghost" onClick={closeDelete}>
              Keep it
            </Button>
            <Button
              variant="danger"
              icon={<Icon name="delete_forever" size={18} />}
              onClick={confirmDelete}
            >
              Delete note
            </Button>
          </>
        }
      >
        <p className="text-body-md text-ink">{deleting ? displayTitle(deleting) : ''}</p>
      </Dialog>
    </div>
  )
}
