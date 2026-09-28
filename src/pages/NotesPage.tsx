import { useCallback, useState } from 'react'
import { useParams } from 'react-router-dom'
import { EditNoteDialog, NoteFormDialog } from '@/components/NoteFormDialog'
import { Alert } from '@/components/ui/Alert'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { ButtonLink } from '@/components/ui/ButtonLink'
import { Card, PageHeader } from '@/components/ui/Card'
import { Dialog } from '@/components/ui/Dialog'
import { EmptyState, Skeleton } from '@/components/ui/EmptyState'
import { Icon } from '@/components/ui/Icon'
import { formatDateTime } from '@/domain/format'
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
        description="Your own record for this trip: flight references, booking confirmations, things to remember. Notes are never regenerated, never re-costed, and never affect your budget."
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

      {notes.length === 0 ? (
        <EmptyState
          icon="sticky_note_2"
          title="No notes yet"
          description="Keep the details you will actually need on the day: your flight number, the address, what the apartment key safe code is. Line breaks are kept exactly as you write them."
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
            <span className="text-body-sm text-ink-subtle">
              Pinned notes stay at the top. Nothing here is sent anywhere.
            </span>
          </div>

          <ul className="flex list-none flex-col gap-4">
            {notes.map((note) => {
              const added = formatDateTime(note.createdAt)
              const updated = formatDateTime(note.updatedAt)
              const wasEdited = note.updatedAt !== note.createdAt
              return (
                <li key={note.id}>
                  <Card as="article" className="flex flex-col gap-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <h3 className="text-headline-sm break-words">{displayTitle(note)}</h3>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-body-sm text-ink-subtle">
                          {note.pinned ? (
                            <Badge tone="accent" icon={<Icon name="push_pin" size={14} />}>
                              Pinned
                            </Badge>
                          ) : null}
                          {added ? <span className="tnum">Added {added}</span> : null}
                          {wasEdited && updated ? <span className="tnum">Edited {updated}</span> : null}
                        </div>
                      </div>
                      <Button
                        variant={note.pinned ? 'accent' : 'secondary'}
                        size="sm"
                        aria-pressed={note.pinned}
                        icon={<Icon name={note.pinned ? 'keep' : 'push_pin'} size={16} />}
                        onClick={() => actions.toggleNotePin(trip.id, note.id)}
                      >
                        {note.pinned ? 'Unpin' : 'Pin'}
                      </Button>
                    </div>

                    <p className="whitespace-pre-wrap break-words text-body-md text-ink-muted">
                      {note.body}
                    </p>

                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        icon={<Icon name="edit" size={16} />}
                        onClick={() => setEditing(note)}
                      >
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        icon={<Icon name="delete_outline" size={16} />}
                        onClick={() => setDeleting(note)}
                      >
                        Delete
                      </Button>
                    </div>
                  </Card>
                </li>
              )
            })}
          </ul>
        </>
      )}

      <Alert tone="prototype" title="These notes are yours">
        <p className="text-body-sm">
          Notes are stored only in this browser. Clearing site data deletes them, and nothing in here is
          generated, estimated or shared. {PROTOTYPE_LABEL.localOnly}.
        </p>
      </Alert>

      {trip ? <NoteFormDialog trip={trip} open={addOpen} onClose={closeAdd} /> : null}
      {trip ? (
        <EditNoteDialog trip={trip} note={editing} open={editing !== null} onClose={closeEdit} />
      ) : null}

      <Dialog
        open={deleting !== null}
        onClose={closeDelete}
        title="Delete this note?"
        description="This cannot be undone, and it is not part of the itinerary so nothing else is affected."
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
        <p className="text-body-md text-ink-muted">{deleting ? displayTitle(deleting) : ''}</p>
      </Dialog>
    </div>
  )
}
