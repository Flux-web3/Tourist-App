import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { ButtonLink } from '@/components/ui/ButtonLink'
import { Card, CardTitle, PageHeader } from '@/components/ui/Card'
import { Disclosure } from '@/components/ui/Disclosure'
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

  /*
    The only two optional answers on the form, and the only two that the
    itinerary generator never reads: it drafts from destination, dates, pace and
    interests alone, so leaving both blank costs the traveller nothing. Both are
    also editable afterwards from Edit trip on the overview.
    Expanded they were the second-tallest block on the page, sitting between the
    last required answer and the submit button, so they are collapsed by default
    and labelled Optional rather than merely described as optional.
  */
  const optionalAnswers = (
    <>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <TextField
          label="Trip name"
          value={draft.name}
          maxLength={TRIP_LIMITS.maxNameLength}
          placeholder={suggestTripName(draft.destination, draft.startDate)}
          error={errors.name}
          hint="Leave blank and we name it after the destination and month."
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
    </>
  )

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        eyebrow="New trip"
        title="Plan a trip"
        description="A few short answers and Tourist drafts a day-by-day itinerary you can argue with. Nothing is booked or charged."
      />

      {/*
        The storage claim was a full banner above the form, which on a phone
        pushed the first question below the fold. It is one line now, and the
        detail is one tap away.
      */}
      <Disclosure tone="catalog" icon="smartphone" summary={PROTOTYPE_LABEL.localOnly}>
        {`${PROTOTYPE_LABEL.noAccount}. The trip, its draft itinerary and every expense stay in this browser, and nothing is sent to a server.`}
      </Disclosure>

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
          <CardTitle>Where and when</CardTitle>

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

          {/*
            The presets used to sit at the foot of the card, below the two date
            inputs. A shortcut that only appears after you have already scrolled
            past the work it saves is not a shortcut, so it now comes first: tap
            one and both date fields below are already answered.
          */}
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
                  {`${preset.label} · ${preset.days} days`}
                </Button>
              )
            })}
          </div>

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
              hint={`Up to ${TRIP_LIMITS.maxDays} days.`}
              onChange={(event) => update({ endDate: event.target.value })}
            />
          </div>

          <div className="flex flex-col gap-2">
            <div
              aria-live="polite"
              className="flex min-w-0 flex-wrap items-center gap-2 rounded-control border border-line bg-surface-low px-3 py-2"
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
        </Card>

        <Card className="flex flex-col gap-4">
          {/*
            The currency caveat used to be a hint under the Currency field. It
            is a fact about the whole card, not about that one control, and as a
            field hint it both repeated this sentence and stopped the two short
            controls from sharing a row on a phone.
          */}
          <CardTitle hint="One currency and one ceiling for the whole trip, with no live conversion. You log real spending against it later.">
            Travellers and budget
          </CardTitle>

          {/*
            Travellers is a two-digit count and Currency is a four-character
            code: neither needs a full phone width, and stacking them cost a
            whole field row on the way to the submit button.
          */}
          <div className="grid grid-cols-2 gap-4">
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

            {/* Currency comes before the amount, so the figure is typed in a known unit. */}
            <SelectField
              label="Currency"
              required
              options={CURRENCY_OPTIONS}
              value={draft.currency}
              error={errors.currency}
              onChange={(event) => update({ currency: event.target.value as CurrencyCode })}
            />
          </div>

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
        </Card>

        <Card className="flex flex-col gap-4">
          <CardTitle>What the draft should lean towards</CardTitle>

          <CheckboxChipGroup<TravelInterest>
            legend="Interests"
            name={`${formId}-interests`}
            options={INTEREST_OPTIONS}
            values={draft.interests}
            error={errors.interests}
            hint="Pick at least one."
            onChange={(interests) => update({ interests })}
          />

          <RadioChipGroup<TravelPace>
            legend="Pace"
            name={`${formId}-pace`}
            columns={3}
            value={draft.pace}
            options={TRAVEL_PACES}
            onChange={(pace) => update({ pace })}
          />
        </Card>

        {/*
          The one error these two fields can raise is a name over the limit,
          and an error must never sit behind a closed summary. That case keeps
          the old expanded card so the message stays visible next to its field.
        */}
        {errors.name ? (
          <Card className="flex flex-col gap-4">
            <CardTitle hint="Both optional.">Name and notes</CardTitle>
            {optionalAnswers}
          </Card>
        ) : (
          <Disclosure
            tone="quiet"
            icon="edit_note"
            summary={
              <span className="flex flex-wrap items-center gap-2">
                Trip name and notes
                <Badge tone="neutral">Optional</Badge>
              </span>
            }
          >
            <div className="flex flex-col gap-4 pt-1">{optionalAnswers}</div>
          </Disclosure>
        )}

        <div className="surface-card flex flex-col gap-3 p-5">
          <p className="text-body-sm text-ink-subtle">
            We draft a first itinerary from these answers. You can change every part of it afterwards.
          </p>
          <Button
            type="submit"
            variant="primary"
            size="lg"
            fullWidth
            loading={isSubmitting}
            loadingLabel="Creating your trip"
            iconAfter={<Icon name="arrow_forward" size={18} />}
          >
            Create trip and draft itinerary
          </Button>
          <ButtonLink to="/trips" variant="ghost" fullWidth>
            Cancel
          </ButtonLink>
        </div>
      </form>
    </div>
  )
}
