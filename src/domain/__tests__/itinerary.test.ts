import { describe, expect, it } from 'vitest'
import {
  countItems,
  estimateTotal,
  findDayById,
  findDayForDate,
  findItemInDays,
  insertItemAt,
  isPreservedOnRegenerate,
  mergeGeneratedDays,
  moveItemInDays,
  nextEmptySlotStartTime,
  removeItemFromDays,
  replaceItemInDays,
  sortItems,
  updateItemInDays,
} from '@/domain/itinerary'
import type { ItineraryDay, ItineraryItem } from '@/domain/types'

const TRIP_ID = 'trip_1'
const NOW = '2025-03-01T00:00:00.000Z'

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
  source: 'ai',
  editedByUser: false,
  experienceId: null,
  notes: '',
  createdAt: NOW,
  updatedAt: NOW,
}

const BASE_DAY: ItineraryDay = {
  id: 'trip_1_d1',
  tripId: TRIP_ID,
  date: '2025-03-05',
  index: 1,
  title: null,
  items: [],
}

function item(overrides: Partial<ItineraryItem>): ItineraryItem {
  return { ...BASE_ITEM, ...overrides }
}

function day(overrides: Partial<ItineraryDay>): ItineraryDay {
  return { ...BASE_DAY, ...overrides }
}

function idsOf(dayValue: ItineraryDay): string[] {
  return dayValue.items.map((entry) => entry.id)
}

function titlesOf(dayValue: ItineraryDay): string[] {
  return dayValue.items.map((entry) => entry.title)
}

describe('isPreservedOnRegenerate', () => {
  it('preserves a traveller-added item', () => {
    expect(isPreservedOnRegenerate(item({ source: 'user' }))).toBe(true)
  })

  it('preserves a catalog item', () => {
    expect(isPreservedOnRegenerate(item({ source: 'catalog' }))).toBe(true)
  })

  it('preserves an AI item the traveller edited', () => {
    expect(isPreservedOnRegenerate(item({ source: 'ai', editedByUser: true }))).toBe(true)
  })

  it('does not preserve an untouched AI item', () => {
    expect(isPreservedOnRegenerate(item({ source: 'ai', editedByUser: false }))).toBe(false)
  })

  it('preserves a user item even when the edit flag is false', () => {
    expect(isPreservedOnRegenerate(item({ source: 'user', editedByUser: false }))).toBe(true)
  })
})

describe('estimateTotal', () => {
  it('returns 0 for no days', () => {
    expect(estimateTotal([])).toBe(0)
  })

  it('returns 0 for days with no items', () => {
    expect(estimateTotal([day({}), day({ id: 'trip_1_d2', index: 2 })])).toBe(0)
  })

  it('sums every item across every day', () => {
    const days = [
      day({ items: [item({ id: 'a', estimatedCost: 20 }), item({ id: 'b', estimatedCost: 12.5 })] }),
      day({
        id: 'trip_1_d2',
        index: 2,
        items: [item({ id: 'c', estimatedCost: 30 })],
      }),
    ]
    expect(estimateTotal(days)).toBe(62.5)
  })

  it('is cent-safe across float-drifted costs', () => {
    const days = [day({ items: [item({ id: 'a', estimatedCost: 0.1 }), item({ id: 'b', estimatedCost: 0.2 })] })]
    expect(estimateTotal(days)).toBe(0.3)
  })

  it('includes zero-cost free items without changing the total', () => {
    const days = [day({ items: [item({ id: 'a', estimatedCost: 0 }), item({ id: 'b', estimatedCost: 15 })] })]
    expect(estimateTotal(days)).toBe(15)
  })
})

describe('countItems', () => {
  it('returns 0 for no days', () => {
    expect(countItems([])).toBe(0)
  })

  it('returns 0 for a day with no items', () => {
    expect(countItems([day({})])).toBe(0)
  })

  it('counts items across every day', () => {
    const days = [
      day({ items: [item({ id: 'a' }), item({ id: 'b' })] }),
      day({ id: 'trip_1_d2', index: 2, items: [item({ id: 'c' })] }),
    ]
    expect(countItems(days)).toBe(3)
  })
})

describe('findDayForDate', () => {
  const days = [
    day({ date: '2025-03-05' }),
    day({ id: 'trip_1_d2', date: '2025-03-06', index: 2 }),
  ]

  it('finds the day matching the date', () => {
    expect(findDayForDate(days, '2025-03-06')?.id).toBe('trip_1_d2')
  })

  it('returns null for a date outside the trip', () => {
    expect(findDayForDate(days, '2025-03-09')).toBeNull()
  })

  it('returns null for an empty day list', () => {
    expect(findDayForDate([], '2025-03-05')).toBeNull()
  })
})

describe('findDayById', () => {
  const days = [day({}), day({ id: 'trip_1_d2', index: 2 })]

  it('finds the day matching the id', () => {
    expect(findDayById(days, 'trip_1_d2')?.index).toBe(2)
  })

  it('returns null for an unknown id', () => {
    expect(findDayById(days, 'trip_1_d9')).toBeNull()
  })
})

describe('findItemInDays', () => {
  const days = [
    day({ items: [item({ id: 'a' })] }),
    day({ id: 'trip_1_d2', index: 2, items: [item({ id: 'b' })] }),
  ]

  it('returns the containing day and item', () => {
    const found = findItemInDays(days, 'b')
    expect(found?.day.id).toBe('trip_1_d2')
    expect(found?.item.id).toBe('b')
  })

  it('returns null for an unknown item id', () => {
    expect(findItemInDays(days, 'missing')).toBeNull()
  })
})

describe('sortItems', () => {
  it('orders items chronologically', () => {
    const sorted = sortItems([
      item({ id: 'c', startTime: '18:00' }),
      item({ id: 'a', startTime: '09:00' }),
      item({ id: 'b', startTime: '13:00' }),
    ])
    expect(idsOf(day({ items: sorted }))).toEqual(['a', 'b', 'c'])
  })

  it('puts a preserved item ahead of an AI item at the same start time', () => {
    const sorted = sortItems([
      item({ id: 'ai', startTime: '10:00', source: 'ai' }),
      item({ id: 'user', startTime: '10:00', source: 'user' }),
    ])
    expect(idsOf(day({ items: sorted }))).toEqual(['user', 'ai'])
  })

  it('falls back to creation order for two AI items at the same time', () => {
    const sorted = sortItems([
      item({ id: 'later', startTime: '10:00', createdAt: '2025-03-02T00:00:00.000Z' }),
      item({ id: 'earlier', startTime: '10:00', createdAt: '2025-03-01T00:00:00.000Z' }),
    ])
    expect(idsOf(day({ items: sorted }))).toEqual(['earlier', 'later'])
  })

  it('does not mutate the input array', () => {
    const input = [item({ id: 'c', startTime: '18:00' }), item({ id: 'a', startTime: '09:00' })]
    sortItems(input)
    expect(idsOf(day({ items: input }))).toEqual(['c', 'a'])
  })
})

describe('replaceItemInDays', () => {
  const days = [
    day({
      items: [
        item({ id: 'a', title: 'First', startTime: '09:00' }),
        item({ id: 'target', title: 'To replace', startTime: '12:00' }),
        item({ id: 'c', title: 'Third', startTime: '16:00' }),
      ],
    }),
    day({ id: 'trip_1_d2', index: 2, items: [item({ id: 'd', title: 'Other day' })] }),
  ]

  const replacement = item({
    id: 'itm_new',
    tripId: 'trip_other',
    title: 'Alternative',
    startTime: '12:00',
  })

  it('keeps the replaced item in its original position', () => {
    const next = replaceItemInDays(days, 'target', replacement, NOW)
    expect(titlesOf(next[0])).toEqual(['First', 'Alternative', 'Third'])
  })

  it('keeps the original item id', () => {
    const next = replaceItemInDays(days, 'target', replacement, NOW)
    expect(next[0].items[1].id).toBe('target')
  })

  it('keeps the original trip id', () => {
    const next = replaceItemInDays(days, 'target', replacement, NOW)
    expect(next[0].items[1].tripId).toBe(TRIP_ID)
  })

  it('flags the replaced item as edited by the traveller', () => {
    const next = replaceItemInDays(days, 'target', replacement, NOW)
    expect(next[0].items[1].editedByUser).toBe(true)
  })

  it('stamps the supplied update timestamp', () => {
    const next = replaceItemInDays(days, 'target', replacement, '2025-04-02T08:00:00.000Z')
    expect(next[0].items[1].updatedAt).toBe('2025-04-02T08:00:00.000Z')
  })

  it('leaves every other item identical by reference', () => {
    const next = replaceItemInDays(days, 'target', replacement, NOW)
    expect(next[0].items[0]).toBe(days[0].items[0])
    expect(next[0].items[2]).toBe(days[0].items[2])
  })

  it('leaves other days identical by reference', () => {
    const next = replaceItemInDays(days, 'target', replacement, NOW)
    expect(next[1]).toBe(days[1])
  })

  it('returns a new array without mutating the input', () => {
    replaceItemInDays(days, 'target', replacement, NOW)
    expect(titlesOf(days[0])).toEqual(['First', 'To replace', 'Third'])
  })

  it('is a no-op for an unknown item id', () => {
    const next = replaceItemInDays(days, 'missing', replacement, NOW)
    expect(next[0]).toBe(days[0])
  })
})

describe('updateItemInDays', () => {
  it('applies the patch to the matching item only', () => {
    const days = [day({ items: [item({ id: 'a', title: 'First' }), item({ id: 'b', title: 'Second' })] })]
    const next = updateItemInDays(days, 'b', { title: 'Renamed' }, NOW)
    expect(titlesOf(next[0])).toEqual(['First', 'Renamed'])
  })

  it('flags the item as edited by the traveller', () => {
    const days = [day({ items: [item({ id: 'a', source: 'ai' })] })]
    const next = updateItemInDays(days, 'a', { title: 'Renamed' }, NOW)
    expect(next[0].items[0].editedByUser).toBe(true)
  })

  it('leaves the original item id untouched', () => {
    const days = [day({ items: [item({ id: 'a' })] })]
    const next = updateItemInDays(days, 'a', { title: 'Renamed' }, NOW)
    expect(next[0].items[0].id).toBe('a')
  })

  /**
   * The itinerary screen lets the traveller pick any start time, so an edited
   * time has to move the stop in the day as well. It used to stay in its old
   * slot and the day rendered out of chronological order.
   */
  it('re-sorts the day when an edit moves a stop earlier', () => {
    const days = [
      day({
        items: [
          item({ id: 'morning', startTime: '09:00' }),
          item({ id: 'afternoon', startTime: '15:00' }),
          item({ id: 'evening', startTime: '19:00' }),
        ],
      }),
    ]
    const next = updateItemInDays(days, 'evening', { startTime: '07:00' }, NOW)
    expect(idsOf(next[0])).toEqual(['evening', 'morning', 'afternoon'])
  })

  it('re-sorts the day when an edit moves a stop later', () => {
    const days = [
      day({
        items: [
          item({ id: 'morning', startTime: '09:00' }),
          item({ id: 'afternoon', startTime: '15:00' }),
        ],
      }),
    ]
    const next = updateItemInDays(days, 'morning', { startTime: '21:00' }, NOW)
    expect(idsOf(next[0])).toEqual(['afternoon', 'morning'])
  })

  it('leaves the order alone when the edit does not touch the start time', () => {
    const days = [
      day({
        items: [item({ id: 'a', startTime: '09:00' }), item({ id: 'b', startTime: '09:00' })],
      }),
    ]
    const next = updateItemInDays(days, 'b', { title: 'Renamed', estimatedCost: 40 }, NOW)
    expect(idsOf(next[0])).toEqual(['a', 'b'])
  })

  it('leaves the order alone when the patched start time is the one it already had', () => {
    const days = [
      day({
        items: [item({ id: 'a', startTime: '09:00' }), item({ id: 'b', startTime: '09:00' })],
      }),
    ]
    const next = updateItemInDays(days, 'b', { startTime: '09:00' }, NOW)
    expect(idsOf(next[0])).toEqual(['a', 'b'])
  })

  it('leaves days that do not hold the item identical by reference', () => {
    const days = [
      day({ items: [item({ id: 'a', startTime: '09:00' }), item({ id: 'b', startTime: '15:00' })] }),
      day({ id: 'trip_1_d2', index: 2, items: [item({ id: 'c' })] }),
    ]
    const next = updateItemInDays(days, 'b', { startTime: '07:00' }, NOW)
    expect(next[1]).toBe(days[1])
  })

  it('does not mutate the input day when it re-sorts', () => {
    const days = [
      day({ items: [item({ id: 'a', startTime: '09:00' }), item({ id: 'b', startTime: '15:00' })] }),
    ]
    updateItemInDays(days, 'b', { startTime: '07:00' }, NOW)
    expect(idsOf(days[0])).toEqual(['a', 'b'])
  })
})

describe('insertItemAt keeps the day chronological', () => {
  it('places a later stop after the ones already on the day', () => {
    const days = [
      day({ items: [item({ id: 'a', startTime: '09:00' }), item({ id: 'b', startTime: '11:00' })] }),
    ]
    const next = insertItemAt(days, 'trip_1_d1', item({ id: 'new', startTime: '18:00' }), 0)
    expect(idsOf(next[0])).toEqual(['a', 'b', 'new'])
  })

  it('places an earlier stop before the ones already on the day', () => {
    const days = [
      day({ items: [item({ id: 'a', startTime: '09:00' }), item({ id: 'b', startTime: '11:00' })] }),
    ]
    const next = insertItemAt(days, 'trip_1_d1', item({ id: 'new', startTime: '07:00' }))
    expect(idsOf(next[0])).toEqual(['new', 'a', 'b'])
  })
})

describe('moveItemInDays keeps the receiving day chronological', () => {
  it('sorts the moved stop into the target day by time, not by index', () => {
    const days = [
      day({ items: [item({ id: 'late', startTime: '20:00' })] }),
      day({
        id: 'trip_1_d2',
        index: 2,
        items: [item({ id: 'x', startTime: '09:00' }), item({ id: 'y', startTime: '12:00' })],
      }),
    ]
    const next = moveItemInDays(days, 'late', 'trip_1_d2', 0)
    expect(idsOf(next[1])).toEqual(['x', 'y', 'late'])
  })
})

describe('removeItemFromDays', () => {
  const days = [
    day({ items: [item({ id: 'a' }), item({ id: 'target' }), item({ id: 'c' })] }),
    day({ id: 'trip_1_d2', index: 2, items: [item({ id: 'd' })] }),
  ]

  it('removes only the targeted item', () => {
    expect(idsOf(removeItemFromDays(days, 'target')[0])).toEqual(['a', 'c'])
  })

  it('closes the gap in the item order', () => {
    expect(idsOf(removeItemFromDays(days, 'a')[0])).toEqual(['target', 'c'])
  })

  it('leaves other days identical by reference', () => {
    expect(removeItemFromDays(days, 'target')[1]).toBe(days[1])
  })

  it('does not mutate the input day', () => {
    removeItemFromDays(days, 'target')
    expect(idsOf(days[0])).toEqual(['a', 'target', 'c'])
  })

  it('is a no-op for an unknown item id', () => {
    expect(removeItemFromDays(days, 'missing')[0]).toBe(days[0])
  })
})

describe('moveItemInDays', () => {
  it('moves an item to another day and appends it there', () => {
    const days = [
      day({ items: [item({ id: 'a' }), item({ id: 'b' })] }),
      day({ id: 'trip_1_d2', index: 2, items: [item({ id: 'c' })] }),
    ]
    const next = moveItemInDays(days, 'a', 'trip_1_d2')
    expect(idsOf(next[0])).toEqual(['b'])
    expect(idsOf(next[1])).toEqual(['c', 'a'])
  })

  it('inserts at an explicit index on the target day', () => {
    const days = [
      day({ items: [item({ id: 'a' })] }),
      day({ id: 'trip_1_d2', index: 2, items: [item({ id: 'b' }), item({ id: 'c' })] }),
    ]
    const next = moveItemInDays(days, 'a', 'trip_1_d2', 1)
    expect(idsOf(next[1])).toEqual(['b', 'a', 'c'])
  })

  it('reorders within the same day', () => {
    const days = [day({ items: [item({ id: 'a' }), item({ id: 'b' }), item({ id: 'c' })] })]
    const next = moveItemInDays(days, 'a', 'trip_1_d1', 2)
    expect(idsOf(next[0])).toEqual(['b', 'c', 'a'])
  })

  it('moves an item to the front of its own day', () => {
    const days = [day({ items: [item({ id: 'a' }), item({ id: 'b' }), item({ id: 'c' })] })]
    const next = moveItemInDays(days, 'c', 'trip_1_d1', 0)
    expect(idsOf(next[0])).toEqual(['c', 'a', 'b'])
  })

  it('preserves the item object identity', () => {
    const moved = item({ id: 'a' })
    const days = [day({ items: [moved] }), day({ id: 'trip_1_d2', index: 2, items: [] })]
    const next = moveItemInDays(days, 'a', 'trip_1_d2')
    expect(next[1].items[0]).toBe(moved)
  })

  it('keeps the day count unchanged', () => {
    const days = [day({ items: [item({ id: 'a' })] }), day({ id: 'trip_1_d2', index: 2, items: [] })]
    expect(moveItemInDays(days, 'a', 'trip_1_d2')).toHaveLength(2)
  })

  it('returns an unchanged copy for an unknown item id', () => {
    const days = [day({ items: [item({ id: 'a' })] })]
    const next = moveItemInDays(days, 'missing', 'trip_1_d1')
    expect(next).not.toBe(days)
    expect(next[0]).toBe(days[0])
  })

  it('does not mutate the input day', () => {
    const days = [day({ items: [item({ id: 'a' })] }), day({ id: 'trip_1_d2', index: 2, items: [] })]
    moveItemInDays(days, 'a', 'trip_1_d2')
    expect(idsOf(days[0])).toEqual(['a'])
  })
})

describe('insertItemAt', () => {
  const days = [
    day({ items: [item({ id: 'a' }), item({ id: 'b' })] }),
    day({ id: 'trip_1_d2', index: 2, items: [item({ id: 'c' })] }),
  ]

  it('inserts at an explicit position', () => {
    const next = insertItemAt(days, 'trip_1_d1', item({ id: 'new' }), 1)
    expect(idsOf(next[0])).toEqual(['a', 'new', 'b'])
  })

  it('appends when no position is given', () => {
    const next = insertItemAt(days, 'trip_1_d1', item({ id: 'new' }))
    expect(idsOf(next[0])).toEqual(['a', 'b', 'new'])
  })

  it('inserts at the front with position 0', () => {
    const next = insertItemAt(days, 'trip_1_d1', item({ id: 'new' }), 0)
    expect(idsOf(next[0])).toEqual(['new', 'a', 'b'])
  })

  it('clamps a negative position to the front', () => {
    const next = insertItemAt(days, 'trip_1_d1', item({ id: 'new' }), -5)
    expect(idsOf(next[0])).toEqual(['new', 'a', 'b'])
  })

  it('clamps a position past the end to the end', () => {
    const next = insertItemAt(days, 'trip_1_d1', item({ id: 'new' }), 99)
    expect(idsOf(next[0])).toEqual(['a', 'b', 'new'])
  })

  it('displaces the item currently in the requested slot', () => {
    const next = insertItemAt(days, 'trip_1_d1', item({ id: 'new' }), 1)
    expect(next[0].items).toHaveLength(3)
  })

  it('leaves other days identical by reference', () => {
    expect(insertItemAt(days, 'trip_1_d1', item({ id: 'new' }))[1]).toBe(days[1])
  })

  it('is a no-op for an unknown day id', () => {
    const next = insertItemAt(days, 'trip_1_d9', item({ id: 'new' }))
    expect(next[0]).toBe(days[0])
  })

  it('does not mutate the input day', () => {
    insertItemAt(days, 'trip_1_d1', item({ id: 'new' }), 0)
    expect(idsOf(days[0])).toEqual(['a', 'b'])
  })
})

describe('nextEmptySlotStartTime', () => {
  it('starts at 08:00 for an empty day', () => {
    expect(nextEmptySlotStartTime(day({ items: [] }))).toBe('09:30')
  })

  it('places the next slot 90 minutes after the latest start', () => {
    expect(nextEmptySlotStartTime(day({ items: [item({ startTime: '10:00' })] }))).toBe('11:30')
  })

  it('uses the latest start rather than the last one in the list', () => {
    const dayValue = day({ items: [item({ startTime: '16:00' }), item({ startTime: '09:00' })] })
    expect(nextEmptySlotStartTime(dayValue)).toBe('17:30')
  })

  it('clamps to a 22:00 ceiling', () => {
    expect(nextEmptySlotStartTime(day({ items: [item({ startTime: '21:30' })] }))).toBe('22:00')
  })
})

describe('mergeGeneratedDays', () => {
  const existing = [
    day({
      items: [
        item({ id: 'user_breakfast', source: 'user', startTime: '08:00' }),
        item({ id: 'catalog_museum', source: 'catalog', startTime: '10:00' }),
        item({ id: 'ai_unescorted', source: 'ai', editedByUser: false, startTime: '14:00' }),
      ],
    }),
    day({
      id: 'trip_1_d2',
      date: '2025-03-06',
      index: 2,
      items: [item({ id: 'ai_second_day', source: 'ai', editedByUser: false, startTime: '10:00' })],
    }),
  ]

  const generated = [
    day({ items: [item({ id: 'fresh_one', source: 'ai', startTime: '09:00' })] }),
    day({
      id: 'trip_1_d2',
      date: '2025-03-06',
      index: 2,
      items: [item({ id: 'fresh_two', source: 'ai', startTime: '11:00' })] }),
  ]

  it('keeps a traveller-added item', () => {
    const merged = mergeGeneratedDays(existing, generated)
    expect(idsOf(merged[0])).toContain('user_breakfast')
  })

  it('keeps a catalog item', () => {
    const merged = mergeGeneratedDays(existing, generated)
    expect(idsOf(merged[0])).toContain('catalog_museum')
  })

  it('keeps a hand-edited AI item', () => {
    const existingWithEdit = [
      day({
        items: [
          item({ id: 'edited_ai', source: 'ai', editedByUser: true, startTime: '10:00' }),
        ],
      }),
    ]
    expect(idsOf(mergeGeneratedDays(existingWithEdit, generated)[0])).toContain('edited_ai')
  })

  it('drops an untouched AI item', () => {
    const merged = mergeGeneratedDays(existing, generated)
    expect(idsOf(merged[0])).not.toContain('ai_unescorted')
  })

  it('drops untouched AI items on later days too', () => {
    const merged = mergeGeneratedDays(existing, generated)
    expect(idsOf(merged[1])).not.toContain('ai_second_day')
  })

  it('includes the freshly generated items', () => {
    const merged = mergeGeneratedDays(existing, generated)
    expect(idsOf(merged[0])).toContain('fresh_one')
    expect(idsOf(merged[1])).toContain('fresh_two')
  })

  it('copies each preserved item exactly once', () => {
    const merged = mergeGeneratedDays(existing, generated)
    expect(idsOf(merged[0]).filter((id) => id === 'user_breakfast')).toHaveLength(1)
    expect(idsOf(merged[0])).toHaveLength(3)
  })

  it('keeps the merged day in chronological order', () => {
    const merged = mergeGeneratedDays(existing, generated)
    expect(idsOf(merged[0])).toEqual(['user_breakfast', 'fresh_one', 'catalog_museum'])
  })

  it('takes the day count from the regenerated set', () => {
    expect(mergeGeneratedDays(existing, generated)).toHaveLength(2)
  })

  it('grows the day count when the trip dates are extended', () => {
    const longer = [
      ...generated,
      day({ id: 'trip_1_d3', date: '2025-03-07', index: 3, items: [item({ id: 'fresh_three' })] }),
    ]
    const merged = mergeGeneratedDays(existing, longer)
    expect(merged).toHaveLength(3)
    expect(merged[2].date).toBe('2025-03-07')
  })

  it('shrinks the day count when the trip dates are shortened', () => {
    const merged = mergeGeneratedDays(existing, [generated[0]])
    expect(merged).toHaveLength(1)
  })

  it('matches previous days by index when the regenerated ids are new', () => {
    const shifted = [
      day({ id: 'new_d1', date: '2025-03-05', index: 1, items: [item({ id: 'fresh_one' })] }),
      day({ id: 'new_d2', date: '2025-03-06', index: 2, items: [item({ id: 'fresh_two' })] }),
    ]
    const merged = mergeGeneratedDays(existing, shifted)
    expect(idsOf(merged[0])).toContain('user_breakfast')
  })

  it('carries preserved items onto a reflowed day with a new date', () => {
    const reflowed = [
      day({ id: 'new_d1', date: '2025-03-10', index: 1, items: [item({ id: 'fresh_one' })] }),
      day({ id: 'new_d2', date: '2025-03-11', index: 2, items: [item({ id: 'fresh_two' })] }),
    ]
    const merged = mergeGeneratedDays(existing, reflowed)
    expect(merged[0].date).toBe('2025-03-10')
    expect(idsOf(merged[0])).toContain('user_breakfast')
  })

  it('adopts the regenerated day metadata', () => {
    const retitled = [day({ title: 'Arrival', items: [] })]
    expect(mergeGeneratedDays(existing, retitled)[0].title).toBe('Arrival')
  })

  it('returns the regenerated days when there is nothing existing', () => {
    expect(mergeGeneratedDays([], generated)).toHaveLength(2)
  })

  it('leaves a day empty when the previous day had nothing to preserve', () => {
    const allAi = [day({ items: [item({ id: 'ai_only', source: 'ai' })] })]
    const merged = mergeGeneratedDays(allAi, [day({ items: [] })])
    expect(merged[0].items).toEqual([])
  })

  it('carries preserved items onto an otherwise empty regenerated day', () => {
    const merged = mergeGeneratedDays(existing, [day({ items: [] })])
    expect(idsOf(merged[0])).toEqual(['user_breakfast', 'catalog_museum'])
  })

  it('does not mutate the existing days', () => {
    mergeGeneratedDays(existing, generated)
    expect(idsOf(existing[0])).toEqual(['user_breakfast', 'catalog_museum', 'ai_unescorted'])
  })
})

/**
 * Shortening the date range used to delete every dropped day whole - the
 * traveller's own stops with it - because the merge only ever mapped over the
 * *generated* days and an existing day with no counterpart simply vanished. The
 * edit dialog promises the opposite: "anything you added or edited yourself is
 * kept". These tests hold that promise to account.
 */
describe('mergeGeneratedDays when the date range shrinks', () => {
  const week = [1, 2, 3, 4, 5, 6, 7].map((index) =>
    day({
      id: `trip_1_d${index}`,
      date: `2025-03-0${index}`,
      index,
      items: [item({ id: `ai_d${index}`, source: 'ai', editedByUser: false, startTime: '12:00' })],
    }),
  )

  function withItemsOnDay(index: number, items: ItineraryItem[]): ItineraryDay[] {
    return week.map((existingDay) =>
      existingDay.index === index
        ? { ...existingDay, items: [...existingDay.items, ...items] }
        : existingDay,
    )
  }

  /** The first three days of the same trip: the range now ends on day 3. */
  const shortened = week.slice(0, 3).map((existingDay) => ({
    ...existingDay,
    items: [item({ id: `fresh_d${existingDay.index}`, source: 'ai', startTime: '10:00' })],
  }))

  it('keeps a traveller-added stop from a day the new range no longer has', () => {
    const existing = withItemsOnDay(7, [
      item({ id: 'user_last_day', source: 'user', startTime: '09:00' }),
    ])
    const merged = mergeGeneratedDays(existing, shortened)

    expect(merged).toHaveLength(3)
    expect(merged.flatMap(idsOf)).toContain('user_last_day')
  })

  it('keeps a catalog stop from a dropped day', () => {
    const existing = withItemsOnDay(6, [
      item({ id: 'catalog_last_day', source: 'catalog', startTime: '09:00' }),
    ])
    expect(mergeGeneratedDays(existing, shortened).flatMap(idsOf)).toContain('catalog_last_day')
  })

  it('keeps a hand-edited AI stop from a dropped day', () => {
    const existing = withItemsOnDay(5, [
      item({ id: 'edited_last_day', source: 'ai', editedByUser: true, startTime: '09:00' }),
    ])
    expect(mergeGeneratedDays(existing, shortened).flatMap(idsOf)).toContain('edited_last_day')
  })

  it('carries a dropped stop onto the nearest surviving day', () => {
    const existing = withItemsOnDay(7, [
      item({ id: 'user_last_day', source: 'user', startTime: '09:00' }),
    ])
    const merged = mergeGeneratedDays(existing, shortened)

    // Day 7 is nearest to the last surviving day, day 3.
    expect(idsOf(merged[2])).toContain('user_last_day')
    expect(idsOf(merged[0])).not.toContain('user_last_day')
  })

  it('carries a stop dropped off the front onto the first surviving day', () => {
    const laterHalf = week.slice(4).map((existingDay) => ({
      ...existingDay,
      items: [item({ id: `fresh_d${existingDay.index}`, source: 'ai', startTime: '10:00' })],
    }))
    const existing = withItemsOnDay(1, [
      item({ id: 'user_first_day', source: 'user', startTime: '09:00' }),
    ])
    const merged = mergeGeneratedDays(existing, laterHalf)

    expect(idsOf(merged[0])).toContain('user_first_day')
  })

  it('still discards purely-AI stops from a dropped day', () => {
    const merged = mergeGeneratedDays(week, shortened)

    expect(merged.flatMap(idsOf)).not.toContain('ai_d7')
    expect(merged.flatMap(idsOf)).not.toContain('ai_d4')
  })

  it('carries every preserved stop exactly once', () => {
    const existing = withItemsOnDay(7, [
      item({ id: 'user_last_day', source: 'user', startTime: '09:00' }),
      item({ id: 'catalog_last_day', source: 'catalog', startTime: '13:00' }),
    ])
    const ids = mergeGeneratedDays(existing, shortened).flatMap(idsOf)

    expect(ids.filter((id) => id === 'user_last_day')).toHaveLength(1)
    expect(ids.filter((id) => id === 'catalog_last_day')).toHaveLength(1)
  })

  it('collects preserved stops from several dropped days', () => {
    const existing = withItemsOnDay(5, [
      item({ id: 'user_d5', source: 'user', startTime: '09:00' }),
    ]).map((existingDay) =>
      existingDay.index === 7
        ? {
            ...existingDay,
            items: [...existingDay.items, item({ id: 'user_d7', source: 'user', startTime: '16:00' })],
          }
        : existingDay,
    )
    const ids = mergeGeneratedDays(existing, shortened).flatMap(idsOf)

    expect(ids).toContain('user_d5')
    expect(ids).toContain('user_d7')
  })

  it('re-sorts the receiving day after carrying stops onto it', () => {
    const existing = withItemsOnDay(7, [
      item({ id: 'user_early', source: 'user', startTime: '07:00' }),
      item({ id: 'user_late', source: 'user', startTime: '21:00' }),
    ])
    const receiving = mergeGeneratedDays(existing, shortened)[2]
    const times = receiving.items.map((entry) => entry.startTime)

    expect(times).toEqual([...times].sort())
    expect(idsOf(receiving)[0]).toBe('user_early')
    expect(idsOf(receiving).at(-1)).toBe('user_late')
  })

  it('keeps the carried stop payload untouched', () => {
    const carried = item({ id: 'user_last_day', source: 'user', startTime: '09:00', notes: 'Booked' })
    const existing = withItemsOnDay(7, [carried])
    const merged = mergeGeneratedDays(existing, shortened)

    expect(merged.flatMap((entry) => entry.items).find((entry) => entry.id === 'user_last_day')).toEqual(
      carried,
    )
  })

  it('does not mutate the dropped day it rescued from', () => {
    const existing = withItemsOnDay(7, [
      item({ id: 'user_last_day', source: 'user', startTime: '09:00' }),
    ])
    mergeGeneratedDays(existing, shortened)

    expect(idsOf(existing[6])).toEqual(['ai_d7', 'user_last_day'])
  })

  /**
   * An end date before the start date leaves `eachDay` with nothing to return,
   * so the generated set is empty and there is no surviving day to carry
   * anything to. Emptying the itinerary would be the one outcome worse than
   * doing nothing.
   */
  it('keeps the itinerary when the regenerated set is empty', () => {
    const existing = withItemsOnDay(1, [
      item({ id: 'user_first_day', source: 'user', startTime: '09:00' }),
    ])
    const merged = mergeGeneratedDays(existing, [])

    expect(merged).toHaveLength(7)
    expect(merged.flatMap(idsOf)).toContain('user_first_day')
  })
})
