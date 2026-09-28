import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Alert } from '@/components/ui/Alert'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { ButtonLink } from '@/components/ui/ButtonLink'
import { Card, CardTitle, PageHeader } from '@/components/ui/Card'
import {
  CheckboxChipGroup,
  NumberField,
  RadioChipGroup,
  SelectField,
  TextAreaField,
  TextField,
} from '@/components/ui/Field'
import { Icon } from '@/components/ui/Icon'
import { addDays, formatDateRange, todayISO, tripLengthInDays } from '@/domain/format'
import { CURRENCIES, CURRENCY_SYMBOLS } from '@/domain/money'
import {
  TRIP_LIMITS,
  TRAVEL_PACES,
  createEmptyDraft,
  suggestTripName,
  validateTripDraft,
} from '@/domain/validation'
import { INTEREST_LABEL, PROTOTYPE_LABEL } from '@/lib/labels'
import { useTourist } from '@/state/useTourist'
import type { CurrencyCode, TravelInterest, TravelPace, TripDraft, TripDraftErrors } from '@/domain/types'

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

const DATE_PRESETS = [
  { label: 'Long weekend', days: 3 },
  { label: 'One week', days: 7 },
  { label: 'Two weeks', days: 14 },
] as const

export default function CreateTripPage() {
  const navigate = useNavigate()
  const { actions } = useTourist()

  const [draft, setDraft] = useState<TripDraft>(() => createEmptyDraft())
  const [errors, setErrors] = useState<TripDraftErrors>({})
  const [submitted, setSubmitted] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const formId = useId()
  const summaryRef = useRef<HTMLDivElement>(null)

  const messages = useMemo(
    () => Object.values(errors).filter((message): message is string => Boolean(message)),
    [errors],
  )

  useEffect(() => {
    if (submitted && messages.length > 0) summaryRef.current?.focus()
  }, [messages.length, submitted])

  const update = useCallback(
    (patch: Partial<TripDraft>) => {
      const next = { ...draft, ...patch }
      setDraft(next)
      if (submitted) setErrors(validateTripDraft(next).errors)
    },
    [draft, submitted],
  )

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (isSubmitting) return
    setSubmitted(true)
    const result = validateTripDraft(draft)
    setErrors(result.errors)
    if (!result.isValid) return
    setIsSubmitting(true)
    const trip = actions.createTrip({
      ...draft,
      name: draft.name.trim() || suggestTripName(draft.destination, draft.startDate),
    })
    navigate(`/trips/${trip.id}/itinerary`)
  }

  const today = todayISO()
  const hasBothDates = draft.startDate !== '' && draft.endDate !== ''
  const length = hasBothDates ? tripLengthInDays(draft.startDate, draft.endDate) : 0
  const showsLength = hasBothDates && length >= 1
  const isBackwards = hasBothDates && length < 1
  const rangeText = draft.startDate ? formatDateRange(draft.startDate, draft.endDate) : 'No dates chosen yet'

  const applyPreset = useCallback(
    (days: number) => {
      const start = todayISO()
      update({ startDate: start, endDate: addDays(start, days - 1) })
    },
    [update],
  )

  const isPresetActive = (days: number) =>
    draft.startDate === today && draft.endDate === addDays(today, days - 1)

  const applySuggestedName = useCallback(() => {
    update({ name: suggestTripName(draft.destination, draft.startDate) })
  }, [draft.destination, draft.startDate, update])

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="New trip"
        title="Plan a trip"
        description="A handful of short answers and Tourist drafts a day-by-day itinerary you can argue with. Nothing is booked and nothing is charged."
      />

      <Alert tone="prototype" title={PROTOTYPE_LABEL.localOnly}>
        {`${PROTOTYPE_LABEL.noAccount}. The trip, its draft itinerary and every expense stay in this browser.`}
      </Alert>

      <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-4">
        {messages.length > 0 ? (
          <div
            ref={summaryRef}
            role="alert"
            tabIndex={-1}
            className="rounded-control border border-danger/40 bg-danger-bg px-4 py-3 text-danger-ink"
          >
            <p className="text-label-lg">
              {messages.length === 1 ? 'Check 1 detail below' : `Check ${messages.length} details below`}
            </p>
            <ul className="mt-1 flex list-none flex-col gap-0.5 text-body-sm">
              {messages.map((message, index) => (
                <li key={`${index}-${message}`}>{message}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <Card className="flex flex-col gap-4">
          <CardTitle hint="We use the destination to shape the first draft of your days.">
            Where you are going
          </CardTitle>

          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Travelling from"
              required
              value={draft.origin}
              maxLength={80}
              placeholder="Lagos, Nigeria"
              error={errors.origin}
              onChange={(event) => update({ origin: event.target.value })}
            />

            <TextField
              label="Destination"
              required
              value={draft.destination}
              maxLength={80}
              placeholder="Paris, France"
              error={errors.destination}
              onChange={(event) => update({ destination: event.target.value })}
            />
          </div>
        </Card>

        <Card className="flex flex-col gap-4">
          <CardTitle hint={`Up to ${TRIP_LIMITS.maxDays} days. Every day becomes a row in the draft.`}>
            When you are going
          </CardTitle>

          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Start date"
              required
              type="date"
              min={today}
              value={draft.startDate}
              error={errors.startDate}
              onChange={(event) => update({ startDate: event.target.value })}
            />

            <TextField
              label="End date"
              required
              type="date"
              min={draft.startDate || today}
              value={draft.endDate}
              error={errors.endDate}
              onChange={(event) => update({ endDate: event.target.value })}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div
              aria-live="polite"
              className="flex min-w-0 flex-1 flex-wrap items-center gap-2 rounded-control border border-line bg-surface-low px-3 py-2"
            >
              <Icon name="event_available" size={18} className="text-ink-subtle" />
              <span className="text-body-sm text-ink-muted">{rangeText}</span>
              {showsLength ? (
                <Badge tone="planned" className="tnum">
                  {length === 1 ? '1 day' : `${length} days`}
                </Badge>
              ) : null}
            </div>
            {isBackwards ? (
              <p className="flex items-center gap-1 text-body-sm text-danger">
                <Icon name="warning" size={16} />
                The end date is before the start date.
              </p>
            ) : null}
          </div>

          <div role="group" aria-label="Quick date presets" className="flex flex-wrap items-center gap-2">
            <span className="text-label-md uppercase tracking-wider text-ink-subtle">Quick pick</span>
            {DATE_PRESETS.map((preset) => {
              const active = isPresetActive(preset.days)
              return (
                <Button
                  key={preset.label}
                  type="button"
                  size="sm"
                  variant={active ? 'primary' : 'secondary'}
                  aria-pressed={active}
                  onClick={() => applyPreset(preset.days)}
                >
                  {`${preset.label} \u00b7 ${preset.days} days`}
                </Button>
              )
            })}
          </div>
        </Card>

        <Card className="flex flex-col gap-4">
          <CardTitle hint="One ceiling for the whole trip. You can log real spending against it later.">
            Who is going, and the budget
          </CardTitle>

          <div className="grid gap-4 sm:grid-cols-2">
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

            <NumberField
              label="Trip budget"
              required
              min={0}
              max={TRIP_LIMITS.maxBudget}
              step={50}
              value={draft.budget}
              prefix={CURRENCY_SYMBOLS[draft.currency]}
              suffix={draft.currency}
              error={errors.budget}
              onValueChange={(value) => update({ budget: value })}
            />

            <SelectField
              label="Currency"
              required
              options={CURRENCY_OPTIONS}
              value={draft.currency}
              error={errors.currency}
              hint="This prototype keeps one currency per trip. No live conversion."
              onChange={(event) => update({ currency: event.target.value as CurrencyCode })}
              className="sm:col-span-2"
            />
          </div>
        </Card>

        <Card className="flex flex-col gap-4">
          <CardTitle hint="Pick what the draft should lean towards. At least one.">
            What you enjoy doing
          </CardTitle>

          <CheckboxChipGroup<TravelInterest>
            legend="Interests"
            name={`${formId}-interests`}
            options={INTEREST_OPTIONS}
            values={draft.interests}
            error={errors.interests}
            onChange={(interests) => update({ interests })}
          />
        </Card>

        <Card className="flex flex-col gap-4">
          <CardTitle hint="How hard you want the days to work.">How you like to travel</CardTitle>

          <RadioChipGroup<TravelPace>
            legend="Pace"
            name={`${formId}-pace`}
            columns={3}
            value={draft.pace}
            options={TRAVEL_PACES}
            onChange={(pace) => update({ pace })}
          />
        </Card>

        <Card className="flex flex-col gap-4">
          <CardTitle hint="Both are optional — we will suggest a name.">Name and notes</CardTitle>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <TextField
              label="Trip name"
              value={draft.name}
              maxLength={TRIP_LIMITS.maxNameLength}
              placeholder={suggestTripName(draft.destination, draft.startDate)}
              error={errors.name}
              hint={`Leave blank and we will name it after the destination and month.`}
              onChange={(event) => update({ name: event.target.value })}
              className="min-w-0 flex-1"
            />
            <Button
              type="button"
              variant="secondary"
              disabled={draft.destination.trim().length === 0}
              onClick={applySuggestedName}
              icon={<Icon name="auto_fix_high" size={16} />}
            >
              Use suggested name
            </Button>
          </div>

          <TextAreaField
            label="Notes"
            rows={3}
            maxLength={500}
            value={draft.notes}
            placeholder="Anything to remember, from dietary needs to must-see lists."
            hint="Only you can read this, and only on this device."
            onChange={(event) => update({ notes: event.target.value })}
          />
        </Card>

        <Card as="div" className="flex flex-col gap-3">
          <p className="text-body-sm text-ink-subtle">
            Your trip is created on this device, then we draft a first itinerary for it. You can change every
            part of that draft afterwards.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <ButtonLink to="/trips" variant="ghost">
              Cancel
            </ButtonLink>
            <Button
              type="submit"
              variant="primary"
              size="lg"
              loading={isSubmitting}
              loadingLabel="Creating your trip"
              iconAfter={<Icon name="arrow_forward" size={18} />}
            >
              Create trip and draft itinerary
            </Button>
          </div>
        </Card>
      </form>
    </div>
  )
}
