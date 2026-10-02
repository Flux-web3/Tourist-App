import { useEffect, useId, useMemo, useState, type FormEvent } from 'react'
import { useParams } from 'react-router-dom'
import { AddToTripDialog, type AddedPlace } from '@/components/AddToTripDialog'
import { PlaceImage } from '@/components/PlaceImage'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { ButtonLink } from '@/components/ui/ButtonLink'
import { PageHeader } from '@/components/ui/Card'
import { Disclosure } from '@/components/ui/Disclosure'
import { EmptyState, Skeleton } from '@/components/ui/EmptyState'
import { CheckboxChipGroup, NumberField, RadioChipGroup, TextField } from '@/components/ui/Field'
import { Icon } from '@/components/ui/Icon'
import { getDestination, type Destination } from '@/data/destinations'
import {
  CATEGORIES,
  GUIDE_CITY_LIST,
  GUIDE_DESTINATIONS,
  destinationHasPlaces,
} from '@/data/experiences'
import { formatShortDate, formatTime } from '@/domain/format'
import { CURRENCY_SYMBOLS, formatPrice } from '@/domain/money'
import { ITINERARY_CATEGORY_ICON, ITINERARY_CATEGORY_LABEL, PROTOTYPE_LABEL } from '@/lib/labels'
import { useTourist, useTrip } from '@/state/useTourist'
import type { CatalogQuery } from '@/services/contracts'
import type { Experience, ItineraryCategory, ItineraryDay, Trip } from '@/domain/types'

const DEBOUNCE_MS = 200
const SKELETON_COUNT = 6

/** The price cap's ceiling, in euro-level units, scaled by each city's price level. */
const MAX_PRICE_REFERENCE = 500

const FREE_ONLY_OPTIONS: ReadonlyArray<{ value: 'free'; label: string }> = [
  { value: 'free', label: 'Free only' },
]

const FREE_ONLY_SELECTED: readonly 'free'[] = ['free']
const FREE_ONLY_CLEARED: readonly 'free'[] = []

const ALL_CITIES = 'all'

const CITY_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: ALL_CITIES, label: 'All cities' },
  ...GUIDE_DESTINATIONS.map((destination) => ({ value: destination.id, label: destination.city })),
]

/**
 * A price cap only means something inside one currency: 20 is a lunch in
 * London and a bottle of water in Lagos. With no single city in scope the
 * number is ignored, and the field is not shown at all.
 */
function resolveMaxPrice(
  freeOnly: boolean,
  maxPriceValue: number,
  priced: Destination | null,
): number | null {
  if (freeOnly) return 0
  if (!priced) return null
  return maxPriceValue > 0 ? maxPriceValue : null
}

function placeHref(experienceId: string, tripId: string | undefined): string {
  return tripId ? `/places/${experienceId}?trip=${tripId}` : `/places/${experienceId}`
}

/**
 * One curated place.
 *
 * The catalogue's `rating` and `reviewCount` are invented demo figures, so they
 * are deliberately not rendered: a star and a review count are read as social
 * proof, and there is no proof behind them. Provenance and the estimate marking
 * stay, because those are claims the prototype can actually stand behind.
 */
function ExperienceCard({
  experience,
  tripId,
  onAdd,
}: {
  experience: Experience
  tripId: string | undefined
  onAdd: (() => void) | undefined
}) {
  const price = formatPrice(experience.isFree ? 0 : experience.priceFrom, experience.currency)

  return (
    <li className="list-none">
      <article className="surface-card flex h-full flex-col overflow-hidden">
        <PlaceImage experience={experience} ratio="4 / 3" rounded="rounded-none" />

        <div className="flex flex-1 flex-col gap-3 p-5">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone="catalog" icon={<Icon name="auto_stories" size={14} />}>
              {PROTOTYPE_LABEL.curatedGuide}
            </Badge>
            <Badge tone="neutral" icon={<Icon name={ITINERARY_CATEGORY_ICON[experience.category]} size={14} />}>
              {ITINERARY_CATEGORY_LABEL[experience.category]}
            </Badge>
          </div>

          <div className="min-w-0">
            <h3 className="break-words text-headline-sm">{experience.name}</h3>
            <p className="mt-1 flex items-start gap-1.5 text-body-sm text-ink-muted">
              <Icon name="place" size={16} className="mt-0.5 shrink-0 text-ink-subtle" />
              <span className="min-w-0 break-words">
                {`${experience.neighborhood} · ${experience.city}`}
              </span>
            </p>
          </div>

          <div className="flex flex-col gap-1 border-t border-line pt-3">
            <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="text-label-sm uppercase tracking-wider text-ink-subtle">
                {experience.isFree ? PROTOTYPE_LABEL.estimatedPrice : `${PROTOTYPE_LABEL.estimatedPrice} from`}
              </span>
              <span className="tnum text-headline-sm text-ink">{price}</span>
            </p>
            <p className="break-words text-body-sm text-ink-subtle">{experience.hoursNote}</p>
          </div>

          <div className="mt-auto flex flex-col gap-2 pt-2">
            {onAdd ? (
              <>
                <Button
                  variant="primary"
                  fullWidth
                  icon={<Icon name="add" size={18} />}
                  onClick={onAdd}
                >
                  Add to trip
                </Button>
                <ButtonLink
                  to={placeHref(experience.id, tripId)}
                  variant="ghost"
                  fullWidth
                  icon={<Icon name="arrow_forward" size={18} />}
                >
                  View details
                </ButtonLink>
              </>
            ) : (
              <ButtonLink
                to={placeHref(experience.id, tripId)}
                variant="secondary"
                fullWidth
                icon={<Icon name="arrow_forward" size={18} />}
              >
                View details
              </ButtonLink>
            )}
          </div>
        </div>
      </article>
    </li>
  )
}

function ResultSkeleton() {
  return (
    <li className="list-none">
      <div className="surface-card flex flex-col overflow-hidden">
        <div className="aspect-[4/3] w-full animate-pulse bg-surface-high" aria-hidden="true" />
        <div className="flex flex-col gap-3 p-5">
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-10 w-full" />
        </div>
      </div>
    </li>
  )
}

/**
 * A trip whose destination has no curated places. Says so plainly and never
 * fills the gap with another city's places, which is exactly how a London
 * trip used to end up browsing Paris.
 */
function NoGuideState({ trip, destination }: { trip: Trip; destination: Destination | null }) {
  const title = destination
    ? `Explore is still growing for ${destination.city}`
    : `Explore does not cover ${trip.destination.trim() || 'this destination'} yet`
  const description = destination
    ? `Tourist does not have curated places in ${destination.city} yet, and it will not show places from other cities instead. You can still plan every day of ${trip.name} in the itinerary.`
    : `${trip.name} was saved with a destination the guide does not recognise, so there are no curated places to show, and Tourist will not show places from another city instead. You can still plan every day in the itinerary.`

  return (
    <EmptyState
      icon="travel_explore"
      headingLevel={2}
      title={title}
      description={description}
      action={
        <ButtonLink
          to={`/trips/${trip.id}/itinerary`}
          variant="primary"
          icon={<Icon name="calendar_month" size={18} />}
        >
          Open itinerary
        </ButtonLink>
      }
    />
  )
}

/**
 * Explore is keyed on the trip and its destination, so moving from one trip to
 * another (the route param changes, the page does not unmount) starts from a
 * clean slate: no previous trip's results, price cap in the wrong currency,
 * half-open add dialog or "added to" banner can carry over.
 */
export default function ExplorePage() {
  const { tripId } = useParams<{ tripId?: string }>()
  const trip = useTrip(tripId)
  return <ExploreView key={`${tripId ?? 'guide'}:${trip?.destinationId ?? ''}`} tripId={tripId} />
}

function ExploreView({ tripId }: { tripId: string | undefined }) {
  const { hydrated, actions } = useTourist()
  const trip = useTrip(tripId)

  const [text, setText] = useState('')
  const [debouncedText, setDebouncedText] = useState('')
  const [category, setCategory] = useState<ItineraryCategory | 'all'>('all')
  const [maxPriceValue, setMaxPriceValue] = useState(0)
  const [freeOnly, setFreeOnly] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  /** The general guide's city choice. Inside a trip the trip decides. */
  const [guideCity, setGuideCity] = useState<string>(ALL_CITIES)
  const filterPanelId = useId()

  const [response, setResponse] = useState<{ query: CatalogQuery; results: Experience[] } | null>(null)

  const [addTarget, setAddTarget] = useState<Experience | null>(null)
  const [added, setAdded] = useState<{ name: string; day: ItineraryDay; place: AddedPlace } | null>(null)

  // The trip's destination is the only source of truth for what Explore shows
  // inside a trip; the general guide lets the traveller pick a city.
  const tripDestination = trip ? getDestination(trip.destinationId) : null
  const tripHasGuide = trip ? destinationHasPlaces(trip.destinationId) : false
  const scopeDestinationId: string | null | undefined = tripId
    ? trip && tripHasGuide
      ? trip.destinationId
      : undefined
    : guideCity === ALL_CITIES
      ? null
      : guideCity
  // `undefined` means "nothing to search": a trip still loading, gone, or
  // without a guide. Never null, which would be every city's places.
  const searchable = scopeDestinationId !== undefined
  const pricedDestination = getDestination(scopeDestinationId ?? null)

  const maxPrice = resolveMaxPrice(freeOnly, maxPriceValue, pricedDestination)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedText(text), DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [text])

  const query = useMemo<CatalogQuery | null>(
    () =>
      scopeDestinationId === undefined
        ? null
        : { text: debouncedText, category, maxPrice, destinationId: scopeDestinationId },
    [category, debouncedText, maxPrice, scopeDestinationId],
  )

  useEffect(() => {
    if (!query) return
    let active = true
    void actions.searchExperiences(query).then((found) => {
      if (!active) return
      setResponse({ query, results: found })
    })
    return () => {
      active = false
    }
  }, [actions, query])

  // Results only count for the query that produced them, so a response for an
  // earlier query (another city, older text) is never on screen.
  const current = query !== null && response?.query === query ? response : null
  // Before hydration a trip page has nothing to search yet; it is loading, not empty.
  const loading = current === null && (searchable || !hydrated)
  const results = current?.results ?? []

  const track = (next: Omit<CatalogQuery, 'destinationId'>) => {
    actions.trackSearch({ ...next, destinationId: scopeDestinationId ?? null })
  }

  const handleSearchSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    track({ text, category, maxPrice })
  }

  const handleCategoryChange = (next: ItineraryCategory | 'all') => {
    setCategory(next)
    track({ text: debouncedText, category: next, maxPrice })
  }

  const handleMaxPriceChange = (next: number) => {
    setMaxPriceValue(next)
    track({
      text: debouncedText,
      category,
      maxPrice: resolveMaxPrice(freeOnly, next, pricedDestination),
    })
  }

  const handleFreeOnlyChange = (values: 'free'[]) => {
    const nextFreeOnly = values.includes('free')
    setFreeOnly(nextFreeOnly)
    track({
      text: debouncedText,
      category,
      maxPrice: resolveMaxPrice(nextFreeOnly, maxPriceValue, pricedDestination),
    })
  }

  const handleGuideCityChange = (next: string) => {
    setGuideCity(next)
    // A cap typed in one city's currency is meaningless in another's.
    setMaxPriceValue(0)
    const nextDestination = getDestination(next === ALL_CITIES ? null : next)
    actions.trackSearch({
      text: debouncedText,
      category,
      maxPrice: resolveMaxPrice(freeOnly, 0, nextDestination),
      destinationId: next === ALL_CITIES ? null : next,
    })
  }

  const clearFilters = () => {
    setText('')
    setDebouncedText('')
    setCategory('all')
    setMaxPriceValue(0)
    setFreeOnly(false)
    track({ text: '', category: 'all', maxPrice: null })
  }

  const hasFilters = text.trim() !== '' || category !== 'all' || maxPrice !== null

  /** Filters hidden behind the collapsed control, so closing it never hides state. */
  const hiddenFilterCount =
    (category === 'all' ? 0 : 1) +
    (freeOnly ? 1 : 0) +
    (!freeOnly && pricedDestination && maxPriceValue > 0 ? 1 : 0)

  const announcement = loading
    ? 'Searching places'
    : results.length === 0
      ? 'No places match those filters'
      : `${results.length} ${results.length === 1 ? 'place' : 'places'}`

  if (tripId && hydrated && !trip) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Explore" description={`Curated places in ${GUIDE_CITY_LIST}.`} />
        <EmptyState
          icon="search_off"
          title="We could not find that trip"
          description="It may have been deleted, or the link is out of date. Your other trips are still saved on this device."
          action={
            <ButtonLink
              to="/explore"
              variant="primary"
              icon={<Icon name="travel_explore" size={18} />}
            >
              Explore without a trip
            </ButtonLink>
          }
        />
      </div>
    )
  }

  if (trip && !tripHasGuide) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          eyebrow={trip.name}
          title="Explore"
          description={`Curated guides cover ${GUIDE_CITY_LIST} so far.`}
        />
        <NoGuideState trip={trip} destination={tripDestination} />
      </div>
    )
  }

  const currency = pricedDestination?.currency
  const currencySymbol = currency ? CURRENCY_SYMBOLS[currency] : undefined

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={trip ? trip.name : PROTOTYPE_LABEL.curatedGuide}
        title="Explore"
        description={
          trip && tripDestination
            ? `Curated ${tripDestination.city} places you can add to any day of ${trip.name}.`
            : tripId
              ? undefined
              : `Curated places in ${GUIDE_CITY_LIST}. Pick a trip to add places to a day.`
        }
        actions={
          tripId ? undefined : (
            <ButtonLink to="/trips" variant="secondary" icon={<Icon name="luggage" size={18} />}>
              Choose a trip
            </ButtonLink>
          )
        }
      />

      {added && trip ? (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-actual-border bg-actual-bg px-4 py-3 text-actual-ink"
        >
          <div className="min-w-0">
            <p className="text-body-md">
              {`${added.name} was added to Day ${added.day.index} · ${formatShortDate(
                added.day.date,
              )} of ${trip.name}.`}
            </p>
            {added.place.suggested ? (
              <p className="mt-1 text-body-sm">
                {`Tourist suggested the ${formatTime(added.place.startTime) ?? added.place.startTime} start; you can change it in the itinerary.`}
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

      <div className="surface-card flex flex-col gap-4 p-4 sm:p-5">
        {tripId ? null : (
          <RadioChipGroup<string>
            legend="City"
            name="explore-city"
            value={guideCity}
            options={CITY_OPTIONS}
            onChange={handleGuideCityChange}
          />
        )}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <form
            role="search"
            aria-label="Search places"
            onSubmit={handleSearchSubmit}
            className="min-w-0 flex-1"
          >
            <TextField
              label="Search places"
              type="search"
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="Name, neighbourhood or tag"
            />
          </form>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              icon={<Icon name="tune" size={18} />}
              aria-expanded={filtersOpen}
              // The panel is only in the page while it is open, so the id only names something then.
              aria-controls={filtersOpen ? filterPanelId : undefined}
              onClick={() => setFiltersOpen((open) => !open)}
            >
              {hiddenFilterCount > 0 ? `Filters (${hiddenFilterCount})` : 'Filters'}
            </Button>
            {hasFilters ? (
              <Button
                variant="ghost"
                icon={<Icon name="filter_alt_off" size={18} />}
                onClick={clearFilters}
              >
                Clear filters
              </Button>
            ) : null}
          </div>
        </div>

        {filtersOpen ? (
          <div id={filterPanelId} className="flex flex-col gap-4 border-t border-line pt-4">
            <div className="grid gap-4 sm:grid-cols-2">
              {pricedDestination && currency ? (
                <NumberField
                  label="Max price"
                  min={0}
                  max={Math.round(MAX_PRICE_REFERENCE * pricedDestination.priceLevel)}
                  step={pricedDestination.priceStep}
                  value={maxPriceValue}
                  onValueChange={handleMaxPriceChange}
                  prefix={currencySymbol !== currency ? currencySymbol : undefined}
                  suffix={currency}
                  hint="Leave 0 for no upper limit."
                />
              ) : (
                <p className="text-body-sm text-ink-muted">
                  Pick a city to cap places by price. Each city is priced in its own currency, so
                  one cap cannot cover them all.
                </p>
              )}

              <CheckboxChipGroup<'free'>
                legend="Price filters"
                name="explore-free-only"
                options={FREE_ONLY_OPTIONS}
                values={freeOnly ? FREE_ONLY_SELECTED : FREE_ONLY_CLEARED}
                onChange={handleFreeOnlyChange}
              />
            </div>

            <RadioChipGroup<ItineraryCategory | 'all'>
              legend="Category"
              name="explore-category"
              value={category}
              options={CATEGORIES}
              onChange={handleCategoryChange}
            />
          </div>
        ) : null}
      </div>

      <section aria-label="Places" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 className="text-headline-md">Places</h2>
          <p aria-live="polite" aria-atomic="true" className="tnum text-body-md text-ink-muted">
            {announcement}
          </p>
        </div>

        <Disclosure
          tone="catalog"
          icon="auto_stories"
          summary="Curated demo catalogue, not live data"
        >
          {`Every place here is hand-written prototype data rather than a live listings feed. Prices are estimates in each city's own currency, opening hours are typical ranges, and nothing in this prototype can be booked or paid for. ${PROTOTYPE_LABEL.informationMayChange}.`}
        </Disclosure>

        {loading ? (
          <ul
            aria-hidden="true"
            className="grid list-none grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
          >
            {Array.from({ length: SKELETON_COUNT }, (_, index) => (
              <ResultSkeleton key={`skeleton-${index}`} />
            ))}
          </ul>
        ) : results.length === 0 ? (
          <EmptyState
            icon="search_off"
            title="No places match those filters"
            description="The rest of the guide is still here. Try a shorter search, another category, or a higher price cap."
            action={
              hasFilters ? (
                <Button
                  variant="secondary"
                  icon={<Icon name="filter_alt_off" size={18} />}
                  onClick={clearFilters}
                >
                  Show the whole guide
                </Button>
              ) : undefined
            }
          />
        ) : (
          <ul className="grid list-none grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {results.map((experience) => (
              <ExperienceCard
                key={experience.id}
                experience={experience}
                tripId={trip?.id}
                onAdd={
                  trip && experience.destinationId === trip.destinationId
                    ? () => setAddTarget(experience)
                    : undefined
                }
              />
            ))}
          </ul>
        )}
      </section>

      {trip && addTarget ? (
        <AddToTripDialog
          trip={trip}
          experience={addTarget}
          onClose={() => setAddTarget(null)}
          onAdded={(day, place) => {
            setAddTarget(null)
            setAdded({ name: addTarget.name, day, place })
          }}
        />
      ) : null}
    </div>
  )
}
