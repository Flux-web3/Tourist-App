import { useEffect, useState, type ReactNode } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { AddToTripDialog, type AddedPlace } from '@/components/AddToTripDialog'
import { PlaceImage } from '@/components/PlaceImage'
import { Alert } from '@/components/ui/Alert'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { ButtonLink } from '@/components/ui/ButtonLink'
import { Card, CardTitle, PageHeader } from '@/components/ui/Card'
import { Disclosure } from '@/components/ui/Disclosure'
import { EmptyState, Skeleton } from '@/components/ui/EmptyState'
import { Icon } from '@/components/ui/Icon'
import { getDestination } from '@/data/destinations'
import { formatDuration, formatShortDate, formatTime } from '@/domain/format'
import { formatPrice } from '@/domain/money'
import { ITINERARY_CATEGORY_LABEL, PROTOTYPE_LABEL } from '@/lib/labels'
import { useTourist, useTrip } from '@/state/useTourist'
import type { Experience, ItineraryDay } from '@/domain/types'

type LoadStatus = 'loading' | 'ready' | 'missing'

const NO_BOOKING = 'No booking or payment in this prototype.'

function DetailFact({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 border-b border-line pb-3 last:border-b-0">
      <dt className="text-label-sm uppercase tracking-wider text-ink-subtle">{term}</dt>
      <dd className="break-words text-body-md text-ink">{children}</dd>
    </div>
  )
}

function LoadingView() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <p role="status" className="sr-only">
        Loading place details
      </p>
      <Skeleton className="h-11 w-40" />
      <div className="aspect-video w-full animate-pulse rounded-sheet bg-surface-high" aria-hidden="true" />
      <div className="flex flex-col gap-4">
        <Skeleton className="h-10 w-3/4" />
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-4/5" />
      </div>
    </div>
  )
}

function MissingView({ backHref }: { backHref: string }) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Explore"
        title="We could not find that place"
        description="The place may have been renamed, or the link is out of date. The rest of the curated guide is still there."
      />
      <EmptyState
        icon="search_off"
        title="Nothing matches that place id"
        description="The curated guide is a fixed set of demo records, so there is no live search behind it."
        action={
          <ButtonLink
            to={backHref}
            variant="primary"
            icon={<Icon name="arrow_back" size={18} />}
          >
            Back to explore
          </ButtonLink>
        }
      />
    </div>
  )
}

export default function PlaceDetailsPage() {
  const { experienceId } = useParams<{ experienceId: string }>()
  const [searchParams] = useSearchParams()
  const tripParam = searchParams.get('trip')
  const { hydrated, actions } = useTourist()
  const trip = useTrip(tripParam ?? undefined)

  const [experience, setExperience] = useState<Experience | null>(null)
  const [status, setStatus] = useState<LoadStatus>('loading')
  const [addOpen, setAddOpen] = useState(false)
  const [addedDay, setAddedDay] = useState<ItineraryDay | null>(null)
  const [addedPlace, setAddedPlace] = useState<AddedPlace | null>(null)

  useEffect(() => {
    let active = true
    if (!experienceId) {
      setExperience(null)
      setStatus('missing')
      return
    }
    setStatus('loading')
    setExperience(null)
    void actions.getExperience(experienceId).then((found) => {
      if (!active) return
      setExperience(found)
      setStatus(found ? 'ready' : 'missing')
    })
    return () => {
      active = false
    }
  }, [actions, experienceId])

  const backHref = tripParam ? `/trips/${tripParam}/explore?trip=${tripParam}` : '/explore'

  if (status === 'loading') return <LoadingView />
  if (status === 'missing' || !experience) return <MissingView backHref={backHref} />

  // `rating` and `reviewCount` exist on the record but are invented demo
  // figures, so this page never renders them as stars or a review count.
  const price = formatPrice(experience.isFree ? 0 : experience.priceFrom, experience.currency)
  const tripMissing = Boolean(tripParam) && hydrated && !trip
  // A place only goes into a trip to its own city. A legacy trip with no
  // catalogue destination (null) never matches, rather than being assumed to
  // be wherever this place happens to be.
  const tripMatches = trip ? trip.destinationId === experience.destinationId : false
  const tripDestinationName = trip
    ? (getDestination(trip.destinationId)?.city ?? (trip.destination.trim() || 'another destination'))
    : ''

  return (
    <div className="flex flex-col gap-6">
      <ButtonLink
        to={backHref}
        variant="ghost"
        icon={<Icon name="arrow_back" size={18} />}
        className="-ml-3 self-start"
      >
        Back to explore
      </ButtonLink>

      <div className="grid gap-6 lg:grid-cols-3 lg:items-start">
        <div className="flex min-w-0 flex-col gap-6 lg:col-span-2">
          {/* The place leads: its photograph, or the drawn cover when Tourist has none. */}
          <figure className="flex flex-col">
            <PlaceImage experience={experience} ratio="16 / 9" rounded="rounded-sheet" loading="eager" />
            {experience.imageCredit ? (
              <figcaption className="mt-3 break-words text-body-sm text-ink-subtle">
                {`Photo: ${experience.imageCredit.author} · `}
                <a
                  href={experience.imageCredit.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="font-semibold text-navy underline underline-offset-2 hover:text-navy-hover"
                >
                  {`${experience.imageCredit.license} source on Wikimedia Commons`}
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              </figcaption>
            ) : null}
          </figure>

          <div className="flex flex-col gap-4">
            <PageHeader
              eyebrow={ITINERARY_CATEGORY_LABEL[experience.category]}
              title={experience.name}
              description={experience.summary}
              actions={
                <Badge tone="catalog" icon={<Icon name="auto_stories" size={14} />}>
                  {PROTOTYPE_LABEL.curatedGuide}
                </Badge>
              }
            />

            <p className="flex flex-wrap items-center gap-x-4 gap-y-2 text-body-md text-ink-muted">
              <span className="inline-flex min-w-0 items-start gap-1.5">
                <Icon name="place" size={16} className="mt-0.5 shrink-0 text-ink-subtle" />
                <span className="min-w-0 break-words">
                  {`${experience.neighborhood} · ${experience.city}, ${experience.country}`}
                </span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Icon name="schedule" size={16} className="shrink-0 text-ink-subtle" />
                {formatDuration(experience.durationMinutes)}
              </span>
            </p>
          </div>

          <Disclosure
            tone="catalog"
            icon="auto_stories"
            summary="Curated demo record, not a live listing"
          >
            {`This record is hand-written prototype data, not a live listing. Prices are estimates and opening hours are typical ranges rather than live availability, and there is no map behind this page. ${PROTOTYPE_LABEL.informationMayChange}.`}
          </Disclosure>

          {addedDay && trip ? (
            <div
              role="status"
              className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-actual-border bg-actual-bg px-4 py-3 text-actual-ink"
            >
              <div className="min-w-0">
                <p className="text-body-md">
                  {`${experience.name} was added to Day ${addedDay.index} · ${formatShortDate(
                    addedDay.date,
                  )} of ${trip.name}.`}
                </p>
                {addedPlace?.suggested ? (
                  <p className="mt-1 text-body-sm">
                    {`Tourist suggested the ${formatTime(addedPlace.startTime) ?? addedPlace.startTime} start; you can change it in the itinerary.`}
                  </p>
                ) : null}
              </div>
              <ButtonLink
                to={`/trips/${trip.id}/itinerary`}
                size="sm"
                variant="secondary"
                icon={<Icon name="calendar_month" size={16} />}
              >
                Open itinerary
              </ButtonLink>
            </div>
          ) : null}

          {tripMissing ? (
            <Alert
              tone="warning"
              title="That trip is no longer on this device"
              action={
                <ButtonLink to="/trips" size="sm" variant="secondary" icon={<Icon name="luggage" size={16} />}>
                  Choose a trip
                </ButtonLink>
              }
            >
              Pick a trip and the add-to-itinerary action comes back.
            </Alert>
          ) : null}

          <Card>
            <CardTitle>About this place</CardTitle>
            <p className="text-body-lg text-ink-muted">{experience.description}</p>
            <ul className="mt-4 flex list-none flex-wrap gap-2">
              {experience.tags.map((tag) => (
                <li key={tag} className="list-none">
                  <span className="inline-flex max-w-full items-center gap-1.5 rounded-pill border border-line bg-surface-low px-3 py-1 text-label-md text-ink-muted">
                    <Icon name="sell" size={14} className="shrink-0 text-ink-subtle" />
                    <span className="min-w-0 break-words">{tag}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <CardTitle hint={PROTOTYPE_LABEL.informationMayChange}>Good to know</CardTitle>
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
              <DetailFact term="Opening hours">{experience.hoursNote}</DetailFact>
              <DetailFact term="Best time to go">{experience.bestTime}</DetailFact>
              <DetailFact term="Time needed on site">
                {formatDuration(experience.durationMinutes)}
              </DetailFact>
            </dl>
          </Card>
        </div>

        <div className="flex flex-col gap-4 lg:col-span-1">
          <Card as="aside" className="flex flex-col gap-4">
            <div className="rounded-control border border-line bg-surface-low p-4">
              <p className="text-label-sm uppercase tracking-wider text-ink-subtle">
                {experience.isFree
                  ? PROTOTYPE_LABEL.estimatedPrice
                  : `${PROTOTYPE_LABEL.estimatedPrice} from`}
              </p>
              <p className="tnum mt-1 text-headline-md">{price}</p>
              <p className="mt-1 text-body-sm text-ink-subtle">
                {experience.isFree
                  ? PROTOTYPE_LABEL.informationMayChange
                  : `${experience.currency} · ${PROTOTYPE_LABEL.informationMayChange}`}
              </p>
            </div>

            {trip && !tripMatches ? (
              <>
                <p className="text-body-sm text-ink-muted">
                  {`${experience.name} is in ${experience.city}, and ${trip.name} is going to ${tripDestinationName}, so it cannot be added to that trip.`}
                </p>
                <ButtonLink
                  to={`/trips/${trip.id}/explore`}
                  variant="secondary"
                  fullWidth
                  icon={<Icon name="travel_explore" size={18} />}
                >
                  {`Explore places for ${trip.name}`}
                </ButtonLink>
              </>
            ) : trip ? (
              <Button
                variant="primary"
                fullWidth
                icon={<Icon name="add" size={18} />}
                onClick={() => setAddOpen(true)}
              >
                Add to trip
              </Button>
            ) : (
              <>
                <p className="text-body-sm text-ink-muted">
                  Pick a trip to drop this place into a day.
                </p>
                <ButtonLink
                  to="/trips"
                  variant="primary"
                  fullWidth
                  icon={<Icon name="luggage" size={18} />}
                >
                  Choose a trip
                </ButtonLink>
              </>
            )}

            <p className="text-body-sm text-ink-subtle">{NO_BOOKING}</p>
          </Card>
        </div>
      </div>

      {trip && tripMatches && addOpen ? (
        <AddToTripDialog
          trip={trip}
          experience={experience}
          onClose={() => setAddOpen(false)}
          onAdded={(day, place) => {
            setAddOpen(false)
            setAddedDay(day)
            setAddedPlace(place)
          }}
        />
      ) : null}
    </div>
  )
}
