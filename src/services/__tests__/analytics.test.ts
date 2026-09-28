import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AnalyticsEventName, AnalyticsService } from '@/services/contracts'
import { createAnalyticsService } from '@/services/analytics'

const FIXED_NOW = new Date('2026-03-15T09:30:00.000Z')
const FIXED_ISO = '2026-03-15T09:30:00.000Z'

const ALL_EVENTS: AnalyticsEventName[] = [
  'signup_completed',
  'trip_created',
  'trip_details_completed',
  'itinerary_generation_started',
  'itinerary_generation_succeeded',
  'itinerary_generation_failed',
  'itinerary_item_edited',
  'itinerary_item_replaced',
  'experience_searched',
  'experience_added',
  'expense_added',
  'trip_saved',
]

function serviceWithSilencedLogs(): AnalyticsService {
  vi.spyOn(console, 'info').mockImplementation(() => undefined)
  return createAnalyticsService()
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(FIXED_NOW)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('createAnalyticsService tracking', () => {
  it('records a known event with its properties', () => {
    const analytics = serviceWithSilencedLogs()

    analytics.track('trip_created', { tripId: 'trip_1', source: 'wizard' })

    const events = analytics.events()
    expect(events).toHaveLength(1)
    expect(events[0]?.event).toBe('trip_created')
    expect(events[0]?.payload).toEqual({ tripId: 'trip_1', source: 'wizard' })
  })

  it('stamps each event', () => {
    const analytics = serviceWithSilencedLogs()

    analytics.track('signup_completed')

    expect(analytics.events()[0]?.at).toBe(FIXED_ISO)
  })

  it('records an event with no properties as an empty payload', () => {
    const analytics = serviceWithSilencedLogs()

    analytics.track('trip_saved')

    expect(analytics.events()[0]?.payload).toEqual({})
  })

  it('keeps the payload types it was handed', () => {
    const analytics = serviceWithSilencedLogs()

    analytics.track('experience_searched', {
      query: 'louvre',
      resultCount: 3,
      cached: false,
      category: null,
    })

    const payload = analytics.events()[0]?.payload
    expect(payload).toEqual({
      query: 'louvre',
      resultCount: 3,
      cached: false,
      category: null,
    })
    expect(typeof payload?.resultCount).toBe('number')
    expect(typeof payload?.cached).toBe('boolean')
    expect(payload?.category).toBeNull()
  })

  it('accumulates repeated events instead of overwriting them', () => {
    const analytics = serviceWithSilencedLogs()

    analytics.track('itinerary_generation_started', { attempt: 1 })
    analytics.track('itinerary_generation_started', { attempt: 2 })
    analytics.track('itinerary_generation_started', { attempt: 3 })

    const events = analytics.events()
    expect(events).toHaveLength(3)
    expect(events.map((entry) => entry.payload.attempt)).toEqual([1, 2, 3])
  })

  it('preserves the order events were tracked in', () => {
    const analytics = serviceWithSilencedLogs()

    analytics.track('trip_created')
    analytics.track('itinerary_generation_started')
    analytics.track('itinerary_generation_succeeded')

    expect(analytics.events().map((entry) => entry.event)).toEqual([
      'trip_created',
      'itinerary_generation_started',
      'itinerary_generation_succeeded',
    ])
  })

  it('accepts every event name in the vocabulary', () => {
    const analytics = serviceWithSilencedLogs()

    for (const event of ALL_EVENTS) {
      analytics.track(event)
    }

    expect(analytics.events().map((entry) => entry.event)).toEqual(ALL_EVENTS)
  })

  it('records an unrecognised event name verbatim because the allow-list is compile time only', () => {
    const analytics = serviceWithSilencedLogs()
    const bogus = 'trip_teleported' as unknown as AnalyticsEventName

    analytics.track(bogus, { tripId: 'trip_1' })

    const events = analytics.events()
    expect(events).toHaveLength(1)
    expect(events[0]?.event).toBe('trip_teleported')
  })

  it('keeps separate service instances separate', () => {
    const first = createAnalyticsService()
    const second = createAnalyticsService()

    first.track('trip_saved')

    expect(first.events()).toHaveLength(1)
    expect(second.events()).toHaveLength(0)
  })
})

describe('createAnalyticsService.events', () => {
  it('starts empty', () => {
    expect(createAnalyticsService().events()).toEqual([])
  })

  it('returns a new array so the log length cannot be changed', () => {
    const analytics = serviceWithSilencedLogs()
    analytics.track('trip_saved')

    const snapshot = analytics.events()
    snapshot.length = 0
    snapshot.push({ event: 'trip_created', payload: {}, at: FIXED_ISO })

    expect(analytics.events()).toHaveLength(1)
    expect(analytics.events()[0]?.event).toBe('trip_saved')
  })

  it('does not let a returned entry rewrite the log', () => {
    const analytics = serviceWithSilencedLogs()
    analytics.track('trip_saved')

    const entry = analytics.events()[0]
    if (!entry) throw new Error('expected a recorded event')
    entry.event = 'expense_added'
    entry.at = '1999-01-01T00:00:00.000Z'

    expect(analytics.events()[0]?.event).toBe('trip_saved')
    expect(analytics.events()[0]?.at).toBe(FIXED_ISO)
  })

  it('does not alias the payload object it was handed', () => {
    const analytics = serviceWithSilencedLogs()
    const payload = { tripId: 'trip_1' }

    analytics.track('trip_created', payload)
    payload.tripId = 'trip_mutated'

    expect(analytics.events()[0]?.payload).toEqual({ tripId: 'trip_1' })
  })

  it('does not let a returned payload rewrite the log', () => {
    const analytics = serviceWithSilencedLogs()
    analytics.track('trip_created', { tripId: 'trip_1', count: 1 })

    const entry = analytics.events()[0]
    if (!entry) throw new Error('expected a recorded event')
    ;(entry.payload as { tripId: string }).tripId = 'trip_hijacked'

    expect(analytics.events()[0]?.payload).toEqual({ tripId: 'trip_1', count: 1 })
  })

  it('gives each recorded event its own payload object', () => {
    const analytics = serviceWithSilencedLogs()
    const shared = { attempt: 1 }

    analytics.track('itinerary_generation_started', shared)
    shared.attempt = 2
    analytics.track('itinerary_generation_started', shared)

    const events = analytics.events()

    expect(events[0]?.payload).toEqual({ attempt: 1 })
    expect(events[1]?.payload).toEqual({ attempt: 2 })
  })
})

describe('createAnalyticsService.clear', () => {
  it('empties the log', () => {
    const analytics = serviceWithSilencedLogs()
    analytics.track('trip_created')
    analytics.track('trip_saved')

    analytics.clear()

    expect(analytics.events()).toEqual([])
  })

  it('lets tracking resume from empty', () => {
    const analytics = serviceWithSilencedLogs()
    analytics.track('trip_created')
    analytics.clear()

    analytics.track('trip_saved')

    expect(analytics.events()).toEqual([
      { event: 'trip_saved', payload: {}, at: FIXED_ISO },
    ])
  })

  it('is a safe no-op on an empty log', () => {
    const analytics = createAnalyticsService()

    expect(() => {
      analytics.clear()
    }).not.toThrow()
    expect(analytics.events()).toEqual([])
  })
})
