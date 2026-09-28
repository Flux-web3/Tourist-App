import { sumAmounts } from './money'
import { differenceInDays, timeToMinutes } from './format'
import { nowISO } from './ids'
import type { CurrencyCode, ItineraryDay, ItineraryItem } from './types'

/**
 * Every function here is pure: it takes days, returns new days, and never
 * mutates its input. That is what lets the reducer stay trivially testable and
 * what guarantees a regeneration or a single-item swap cannot quietly disturb
 * unrelated activities. The one exception is `moveItemInDays`: when a caller
 * leaves out its `timestamp`, it reads the clock for that stamp.
 */

export function isPreservedOnRegenerate(item: ItineraryItem): boolean {
  return item.source !== 'ai' || item.editedByUser
}

/** Chronological, with traveller-authored items winning ties so edits stay put. */
export function sortItems(items: readonly ItineraryItem[]): ItineraryItem[] {
  return [...items].sort((a, b) => {
    const byTime = timeToMinutes(a.startTime) - timeToMinutes(b.startTime)
    if (byTime !== 0) return byTime
    const aPreserved = isPreservedOnRegenerate(a) ? 0 : 1
    const bPreserved = isPreservedOnRegenerate(b) ? 0 : 1
    if (aPreserved !== bPreserved) return aPreserved - bPreserved
    return a.createdAt.localeCompare(b.createdAt)
  })
}

export function findItemInDays(
  days: readonly ItineraryDay[],
  itemId: string,
): { day: ItineraryDay; item: ItineraryItem } | null {
  for (const day of days) {
    const item = day.items.find((candidate) => candidate.id === itemId)
    if (item) return { day, item }
  }
  return null
}

function mapDays(
  days: readonly ItineraryDay[],
  itemId: string,
  update: (item: ItineraryItem) => ItineraryItem,
): ItineraryDay[] {
  return days.map((day) =>
    day.items.some((item) => item.id === itemId)
      ? { ...day, items: day.items.map((item) => (item.id === itemId ? update(item) : item)) }
      : day,
  )
}

/**
 * Inserts the new item at the requested slot, then puts the day back in
 * chronological order.
 *
 * The day's order is `sortItems` order, and `position` does not override it.
 * Among stops that share a start time the traveller's own stops come first and
 * then the older one, so a new stop dropped at slot 0 beside an older 09:00 stop
 * still lands after it. `position` only settles a complete tie: same start time,
 * same ownership, same creation stamp, where the stable sort keeps the slot it
 * was given.
 *
 * Honouring `position` over the tie-break would not last: every regeneration
 * re-sorts each day through `sortItems`, so the order would silently snap back.
 * A day is also never left with a 09:00 stop below an 18:00 one, because it is
 * rendered chronologically and an out-of-order array would read as a bug.
 */
export function insertItemAt(
  days: readonly ItineraryDay[],
  dayId: string,
  item: ItineraryItem,
  position?: number,
): ItineraryDay[] {
  return days.map((day) => {
    if (day.id !== dayId) return day
    const items = [...day.items]
    const index = position === undefined ? items.length : Math.max(0, Math.min(position, items.length))
    items.splice(index, 0, item)
    return { ...day, items: sortItems(items) }
  })
}

/**
 * Applies the patch, and re-sorts the day when the edit moved the stop in time.
 *
 * The itinerary screen lets the traveller pick any start time, so an edit that
 * moves a stop from 18:00 to 09:00 has to move it in the day as well - it used
 * to stay in its old slot and the day rendered out of order. An edit that only
 * changes a title, a note or a cost deliberately does not re-sort: nothing moved
 * in time, and shuffling the day for a rename would be its own small surprise.
 */
export function updateItemInDays(
  days: readonly ItineraryDay[],
  itemId: string,
  patch: Partial<Omit<ItineraryItem, 'id' | 'tripId'>>,
  timestamp: string,
): ItineraryDay[] {
  const located = findItemInDays(days, itemId)
  const next = mapDays(days, itemId, (item) => ({
    ...item,
    ...patch,
    editedByUser: true,
    updatedAt: timestamp,
  }))
  if (!located || patch.startTime === undefined || patch.startTime === located.item.startTime) {
    return next
  }
  return next.map((day) =>
    day.items.some((item) => item.id === itemId) ? { ...day, items: sortItems(day.items) } : day,
  )
}

/**
 * Targeted swap: one slot changes, every other item keeps its identity.
 *
 * The slot keeps its original `createdAt`, so it keeps its place among stops
 * that share its start time. If the replacement starts at a different time, the
 * day is re-sorted, as `updateItemInDays` does for a hand-edited time. Today the
 * alternative always keeps the slot's time, but nothing here relies on that.
 */
export function replaceItemInDays(
  days: readonly ItineraryDay[],
  itemId: string,
  replacement: ItineraryItem,
  timestamp: string,
): ItineraryDay[] {
  const located = findItemInDays(days, itemId)
  const next = mapDays(days, itemId, (item) => ({
    ...replacement,
    id: item.id,
    tripId: item.tripId,
    createdAt: item.createdAt,
    editedByUser: true,
    updatedAt: timestamp,
  }))
  if (!located || replacement.startTime === located.item.startTime) return next
  return next.map((day) =>
    day.items.some((item) => item.id === itemId) ? { ...day, items: sortItems(day.items) } : day,
  )
}

export function removeItemFromDays(days: readonly ItineraryDay[], itemId: string): ItineraryDay[] {
  return days.map((day) =>
    day.items.some((item) => item.id === itemId)
      ? { ...day, items: day.items.filter((item) => item.id !== itemId) }
      : day,
  )
}

/**
 * Moves an item to another day (or another slot on the same day). The receiving
 * day is re-sorted by `insertItemAt`, so a stop dragged to a day never lands
 * out of chronological order.
 *
 * A stop moved to another day becomes the traveller's: it is flagged
 * `editedByUser` and stamped with `timestamp`. The traveller put it on that date
 * on purpose, and an untouched AI stop is disposable, so without the flag the
 * next Regenerate threw the moved stop away.
 *
 * A move within the same day is not an edit, and the stop keeps its identity.
 * The day is chronological, so such a move keeps the stop's date and time. The
 * only possible change is its order among stops that start at the same minute,
 * and `sortItems` decides that order, not the move.
 *
 * `timestamp` defaults to now so existing callers get a fresh `updatedAt`
 * without changes. A caller that needs a deterministic result should pass one.
 *
 * An unknown target day leaves the days as they were. Removing the stop first
 * and then finding nowhere to put it would delete it.
 */
export function moveItemInDays(
  days: readonly ItineraryDay[],
  itemId: string,
  targetDayId: string,
  targetIndex?: number,
  timestamp: string = nowISO(),
): ItineraryDay[] {
  const located = findItemInDays(days, itemId)
  if (!located || !days.some((day) => day.id === targetDayId)) return [...days]
  const moved: ItineraryItem =
    located.day.id === targetDayId
      ? located.item
      : { ...located.item, editedByUser: true, updatedAt: timestamp }
  const withoutItem = removeItemFromDays(days, itemId).map((day) =>
    day.id === targetDayId ? { ...day, items: [...day.items] } : day,
  )
  return insertItemAt(withoutItem, targetDayId, moved, targetIndex)
}

/**
 * The surviving day closest to one that found no counterpart. Closeness is
 * measured in calendar days, or in day numbers when the merge is matching by
 * day number, so the choice always agrees with how the days were paired.
 */
function nearestDayIndex(
  days: readonly ItineraryDay[],
  dropped: ItineraryDay,
  byDayNumber: boolean,
): number {
  let nearest = 0
  let smallest = Number.POSITIVE_INFINITY
  days.forEach((day, index) => {
    const distance = byDayNumber
      ? Math.abs(day.index - dropped.index)
      : Math.abs(differenceInDays(day.date, dropped.date))
    // Strictly smaller, so an exact tie resolves to the earlier day and the
    // result stays deterministic.
    if (distance < smallest) {
      smallest = distance
      nearest = index
    }
  })
  return nearest
}

/**
 * Regeneration keeps everything the traveller owns (added, catalog-sourced or
 * hand-edited) and swaps in a fresh set of AI drafts for the rest.
 *
 * Each existing day is paired with at most one generated day, and every
 * preserved stop comes through exactly once.
 *
 * Pairing is by calendar date. A stop the traveller put on 11 March is about 11
 * March, so it stays on 11 March whatever the edit does to the start date. Day
 * ids and day numbers are positional (`<trip>_d2` is "the second day"), so
 * pairing on them first meant a trip that started two days earlier moved every
 * stop two days later. A day could also be claimed twice, once by id and again
 * by date, which put a booked dinner on the plan twice and counted its cost twice
 * in the AI Draft Estimate.
 *
 * Pairing falls back to the day number only when the new range shares no date
 * with the old one, that is, when the trip was moved wholesale (to next month,
 * say). Then "day 2" is the only meaning left, and the plan keeps its shape. If
 * the ranges overlap, a day that lost its date is never re-paired by number.
 * That day always lies outside the new range and its numbered partner outside
 * the old one, on the far side of every date both ranges share, so the stop
 * would jump past stops the traveller had placed after it.
 *
 * A day with no partner, usually because the trip got shorter, has its preserved
 * stops carried onto the nearest surviving day. Its purely-AI stops are
 * discarded, because those are regenerable. Losing the traveller's stops with
 * the day would be silent data loss, the opposite of what the edit dialog
 * promises.
 */
export function mergeGeneratedDays(
  existing: readonly ItineraryDay[],
  generated: readonly ItineraryDay[],
): ItineraryDay[] {
  // No day survives, so there is nowhere to carry anything to. Keeping the
  // itinerary is the only non-destructive answer; emptying it would throw away
  // work to satisfy a range that cannot hold a single day.
  if (generated.length === 0) return [...existing]

  const generatedDates = new Set(generated.map((day) => day.date))
  const byDayNumber = !existing.some((day) => generatedDates.has(day.date))
  const claimed = new Set<ItineraryDay>()

  const merged = generated.map((day) => {
    // Unclaimed only: two generated days must never draw on the same existing day.
    const previous = existing.find(
      (candidate) =>
        !claimed.has(candidate) &&
        (byDayNumber ? candidate.index === day.index : candidate.date === day.date),
    )
    if (previous) claimed.add(previous)
    const preserved = previous ? previous.items.filter(isPreservedOnRegenerate) : []
    return { ...day, items: [...preserved, ...day.items] }
  })

  const rescued = new Map<number, ItineraryItem[]>()
  for (const dropped of existing) {
    if (claimed.has(dropped)) continue
    const carried = dropped.items.filter(isPreservedOnRegenerate)
    if (carried.length === 0) continue
    const target = nearestDayIndex(merged, dropped, byDayNumber)
    rescued.set(target, [...(rescued.get(target) ?? []), ...carried])
  }

  return merged.map((day, index) => {
    const carried = rescued.get(index)
    return { ...day, items: sortItems(carried ? [...day.items, ...carried] : day.items) }
  })
}

/**
 * Totals the planned cost of `days`.
 *
 * With a `currency`, only stops priced in that currency are counted, and the sum
 * is taken on that currency's own minor-unit scale (whole yen for JPY). A
 * catalogue stop saved in EUR inside a naira trip is left out rather than added:
 * nothing here converts between currencies, so the alternative would be a number
 * that means nothing. Callers that need to tell the traveller how much was left
 * out should read `mixedEstimateCurrency` and `uncountedEstimateCount` from
 * `summariseBudget`.
 *
 * Without a `currency` every stop is counted on the two-digit default scale,
 * which is exactly what this function always did.
 */
export function estimateTotal(days: readonly ItineraryDay[], currency?: CurrencyCode): number {
  const items = days.flatMap((day) => day.items)
  const counted = currency === undefined ? items : items.filter((item) => item.currency === currency)
  return sumAmounts(
    counted.map((item) => item.estimatedCost),
    currency,
  )
}

export function countItems(days: readonly ItineraryDay[]): number {
  return days.reduce((total, day) => total + day.items.length, 0)
}

export function findDayById(days: readonly ItineraryDay[], dayId: string): ItineraryDay | null {
  return days.find((day) => day.id === dayId) ?? null
}

export function findDayForDate(days: readonly ItineraryDay[], dateISO: string): ItineraryDay | null {
  return days.find((day) => day.date === dateISO) ?? null
}

export function nextEmptySlotStartTime(day: ItineraryDay): string {
  const latest = day.items.reduce((max, item) => Math.max(max, timeToMinutes(item.startTime)), 8 * 60)
  const minutes = Math.min(latest + 90, 22 * 60)
  const hours = Math.floor(minutes / 60)
  return `${String(hours).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
}
