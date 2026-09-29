import { EXPERIENCES_BY_ID } from '@/data/experiences'
import { sumAmounts } from './money'
import { differenceInDays, parseISODate, timeToMinutes } from './format'
import { nowISO } from './ids'
import type {
  CurrencyCode,
  Experience,
  ItineraryDay,
  ItineraryItem,
  VisitWindow,
  Weekday,
} from './types'

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
 * Whether a stop still belongs on the trip once it is moved to `destinationId`.
 *
 * `mergeGeneratedDays` keeps hand-edited AI stops and catalogue places because
 * a date or pace change leaves them true. A new city does not: "Tower of
 * London" in a Paris plan is wrong however much the traveller edited it. So on
 * a destination change every AI stop goes (arrival and departure included,
 * the new city's replace them), and a catalogue place stays only when it is in
 * the new city's guide. A place Tourist no longer lists, or a trip moving to no
 * listed city, cannot be shown to belong, so it goes too - the same rule
 * `addExperienceToTrip` applies before a place is ever added.
 *
 * The traveller's own stops always stay. Tourist cannot tell whether "Dinner
 * with Sam" was about the old city, and deleting it would be silent data loss.
 */
export function belongsToDestination(item: ItineraryItem, destinationId: string | null): boolean {
  switch (item.source) {
    case 'user':
      return true
    case 'catalog': {
      const place = item.experienceId === null ? undefined : EXPERIENCES_BY_ID.get(item.experienceId)
      return destinationId !== null && place?.destinationId === destinationId
    }
    case 'ai':
      return false
  }
}

/**
 * The days with every stop tied to another destination taken out (see
 * `belongsToDestination`). Days and their dates are kept, so the caller can
 * re-draft them for the new city with `mergeGeneratedDays` exactly as any
 * other re-flow does. Pure: `days` is never modified.
 */
export function stripOtherDestinationItems(
  days: readonly ItineraryDay[],
  destinationId: string | null,
): ItineraryDay[] {
  return days.map((day) => ({
    ...day,
    items: day.items.filter((item) => belongsToDestination(item, destinationId)),
  }))
}

/** What moving a trip's plan to another destination would do to it, stop by stop. */
export interface DestinationChangeSummary {
  /** AI-drafted stops (edited or not) that will be removed and re-drafted. */
  draftStops: number
  /** Catalogue places from another city's guide that will be removed. */
  guidePlaces: number
  /** Stops the traveller wrote themselves, which are always kept. */
  ownStops: number
}

/**
 * Counts `stripOtherDestinationItems` would act on, so the edit dialog can say
 * what a destination change removes before the traveller saves it. Built from
 * the same predicate, so the warning and the save cannot disagree.
 */
export function summariseDestinationChange(
  days: readonly ItineraryDay[],
  destinationId: string | null,
): DestinationChangeSummary {
  const summary: DestinationChangeSummary = { draftStops: 0, guidePlaces: 0, ownStops: 0 }
  for (const item of days.flatMap((day) => day.items)) {
    if (item.source === 'user') summary.ownStops += 1
    else if (belongsToDestination(item, destinationId)) continue
    else if (item.source === 'catalog') summary.guidePlaces += 1
    else summary.draftStops += 1
  }
  return summary
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

/*
 * Suggesting a start time for a catalogue place.
 *
 * `nextEmptySlotStartTime` above only looks at the day's latest start, which is
 * fine for the traveller's own stops (they pick the time) but put the Tower of
 * London at 21:30 after an evening pub stop. A place has usual hours and a
 * length, so it is fitted between the day's stops instead, inside those hours,
 * or not suggested at all.
 */

/** Gap kept between one stop's end and the next start; the generator's BUFFER_MINUTES. */
export const SLOT_BUFFER_MINUTES = 15

/**
 * How long before a departure a suggested place must end. It mirrors the
 * generator's `FINAL_DAY_BUFFER_MINUTES` (a test holds them equal); the domain
 * cannot import services, and reading the departure's own start time here
 * means a departure the traveller moved is respected too.
 */
export const DEPARTURE_BUFFER_MINUTES = 90

/** A stop saved without an end time is assumed to take this long. */
export const DEFAULT_STOP_MINUTES = 60

/** Suggestions snap to the quarter hour so they read like times people pick. */
const SLOT_STEP_MINUTES = 15

/**
 * Nothing is suggested to start before 09:00 or end after 23:00, whatever a
 * place's hours say: Hyde Park opening at 05:00 or the Metro running to 00:30
 * does not make either a sensible suggestion. A typed time is never limited.
 */
const EARLIEST_SUGGESTED_START = '09:00'
const LATEST_SUGGESTED_END = '23:00'

/** For a place whose note gives no hours: a plain working day. */
export const DAYTIME_DEFAULT_WINDOW: VisitWindow = { opens: '09:00', closes: '18:00' }

/** For nightlife whose note gives no hours ("evenings, with live shows late"). */
export const EVENING_DEFAULT_WINDOW: VisitWindow = { opens: '18:00', closes: LATEST_SUGGESTED_END }

export type PlaceForSlot = Pick<Experience, 'durationMinutes' | 'category' | 'visitWindow'>

export type SlotWindowSource = 'hours' | 'daytime-default' | 'evening-default'

export type PlaceSlotSuggestion =
  | { kind: 'slot'; startTime: string; window: VisitWindow; windowSource: SlotWindowSource }
  | { kind: 'none'; window: VisitWindow; windowSource: SlotWindowSource }

function minutesToTime(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  return `${String(hours).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
}

/** The window a place is scheduled in, and where it came from. */
export function placeVisitWindow(place: PlaceForSlot): { window: VisitWindow; source: SlotWindowSource } {
  if (place.visitWindow) return { window: place.visitWindow, source: 'hours' }
  return place.category === 'nightlife'
    ? { window: EVENING_DEFAULT_WINDOW, source: 'evening-default' }
    : { window: DAYTIME_DEFAULT_WINDOW, source: 'daytime-default' }
}

/**
 * The earliest start, on the quarter hour, at which `place` fits whole into
 * `day`: inside its usual hours, clear of every existing stop by
 * `SLOT_BUFFER_MINUTES`, after any arrival, and ending
 * `DEPARTURE_BUFFER_MINUTES` before any departure. When nothing fits the answer
 * is `none`, never a late time; the traveller then picks one.
 *
 * Only the day's existing stops are read. Pure: nothing is modified.
 */
export function suggestPlaceSlot(day: ItineraryDay, place: PlaceForSlot): PlaceSlotSuggestion {
  const { window, source } = placeVisitWindow(place)
  const opens = timeToMinutes(window.opens)
  const rawCloses = window.closes === null ? null : timeToMinutes(window.closes)
  // A close at or before the opening ("05:30 - 00:30", midnight) is past midnight.
  const closes = rawCloses === null || rawCloses <= opens ? Number.POSITIVE_INFINITY : rawCloses

  const busy = day.items
    .map((item) => {
      const start = timeToMinutes(item.startTime)
      const end = item.endTime === null ? start : timeToMinutes(item.endTime)
      return { start, end: end > start ? end : start + DEFAULT_STOP_MINUTES, role: item.role }
    })
    .sort((a, b) => a.start - b.start)

  let earliest = Math.max(opens, timeToMinutes(EARLIEST_SUGGESTED_START))
  let latestEnd = Math.min(closes, timeToMinutes(LATEST_SUGGESTED_END))
  for (const stop of busy) {
    if (stop.role === 'arrival') earliest = Math.max(earliest, stop.end + SLOT_BUFFER_MINUTES)
    if (stop.role === 'departure') latestEnd = Math.min(latestEnd, stop.start - DEPARTURE_BUFFER_MINUTES)
  }

  const duration = Math.max(0, place.durationMinutes)
  const roundUp = (minutes: number) => Math.ceil(minutes / SLOT_STEP_MINUTES) * SLOT_STEP_MINUTES
  let start = roundUp(earliest)
  for (const stop of busy) {
    if (start + duration > latestEnd) break
    if (start + duration + SLOT_BUFFER_MINUTES <= stop.start) break
    start = Math.max(start, roundUp(stop.end + SLOT_BUFFER_MINUTES))
  }
  return start + duration <= latestEnd
    ? { kind: 'slot', startTime: minutesToTime(start), window, windowSource: source }
    : { kind: 'none', window, windowSource: source }
}

const WEEKDAYS: readonly Weekday[] = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
]

/** The weekday a dated day falls on, or null for a date that does not parse. */
export function weekdayOf(dateISO: string): Weekday | null {
  const date = parseISODate(dateISO)
  return date ? WEEKDAYS[date.getUTCDay()] : null
}

/** Whether the place's demo hours name `dateISO`'s weekday as a closed day. */
export function isListedClosedOn(place: Pick<Experience, 'visitWindow'>, dateISO: string): boolean {
  const weekday = weekdayOf(dateISO)
  return weekday !== null && (place.visitWindow?.closedOn ?? []).includes(weekday)
}
