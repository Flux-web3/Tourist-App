import { useId, useState, type FormEvent } from 'react'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { ButtonLink } from '@/components/ui/ButtonLink'
import { Dialog } from '@/components/ui/Dialog'
import { SelectField, TextField } from '@/components/ui/Field'
import { Icon } from '@/components/ui/Icon'
import { getDestination } from '@/data/destinations'
import { formatDuration, formatShortDate, formatTime, isValidTime } from '@/domain/format'
import {
  isListedClosedOn,
  suggestPlaceSlot,
  weekdayOf,
  type PlaceSlotSuggestion,
} from '@/domain/itinerary'
import { formatAmount } from '@/domain/money'
import { ITINERARY_CATEGORY_ICON, ITINERARY_CATEGORY_LABEL, PROTOTYPE_LABEL } from '@/lib/labels'
import { useTourist, useTripDays } from '@/state/useTourist'
import type { Experience, ItineraryDay, ItineraryItem, Trip, VisitWindow } from '@/domain/types'

export interface AddToTripDialogProps {
  trip: Trip
  experience: Experience
  onClose: () => void
  /** `added.suggested` is true when Tourist chose the start time, not the traveller. */
  onAdded: (day: ItineraryDay, added: AddedPlace) => void
}

export interface AddedPlace {
  startTime: string
  suggested: boolean
}

const START_TIME_HINT =
  "Optional. Left empty, Tourist suggests a time within the place's usual hours that fits around the day's other stops."

const ADD_FAILED =
  'This place could not be added to the selected day. Nothing in your itinerary has changed.'

/** Enough of the day to place a stop sensibly, without turning the sheet into a page. */
const PREVIEW_LIMIT = 4

/** "09:00–18:00", or "from 19:30" when the note gives no closing time. Demo hours, never live. */
function hoursLabel(window: VisitWindow): string {
  return window.closes === null ? `from ${window.opens}` : `${window.opens}–${window.closes}`
}

function suggestionLine(suggestion: Extract<PlaceSlotSuggestion, { kind: 'slot' }>): string {
  const time = formatTime(suggestion.startTime) ?? suggestion.startTime
  switch (suggestion.windowSource) {
    case 'hours':
      return `Suggested: ${time}, within its usual hours ${hoursLabel(suggestion.window)}. You can change it.`
    case 'evening-default':
      return `Suggested: ${time}, an evening slot that fits around the day's other stops. You can change it.`
    case 'daytime-default':
      return `Suggested: ${time}, a daytime slot that fits around the day's other stops. You can change it.`
  }
}

function DayPreview({ day }: { day: ItineraryDay }) {
  const shown: ItineraryItem[] = day.items.slice(0, PREVIEW_LIMIT)
  const hidden = day.items.length - shown.length

  return (
    <div className="rounded-control border border-line bg-surface-low p-3">
      <p className="text-label-md text-ink">{`Already in Day ${day.index}`}</p>
      {day.items.length === 0 ? (
        <p className="mt-1 text-body-sm text-ink-subtle">Nothing planned yet.</p>
      ) : (
        <>
          <ul className="mt-2 flex list-none flex-col gap-1">
            {shown.map((item) => (
              <li key={item.id} className="flex min-w-0 items-baseline gap-2 text-body-sm">
                <span className="tnum w-20 shrink-0 text-ink-subtle">
                  {formatTime(item.startTime) ?? 'Any time'}
                </span>
                <span className="min-w-0 break-words text-ink-muted">{item.title}</span>
              </li>
            ))}
          </ul>
          {hidden > 0 ? (
            <p className="mt-1 text-body-sm text-ink-subtle">
              {`and ${hidden} more ${hidden === 1 ? 'stop' : 'stops'} that day`}
            </p>
          ) : null}
        </>
      )}
    </div>
  )
}

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
    label: `Day ${day.index} · ${formatShortDate(day.date)}`,
  }))

  // Pages only open this sheet for a place in the trip's own destination; this
  // keeps a stray caller from ever adding another city's place (the provider
  // refuses it too). A legacy trip with no destination never matches.
  const wrongCity = experience.destinationId !== trip.destinationId
  const tripCity =
    getDestination(trip.destinationId)?.city ?? (trip.destination.trim() || 'another destination')

  const selectedDay = days.find((day) => day.id === dayId) ?? null
  // Adding the same place to the same day twice only doubled its share of the
  // estimate; nobody visits the Louvre at 18:15 and again at 19:45.
  const alreadyOnDay =
    selectedDay?.items.some((item) => item.experienceId === experience.id) ?? false

  // Worked out from the same day the provider will add to, so what the sheet
  // promises is what gets saved. Only when no time is typed: a typed time is
  // always the traveller's choice.
  const suggestion =
    selectedDay && !startTime && !alreadyOnDay && !wrongCity
      ? suggestPlaceSlot(selectedDay, experience)
      : null
  const noSlot = suggestion?.kind === 'none'
  // A reminder, never a block: the hours are static demo data, not this date's.
  const closedWeekday =
    selectedDay && !wrongCity && isListedClosedOn(experience, selectedDay.date) ? weekdayOf(selectedDay.date) : null

  const priceLine = experience.isFree
    ? 'Free to visit'
    : `${formatAmount(experience.priceFrom, experience.currency)} and up`

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!dayId) {
      setError({ title: 'Choose a day first', message: 'Pick the day this place should be added to.' })
      return
    }
    if (alreadyOnDay || wrongCity || noSlot) return
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
      onAdded(target, { startTime: item.startTime, suggested: !startTime })
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
            disabled={days.length === 0 || alreadyOnDay || wrongCity || noSlot}
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

        {wrongCity ? (
          <Alert tone="warning" title={`${experience.name} is not in ${tripCity}`}>
            {`It is in ${experience.city}, and ${trip.name} is going to ${tripCity}, so it cannot be added to this trip.`}
          </Alert>
        ) : days.length === 0 ? (
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
          <>
            <SelectField
              label="Day"
              required
              options={dayOptions}
              value={dayId}
              onChange={(event) => setDayId(event.target.value)}
            />
            {selectedDay ? <DayPreview day={selectedDay} /> : null}
            {alreadyOnDay ? (
              <Alert tone="warning" title={`${experience.name} is already on this day`}>
                Choose another day to add it again, or move the stop you already have from the
                itinerary.
              </Alert>
            ) : null}
          </>
        )}

        <TextField
          label="Start time"
          type="time"
          value={startTime}
          onChange={(event) => setStartTime(event.target.value)}
          disabled={days.length === 0 || wrongCity}
          hint={START_TIME_HINT}
        />

        {suggestion?.kind === 'slot' ? (
          <p className="text-body-sm text-ink-muted" aria-live="polite">
            {suggestionLine(suggestion)}
          </p>
        ) : null}
        {noSlot && selectedDay ? (
          <Alert tone="warning" title={`No time fits on Day ${selectedDay.index}`}>
            {suggestion.windowSource === 'hours'
              ? `${experience.name} (${formatDuration(experience.durationMinutes)}) does not fit within its usual hours ${hoursLabel(suggestion.window)} around this day's other stops. Enter a start time, or choose another day.`
              : `${experience.name} (${formatDuration(experience.durationMinutes)}) does not fit around this day's other stops. Enter a start time, or choose another day.`}
          </Alert>
        ) : null}
        {closedWeekday ? (
          <p className="text-body-sm text-ink-muted">
            {`Its demo hours list it as closed on ${closedWeekday}s, and this day is a ${closedWeekday}. Check before you go.`}
          </p>
        ) : null}

        {error ? <Alert tone="danger" title={error.title}>{error.message}</Alert> : null}

        <p className="text-body-sm text-ink-subtle">
          Only this day changes, and you can move or remove the stop later.
        </p>
      </form>
    </Dialog>
  )
}
