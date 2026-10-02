import { AnchorSwapError, buildAlternativeItem, buildItinerary, isTravelAnchor } from './itineraryGenerator'
import type { ItineraryDay, ItineraryItem, Trip } from '@/domain/types'
import type { GenerateOptions, ItineraryService } from './contracts'

const GENERATION_LATENCY_MS = 1400
const ALTERNATIVE_LATENCY_MS = 700

export const GENERATION_ERROR_MESSAGE =
  'We could not draft an itinerary just now. Nothing was changed, so it is safe to try again.'

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

/**
 * Prototype "AI" service. Deterministic output, realistic latency, and a
 * reachable failure path so the loading, success, error and retry states are
 * all demonstrable without a live provider.
 */
export const itineraryService: ItineraryService = {
  async generate(trip: Trip, options: GenerateOptions = {}): Promise<ItineraryDay[]> {
    await delay(GENERATION_LATENCY_MS)
    if (options.shouldFail) {
      throw new Error(GENERATION_ERROR_MESSAGE)
    }
    return buildItinerary(trip, options.variant ?? 0)
  },

  /**
   * Rejects with an `AnchorSwapError` (message `ANCHOR_SWAP_MESSAGE`) for an
   * arrival or departure, and with an Error carrying
   * `NO_ALTERNATIVE_BEFORE_DEPARTURE_MESSAGE` when nothing fits before the
   * departure; both messages are written to be shown as they are. The anchor
   * refusal comes straight away: there is nothing to "think" about, and making
   * the traveller wait for a no would only look like a failure.
   */
  async suggestAlternative({ trip, day, item, days, shouldFail, variant }) {
    if (isTravelAnchor(item)) throw new AnchorSwapError()
    await delay(ALTERNATIVE_LATENCY_MS)
    if (shouldFail) {
      throw new Error(GENERATION_ERROR_MESSAGE)
    }
    return buildAlternativeItem(trip, day, item, variant ?? 0, undefined, days ?? [])
  },
}

export type { ItineraryItem }
