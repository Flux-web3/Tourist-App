import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { eachDay } from '@/domain/format'
import type { ItineraryDay, ItineraryItem, Trip } from '@/domain/types'
import type { GenerateOptions, ItineraryService } from '@/services/contracts'
import {
  GENERATION_ERROR_MESSAGE,
  itineraryService,
} from '@/services/itineraryService'
import { buildItinerary } from '@/services/itineraryGenerator'

const FIXED_NOW = new Date('2026-03-15T09:30:00.000Z')
const START = '2026-04-01'
const END = '2026-04-05'
const TRIP: Trip = {
  id: 'trip_itinerary_fixture',
  userId: 'usr_fixture',
  name: 'Paris in the Spring',
  origin: 'Lagos, Nigeria',
  destination: 'Paris, France',
  startDate: START,
  endDate: END,
  travelers: 2,
  budget: 2500,
  currency: 'EUR',
  interests: ['culture', 'food'],
  pace: 'balanced',
  notes: '',
  status: 'draft',
  createdAt: '2026-03-15T09:30:00.000Z',
  updatedAt: '2026-03-15T09:30:00.000Z',
}

type AlternativeInput = Parameters<ItineraryService['suggestAlternative']>[0]

const GENERATION_WAIT_MS = 5000
const ALTERNATIVE_WAIT_MS = 5000
const GENERATION_LATENCY_MS = 1400
const GENERATED_AT = new Date(FIXED_NOW.getTime() + GENERATION_LATENCY_MS).toISOString()

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

function titlesOf(days: readonly ItineraryDay[]): string[] {
  return days.flatMap((day) => day.items.map((item) => item.title))
}

async function generateNow(
  trip: Trip,
  options?: GenerateOptions,
): Promise<ItineraryDay[]> {
  const pending = itineraryService.generate(trip, options)
  void pending.catch(() => undefined)
  await vi.advanceTimersByTimeAsync(GENERATION_WAIT_MS)
  return pending
}

async function alternativeNow(input: AlternativeInput): Promise<ItineraryItem> {
  const pending = itineraryService.suggestAlternative(input)
  void pending.catch(() => undefined)
  await vi.advanceTimersByTimeAsync(ALTERNATIVE_WAIT_MS)
  return pending
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(FIXED_NOW)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('itineraryService.generate', () => {
  it('resolves with one day per trip date', async () => {
    const days = await generateNow(TRIP)

    expect(days).toHaveLength(5)
    expect(days.map((day) => day.date)).toEqual(eachDay(START, END))
  })

  it('numbers the days from one', async () => {
    const days = await generateNow(TRIP)

    expect(days[0]?.index).toBe(1)
    expect(days.map((day) => day.index)).toEqual([1, 2, 3, 4, 5])
  })

  it('keys every day off the trip id', async () => {
    const days = await generateNow(TRIP)

    expect(days.map((day) => day.id)).toEqual([
      `${TRIP.id}_d1`,
      `${TRIP.id}_d2`,
      `${TRIP.id}_d3`,
      `${TRIP.id}_d4`,
      `${TRIP.id}_d5`,
    ])
    for (const day of days) {
      expect(day.tripId).toBe(TRIP.id)
    }
  })

  it('gives every day at least one item', async () => {
    const days = await generateNow(TRIP)

    for (const day of days) {
      expect(day.items.length).toBeGreaterThan(0)
    }
  })

  it('stamps every item with the trip and the ai source', async () => {
    const days = await generateNow(TRIP)

    for (const day of days) {
      for (const item of day.items) {
        expect(item.tripId).toBe(TRIP.id)
        expect(item.source).toBe('ai')
        expect(item.editedByUser).toBe(false)
        expect(item.id.length).toBeGreaterThan(0)
        expect(item.createdAt).toBe(GENERATED_AT)
      }
    }
  })

  it('is deterministic for the same trip', async () => {
    const first = await generateNow(TRIP)
    const second = await generateNow(TRIP)

    expect(project(second)).toEqual(project(first))
  })

  it('is deterministic for an explicit variant', async () => {
    const first = await generateNow(TRIP, { variant: 2 })
    const second = await generateNow(TRIP, { variant: 2 })

    expect(project(second)).toEqual(project(first))
  })

  it('is deterministic for a differently shaped but equally seeded trip', async () => {
    const clone: Trip = { ...TRIP, travelers: 4, budget: 4000 }

    const first = await generateNow(TRIP)
    const second = await generateNow(clone)

    expect(project(second)).toEqual(project(first))
  })

  it('produces a different plan for different interests', async () => {
    const foodTrip: Trip = { ...TRIP, interests: ['food'] }
    const nightlifeTrip: Trip = { ...TRIP, interests: ['nightlife'] }

    const foodPlan = titlesOf(await generateNow(foodTrip))
    const nightlifePlan = titlesOf(await generateNow(nightlifeTrip))

    expect(foodPlan).not.toEqual(nightlifePlan)
    expect(foodPlan.some((title) => /breakfast|market|bistro|picnic|café|terrace/.test(title))).toBe(
      true,
    )
    expect(nightlifePlan.some((title) => /wine|theatre|jazz|bar/.test(title))).toBe(true)
  })

  it('anchors the first day on arrival', async () => {
    const days = await generateNow(TRIP)

    expect(days[0]?.items.map((item) => item.title)).toContain(
      'Arrive, drop bags, and walk the neighbourhood',
    )
  })

  it('gives the last day a real departure instead of the final template', async () => {
    const days = await generateNow(TRIP)
    const lastDay = days[days.length - 1]
    const titles = lastDay?.items.map((item) => item.title) ?? []

    expect(titles).toContain('Check out, last coffee, and head for the airport')
    expect(titles.join(' ')).not.toMatch(/jazz/i)
  })

  it('opens the last day with the departure so the airport is the morning plan', async () => {
    const days = await generateNow(TRIP)

    const first = days[days.length - 1]?.items[0]

    expect(first?.category).toBe('transit')
    expect(first?.startTime).toBe('08:00')
    expect(first?.location).toMatch(/Charles de Gaulle/i)
  })

  it('never reuses the arrival or departure template as a mid-trip filler', async () => {
    const arrival = 'Arrive, drop bags, and walk the neighbourhood'
    const departure = 'Check out, last coffee, and head for the airport'

    for (const variant of [0, 1, 2, 3, 4, 5, 6, 7]) {
      const days = buildItinerary(TRIP, variant)
      const lastIndex = days.length - 1
      const middle = days
        .filter((_, index) => index > 0 && index < lastIndex)
        .flatMap((day) => day.items)
        .map((item) => item.title)

      expect(middle).not.toContain(arrival)
      expect(middle).not.toContain(departure)
    }
  })

  it('keeps a one-day trip on the arrival anchor without inventing a departure', async () => {
    const singleDay: Trip = { ...TRIP, startDate: '2026-04-10', endDate: '2026-04-10' }

    const days = await generateNow(singleDay)

    expect(days).toHaveLength(1)
    expect(days[0]?.items.map((item) => item.title)).toContain(
      'Arrive, drop bags, and walk the neighbourhood',
    )
  })

  it('anchors the last day on departure when the bank has one', async () => {
    const days = await generateNow({ ...TRIP, destination: 'Lisbon, Portugal' })

    expect(days[days.length - 1]?.items.map((item) => item.title)).toContain(
      'Last look, then head out',
    )
  })

  it('falls back to generic wording for a destination with no landmark bank', async () => {
    const days = await generateNow({ ...TRIP, destination: 'Lisbon, Portugal' })

    const titles = titlesOf(days)
    expect(titles).toContain('Arrive and settle in')
    expect(titles.some((title) => /Louvre|Orsay|Seine cruise|Versailles/.test(title))).toBe(false)
  })

  it('packs a packed pace tighter than a relaxed one', async () => {
    const relaxed = await generateNow({ ...TRIP, pace: 'relaxed' })
    const packed = await generateNow({ ...TRIP, pace: 'packed' })

    const count = (days: readonly ItineraryDay[]): number =>
      days.reduce((total, day) => total + day.items.length, 0)

    expect(count(packed)).toBeGreaterThan(count(relaxed))
  })

  it('handles a single day trip', async () => {
    const days = await generateNow({ ...TRIP, startDate: START, endDate: START })

    expect(days).toHaveLength(1)
    expect(days[0]?.items.length).toBeGreaterThan(0)
  })

  it('sorts every day chronologically', async () => {
    const days = await generateNow({ ...TRIP, pace: 'packed' })

    for (const day of days) {
      const starts = day.items.map((item) => item.startTime)
      expect([...starts].sort()).toEqual(starts)
    }
  })

  it('rejects with a non-empty message when shouldFail is set', async () => {
    const outcome = await generateNow(TRIP, { shouldFail: true }).catch((reason: unknown) => reason)

    expect(outcome).toBeInstanceOf(Error)
    const error = outcome as Error
    expect(error.message).toBe(GENERATION_ERROR_MESSAGE)
    expect(error.message.length).toBeGreaterThan(0)
  })

  it('does not resolve with a plan when shouldFail is set', async () => {
    const pending = itineraryService.generate(TRIP, { shouldFail: true })
    void pending.catch(() => undefined)

    await vi.advanceTimersByTimeAsync(GENERATION_WAIT_MS)

    await expect(pending).rejects.toThrow(GENERATION_ERROR_MESSAGE)
  })

  it('ignores shouldFail when it is false', async () => {
    const days = await generateNow(TRIP, { shouldFail: false })

    expect(days).toHaveLength(5)
  })
})

describe('itineraryService.suggestAlternative', () => {
  async function seedAlternative(): Promise<{ day: ItineraryDay; item: ItineraryItem }> {
    const days = await generateNow(TRIP)
    for (const day of days) {
      for (const item of day.items) {
        if (item.category === 'culture' || item.category === 'food') {
          return { day, item }
        }
      }
    }
    throw new Error('fixture trip produced no culture or food item')
  }

  it('suggests a different title for the same slot', async () => {
    const { day, item } = await seedAlternative()

    const replacement = await alternativeNow({ trip: TRIP, day, item })

    expect(replacement.title).not.toBe(item.title)
    expect(replacement.title.length).toBeGreaterThan(0)
  })

  it('keeps the original time slot', async () => {
    const { day, item } = await seedAlternative()

    const replacement = await alternativeNow({ trip: TRIP, day, item })

    expect(replacement.startTime).toBe(item.startTime)
    expect(replacement.endTime).toBe(item.endTime)
  })

  it('keeps the item on the same trip and in the same category', async () => {
    const { day, item } = await seedAlternative()

    const replacement = await alternativeNow({ trip: TRIP, day, item })

    expect(replacement.tripId).toBe(TRIP.id)
    expect(replacement.category).toBe(item.category)
  })

  it('returns a fresh ai item rather than mutating the original', async () => {
    const { day, item } = await seedAlternative()
    const snapshot = { ...item }

    const replacement = await alternativeNow({ trip: TRIP, day, item })

    expect(replacement.id).not.toBe(item.id)
    expect(replacement.source).toBe('ai')
    expect(replacement.editedByUser).toBe(false)
    expect(item).toEqual(snapshot)
  })

  it('is deterministic for the same day, item and variant', async () => {
    const { day, item } = await seedAlternative()

    const first = await alternativeNow({ trip: TRIP, day, item, variant: 1 })
    const second = await alternativeNow({ trip: TRIP, day, item, variant: 1 })

    expect(first.title).toBe(second.title)
    expect(first.category).toBe(second.category)
    expect(first.location).toBe(second.location)
  })

  it('rejects with a non-empty message when shouldFail is set', async () => {
    const { day, item } = await seedAlternative()

    const outcome = await alternativeNow({ trip: TRIP, day, item, shouldFail: true }).catch(
      (reason: unknown) => reason,
    )

    expect(outcome).toBeInstanceOf(Error)
    const error = outcome as Error
    expect(error.message).toBe(GENERATION_ERROR_MESSAGE)
    expect(error.message.length).toBeGreaterThan(0)
  })

  it('does not resolve with an item when shouldFail is set', async () => {
    const { day, item } = await seedAlternative()
    const pending = itineraryService.suggestAlternative({ trip: TRIP, day, item, shouldFail: true })
    void pending.catch(() => undefined)

    await vi.advanceTimersByTimeAsync(ALTERNATIVE_WAIT_MS)

    await expect(pending).rejects.toThrow(GENERATION_ERROR_MESSAGE)
  })
})
