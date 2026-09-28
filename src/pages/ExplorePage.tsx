import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useParams } from 'react-router-dom'
import { AddToTripDialog } from '@/components/AddToTripDialog'
import { Alert } from '@/components/ui/Alert'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { ButtonLink } from '@/components/ui/ButtonLink'
import { Card, CardTitle, PageHeader } from '@/components/ui/Card'
import { EmptyState, Skeleton } from '@/components/ui/EmptyState'
import { CheckboxChipGroup, NumberField, RadioChipGroup, TextField } from '@/components/ui/Field'
import { Icon, MediaFrame } from '@/components/ui/Icon'
import { CATEGORIES } from '@/data/experiences'
import { formatShortDate } from '@/domain/format'
import { formatMoney } from '@/domain/money'
import { ITINERARY_CATEGORY_ICON, ITINERARY_CATEGORY_LABEL, PROTOTYPE_LABEL } from '@/lib/labels'
import { useTourist, useTrip } from '@/state/useTourist'
import type { CatalogQuery } from '@/services/contracts'
import type { Experience, ItineraryCategory, ItineraryDay } from '@/domain/types'

const DEBOUNCE_MS = 200
const SKELETON_COUNT = 6

const FREE_ONLY_OPTIONS: ReadonlyArray<{ value: 'free'; label: string }> = [
  { value: 'free', label: 'Free only' },
]

const FREE_ONLY_SELECTED: readonly 'free'[] = ['free']
const FREE_ONLY_CLEARED: readonly 'free'[] = []

function resolveMaxPrice(freeOnly: boolean, maxPriceValue: number): number | null {
  if (freeOnly) return 0
  return maxPriceValue > 0 ? maxPriceValue : null
}

function placeHref(experienceId: string, tripId: string | undefined): string {
  return tripId ? `/places/${experienceId}?trip=${tripId}` : `/places/${experienceId}`
}

function ExperienceCard({
  experience,
  tripId,
  onAdd,
}: {
  experience: Experience
  tripId: string | undefined
  onAdd: (() => void) | undefined
}) {
  const price = experience.isFree
    ? 'Free'
    : formatMoney(experience.priceFrom, experience.currency, { showCents: false })

  return (
    <li className="list-none">
      <Card as="article" className="flex h-full flex-col gap-3">
        <MediaFrame
          src={experience.imageUrl}
          alt={experience.imageAlt}
          ratio="4 / 3"
          rounded="rounded-control"
        />

        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone="catalog">{PROTOTYPE_LABEL.curatedGuide}</Badge>
          <Badge tone="neutral">{PROTOTYPE_LABEL.catalogDemo}</Badge>
        </div>

        <div>
          <h3 className="text-headline-sm">{experience.name}</h3>
          <p className="mt-1 flex items-center gap-1.5 text-body-md text-ink-muted">
            <Icon name="place" size={16} className="shrink-0 text-ink-subtle" />
            {`${experience.neighborhood} \u00b7 ${experience.city}`}
          </p>
        </div>

        <p className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-body-md">
          <span className="inline-flex items-center gap-1 font-semibold text-ink">
            <Icon name="star" size={16} className="text-terracotta" />
            <span className="tnum">{experience.rating.toFixed(1)}</span>
            <span className="sr-only">out of 5</span>
          </span>
          <span className="tnum text-ink-subtle">{`${experience.reviewCount.toLocaleString('en-GB')} demo reviews`}</span>
          <Badge tone="neutral" icon={<Icon name={ITINERARY_CATEGORY_ICON[experience.category]} size={14} />}>
            {ITINERARY_CATEGORY_LABEL[experience.category]}
          </Badge>
        </p>

        <p className="flex flex-wrap items-baseline gap-x-2 text-body-md">
          <span className="text-label-sm uppercase tracking-wider text-ink-subtle">
            {`${PROTOTYPE_LABEL.estimatedPrice} from`}
          </span>
          <span className="tnum font-semibold text-ink">{price}</span>
        </p>

        <p className="text-body-sm text-ink-subtle">
          {`${experience.hoursNote} \u00b7 ${PROTOTYPE_LABEL.informationMayChange}`}
        </p>

        <div className="mt-auto flex flex-col gap-2">
          <ButtonLink
            to={placeHref(experience.id, tripId)}
            variant="secondary"
            fullWidth
            icon={<Icon name="arrow_forward" size={18} />}
          >
            View details
          </ButtonLink>
          {onAdd ? (
            <Button
              variant="primary"
              fullWidth
              icon={<Icon name="add" size={18} />}
              onClick={onAdd}
            >
              Add to trip
            </Button>
          ) : (
            <>
              <p className="text-body-sm text-ink-subtle">
                Pick a trip first and this place can be dropped straight into an itinerary day.
              </p>
              <ButtonLink
                to="/trips"
                variant="secondary"
                fullWidth
                icon={<Icon name="luggage" size={18} />}
              >
                Choose a trip
              </ButtonLink>
            </>
          )}
        </div>
      </Card>
    </li>
  )
}

function ResultSkeleton() {
  return (
    <li className="list-none">
      <div className="surface-card flex flex-col gap-3 p-5">
        <Skeleton className="aspect-[4/3] w-full" />
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-10 w-full" />
      </div>
    </li>
  )
}

export default function ExplorePage() {
  const { tripId } = useParams<{ tripId?: string }>()
  const { hydrated, actions } = useTourist()
  const trip = useTrip(tripId)

  const [text, setText] = useState('')
  const [debouncedText, setDebouncedText] = useState('')
  const [category, setCategory] = useState<ItineraryCategory | 'all'>('all')
  const [maxPriceValue, setMaxPriceValue] = useState(0)
  const [freeOnly, setFreeOnly] = useState(false)

  const [results, setResults] = useState<Experience[]>([])
  const [loading, setLoading] = useState(true)

  const [addTarget, setAddTarget] = useState<Experience | null>(null)
  const [added, setAdded] = useState<{ name: string; day: ItineraryDay } | null>(null)

  const maxPrice = resolveMaxPrice(freeOnly, maxPriceValue)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedText(text), DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [text])

  const query = useMemo<CatalogQuery>(
    () => ({ text: debouncedText, category, maxPrice }),
    [category, debouncedText, maxPrice],
  )

  useEffect(() => {
    let active = true
    setLoading(true)
    void actions.searchExperiences(query).then((found) => {
      if (!active) return
      setResults(found)
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [actions, query])

  const handleSearchSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    actions.trackSearch({ text, category, maxPrice })
  }

  const handleCategoryChange = (next: ItineraryCategory | 'all') => {
    setCategory(next)
    actions.trackSearch({ text: debouncedText, category: next, maxPrice })
  }

  const handleMaxPriceChange = (next: number) => {
    setMaxPriceValue(next)
    actions.trackSearch({ text: debouncedText, category, maxPrice: resolveMaxPrice(freeOnly, next) })
  }

  const handleFreeOnlyChange = (values: 'free'[]) => {
    const nextFreeOnly = values.includes('free')
    setFreeOnly(nextFreeOnly)
    actions.trackSearch({
      text: debouncedText,
      category,
      maxPrice: resolveMaxPrice(nextFreeOnly, maxPriceValue),
    })
  }

  const clearFilters = () => {
    setText('')
    setDebouncedText('')
    setCategory('all')
    setMaxPriceValue(0)
    setFreeOnly(false)
    actions.trackSearch({ text: '', category: 'all', maxPrice: null })
  }

  const hasFilters = text.trim() !== '' || category !== 'all' || maxPrice !== null

  const announcement = loading
    ? 'Searching places'
    : results.length === 0
      ? 'No places match those filters'
      : `${results.length} ${results.length === 1 ? 'place' : 'places'}`

  if (tripId && hydrated && !trip) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Explore"
          description="The curated Paris guide, with a place for every day of a trip."
        />
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

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={trip ? trip.name : PROTOTYPE_LABEL.curatedGuide}
        title="Explore"
        description={
          trip
            ? `Curated Paris places you can add to ${trip.name}, one day at a time.`
            : 'Browse the curated Paris guide, then pick a trip to drop places straight into an itinerary day.'
        }
      />

      <Alert tone="prototype" title="Curated demo catalogue, not a live listings feed">
        {`Every place here is hand-written prototype data rather than a live listings feed, and every price is an estimate. ${PROTOTYPE_LABEL.informationMayChange}, and nothing in this prototype can be booked or paid for.`}
      </Alert>

      {added && trip ? (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-actual-border bg-actual-bg px-4 py-3 text-actual-ink"
        >
          <p className="min-w-0 text-body-md">
            {`${added.name} was added to Day ${added.day.index} \u00b7 ${formatShortDate(
              added.day.date,
            )} of ${trip.name}.`}
          </p>
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

      <Card>
        <CardTitle hint="Search runs as you type. Results update a moment after you stop.">
          Filter places
        </CardTitle>

        <div className="grid gap-4 sm:grid-cols-2">
          <form
            role="search"
            aria-label="Search places"
            onSubmit={handleSearchSubmit}
            className="sm:col-span-2"
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <TextField
                label="Search places"
                type="search"
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder="museum, canal, market"
                hint="Matches names, summaries, neighbourhoods and tags."
                className="flex-1"
              />
              <Button type="submit" variant="secondary" icon={<Icon name="search" size={18} />}>
                Search
              </Button>
            </div>
          </form>

          <NumberField
            label="Max price"
            min={0}
            max={500}
            step={1}
            value={maxPriceValue}
            onValueChange={handleMaxPriceChange}
            prefix={'\u20ac'}
            suffix="EUR"
            hint="An estimate. Leave 0 for no upper limit."
          />

          <CheckboxChipGroup<'free'>
            legend="Price filters"
            name="explore-free-only"
            options={FREE_ONLY_OPTIONS}
            values={freeOnly ? FREE_ONLY_SELECTED : FREE_ONLY_CLEARED}
            onChange={handleFreeOnlyChange}
          />
        </div>

        <div className="mt-4">
          <RadioChipGroup<ItineraryCategory | 'all'>
            legend="Category"
            name="explore-category"
            value={category}
            options={CATEGORIES}
            onChange={handleCategoryChange}
          />
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4">
          <p className="text-body-sm text-ink-subtle">
            {hasFilters
              ? 'Filters are applied to the guide below.'
              : 'Showing the whole curated guide. No filters applied.'}
          </p>
          <Button
            variant="ghost"
            size="sm"
            icon={<Icon name="filter_alt_off" size={16} />}
            onClick={clearFilters}
            disabled={!hasFilters}
          >
            Clear filters
          </Button>
        </div>
      </Card>

      <section aria-label="Places">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 className="text-headline-sm">Places</h2>
          <p aria-live="polite" aria-atomic="true" className="tnum text-body-md text-ink-muted">
            {announcement}
          </p>
        </div>

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
            description="Try a different search term, another category, or widen the price filter to see more of the guide."
            action={
              hasFilters ? (
                <Button
                  variant="secondary"
                  icon={<Icon name="filter_alt_off" size={18} />}
                  onClick={clearFilters}
                >
                  Clear filters
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
                onAdd={trip ? () => setAddTarget(experience) : undefined}
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
          onAdded={(day) => {
            setAddTarget(null)
            setAdded({ name: addTarget.name, day })
          }}
        />
      ) : null}
    </div>
  )
}
