import { createId, nowISO } from '@/domain/ids'
import { validateNoteDraft } from '@/domain/validation'
import type { NoteMutationResult, NotePatch, NoteService, PersistedState } from './contracts'
import type { TripNote } from '@/domain/types'

function notesFor(state: PersistedState, tripId: string): TripNote[] {
  return state.notesByTrip?.[tripId] ?? []
}

function withNotes(state: PersistedState, tripId: string, notes: TripNote[]): PersistedState {
  return { ...state, notesByTrip: { ...(state.notesByTrip ?? {}), [tripId]: notes } }
}

export function createNoteService(): NoteService {
  return {
    add(state, input): NoteMutationResult {
      const { isValid } = validateNoteDraft({ title: input.title, body: input.body })
      if (!isValid) return { state, note: null }

      const at = nowISO()
      const note: TripNote = {
        id: createId('not'),
        tripId: input.tripId,
        title: input.title.trim(),
        body: input.body.trim(),
        pinned: input.pinned === true,
        createdAt: at,
        updatedAt: at,
      }
      return {
        state: withNotes(state, note.tripId, [note, ...notesFor(state, note.tripId)]),
        note,
      }
    },

    update(state, tripId, noteId, patch: NotePatch): NoteMutationResult {
      const existing = notesFor(state, tripId).find((note) => note.id === noteId)
      if (!existing) return { state, note: null }

      const merged = {
        ...existing,
        title: patch.title !== undefined ? patch.title.trim() : existing.title,
        body: patch.body !== undefined ? patch.body.trim() : existing.body,
        pinned: patch.pinned !== undefined ? patch.pinned === true : existing.pinned,
      }
      const { isValid } = validateNoteDraft({ title: merged.title, body: merged.body })
      if (!isValid) return { state, note: null }

      const updated: TripNote = { ...merged, updatedAt: nowISO() }
      return {
        state: withNotes(
          state,
          tripId,
          notesFor(state, tripId).map((note) => (note.id === noteId ? updated : note)),
        ),
        note: updated,
      }
    },

    setPinned(state, tripId, noteId, pinned) {
      return withNotes(
        state,
        tripId,
        notesFor(state, tripId).map((note) =>
          note.id === noteId ? { ...note, pinned, updatedAt: nowISO() } : note,
        ),
      )
    },

    remove(state, tripId, noteId) {
      return withNotes(
        state,
        tripId,
        notesFor(state, tripId).filter((note) => note.id !== noteId),
      )
    },
  }
}
