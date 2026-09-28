import { useEffect, useMemo, useState } from 'react'
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
 *
 * At rest the wrapper carries no margin either, so a quiet panel costs the
 * itinerary no vertical space at all.
 */
export function GenerationPanel({ trip, days }: { trip: Trip; days: ItineraryDay[] }) {
  const { actions } = useTourist()
  const generation = useGeneration(trip.id)
  const draft = useMemo(() => summariseDraft(days, trip.currency), [days, trip.currency])
  const loading = generation.status === 'loading'
  const failed = generation.status === 'error'

  /**
   * `status: 'success'` is persisted, so a trip drafted last week would reopen
   * on last week's confirmation banner instead of on its itinerary. The banner
   * is only worth a line of the screen to someone who watched the draft being
   * made in this session.
   */
  const [watchedRun, setWatchedRun] = useState(false)
  useEffect(() => {
    if (loading) setWatchedRun(true)
  }, [loading])
  const succeeded = generation.status === 'success' && watchedRun

  const liveMessage = (() => {
    if (loading) return 'Drafting your itinerary…'
    if (failed) {
      return 'The itinerary draft could not be generated. The plan you already had is untouched.'
    }
    if (generation.status === 'success') return 'Your itinerary draft is ready.'
    return ''
  })()

  return (
    <div className={loading || failed || succeeded ? 'mb-4 flex flex-col gap-3' : ''}>
      {/* Always mounted so assistive tech hears the change, visually empty at rest. */}
      <p role="status" aria-live="polite" className="sr-only">
        {liveMessage}
      </p>

      {loading ? (
        <div className="flex items-center gap-2 rounded-control border border-line bg-surface px-4 py-3">
          <Spinner size={18} className="text-ink-muted" />
          <p className="min-w-0 text-body-md text-ink-muted">
            Drafting your itinerary. Nothing already on your plan will be moved or removed.
          </p>
        </div>
      ) : null}

      {failed ? (
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
          } The days, stops and prices you already have were left exactly as they were.`}
        </Alert>
      ) : null}

      {succeeded ? (
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
 * The claim stays on screen; the reasoning is one tap away. Both of the essays
 * that used to sit above the itinerary live here — where the draft comes from,
 * and what a regeneration will and will not touch — because the second one is
 * the reassurance that makes the regenerate control safe to press, not a
 * paragraph anyone needs to re-read on every visit.
 */
export function DraftProvenanceNote() {
  return (
    <Disclosure
      tone="ai"
      icon="auto_awesome"
      summary={
        <>
          <strong className="font-semibold">{PROTOTYPE_LABEL.aiDraft}.</strong> Made on this device,
          not booked. Regenerating keeps your edits.
        </>
      }
    >
      <p>
        Not a live AI service. The plan is put together in your browser by a deterministic generator
        drawing on the {PROTOTYPE_LABEL.curatedGuide.toLowerCase()} demo catalogue, so nothing leaves
        this device and the same trip always produces the same draft. Every price is an estimate:{' '}
        {PROTOTYPE_LABEL.informationMayChange.toLowerCase()}.
      </p>
      <p className="mt-2">
        <strong className="font-semibold">Regenerating never takes your own work away.</strong> It
        replaces {PROTOTYPE_LABEL.aiDraft} suggestions, but it always keeps the activities you added
        yourself, the {PROTOTYPE_LABEL.catalogDemo.toLowerCase()} items from the{' '}
        {PROTOTYPE_LABEL.curatedGuide.toLowerCase()}, and anything you have edited. Use Replace on a
        single stop when you only want one thing to change.
      </p>
    </Disclosure>
  )
}
