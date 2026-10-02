import { useCallback, useState } from 'react'
import { ActionMenu } from '@/components/ui/ActionMenu'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { ButtonLink } from '@/components/ui/ButtonLink'
import { Card, PageHeader } from '@/components/ui/Card'
import { TripCover } from '@/components/ui/TripCover'
import { Dialog } from '@/components/ui/Dialog'
import { Disclosure } from '@/components/ui/Disclosure'
import { EmptyState, Skeleton } from '@/components/ui/EmptyState'
import { Icon, MediaFrame } from '@/components/ui/Icon'
import { destinationPhoto } from '@/data/destinationPhotos'
import { formatDateRange, tripLengthInDays } from '@/domain/format'
import { formatAmount } from '@/domain/money'
import { PROTOTYPE_LABEL } from '@/lib/labels'
import { DEMO_TRIP_ID } from '@/services/persistence'
import { selectTripSummary } from '@/state/selectors'
import { useTourist, useTrips } from '@/state/useTourist'
import type { Trip } from '@/domain/types'

type TripSummary = ReturnType<typeof selectTripSummary>

/**
 * The demo trip is opt-in now, so once it is in the list it sits beside trips
 * the traveller really planned. It has to say what it is on every surface it
 * appears on, or sample data quietly starts reading as real.
 */
function countLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`
}

function isSampleTrip(trip: Trip): boolean {
  return trip.id === DEMO_TRIP_ID
}

function BudgetFigure({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'danger' }) {
  return (
    // Stacked as label-and-figure rows on a narrow phone, three columns once
    // there is room, so a six-figure amount is never squeezed or clipped.
    <div className="flex min-w-0 items-baseline justify-between gap-3 rounded-control bg-surface px-2.5 py-2 min-[26rem]:block">
      <p className="text-label-sm uppercase tracking-wider text-ink-subtle">{label}</p>
      <p className={`tnum min-w-0 break-words text-headline-sm min-[26rem]:mt-0.5 ${tone === 'danger' ? 'text-danger' : 'text-ink'}`}>
        {value}
      </p>
    </div>
  )
}

function TripCard({ trip, summary }: { trip: Trip; summary: TripSummary }) {
  const { itemCount, actualSpent, remaining } = summary
  const overBudget = remaining < 0
  const length = tripLengthInDays(trip.startDate, trip.endDate)
  const ready = trip.status === 'itinerary_ready'
  // Only a destination Tourist holds a licensed photograph of gets one; every
  // other trip keeps the drawn cover, never a picture of somewhere else.
  const photo = destinationPhoto(trip.destinationId)

  return (
    <li className="list-none">
      <Card as="article" className="flex h-full flex-col gap-4 overflow-hidden">
        {/*
          The cover runs edge to edge across the top of the card, the way the
          landing page opens on a picture. Trips go wherever the traveller types
          and Tourist has photographs of exactly one city, so a trip to
          anywhere else gets a drawing seeded from its destination, never a
          stock photo implying knowledge the product lacks. Same destination,
          same cover, which is what makes a trip recognisable in a list.

          Capped, not just proportional: a 21/9 cover on a wide card is tall
          enough to swamp the trip it introduces. Both the photo and the drawing
          crop from the centre, so the cap loses nothing important.
        */}
        <div className="-mx-5 -mt-5 flex flex-col">
          {photo ? (
            <MediaFrame
              src={photo.src}
              alt={photo.alt}
              ratio="21 / 9"
              rounded="rounded-none"
              className="max-h-36 sm:max-h-40"
            />
          ) : (
            <TripCover
              destination={trip.destination}
              ratio="21 / 9"
              rounded="rounded-none"
              className="max-h-36 sm:max-h-40"
            />
          )}
          {photo ? (
            <p className="border-b border-line bg-surface-low px-5 py-2 text-label-md text-ink-subtle">
              {photo.caption}
              {photo.credit ? `. Photo by ${photo.credit.author} (${photo.credit.license}).` : '.'}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-3">
          <div className="min-w-0">
            <h2 className="text-headline-md">{trip.name}</h2>
            <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-body-md text-ink-muted">
              <Icon name="flight_takeoff" size={16} className="text-ink-subtle" />
              <span>{trip.origin}</span>
              <Icon name="arrow_forward" size={14} className="text-ink-subtle" />
              <span className="sr-only">to</span>
              <span>{trip.destination}</span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {isSampleTrip(trip) ? (
              <Badge tone="catalog" icon={<Icon name="science" size={14} />}>
                {PROTOTYPE_LABEL.sampleTrip}
              </Badge>
            ) : null}
            <Badge
              tone={ready ? 'actual' : 'ai'}
              icon={<Icon name={ready ? 'task_alt' : 'auto_awesome'} size={14} />}
            >
              {ready ? 'Itinerary ready' : 'Itinerary not generated'}
            </Badge>
          </div>
        </div>

        <ul className="flex list-none flex-wrap items-center gap-x-3 gap-y-1 text-body-sm text-ink-muted">
          <li className="tnum flex items-center gap-1.5">
            <Icon name="calendar_month" size={16} className="text-ink-subtle" />
            {formatDateRange(trip.startDate, trip.endDate)}
          </li>
          <li className="tnum flex items-center gap-1.5">
            <Icon name="hourglass_bottom" size={16} className="text-ink-subtle" />
            {countLabel(length, 'day', 'days')}
          </li>
          <li className="flex items-center gap-1.5">
            <Icon name="group" size={16} className="text-ink-subtle" />
            {countLabel(trip.travelers, 'traveller', 'travellers')}
          </li>
          <li className="flex items-center gap-1.5">
            <Icon name="pin_drop" size={16} className="text-ink-subtle" />
            {itemCount > 0
              ? countLabel(itemCount, 'planned stop', 'planned stops')
              : 'No planned stops yet'}
          </li>
        </ul>

        {/*
          The three figures stay separate on purpose: a ceiling, what has
          actually been spent and what is left are different kinds of fact. The
          currency is stated once for the card instead of against each number.
        */}
        <div className="rounded-control border border-line bg-surface-low p-2.5">
          <p className="flex items-baseline justify-between gap-2 px-1 text-label-sm uppercase tracking-wider text-ink-subtle">
            <span>Budget</span>
            <span className="tnum">{trip.currency}</span>
          </p>
          <div className="mt-1.5 grid grid-cols-1 gap-1.5 min-[26rem]:grid-cols-3">
            <BudgetFigure label={PROTOTYPE_LABEL.tripBudget} value={formatAmount(trip.budget, trip.currency)} />
            <BudgetFigure label={PROTOTYPE_LABEL.actualSpent} value={formatAmount(actualSpent, trip.currency)} />
            <BudgetFigure
              label={PROTOTYPE_LABEL.remaining}
              value={formatAmount(remaining, trip.currency)}
              tone={overBudget ? 'danger' : 'default'}
            />
          </div>
          {overBudget ? (
            <p className="mt-1.5 flex items-center justify-center gap-1 text-body-sm text-danger">
              <Icon name="warning" size={16} />
              {`Over budget by ${formatAmount(Math.abs(remaining), trip.currency)}`}
            </p>
          ) : null}
        </div>

        <div className="mt-auto flex flex-col gap-2">
          <ButtonLink
            to={`/trips/${trip.id}`}
            fullWidth
            variant="primary"
            iconAfter={<Icon name="arrow_forward" size={18} />}
          >
            Overview
          </ButtonLink>
          <div className="grid grid-cols-2 gap-2">
            <ButtonLink
              to={`/trips/${trip.id}/itinerary`}
              size="sm"
              fullWidth
              variant="secondary"
              icon={<Icon name="calendar_month" size={16} />}
            >
              Itinerary
            </ButtonLink>
            <ButtonLink
              to={`/trips/${trip.id}/budget`}
              size="sm"
              fullWidth
              variant="secondary"
              icon={<Icon name="account_balance_wallet" size={16} />}
            >
              Budget
            </ButtonLink>
          </div>
        </div>
      </Card>
    </li>
  )
}

function TripCardSkeleton() {
  return (
    <li className="list-none">
      <div className="surface-card flex flex-col gap-4 p-5">
        <Skeleton className="h-28 w-full" />
        <div className="flex items-start justify-between gap-3">
          <Skeleton className="h-7 w-48 max-w-full" />
        </div>
        <Skeleton className="h-4 w-64 max-w-full" />
        <Skeleton className="h-4 w-72 max-w-full" />
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

  const addSampleTrip = useCallback(() => {
    actions.loadDemoData()
    setStatus('The sample trip has been added to your trips.')
  }, [actions])

  const confirmClear = useCallback(() => {
    actions.clearAllData()
    setConfirmOpen(false)
    setStatus('All saved trips, itineraries and expenses have been cleared.')
  }, [actions])

  const hasSampleTrip = trips.some(isSampleTrip)
  const isEmpty = hydrated && trips.length === 0

  return (
    <div className="flex flex-col gap-6">
      {/*
        The traveller's trips are the page. The device-storage claim and the
        sample-data and reset controls used to sit above them, which turned the
        home screen into an admin panel: the reset in particular was a one-tap
        text link that wiped everything. It now lives in a deliberate overflow
        menu behind a confirmation, and the storage claim is one line you can
        open, at the foot of the page.
      */}
      <PageHeader
        eyebrow="Trips"
        title="Your trips"
        actions={
          <div className="flex items-center gap-2">
            {isEmpty ? null : (
              <ButtonLink to="/trips/new" variant="primary" icon={<Icon name="add_location_alt" size={20} />}>
                Plan a new trip
              </ButtonLink>
            )}
            <ActionMenu
              label="Sample data and reset options"
              items={[
                {
                  label: hasSampleTrip ? 'Sample trip already added' : 'Add the sample trip',
                  icon: 'science',
                  disabled: hasSampleTrip,
                  onSelect: addSampleTrip,
                },
                {
                  label: 'Clear all data on this device',
                  icon: 'delete_sweep',
                  destructive: true,
                  disabled: trips.length === 0,
                  onSelect: () => setConfirmOpen(true),
                },
              ]}
            />
          </div>
        }
      />

      {!hydrated ? (
        <ul className="grid list-none gap-5 md:grid-cols-2">
          <TripCardSkeleton />
          <TripCardSkeleton />
        </ul>
      ) : trips.length === 0 ? (
        <EmptyState
          icon="luggage"
          title="Plan your first trip"
          description="Tell Tourist where you are going and it drafts a day-by-day itinerary, prices every stop as an estimate, then tracks what you actually spend against it."
          action={
            <div className="mt-1 flex w-full max-w-xs flex-col gap-2">
              <ButtonLink
                to="/trips/new"
                variant="primary"
                size="lg"
                fullWidth
                icon={<Icon name="add_location_alt" size={20} />}
              >
                Plan a trip
              </ButtonLink>
              <Button
                variant="ghost"
                fullWidth
                icon={<Icon name="science" size={18} />}
                onClick={addSampleTrip}
              >
                Look around a sample trip
              </Button>
            </div>
          }
        />
      ) : (
        <ul className="grid list-none gap-5 md:grid-cols-2">
          {trips.map((trip) => (
            <TripCard key={trip.id} trip={trip} summary={selectTripSummary(state, trip)} />
          ))}
        </ul>
      )}

      <p aria-live="polite" className="sr-only">
        {status}
      </p>

      <Disclosure tone="catalog" icon="smartphone" summary={PROTOTYPE_LABEL.localOnly}>
        <p>
          {`${PROTOTYPE_LABEL.noAccount}, and nothing is sent to a server. Your trips, itinerary drafts, expenses and notes live in this browser's storage, so they are gone if you clear site data, and they are not there if you open Tourist on another device.`}
        </p>
        <p className="mt-2">Itinerary drafts and prices are estimates, not bookings.</p>
      </Disclosure>

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
                  {` · ${formatDateRange(trip.startDate, trip.endDate)}, its itinerary draft and logged expenses`}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </Dialog>
    </div>
  )
}
