import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { EditTripDialog } from '@/components/EditTripDialog'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { ButtonLink } from '@/components/ui/ButtonLink'
import { Card, CardTitle } from '@/components/ui/Card'
import { Dialog } from '@/components/ui/Dialog'
import { EmptyState } from '@/components/ui/EmptyState'
import { Icon } from '@/components/ui/Icon'
import { ProgressBar, StatTile } from '@/components/ui/StatTile'
import {
  formatDate,
  formatDateRange,
  formatLongDate,
  formatTime,
  todayISO,
  tripLengthInDays,
} from '@/domain/format'
import { countItems, findDayForDate } from '@/domain/itinerary'
import { CURRENCY_SYMBOLS, formatMoney } from '@/domain/money'
import { INTEREST_LABEL, ITINERARY_CATEGORY_ICON, PACE_LABEL, PROTOTYPE_LABEL } from '@/lib/labels'
import { useGeneration, useTourist, useTrip, useTripBudget, useTripDays, useTripExpenses, useTripNotes } from '@/state/useTourist'

function countLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`
}

function DetailRow({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-line pb-2 last:border-b-0">
      <dt className="text-label-sm uppercase tracking-wider text-ink-subtle">{term}</dt>
      <dd className="text-body-md text-ink">{children}</dd>
    </div>
  )
}

function MetaBlock({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-label-sm uppercase tracking-wider text-ink-subtle">{term}</dt>
      <dd className="text-body-md text-ink">{children}</dd>
    </div>
  )
}

export default function TripOverviewPage() {
  const { tripId } = useParams<{ tripId: string }>()
  const { actions } = useTourist()
  const trip = useTrip(tripId)
  const days = useTripDays(tripId)
  const expenses = useTripExpenses(tripId)
  const notes = useTripNotes(tripId)
  const budget = useTripBudget(tripId)
  const generation = useGeneration(tripId)
  const navigate = useNavigate()
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const closeEdit = useCallback(() => setEditOpen(false), [])
  const closeDelete = useCallback(() => setDeleteOpen(false), [])

  const today = todayISO()
  const regenerating = generation.status === 'loading'

  const focusDay = useMemo(() => {
    const todayDay = findDayForDate(days, today)
    if (todayDay && todayDay.items.length > 0) return { day: todayDay, isToday: true }
    const first = days.find((candidate) => candidate.items.length > 0)
    return first ? { day: first, isToday: first.date === today } : null
  }, [days, today])

  const liveMessage = useMemo(() => {
    if (generation.status === 'loading') return 'Regenerating the itinerary draft.'
    if (generation.status === 'success') return 'The itinerary draft has been updated.'
    if (generation.status === 'error') return 'The itinerary draft could not be regenerated.'
    return ''
  }, [generation.status])

  if (!trip || !budget) {
    return (
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
    )
  }

  const itemCount = countItems(days)
  const percent = budget.tripBudget > 0 ? Math.round((budget.actualSpent / budget.tripBudget) * 100) : 0
  const regenerate = () => {
    void actions.generateItinerary(trip.id, { regenerate: true })
  }
  const generate = () => {
    void actions.generateItinerary(trip.id)
  }
  const confirmDelete = () => {
    actions.deleteTrip(trip.id)
    closeDelete()
    navigate('/trips')
  }

  return (
    <div className="flex flex-col gap-6">
      <section aria-label="Trip summary" className="surface-raised p-5 sm:p-6">
        <Link
          to="/trips"
          className="inline-flex items-center gap-1 rounded-control text-label-md text-ink-muted transition-colors hover:text-ink"
        >
          <Icon name="arrow_back" size={16} />
          All trips
        </Link>

        <p className="mt-4 flex flex-wrap items-center gap-1.5 text-label-md uppercase tracking-wider text-terracotta">
          <Icon name="flight_takeoff" size={16} />
          <span>{trip.origin}</span>
          <Icon name="arrow_forward" size={14} />
          <span className="sr-only">to</span>
          <span>{trip.destination}</span>
        </p>

        <h1 className="mt-1 text-headline-lg sm:text-display">{trip.name}</h1>

        <dl className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-3">
          <MetaBlock term="Dates">{formatDateRange(trip.startDate, trip.endDate)}</MetaBlock>
          <MetaBlock term="Travellers">{countLabel(trip.travelers, 'traveller', 'travellers')}</MetaBlock>
          <MetaBlock term="Pace">{PACE_LABEL[trip.pace]}</MetaBlock>
        </dl>

        <ul className="mt-4 flex list-none flex-wrap items-center gap-2">
          {trip.interests.map((interest) => (
            <li key={interest} className="list-none">
              <span className="inline-flex items-center gap-1.5 rounded-pill border border-line bg-surface px-3 py-1 text-label-md text-ink-muted">
                <Icon name="interests" size={14} className="text-ink-subtle" />
                {INTEREST_LABEL[interest]}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="Trip actions" className="flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          icon={<Icon name="edit" size={18} />}
          onClick={() => setEditOpen(true)}
        >
          Edit trip
        </Button>
        <Button
          variant="accent"
          icon={<Icon name="auto_awesome" size={18} />}
          loading={regenerating}
          loadingLabel="Regenerating"
          onClick={regenerate}
        >
          Regenerate itinerary
        </Button>
        <ButtonLink to={`/trips/${trip.id}/budget`} variant="secondary" icon={<Icon name="add_card" size={18} />}>
          Add expense
        </ButtonLink>
        <ButtonLink
          to={`/trips/${trip.id}/notes`}
          variant="secondary"
          icon={<Icon name="note_add" size={18} />}
        >
          {notes.length > 0 ? `Notes (${notes.length})` : 'Add a note'}
        </ButtonLink>
        <Button
          variant="danger"
          icon={<Icon name="delete_outline" size={18} />}
          onClick={() => setDeleteOpen(true)}
        >
          Delete trip
        </Button>
        <span aria-live="polite" className="sr-only">
          {liveMessage}
        </span>
      </section>

      {generation.status === 'error' && generation.error ? (
        <Alert tone="danger" title="The itinerary draft could not be regenerated">
          {`${generation.error} Everything you added or edited yourself is untouched.`}
        </Alert>
      ) : null}

      <section aria-label="Budget" className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile
            label={PROTOTYPE_LABEL.tripBudget}
            value={formatMoney(budget.tripBudget, trip.currency)}
            caption="Your own ceiling for this trip"
            icon={<Icon name="savings" size={14} />}
          />
          <StatTile
            label={PROTOTYPE_LABEL.aiDraftEstimate}
            value={formatMoney(budget.itineraryEstimate, trip.currency)}
            caption="A projection from the draft, not a booking"
            tone="accent"
            icon={<Icon name="auto_awesome" size={14} />}
          />
          <StatTile
            label={PROTOTYPE_LABEL.actualSpent}
            value={formatMoney(budget.actualSpent, trip.currency)}
            caption="Expenses you logged"
            tone="actual"
            icon={<Icon name="receipt_long" size={14} />}
          />
          <StatTile
            label={PROTOTYPE_LABEL.remaining}
            value={formatMoney(budget.remaining, trip.currency)}
            caption="Trip budget minus actual spent"
            tone={budget.isOverBudget ? 'danger' : 'neutral'}
            icon={<Icon name={budget.isOverBudget ? 'warning' : 'account_balance_wallet'} size={14} />}
          />
        </div>

        <div className="surface-card flex flex-col gap-2 p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-label-lg text-ink">Budget used</p>
            <p className="tnum text-body-sm text-ink-muted">
              {budget.tripBudget > 0
                ? `${percent}% of ${formatMoney(budget.tripBudget, trip.currency)}`
                : 'No trip budget set yet'}
            </p>
          </div>
          <ProgressBar
            value={budget.actualSpent}
            max={budget.tripBudget}
            label="Trip budget used"
            tone={budget.isOverBudget ? 'danger' : 'actual'}
          />
          <p className="tnum text-body-sm text-ink-muted">
            {budget.isOverBudget
              ? `Over budget by ${formatMoney(Math.abs(budget.remaining), trip.currency)}. Trim an expense or raise the trip budget.`
              : `${formatMoney(budget.remaining, trip.currency)} still available in ${trip.currency}.`}
          </p>
        </div>
      </section>

      <Card>
        <CardTitle
          hint={
            focusDay
              ? `${formatLongDate(focusDay.day.date)} \u00b7 Day ${focusDay.day.index} of ${days.length}`
              : undefined
          }
          action={
            <ButtonLink
              to={`/trips/${trip.id}/itinerary`}
              size="sm"
              variant="secondary"
              iconAfter={<Icon name="arrow_forward" size={16} />}
            >
              See the full itinerary
            </ButtonLink>
          }
        >
          {focusDay?.isToday ? 'Next up today' : 'Next up'}
        </CardTitle>

        {focusDay ? (
          <>
            <ol className="flex list-none flex-col gap-2">
              {focusDay.day.items.slice(0, 3).map((item) => (
                <li
                  key={item.id}
                  className="flex items-start gap-3 rounded-control bg-surface-low px-3 py-2.5"
                >
                  <span className="tnum shrink-0 pt-0.5 text-label-md text-ink-muted">
                    {formatTime(item.startTime)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-start gap-1.5 text-label-lg text-ink">
                      <Icon
                        name={ITINERARY_CATEGORY_ICON[item.category]}
                        size={16}
                        className="mt-0.5 shrink-0 text-ink-subtle"
                      />
                      {item.title}
                    </span>
                    {item.location ? (
                      <span className="mt-0.5 flex items-start gap-1 text-body-sm text-ink-subtle">
                        <Icon name="place" size={14} className="mt-0.5 shrink-0" />
                        {item.location}
                      </span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ol>
            {focusDay.day.items.length > 3 ? (
              <p className="mt-3 text-body-sm text-ink-muted">
                {`${countLabel(focusDay.day.items.length - 3, 'more stop', 'more stops')} that day in the full itinerary.`}
              </p>
            ) : null}
          </>
        ) : (
          <EmptyState
            icon="auto_awesome"
            title="No itinerary yet"
            description="Generate a day-by-day draft and Tourist will price every stop against your budget. You can change every stop afterwards."
            action={
              <Button
                variant="primary"
                icon={<Icon name="auto_awesome" size={18} />}
                loading={regenerating}
                loadingLabel="Drafting"
                onClick={generate}
              >
                Generate itinerary
              </Button>
            }
          />
        )}
      </Card>

      <Card>
        <CardTitle hint="Everything you can change from Edit trip.">Trip details</CardTitle>
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          <DetailRow term="Travelling from">{trip.origin}</DetailRow>
          <DetailRow term="Destination">{trip.destination}</DetailRow>
          <DetailRow term="Dates">
            {`${formatDateRange(trip.startDate, trip.endDate)} \u00b7 ${countLabel(
              tripLengthInDays(trip.startDate, trip.endDate),
              'day',
              'days',
            )}`}
          </DetailRow>
          <DetailRow term="Travellers">{countLabel(trip.travelers, 'traveller', 'travellers')}</DetailRow>
          <DetailRow term="Currency">
            {`${trip.currency} (${CURRENCY_SYMBOLS[trip.currency]})`}
          </DetailRow>
          <DetailRow term="Pace">{PACE_LABEL[trip.pace]}</DetailRow>
          <DetailRow term="Notes">
            {trip.notes ? <span className="whitespace-pre-line">{trip.notes}</span> : <span className="text-ink-subtle">No notes yet</span>}
          </DetailRow>
          <DetailRow term="Created">{formatDate(trip.createdAt.slice(0, 10))}</DetailRow>
        </dl>
      </Card>

      <EditTripDialog trip={trip} open={editOpen} onClose={closeEdit} />

      <Dialog
        open={deleteOpen}
        onClose={closeDelete}
        title={`Delete ${trip.name}?`}
        description="This cannot be undone."
        footer={
          <>
            <Button variant="ghost" onClick={closeDelete}>
              Keep this trip
            </Button>
            <Button variant="danger" icon={<Icon name="delete_forever" size={18} />} onClick={confirmDelete}>
              Delete trip
            </Button>
          </>
        }
      >
        <p className="text-body-md text-ink-muted">These will be permanently removed from this device:</p>
        <ul className="mt-3 flex list-none flex-col gap-2 text-body-sm text-ink-muted">
          <li className="flex items-start gap-2">
            <Icon name="luggage" size={18} className="mt-0.5 shrink-0 text-ink-subtle" />
            The trip itself: {formatDateRange(trip.startDate, trip.endDate)} in {trip.destination}
          </li>
          <li className="flex items-start gap-2">
            <Icon name="calendar_month" size={18} className="mt-0.5 shrink-0 text-ink-subtle" />
            {itemCount > 0
              ? `The itinerary draft, with ${countLabel(itemCount, 'planned stop', 'planned stops')}`
              : 'The itinerary draft, which has no stops yet'}
          </li>
          <li className="flex items-start gap-2">
            <Icon name="receipt_long" size={18} className="mt-0.5 shrink-0 text-ink-subtle" />
            {expenses.length > 0
              ? `Every logged expense, ${countLabel(expenses.length, 'entry', 'entries')}`
              : 'No logged expenses to lose'}
          </li>
          <li className="flex items-start gap-2">
            <Icon name="sticky_note_2" size={18} className="mt-0.5 shrink-0 text-ink-subtle" />
            {notes.length > 0
              ? `${countLabel(notes.length, 'note', 'notes')} saved against this trip`
              : 'No notes saved yet'}
          </li>
        </ul>
      </Dialog>
    </div>
  )
}
