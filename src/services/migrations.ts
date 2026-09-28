/**
 * Reading a stored snapshot: the forward migration ladder, and the per-record
 * salvage pass that runs after it.
 *
 * The rule this file exists to enforce is that a traveller never loses a trip,
 * a day, an expense or a note to a schema change. The old reader validated the
 * whole payload with a single type guard and returned `null` on any mismatch, so
 * a currency it did not recognise, a field gone `null`, a key added after the
 * snapshot was written or a version bump each discarded *everything*.
 *
 * So reading happens in two passes:
 *
 * 1. **Migrate.** The payload's own `version` picks a starting rung and each
 *    `{ from, to, migrate }` step runs in order until the current version is
 *    reached. Steps see the raw JSON, not validated records, because their job
 *    is to reshape it into something this build can validate.
 * 2. **Salvage.** Every record is then validated on its own. Anything genuinely
 *    unusable is dropped and counted; anything merely missing or malformed in a
 *    field with a safe default is repaired. Only a payload that is not an object,
 *    or that has neither a usable user nor a single usable trip, is unreadable.
 */

import { EXPERIENCES_BY_ID } from '@/data/experiences'
import { createId, nowISO } from '@/domain/ids'
import { CURRENCIES, toCents } from '@/domain/money'
import type {
  CurrencyCode,
  Expense,
  ExpenseCategory,
  GenerationState,
  GenerationStatus,
  ItineraryCategory,
  ItineraryDay,
  ItineraryItem,
  ItineraryItemSource,
  ThemePreference,
  TravelInterest,
  TravelPace,
  Trip,
  TripNote,
  TripStatus,
  User,
} from '@/domain/types'
import { STORAGE_VERSION, type PersistedState, type PersistenceSalvage } from './contracts'
// Generated stops are priced in this currency whatever the trip's currency, so
// a pre-v2 AI stop is backfilled with it rather than with the trip's.
import { DRAFT_PRICE_CURRENCY } from './itineraryGenerator'

/** The oldest version this build knows how to read. A payload with no usable
 * `version` is assumed to be this, which salvages it instead of discarding it. */
const EARLIEST_VERSION = 1

const TRAVEL_INTERESTS = [
  'culture',
  'food',
  'outdoors',
  'nightlife',
  'shopping',
  'relaxed',
] as const satisfies readonly TravelInterest[]

const TRAVEL_PACES = ['relaxed', 'balanced', 'packed'] as const satisfies readonly TravelPace[]

const TRIP_STATUSES = ['draft', 'itinerary_ready'] as const satisfies readonly TripStatus[]

const ITINERARY_CATEGORIES = [
  'food',
  'sightseeing',
  'culture',
  'outdoors',
  'shopping',
  'nightlife',
  'transit',
  'stay',
] as const satisfies readonly ItineraryCategory[]

const ITINERARY_SOURCES = ['ai', 'user', 'catalog'] as const satisfies readonly ItineraryItemSource[]

const EXPENSE_CATEGORIES = [
  'stay',
  'food',
  'transport',
  'activities',
  'shopping',
  'other',
] as const satisfies readonly ExpenseCategory[]

const THEME_PREFERENCES = ['light', 'dark', 'system'] as const satisfies readonly ThemePreference[]

const GENERATION_STATUSES = [
  'idle',
  'loading',
  'success',
  'error',
] as const satisfies readonly GenerationStatus[]

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isOneOf<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === 'string' && allowed.some((candidate) => candidate === value)
}

function isCurrency(value: unknown): value is CurrencyCode {
  return isString(value) && CURRENCIES.some((code) => code === value)
}

/** A string field with a safe empty default: a blank note beats a dropped record. */
function orEmpty(value: unknown): string {
  return isString(value) ? value : ''
}

/** A nullable string field. Anything that is neither reads as absent. */
function orNull(value: unknown): string | null {
  return isString(value) ? value : null
}

/** A timestamp field. A record with no usable timestamp is still the traveller's. */
function orNow(value: unknown): string {
  return isString(value) ? value : nowISO()
}

export function noSalvage(): PersistenceSalvage {
  return {
    trips: 0,
    days: 0,
    items: 0,
    expenses: 0,
    notes: 0,
    generation: 0,
    orphanedDayBuckets: 0,
    unmatchedCatalogItems: 0,
    rebuiltUser: false,
  }
}

/** True when a read or write came through with every record intact. */
export function isCleanSalvage(salvage: PersistenceSalvage): boolean {
  return (
    salvage.trips === 0 &&
    salvage.days === 0 &&
    salvage.items === 0 &&
    salvage.expenses === 0 &&
    salvage.notes === 0 &&
    salvage.generation === 0 &&
    salvage.orphanedDayBuckets === 0 &&
    !salvage.rebuiltUser
  )
}

/** A one-line summary for a DEV warning. Empty when nothing was salvaged. */
export function describeSalvage(salvage: PersistenceSalvage): string {
  const parts: string[] = []
  if (salvage.trips) parts.push(`${salvage.trips} trip(s)`)
  if (salvage.days) parts.push(`${salvage.days} day(s)`)
  if (salvage.items) parts.push(`${salvage.items} itinerary item(s)`)
  if (salvage.expenses) parts.push(`${salvage.expenses} expense(s)`)
  if (salvage.notes) parts.push(`${salvage.notes} note(s)`)
  if (salvage.generation) parts.push(`${salvage.generation} generation record(s)`)
  if (salvage.orphanedDayBuckets) parts.push(`${salvage.orphanedDayBuckets} orphaned day bucket(s)`)
  if (salvage.rebuiltUser) parts.push('rebuilt the user record')
  return parts.join(', ')
}

/* -------------------------------------------------------------------------- */
/* The migration ladder                                                       */
/* -------------------------------------------------------------------------- */

/**
 * One rung. `migrate` receives the raw payload at version `from` and returns it
 * reshaped for version `to`; the driver stamps the new version, so a step never
 * has to remember to. Adding v3 means adding one entry here and one branch of
 * tests - there is deliberately no framework and no dependency.
 */
interface MigrationStep {
  from: number
  to: number
  migrate(payload: Record<string, unknown>, salvage: PersistenceSalvage): Record<string, unknown>
}

/** Ordered, contiguous, and applied in sequence. */
const MIGRATIONS: readonly MigrationStep[] = [{ from: 1, to: 2, migrate: migrateV1ToV2 }]

/** `{ tripId: currency }` for every trip in a raw payload that names a currency this build knows. */
function tripCurrencies(value: unknown): Map<string, CurrencyCode> {
  const currencies = new Map<string, CurrencyCode>()
  if (!Array.isArray(value)) return currencies
  for (const entry of value) {
    if (!isRecord(entry)) continue
    if (!isString(entry.id) || !isCurrency(entry.currency)) continue
    currencies.set(entry.id, entry.currency)
  }
  return currencies
}

/**
 * The currency to price a day bucket's items in, inferred from the bucket's own
 * trip: first by the key the bucket is filed under, then by the `tripId` the
 * days and items carry. `null` means no trip in this snapshot can say, which
 * makes the bucket an orphan.
 */
function bucketCurrency(
  tripId: string,
  bucket: unknown,
  currencies: Map<string, CurrencyCode>,
): CurrencyCode | null {
  const byKey = currencies.get(tripId)
  if (byKey) return byKey
  if (!Array.isArray(bucket)) return null
  for (const day of bucket) {
    if (!isRecord(day)) continue
    if (isString(day.tripId)) {
      const byDay = currencies.get(day.tripId)
      if (byDay) return byDay
    }
    if (!Array.isArray(day.items)) continue
    for (const item of day.items) {
      if (!isRecord(item) || !isString(item.tripId)) continue
      const byItem = currencies.get(item.tripId)
      if (byItem) return byItem
    }
  }
  return null
}

function countItems(bucket: unknown): number {
  if (!Array.isArray(bucket)) return 0
  let total = 0
  for (const day of bucket) {
    if (isRecord(day) && Array.isArray(day.items)) total += day.items.length
  }
  return total
}

/**
 * The currency an item that carries none was actually priced in. Deterministic,
 * and never a conversion - there are no exchange rates in this app.
 *
 * - **Generated stops** (`ai`) were priced from the generator's EUR templates,
 *   so they take `DRAFT_PRICE_CURRENCY` - not the trip's currency, which merely
 *   labelled them.
 * - **Hand-added stops** (`user`) were typed by the traveller into a field
 *   labelled with the trip's currency, so they take `trip.currency`.
 * - **Catalogue stops** are the same trap as generated ones. The catalogue
 *   prices everything in its own currency (EUR), so stamping the trip's
 *   currency on a EUR 22 Louvre ticket in a naira trip would turn it into a
 *   permanent NGN 22 - cementing the very mislabel `currency` exists to
 *   remove. So:
 *   - cost still equal to the experience's `priceFrom` -> never touched, so it
 *     is the catalogue's price: `experience.currency`;
 *   - cost different -> the traveller edited it, and before v2 the edit form
 *     labelled that field with the trip's currency, so the number they typed
 *     was in the trip's money: `trip.currency`;
 *   - no experience to compare against (null id, or since removed from the
 *     catalogue) -> `trip.currency`, counted in `unmatchedCatalogItems` so it
 *     can be flagged rather than silently trusted.
 *
 * Costs are compared in the experience's minor units, never with float `===`.
 */
function inferItemCurrency(
  item: Record<string, unknown>,
  tripCurrency: CurrencyCode,
  salvage: PersistenceSalvage,
): CurrencyCode {
  if (item.source === 'ai') return DRAFT_PRICE_CURRENCY
  if (item.source !== 'catalog') return tripCurrency

  const experience = isString(item.experienceId) ? EXPERIENCES_BY_ID.get(item.experienceId) : undefined
  if (!experience) {
    salvage.unmatchedCatalogItems += 1
    return tripCurrency
  }
  // An unreadable cost is dropped by the salvage pass; nothing to infer from.
  if (!isFiniteNumber(item.estimatedCost)) return tripCurrency

  const untouched =
    toCents(item.estimatedCost, experience.currency) ===
    toCents(experience.priceFrom, experience.currency)
  return untouched ? experience.currency : tripCurrency
}

/**
 * v1 -> v2: every itinerary item gains the `currency` it was actually priced
 * in (see `inferItemCurrency`): the traveller's own stops keep the trip's
 * currency they were typed in, while generated and untouched catalogue stops
 * get back the EUR their prices were always quoted in, which the pre-v2 UI
 * mislabelled with the trip's currency.
 *
 * Where the owning trip is gone the bucket cannot be priced at all, so it is
 * dropped and counted rather than guessed at - a wrong currency would silently
 * misstate money, which is worse than an absent day.
 */
function migrateV1ToV2(
  payload: Record<string, unknown>,
  salvage: PersistenceSalvage,
): Record<string, unknown> {
  const buckets = payload.daysByTrip
  // Not a map at all: nothing to walk. The salvage pass reports the loss.
  if (!isRecord(buckets)) return payload

  const currencies = tripCurrencies(payload.trips)
  const next: Record<string, unknown> = {}

  for (const [tripId, bucket] of Object.entries(buckets)) {
    const currency = bucketCurrency(tripId, bucket, currencies)
    if (currency === null) {
      const orphanedItems = countItems(bucket)
      // An empty bucket has no prices to infer, so it survives untouched.
      if (orphanedItems === 0) {
        next[tripId] = bucket
        continue
      }
      salvage.orphanedDayBuckets += 1
      salvage.items += orphanedItems
      continue
    }
    next[tripId] = priceBucket(bucket, currency, salvage)
  }

  return { ...payload, daysByTrip: next }
}

function priceBucket(bucket: unknown, tripCurrency: CurrencyCode, salvage: PersistenceSalvage): unknown {
  if (!Array.isArray(bucket)) return bucket
  return bucket.map((day) => {
    if (!isRecord(day) || !Array.isArray(day.items)) return day
    const items = day.items.map((item) => {
      if (!isRecord(item) || isCurrency(item.currency)) return item
      return { ...item, currency: inferItemCurrency(item, tripCurrency, salvage) }
    })
    return { ...day, items }
  })
}

/** The version a payload declares, or `null` when it declares none this build can use. */
function readVersion(value: unknown): number | null {
  if (!isFiniteNumber(value)) return null
  const version = Math.floor(value)
  return version >= EARLIEST_VERSION ? version : null
}

/** Walks the ladder as far as it can, reporting the rung it stopped on. */
function climb(
  payload: Record<string, unknown>,
  from: number,
  salvage: PersistenceSalvage,
): { payload: Record<string, unknown>; reached: number } {
  let current = from
  let next = payload
  while (current < STORAGE_VERSION) {
    const step = MIGRATIONS.find((candidate) => candidate.from === current)
    if (!step) return { payload: next, reached: current }
    next = { ...step.migrate(next, salvage), version: step.to }
    current = step.to
  }
  return { payload: next, reached: current }
}

/* -------------------------------------------------------------------------- */
/* The salvage pass                                                           */
/* -------------------------------------------------------------------------- */

/**
 * A list of records, keeping every entry that reads and counting the rest.
 * A value that is not a list at all cannot be counted entry by entry, so it
 * contributes 1 - unless it is simply absent, which is not a loss.
 */
function readList<T>(value: unknown, read: (entry: unknown) => T | null): { list: T[]; dropped: number } {
  if (!Array.isArray(value)) {
    return { list: [], dropped: value === undefined || value === null ? 0 : 1 }
  }
  const list: T[] = []
  let dropped = 0
  for (const entry of value) {
    const record = read(entry)
    if (record === null) dropped += 1
    else list.push(record)
  }
  return { list, dropped }
}

/**
 * A trip-keyed map of lists. Keys are preserved even when their list empties
 * out, so a trip that legitimately has no days still reads back as `[]` and the
 * rest of the snapshot is untouched.
 */
function readBuckets<T>(
  value: unknown,
  read: (entry: unknown, tripId: string) => T | null,
): { buckets: Record<string, T[]>; dropped: number } {
  if (!isRecord(value)) {
    return { buckets: {}, dropped: value === undefined || value === null ? 0 : 1 }
  }
  const buckets: Record<string, T[]> = {}
  let dropped = 0
  for (const [tripId, entry] of Object.entries(value)) {
    const { list, dropped: lost } = readList(entry, (record) => read(record, tripId))
    dropped += lost
    buckets[tripId] = list
  }
  return { buckets, dropped }
}

/**
 * A trip is the traveller's top-level record, so it is dropped only when
 * something load-bearing is missing: its identity, its dates, or the currency
 * every amount on it is denominated in. Dropping a trip also hides every day,
 * expense and note filed under it, so everything else defaults instead:
 *
 * - a status or pace this build does not recognise, or a retired interest;
 * - a party size gone missing reads as 1;
 * - a budget gone missing reads as 0, i.e. "no budget set". Both budget screens
 *   already guard that case, and the edit form will not save a trip until a
 *   real budget is entered, so the traveller is prompted rather than misled.
 */
function readTrip(value: unknown): Trip | null {
  if (!isRecord(value)) return null
  if (!isString(value.id)) return null
  if (!isString(value.startDate) || !isString(value.endDate)) return null
  if (!isCurrency(value.currency)) return null

  const interests = Array.isArray(value.interests)
    ? value.interests.filter((interest): interest is TravelInterest =>
        isOneOf(interest, TRAVEL_INTERESTS),
      )
    : []

  return {
    id: value.id,
    userId: orEmpty(value.userId),
    name: orEmpty(value.name),
    origin: orEmpty(value.origin),
    destination: orEmpty(value.destination),
    startDate: value.startDate,
    endDate: value.endDate,
    travelers: isFiniteNumber(value.travelers) && value.travelers >= 1 ? value.travelers : 1,
    budget: isFiniteNumber(value.budget) && value.budget >= 0 ? value.budget : 0,
    currency: value.currency,
    interests,
    pace: isOneOf(value.pace, TRAVEL_PACES) ? value.pace : 'balanced',
    notes: orEmpty(value.notes),
    status: isOneOf(value.status, TRIP_STATUSES) ? value.status : 'draft',
    createdAt: orNow(value.createdAt),
    updatedAt: orNow(value.updatedAt),
  }
}

/**
 * An itinerary item is dropped when its identity, its category, its start time,
 * its cost, its source or its currency cannot be read. Those are the fields the
 * schedule and the budget are built from; an item with an invented category
 * would be filed under the wrong heading and one with an invented currency would
 * misstate money. Free text and flags default.
 *
 * A *missing* currency is inferred exactly as the v1 migration infers it (see
 * `inferItemCurrency`). A *present* one is never overwritten, even when it
 * differs from the trip's: a catalogue stop priced in euro stays in euro inside
 * a naira trip, because that is what it costs.
 */
function readItem(
  value: unknown,
  tripId: string,
  currency: CurrencyCode | null,
  salvage: PersistenceSalvage,
): ItineraryItem | null {
  if (!isRecord(value)) return null
  if (!isString(value.id)) return null
  if (!isOneOf(value.category, ITINERARY_CATEGORIES)) return null
  if (!isString(value.startTime)) return null
  if (!isFiniteNumber(value.estimatedCost)) return null
  if (!isOneOf(value.source, ITINERARY_SOURCES)) return null

  let resolved: CurrencyCode
  if (isCurrency(value.currency)) resolved = value.currency
  else if (currency === null) return null
  else resolved = inferItemCurrency(value, currency, salvage)

  return {
    id: value.id,
    tripId: isString(value.tripId) ? value.tripId : tripId,
    title: orEmpty(value.title),
    category: value.category,
    startTime: value.startTime,
    endTime: orNull(value.endTime),
    location: orEmpty(value.location),
    description: orEmpty(value.description),
    estimatedCost: value.estimatedCost,
    currency: resolved,
    source: value.source,
    editedByUser: value.editedByUser === true,
    experienceId: orNull(value.experienceId),
    notes: orEmpty(value.notes),
    createdAt: orNow(value.createdAt),
    updatedAt: orNow(value.updatedAt),
  }
}

function readDay(
  value: unknown,
  tripId: string,
  currency: CurrencyCode | null,
  salvage: PersistenceSalvage,
): ItineraryDay | null {
  if (!isRecord(value)) return null
  if (!isString(value.id) || !isString(value.date) || !isFiniteNumber(value.index)) return null

  const owner = isString(value.tripId) ? value.tripId : tripId
  const { list, dropped } = readList(value.items, (entry) => readItem(entry, owner, currency, salvage))
  salvage.items += dropped

  return {
    id: value.id,
    tripId: owner,
    date: value.date,
    index: value.index,
    title: orNull(value.title),
    items: list,
  }
}

function readExpense(value: unknown, tripId: string): Expense | null {
  if (!isRecord(value)) return null
  if (!isString(value.id)) return null
  if (!isFiniteNumber(value.amount)) return null
  if (!isCurrency(value.currency)) return null
  if (!isOneOf(value.category, EXPENSE_CATEGORIES)) return null
  if (!isString(value.date)) return null

  return {
    id: value.id,
    tripId: isString(value.tripId) ? value.tripId : tripId,
    description: orEmpty(value.description),
    amount: value.amount,
    currency: value.currency,
    category: value.category,
    date: value.date,
    notes: orEmpty(value.notes),
    createdAt: orNow(value.createdAt),
    updatedAt: orNow(value.updatedAt),
  }
}

function readNote(value: unknown, tripId: string): TripNote | null {
  if (!isRecord(value)) return null
  if (!isString(value.id)) return null
  // Body and title are the whole record, but either may honestly be blank.
  return {
    id: value.id,
    tripId: isString(value.tripId) ? value.tripId : tripId,
    title: orEmpty(value.title),
    body: orEmpty(value.body),
    pinned: value.pinned === true,
    createdAt: orNow(value.createdAt),
    updatedAt: orNow(value.updatedAt),
  }
}

/**
 * Generation state is transient bookkeeping, not the traveller's own data, so an
 * unreadable record is simply dropped and the trip falls back to idle.
 *
 * `shouldFail` is accepted on the way in because v1 snapshots carry it, and
 * never written back out: a `true` stored months ago would otherwise wedge that
 * trip into permanent failure with no UI left to turn it off.
 */
function readGeneration(value: unknown): GenerationState | null {
  if (!isRecord(value)) return null
  if (!isOneOf(value.status, GENERATION_STATUSES)) return null
  return {
    status: value.status,
    error: orNull(value.error),
    startedAt: orNull(value.startedAt),
    completedAt: orNull(value.completedAt),
  }
}

/**
 * The user record, repaired rather than rejected. `fallbackId` is the `userId`
 * the surviving trips point at, so a rebuilt user still owns them.
 */
function readUser(value: unknown, fallbackId: string | null, fallbackName: string): User {
  const record = isRecord(value) ? value : {}
  return {
    id: isString(record.id) ? record.id : (fallbackId ?? createId('usr')),
    name: isString(record.name) && record.name.length > 0 ? record.name : fallbackName,
    email: orNull(record.email),
    isGuest: typeof record.isGuest === 'boolean' ? record.isGuest : true,
    createdAt: orNow(record.createdAt),
  }
}

export interface SnapshotReadOptions {
  /** Name given to a rebuilt user record, so the label matches a fresh guest. */
  fallbackUserName: string
  /** Trip id whose presence means the seeded demo data is in the snapshot. */
  demoTripId: string
}

export type SnapshotProblem =
  | 'not-an-object'
  | 'nothing-recoverable'
  | 'future-version'
  | 'no-migration-path'

export interface SnapshotReadResult {
  state: PersistedState | null
  /** The version the payload declared, or `null` when it declared none. */
  foundVersion: number | null
  /** True when the ladder ran, i.e. the payload was written by an older build. */
  migrated: boolean
  salvage: PersistenceSalvage
  /** Set only when nothing could be read; `null` on success. */
  problem: SnapshotProblem | null
}

/**
 * Migrate then salvage. The only unreadable payloads are one that is not an
 * object, one written by a version this build cannot reach, and one with neither
 * a usable user nor a single usable trip.
 */
export function readSnapshot(raw: unknown, options: SnapshotReadOptions): SnapshotReadResult {
  const salvage = noSalvage()

  if (!isRecord(raw)) {
    return { state: null, foundVersion: null, migrated: false, salvage, problem: 'not-an-object' }
  }

  const foundVersion = readVersion(raw.version)
  const from = foundVersion ?? EARLIEST_VERSION

  if (from > STORAGE_VERSION) {
    return { state: null, foundVersion, migrated: false, salvage, problem: 'future-version' }
  }

  const { payload, reached } = climb(raw, from, salvage)
  if (reached !== STORAGE_VERSION) {
    return { state: null, foundVersion, migrated: true, salvage, problem: 'no-migration-path' }
  }

  const trips = readList(payload.trips, readTrip)
  salvage.trips += trips.dropped

  const hasUserRecord = isRecord(payload.user)
  if (!hasUserRecord && trips.list.length === 0) {
    return {
      state: null,
      foundVersion,
      migrated: from !== STORAGE_VERSION,
      salvage,
      problem: 'nothing-recoverable',
    }
  }
  salvage.rebuiltUser = !hasUserRecord

  /**
   * Items are priced in their own trip's currency, resolved the same way the
   * v1 migration resolves it, so a bucket filed under a stale key is still
   * matched by the `tripId` its days and items carry.
   */
  const currencies = new Map(trips.list.map((trip) => [trip.id, trip.currency] as const))
  const dayBuckets: Record<string, ItineraryDay[]> = {}
  if (isRecord(payload.daysByTrip)) {
    for (const [tripId, bucket] of Object.entries(payload.daysByTrip)) {
      const currency = bucketCurrency(tripId, bucket, currencies)
      const { list, dropped } = readList(bucket, (entry) => readDay(entry, tripId, currency, salvage))
      salvage.days += dropped
      dayBuckets[tripId] = list
    }
  } else if (payload.daysByTrip !== undefined && payload.daysByTrip !== null) {
    salvage.days += 1
  }

  const expenses = readBuckets(payload.expensesByTrip, readExpense)
  salvage.expenses += expenses.dropped

  const notes = readBuckets(payload.notesByTrip, readNote)
  salvage.notes += notes.dropped

  const generation: Record<string, GenerationState> = {}
  if (isRecord(payload.generation)) {
    for (const [tripId, entry] of Object.entries(payload.generation)) {
      const record = readGeneration(entry)
      if (record === null) salvage.generation += 1
      else generation[tripId] = record
    }
  } else if (payload.generation !== undefined && payload.generation !== null) {
    salvage.generation += 1
  }

  const owner = trips.list.find((trip) => trip.userId.length > 0)?.userId ?? null

  const state: PersistedState = {
    version: STORAGE_VERSION,
    user: readUser(payload.user, owner, options.fallbackUserName),
    trips: trips.list,
    daysByTrip: dayBuckets,
    expensesByTrip: expenses.buckets,
    notesByTrip: notes.buckets,
    generation,
    themePreference: isOneOf(payload.themePreference, THEME_PREFERENCES)
      ? payload.themePreference
      : 'system',
    /**
     * A flag that is not a boolean is inferred from the data it describes rather
     * than defaulted, so a traveller who tried the demo does not get offered it
     * a second time.
     */
    hasDemoData:
      typeof payload.hasDemoData === 'boolean'
        ? payload.hasDemoData
        : trips.list.some((trip) => trip.id === options.demoTripId),
  }

  return { state, foundVersion, migrated: from !== STORAGE_VERSION, salvage, problem: null }
}
