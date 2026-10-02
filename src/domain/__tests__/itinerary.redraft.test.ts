import { describe, expect, it } from 'vitest'
import { addDays, timeToMinutes } from '@/domain/format'
import {
  DEFAULT_STOP_MINUTES,
  DEPARTURE_BUFFER_MINUTES,
  SLOT_BUFFER_MINUTES,
  estimateTotal,
  insertItemAt,
  isPreservedOnRegenerate,
  mergeGeneratedDays,
  nextEmptySlotStartTime,
  updateItemInDays,
} from '@/domain/itinerary'
import { buildItinerary } from '@/services/itineraryGenerator'
import type { ItineraryDay, ItineraryItem, Trip } from '@/domain/types'

/**
 * A re-draft (Regenerate, or a date or pace edit) used to lay a whole fresh day
 * on top of every stop the traveller had kept. These tests hold the merge to
 * what the traveller sees afterwards: no stop twice, nothing drafted on top of
 * their own stop, one arrival, one departure, and their stops exactly as left.
 */

const TRIP_ID = 'trip_1'
const NOW = '2025-03-01T00:00:00.000Z'
const LATER = '2025-03-02T00:00:00.000Z'

const BASE_ITEM: ItineraryItem = {
  id: 'itm_base',
  tripId: TRIP_ID,
  title: 'Base activity',
  category: 'sightseeing',
  startTime: '09:00',
  endTime: '10:00',
  location: 'Old Town',
  description: 'A description',
  estimatedCost: 10,
  currency: 'EUR',
  source: 'ai',
  editedByUser: false,
  experienceId: null,
  notes: '',
  createdAt: NOW,
  updatedAt: NOW,
}

function item(overrides: Partial<ItineraryItem> & { id: string }): ItineraryItem {
  return { ...BASE_ITEM, title: `Stop ${overrides.id}`, ...overrides }
}

function day(index: number, items: ItineraryItem[], start = '2025-03-05'): ItineraryDay {
  return {
    id: `${TRIP_ID}_d${String(index)}`,
    tripId: TRIP_ID,
    date: addDays(start, index - 1),
    index,
    title: null,
    items,
  }
}

function idsOf(dayValue: ItineraryDay): string[] {
  return dayValue.items.map((entry) => entry.id)
}

function withRole(days: readonly ItineraryDay[], role: 'arrival' | 'departure'): ItineraryItem[] {
  return days.flatMap((entry) => entry.items).filter((entry) => entry.role === role)
}

describe('mergeGeneratedDays fits the fresh draft around kept stops', () => {
  it('does not bring back the original of a kept stop beside it', () => {
    const kept = item({ id: 'kept', title: 'St Paul’s Cathedral', editedByUser: true, startTime: '09:30', endTime: '11:30' })
    const merged = mergeGeneratedDays(
      [day(1, [kept])],
      [day(1, [item({ id: 'fresh', title: 'St Paul’s Cathedral', startTime: '09:30', endTime: '11:30' })])],
    )

    expect(idsOf(merged[0])).toEqual(['kept'])
  })

  it('does not draft a kept stop again on another day, whatever its case or spacing', () => {
    const kept = item({ id: 'kept', title: 'Kew Gardens', editedByUser: true, startTime: '10:00', endTime: '14:00' })
    const merged = mergeGeneratedDays(
      [day(1, [kept]), day(2, [])],
      [
        day(1, [item({ id: 'fresh_one', startTime: '16:00', endTime: '17:00' })]),
        day(2, [item({ id: 'fresh_two', title: '  kew gardens ', startTime: '18:00', endTime: '19:00' })]),
      ],
    )

    expect(idsOf(merged[0])).toEqual(['kept', 'fresh_one'])
    expect(idsOf(merged[1])).toEqual([])
  })

  it('leaves out a drafted stop that overlaps a kept stop', () => {
    const tour = item({ id: 'tour', source: 'user', startTime: '11:45', endTime: '13:15' })
    const merged = mergeGeneratedDays(
      [day(1, [tour])],
      [
        day(1, [
          item({ id: 'before', startTime: '09:00', endTime: '11:00' }),
          item({ id: 'across', startTime: '11:45', endTime: '15:45' }),
          item({ id: 'inside', startTime: '12:00', endTime: '13:00' }),
          item({ id: 'after', startTime: '14:00', endTime: '15:00' }),
        ]),
      ],
    )

    expect(idsOf(merged[0])).toEqual(['before', 'tour', 'after'])
  })

  it('keeps the generator’s gap between a kept stop and a drafted one', () => {
    const tour = item({ id: 'tour', source: 'user', startTime: '12:00', endTime: '13:00' })
    const draft = (id: string, startTime: string, endTime: string) => item({ id, startTime, endTime })
    const merged = mergeGeneratedDays(
      [day(1, [tour])],
      [
        day(1, [
          draft('clear_before', '10:00', '11:45'),
          draft('tight_before', '10:30', '11:50'),
          draft('tight_after', '13:10', '13:40'),
          draft('clear_after', '13:15', '14:00'),
        ]),
      ],
    )

    expect(SLOT_BUFFER_MINUTES).toBe(15)
    expect(idsOf(merged[0])).toEqual(['clear_before', 'tour', 'clear_after'])
  })

  it('takes a kept stop with no end time to last the default stop length', () => {
    const openEnded = item({ id: 'open', source: 'user', startTime: '12:00', endTime: null })
    const end = 12 * 60 + DEFAULT_STOP_MINUTES
    const toTime = (minutes: number) =>
      `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
    const merged = mergeGeneratedDays(
      [day(1, [openEnded])],
      [
        day(1, [
          item({ id: 'during', startTime: toTime(end - 15), endTime: toTime(end + 60) }),
          item({ id: 'clear', startTime: toTime(end + SLOT_BUFFER_MINUTES), endTime: toTime(end + 90) }),
        ]),
      ],
    )

    expect(idsOf(merged[0])).toEqual(['open', 'clear'])
  })

  it('never moves, changes or drops a kept stop, even one that overlaps another kept stop', () => {
    const first = item({ id: 'first', source: 'user', startTime: '10:00', endTime: '12:00', notes: 'Booked' })
    const second = item({ id: 'second', source: 'catalog', startTime: '11:00', endTime: '12:30' })
    const merged = mergeGeneratedDays(
      [day(1, [first, second])],
      [day(1, [item({ id: 'fresh', startTime: '10:30', endTime: '11:30' })])],
    )

    expect(merged[0].items).toEqual([first, second])
  })

  it('counts a kept stop once in the estimate', () => {
    const kept = item({ id: 'kept', title: 'Louvre Museum', editedByUser: true, estimatedCost: 22 })
    const merged = mergeGeneratedDays(
      [day(1, [kept])],
      [day(1, [item({ id: 'fresh', title: 'Louvre Museum', estimatedCost: 22 })])],
    )

    expect(estimateTotal(merged, 'EUR')).toBe(22)
  })

  it('still sorts the merged day chronologically', () => {
    const late = item({ id: 'late', source: 'user', startTime: '20:00', endTime: '21:00' })
    const merged = mergeGeneratedDays(
      [day(1, [late])],
      [
        day(1, [
          item({ id: 'noon', startTime: '12:00', endTime: '13:00' }),
          item({ id: 'morning', startTime: '09:00', endTime: '10:00' }),
        ]),
      ],
    )

    expect(idsOf(merged[0])).toEqual(['morning', 'noon', 'late'])
  })
})

describe('mergeGeneratedDays and a kept arrival or departure', () => {
  const arrival = (id: string, overrides: Partial<ItineraryItem> = {}) =>
    item({ id, title: 'Arrive and settle in', category: 'transit', role: 'arrival', startTime: '15:00', endTime: '16:30', ...overrides })
  const departure = (id: string, overrides: Partial<ItineraryItem> = {}) =>
    item({ id, title: 'Last look, then head out', category: 'transit', role: 'departure', startTime: '12:00', endTime: '14:00', ...overrides })

  /** A three-day draft shaped like the generator's: arrival first, departure last. */
  function draft(start = '2025-03-05', count = 3): ItineraryDay[] {
    return Array.from({ length: count }, (_, offset) => {
      const index = offset + 1
      const items = [item({ id: `fresh_d${String(index)}_morning`, startTime: '08:30', endTime: '09:30' })]
      if (index > 1 && index < count) {
        items.push(item({ id: `fresh_d${String(index)}_evening`, startTime: '19:00', endTime: '20:30' }))
      }
      if (index === 1) {
        items.length = 0
        items.push(arrival('fresh_arrival'), item({ id: 'fresh_d1_evening', startTime: '18:00', endTime: '19:00' }))
      }
      if (index === count) items.push(departure('fresh_departure'))
      return day(index, items, start)
    })
  }

  it('keeps an edited arrival as the only arrival', () => {
    const mine = arrival('my_arrival', { editedByUser: true, startTime: '09:00', endTime: '10:00' })
    const existing = draft().map((entry) => (entry.index === 1 ? { ...entry, items: [mine] } : entry))

    const merged = mergeGeneratedDays(existing, draft())

    expect(withRole(merged, 'arrival')).toEqual([mine])
    expect(idsOf(merged[0])).toContain('my_arrival')
    expect(withRole(merged, 'departure').map((entry) => entry.id)).toEqual(['fresh_departure'])
  })

  it('keeps an edited departure as the only departure', () => {
    const mine = departure('my_departure', { editedByUser: true, startTime: '18:30', endTime: '20:30' })
    const existing = draft().map((entry) => (entry.index === 3 ? { ...entry, items: [mine] } : entry))

    const merged = mergeGeneratedDays(existing, draft())

    expect(withRole(merged, 'departure')).toEqual([mine])
    expect(idsOf(merged[2]).at(-1)).toBe('my_departure')
    expect(withRole(merged, 'arrival').map((entry) => entry.id)).toEqual(['fresh_arrival'])
  })

  it('moves a kept departure to the new last day when the trip is extended', () => {
    const mine = departure('my_departure', { editedByUser: true, startTime: '18:30', endTime: '20:30' })
    const existing = draft().map((entry) => (entry.index === 3 ? { ...entry, items: [mine] } : entry))

    const merged = mergeGeneratedDays(existing, draft('2025-03-05', 5))

    expect(withRole(merged, 'departure')).toEqual([mine])
    expect(idsOf(merged[4])).toContain('my_departure')
    expect(idsOf(merged[2])).not.toContain('my_departure')
  })

  it('moves a kept departure back to the last day when the trip is shortened', () => {
    const mine = departure('my_departure', { editedByUser: true, startTime: '18:30', endTime: '20:30' })
    const existing = draft('2025-03-05', 5).map((entry) => (entry.index === 5 ? { ...entry, items: [mine] } : entry))

    const merged = mergeGeneratedDays(existing, draft('2025-03-05', 2))

    expect(withRole(merged, 'departure')).toEqual([mine])
    expect(idsOf(merged[1])).toContain('my_departure')
  })

  it('moves a kept arrival to the new first day when the trip starts earlier', () => {
    const mine = arrival('my_arrival', { editedByUser: true, startTime: '09:00', endTime: '10:00' })
    const existing = draft().map((entry) => (entry.index === 1 ? { ...entry, items: [mine] } : entry))

    const merged = mergeGeneratedDays(existing, draft('2025-03-03', 5))

    expect(withRole(merged, 'arrival')).toEqual([mine])
    expect(idsOf(merged[0])).toContain('my_arrival')
  })

  it('keeps one arrival on day one when the whole trip shifts a day later', () => {
    const mine = arrival('my_arrival', { editedByUser: true, startTime: '09:00', endTime: '10:00' })
    const existing = draft().map((entry) => (entry.index === 1 ? { ...entry, items: [mine] } : entry))

    const merged = mergeGeneratedDays(existing, draft('2025-03-06', 3))

    expect(withRole(merged, 'arrival')).toEqual([mine])
    expect(idsOf(merged[0])).toContain('my_arrival')
  })

  it('drafts nothing after a kept departure, or inside the buffer before it', () => {
    const mine = departure('my_departure', { editedByUser: true, startTime: '16:00', endTime: '18:00' })
    const existing = [day(1, [mine])]
    const latestEnd = 16 * 60 - DEPARTURE_BUFFER_MINUTES
    const generated = [
      day(1, [
        item({ id: 'early', startTime: '09:00', endTime: '10:00' }),
        item({ id: 'ends_at_buffer', startTime: '13:00', endTime: '14:30' }),
        item({ id: 'into_buffer', startTime: '13:30', endTime: '14:45' }),
        item({ id: 'after', startTime: '19:00', endTime: '20:00' }),
        departure('fresh_departure'),
      ]),
    ]

    const merged = mergeGeneratedDays(existing, generated)

    expect(latestEnd).toBe(timeToMinutes('14:30'))
    expect(idsOf(merged[0])).toEqual(['early', 'ends_at_buffer', 'my_departure'])
  })

  it('drafts nothing before a kept arrival has ended', () => {
    const mine = arrival('my_arrival', { editedByUser: true, startTime: '11:00', endTime: '12:00' })
    const generated = [
      day(1, [
        item({ id: 'before', startTime: '08:00', endTime: '09:00' }),
        item({ id: 'during', startTime: '11:30', endTime: '12:30' }),
        item({ id: 'after', startTime: '13:00', endTime: '14:00' }),
        arrival('fresh_arrival'),
      ]),
    ]

    const merged = mergeGeneratedDays([day(1, [mine])], generated)

    expect(idsOf(merged[0])).toEqual(['my_arrival', 'after'])
  })

  it('keeps the latest of several kept departures as the departure and the rest as ordinary stops', () => {
    const older = departure('older', { editedByUser: true, startTime: '12:00', endTime: '14:00', updatedAt: NOW })
    const newer = departure('newer', { editedByUser: true, startTime: '18:30', endTime: '20:30', updatedAt: LATER })
    const existing = draft('2025-03-05', 4).map((entry) => {
      if (entry.index === 3) return { ...entry, items: [newer] }
      if (entry.index === 4) return { ...entry, items: [older] }
      return entry
    })

    const merged = mergeGeneratedDays(existing, draft('2025-03-05', 4))
    const all = merged.flatMap((entry) => entry.items)
    const demoted = all.find((entry) => entry.id === 'older')

    expect(withRole(merged, 'departure')).toEqual([newer])
    expect(idsOf(merged[3])).toContain('newer')
    expect(demoted).toBeDefined()
    expect(demoted && 'role' in demoted).toBe(false)
    expect({ ...demoted, role: 'departure' }).toEqual(older)
    expect(older.role).toBe('departure')
  })

  it('never leaves out the drafted arrival or departure for overlapping a kept stop', () => {
    const lunch = item({ id: 'lunch', source: 'user', startTime: '12:30', endTime: '13:30' })
    const existing = draft().map((entry) => (entry.index === 3 ? { ...entry, items: [lunch] } : entry))

    const merged = mergeGeneratedDays(existing, draft())

    expect(withRole(merged, 'departure').map((entry) => entry.id)).toEqual(['fresh_departure'])
    expect(idsOf(merged[2])).toContain('lunch')
  })
})

describe('mergeGeneratedDays with nothing kept', () => {
  const TRIP: Trip = {
    id: 'trip_merge_fixture',
    userId: 'usr_fixture',
    name: 'London',
    origin: 'Lagos, Nigeria',
    destination: 'London, United Kingdom',
    destinationId: 'london',
    startDate: '2026-04-01',
    endDate: '2026-04-05',
    travelers: 2,
    budget: 2500,
    currency: 'GBP',
    interests: ['culture', 'food'],
    pace: 'packed',
    notes: '',
    status: 'draft',
    createdAt: NOW,
    updatedAt: NOW,
  }

  it('returns the generated days exactly when there is no existing plan', () => {
    const generated = buildItinerary(TRIP, 0, NOW)

    expect(mergeGeneratedDays([], generated)).toEqual(generated)
  })

  it('returns the generated days exactly when the existing plan has only untouched drafts', () => {
    const generated = buildItinerary(TRIP, 1, NOW)

    expect(mergeGeneratedDays(buildItinerary(TRIP, 0, NOW), generated)).toEqual(generated)
  })

  it('returns the generated days exactly when the existing days are empty', () => {
    const generated = buildItinerary(TRIP, 0, NOW)
    const empty = generated.map((entry) => ({ ...entry, items: [] }))

    expect(mergeGeneratedDays(empty, generated)).toEqual(generated)
  })
})

/**
 * The matrix: real drafts, edited the way a traveller edits them, then
 * re-drafted. Kept small (a few hundred merges) so it runs in well under a
 * second.
 */
describe('edit, then re-draft, across destinations, lengths and variants', () => {
  const DESTINATIONS: ReadonlyArray<[label: string, id: string | null]> = [
    ['Paris', 'paris'],
    ['London', 'london'],
    ['Lagos', 'lagos'],
    ['Tokyo', 'tokyo'],
    ['unlisted', null],
  ]
  const LENGTHS = [1, 2, 3, 5, 8] as const
  const VARIANTS = [0, 1, 2] as const
  const START = '2026-04-01'
  const EDITED_AT = '2026-03-20T10:00:00.000Z'

  function tripFor(destinationId: string | null, length: number): Trip {
    return {
      id: `trip_matrix_${destinationId ?? 'none'}_${String(length)}`,
      userId: 'usr_fixture',
      name: 'Matrix trip',
      origin: 'Lagos, Nigeria',
      destination: destinationId ?? 'Lisbon',
      destinationId,
      startDate: START,
      endDate: addDays(START, length - 1),
      travelers: 2,
      budget: 2500,
      currency: 'EUR',
      interests: ['culture', 'food'],
      pace: 'packed',
      notes: '',
      status: 'draft',
      createdAt: NOW,
      updatedAt: NOW,
    }
  }

  /**
   * What a traveller does to a draft: a note on the first ordinary stop of
   * every day (kept, not renamed), their own dinner on each middle day, and,
   * when `editAnchors`, the arrival and departure moved to their real times.
   */
  function edited(days: readonly ItineraryDay[], editAnchors: boolean): ItineraryDay[] {
    let next = [...days]
    for (const entry of days) {
      const ordinary = entry.items.find((candidate) => candidate.role === undefined)
      if (ordinary) next = updateItemInDays(next, ordinary.id, { notes: 'Booked' }, EDITED_AT)
      if (entry.index > 1 && entry.index < days.length) {
        next = insertItemAt(
          next,
          entry.id,
          item({
            id: `mine_${entry.id}`,
            title: `Dinner with Sam, day ${String(entry.index)}`,
            source: 'user',
            startTime: '13:00',
            endTime: '14:00',
          }),
        )
      }
    }
    if (!editAnchors) return next
    for (const anchor of days.flatMap((entry) => entry.items)) {
      if (anchor.role === 'arrival' && days.length > 1) {
        next = updateItemInDays(next, anchor.id, { startTime: '09:00', endTime: '10:00' }, EDITED_AT)
      }
      if (anchor.role === 'departure') {
        next = updateItemInDays(next, anchor.id, { startTime: '18:30', endTime: '20:30' }, EDITED_AT)
      }
    }
    return next
  }

  function span(entry: ItineraryItem): { start: number; end: number } {
    const start = timeToMinutes(entry.startTime)
    const end = entry.endTime === null ? start : timeToMinutes(entry.endTime)
    return { start, end: end > start ? end : start + DEFAULT_STOP_MINUTES }
  }

  /** Everything wrong with a merged plan, as readable lines; empty when it is sound. */
  function problems(before: readonly ItineraryDay[], merged: readonly ItineraryDay[]): string[] {
    const found: string[] = []
    for (const entry of merged) {
      const label = `day ${String(entry.index)}`
      entry.items.forEach((first, at) => {
        for (const second of entry.items.slice(at + 1)) {
          // Two stops the traveller keeps may overlap: that is their plan.
          if (isPreservedOnRegenerate(first) && isPreservedOnRegenerate(second)) continue
          // Nor is the draft's own arrival or departure given up for a kept
          // stop: on a shortened trip a kept afternoon can meet the new noon
          // departure, and the traveller needs to see both to sort it out.
          const draftedAnchor = [first, second].some(
            (candidate) => candidate.role !== undefined && !isPreservedOnRegenerate(candidate),
          )
          if (draftedAnchor) continue
          const a = span(first)
          const b = span(second)
          if (a.start < b.end && b.start < a.end) {
            found.push(`${label}: ${first.startTime} ${first.title} overlaps ${second.startTime} ${second.title}`)
          }
        }
      })
      const titles = entry.items.map((candidate) => candidate.title.trim().toLowerCase())
      for (const title of new Set(titles)) {
        if (titles.filter((candidate) => candidate === title).length > 1) found.push(`${label}: twice: ${title}`)
      }
    }

    const arrivals = merged.flatMap((entry) => entry.items.filter((candidate) => candidate.role === 'arrival').map(() => entry.index))
    const departures = merged.flatMap((entry) => entry.items.filter((candidate) => candidate.role === 'departure').map(() => entry.index))
    if (arrivals.length !== 1 || arrivals[0] !== 1) found.push(`arrivals on days ${arrivals.join(',')}`)
    if (departures.length !== 1 || departures[0] !== merged.length) found.push(`departures on days ${departures.join(',')}`)

    const after = merged.flatMap((entry) => entry.items)
    for (const kept of before.flatMap((entry) => entry.items).filter(isPreservedOnRegenerate)) {
      const copies = after.filter((candidate) => candidate.id === kept.id)
      if (copies.length !== 1) found.push(`${kept.title}: kept ${String(copies.length)} times`)
      else if (JSON.stringify(copies[0]) !== JSON.stringify(kept)) found.push(`${kept.title}: changed`)
    }
    return found
  }

  const CASES = DESTINATIONS.flatMap(([label, id]) =>
    LENGTHS.flatMap((length) =>
      VARIANTS.flatMap((variant) =>
        [false, true].map((editAnchors) => ({
          label: `${label}, ${String(length)} days, v${String(variant)}${editAnchors ? ', anchors edited' : ''}`,
          trip: tripFor(id, length),
          variant,
          editAnchors,
        })),
      ),
    ),
  )

  it.each(CASES)('regenerate: $label', ({ trip, variant, editAnchors }) => {
    const before = edited(buildItinerary(trip, variant, NOW), editAnchors)

    const merged = mergeGeneratedDays(before, buildItinerary(trip, variant + 1, LATER))

    expect(problems(before, merged)).toEqual([])
  })

  it.each(CASES)('longer, starting a day later: $label', ({ trip, variant, editAnchors }) => {
    const before = edited(buildItinerary(trip, variant, NOW), editAnchors)
    const moved: Trip = { ...trip, startDate: addDays(trip.startDate, 1), endDate: addDays(trip.endDate, 3) }

    const merged = mergeGeneratedDays(before, buildItinerary(moved, 0, LATER))

    expect(problems(before, merged)).toEqual([])
  })

  it.each(CASES)('a day shorter: $label', ({ trip, variant, editAnchors }) => {
    if (trip.startDate === trip.endDate) return
    const before = edited(buildItinerary(trip, variant, NOW), editAnchors)
    const shorter: Trip = { ...trip, endDate: addDays(trip.endDate, -1) }

    const merged = mergeGeneratedDays(before, buildItinerary(shorter, 0, LATER))

    expect(problems(before, merged)).toEqual([])
  })
})

describe('nextEmptySlotStartTime on a day with a departure', () => {
  const departure = (startTime = '12:00', endTime = '14:00') =>
    item({ id: 'departure', role: 'departure', category: 'transit', startTime, endTime })

  it('offers a time before the departure, clear of the stop already there', () => {
    const last = day(3, [item({ id: 'breakfast', startTime: '08:00', endTime: '09:00' }), departure()])

    expect(nextEmptySlotStartTime(last)).toBe('09:15')
  })

  it('offers the start of the morning when the day holds only the departure', () => {
    expect(nextEmptySlotStartTime(day(3, [departure()]))).toBe('09:00')
  })

  it('finds the first gap before a departure the traveller moved to the evening', () => {
    const last = day(3, [
      item({ id: 'museum', startTime: '09:00', endTime: '11:00' }),
      item({ id: 'lunch', startTime: '11:30', endTime: '12:30' }),
      departure('18:30', '20:30'),
    ])

    expect(nextEmptySlotStartTime(last)).toBe('12:45')
  })

  it('leaves the stop it offers ending a full departure buffer before leaving', () => {
    for (const trip of ['paris', 'london', 'lagos', 'tokyo']) {
      for (const variant of [0, 1, 2, 3]) {
        const days = buildItinerary(
          {
            id: `trip_slot_${trip}`,
            userId: 'usr_fixture',
            name: 'Slot trip',
            origin: 'Lagos, Nigeria',
            destination: trip,
            destinationId: trip,
            startDate: '2026-04-01',
            endDate: '2026-04-04',
            travelers: 1,
            budget: 1000,
            currency: 'EUR',
            interests: ['culture'],
            pace: 'balanced',
            notes: '',
            status: 'draft',
            createdAt: NOW,
            updatedAt: NOW,
          },
          variant,
          NOW,
        )
        const last = days[days.length - 1]
        const leaving = last.items.find((entry) => entry.role === 'departure')
        if (!leaving) throw new Error('the draft has no departure')
        const offered = timeToMinutes(nextEmptySlotStartTime(last))
        const fits = offered + DEFAULT_STOP_MINUTES <= timeToMinutes(leaving.startTime) - DEPARTURE_BUFFER_MINUTES
        const others = last.items.filter((entry) => entry !== leaving)
        // A morning with room for an hour gets it; a full one keeps the old default.
        const room = others.every((entry) => timeToMinutes(entry.endTime ?? entry.startTime) <= 9 * 60)

        if (room) expect(fits, `${trip} v${String(variant)}`).toBe(true)
        if (fits) {
          for (const entry of others) {
            const start = timeToMinutes(entry.startTime)
            const end = timeToMinutes(entry.endTime ?? entry.startTime)
            expect(offered >= end || offered + DEFAULT_STOP_MINUTES <= start, `${trip} v${String(variant)}`).toBe(true)
          }
        }
      }
    }
  })

  it('falls back to the usual default when nothing fits before the departure', () => {
    const last = day(3, [item({ id: 'breakfast', startTime: '08:30', endTime: '09:45' }), departure()])

    expect(nextEmptySlotStartTime(last)).toBe('13:30')
  })

  it('is unchanged on a day with no departure', () => {
    expect(nextEmptySlotStartTime(day(2, [item({ id: 'museum', startTime: '10:00', endTime: '12:00' })]))).toBe('11:30')
  })
})
