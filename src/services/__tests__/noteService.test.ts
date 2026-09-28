import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Trip, TripNote } from '@/domain/types'
import { NOTE_LIMITS } from '@/domain/validation'
import { STORAGE_VERSION, type PersistedState } from '@/services/contracts'
import { createNoteService } from '@/services/noteService'
import { createEmptyState, createGuestUser } from '@/services/persistence'

const FIXED_NOW = new Date('2026-03-15T09:30:00.000Z')
const FIXED_ISO = '2026-03-15T09:30:00.000Z'

const TRIP: Trip = {
  id: 'trip_fixture',
  userId: 'usr_fixture',
  name: 'Paris in the Spring',
  origin: 'Lagos, Nigeria',
  destination: 'Paris, France',
  startDate: '2026-04-01',
  endDate: '2026-04-05',
  travelers: 2,
  budget: 2500,
  currency: 'EUR',
  interests: ['culture', 'food'],
  pace: 'balanced',
  notes: '',
  status: 'itinerary_ready',
  createdAt: FIXED_ISO,
  updatedAt: FIXED_ISO,
}

const OTHER_TRIP: Trip = { ...TRIP, id: 'trip_other', name: 'Lisbon long weekend' }

function stateWith(notes: TripNote[] = [], otherNotes: TripNote[] = []): PersistedState {
  const base = createEmptyState(createGuestUser())
  return {
    ...base,
    version: STORAGE_VERSION,
    trips: [TRIP, OTHER_TRIP],
    daysByTrip: { [TRIP.id]: [], [OTHER_TRIP.id]: [] },
    expensesByTrip: { [TRIP.id]: [], [OTHER_TRIP.id]: [] },
    generation: {},
    notesByTrip: { [TRIP.id]: notes, [OTHER_TRIP.id]: otherNotes },
  }
}

function note(overrides: Partial<TripNote> = {}): TripNote {
  return {
    id: 'not_fixture',
    tripId: TRIP.id,
    title: 'Flight reference',
    body: 'FR 1420, departs 07:40',
    pinned: false,
    createdAt: FIXED_ISO,
    updatedAt: FIXED_ISO,
    ...overrides,
  }
}

describe('noteService', () => {
  const service = createNoteService()

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(FIXED_NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('add', () => {
    it('stores a trimmed note stamped with the trip and an ISO timestamp', () => {
      const result = service.add(stateWith(), {
        tripId: TRIP.id,
        title: '  Flight reference  ',
        body: '  FR 1420, departs 07:40  ',
      })

      expect(result.note).not.toBeNull()
      expect(result.note?.tripId).toBe(TRIP.id)
      expect(result.note?.title).toBe('Flight reference')
      expect(result.note?.body).toBe('FR 1420, departs 07:40')
      expect(result.note?.pinned).toBe(false)
      expect(result.note?.createdAt).toBe(FIXED_ISO)
      expect(result.note?.updatedAt).toBe(FIXED_ISO)
    })

    it('puts the newest note first', () => {
      const existing = note()
      const result = service.add(stateWith([existing]), {
        tripId: TRIP.id,
        title: '',
        body: 'Second note',
      })

      expect(result.state.notesByTrip?.[TRIP.id]?.map((candidate) => candidate.body)).toEqual([
        'Second note',
        existing.body,
      ])
    })

    it('keeps the line breaks the traveller typed', () => {
      const result = service.add(stateWith(), {
        tripId: TRIP.id,
        title: '',
        body: 'Gate B22\nSeat 14A\nAsk for the window',
      })

      expect(result.note?.body).toBe('Gate B22\nSeat 14A\nAsk for the window')
    })

    it('accepts a note with no title', () => {
      const result = service.add(stateWith(), { tripId: TRIP.id, title: '', body: 'Just the detail' })

      expect(result.note?.title).toBe('')
    })

    it('pins a note when the caller asks for it', () => {
      const result = service.add(stateWith(), {
        tripId: TRIP.id,
        title: '',
        body: 'Passport',
        pinned: true,
      })

      expect(result.note?.pinned).toBe(true)
    })

    it('refuses an empty note and leaves the state untouched', () => {
      const state = stateWith()
      const result = service.add(state, { tripId: TRIP.id, title: 'Nothing', body: '   ' })

      expect(result.note).toBeNull()
      expect(result.state).toBe(state)
    })

    it('refuses a note longer than the body limit', () => {
      const state = stateWith()
      const result = service.add(state, {
        tripId: TRIP.id,
        title: '',
        body: 'x'.repeat(NOTE_LIMITS.maxBodyLength + 1),
      })

      expect(result.note).toBeNull()
      expect(result.state).toBe(state)
    })

    it('refuses a title longer than the limit', () => {
      const result = service.add(stateWith(), {
        tripId: TRIP.id,
        title: 'x'.repeat(NOTE_LIMITS.maxTitleLength + 1),
        body: 'Body',
      })

      expect(result.note).toBeNull()
    })

    it('starts a bucket for a trip that has no notes yet', () => {
      const state: PersistedState = { ...stateWith(), notesByTrip: {} }
      const result = service.add(state, { tripId: OTHER_TRIP.id, title: '', body: 'Lisbon detail' })

      expect(result.state.notesByTrip?.[OTHER_TRIP.id]).toHaveLength(1)
      expect(result.state.notesByTrip?.[TRIP.id]).toBeUndefined()
    })
  })

  describe('update', () => {
    it('replaces only the fields in the patch', () => {
      const existing = note()
      const result = service.update(stateWith([existing]), TRIP.id, existing.id, { pinned: true })

      expect(result.note?.title).toBe(existing.title)
      expect(result.note?.body).toBe(existing.body)
      expect(result.note?.pinned).toBe(true)
    })

    it('trims what it stores and moves the edit timestamp forward', () => {
      const existing = note()
      vi.setSystemTime(new Date('2026-03-16T11:00:00.000Z'))

      const result = service.update(stateWith([existing]), TRIP.id, existing.id, {
        title: '  New title  ',
        body: '  New body  ',
      })

      expect(result.note?.title).toBe('New title')
      expect(result.note?.body).toBe('New body')
      expect(result.note?.createdAt).toBe(FIXED_ISO)
      expect(result.note?.updatedAt).toBe('2026-03-16T11:00:00.000Z')
    })

    it('leaves the other notes in place and in order', () => {
      const first = note()
      const second = note({ id: 'not_second', body: 'Second' })
      const result = service.update(stateWith([first, second]), TRIP.id, first.id, { title: 'Edited' })

      expect(result.state.notesByTrip?.[TRIP.id]?.map((candidate) => candidate.id)).toEqual([
        'not_fixture',
        'not_second',
      ])
    })

    it('refuses to empty the body', () => {
      const existing = note()
      const state = stateWith([existing])
      const result = service.update(state, TRIP.id, existing.id, { body: '  ' })

      expect(result.note).toBeNull()
      expect(result.state).toBe(state)
    })

    it('does nothing for a note that belongs to another trip', () => {
      const foreign = note({ id: 'not_foreign', tripId: OTHER_TRIP.id })
      const state = stateWith([], [foreign])
      const result = service.update(state, TRIP.id, foreign.id, { title: 'Hijacked' })

      expect(result.note).toBeNull()
      expect(result.state).toBe(state)
    })

    it('does nothing for a note that does not exist', () => {
      const state = stateWith()
      const result = service.update(state, TRIP.id, 'not_missing', { title: 'Nope' })

      expect(result.note).toBeNull()
      expect(result.state).toBe(state)
    })
  })

  describe('setPinned', () => {
    it('pins and unpins without touching the body', () => {
      const existing = note()
      const pinned = service.setPinned(stateWith([existing]), TRIP.id, existing.id, true)
      expect(pinned.notesByTrip?.[TRIP.id]?.[0]?.pinned).toBe(true)
      expect(pinned.notesByTrip?.[TRIP.id]?.[0]?.body).toBe(existing.body)

      const unpinned = service.setPinned(pinned, TRIP.id, existing.id, false)
      expect(unpinned.notesByTrip?.[TRIP.id]?.[0]?.pinned).toBe(false)
    })

    it('ignores an unknown note id', () => {
      const state = stateWith([note()])
      const result = service.setPinned(state, TRIP.id, 'not_missing', true)

      expect(result.notesByTrip?.[TRIP.id]?.[0]?.pinned).toBe(false)
    })
  })

  describe('remove', () => {
    it('drops only the requested note', () => {
      const first = note()
      const second = note({ id: 'not_second' })
      const result = service.remove(stateWith([first, second]), TRIP.id, first.id)

      expect(result.notesByTrip?.[TRIP.id]?.map((candidate) => candidate.id)).toEqual(['not_second'])
    })

    it('leaves another trip notes alone', () => {
      const mine = note()
      const theirs = note({ id: 'not_theirs', tripId: OTHER_TRIP.id })
      const result = service.remove(stateWith([mine], [theirs]), TRIP.id, mine.id)

      expect(result.notesByTrip?.[OTHER_TRIP.id]).toHaveLength(1)
    })

    it('is a no-op for an unknown note id', () => {
      const state = stateWith([note()])
      const result = service.remove(state, TRIP.id, 'not_missing')

      expect(result.notesByTrip?.[TRIP.id]).toHaveLength(1)
    })
  })
})
