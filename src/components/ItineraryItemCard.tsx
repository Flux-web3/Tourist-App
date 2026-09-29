import { useEffect, useId, useRef, useState } from 'react'
import { ActionMenu, type ActionMenuItem } from '@/components/ui/ActionMenu'
import { Badge } from '@/components/ui/Badge'
import { Button, Spinner } from '@/components/ui/Button'
import { ButtonLink } from '@/components/ui/ButtonLink'
import { SelectField } from '@/components/ui/Field'
import { Icon } from '@/components/ui/Icon'
import { formatShortDate, formatTime } from '@/domain/format'
import { formatPrice, toCents } from '@/domain/money'
import {
  ITINERARY_CATEGORY_ICON,
  ITINERARY_CATEGORY_LABEL,
  PROTOTYPE_LABEL,
  TRAVEL_ROLE_LABEL,
} from '@/lib/labels'
import type { CurrencyCode, ItineraryDay, ItineraryItem } from '@/domain/types'

interface ItineraryItemCardProps {
  item: ItineraryItem
  day: ItineraryDay
  days: readonly ItineraryDay[]
  currency: CurrencyCode
  pendingItemId: string | null
  moving: boolean
  onToggleMove: () => void
  onEdit: () => void
  onReplace: () => void
  onMove: (dayId: string) => void
  onRemove: () => void
  /** The stop starts at or after this day's departure, so it cannot happen as planned. */
  afterDeparture?: boolean
}

/**
 * One stop on the itinerary.
 *
 * Edit, Replace, Move and Remove used to be four visible buttons on every card,
 * so a week-long plan put roughly ninety buttons on one page and the stops
 * themselves stopped being the thing you read. They now sit behind a single
 * overflow menu per card, named after the stop so twenty-two of them are
 * distinguishable to a screen reader. Nothing was dropped: every action is one
 * tap away, and the catalogue link stays a real link.
 *
 * The price keeps its estimate marking, but as a compact `≈ €24` figure rather
 * than an ESTIMATED PRICE caption above it, and a free stop reads `Free`
 * instead of `€0.00 EUR`, which looked like missing data.
 *
 * An arrival or departure is travel, not sightseeing, so it is marked as such
 * and offers no Replace: swapping the way into or out of the city for a museum
 * is never what the traveller meant. Edit, Move and Remove stay, because the
 * real booking may differ from the draft. Stops from drafts saved before roles
 * existed have no role and behave as any other stop.
 */
export function ItineraryItemCard({
  item,
  day,
  days,
  currency,
  pendingItemId,
  moving,
  onToggleMove,
  onEdit,
  onReplace,
  onMove,
  onRemove,
  afterDeparture = false,
}: ItineraryItemCardProps) {
  const [targetDayId, setTargetDayId] = useState('')
  const titleId = useId()
  const movePanelRef = useRef<HTMLDivElement>(null)

  const travelRole = item.role === 'arrival' || item.role === 'departure' ? item.role : null
  // Tourist has no ticket time, so a drafted travel stop's time is a guess
  // until the traveller edits it; after that it is their time, not ours.
  const placeholderTime = travelRole !== null && !item.editedByUser
  const pending = pendingItemId === item.id
  const swapBlocked = pendingItemId !== null && !pending

  const moveOptions = days
    .map((candidate, position) => ({ candidate, position }))
    .filter((entry) => entry.candidate.id !== day.id)
    .map((entry) => ({
      value: entry.candidate.id,
      label: `Day ${entry.position + 1} · ${formatShortDate(entry.candidate.date)}`,
    }))

  /**
   * The menu hands focus back to its trigger when a row is chosen, so the day
   * picker it reveals has to claim focus itself or a keyboard user would have to
   * hunt for it.
   */
  useEffect(() => {
    if (moving) movePanelRef.current?.querySelector('select')?.focus()
  }, [moving])

  const timeParts = [formatTime(item.startTime), item.endTime ? formatTime(item.endTime) : null]
  const timeRange = timeParts.filter((part) => part !== null).join(' – ')

  const free = toCents(item.estimatedCost) === 0
  /*
   * Priced in the item's own currency, not the trip's. A stop saved from the
   * catalogue into a naira trip is still a euro price, and formatting it with
   * the trip currency is exactly the bug that relabelled €22 as ₦22.
   */
  const price = formatPrice(item.estimatedCost, item.currency)
  const foreign = !free && item.currency !== currency

  const actions: ActionMenuItem[] = [
    { label: 'Edit', icon: 'edit', onSelect: onEdit },
    ...(travelRole
      ? []
      : [
          {
            label: pending ? 'Swapping' : 'Replace',
            icon: 'swap_horiz',
            onSelect: onReplace,
            disabled: pending || swapBlocked,
          },
        ]),
    ...(moveOptions.length > 0
      ? [
          {
            label: 'Move to another day',
            icon: 'drive_file_move_outline',
            onSelect: onToggleMove,
          },
        ]
      : []),
    { label: 'Remove', icon: 'delete_outline', onSelect: onRemove, destructive: true },
  ]

  return (
    <article
      aria-labelledby={titleId}
      aria-busy={pending || undefined}
      className="surface-card p-4"
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {timeRange ? (
              <p className="tnum rounded-badge bg-surface-high px-2 py-0.5 text-label-md text-ink-muted">
                {timeRange}
                {/* Said at the time itself: a note at the end of the description was easy to miss. */}
                {placeholderTime ? <span className="text-ink-subtle"> (placeholder)</span> : null}
              </p>
            ) : null}

            <p className="tnum text-label-md text-ink-muted">
              <span className="sr-only">{`${PROTOTYPE_LABEL.estimatedPrice}: `}</span>
              {free ? price : `≈ ${price}`}
              {foreign ? (
                <span className="text-ink-subtle">{` ${item.currency} · not in the ${currency} total`}</span>
              ) : null}
            </p>

            {pending ? (
              <p
                role="status"
                className="inline-flex items-center gap-1.5 rounded-badge border border-ai-border bg-ai-bg px-2 py-0.5 text-label-md text-ai-ink"
              >
                <Spinner size={12} />
                Swapping
              </p>
            ) : null}
          </div>

          <h4 id={titleId} className="mt-1.5 break-words text-label-lg text-ink">
            {item.title}
          </h4>

          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {travelRole ? (
              <Badge
                tone="planned"
                icon={<Icon name={travelRole === 'arrival' ? 'flight_land' : 'flight_takeoff'} size={14} />}
              >
                {TRAVEL_ROLE_LABEL[travelRole]}
              </Badge>
            ) : null}
            {afterDeparture ? (
              <Badge tone="danger" icon={<Icon name="schedule" size={14} />}>
                After your departure
              </Badge>
            ) : null}
            <Badge
              tone="neutral"
              icon={<Icon name={ITINERARY_CATEGORY_ICON[item.category]} size={14} />}
            >
              {ITINERARY_CATEGORY_LABEL[item.category]}
            </Badge>
            {item.source === 'ai' ? (
              <Badge tone="ai" icon={<Icon name="auto_awesome" size={14} />}>
                {PROTOTYPE_LABEL.aiDraft}
              </Badge>
            ) : null}
            {item.source === 'catalog' ? (
              <Badge tone="catalog" icon={<Icon name="storefront" size={14} />}>
                {PROTOTYPE_LABEL.catalogDemo}
              </Badge>
            ) : null}
            {item.source === 'user' ? (
              <Badge tone="neutral" icon={<Icon name="person" size={14} />}>
                Added by you
              </Badge>
            ) : null}
            {item.editedByUser ? (
              <Badge tone="accent" icon={<Icon name="edit" size={14} />}>
                Edited
              </Badge>
            ) : null}
          </div>

          {travelRole ? (
            <p className="mt-2 text-body-sm text-ink-subtle">
              {placeholderTime
                ? `Placeholder time: Tourist does not know your flight or train. Edit this stop to your real ${travelRole} time. It is never swapped for an activity.`
                : 'Travel stop, timed by you. It is never swapped for an activity.'}
            </p>
          ) : null}

          {item.location ? (
            <p className="mt-2 flex items-start gap-1.5 text-body-sm text-ink-muted">
              <Icon name="place" size={16} className="mt-0.5 shrink-0 text-ink-subtle" />
              <span className="min-w-0 break-words">{item.location}</span>
            </p>
          ) : null}

          {item.description ? (
            <p className="mt-1.5 break-words text-body-sm text-ink-muted">{item.description}</p>
          ) : null}

          {item.notes ? (
            <p className="mt-1.5 break-words text-body-sm text-ink-subtle">
              <span className="font-semibold">Note:</span> {item.notes}
            </p>
          ) : null}

          {item.source === 'catalog' && item.experienceId ? (
            <ButtonLink
              to={`/places/${item.experienceId}`}
              variant="ghost"
              icon={<Icon name="open_in_new" size={16} />}
              className="-ml-3 mt-1"
            >
              Open in Explore
            </ButtonLink>
          ) : null}
        </div>

        <div className="shrink-0">
          <ActionMenu label={`Actions for ${item.title}`} items={actions} />
        </div>
      </div>

      {moving && moveOptions.length > 0 ? (
        <div ref={movePanelRef} className="mt-3 flex flex-wrap items-end gap-2">
          <SelectField
            label={`Move ${item.title} to another day`}
            options={moveOptions}
            value={targetDayId}
            placeholder="Choose a day"
            className="min-w-0 flex-1 sm:max-w-72"
            onChange={(event) => {
              const next = event.target.value
              if (next === '') return
              setTargetDayId('')
              onMove(next)
            }}
          />
          <Button variant="ghost" onClick={onToggleMove}>
            Cancel
          </Button>
        </div>
      ) : null}
    </article>
  )
}
