import type { AnalyticsEventName, AnalyticsPayload, AnalyticsService } from './contracts'

/**
 * Typed analytics stub.
 *
 * The prototype records events in memory only. This is the single place to
 * swap in a real provider, and the typed `AnalyticsEventName` union keeps the
 * event vocabulary honest across the app.
 */
export function createAnalyticsService(): AnalyticsService {
  const log: Array<{ event: AnalyticsEventName; payload: AnalyticsPayload; at: string }> = []

  return {
    track(event, payload = {}) {
      log.push({ event, payload: { ...payload }, at: new Date().toISOString() })
      if (import.meta.env.DEV) {
        console.info(`[analytics] ${event}`, payload)
      }
    },
    events: () => log.map((entry) => ({ ...entry, payload: { ...entry.payload } })),
    clear: () => {
      log.length = 0
    },
  }
}
