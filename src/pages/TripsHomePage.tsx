import { useCallback, useState } from 'react'
import { Alert } from '@/components/ui/Alert'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { ButtonLink } from '@/components/ui/ButtonLink'
import { Card, PageHeader } from '@/components/ui/Card'
import { Dialog } from '@/components/ui/Dialog'
import { EmptyState, Skeleton } from '@/components/ui/EmptyState'
import { Icon } from '@/components/ui/Icon'
import { formatDateRange, tripLengthInDays } from '@/domain/format'
import { formatMoneyCompact } from '@/domain/money'
import { PROTOTYPE_LABEL } from '@/lib/labels'
import { selectTripSummary } from '@/state/selectors'
import { useTourist, useTrips } from '@/state/useTourist'
import type { Trip } from '@/domain/types'

type TripSummary = ReturnType<typeof selectTripSummary>

function countLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`
}

function BudgetFigure({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'danger' }) {
  return (
    <div className="rounded-control bg-surface-low px-2 py-2.5 text-center">
      <p className="text-label-sm uppercase tracking-wider text-ink-subtle">{label}</p>
      <p className={`tnum mt-1 text-headline-sm ${tone === 'danger' ? 'text-danger' : 'text-ink'}`}>{value}</p>
    </div>
  )
}

function TripCard({ trip, summary }: { trip: Trip; summary: TripSummary }) {
  const { itemCount, actualSpent, remaining } = summary
  const overBudget = remaining < 0
  const length = tripLengthInDays(trip.startDate, trip.endDate)
  const ready = trip.status === 'itinerary_ready'

  return (
    <li className="list-none">
      <Card as="article" className="flex h-full flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-headline-md">{trip.name}</h2>
            <p className="mt-1 flex flex-wrap items-center gap-1.5 text-body-md text-ink-muted">
              <Icon name="flight_takeoff" size={16} className="text-ink-subtle" />
              <span>{trip.origin}</span>
              <Icon name="arrow_forward" size={14} className="text-ink-subtle" />
              <span className="sr-only">to</span>
              <span>{trip.destination}</span>
            </p>
          </div>
          <Badge
            tone={ready ? 'actual' : 'ai'}
            icon={<Icon name={ready ? 'task_alt' : 'auto_awesome'} size={14} />}
          >
            {ready ? 'Itinerary ready' : 'Itinerary not generated'}
          </Badge>
        </div>

        <ul className="flex list-none flex-wrap items-center gap-x-4 gap-y-1.5 text-body-sm text-ink-muted">
          <li className="flex items-center gap-1.5">
            <Icon name="calendar_month" size={16} className="text-ink-subtle" />
            {formatDateRange(trip.startDate, trip.endDate)}
          </li>
          <li className="flex items-center gap-1.5">
            <Icon name="group" size={16} className="text-ink-subtle" />
            {countLabel(trip.travelers, 'traveller', 'travellers')}
          </li>
          <li className="flex items-center gap-1.5">
            <Icon name="hourglass_bottom" size={16} className="text-ink-subtle" />
            {countLabel(length, 'day', 'days')}
          </li>
          <li className="flex items-center gap-1.5">
            <Icon name="pin_drop" size={16} className="text-ink-subtle" />
            {itemCount > 0
              ? countLabel(itemCount, 'planned stop', 'planned stops')
              : 'No planned stops yet'}
          </li>
        </ul>

        <div className="rounded-card border border-line bg-surface-low p-3">
          <div className="grid grid-cols-3 gap-2">
            <BudgetFigure label={PROTOTYPE_LABEL.tripBudget} value={formatMoneyCompact(trip.budget, trip.currency)} />
            <BudgetFigure label={PROTOTYPE_LABEL.actualSpent} value={formatMoneyCompact(actualSpent, trip.currency)} />
            <BudgetFigure
              label={PROTOTYPE_LABEL.remaining}
              value={formatMoneyCompact(remaining, trip.currency)}
              tone={overBudget ? 'danger' : 'default'}
            />
          </div>
          {overBudget ? (
            <p className="mt-2 flex items-center justify-center gap-1 text-body-sm text-danger">
              <Icon name="warning" size={16} />
              {`Over budget by ${formatMoneyCompact(Math.abs(remaining), trip.currency)}`}
            </p>
          ) : null}
        </div>

        <div className="mt-auto flex flex-col gap-2 sm:flex-row">
          <ButtonLink to={`/trips/${trip.id}`} fullWidth variant="primary" iconAfter={<Icon name="arrow_forward" size={18} />}>
            Overview
          </ButtonLink>
          <ButtonLink to={`/trips/${trip.id}/itinerary`} fullWidth variant="secondary" icon={<Icon name="calendar_month" size={18} />}>
            Itinerary
          </ButtonLink>
          <ButtonLink to={`/trips/${trip.id}/budget`} fullWidth variant="secondary" icon={<Icon name="account_balance_wallet" size={18} />}>
            Budget
          </ButtonLink>
        </div>
      </Card>
    </li>
  )
}

function TripCardSkeleton() {
  return (
    <li className="list-none">
      <div className="surface-card flex flex-col gap-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-6 w-40" />
        </div>
        <Skeleton className="h-4 w-64" />
        <Skeleton className="h-4 w-72" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-11 w-full" />
      </div>
    </li>
  )
}

export default function TripsHomePage() {
  const { state, hydrated, actions } = useTourist()
  const trips = useTrips()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [status, setStatus] = useState('')

  const closeConfirm = useCallback(() => setConfirmOpen(false), [])

  const restoreDemo = useCallback(() => {
    actions.loadDemoData()
    setStatus('The demo trip has been restored.')
  }, [actions])

  const confirmClear = useCallback(() => {
    actions.clearAllData()
    setConfirmOpen(false)
    setStatus('All saved trips, itineraries and expenses have been cleared.')
  }, [actions])

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Trips"
        title="Your trips"
        description="Every plan, draft and expense you create is kept on this device."
        actions={
          <ButtonLink to="/trips/new" variant="primary" size="lg" icon={<Icon name="add_location_alt" size={20} />}>
            Plan a new trip
          </ButtonLink>
        }
      />

      <section aria-label="Prototype notice" className="flex flex-col gap-3">
        <Alert tone="prototype" title={PROTOTYPE_LABEL.localOnly}>
          {`${PROTOTYPE_LABEL.noAccount}. Itinerary drafts and prices are estimates, not bookings.`}
        </Alert>

        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1.5 text-label-lg text-ink-muted">
            <Icon name="science" size={16} />
            Demo data
          </span>
          <Button size="sm" variant="ghost" icon={<Icon name="auto_awesome" size={16} />} onClick={restoreDemo}>
            Restore demo trip
          </Button>
          <Button
            size="sm"
            variant="ghost"
            icon={<Icon name="delete_sweep" size={16} />}
            onClick={() => setConfirmOpen(true)}
          >
            Clear all data
          </Button>
        </div>

        <p aria-live="polite" className="sr-only">
          {status}
        </p>
      </section>

      {!hydrated ? (
        <ul className="flex list-none flex-col gap-4">
          <TripCardSkeleton />
          <TripCardSkeleton />
        </ul>
      ) : trips.length === 0 ? (
        <EmptyState
          icon="travel_explore"
          title="No trips yet"
          description="Plan your first trip and Tourist will draft a day-by-day itinerary, price it out and keep track of what you actually spend."
          action={
            <div className="mt-1 flex flex-col gap-2 sm:flex-row">
              <ButtonLink to="/trips/new" variant="primary" icon={<Icon name="add_location_alt" size={18} />}>
                Plan a trip
              </ButtonLink>
              <Button variant="secondary" icon={<Icon name="auto_awesome" size={18} />} onClick={restoreDemo}>
                Restore the demo trip
              </Button>
            </div>
          }
        />
      ) : (
        <ul className="flex list-none flex-col gap-4">
          {trips.map((trip) => (
            <TripCard key={trip.id} trip={trip} summary={selectTripSummary(state, trip)} />
          ))}
        </ul>
      )}

      <Dialog
        open={confirmOpen}
        onClose={closeConfirm}
        title="Clear all data?"
        description="This removes everything Tourist has stored in this browser. It cannot be undone."
        footer={
          <>
            <Button variant="ghost" onClick={closeConfirm}>
              Keep my data
            </Button>
            <Button variant="danger" icon={<Icon name="delete_forever" size={18} />} onClick={confirmClear}>
              Clear all data
            </Button>
          </>
        }
      >
        <p className="text-body-md text-ink-muted">
          {trips.length > 0
            ? 'These trips, their itinerary drafts and every expense logged against them will be lost:'
            : 'Any trips, itinerary drafts and expenses saved in this browser will be lost:'}
        </p>
        {trips.length > 0 ? (
          <ul className="mt-3 flex list-none flex-col gap-2">
            {trips.map((trip) => (
              <li key={trip.id} className="flex items-start gap-2 text-body-sm text-ink-muted">
                <Icon name="luggage" size={18} className="mt-0.5 shrink-0 text-ink-subtle" />
                <span>
                  <span className="text-label-lg text-ink">{trip.name}</span>
                  {` \u00b7 ${formatDateRange(trip.startDate, trip.endDate)}, its itinerary draft and logged expenses`}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </Dialog>
    </div>
  )
}
