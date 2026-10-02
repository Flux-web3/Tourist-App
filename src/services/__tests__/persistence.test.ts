import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { addDays, eachDay, todayISO } from '@/domain/format'
import type {
  CurrencyCode,
  Expense,
  ItineraryDay,
  ItineraryItem,
  Trip,
  TripNote,
} from '@/domain/types'
import { STORAGE_VERSION, type PersistedState } from '@/services/contracts'
import {
  BACKUP_KEY,
  DEMO_TRIP_ID,
  STORAGE_KEY,
  createDemoState,
  createEmptyState,
  createGuestUser,
  createPersistenceService,
} from '@/services/persistence'

const FIXED_NOW = new Date('2026-03-15T09:30:00.000Z')
const FIXED_ISO = '2026-03-15T09:30:00.000Z'
const FIXED_TODAY = '2026-03-15'

const USER_ID = 'usr_fixture'
const PARIS = 'trip_paris'
const TOKYO = 'trip_tokyo'

const service = createPersistenceService()

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

function makeTrip(id: string, currency: CurrencyCode, overrides: Partial<Trip> = {}): Trip {
  return {
    id,
    userId: USER_ID,
    name: `Trip ${id}`,
    origin: 'Lagos, Nigeria',
    destination: `Destination of ${id}`,
    destinationId: null,
    startDate: '2026-04-01',
    endDate: '2026-04-02',
    travelers: 2,
    budget: 1800,
    currency,
    interests: ['culture', 'food'],
    pace: 'balanced',
    notes: `Notes for ${id}`,
    status: 'itinerary_ready',
    createdAt: FIXED_ISO,
    updatedAt: FIXED_ISO,
    ...overrides,
  }
}

function makeItem(
  tripId: string,
  id: string,
  currency: CurrencyCode,
  overrides: Partial<ItineraryItem> = {},
): ItineraryItem {
  return {
    id,
    tripId,
    title: `Item ${id}`,
    category: 'culture',
    startTime: '09:00',
    endTime: '11:00',
    location: 'Somewhere',
    description: 'Described',
    estimatedCost: 12.5,
    currency,
    source: 'ai',
    editedByUser: false,
    experienceId: null,
    notes: '',
    createdAt: FIXED_ISO,
    updatedAt: FIXED_ISO,
    ...overrides,
  }
}

function makeDay(tripId: string, index: number, items: ItineraryItem[]): ItineraryDay {
  return {
    id: `${tripId}_d${index}`,
    tripId,
    date: addDays('2026-04-01', index - 1),
    index,
    title: null,
    items,
  }
}

function makeExpense(tripId: string, id: string, overrides: Partial<Expense> = {}): Expense {
  return {
    id,
    tripId,
    description: `Expense ${id}`,
    amount: 20,
    currency: 'EUR',
    category: 'food',
    date: '2026-04-01',
    notes: '',
    createdAt: FIXED_ISO,
    updatedAt: FIXED_ISO,
    ...overrides,
  }
}

function makeNote(tripId: string, id: string, overrides: Partial<TripNote> = {}): TripNote {
  return {
    id,
    tripId,
    title: `Note ${id}`,
    body: `Body of ${id}`,
    pinned: false,
    createdAt: FIXED_ISO,
    updatedAt: FIXED_ISO,
    ...overrides,
  }
}

/**
 * Two trips priced in different currencies, each with its own days, items,
 * expenses, notes and generation record. Different currencies are the point:
 * a migration that stamped one currency on everything would pass a
 * single-trip fixture and still be wrong.
 *
 * The Tokyo stops are hand-added (`user`), typed by the traveller in yen.
 * Generated (`ai`) stops are always EUR - the generator's templates are Paris
 * prices - so a JPY-priced generated stop is not a shape the app produces.
 */
function twoTripState(): PersistedState {
  return {
    version: STORAGE_VERSION,
    user: createGuestUser({ id: USER_ID, name: 'Adaeze N.' }),
    trips: [
      makeTrip(PARIS, 'EUR', { destination: 'Paris, France', destinationId: 'paris' }),
      makeTrip(TOKYO, 'JPY', {
        destination: 'Tokyo, Japan',
        destinationId: 'tokyo',
        budget: 250000,
        travelers: 1,
      }),
    ],
    daysByTrip: {
      [PARIS]: [
        makeDay(PARIS, 1, [makeItem(PARIS, 'itm_p1', 'EUR'), makeItem(PARIS, 'itm_p2', 'EUR')]),
        makeDay(PARIS, 2, [makeItem(PARIS, 'itm_p3', 'EUR', { source: 'user', editedByUser: true })]),
      ],
      [TOKYO]: [
        makeDay(TOKYO, 1, [
          makeItem(TOKYO, 'itm_t1', 'JPY', { estimatedCost: 1800, source: 'user' }),
          makeItem(TOKYO, 'itm_t2', 'JPY', { estimatedCost: 4200, source: 'user' }),
        ]),
      ],
    },
    expensesByTrip: {
      [PARIS]: [makeExpense(PARIS, 'exp_p1'), makeExpense(PARIS, 'exp_p2', { amount: 96 })],
      [TOKYO]: [makeExpense(TOKYO, 'exp_t1', { amount: 3200, currency: 'JPY' })],
    },
    notesByTrip: {
      [PARIS]: [makeNote(PARIS, 'not_p1', { pinned: true })],
      [TOKYO]: [makeNote(TOKYO, 'not_t1'), makeNote(TOKYO, 'not_t2')],
    },
    generation: {
      [PARIS]: { status: 'success', error: null, startedAt: FIXED_ISO, completedAt: FIXED_ISO },
      [TOKYO]: { status: 'idle', error: null, startedAt: null, completedAt: null },
    },
    themePreference: 'dark',
    hasDemoData: false,
  }
}

type RawRecord = Record<string, unknown>

/** A deep, untyped copy that a test is free to break however it likes. */
function raw(state: unknown): RawRecord {
  return JSON.parse(JSON.stringify(state)) as RawRecord
}

/**
 * The same snapshot as a v2 build would have written it: `version: 2` and no
 * `destinationId` on any trip, because destinations were free text.
 */
function asV2(state: PersistedState): RawRecord {
  const copy = raw(state)
  copy.version = 2
  for (const trip of copy.trips as RawRecord[]) delete trip.destinationId
  return copy
}

/**
 * The same snapshot as a v1 build would have written it: the v2 shape, at
 * `version: 1`, and no `currency` on any itinerary item either.
 */
function asV1(state: PersistedState): RawRecord {
  const copy = asV2(state)
  copy.version = 1
  const buckets = copy.daysByTrip as Record<string, Array<{ items: RawRecord[] }>>
  for (const days of Object.values(buckets)) {
    for (const day of days) {
      for (const item of day.items) delete item.currency
    }
  }
  return copy
}

function writeRaw(value: string): void {
  window.localStorage.setItem(STORAGE_KEY, value)
}

function writeJson(value: unknown): void {
  writeRaw(JSON.stringify(value))
}

function stored(): string | null {
  return window.localStorage.getItem(STORAGE_KEY)
}

function backup(): string | null {
  return window.localStorage.getItem(BACKUP_KEY)
}

function itemIds(state: PersistedState | null, tripId: string): string[] {
  return (state?.daysByTrip[tripId] ?? []).flatMap((day) => day.items.map((item) => item.id))
}

function itemCurrencies(state: PersistedState | null, tripId: string): string[] {
  return (state?.daysByTrip[tripId] ?? []).flatMap((day) => day.items.map((item) => item.currency))
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(FIXED_NOW)
  // Every key, including the backup, so one test's copy cannot leak into the next.
  window.localStorage.clear()
  // The service warns in DEV on every salvage; that is its job, not test noise.
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})

afterEach(() => {
  vi.useRealTimers()
})

/* -------------------------------------------------------------------------- */
/* Storage location and version                                               */
/* -------------------------------------------------------------------------- */

describe('storage location', () => {
  /**
   * This test used to assert `STORAGE_KEY === 'tourist.state.v' + STORAGE_VERSION`.
   * That coupling was a trap: the first version bump would have moved the key,
   * every existing snapshot would have been orphaned under the old one, and
   * every traveller would have started empty. The key is a location; the version
   * lives in the payload.
   */
  it('keeps the key at the location every existing snapshot was written to', () => {
    expect(STORAGE_KEY).toBe('tourist.state.v1')
  })

  it('did not move the key when the payload version moved past 1', () => {
    expect(STORAGE_VERSION).toBeGreaterThan(1)
    expect(STORAGE_KEY).not.toBe(`tourist.state.v${STORAGE_VERSION}`)
  })

  it('keeps the backup somewhere a save can never overwrite', () => {
    expect(BACKUP_KEY).not.toBe(STORAGE_KEY)
  })

  it('writes the payload under that key, stamped with the current version', () => {
    service.save(createEmptyState())

    const parsed = JSON.parse(stored() ?? 'null') as PersistedState
    expect(parsed.version).toBe(STORAGE_VERSION)
  })

  it('reports empty, without a backup, for a key that was never written', () => {
    expect(() => service.load()).not.toThrow()
    expect(service.load()).toBeNull()

    const detailed = service.loadDetailed()
    expect(detailed.status).toBe('empty')
    expect(detailed.backupKey).toBeNull()
    expect(backup()).toBeNull()
  })

  /**
   * `TouristProvider` does `load() ?? createEmptyState()`. The extra detail
   * lives on `loadDetailed()`, so that call site must keep getting the bare
   * state and nothing else.
   */
  it('still returns the bare state from load(), so `load() ?? createEmptyState()` keeps working', () => {
    const state = twoTripState()
    service.save(state)

    const loaded = service.load()
    const base = loaded ?? createEmptyState()

    expect(base).toEqual(state)
    expect(loaded).not.toHaveProperty('status')
    expect(loaded).not.toHaveProperty('salvage')
  })
})

/* -------------------------------------------------------------------------- */
/* Current schema                                                             */
/* -------------------------------------------------------------------------- */

describe('a current (v3) snapshot', () => {
  it('round-trips unchanged through save and load', () => {
    const state = twoTripState()

    const saved = service.save(state)
    const detailed = service.loadDetailed()

    expect(saved.status).toBe('saved')
    expect(detailed.state).toEqual(state)
    expect(detailed.status).toBe('loaded')
    expect(detailed.foundVersion).toBe(STORAGE_VERSION)
    expect(detailed.backupKey).toBeNull()
    expect(backup()).toBeNull()
  })

  it('loads unchanged when written directly rather than through save', () => {
    const state = twoTripState()
    writeJson(state)

    expect(service.load()).toEqual(state)
  })

  it('keeps every field of every record', () => {
    service.save(twoTripState())
    const loaded = service.load()

    expect(loaded?.themePreference).toBe('dark')
    expect(loaded?.user.id).toBe(USER_ID)
    expect(loaded?.trips.map((trip) => [trip.id, trip.currency, trip.budget])).toEqual([
      [PARIS, 'EUR', 1800],
      [TOKYO, 'JPY', 250000],
    ])
    expect(loaded?.daysByTrip[PARIS]?.[1]?.items[0]?.editedByUser).toBe(true)
    expect(loaded?.daysByTrip[TOKYO]?.[0]?.items[1]?.estimatedCost).toBe(4200)
    expect(loaded?.expensesByTrip[TOKYO]?.[0]).toMatchObject({ amount: 3200, currency: 'JPY' })
    expect(loaded?.notesByTrip?.[PARIS]?.[0]?.pinned).toBe(true)
    expect(loaded?.generation[PARIS]?.status).toBe('success')
  })

  /**
   * A stop saved from the catalogue keeps the catalogue's currency: a euro
   * ticket inside a naira trip really is still in euro. Salvage must never
   * "correct" it to the trip's currency.
   */
  it('never overwrites an item currency that differs from its trip', () => {
    const state = twoTripState()
    const tokyoDay = state.daysByTrip[TOKYO]?.[0]
    if (!tokyoDay) throw new Error('fixture has no Tokyo day')
    tokyoDay.items.push(makeItem(TOKYO, 'itm_catalog_eur', 'EUR', { source: 'catalog' }))

    service.save(state)

    expect(itemCurrencies(service.load(), TOKYO)).toEqual(['JPY', 'JPY', 'EUR'])
  })

  it('round-trips the empty state', () => {
    const state = createEmptyState()
    service.save(state)
    expect(service.load()).toEqual(state)
  })

  it('keeps an empty bucket for a trip that has no days and no expenses', () => {
    const state: PersistedState = {
      ...createEmptyState(),
      trips: [makeTrip('trip_without_days', 'EUR')],
      daysByTrip: { trip_without_days: [] },
      expensesByTrip: { trip_without_days: [] },
    }

    service.save(state)
    const loaded = service.load()

    expect(loaded?.daysByTrip.trip_without_days).toEqual([])
    expect(loaded?.expensesByTrip.trip_without_days).toEqual([])
    expect(loaded?.trips.map((trip) => trip.id)).toEqual(['trip_without_days'])
  })
})

/* -------------------------------------------------------------------------- */
/* v1 -> v2 migration                                                         */
/* -------------------------------------------------------------------------- */

describe('migrating a v1 snapshot forward', () => {
  it('gives every itinerary item the currency it was priced in, per trip', () => {
    writeJson(asV1(twoTripState()))

    const detailed = service.loadDetailed()

    expect(detailed.status).toBe('migrated')
    expect(detailed.foundVersion).toBe(1)
    expect(detailed.state?.version).toBe(STORAGE_VERSION)
    expect(itemCurrencies(detailed.state, PARIS)).toEqual(['EUR', 'EUR', 'EUR'])
    expect(itemCurrencies(detailed.state, TOKYO)).toEqual(['JPY', 'JPY'])
  })

  it('produces exactly the v2 snapshot the v1 one described', () => {
    const current = twoTripState()
    writeJson(asV1(current))

    expect(service.load()).toEqual(current)
  })

  it('preserves every trip, in order, with its own fields', () => {
    writeJson(asV1(twoTripState()))

    const loaded = service.load()

    expect(loaded?.trips).toHaveLength(2)
    expect(loaded?.trips).toEqual(twoTripState().trips)
  })

  it('keeps days, expenses, notes and generation attached to the right trip', () => {
    writeJson(asV1(twoTripState()))

    const loaded = service.load()

    expect(Object.keys(loaded?.daysByTrip ?? {}).sort()).toEqual([PARIS, TOKYO])
    expect(loaded?.daysByTrip[PARIS]?.map((day) => day.id)).toEqual([`${PARIS}_d1`, `${PARIS}_d2`])
    expect(loaded?.daysByTrip[TOKYO]?.map((day) => day.id)).toEqual([`${TOKYO}_d1`])
    expect(itemIds(loaded, PARIS)).toEqual(['itm_p1', 'itm_p2', 'itm_p3'])
    expect(itemIds(loaded, TOKYO)).toEqual(['itm_t1', 'itm_t2'])

    for (const tripId of [PARIS, TOKYO]) {
      for (const day of loaded?.daysByTrip[tripId] ?? []) {
        expect(day.tripId).toBe(tripId)
        for (const item of day.items) expect(item.tripId).toBe(tripId)
      }
      for (const expense of loaded?.expensesByTrip[tripId] ?? []) expect(expense.tripId).toBe(tripId)
      for (const note of loaded?.notesByTrip?.[tripId] ?? []) expect(note.tripId).toBe(tripId)
    }

    expect(loaded?.expensesByTrip[PARIS]?.map((expense) => expense.id)).toEqual(['exp_p1', 'exp_p2'])
    expect(loaded?.expensesByTrip[TOKYO]?.map((expense) => expense.id)).toEqual(['exp_t1'])
    expect(loaded?.notesByTrip?.[PARIS]?.map((note) => note.id)).toEqual(['not_p1'])
    expect(loaded?.notesByTrip?.[TOKYO]?.map((note) => note.id)).toEqual(['not_t1', 'not_t2'])
    expect(loaded?.generation[PARIS]?.status).toBe('success')
    expect(loaded?.generation[TOKYO]?.status).toBe('idle')

    // And each trip's buckets come through whole, migrated in that trip's own currency.
    expect(loaded?.daysByTrip).toEqual(twoTripState().daysByTrip)
    expect(loaded?.expensesByTrip).toEqual(twoTripState().expensesByTrip)
    expect(loaded?.notesByTrip).toEqual(twoTripState().notesByTrip)
  })

  it('drops a day bucket whose trip is gone, counts it, and keeps every other bucket', () => {
    const v1 = asV1(twoTripState())
    const days = v1.daysByTrip as RawRecord
    days.trip_deleted = [
      {
        id: 'trip_deleted_d1',
        tripId: 'trip_deleted',
        date: '2026-04-01',
        index: 1,
        title: null,
        items: [{ ...raw(makeItem('trip_deleted', 'itm_orphan', 'EUR')), currency: undefined }],
      },
    ]
    writeJson(v1)

    const detailed = service.loadDetailed()

    expect(detailed.status).toBe('migrated')
    expect(detailed.state?.daysByTrip).not.toHaveProperty('trip_deleted')
    expect(detailed.salvage.orphanedDayBuckets).toBe(1)
    expect(detailed.salvage.items).toBe(1)
    expect(itemIds(detailed.state, PARIS)).toEqual(['itm_p1', 'itm_p2', 'itm_p3'])
    expect(itemIds(detailed.state, TOKYO)).toEqual(['itm_t1', 'itm_t2'])
  })

  it('finds the owning trip through the items when the bucket key is stale', () => {
    const v1 = asV1(twoTripState())
    const days = v1.daysByTrip as RawRecord
    days.stale_key = days[TOKYO]
    delete days[TOKYO]
    writeJson(v1)

    const loaded = service.load()

    // Priced by its real owner, and filed back under it where the app can reach it.
    expect(itemCurrencies(loaded, TOKYO)).toEqual(['JPY', 'JPY'])
    expect(loaded?.daysByTrip).not.toHaveProperty('stale_key')
  })

  it('does not count an empty bucket with no owning trip as a loss, since it held nothing', () => {
    const v1 = asV1(twoTripState())
    ;(v1.daysByTrip as RawRecord).trip_never_generated = []
    writeJson(v1)

    const detailed = service.loadDetailed()

    // Nothing can reach a bucket without its trip, so it is not carried forward.
    expect(detailed.state?.daysByTrip).not.toHaveProperty('trip_never_generated')
    expect(detailed.salvage.orphanedDayBuckets).toBe(0)
    expect(detailed.salvage.orphanedBuckets).toBe(0)
  })

  it('keeps a copy of the v1 payload, and the next load after a save is clean', () => {
    const v1 = JSON.stringify(asV1(twoTripState()))
    writeRaw(v1)

    const detailed = service.loadDetailed()
    expect(detailed.backupKey).toBe(BACKUP_KEY)
    expect(backup()).toBe(v1)

    if (!detailed.state) throw new Error('migration returned nothing')
    service.save(detailed.state)

    const next = service.loadDetailed()
    expect(next.status).toBe('loaded')
    expect(next.foundVersion).toBe(STORAGE_VERSION)
    expect(next.state).toEqual(twoTripState())
  })

  /** A payload with no version at all is read as the oldest known shape, not discarded. */
  it('treats a payload with no version as v1 and migrates it', () => {
    const v1 = asV1(twoTripState())
    delete v1.version
    writeJson(v1)

    const detailed = service.loadDetailed()

    expect(detailed.status).toBe('migrated')
    expect(detailed.foundVersion).toBeNull()
    expect(detailed.state?.trips).toHaveLength(2)
    expect(itemCurrencies(detailed.state, TOKYO)).toEqual(['JPY', 'JPY'])
  })

  it('loads a snapshot written before hasDemoData existed, inferring the flag from the data', () => {
    const withDemo = raw(createDemoState())
    withDemo.version = 1
    delete withDemo.hasDemoData
    writeJson(withDemo)
    expect(service.load()?.hasDemoData).toBe(true)

    const withoutDemo = asV1(twoTripState())
    delete withoutDemo.hasDemoData
    writeJson(withoutDemo)
    const loaded = service.load()
    expect(loaded?.hasDemoData).toBe(false)
    expect(loaded?.trips).toHaveLength(2)
  })
})

/**
 * The catalogue prices every place in EUR. Before v2 an item had no currency of
 * its own, so a EUR 22 Louvre ticket saved into a naira trip was *displayed* as
 * NGN 22. Backfilling every item from its trip would cement that mislabel, so a
 * catalogue stop is priced by the catalogue unless the traveller changed its
 * cost - in which case they typed it under the trip's currency label.
 */
describe('migrating v1 catalogue stops', () => {
  const LOUVRE_ID = 'exp_louvre_museum'
  const LOUVRE_PRICE = 22
  const LAGOS = 'trip_lagos_naira'

  function nairaTripWith(item: ItineraryItem): PersistedState {
    return {
      ...createEmptyState(createGuestUser({ id: USER_ID })),
      trips: [makeTrip(LAGOS, 'NGN', { budget: 900000 })],
      daysByTrip: { [LAGOS]: [makeDay(LAGOS, 1, [item])] },
    }
  }

  function migrate(item: ItineraryItem) {
    writeJson(asV1(nairaTripWith(item)))
    const detailed = service.loadDetailed()
    return { detailed, item: detailed.state?.daysByTrip[LAGOS]?.[0]?.items[0] }
  }

  function louvre(overrides: Partial<ItineraryItem> = {}): ItineraryItem {
    return makeItem(LAGOS, 'itm_louvre', 'EUR', {
      title: 'Louvre Museum',
      source: 'catalog',
      experienceId: LOUVRE_ID,
      estimatedCost: LOUVRE_PRICE,
      ...overrides,
    })
  }

  it('keeps an untouched Louvre stop in a naira trip in EUR, not NGN', () => {
    const { detailed, item } = migrate(louvre())

    expect(detailed.status).toBe('migrated')
    expect(item?.currency).toBe('EUR')
    expect(item?.estimatedCost).toBe(22)
    expect(detailed.salvage.unmatchedCatalogItems).toBe(0)
  })

  it('compares the cost in minor units, so float noise does not read as an edit', () => {
    const { item } = migrate(louvre({ estimatedCost: 22.000000000001 }))

    expect(item?.currency).toBe('EUR')
  })

  it('gives a catalogue stop whose cost was edited the trip currency, since that is what it was typed in', () => {
    const { detailed, item } = migrate(louvre({ estimatedCost: 15000, editedByUser: true }))

    expect(item?.currency).toBe('NGN')
    expect(item?.estimatedCost).toBe(15000)
    expect(detailed.salvage.unmatchedCatalogItems).toBe(0)
  })

  it('treats a one-cent difference as an edit', () => {
    const { item } = migrate(louvre({ estimatedCost: 22.01 }))

    expect(item?.currency).toBe('NGN')
  })

  it('falls back to the trip currency, and counts it, when the experience has left the catalogue', () => {
    const { detailed, item } = migrate(louvre({ experienceId: 'exp_closed_for_good' }))

    expect(item?.currency).toBe('NGN')
    expect(item?.id).toBe('itm_louvre')
    expect(detailed.salvage.unmatchedCatalogItems).toBe(1)
  })

  it('falls back to the trip currency, and counts it, when a catalogue stop names no experience', () => {
    const { detailed, item } = migrate(louvre({ experienceId: null }))

    expect(item?.currency).toBe('NGN')
    expect(detailed.salvage.unmatchedCatalogItems).toBe(1)
  })

  it('gives a generated stop in a naira trip the EUR its template was priced in', () => {
    const { detailed, item } = migrate(
      makeItem(LAGOS, 'itm_generated', 'EUR', { source: 'ai', estimatedCost: 29, experienceId: null }),
    )

    expect(detailed.status).toBe('migrated')
    expect(item?.currency).toBe('EUR')
    expect(item?.estimatedCost).toBe(29)
    expect(detailed.salvage.unmatchedCatalogItems).toBe(0)
  })

  it('gives a generated stop EUR even when it happens to sit at a catalogue price', () => {
    const { item } = migrate(louvre({ id: 'itm_ai', source: 'ai', experienceId: LOUVRE_ID }))

    expect(item?.currency).toBe('EUR')
  })

  it('gives a hand-added stop the trip currency it was typed in, even at a catalogue price', () => {
    const { detailed, item } = migrate(louvre({ id: 'itm_user', source: 'user', experienceId: null }))

    expect(item?.currency).toBe('NGN')
    expect(detailed.salvage.unmatchedCatalogItems).toBe(0)
  })

  it('prices each stop in a mixed day on its own merits', () => {
    writeJson(
      asV1({
        ...nairaTripWith(louvre()),
        daysByTrip: {
          [LAGOS]: [
            makeDay(LAGOS, 1, [
              louvre({ id: 'itm_untouched' }),
              louvre({ id: 'itm_edited', estimatedCost: 30000 }),
              louvre({ id: 'itm_gone', experienceId: 'exp_gone' }),
              makeItem(LAGOS, 'itm_generated', 'EUR', { estimatedCost: 29 }),
            ]),
          ],
        },
      }),
    )

    const detailed = service.loadDetailed()

    expect(itemIds(detailed.state, LAGOS)).toEqual(['itm_untouched', 'itm_edited', 'itm_gone', 'itm_generated'])
    // untouched catalogue -> EUR; edited catalogue -> NGN; unmatched -> NGN; generated -> EUR
    expect(itemCurrencies(detailed.state, LAGOS)).toEqual(['EUR', 'NGN', 'NGN', 'EUR'])
    expect(detailed.salvage.unmatchedCatalogItems).toBe(1)
  })

  it('applies the same rule to a current snapshot whose catalogue stop lost its currency', () => {
    const snapshot = raw(nairaTripWith(louvre()))
    const days = (snapshot.daysByTrip as Record<string, Array<{ items: RawRecord[] }>>)[LAGOS]
    const item = days?.[0]?.items[0]
    if (!item) throw new Error('fixture has no item')
    delete item.currency
    writeJson(snapshot)

    expect(itemCurrencies(service.load(), LAGOS)).toEqual(['EUR'])
  })
})

/* -------------------------------------------------------------------------- */
/* v2 -> v3 migration                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Before v3 a trip's destination was free text, and a London trip was shown the
 * Paris guide because nothing tied a trip to a city. v3 gives every trip the
 * catalogue id its typed destination names - or `null`, never a guess.
 */
describe('migrating a v2 snapshot forward', () => {
  /** One EUR trip per typed destination, `trip_0`, `trip_1`, ... in order. */
  function tripsTo(destinations: readonly string[]): PersistedState {
    return {
      ...createEmptyState(createGuestUser({ id: USER_ID })),
      trips: destinations.map((destination, index) =>
        makeTrip(`trip_${String(index)}`, 'EUR', { destination }),
      ),
    }
  }

  function migrateTrips(destinations: readonly string[]) {
    writeJson(asV2(tripsTo(destinations)))
    return service.loadDetailed()
  }

  it.each([
    ['Paris, France', 'paris'],
    ['London', 'london'],
    ['london, uk', 'london'],
    ['Lagos, Nigeria', 'lagos'],
    ['Lisbon, Portugal', null],
    ['Paris, Texas', null],
  ])('resolves "%s" to %s and keeps the text exactly as typed', (typed, expected) => {
    const detailed = migrateTrips([typed])
    const trip = detailed.state?.trips[0]

    expect(detailed.status).toBe('migrated')
    expect(trip?.destinationId).toBe(expected)
    expect(trip?.destination).toBe(typed)
  })

  it('stamps v3, reports the migration and keeps a byte-for-byte copy of the v2 payload', () => {
    const text = JSON.stringify(asV2(twoTripState()))
    writeRaw(text)

    const detailed = service.loadDetailed()

    expect(detailed.status).toBe('migrated')
    expect(detailed.foundVersion).toBe(2)
    expect(detailed.state?.version).toBe(3)
    expect(detailed.backupKey).toBe(BACKUP_KEY)
    expect(backup()).toBe(text)
  })

  it('resolves several trips independently, in order, and drops none', () => {
    const typed = ['Lisbon, Portugal', 'London', 'Paris, France', 'Paris, Texas', 'Lagos, Nigeria']

    const detailed = migrateTrips(typed)

    expect(detailed.state?.trips.map((trip) => [trip.id, trip.destination, trip.destinationId])).toEqual([
      ['trip_0', 'Lisbon, Portugal', null],
      ['trip_1', 'London', 'london'],
      ['trip_2', 'Paris, France', 'paris'],
      ['trip_3', 'Paris, Texas', null],
      ['trip_4', 'Lagos, Nigeria', 'lagos'],
    ])
    expect(detailed.salvage.trips).toBe(0)
  })

  it('keeps a trip whose destination is blank or missing, with no destination id', () => {
    const snapshot = asV2(tripsTo(['', 'Paris, France']))
    const first = (snapshot.trips as RawRecord[])[0]
    if (!first) throw new Error('fixture has no trip')
    delete first.destination
    writeJson(snapshot)

    const detailed = service.loadDetailed()

    expect(detailed.state?.trips.map((trip) => [trip.destination, trip.destinationId])).toEqual([
      ['', null],
      ['Paris, France', 'paris'],
    ])
    expect(detailed.salvage.trips).toBe(0)
  })

  it('produces exactly the v3 snapshot the v2 one described', () => {
    writeJson(asV2(twoTripState()))

    expect(service.load()).toEqual(twoTripState())
  })

  it('leaves currencies, days, items, expenses, notes and generation byte-identical', () => {
    const v2 = asV2(twoTripState())
    writeJson(v2)

    const loaded = service.load()

    expect(JSON.stringify(loaded?.daysByTrip)).toBe(JSON.stringify(v2.daysByTrip))
    expect(JSON.stringify(loaded?.expensesByTrip)).toBe(JSON.stringify(v2.expensesByTrip))
    expect(JSON.stringify(loaded?.notesByTrip)).toBe(JSON.stringify(v2.notesByTrip))
    expect(JSON.stringify(loaded?.generation)).toBe(JSON.stringify(v2.generation))
    expect(loaded?.trips.map((trip) => trip.currency)).toEqual(['EUR', 'JPY'])
    expect(loaded?.trips.map((trip) => trip.budget)).toEqual([1800, 250000])
  })

  it('carries a v1 snapshot all the way to v3, resolving destinations on the way', () => {
    writeJson(asV1(twoTripState()))

    const detailed = service.loadDetailed()

    expect(detailed.status).toBe('migrated')
    expect(detailed.foundVersion).toBe(1)
    expect(detailed.state?.version).toBe(3)
    expect(detailed.state?.trips.map((trip) => trip.destinationId)).toEqual(['paris', 'tokyo'])
    expect(itemCurrencies(detailed.state, TOKYO)).toEqual(['JPY', 'JPY'])
    expect(detailed.state).toEqual(twoTripState())
  })

  it('loads clean after the migrated state is saved', () => {
    writeJson(asV2(tripsTo(['london, uk', 'Lisbon, Portugal'])))
    const migrated = service.loadDetailed().state
    if (!migrated) throw new Error('migration returned nothing')

    service.save(migrated)
    const next = service.loadDetailed()

    expect(next.status).toBe('loaded')
    expect(next.state).toEqual(migrated)
    expect(next.state?.trips.map((trip) => trip.destinationId)).toEqual(['london', null])
  })
})

/**
 * A v3 trip's `destinationId` is what Explore and the itinerary drafts read, so
 * a value this build cannot use is repaired from the trip's own text rather
 * than trusted - and never costs the traveller the trip.
 */
describe('reading a v3 destination id', () => {
  function withDestination(destination: string, destinationId: unknown): RawRecord {
    const snapshot = raw({
      ...createEmptyState(createGuestUser({ id: USER_ID })),
      trips: [makeTrip(PARIS, 'EUR', { destination })],
    })
    const trip = (snapshot.trips as RawRecord[])[0]
    if (!trip) throw new Error('fixture has no trip')
    if (destinationId === undefined) delete trip.destinationId
    else trip.destinationId = destinationId
    return snapshot
  }

  function readBack(destination: string, destinationId: unknown) {
    writeJson(withDestination(destination, destinationId))
    return service.loadDetailed()
  }

  it('re-derives an id that is not in the catalogue from the typed destination', () => {
    const detailed = readBack('Paris, France', 'atlantis')

    expect(detailed.state?.trips[0]?.destinationId).toBe('paris')
    expect(detailed.state?.trips[0]?.destination).toBe('Paris, France')
  })

  it('clears an unknown id to null when the text names no catalogue city', () => {
    expect(readBack('Lisbon, Portugal', 'lisbon').state?.trips[0]?.destinationId).toBeNull()
  })

  it.each([
    ['missing', undefined],
    ['a number', 42],
    ['an object', { id: 'london' }],
    ['an empty string', ''],
  ])('re-derives an id that is %s', (_label, destinationId) => {
    const detailed = readBack('London, United Kingdom', destinationId)

    expect(detailed.state?.trips).toHaveLength(1)
    expect(detailed.state?.trips[0]?.destinationId).toBe('london')
  })

  /**
   * Like an unknown pace, the repair is silent: the id is derived from text
   * the trip still carries, so nothing the traveller entered is lost.
   */
  it('repairs silently, without counting a salvage', () => {
    const detailed = readBack('Paris, France', 'atlantis')

    expect(detailed.status).toBe('loaded')
    expect(detailed.salvage.trips).toBe(0)
  })

  it('keeps a known id even when the text reads differently, since the id is authoritative', () => {
    expect(readBack('Somewhere nice', 'tokyo').state?.trips[0]?.destinationId).toBe('tokyo')
  })

  /** `null` is how v3 records an unmatched trip; re-deriving it would make the value unstable. */
  it('keeps an explicit null', () => {
    expect(readBack('Lisbon, Portugal', null).state?.trips[0]?.destinationId).toBeNull()
    expect(readBack('Paris, France', null).state?.trips[0]?.destinationId).toBeNull()
  })

  it('round-trips a v3 snapshot, matched and unmatched trips alike, unchanged', () => {
    const state = twoTripState()
    state.trips.push(makeTrip('trip_lisbon', 'EUR', { destination: 'Lisbon, Portugal' }))
    const text = JSON.stringify(state)
    writeRaw(text)

    const detailed = service.loadDetailed()
    expect(detailed.status).toBe('loaded')
    expect(detailed.state).toEqual(state)
    expect(detailed.backupKey).toBeNull()

    if (!detailed.state) throw new Error('nothing loaded')
    service.save(detailed.state)
    expect(stored()).toBe(text)
  })

  it('never writes a bogus id back out on save', () => {
    const state = raw(twoTripState())
    const paris = (state.trips as RawRecord[])[0]
    if (!paris) throw new Error('fixture has no trip')
    paris.destinationId = 'atlantis'

    service.save(state as unknown as PersistedState)

    const written = JSON.parse(stored() ?? 'null') as PersistedState
    expect(written.trips.map((trip) => trip.destinationId)).toEqual(['paris', 'tokyo'])
  })
})

/**
 * `shouldFail` was a prototype switch that should never have been persisted. A
 * snapshot that still carries it has to load - refusing it would cost the
 * traveller their trips - but the flag itself must not come back, or a `true`
 * written months ago would wedge that trip into permanent failure on every
 * reload, with no UI left to turn it off.
 */
describe('the retired shouldFail switch', () => {
  function withShouldFail(): RawRecord {
    const v1 = asV1(twoTripState())
    const generation = v1.generation as Record<string, RawRecord>
    const paris = generation[PARIS]
    if (!paris) throw new Error('fixture has no Paris generation record')
    paris.shouldFail = true
    return v1
  }

  it('still accepts a v1 snapshot that carries the flag', () => {
    writeJson(withShouldFail())

    const loaded = service.load()
    expect(loaded?.trips).toHaveLength(2)
    expect(loaded?.generation[PARIS]?.status).toBe('success')
  })

  it('drops a persisted true rather than carrying it into the new session', () => {
    writeJson(withShouldFail())

    expect(service.load()?.generation[PARIS]).not.toHaveProperty('shouldFail')
  })

  it('does not write the flag back out on save', () => {
    const state = twoTripState()
    const paris = state.generation[PARIS]
    if (!paris) throw new Error('fixture has no Paris generation record')
    paris.shouldFail = true

    service.save(state)

    expect(stored()).not.toContain('shouldFail')
  })
})

/* -------------------------------------------------------------------------- */
/* Keys added or removed since a snapshot was written                         */
/* -------------------------------------------------------------------------- */

describe('keys the snapshot does or does not know about', () => {
  it('loads a snapshot missing notesByTrip with the key defaulted and everything else intact', () => {
    const snapshot = raw(twoTripState())
    delete snapshot.notesByTrip
    writeJson(snapshot)

    const loaded = service.load()

    expect(loaded?.notesByTrip).toEqual({})
    expect(loaded?.trips).toEqual(twoTripState().trips)
    expect(loaded?.daysByTrip).toEqual(twoTripState().daysByTrip)
    expect(loaded?.expensesByTrip).toEqual(twoTripState().expensesByTrip)
  })

  it('loads a snapshot missing its generation map with the key defaulted', () => {
    const snapshot = raw(twoTripState())
    delete snapshot.generation
    writeJson(snapshot)

    const loaded = service.load()

    expect(loaded?.generation).toEqual({})
    expect(loaded?.trips).toHaveLength(2)
  })

  it('ignores an unknown top-level key and does not write it back', () => {
    writeJson({ ...raw(twoTripState()), syncCursor: 'abc123', featureFlags: { beta: true } })

    const loaded = service.load()
    expect(loaded).toEqual(twoTripState())
    expect(loaded).not.toHaveProperty('syncCursor')

    if (!loaded) throw new Error('nothing loaded')
    service.save(loaded)
    expect(stored()).not.toContain('syncCursor')
  })

  it('ignores an unknown field on an individual record', () => {
    const snapshot = raw(twoTripState())
    const trips = snapshot.trips as RawRecord[]
    const firstTrip = trips[0]
    if (!firstTrip) throw new Error('fixture has no trip')
    firstTrip.coverPhotoId = 'img_42'
    writeJson(snapshot)

    const loaded = service.load()

    expect(loaded?.trips[0]).toEqual(twoTripState().trips[0])
    expect(loaded?.trips[0]).not.toHaveProperty('coverPhotoId')
  })

  it('defaults free-text fields that have gone null instead of dropping the record', () => {
    const snapshot = raw(twoTripState())
    const trips = snapshot.trips as RawRecord[]
    const expenses = (snapshot.expensesByTrip as Record<string, RawRecord[]>)[PARIS]
    const firstTrip = trips[0]
    const firstExpense = expenses?.[0]
    if (!firstTrip || !firstExpense) throw new Error('fixture is missing records')
    firstTrip.notes = null
    firstTrip.budget = null
    firstExpense.notes = null
    writeJson(snapshot)

    const detailed = service.loadDetailed()

    expect(detailed.state?.trips).toHaveLength(2)
    expect(detailed.state?.trips[0]?.notes).toBe('')
    expect(detailed.state?.trips[0]?.budget).toBe(0)
    expect(detailed.state?.expensesByTrip[PARIS]?.[0]?.notes).toBe('')
    expect(detailed.state?.expensesByTrip[PARIS]).toHaveLength(2)
  })
})

/* -------------------------------------------------------------------------- */
/* Per-record salvage                                                         */
/* -------------------------------------------------------------------------- */

describe('salvaging per record', () => {
  it('drops one expense in a category this build does not know and keeps the other nineteen', () => {
    const state = twoTripState()
    const expenses = Array.from({ length: 20 }, (_, index) =>
      makeExpense(PARIS, `exp_${String(index + 1).padStart(2, '0')}`),
    )
    const snapshot = raw({ ...state, expensesByTrip: { ...state.expensesByTrip, [PARIS]: expenses } })
    const parisExpenses = (snapshot.expensesByTrip as Record<string, RawRecord[]>)[PARIS]
    const seventh = parisExpenses?.[6]
    if (!seventh) throw new Error('fixture is missing the seventh expense')
    seventh.category = 'gambling'
    writeJson(snapshot)

    const detailed = service.loadDetailed()
    const kept = detailed.state?.expensesByTrip[PARIS]?.map((expense) => expense.id)

    expect(detailed.status).toBe('salvaged')
    expect(detailed.salvage.expenses).toBe(1)
    expect(kept).toHaveLength(19)
    expect(kept).not.toContain('exp_07')
    expect(kept).toEqual(expenses.map((expense) => expense.id).filter((id) => id !== 'exp_07'))
    expect(detailed.state?.expensesByTrip[TOKYO]).toEqual(state.expensesByTrip[TOKYO])
    expect(detailed.state?.trips).toEqual(state.trips)
  })

  it('drops an expense in a currency this build does not know, and only that expense', () => {
    const snapshot = raw(twoTripState())
    const parisExpenses = (snapshot.expensesByTrip as Record<string, RawRecord[]>)[PARIS]
    const first = parisExpenses?.[0]
    if (!first) throw new Error('fixture has no expense')
    first.currency = 'CHF'
    writeJson(snapshot)

    const loaded = service.load()

    expect(loaded?.expensesByTrip[PARIS]?.map((expense) => expense.id)).toEqual(['exp_p2'])
    expect(loaded?.expensesByTrip[TOKYO]?.map((expense) => expense.id)).toEqual(['exp_t1'])
  })

  it('drops an unusable trip among many and keeps the others with all their data', () => {
    const snapshot = raw(twoTripState())
    const trips = snapshot.trips as unknown[]
    trips.splice(1, 0, 'not a trip', { id: 'trip_broken', currency: 'BTC' })
    writeJson(snapshot)

    const detailed = service.loadDetailed()

    expect(detailed.salvage.trips).toBe(2)
    expect(detailed.state?.trips.map((trip) => trip.id)).toEqual([PARIS, TOKYO])
    expect(itemIds(detailed.state, PARIS)).toEqual(['itm_p1', 'itm_p2', 'itm_p3'])
    expect(itemIds(detailed.state, TOKYO)).toEqual(['itm_t1', 'itm_t2'])
    expect(detailed.state?.notesByTrip?.[TOKYO]).toHaveLength(2)
  })

  it('drops an item missing its start time and source, keeping its siblings and its day', () => {
    const snapshot = raw(twoTripState())
    const parisDays = (snapshot.daysByTrip as Record<string, Array<{ items: RawRecord[] }>>)[PARIS]
    const broken = parisDays?.[0]?.items[0]
    if (!broken) throw new Error('fixture has no item')
    delete broken.startTime
    delete broken.source
    writeJson(snapshot)

    const detailed = service.loadDetailed()

    expect(detailed.salvage.items).toBe(1)
    expect(detailed.state?.daysByTrip[PARIS]).toHaveLength(2)
    expect(itemIds(detailed.state, PARIS)).toEqual(['itm_p2', 'itm_p3'])
    expect(itemIds(detailed.state, TOKYO)).toEqual(['itm_t1', 'itm_t2'])
  })

  it('drops an item whose category this build does not know', () => {
    const snapshot = raw(twoTripState())
    const tokyoDays = (snapshot.daysByTrip as Record<string, Array<{ items: RawRecord[] }>>)[TOKYO]
    const second = tokyoDays?.[0]?.items[1]
    if (!second) throw new Error('fixture has no item')
    second.category = 'karaoke'
    writeJson(snapshot)

    expect(itemIds(service.load(), TOKYO)).toEqual(['itm_t1'])
  })

  it('keeps a trip whose status, pace or interests this build does not know, defaulting them', () => {
    const snapshot = raw(twoTripState())
    const trips = snapshot.trips as RawRecord[]
    const tokyo = trips[1]
    if (!tokyo) throw new Error('fixture has no second trip')
    tokyo.status = 'archived'
    tokyo.pace = 'leisurely'
    tokyo.interests = ['skydiving', 'food']
    writeJson(snapshot)

    const loaded = service.load()
    const kept = loaded?.trips.find((trip) => trip.id === TOKYO)

    expect(kept?.status).toBe('draft')
    expect(kept?.pace).toBe('balanced')
    expect(kept?.interests).toEqual(['food'])
    expect(itemIds(loaded, TOKYO)).toEqual(['itm_t1', 'itm_t2'])
  })

  it('defaults an unknown theme and infers a non-boolean demo flag', () => {
    writeJson({ ...raw(twoTripState()), themePreference: 'sepia', hasDemoData: 'yes' })

    const loaded = service.load()

    expect(loaded?.themePreference).toBe('system')
    expect(loaded?.hasDemoData).toBe(false)
    expect(loaded?.trips).toHaveLength(2)
  })

  it('drops a generation record with an unknown status, leaving the trip and the other record', () => {
    const snapshot = raw(twoTripState())
    const generation = snapshot.generation as Record<string, RawRecord>
    const paris = generation[PARIS]
    if (!paris) throw new Error('fixture has no generation record')
    paris.status = 'pending'
    writeJson(snapshot)

    const detailed = service.loadDetailed()

    expect(detailed.salvage.generation).toBe(1)
    expect(detailed.state?.generation).not.toHaveProperty(PARIS)
    expect(detailed.state?.generation[TOKYO]?.status).toBe('idle')
    expect(detailed.state?.trips).toHaveLength(2)
  })

  it('survives a days map that is not a map at all, keeping trips, expenses and notes', () => {
    writeJson({ ...raw(twoTripState()), daysByTrip: 7 })

    const detailed = service.loadDetailed()

    expect(detailed.state?.daysByTrip).toEqual({})
    expect(detailed.salvage.days).toBe(1)
    expect(detailed.state?.trips).toEqual(twoTripState().trips)
    expect(detailed.state?.expensesByTrip).toEqual(twoTripState().expensesByTrip)
    expect(detailed.state?.notesByTrip).toEqual(twoTripState().notesByTrip)
  })

  it('empties a day bucket that holds something other than a list, keeping the other trip', () => {
    writeJson({ ...raw(twoTripState()), daysByTrip: { [PARIS]: { nope: true }, [TOKYO]: raw(twoTripState().daysByTrip[TOKYO]) } })

    const loaded = service.load()

    expect(loaded?.daysByTrip[PARIS]).toEqual([])
    expect(itemIds(loaded, TOKYO)).toEqual(['itm_t1', 'itm_t2'])
  })

  it('rebuilds a missing user so the trips it owned are kept', () => {
    writeJson({ ...raw(twoTripState()), user: null })

    const detailed = service.loadDetailed()

    expect(detailed.salvage.rebuiltUser).toBe(true)
    expect(detailed.state?.user.id).toBe(USER_ID)
    expect(detailed.state?.user.isGuest).toBe(true)
    expect(detailed.state?.trips).toHaveLength(2)
  })

  it('repairs a user missing the fields the app reads rather than rejecting it', () => {
    writeJson({ ...raw(twoTripState()), user: { id: 'usr_partial', name: 'No flags' } })

    const loaded = service.load()

    expect(loaded?.user).toEqual({
      id: 'usr_partial',
      name: 'No flags',
      email: null,
      isGuest: true,
      createdAt: FIXED_ISO,
    })
    expect(loaded?.trips).toHaveLength(2)
  })

  it('keeps a copy of what it salvaged from', () => {
    const snapshot = raw(twoTripState())
    ;(snapshot.trips as unknown[]).push(42)
    const text = JSON.stringify(snapshot)
    writeRaw(text)

    const detailed = service.loadDetailed()

    expect(detailed.status).toBe('salvaged')
    expect(detailed.backupKey).toBe(BACKUP_KEY)
    expect(backup()).toBe(text)
  })
})

/* -------------------------------------------------------------------------- */
/* Unreadable payloads                                                        */
/* -------------------------------------------------------------------------- */

describe('a payload that cannot be read', () => {
  it('starts fresh on malformed JSON without throwing, and keeps the bytes', () => {
    writeRaw('{ this is not json')

    expect(() => service.load()).not.toThrow()
    const detailed = service.loadDetailed()

    expect(detailed.state).toBeNull()
    expect(detailed.status).toBe('unreadable')
    expect(detailed.backupKey).toBe(BACKUP_KEY)
    expect(backup()).toBe('{ this is not json')
  })

  it('starts fresh on a truncated write, keeping the partial bytes for recovery', () => {
    const full = JSON.stringify(twoTripState())
    const truncated = full.slice(0, Math.floor(full.length / 2))
    writeRaw(truncated)

    const detailed = service.loadDetailed()

    expect(detailed.state).toBeNull()
    expect(detailed.status).toBe('unreadable')
    expect(backup()).toBe(truncated)
    expect(backup()).toContain(`Trip ${PARIS}`)
  })

  /**
   * A write interrupted after the trips landed but before the later keys did is
   * still valid JSON if it was written key by key. Everything present is kept.
   */
  it('keeps what a partially written payload does contain', () => {
    const state = twoTripState()
    writeJson({ version: STORAGE_VERSION, user: state.user, trips: state.trips })

    const detailed = service.loadDetailed()

    expect(detailed.state?.trips).toEqual(state.trips)
    expect(detailed.state?.user).toEqual(state.user)
    expect(detailed.state?.daysByTrip).toEqual({})
    expect(detailed.state?.expensesByTrip).toEqual({})
    expect(detailed.state?.notesByTrip).toEqual({})
    expect(detailed.state?.themePreference).toBe('system')
  })

  it('starts fresh on a JSON primitive, keeping a copy', () => {
    writeRaw('42')

    expect(service.load()).toBeNull()
    expect(service.loadDetailed().status).toBe('unreadable')
    expect(backup()).toBe('42')
  })

  it('starts fresh on a JSON array, keeping a copy', () => {
    writeRaw('[]')

    expect(service.load()).toBeNull()
    expect(backup()).toBe('[]')
  })

  it('starts fresh on an object with neither a user nor a single usable trip', () => {
    writeJson({ version: STORAGE_VERSION, trips: { nope: true }, daysByTrip: {} })

    const detailed = service.loadDetailed()

    expect(detailed.state).toBeNull()
    expect(detailed.status).toBe('unreadable')
    expect(detailed.backupKey).toBe(BACKUP_KEY)
  })

  it('keeps the backup after the caller starts fresh and overwrites the live key', () => {
    writeRaw('{ "trips": [ { "id": "trip_half')

    const base = service.load() ?? createEmptyState()
    service.save(base)

    expect(JSON.parse(stored() ?? 'null')).toMatchObject({ trips: [] })
    expect(backup()).toBe('{ "trips": [ { "id": "trip_half')
  })

  it('does not throw when even the backup cannot be written', () => {
    writeRaw('{ broken')
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError')
    })

    let detailed: ReturnType<typeof service.loadDetailed> | undefined
    expect(() => {
      detailed = service.loadDetailed()
    }).not.toThrow()
    expect(detailed?.status).toBe('unreadable')
    expect(detailed?.backupKey).toBeNull()
  })
})

/* -------------------------------------------------------------------------- */
/* A snapshot from a newer build                                              */
/* -------------------------------------------------------------------------- */

describe('a snapshot written by a newer build', () => {
  function futureSnapshot(): string {
    return JSON.stringify({ ...raw(twoTripState()), version: STORAGE_VERSION + 1, itineraryV3: [] })
  }

  it('does not crash, starts fresh and says why', () => {
    writeRaw(futureSnapshot())

    expect(() => service.load()).not.toThrow()
    const detailed = service.loadDetailed()

    expect(detailed.state).toBeNull()
    expect(detailed.status).toBe('future')
    expect(detailed.foundVersion).toBe(STORAGE_VERSION + 1)
  })

  it('leaves the original, byte for byte, in the backup', () => {
    const text = futureSnapshot()
    writeRaw(text)

    const detailed = service.loadDetailed()

    expect(detailed.backupKey).toBe(BACKUP_KEY)
    expect(backup()).toBe(text)
  })

  /** Pinned to 4 rather than `STORAGE_VERSION + 1`, so the v3 bump is proven not to read it. */
  it('does not read a v4 payload, and neither loading it nor its backup overwrites it', () => {
    const text = JSON.stringify({ ...raw(twoTripState()), version: 4 })
    writeRaw(text)

    const detailed = service.loadDetailed()

    expect(detailed.status).toBe('future')
    expect(detailed.foundVersion).toBe(4)
    expect(detailed.state).toBeNull()
    expect(backup()).toBe(text)
    expect(stored()).toBe(text)
  })

  it('still has the backup after this build starts fresh and saves over the live key', () => {
    const text = futureSnapshot()
    writeRaw(text)

    service.save(service.load() ?? createEmptyState())

    expect(stored()).not.toBe(text)
    expect(backup()).toBe(text)
  })
})

/* -------------------------------------------------------------------------- */
/* save()                                                                     */
/* -------------------------------------------------------------------------- */

describe('save', () => {
  it('reports a clean save', () => {
    const result = service.save(twoTripState())

    expect(result.status).toBe('saved')
    expect(result.reason).toBeNull()
    expect(result.salvage.trips + result.salvage.items + result.salvage.expenses).toBe(0)
  })

  /**
   * Before, one malformed record made `save()` return silently, and it kept
   * doing so on every later save: the UI looked saved while nothing was.
   */
  it('writes everything else when one record is malformed, and says what it left out', () => {
    const state = twoTripState()
    const broken = { ...state, trips: [...state.trips, { id: 'trip_broken' }] } as unknown as PersistedState

    const result = service.save(broken)

    expect(result.status).toBe('saved')
    expect(result.salvage.trips).toBe(1)
    expect(service.load()).toEqual(state)
  })

  it('does not let one invalid field stop the other changes being persisted', () => {
    service.save(twoTripState())

    const renamed = twoTripState()
    const paris = renamed.trips[0]
    if (!paris) throw new Error('fixture has no trip')
    paris.name = 'Renamed while the theme was corrupt'
    service.save({ ...renamed, themePreference: 'neon' } as unknown as PersistedState)

    const loaded = service.load()
    expect(loaded?.trips[0]?.name).toBe('Renamed while the theme was corrupt')
    expect(loaded?.themePreference).toBe('system')
  })

  it('refuses rubbish observably, leaving the earlier payload in place', () => {
    service.save(twoTripState())
    const good = stored()

    const result = service.save({ version: STORAGE_VERSION } as unknown as PersistedState)

    expect(result.status).toBe('refused')
    expect(result.reason).not.toBeNull()
    expect(stored()).toBe(good)
    expect(service.load()).toEqual(twoTripState())
  })

  /**
   * The actual wedge. The bad record lives in the in-memory state, so it rides
   * along on *every* later save. Before, each of those saves was refused in
   * turn, and nothing the traveller did for the rest of the session persisted.
   */
  it('is not wedged by a bad record that rides along on every later save', () => {
    service.save(twoTripState())

    for (const name of ['First rename', 'Second rename', 'Third rename']) {
      const next = twoTripState()
      const paris = next.trips[0]
      if (!paris) throw new Error('fixture has no trip')
      paris.name = name
      const withBadExpense = raw(next)
      const parisExpenses = (withBadExpense.expensesByTrip as Record<string, RawRecord[]>)[PARIS]
      parisExpenses?.push({ ...raw(makeExpense(PARIS, 'exp_bad')), category: 'gambling' })

      expect(service.save(withBadExpense as unknown as PersistedState).status).toBe('saved')
    }

    const loaded = service.load()
    expect(loaded?.trips[0]?.name).toBe('Third rename')
    expect(loaded?.expensesByTrip[PARIS]?.map((expense) => expense.id)).toEqual(['exp_p1', 'exp_p2'])
  })

  it('does not let a refusal poison the next save', () => {
    service.save(twoTripState())
    service.save(null as unknown as PersistedState)
    service.save('garbage' as unknown as PersistedState)

    const next = twoTripState()
    const tokyo = next.trips[1]
    if (!tokyo) throw new Error('fixture has no second trip')
    tokyo.name = 'Saved after two refusals'
    const result = service.save(next)

    expect(result.status).toBe('saved')
    expect(service.load()?.trips[1]?.name).toBe('Saved after two refusals')
  })

  it('reports a quota failure without throwing, keeps the old payload, and recovers', () => {
    service.save(twoTripState())
    const good = stored()

    const quota = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError')
    })
    const renamed = twoTripState()
    const paris = renamed.trips[0]
    if (!paris) throw new Error('fixture has no trip')
    paris.name = 'Written once there is room'

    let failed: ReturnType<typeof service.save> | undefined
    expect(() => {
      failed = service.save(renamed)
    }).not.toThrow()
    expect(failed?.status).toBe('unwritable')
    expect(failed?.reason).toMatch(/quota/i)
    expect(stored()).toBe(good)

    quota.mockRestore()
    expect(service.save(renamed).status).toBe('saved')
    expect(service.load()?.trips[0]?.name).toBe('Written once there is room')
  })

  it('brings a stale v1-shaped state forward on the way out', () => {
    service.save(asV1(twoTripState()) as unknown as PersistedState)

    const written = JSON.parse(stored() ?? 'null') as PersistedState
    expect(written.version).toBe(STORAGE_VERSION)
    expect(itemCurrencies(written, TOKYO)).toEqual(['JPY', 'JPY'])
  })
})

/* -------------------------------------------------------------------------- */
/* clear()                                                                    */
/* -------------------------------------------------------------------------- */

describe('clear', () => {
  it('removes the stored payload', () => {
    service.save(createDemoState())
    expect(stored()).not.toBeNull()

    service.clear()

    expect(stored()).toBeNull()
    expect(service.load()).toBeNull()
  })

  it('keeps a copy of what it cleared', () => {
    service.save(twoTripState())
    const before = stored()

    service.clear()

    expect(backup()).toBe(before)
  })

  it('is a safe no-op when nothing is stored', () => {
    expect(() => service.clear()).not.toThrow()
    expect(service.load()).toBeNull()
    expect(backup()).toBeNull()
  })

  it('leaves unrelated keys untouched', () => {
    window.localStorage.setItem('tourist.unrelated', 'keep me')
    service.save(createEmptyState())

    service.clear()

    expect(window.localStorage.getItem('tourist.unrelated')).toBe('keep me')
  })
})

/* -------------------------------------------------------------------------- */
/* Factories                                                                  */
/* -------------------------------------------------------------------------- */

describe('createGuestUser', () => {
  it('returns a guest with the expected shape', () => {
    const user = createGuestUser()

    expect(user.id).toMatch(/^usr_/)
    expect(user.name.length).toBeGreaterThan(0)
    expect(user.email).toBeNull()
    expect(user.isGuest).toBe(true)
    expect(user.createdAt).toBe(FIXED_ISO)
  })

  it('applies overrides', () => {
    const user = createGuestUser({ name: 'Amara', email: 'amara@example.com', isGuest: false })

    expect(user.name).toBe('Amara')
    expect(user.email).toBe('amara@example.com')
    expect(user.isGuest).toBe(false)
    expect(user.id).toMatch(/^usr_/)
  })

  it('issues a different id on every call', () => {
    const first = createGuestUser()
    const second = createGuestUser()

    expect(first.id).not.toBe(second.id)
  })
})

describe('createEmptyState', () => {
  it('starts empty at the current version', () => {
    const state = createEmptyState()

    expect(state.version).toBe(STORAGE_VERSION)
    expect(state.trips).toEqual([])
    expect(state.daysByTrip).toEqual({})
    expect(state.expensesByTrip).toEqual({})
    expect(state.notesByTrip).toEqual({})
    expect(state.generation).toEqual({})
    expect(state.themePreference).toBe('system')
    expect(state.hasDemoData).toBe(false)
  })

  it('adopts the user it is given', () => {
    const user = createGuestUser({ name: 'Chidi' })
    const state = createEmptyState(user)

    expect(state.user).toBe(user)
    expect(state.user.isGuest).toBe(true)
  })
})

describe('createDemoState', () => {
  it('contains exactly one seeded trip', () => {
    const state = createDemoState()

    expect(state.trips).toHaveLength(1)
    expect(state.trips[0]?.id).toBe(DEMO_TRIP_ID)
    expect(state.hasDemoData).toBe(true)
  })

  it('seeds the trip with the documented origin, destination, party size and length', () => {
    const trip = createDemoState().trips[0]

    expect(trip?.origin).toBe('Lagos, Nigeria')
    expect(trip?.destination).toBe('Paris, France')
    expect(trip?.destinationId).toBe('paris')
    expect(trip?.travelers).toBe(2)
    expect(trip?.startDate).toBe(FIXED_TODAY)
    expect(trip?.startDate).toBe(todayISO())
    expect(trip?.endDate).toBe(addDays(FIXED_TODAY, 6))
  })

  it('spans seven days inclusive of both ends', () => {
    const state = createDemoState()
    const trip = state.trips[0]
    const days = state.daysByTrip[trip?.id ?? '']

    expect(eachDay(trip?.startDate ?? '', trip?.endDate ?? '')).toHaveLength(7)
    expect(days).toHaveLength(7)
    expect(days?.map((day) => day.date)).toEqual(eachDay(trip?.startDate ?? '', trip?.endDate ?? ''))
    expect(days?.map((day) => day.index)).toEqual([1, 2, 3, 4, 5, 6, 7])
  })

  it('gives every day at least one item', () => {
    const state = createDemoState()
    const trip = state.trips[0]
    const days = state.daysByTrip[trip?.id ?? ''] ?? []

    for (const day of days) {
      expect(day.items.length).toBeGreaterThan(0)
      expect(day.tripId).toBe(trip?.id)
    }
  })

  it('seeds expenses with positive amounts', () => {
    const state = createDemoState()
    const trip = state.trips[0]
    const expenses = state.expensesByTrip[trip?.id ?? ''] ?? []

    expect(expenses.length).toBeGreaterThan(0)
    for (const expense of expenses) {
      expect(expense.amount).toBeGreaterThan(0)
      expect(expense.tripId).toBe(trip?.id)
      expect(expense.currency).toBe(trip?.currency)
    }
  })

  it('seeds a guest user', () => {
    const state = createDemoState()

    expect(state.user.isGuest).toBe(true)
    expect(state.user.id).toMatch(/^usr_/)
  })

  it('seeds an idle generation record for the trip', () => {
    const state = createDemoState()
    const generation = state.generation[state.trips[0]?.id ?? '']

    expect(generation?.status).toBe('idle')
    expect(generation?.error).toBeNull()
    expect(generation?.startedAt).toBeNull()
    expect(generation?.completedAt).toBeNull()
  })

  it('does not seed the retired shouldFail switch', () => {
    const state = createDemoState()
    const generation = state.generation[state.trips[0]?.id ?? '']

    expect(generation?.shouldFail).toBeUndefined()
  })

  it('survives a save and load cycle unchanged', () => {
    const state = createDemoState()

    service.save(state)

    const detailed = service.loadDetailed()
    expect(detailed.state).toEqual(state)
    expect(detailed.status).toBe('loaded')
  })

  it('adopts the user it is given', () => {
    const user = createGuestUser({ name: 'Demo Owner' })
    const state = createDemoState(user)

    expect(state.user).toBe(user)
    expect(state.trips[0]?.userId).toBe(user.id)
  })
})

describe('reading an itinerary stop role', () => {
  function withRoles(roles: unknown[]): PersistedState | null {
    const items = roles.map((role, index) => {
      // Raw saved data: the role is whatever was stored, not a typed value.
      const item: Record<string, unknown> = { ...makeItem(PARIS, `itm_${index}`, 'EUR') }
      if (role !== undefined) item.role = role
      return item
    })
    writeJson(
      raw({
        ...createEmptyState(createGuestUser({ id: USER_ID })),
        trips: [makeTrip(PARIS, 'EUR', { destination: 'Paris, France' })],
        daysByTrip: { [PARIS]: [makeDay(PARIS, 1, items as unknown as ItineraryItem[])] },
      }),
    )
    return service.loadDetailed().state
  }

  it('keeps arrival and departure roles through a save and reload', () => {
    const state = withRoles(['arrival', undefined, 'departure'])
    const items = state?.daysByTrip[PARIS]?.[0]?.items ?? []

    expect(items.map((item) => item.role)).toEqual(['arrival', undefined, 'departure'])
    // An ordinary stop gains no role key at all, so older drafts stay byte-identical.
    expect(items[1]).not.toHaveProperty('role')
  })

  it('drops an unknown role but keeps the stop', () => {
    const state = withRoles(['layover', 42])
    const items = state?.daysByTrip[PARIS]?.[0]?.items ?? []

    expect(items).toHaveLength(2)
    expect(items.every((item) => !('role' in item))).toBe(true)
  })
})

/* -------------------------------------------------------------------------- */
/* Buckets whose trip did not survive                                         */
/* -------------------------------------------------------------------------- */

describe('buckets whose trip did not survive', () => {
  /** Tokyo's trip record names a currency this build does not know, so the trip is dropped. */
  function withUnreadableTokyo(): RawRecord {
    const snapshot = raw(twoTripState())
    const trips = snapshot.trips as RawRecord[]
    trips[1].currency = 'BTC'
    return snapshot
  }

  it('prunes the days, expenses, notes and generation record of a dropped trip', () => {
    writeJson(withUnreadableTokyo())

    const detailed = service.loadDetailed()

    expect(detailed.status).toBe('salvaged')
    expect(detailed.salvage.trips).toBe(1)
    expect(detailed.salvage.orphanedBuckets).toBe(3)
    expect(detailed.state?.trips.map((trip) => trip.id)).toEqual([PARIS])
    expect(Object.keys(detailed.state?.daysByTrip ?? {})).toEqual([PARIS])
    expect(Object.keys(detailed.state?.expensesByTrip ?? {})).toEqual([PARIS])
    expect(Object.keys(detailed.state?.notesByTrip ?? {})).toEqual([PARIS])
    expect(Object.keys(detailed.state?.generation ?? {})).toEqual([PARIS])
    // The surviving trip keeps everything.
    expect(itemIds(detailed.state, PARIS)).toEqual(['itm_p1', 'itm_p2', 'itm_p3'])
    expect(detailed.state?.expensesByTrip[PARIS]).toHaveLength(2)
    expect(detailed.state?.notesByTrip?.[PARIS]).toHaveLength(1)
  })

  it('does not write the buckets of a dropped trip back, and keeps a copy of the original', () => {
    const snapshot = withUnreadableTokyo()
    writeJson(snapshot)

    const detailed = service.loadDetailed()
    if (!detailed.state) throw new Error('expected a salvaged state')
    service.save(detailed.state)

    expect(stored()).not.toContain(TOKYO)
    expect(backup()).toBe(JSON.stringify(snapshot))
    expect(service.loadDetailed().status).toBe('loaded')
  })

  it('reports records filed under a trip that is not there at all as a salvage', () => {
    const snapshot = raw(twoTripState())
    ;(snapshot.expensesByTrip as RawRecord).trip_gone = [raw(makeExpense('trip_gone', 'exp_orphan'))]
    ;(snapshot.notesByTrip as RawRecord).trip_gone = [raw(makeNote('trip_gone', 'not_orphan'))]
    writeJson(snapshot)

    const detailed = service.loadDetailed()

    expect(detailed.status).toBe('salvaged')
    expect(detailed.salvage.orphanedBuckets).toBe(2)
    expect(detailed.state?.expensesByTrip).not.toHaveProperty('trip_gone')
    expect(detailed.state?.notesByTrip).not.toHaveProperty('trip_gone')
    expect(detailed.backupKey).toBe(BACKUP_KEY)
  })

  it('prunes an empty bucket and a generation record with no trip without calling it a loss', () => {
    const snapshot = raw(twoTripState())
    ;(snapshot.daysByTrip as RawRecord).trip_gone = []
    ;(snapshot.expensesByTrip as RawRecord).trip_gone = []
    ;(snapshot.generation as RawRecord).trip_gone = {
      status: 'idle',
      error: null,
      startedAt: null,
      completedAt: null,
    }
    writeJson(snapshot)

    const detailed = service.loadDetailed()

    expect(detailed.status).toBe('loaded')
    expect(detailed.salvage.orphanedBuckets).toBe(0)
    expect(detailed.state?.daysByTrip).not.toHaveProperty('trip_gone')
    expect(detailed.state?.expensesByTrip).not.toHaveProperty('trip_gone')
    expect(detailed.state?.generation).not.toHaveProperty('trip_gone')
  })

  it('files a day bucket under its own trip when only the bucket key is stale', () => {
    const snapshot = raw(twoTripState())
    const days = snapshot.daysByTrip as RawRecord
    days.stale_key = days[TOKYO]
    delete days[TOKYO]
    writeJson(snapshot)

    const detailed = service.loadDetailed()

    expect(detailed.state?.daysByTrip).not.toHaveProperty('stale_key')
    expect(itemIds(detailed.state, TOKYO)).toEqual(['itm_t1', 'itm_t2'])
    expect(detailed.salvage.orphanedBuckets).toBe(0)
  })
})

describe('the backup slot', () => {
  it('says whether a backup copy is there', () => {
    expect(service.hasBackup()).toBe(false)
    window.localStorage.setItem(BACKUP_KEY, 'anything')
    expect(service.hasBackup()).toBe(true)
  })

  it('discards the backup and nothing else', () => {
    service.save(twoTripState())
    const live = stored()
    window.localStorage.setItem(BACKUP_KEY, 'old copy')
    window.localStorage.setItem('tourist.theme', 'dark')

    service.discardBackup()

    expect(backup()).toBeNull()
    expect(service.hasBackup()).toBe(false)
    expect(stored()).toBe(live)
    expect(window.localStorage.getItem('tourist.theme')).toBe('dark')
  })

  it('is a safe no-op when there is no backup', () => {
    expect(() => service.discardBackup()).not.toThrow()
    expect(service.hasBackup()).toBe(false)
  })
})
