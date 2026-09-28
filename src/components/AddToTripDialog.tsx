import { useId, useState, type FormEvent } from 'react'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { ButtonLink } from '@/components/ui/ButtonLink'
import { Dialog } from '@/components/ui/Dialog'
import { SelectField, TextField } from '@/components/ui/Field'
import { Icon } from '@/components/ui/Icon'
import { formatDuration, formatShortDate, isValidTime } from '@/domain/format'
import { formatMoney } from '@/domain/money'
import { ITINERARY_CATEGORY_ICON, ITINERARY_CATEGORY_LABEL, PROTOTYPE_LABEL } from '@/lib/labels'
import { useTourist, useTripDays } from '@/state/useTourist'
import type { Experience, ItineraryDay, Trip } from '@/domain/types'

export interface AddToTripDialogProps {
  trip: Trip
  experience: Experience
  onClose: () => void
  onAdded: (day: ItineraryDay) => void
}

const ADD_FAILED =
  'This place could not be added to the selected day. Nothing in your itinerary has changed.'

export function AddToTripDialog({ trip, experience, onClose, onAdded }: AddToTripDialogProps) {
  const { actions } = useTourist()
  const days = useTripDays(trip.id)
  const formId = useId()
  const [dayId, setDayId] = useState(() => days.at(0)?.id ?? '')
  const [startTime, setStartTime] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<{ title: string; message: string } | null>(null)

  const dayOptions = days.map((day) => ({
    value: day.id,
    label: `Day ${day.index} \u00b7 ${formatShortDate(day.date)}`,
  }))

  const priceLine = experience.isFree
    ? 'Free to visit'
    : `${formatMoney(experience.priceFrom, experience.currency, { showCents: false })} and up`

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!dayId) {
      setError({ title: 'Choose a day first', message: 'Pick the day this place should be added to.' })
      return
    }
    if (startTime && !isValidTime(startTime)) {
      setError({
        title: 'That start time was not read',
        message: 'Enter a start time as HH:MM, for example 09:30, or leave it empty.',
      })
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const item = await actions.addExperienceToTrip(trip.id, experience.id, {
        dayId,
        ...(startTime ? { startTime } : {}),
      })
      const target = days.find((day) => day.id === dayId)
      if (!item || !target) {
        setError({ title: 'Nothing was added', message: ADD_FAILED })
        return
      }
      onAdded(target)
    } catch {
      setError({ title: 'Nothing was added', message: ADD_FAILED })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Add to ${trip.name}`}
      description={`Choose a day for ${experience.name}.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            type="submit"
            form={formId}
            variant="primary"
            icon={<Icon name="add" size={18} />}
            loading={submitting}
            loadingLabel="Adding"
            disabled={days.length === 0}
          >
            Add to itinerary
          </Button>
        </>
      }
    >
      <form id={formId} noValidate onSubmit={handleSubmit} className="flex flex-col gap-4">
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-body-sm text-ink-muted">
          <span className="inline-flex items-center gap-1.5">
            <Icon name="schedule" size={16} className="text-ink-subtle" />
            {formatDuration(experience.durationMinutes)}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Icon name={ITINERARY_CATEGORY_ICON[experience.category]} size={16} className="text-ink-subtle" />
            {ITINERARY_CATEGORY_LABEL[experience.category]}
          </span>
          <span className="tnum inline-flex items-center gap-1.5">
            <Icon name="sell" size={16} className="text-ink-subtle" />
            {`${PROTOTYPE_LABEL.estimatedPrice}: ${priceLine}`}
          </span>
        </p>

        {days.length === 0 ? (
          <Alert
            tone="warning"
            title="This trip has no days yet"
            action={
              <ButtonLink
                to={`/trips/${trip.id}/itinerary`}
                size="sm"
                variant="secondary"
                icon={<Icon name="auto_awesome" size={16} />}
              >
                Draft an itinerary
              </ButtonLink>
            }
          >
            Generate a day-by-day draft first, then come back and drop this place into whichever day suits it.
          </Alert>
        ) : (
          <SelectField
            label="Day"
            required
            options={dayOptions}
            value={dayId}
            onChange={(event) => setDayId(event.target.value)}
            hint="The activity is inserted into this day only."
          />
        )}

        <TextField
          label="Start time"
          type="time"
          value={startTime}
          onChange={(event) => setStartTime(event.target.value)}
          disabled={days.length === 0}
          hint="Optional. Leave this empty and Tourist uses the first free slot in that day."
        />

        {error ? <Alert tone="danger" title={error.title}>{error.message}</Alert> : null}

        <Alert tone="info" title="Nothing else changes">
          {`The activity is inserted into the day you choose. Every other stop, time and estimate in ${trip.name} stays exactly as it is, and you can move or remove it later.`}
        </Alert>
      </form>
    </Dialog>
  )
}
