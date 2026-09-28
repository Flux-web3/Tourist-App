import { useEffect, useId, useMemo, useState, type FormEvent } from 'react'
import { useParams } from 'react-router-dom'
import { AddToTripDialog } from '@/components/AddToTripDialog'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { ButtonLink } from '@/components/ui/ButtonLink'
import { Card, PageHeader } from '@/components/ui/Card'
import { Disclosure } from '@/components/ui/Disclosure'
import { EmptyState, Skeleton } from '@/components/ui/EmptyState'
import { CheckboxChipGroup, NumberField, RadioChipGroup, TextField } from '@/components/ui/Field'
import { Icon, MediaFrame } from '@/components/ui/Icon'
import { CATEGORIES } from '@/data/experiences'
import { formatShortDate } from '@/domain/format'
import { formatPrice } from '@/domain/money'
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
      <Card as="article" className="flex h-full flex-col gap-3">
        <MediaFrame
          src={experience.imageUrl}
          alt={experience.imageAlt}
          ratio="4 / 3"
          rounded="rounded-control"
        />

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
          <p className="mt-1 flex items-start gap-1.5 text-body-md text-ink-muted">
            <Icon name="place" size={16} className="mt-0.5 shrink-0 text-ink-subtle" />
            <span className="min-w-0 break-words">
              {`${experience.neighborhood} · ${experience.city}`}
            </span>
          </p>
        </div>

        <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-body-md">
          <span className="text-label-sm uppercase tracking-wider text-ink-subtle">
            {experience.isFree ? PROTOTYPE_LABEL.estimatedPrice : `${PROTOTYPE_LABEL.estimatedPrice} from`}
          </span>
          <span className="tnum font-semibold text-ink">{price}</span>
        </p>

        <p className="break-words text-body-sm text-ink-subtle">{experience.hoursNote}</p>

        <div className="mt-auto flex flex-col gap-2">
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
                variant="secondary"
                fullWidth
                icon={<Icon name="arrow_forward" size={18} />}
              >
                View details
              </ButtonLink>
            </>
          ) : (
            <ButtonLink
              to={placeHref(experience.id, tripId)}
              variant="primary"
              fullWidth
              icon={<Icon name="arrow_forward" size={18} />}
            >
              View details
            </ButtonLink>
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
  const [filtersOpen, setFiltersOpen] = useState(false)
  const filterPanelId = useId()

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

  /** Filters hidden behind the collapsed control, so closing it never hides state. */
  const hiddenFilterCount =
    (category === 'all' ? 0 : 1) + (freeOnly ? 1 : 0) + (!freeOnly && maxPriceValue > 0 ? 1 : 0)

  const announcement = loading
    ? 'Searching places'
    : results.length === 0
      ? 'No places match those filters'
      : `${results.length} ${results.length === 1 ? 'place' : 'places'}`

  if (tripId && hydrated && !trip) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Explore" description="The curated Paris guide." />
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
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow={trip ? trip.name : PROTOTYPE_LABEL.curatedGuide}
        title="Explore"
        description={
          trip
            ? `Curated Paris places you can add to any day of ${trip.name}.`
            : 'Pick a trip to add places to a day.'
        }
        actions={
          trip ? undefined : (
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
          <p className="min-w-0 text-body-md">
            {`${added.name} was added to Day ${added.day.index} · ${formatShortDate(
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

      <div className="flex flex-col gap-3">
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
              aria-controls={filterPanelId}
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
          <div id={filterPanelId} className="surface-card flex flex-col gap-4 p-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <NumberField
                label="Max price"
                min={0}
                max={500}
                step={1}
                value={maxPriceValue}
                onValueChange={handleMaxPriceChange}
                prefix={'€'}
                suffix="EUR"
                hint="Leave 0 for no upper limit."
              />

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

      <section aria-label="Places" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 className="text-headline-sm">Places</h2>
          <p aria-live="polite" aria-atomic="true" className="tnum text-body-md text-ink-muted">
            {announcement}
          </p>
        </div>

        <Disclosure
          tone="catalog"
          icon="auto_stories"
          summary="Curated demo catalogue, not live data"
        >
          {`Every place here is hand-written prototype data rather than a live listings feed. Prices are estimates, opening hours are typical ranges, and nothing in this prototype can be booked or paid for. ${PROTOTYPE_LABEL.informationMayChange}.`}
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
