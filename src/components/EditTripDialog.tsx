import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { DestinationCombobox } from '@/components/ui/DestinationCombobox'
import { Dialog } from '@/components/ui/Dialog'
import {
  CheckboxChipGroup,
  NumberField,
  RadioChipGroup,
  SelectField,
  TextAreaField,
  TextField,
} from '@/components/ui/Field'
import { Icon } from '@/components/ui/Icon'
import { getDestination, type Destination } from '@/data/destinations'
import { formatDate, todayISO } from '@/domain/format'
import { CURRENCIES, CURRENCY_SYMBOLS } from '@/domain/money'
import { TRIP_LIMITS, TRAVEL_PACES, suggestTripName, validateTripDraft } from '@/domain/validation'
import { INTEREST_LABEL } from '@/lib/labels'
import { useTourist } from '@/state/useTourist'
import type { TravelInterest, TravelPace, Trip, TripDraft, TripDraftErrors } from '@/domain/types'

const INTEREST_OPTIONS: ReadonlyArray<{ value: TravelInterest; label: string }> = [
  { value: 'culture', label: INTEREST_LABEL.culture },
  { value: 'food', label: INTEREST_LABEL.food },
  { value: 'outdoors', label: INTEREST_LABEL.outdoors },
  { value: 'nightlife', label: INTEREST_LABEL.nightlife },
  { value: 'shopping', label: INTEREST_LABEL.shopping },
  { value: 'relaxed', label: INTEREST_LABEL.relaxed },
]

const CURRENCY_OPTIONS = CURRENCIES.map((code) => ({
  value: code,
  label: `${CURRENCY_SYMBOLS[code]} ${code}`,
}))

function toDraft(trip: Trip): TripDraft {
  return {
    name: trip.name,
    origin: trip.origin,
    destination: trip.destination,
    destinationId: trip.destinationId ?? null,
    startDate: trip.startDate,
    endDate: trip.endDate,
    travelers: trip.travelers,
    budget: trip.budget,
    currency: trip.currency,
    interests: [...trip.interests],
    pace: trip.pace,
    notes: trip.notes,
  }
}

function SectionLabel({ children, divider = true }: { children: ReactNode; divider?: boolean }) {
  return (
    <h3
      className={`text-label-md uppercase tracking-wider text-ink-subtle ${
        divider ? 'border-t border-line pt-4' : ''
      }`}
    >
      {children}
    </h3>
  )
}

export function EditTripDialog({
  trip,
  open,
  onClose,
}: {
  trip: Trip
  open: boolean
  onClose: () => void
}) {
  const { actions } = useTourist()
  const [draft, setDraft] = useState<TripDraft>(() => toDraft(trip))
  const [errors, setErrors] = useState<TripDraftErrors>({})
  const [submitted, setSubmitted] = useState(false)
  const formId = useId()
  const summaryRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    setDraft(toDraft(trip))
    setErrors({})
    setSubmitted(false)
  }, [open, trip])

  useEffect(() => {
    if (open && submitted && Object.keys(errors).length > 0) {
      summaryRef.current?.focus()
    }
  }, [errors, open, submitted])

  /**
   * Editing an existing trip is not creating one: a start date that has already
   * passed is a fact about this trip, not a mistake to correct. Without this
   * context the past-date rule froze every in-progress trip — its budget, notes,
   * pace and name could never be changed again. A *different* past start date is
   * still refused.
   */
  const validationContext = useMemo(
    () => ({
      previousStartDate: trip.startDate,
      previousDestination: { destination: trip.destination, destinationId: trip.destinationId ?? null },
    }),
    [trip.startDate, trip.destination, trip.destinationId],
  )

  const update = useCallback(
    (patch: Partial<TripDraft>) => {
      const next = { ...draft, ...patch }
      setDraft(next)
      if (submitted) setErrors(validateTripDraft(next, validationContext).errors)
    },
    [draft, submitted, validationContext],
  )

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitted(true)
    const result = validateTripDraft(draft, validationContext)
    setErrors(result.errors)
    if (!result.isValid) return
    actions.updateTrip(trip.id, {
      ...draft,
      name: draft.name.trim() || suggestTripName(draft.destination, draft.startDate, draft.destinationId),
    })
    onClose()
  }

  const today = todayISO()
  const startDateInPast = draft.startDate !== '' && draft.startDate < today
  const messages = Object.values(errors).filter((message): message is string => Boolean(message))

  /*
    Changing the city never changes the currency here: the trip's expenses are
    already recorded in it and nothing is ever converted. When the new city
    uses another currency the traveller is told, and the Currency field is
    theirs to change.
  */
  const chosen = getDestination(draft.destinationId)
  const isLegacyDestination =
    (trip.destinationId ?? null) === null && draft.destinationId === null && draft.destination.trim() !== ''
  let destinationNote: string | undefined
  if (isLegacyDestination) {
    destinationNote = `${draft.destination.trim()} is not in Tourist's destination list, so Explore and the itinerary draft stay general. Keep it, or pick a listed city.`
  } else if (chosen && chosen.id !== (trip.destinationId ?? null) && chosen.currency !== draft.currency) {
    destinationNote = `${chosen.city} uses ${chosen.currency}. This trip stays in ${draft.currency}; change Currency below if you want ${chosen.currency}.`
  }

  const selectDestination = (destination: Destination | null) => {
    update({ destinationId: destination?.id ?? null, destination: destination?.displayName ?? '' })
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title="Edit trip"
      description="New dates, a new destination or a new pace re-flow the itinerary draft. Anything you added or edited yourself is kept."
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
      <form id={formId} noValidate onSubmit={handleSubmit} className="flex flex-col gap-4">
        {startDateInPast ? (
          <Alert tone="warning" title="This trip has already started">
            {`Its start date, ${formatDate(draft.startDate)}, is in the past, and a trip cannot be saved on a past start date. Keep the original start date to leave the current plan untouched, or choose a future date to re-flow the itinerary.`}
          </Alert>
        ) : null}

        {messages.length > 0 ? (
          <div
            ref={summaryRef}
            role="alert"
            tabIndex={-1}
            className="rounded-control border border-danger/40 bg-danger-bg px-4 py-3 text-danger-ink"
          >
            <p className="text-label-lg">
              {messages.length === 1 ? '1 field needs attention' : `${messages.length} fields need attention`}
            </p>
            <ul className="mt-1 flex list-none flex-col gap-0.5 text-body-sm">
              {messages.map((message, index) => (
                <li key={`${index}-${message}`}>{message}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Trip name"
            value={draft.name}
            maxLength={TRIP_LIMITS.maxNameLength}
            placeholder="Paris in the Spring"
            error={errors.name}
            hint="Leave blank and we will name it after the destination and month."
            onChange={(event) => update({ name: event.target.value })}
            className="sm:col-span-2"
          />

          <TextField
            label="Travelling from"
            required
            value={draft.origin}
            maxLength={80}
            placeholder="Lagos, Nigeria"
            error={errors.origin}
            onChange={(event) => update({ origin: event.target.value })}
          />

          <DestinationCombobox
            label="Destination"
            required
            value={draft.destinationId}
            unlistedText={draft.destinationId === null ? draft.destination : undefined}
            error={errors.destination}
            note={destinationNote}
            onSelect={selectDestination}
          />

          <TextField
            label="Start date"
            required
            type="date"
            value={draft.startDate}
            error={errors.startDate}
            hint={startDateInPast ? 'This trip already started on this date.' : undefined}
            onChange={(event) => update({ startDate: event.target.value })}
          />

          <TextField
            label="End date"
            required
            type="date"
            value={draft.endDate}
            error={errors.endDate}
            onChange={(event) => update({ endDate: event.target.value })}
          />

          <NumberField
            label="Travellers"
            required
            min={TRIP_LIMITS.minTravelers}
            max={TRIP_LIMITS.maxTravelers}
            step={1}
            value={draft.travelers}
            error={errors.travelers}
            onValueChange={(value) => update({ travelers: Math.round(value) })}
          />

          {/*
            Currency sits before the amount so the figure is typed in a known
            unit, and the code is in the field's label rather than only in the
            decorative suffix, which assistive technology never reads.
          */}
          <SelectField
            label="Currency"
            required
            options={CURRENCY_OPTIONS}
            value={draft.currency}
            error={errors.currency}
            hint="Every figure on this trip uses this currency."
            onChange={(event) => update({ currency: event.target.value as TripDraft['currency'] })}
          />

          <NumberField
            label={`Trip budget (${draft.currency})`}
            required
            min={0}
            max={TRIP_LIMITS.maxBudget}
            step={50}
            value={draft.budget}
            prefix={CURRENCY_SYMBOLS[draft.currency]}
            error={errors.budget}
            onValueChange={(value) => update({ budget: value })}
          />
        </div>

        <SectionLabel divider={false}>How do you want to travel?</SectionLabel>

        <RadioChipGroup<TravelPace>
          legend="Pace"
          name={`${formId}-pace`}
          columns={3}
          value={draft.pace}
          options={TRAVEL_PACES}
          onChange={(pace) => update({ pace })}
        />

        <CheckboxChipGroup<TravelInterest>
          legend="Interests"
          name={`${formId}-interests`}
          options={INTEREST_OPTIONS}
          values={draft.interests}
          error={errors.interests}
          onChange={(interests) => update({ interests })}
        />

        <TextAreaField
          label="Notes"
          rows={3}
          maxLength={500}
          value={draft.notes}
          placeholder="Anything to remember, from dietary needs to must-see lists."
          onChange={(event) => update({ notes: event.target.value })}
        />
      </form>
    </Dialog>
  )
}
