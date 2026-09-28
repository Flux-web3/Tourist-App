import { describe, expect, it } from 'vitest'
import { eachDay } from '@/domain/format'
import type { ItineraryDay, Trip } from '@/domain/types'
import { buildItinerary } from '@/services/itineraryGenerator'

const START = '2026-04-01'
/** Inclusive, so this is the 30-day worst case the template bank has to cover. */
const LONG_END = '2026-04-30'

const TRIP: Trip = {
  id: 'trip_generator_fixture',
  userId: 'usr_fixture',
  name: 'Paris in the Spring',
  origin: 'Lagos, Nigeria',
  destination: 'Paris, France',
  startDate: START,
  endDate: LONG_END,
  travelers: 2,
  budget: 2500,
  currency: 'EUR',
  interests: ['culture', 'food'],
  pace: 'packed',
  notes: '',
  status: 'draft',
  createdAt: '2026-03-15T09:30:00.000Z',
  updatedAt: '2026-03-15T09:30:00.000Z',
}

const TIMESTAMP = '2026-03-15T09:30:01.400Z'

/** Ids carry a counter and a random suffix, so compare everything else. */
function project(days: readonly ItineraryDay[]): unknown[] {
  return days.map((day) => ({
    date: day.date,
    index: day.index,
    title: day.title,
    items: day.items.map((item) => ({
      title: item.title,
      category: item.category,
      startTime: item.startTime,
      endTime: item.endTime,
      location: item.location,
      description: item.description,
      estimatedCost: item.estimatedCost,
      source: item.source,
      editedByUser: item.editedByUser,
    })),
  }))
}

function daysWithInternalDuplicate(days: readonly ItineraryDay[]): string[] {
  return days
    .filter((day) => {
      const titles = day.items.map((item) => item.title)
      return new Set(titles).size !== titles.length
    })
    .map((day) => day.date)
}

describe('buildItinerary', () => {
  it('covers every trip date', () => {
    const days = buildItinerary(TRIP, 0, TIMESTAMP)

    expect(days).toHaveLength(30)
    expect(days.map((day) => day.date)).toEqual(eachDay(START, LONG_END))
  })

  it('never repeats a template inside a single day at the worst case', () => {
    const days = buildItinerary(TRIP, 0, TIMESTAMP)

    expect(daysWithInternalDuplicate(days)).toEqual([])
  })

  it('never repeats a template inside a single day for any variant or pace', () => {
    for (const pace of ['relaxed', 'balanced', 'packed'] as const) {
      for (const variant of [0, 1, 2, 3, 4, 5, 6, 7]) {
        const days = buildItinerary({ ...TRIP, pace }, variant, TIMESTAMP)

        expect(daysWithInternalDuplicate(days), `pace=${pace} variant=${variant}`).toEqual([])
      }
    }
  })

  it('never repeats a template inside a single day for a generic destination', () => {
    const days = buildItinerary({ ...TRIP, destination: 'Lisbon, Portugal' }, 0, TIMESTAMP)

    expect(daysWithInternalDuplicate(days)).toEqual([])
  })

  it('stays deterministic for the same trip and variant', () => {
    const first = buildItinerary(TRIP, 0, TIMESTAMP)
    const second = buildItinerary(TRIP, 0, TIMESTAMP)

    expect(project(second)).toEqual(project(first))
  })

  it('stays deterministic for an explicit variant', () => {
    const first = buildItinerary(TRIP, 3, TIMESTAMP)
    const second = buildItinerary(TRIP, 3, TIMESTAMP)

    expect(project(second)).toEqual(project(first))
  })

  it('still fills a long trip rather than running out of stops', () => {
    const days = buildItinerary(TRIP, 0, TIMESTAMP)

    for (const day of days) {
      expect(day.items.length).toBeGreaterThan(0)
    }
    expect(days.reduce((total, day) => total + day.items.length, 0)).toBeGreaterThan(100)
  })
})
