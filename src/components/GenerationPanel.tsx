import { useMemo } from 'react'
import { Alert } from '@/components/ui/Alert'
import { Button, Spinner } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { formatMoney } from '@/domain/money'
import { PROTOTYPE_LABEL } from '@/lib/labels'
import { summariseDraft } from '@/services'
import { useGeneration, useTourist } from '@/state/useTourist'
import type { ItineraryDay, Trip } from '@/domain/types'

const FAILURE_OPTIONS: ReadonlyArray<{ value: 'safe' | 'fail'; label: string }> = [
  { value: 'safe', label: 'No failure' },
  { value: 'fail', label: 'Fail next run' },
]

const FAILURE_LABEL = 'Simulate a failure on the next generation (prototype)'

export function PrototypeFailureSwitch({ tripId }: { tripId: string }) {
  const { actions } = useTourist()
  const generation = useGeneration(tripId)

  return (
    <div className="flex flex-col items-start gap-1.5 rounded-control border border-line-strong bg-surface-low px-3 py-2">
      <span className="text-label-sm uppercase tracking-wider text-ink-subtle">Prototype</span>
      <SegmentedControl
        size="sm"
        label={FAILURE_LABEL}
        value={generation.shouldFail ? 'fail' : 'safe'}
        onChange={(value) => actions.setSimulateFailure(tripId, value === 'fail')}
        options={FAILURE_OPTIONS}
      />
      <span className="max-w-56 text-body-sm text-ink-muted">{FAILURE_LABEL}</span>
    </div>
  )
}

export function GenerationPanel({ trip, days }: { trip: Trip; days: ItineraryDay[] }) {
  const { actions } = useTourist()
  const generation = useGeneration(trip.id)
  const draft = useMemo(() => summariseDraft(days), [days])
  const loading = generation.status === 'loading'

  const liveMessage = (() => {
    if (loading) return 'Drafting your itinerary…'
    if (generation.status === 'error') {
      return 'The itinerary draft could not be generated. The plan you already had is untouched.'
    }
    if (generation.status === 'success') return 'Your itinerary draft is ready.'
    if (draft.itemCount > 0) return 'This plan is saved on this device. Nothing is being generated right now.'
    return 'No draft has been generated for this trip yet.'
  })()

  return (
    <div className="flex flex-col gap-3">
      <div
        role="status"
        aria-live="polite"
        className="flex items-center gap-2 rounded-control border border-line bg-surface px-4 py-3"
      >
        {loading ? (
          <Spinner size={18} className="text-ink-muted" />
        ) : (
          <Icon
            name={generation.status === 'error' ? 'error_outline' : 'auto_awesome'}
            size={18}
            className={generation.status === 'error' ? 'text-danger' : 'text-ink-subtle'}
          />
        )}
        <p className="min-w-0 text-body-md text-ink-muted">{liveMessage}</p>
      </div>

      {loading ? (
        <p className="text-body-sm text-ink-subtle">
          The days and stops already on screen stay exactly where they are while the new draft is
          prepared.
        </p>
      ) : null}

      {generation.status === 'error' ? (
        <Alert
          tone="danger"
          title="The itinerary draft could not be generated"
          action={
            <Button
              variant="secondary"
              size="sm"
              icon={<Icon name="refresh" size={16} />}
              onClick={() => {
                void actions.retryGeneration(trip.id)
              }}
            >
              Try again
            </Button>
          }
        >
          {`${
            generation.error ?? 'Something went wrong while drafting your itinerary.'
          } Nothing was changed: the days, stops and prices you already have were left exactly as they were.`}
        </Alert>
      ) : null}

      {generation.status === 'success' ? (
        <Alert tone="success" title="Your draft is ready">
          {`${draft.dayCount} ${draft.dayCount === 1 ? 'day' : 'days'} · ${
            draft.itemCount
          } ${draft.itemCount === 1 ? 'stop' : 'stops'} · ${formatMoney(
            draft.estimate,
            trip.currency,
          )} estimated. Every stop stays editable, and anything you add is kept through the next regeneration.`}
        </Alert>
      ) : null}

      <Alert tone="prototype" title="These drafts come from a local prototype generator">
        {`Not a live AI service. The plan is assembled in your browser by a deterministic mock with realistic latency, drawing on the ${PROTOTYPE_LABEL.curatedGuide.toLowerCase()} demo catalogue, so nothing leaves this device and every draft is reproducible. Treat each price as an estimate: ${PROTOTYPE_LABEL.informationMayChange.toLowerCase()}.`}
      </Alert>
    </div>
  )
}
