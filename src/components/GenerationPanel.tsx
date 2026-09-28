import { useMemo } from 'react'
import { Alert } from '@/components/ui/Alert'
import { Button, Spinner } from '@/components/ui/Button'
import { Disclosure } from '@/components/ui/Disclosure'
import { Icon } from '@/components/ui/Icon'
import { formatAmount } from '@/domain/money'
import { PROTOTYPE_LABEL } from '@/lib/labels'
import { summariseDraft } from '@/services'
import { useGeneration, useTourist } from '@/state/useTourist'
import type { ItineraryDay, Trip } from '@/domain/types'

/**
 * Generation status for one trip.
 *
 * This deliberately renders nothing at rest. An idle draft needs no commentary,
 * and the previous always-on status card plus explainer pushed the itinerary
 * itself below the fold. Errors and fresh successes still announce themselves,
 * and the standing explanation of where drafts come from now lives in a
 * `Disclosure` beside the regenerate control.
 */
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
    return ''
  })()

  return (
    <div className="flex flex-col gap-3 empty:hidden">
      {/* Always mounted so assistive tech hears the change, visually empty at rest. */}
      <p role="status" aria-live="polite" className="sr-only">
        {liveMessage}
      </p>

      {loading ? (
        <div className="flex items-center gap-2 rounded-control border border-line bg-surface px-4 py-3">
          <Spinner size={18} className="text-ink-muted" />
          <p className="min-w-0 text-body-md text-ink-muted">
            Drafting your itinerary. The days and stops already on screen stay exactly where they
            are.
          </p>
        </div>
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
          } ${draft.itemCount === 1 ? 'stop' : 'stops'} · ${formatAmount(
            draft.estimate,
            trip.currency,
          )} estimated. Every stop stays editable, and anything you add is kept through the next regeneration.`}
        </Alert>
      ) : null}
    </div>
  )
}

/**
 * The standing explanation of where a draft comes from, as one openable line.
 *
 * The claim stays on screen; the reasoning is one tap away.
 */
export function DraftProvenanceNote() {
  return (
    <Disclosure
      tone="ai"
      icon="auto_awesome"
      summary={
        <>
          <strong className="font-semibold">AI draft.</strong> Assembled on this device, not booked.
        </>
      }
    >
      Not a live AI service. The plan is put together in your browser by a deterministic generator
      drawing on the {PROTOTYPE_LABEL.curatedGuide.toLowerCase()} demo catalogue, so nothing leaves
      this device and the same trip always produces the same draft. Every price is an estimate:{' '}
      {PROTOTYPE_LABEL.informationMayChange.toLowerCase()}. Regenerating replaces AI suggestions but
      always keeps stops you added yourself, anything from the curated guide, and anything you have
      edited.
    </Disclosure>
  )
}
