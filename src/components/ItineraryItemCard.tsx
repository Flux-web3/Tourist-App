import { useId, useState } from 'react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { ButtonLink } from '@/components/ui/ButtonLink'
import { SelectField } from '@/components/ui/Field'
import { Icon } from '@/components/ui/Icon'
import { formatShortDate, formatTime } from '@/domain/format'
import { formatMoney } from '@/domain/money'
import { ITINERARY_CATEGORY_ICON, ITINERARY_CATEGORY_LABEL, PROTOTYPE_LABEL } from '@/lib/labels'
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
}

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
}: ItineraryItemCardProps) {
  const [targetDayId, setTargetDayId] = useState('')
  const titleId = useId()
  const moveRegionId = useId()

  const pending = pendingItemId === item.id
  const swapBlocked = pendingItemId !== null && !pending

  const moveOptions = days
    .map((candidate, position) => ({ candidate, position }))
    .filter((entry) => entry.candidate.id !== day.id)
    .map((entry) => ({
      value: entry.candidate.id,
      label: `Day ${entry.position + 1} · ${formatShortDate(entry.candidate.date)}`,
    }))

  const timeParts = [formatTime(item.startTime), item.endTime ? formatTime(item.endTime) : null]
  const timeRange = timeParts.filter((part) => part !== null).join(' – ')

  return (
    <article aria-labelledby={titleId} className="surface-card p-4">
      <div className="grid gap-3 sm:grid-cols-[auto_1fr_auto] sm:items-start sm:gap-4">
        {timeRange ? (
          <p className="tnum w-fit rounded-badge bg-surface-high px-2 py-1 text-label-md text-ink-muted">
            {timeRange}
          </p>
        ) : null}

        <div className="min-w-0">
          <h4 id={titleId} className="break-words text-label-lg text-ink">
            {item.title}
          </h4>

          <div className="mt-1.5 flex flex-wrap gap-1.5">
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
        </div>

        <div className="sm:text-right">
          <p className="text-label-sm uppercase tracking-wider text-ink-subtle">
            {PROTOTYPE_LABEL.estimatedPrice}
          </p>
          <p className="tnum text-label-lg text-ink">{formatMoney(item.estimatedCost, currency)}</p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
        {item.source === 'catalog' && item.experienceId ? (
          <ButtonLink
            to={`/places/${item.experienceId}`}
            variant="ghost"
            size="sm"
            icon={<Icon name="open_in_new" size={16} />}
          >
            Open in Explore
          </ButtonLink>
        ) : null}

        <Button
          variant="secondary"
          size="sm"
          icon={<Icon name="edit" size={16} />}
          onClick={onEdit}
        >
          Edit
        </Button>

        <Button
          variant="secondary"
          size="sm"
          loading={pending}
          loadingLabel="Swapping"
          disabled={swapBlocked}
          icon={<Icon name="swap_horiz" size={16} />}
          onClick={onReplace}
        >
          Replace
        </Button>

        {moveOptions.length > 0 ? (
          <Button
            variant="ghost"
            size="sm"
            icon={<Icon name="drive_file_move_outline" size={16} />}
            aria-expanded={moving}
            aria-controls={moving ? moveRegionId : undefined}
            onClick={onToggleMove}
          >
            Move
          </Button>
        ) : null}

        <Button
          variant="danger"
          size="sm"
          icon={<Icon name="delete_outline" size={16} />}
          onClick={onRemove}
        >
          Remove
        </Button>
      </div>

      {moving && moveOptions.length > 0 ? (
        <div id={moveRegionId} className="mt-3 w-full sm:w-72">
          <SelectField
            label={`Move ${item.title} to another day`}
            options={moveOptions}
            value={targetDayId}
            placeholder="Choose a day"
            onChange={(event) => {
              const next = event.target.value
              if (next === '') return
              setTargetDayId('')
              onMove(next)
            }}
          />
        </div>
      ) : null}
    </article>
  )
}
