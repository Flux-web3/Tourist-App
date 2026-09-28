import { sumAmounts } from './money'
import { differenceInDays, timeToMinutes } from './format'
import type { ItineraryDay, ItineraryItem } from './types'

/**
 * Every function here is pure: it takes days, returns new days, and never
 * mutates its input. That is what lets the reducer stay trivially testable and
 * what guarantees a regeneration or a single-item swap cannot quietly disturb
 * unrelated activities.
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
 * `position` still decides where the item lands among stops that share its
 * start time, because `sortItems` is a stable sort with a deterministic
 * tie-break. What it can no longer do is leave a 09:00 stop sitting below an
 * 18:00 one: the day is rendered chronologically, so an out-of-order array
 * would read as a bug to the traveller.
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

/** Targeted swap: one slot changes, every other item keeps its identity. */
export function replaceItemInDays(
  days: readonly ItineraryDay[],
  itemId: string,
  replacement: ItineraryItem,
  timestamp: string,
): ItineraryDay[] {
  return mapDays(days, itemId, (item) => ({
    ...replacement,
    id: item.id,
    tripId: item.tripId,
    editedByUser: true,
    updatedAt: timestamp,
  }))
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
 */
export function moveItemInDays(
  days: readonly ItineraryDay[],
  itemId: string,
  targetDayId: string,
  targetIndex?: number,
): ItineraryDay[] {
  const located = findItemInDays(days, itemId)
  if (!located) return [...days]
  const withoutItem = removeItemFromDays(days, itemId).map((day) =>
    day.id === targetDayId ? { ...day, items: [...day.items] } : day,
  )
  return insertItemAt(withoutItem, targetDayId, located.item, targetIndex)
}

/** The surviving day closest in time to a day that the new range dropped. */
function nearestDayIndex(days: readonly ItineraryDay[], dateISO: string): number {
  let nearest = 0
  let smallest = Number.POSITIVE_INFINITY
  days.forEach((day, index) => {
    const distance = Math.abs(differenceInDays(day.date, dateISO))
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
 * Shortening a trip is the delicate case. The new day set is shorter than the
 * old one, so some existing days have no counterpart at all. Mapping over the
 * generated set alone would take those days out whole, and with them every stop
 * the traveller had added, saved from the catalogue or hand-edited - silent data
 * loss, and the opposite of what the edit dialog promises. So preserved items on
 * a dropped day are carried onto the nearest surviving day instead. Purely-AI
 * stops on a dropped day are discarded, because those are regenerable.
 */
export function mergeGeneratedDays(
  existing: readonly ItineraryDay[],
  generated: readonly ItineraryDay[],
): ItineraryDay[] {
  // No day survives, so there is nowhere to carry anything to. Keeping the
  // itinerary is the only non-destructive answer; emptying it would throw away
  // work to satisfy a range that cannot hold a single day.
  if (generated.length === 0) return [...existing]

  const claimed = new Set<ItineraryDay>()
  const merged = generated.map((day) => {
    const previous =
      existing.find((candidate) => candidate.id === day.id) ??
      existing.find((candidate) => candidate.date === day.date) ??
      existing.find((candidate) => candidate.index === day.index)
    if (previous) claimed.add(previous)
    const preserved = previous ? previous.items.filter(isPreservedOnRegenerate) : []
    return { ...day, items: [...preserved, ...day.items] }
  })

  const rescued = new Map<number, ItineraryItem[]>()
  for (const dropped of existing) {
    if (claimed.has(dropped)) continue
    const carried = dropped.items.filter(isPreservedOnRegenerate)
    if (carried.length === 0) continue
    const target = nearestDayIndex(merged, dropped.date)
    rescued.set(target, [...(rescued.get(target) ?? []), ...carried])
  }

  return merged.map((day, index) => {
    const carried = rescued.get(index)
    return { ...day, items: sortItems(carried ? [...day.items, ...carried] : day.items) }
  })
}

export function estimateTotal(days: readonly ItineraryDay[]): number {
  return sumAmounts(days.flatMap((day) => day.items.map((item) => item.estimatedCost)))
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
