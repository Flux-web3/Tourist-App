import { sumAmounts } from './money'
import { timeToMinutes } from './format'
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

/** Inserts without displacing anything: the new item takes the requested slot. */
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
    return { ...day, items }
  })
}

export function updateItemInDays(
  days: readonly ItineraryDay[],
  itemId: string,
  patch: Partial<Omit<ItineraryItem, 'id' | 'tripId'>>,
  timestamp: string,
): ItineraryDay[] {
  return mapDays(days, itemId, (item) => ({
    ...item,
    ...patch,
    editedByUser: true,
    updatedAt: timestamp,
  }))
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

/**
 * Regeneration keeps everything the traveller owns (added, catalog-sourced or
 * hand-edited) and swaps in a fresh set of AI drafts for the rest.
 */
export function mergeGeneratedDays(
  existing: readonly ItineraryDay[],
  generated: readonly ItineraryDay[],
): ItineraryDay[] {
  return generated.map((day) => {
    const previous =
      existing.find((candidate) => candidate.id === day.id) ??
      existing.find((candidate) => candidate.date === day.date) ??
      existing.find((candidate) => candidate.index === day.index)
    const preserved = previous ? previous.items.filter(isPreservedOnRegenerate) : []
    return { ...day, items: sortItems([...preserved, ...day.items]) }
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
