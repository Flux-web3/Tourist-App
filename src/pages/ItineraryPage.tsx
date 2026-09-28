import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react'
import { useParams } from 'react-router-dom'
import { DraftProvenanceNote, GenerationPanel } from '@/components/GenerationPanel'
import { ItineraryItemCard } from '@/components/ItineraryItemCard'
import { Alert } from '@/components/ui/Alert'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { ButtonLink } from '@/components/ui/ButtonLink'
import { PageHeader } from '@/components/ui/Card'
import { Dialog } from '@/components/ui/Dialog'
import { EmptyState, Skeleton } from '@/components/ui/EmptyState'
import { NumberField, SelectField, TextAreaField, TextField } from '@/components/ui/Field'
import { Icon } from '@/components/ui/Icon'
import { formatDateRange, formatLongDate, formatShortDate, isValidTime, todayISO } from '@/domain/format'
import {
  countItems,
  estimateTotal,
  findDayForDate,
  findItemInDays,
  nextEmptySlotStartTime,
} from '@/domain/itinerary'
import { CURRENCY_SYMBOLS, formatAmount, formatPrice, toCents } from '@/domain/money'
import { ITINERARY_CATEGORY_LABEL, PROTOTYPE_LABEL } from '@/lib/labels'
import { describePlan } from '@/services'
import { useGeneration, useTourist, useTrip, useTripDays } from '@/state/useTourist'
import type { CustomItemInput } from '@/state/touristContext'
import type { CurrencyCode, ItineraryCategory, ItineraryItem } from '@/domain/types'

const CATEGORY_OPTIONS: ReadonlyArray<{ value: string; label: string }> = Object.entries(
  ITINERARY_CATEGORY_LABEL,
).map(([value, label]) => ({ value, label }))

interface ItemFormValue {
  title: string
  category: ItineraryCategory
  startTime: string
  endTime: string
  location: string
  description: string
  estimatedCost: number
  notes: string
}

type ItemFormErrors = Partial<Record<keyof ItemFormValue | 'dayId', string>>

const EMPTY_FORM: ItemFormValue = {
  title: '',
  category: 'sightseeing',
  startTime: '10:00',
  endTime: '',
  location: '',
  description: '',
  estimatedCost: 0,
  notes: '',
}

function toForm(item: ItineraryItem | null, defaultStartTime: string): ItemFormValue {
  if (!item) return { ...EMPTY_FORM, startTime: defaultStartTime }
  return {
    title: item.title,
    category: item.category,
    startTime: item.startTime,
    endTime: item.endTime ?? '',
    location: item.location,
    description: item.description,
    estimatedCost: item.estimatedCost,
    notes: item.notes,
  }
}

function validateForm(value: ItemFormValue, showDayField: boolean, dayId: string): ItemFormErrors {
  const errors: ItemFormErrors = {}
  if (!value.title.trim()) errors.title = 'Give this activity a name so you can spot it later.'
  if (!isValidTime(value.startTime)) errors.startTime = 'Enter a start time between 00:00 and 23:59.'
  if (value.endTime !== '') {
    if (!isValidTime(value.endTime)) {
      errors.endTime = 'Enter an end time between 00:00 and 23:59, or leave it blank.'
    } else if (isValidTime(value.startTime) && value.endTime <= value.startTime) {
      errors.endTime = 'The end time has to be after the start time.'
    }
  }
  if (!Number.isFinite(value.estimatedCost) || value.estimatedCost < 0) {
    errors.estimatedCost = 'Enter an estimate of 0 or more.'
  }
  if (showDayField && dayId === '') errors.dayId = 'Choose the day this activity belongs to.'
  return errors
}

interface ItineraryItemDialogProps {
  onClose: () => void
  heading: string
  description: string
  submitLabel: string
  item: ItineraryItem | null
  currency: CurrencyCode
  dayOptions: ReadonlyArray<{ value: string; label: string }>
  dayId: string
  showDayField: boolean
  defaultStartTime: string
  onDayChange?: (dayId: string) => void
  onSubmit: (input: CustomItemInput) => void
}

function ItineraryItemDialog({
  onClose,
  heading,
  description,
  submitLabel,
  item,
  currency,
  dayOptions,
  dayId,
  showDayField,
  defaultStartTime,
  onDayChange,
  onSubmit,
}: ItineraryItemDialogProps) {
  const [value, setValue] = useState<ItemFormValue>(() => toForm(item, defaultStartTime))
  const [errors, setErrors] = useState<ItemFormErrors>({})
  const [submitted, setSubmitted] = useState(false)
  const formId = useId()
  const summaryRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (submitted && Object.keys(errors).length > 0) summaryRef.current?.focus()
  }, [errors, submitted])

  const update = useCallback(
    (patch: Partial<ItemFormValue>) => {
      const next = { ...value, ...patch }
      setValue(next)
      if (submitted) setErrors(validateForm(next, showDayField, dayId))
    },
    [value, submitted, showDayField, dayId],
  )

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitted(true)
    const found = validateForm(value, showDayField, dayId)
    setErrors(found)
    if (Object.keys(found).length > 0) return
    onSubmit({
      title: value.title.trim(),
      category: value.category,
      startTime: value.startTime,
      endTime: value.endTime === '' ? null : value.endTime,
      location: value.location.trim(),
      description: value.description.trim(),
      estimatedCost: Math.max(0, value.estimatedCost),
      notes: value.notes.trim(),
    })
  }

  const messages = Object.values(errors).filter((message): message is string => Boolean(message))

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={heading}
      description={description}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form={formId} variant="primary" icon={<Icon name="check" size={18} />}>
            {submitLabel}
          </Button>
        </>
      }
    >
      <form id={formId} noValidate onSubmit={handleSubmit} className="flex flex-col gap-4">
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

        {showDayField ? (
          <SelectField
            label="Day"
            required
            options={dayOptions}
            value={dayId}
            placeholder="Choose a day"
            error={errors.dayId}
            onChange={(event) => {
              const next = event.target.value
              onDayChange?.(next)
              if (submitted) setErrors(validateForm(value, showDayField, next))
            }}
          />
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Activity"
            required
            value={value.title}
            maxLength={120}
            placeholder="Louvre Museum"
            error={errors.title}
            onChange={(event) => update({ title: event.target.value })}
            className="sm:col-span-2"
          />

          <SelectField
            label="Category"
            required
            options={CATEGORY_OPTIONS}
            value={value.category}
            onChange={(event) => update({ category: event.target.value as ItineraryCategory })}
          />

          <TextField
            label="Location"
            value={value.location}
            maxLength={120}
            placeholder="Le Marais, Paris"
            onChange={(event) => update({ location: event.target.value })}
          />

          <TextField
            label="Start time"
            required
            type="time"
            value={value.startTime}
            error={errors.startTime}
            onChange={(event) => update({ startTime: event.target.value })}
          />

          <TextField
            label="End time"
            type="time"
            hint="Optional. Leave blank when the stop has no fixed end."
            value={value.endTime}
            error={errors.endTime}
            onChange={(event) => update({ endTime: event.target.value })}
          />

          <NumberField
            label={`Estimated cost (${currency})`}
            min={0}
            step={1}
            prefix={CURRENCY_SYMBOLS[currency]}
            suffix={currency}
            value={value.estimatedCost}
            error={errors.estimatedCost}
            onValueChange={(amount) => update({ estimatedCost: amount })}
          />

          <TextAreaField
            label="Description"
            rows={3}
            maxLength={400}
            placeholder="What happens here, and why it is worth the detour."
            value={value.description}
            onChange={(event) => update({ description: event.target.value })}
          />

          <TextAreaField
            label="Notes"
            rows={2}
            maxLength={400}
            placeholder="Booking references, opening hours, dietary needs."
            value={value.notes}
            onChange={(event) => update({ notes: event.target.value })}
            className="sm:col-span-2"
          />
        </div>
      </form>
    </Dialog>
  )
}

function TimelineSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      {[0, 1].map((group) => (
        <div key={group} className="flex flex-col gap-3">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ))}
    </div>
  )
}

export default function ItineraryPage() {
  const { tripId } = useParams<{ tripId: string }>()
  const trip = useTrip(tripId)
  const days = useTripDays(tripId)
  const generation = useGeneration(tripId)
  const { actions, pendingItemId, swapError: latestSwapError, swapTripId } = useTourist()
  // A failed swap on one trip must not surface on another trip's itinerary.
  const swapError = swapTripId === tripId ? latestSwapError : null

  const [editingId, setEditingId] = useState<string | null>(null)
  const [removing, setRemoving] = useState<ItineraryItem | null>(null)
  const [moveItemId, setMoveItemId] = useState<string | null>(null)
  /**
   * Removing or moving a stop unmounts the control that had focus, which
   * dropped keyboard and screen-reader users back to the top of the document.
   * The day the stop left, or landed on, takes focus instead once the plan has
   * re-rendered.
   */
  const focusDayRef = useRef<string | null>(null)
  useEffect(() => {
    const dayId = focusDayRef.current
    if (!dayId) return
    focusDayRef.current = null
    document.getElementById(`day-heading-${dayId}`)?.focus()
  }, [days])
  const [addOpen, setAddOpen] = useState(false)
  const [addDayId, setAddDayId] = useState('')
  const [addStartTime, setAddStartTime] = useState('10:00')

  const today = todayISO()
  const loading = generation.status === 'loading'
  const itemCount = countItems(days)
  const hasItems = itemCount > 0

  const dayOptions = useMemo(
    () =>
      days.map((day, position) => ({
        value: day.id,
        label: `Day ${position + 1} · ${formatShortDate(day.date)}`,
      })),
    [days],
  )

  const editing = useMemo(
    () => (editingId ? findItemInDays(days, editingId) : null),
    [days, editingId],
  )

  const openAdd = useCallback(
    (targetDayId?: string) => {
      const target = targetDayId ?? findDayForDate(days, today)?.id ?? days[0]?.id ?? ''
      const targetDay = days.find((day) => day.id === target)
      setAddDayId(target)
      setAddStartTime(targetDay ? nextEmptySlotStartTime(targetDay) : '10:00')
      setAddOpen(true)
    },
    [days, today],
  )

  if (!trip) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="sr-only">Itinerary not found</h1>
        <EmptyState
          icon="search_off"
          title="We could not find that trip"
          description="It may have been deleted, or the link is out of date. Your other trips are still saved on this device."
          action={
            <ButtonLink to="/trips" variant="primary" icon={<Icon name="arrow_back" size={18} />}>
              Back to trips
            </ButtonLink>
          }
        />
      </div>
    )
  }

  const planEstimate = estimateTotal(days, trip.currency)
  /*
   * Stops priced in a different currency are left out of the estimate above,
   * never converted. Say how many, or the total would be quietly partial.
   */
  const uncountedStops = days
    .flatMap((day) => day.items)
    .filter((item) => item.currency !== trip.currency && toCents(item.estimatedCost) !== 0).length
  const noDaysYet = days.length === 0
  const showSkeletons = loading && !hasItems

  const generate = () => {
    void actions.generateItinerary(trip.id, { regenerate: false })
  }
  const regenerate = () => {
    void actions.generateItinerary(trip.id, { regenerate: true })
  }
  const handleAdd = (input: CustomItemInput) => {
    if (actions.addCustomItem(trip.id, input, { dayId: addDayId })) setAddOpen(false)
  }
  const handleEdit = (itemId: string, input: CustomItemInput) => {
    actions.editItem(trip.id, itemId, input)
    setEditingId(null)
  }
  const confirmRemove = () => {
    if (!removing) return
    if (!actions.getItem(trip.id, removing.id)) {
      setRemoving(null)
      return
    }
    focusDayRef.current = days.find((day) => day.items.some((item) => item.id === removing.id))?.id ?? null
    actions.removeItem(trip.id, removing.id)
    setRemoving(null)
  }

  return (
    <div>
      <PageHeader
        eyebrow={formatDateRange(trip.startDate, trip.endDate)}
        title={trip.name}
        description={
          <div className="flex flex-col gap-2">
            {/* Three stat tiles' worth of information, on one line. */}
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-body-sm">
              <span className="tnum">{describePlan(trip, days)}</span>
              <Badge tone="ai" icon={<Icon name="auto_awesome" size={14} />}>
                {PROTOTYPE_LABEL.aiDraftEstimate}
                <span className="tnum">
                  {`${formatAmount(planEstimate, trip.currency)} ${trip.currency}`}
                </span>
              </Badge>
              {uncountedStops > 0 ? (
                <span className="text-ink-subtle">
                  {`${uncountedStops} ${uncountedStops === 1 ? 'stop' : 'stops'} in another currency not included`}
                </span>
              ) : null}
            </p>
            <DraftProvenanceNote />
          </div>
        }
        actions={
          <>
            <Button
              variant={hasItems ? 'primary' : 'secondary'}
              icon={<Icon name="add" size={18} />}
              disabled={noDaysYet}
              onClick={() => openAdd()}
            >
              Add activity
            </Button>
            {hasItems ? (
              <Button
                variant="secondary"
                icon={<Icon name="refresh" size={18} />}
                loading={loading}
                loadingLabel="Regenerating"
                onClick={regenerate}
              >
                Regenerate
              </Button>
            ) : null}
          </>
        }
      />

      <GenerationPanel trip={trip} days={days} />

      {swapError ? (
        <Alert
          className="mb-4"
          tone="danger"
          title="We could not swap that activity"
          action={
            <Button
              variant="secondary"
              size="sm"
              icon={<Icon name="close" size={16} />}
              onClick={() => actions.dismissSwapError()}
            >
              Dismiss
            </Button>
          }
        >
          {`${swapError} Every other stop on this itinerary is exactly where you left it.`}
        </Alert>
      ) : null}

      <section aria-labelledby="itinerary-days" className="flex flex-col gap-4">
        {/* The day headings below are the visible structure; this only names the region. */}
        <h2 id="itinerary-days" className="sr-only">
          Day by day
        </h2>

        {showSkeletons ? (
          <TimelineSkeleton />
        ) : noDaysYet ? (
          <EmptyState
            icon="calendar_month"
            title="This trip has no days yet"
            description={`${formatDateRange(trip.startDate, trip.endDate)} should give you at least one day. Generating re-reads the trip dates and rebuilds the plan.`}
            action={
              <Button
                variant="primary"
                icon={<Icon name="auto_awesome" size={18} />}
                onClick={generate}
              >
                Generate itinerary
              </Button>
            }
          />
        ) : !hasItems ? (
          <EmptyState
            icon="auto_awesome"
            title={`Your ${days.length} ${days.length === 1 ? 'day' : 'days'} in ${trip.destination} are wide open`}
            description="Draft a plan to start from, then change anything you like. Whatever you add yourself is always kept."
            action={
              <Button
                variant="primary"
                icon={<Icon name="auto_awesome" size={18} />}
                onClick={generate}
              >
                Generate itinerary
              </Button>
            }
          />
        ) : (
          <ol className="flex list-none flex-col gap-8">
            {days.map((day, position) => {
              const dayTotal = estimateTotal([day], trip.currency)
              return (
                <li key={day.id} className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1 border-b border-line pb-2">
                    <div className="min-w-0">
                      <p className="text-label-sm uppercase tracking-widest text-terracotta">
                        {`Day ${position + 1}`}
                      </p>
                      <h3
                        id={`day-heading-${day.id}`}
                        tabIndex={-1}
                        className="break-words text-headline-sm"
                      >
                        {formatLongDate(day.date)}
                      </h3>
                      {day.title ? (
                        <p className="mt-0.5 text-body-md text-ink-muted">{day.title}</p>
                      ) : null}
                    </div>
                    {day.items.length > 0 ? (
                      <p className="tnum shrink-0 text-label-md text-ink-muted">
                        {`${day.items.length} ${
                          day.items.length === 1 ? 'stop' : 'stops'
                        } · ${formatAmount(dayTotal, trip.currency)} estimated`}
                      </p>
                    ) : null}
                  </div>

                  {day.items.length === 0 ? (
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-dashed border-line-strong bg-surface-low px-4 py-3">
                      <p className="text-body-sm text-ink-subtle">
                        Nothing planned yet. This day is wide open.
                      </p>
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={<Icon name="add" size={16} />}
                        onClick={() => openAdd(day.id)}
                      >
                        Add an activity
                      </Button>
                    </div>
                  ) : (
                    <ul className="flex list-none flex-col gap-3">
                      {day.items.map((item) => (
                        <li key={item.id}>
                          <ItineraryItemCard
                            item={item}
                            day={day}
                            days={days}
                            currency={trip.currency}
                            pendingItemId={pendingItemId}
                            moving={moveItemId === item.id}
                            onToggleMove={() =>
                              setMoveItemId((current) => (current === item.id ? null : item.id))
                            }
                            onEdit={() => setEditingId(item.id)}
                            onReplace={() => {
                              void actions.replaceItem(trip.id, item.id)
                            }}
                            onMove={(targetDayId) => {
                              focusDayRef.current = targetDayId
                              actions.moveItem(trip.id, item.id, targetDayId)
                              setMoveItemId(null)
                            }}
                            onRemove={() => setRemoving(item)}
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              )
            })}
          </ol>
        )}
      </section>

      {addOpen ? (
        <ItineraryItemDialog
          onClose={() => setAddOpen(false)}
          heading="Add an activity"
          description="Anything you add here is yours: the next regeneration keeps it exactly as you typed it."
          submitLabel="Add activity"
          item={null}
          currency={trip.currency}
          dayOptions={dayOptions}
          dayId={addDayId}
          showDayField
          defaultStartTime={addStartTime}
          onDayChange={setAddDayId}
          onSubmit={handleAdd}
        />
      ) : null}

      {editing ? (
        <ItineraryItemDialog
          key={editing.item.id}
          onClose={() => setEditingId(null)}
          heading="Edit activity"
          description="Editing marks this stop as yours, so regeneration will leave it alone from now on."
          submitLabel="Save changes"
          item={editing.item}
          currency={editing.item.currency}
          dayOptions={dayOptions}
          dayId={editing.day.id}
          showDayField={false}
          defaultStartTime={editing.item.startTime}
          onSubmit={(input) => handleEdit(editing.item.id, input)}
        />
      ) : null}

      <Dialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title={`Remove ${removing?.title ?? 'this activity'}?`}
        description="Only this one stop is removed. Every other day, stop and price stays exactly as it is."
        footer={
          <>
            <Button variant="ghost" onClick={() => setRemoving(null)}>
              Keep it
            </Button>
            <Button
              variant="danger"
              icon={<Icon name="delete_forever" size={18} />}
              onClick={confirmRemove}
            >
              Remove activity
            </Button>
          </>
        }
      >
        <p className="tnum text-body-md text-ink-muted">
          {removing
            ? `${removing.endTime ? `${removing.startTime}–${removing.endTime}` : removing.startTime} · ${
                removing.location || 'No location set'
              } · ${formatPrice(removing.estimatedCost, removing.currency)}${
                toCents(removing.estimatedCost) === 0 ? '.' : ' estimated.'
              }`
            : ''}
        </p>
      </Dialog>
    </div>
  )
}
