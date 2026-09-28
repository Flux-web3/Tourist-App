import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { TextAreaField, TextField } from '@/components/ui/Field'
import { Icon } from '@/components/ui/Icon'
import { NOTE_LIMITS, validateNoteDraft, type NoteDraftErrors } from '@/domain/validation'
import { useTourist } from '@/state/useTourist'
import type { Trip, TripNote } from '@/domain/types'

function NoteForm({
  formId,
  draft,
  errors,
  submitted,
  onPatch,
  onSubmit,
}: {
  formId: string
  draft: { title: string; body: string }
  errors: NoteDraftErrors
  submitted: boolean
  onPatch: (update: Partial<{ title: string; body: string }>) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}) {
  const summaryRef = useRef<HTMLDivElement>(null)
  const messages = Object.values(errors).filter((message): message is string => Boolean(message))
  const messageCount = messages.length

  useEffect(() => {
    if (submitted && messageCount > 0) summaryRef.current?.focus()
  }, [messageCount, submitted])

  const remaining = NOTE_LIMITS.maxBodyLength - draft.body.length

  return (
    <form id={formId} noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
      {messageCount > 0 ? (
        <div
          ref={summaryRef}
          role="alert"
          tabIndex={-1}
          className="rounded-control border border-danger/40 bg-danger-bg px-4 py-3 text-danger-ink"
        >
          <p className="text-label-lg">
            {messageCount === 1 ? '1 field needs attention' : `${messageCount} fields need attention`}
          </p>
          <ul className="mt-1 flex list-none flex-col gap-0.5 text-body-sm">
            {messages.map((message, index) => (
              <li key={`${index}-${message}`}>{message}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <TextField
        label="Title"
        hint="Optional. Leave it blank and the note is listed by its first line."
        maxLength={NOTE_LIMITS.maxTitleLength}
        placeholder="Flight reference"
        value={draft.title}
        error={errors.title}
        onChange={(event) => onPatch({ title: event.target.value })}
      />

      <TextAreaField
        label="Note"
        required
        rows={8}
        maxLength={NOTE_LIMITS.maxBodyLength}
        placeholder={'Anything worth remembering.\n\nLine breaks are kept exactly as you write them.'}
        hint={`${remaining} characters left. New lines are preserved.`}
        value={draft.body}
        error={errors.body}
        onChange={(event) => onPatch({ body: event.target.value })}
      />
    </form>
  )
}

function useNoteForm(open: boolean, seed?: TripNote | null) {
  const [draft, setDraft] = useState({ title: '', body: '' })
  const [errors, setErrors] = useState<NoteDraftErrors>({})
  const [submitted, setSubmitted] = useState(false)
  const formId = useId()

  useEffect(() => {
    if (!open) return
    setDraft(seed ? { title: seed.title, body: seed.body } : { title: '', body: '' })
    setErrors({})
    setSubmitted(false)
  }, [open, seed])

  const patch = useCallback(
    (update: Partial<{ title: string; body: string }>) => {
      const merged = { ...draft, ...update }
      setDraft(merged)
      if (submitted) setErrors(validateNoteDraft(merged).errors)
    },
    [draft, submitted],
  )

  return { draft, errors, submitted, formId, patch, setSubmitted, setErrors }
}

export function NoteFormDialog({
  trip,
  open,
  onClose,
}: {
  trip: Trip
  open: boolean
  onClose: () => void
}) {
  const { actions } = useTourist()
  const { draft, errors, submitted, formId, patch, setSubmitted, setErrors } = useNoteForm(open)

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitted(true)
    const result = validateNoteDraft(draft)
    setErrors(result.errors)
    if (!result.isValid) return
    actions.addNote({ tripId: trip.id, title: draft.title.trim(), body: draft.body.trim() })
    onClose()
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title="New note"
      description="Your own record for this trip. Notes are never regenerated or re-costed."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form={formId} variant="primary" icon={<Icon name="check" size={18} />}>
            Save note
          </Button>
        </>
      }
    >
      <NoteForm
        formId={formId}
        draft={draft}
        errors={errors}
        submitted={submitted}
        onPatch={patch}
        onSubmit={handleSubmit}
      />
    </Dialog>
  )
}

export function EditNoteDialog({
  trip,
  note,
  open,
  onClose,
}: {
  trip: Trip
  note: TripNote | null
  open: boolean
  onClose: () => void
}) {
  const { actions } = useTourist()
  const { draft, errors, submitted, formId, patch, setSubmitted, setErrors } = useNoteForm(open, note)

  if (!note) return null

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitted(true)
    const result = validateNoteDraft(draft)
    setErrors(result.errors)
    if (!result.isValid) return
    actions.updateNote(trip.id, note.id, { title: draft.title.trim(), body: draft.body.trim() })
    onClose()
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title="Edit note"
      description="Changes are saved to this device and never touch the itinerary."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form={formId} variant="primary" icon={<Icon name="check" size={18} />}>
            Save changes
          </Button>
        </>
      }
    >
      <NoteForm
        formId={formId}
        draft={draft}
        errors={errors}
        submitted={submitted}
        onPatch={patch}
        onSubmit={handleSubmit}
      />
    </Dialog>
  )
}
