import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import NotesPage from '@/pages/NotesPage'
import { renderWithProviders } from '@/test/renderWithProviders'
import {
  FIXTURE_NOTE_TITLES,
  FIXTURE_TRIP_ID,
  fixtureState,
  makeFixtureNotes,
  readStoredState,
} from '@/pages/__tests__/tripFixture'
import type { PersistedState } from '@/services/contracts'

function renderAt(tripId: string, state: PersistedState) {
  return renderWithProviders(
    <Routes>
      <Route path="/trips/:tripId" element={<p>Overview</p>} />
      <Route path="/trips/:tripId/notes" element={<NotesPage />} />
    </Routes>,
    { route: `/trips/${tripId}/notes`, state },
  )
}

function renderNotes(state: PersistedState = fixtureState()) {
  return renderAt(FIXTURE_TRIP_ID, state)
}

function openNewNote(user: ReturnType<typeof userEvent.setup>) {
  return user.click(screen.getAllByRole('button', { name: 'New note' })[0])
}

function typeBody(user: ReturnType<typeof userEvent.setup>, value: string) {
  return user.type(screen.getByLabelText(/^Note/), value)
}

describe('NotesPage', () => {
  it('frames the page around the trip and says what notes are for', () => {
    renderNotes()

    expect(screen.getByRole('heading', { level: 1, name: 'Paris in the Spring' })).toBeInTheDocument()
    expect(
      screen.getByText(/Your own record for this trip: flight references, booking confirmations/),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Trip overview' })).toHaveAttribute(
      'href',
      `/trips/${FIXTURE_TRIP_ID}`,
    )
  })

  it('lists every note with its body on separate lines', () => {
    renderNotes()

    expect(screen.getByText('3 notes')).toBeInTheDocument()
    for (const title of FIXTURE_NOTE_TITLES) {
      expect(screen.getByRole('heading', { level: 3, name: title })).toBeInTheDocument()
    }
    const first = screen.getByText('Detail 1', { exact: false })
    expect(first).toHaveClass('whitespace-pre-wrap')
    expect(first.textContent).toBe('Detail 1\nSecond line 1')
  })

  it('reports how many notes are pinned and marks the pinned one', () => {
    renderNotes()

    expect(screen.getByText('1 pinned')).toBeInTheDocument()
    expect(screen.getAllByText('Pinned')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Unpin' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('shows when each note was added and edited', () => {
    renderNotes()

    const article = screen.getAllByRole('article')[0]
    expect(within(article).getByText(/^Added /)).toBeInTheDocument()
    expect(within(article).queryByText(/^Edited /)).not.toBeInTheDocument()
  })

  it('invites the first note when there are none', () => {
    renderNotes(fixtureState({ notes: [] }))

    expect(screen.getByText('No notes yet')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Write the first note' })).toBeInTheDocument()
  })

  it('says plainly that notes never touch the itinerary or the budget', () => {
    renderNotes()

    expect(screen.getByText('These notes are yours')).toBeInTheDocument()
    expect(screen.getByText(/Notes are stored only in this browser/)).toBeInTheDocument()
  })

  it('refuses an unknown trip without losing the rest', () => {
    renderAt('trip-does-not-exist', fixtureState())

    expect(screen.getByText('We could not find that trip')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to trips' })).toHaveAttribute('href', '/trips')
  })

  describe('writing a note', () => {
    it('saves a note and puts it at the top of the list', async () => {
      const user = userEvent.setup()
      renderNotes()

      await openNewNote(user)
      await user.type(screen.getByLabelText(/^Title/), 'Airport transfer')
      await typeBody(user, 'Heads up signs{enter}Platform 4')
      await user.click(screen.getByRole('button', { name: 'Save note' }))

      expect(screen.getByRole('heading', { level: 3, name: 'Airport transfer' })).toBeInTheDocument()
      expect(screen.getByText('4 notes')).toBeInTheDocument()
      const saved = readStoredState().notesByTrip?.[FIXTURE_TRIP_ID]?.[0]
      expect(saved?.body).toBe('Heads up signs\nPlatform 4')
      expect(saved?.pinned).toBe(false)
    })

    it('keeps the newlines exactly as typed', async () => {
      const user = userEvent.setup()
      renderNotes(fixtureState({ notes: [] }))

      await openNewNote(user)
      await typeBody(user, 'Line one{enter}{enter}Line three')
      await user.click(screen.getByRole('button', { name: 'Save note' }))

      expect(screen.getByText('Line one Line three')).toHaveClass('whitespace-pre-wrap')
      expect(readStoredState().notesByTrip?.[FIXTURE_TRIP_ID]?.[0]?.body).toBe(
        'Line one\n\nLine three',
      )
    })

    it('accepts a note with no title and labels it by its first line', async () => {
      const user = userEvent.setup()
      renderNotes(fixtureState({ notes: [] }))

      await openNewNote(user)
      await typeBody(user, 'Gate B22{enter}Seat 14A')
      await user.click(screen.getByRole('button', { name: 'Save note' }))

      expect(screen.getByRole('heading', { level: 3, name: 'Gate B22' })).toBeInTheDocument()
    })

    it('refuses an empty note and says which field is the problem', async () => {
      const user = userEvent.setup()
      renderNotes()

      await openNewNote(user)
      await user.type(screen.getByLabelText(/^Title/), 'Nothing useful')
      await user.click(screen.getByRole('button', { name: 'Save note' }))

      expect(screen.getByRole('alert')).toHaveTextContent('Write something before saving the note.')
      expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(3)
    })

    it('trims the title and body before saving', async () => {
      const user = userEvent.setup()
      renderNotes(fixtureState({ notes: [] }))

      await openNewNote(user)
      await user.type(screen.getByLabelText(/^Title/), '  Padded  ')
      await typeBody(user, '   Body   ')
      await user.click(screen.getByRole('button', { name: 'Save note' }))

      const saved = readStoredState().notesByTrip?.[FIXTURE_TRIP_ID]?.[0]
      expect(saved?.title).toBe('Padded')
      expect(saved?.body).toBe('Body')
    })

    it('saves nothing when the dialog is cancelled', async () => {
      const user = userEvent.setup()
      renderNotes()

      await openNewNote(user)
      await typeBody(user, 'Abandoned')
      await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }))

      expect(screen.getByText('3 notes')).toBeInTheDocument()
      expect(readStoredState().notesByTrip?.[FIXTURE_TRIP_ID]).toHaveLength(3)
    })
  })

  describe('editing a note', () => {
    it('saves the change and records that it was edited', async () => {
      const user = userEvent.setup()
      renderNotes()

      await user.click(screen.getAllByRole('button', { name: 'Edit' })[0])
      const field = screen.getByLabelText(/^Note/)
      await user.clear(field)
      await typeBody(user, 'New body{enter}Second line')
      await user.click(screen.getByRole('button', { name: 'Save changes' }))

      expect(readStoredState().notesByTrip?.[FIXTURE_TRIP_ID]?.[0]?.body).toBe(
        'New body\nSecond line',
      )
      expect(screen.getAllByText(/^Edited /)).toHaveLength(1)
    })

    it('rejects an edit that would empty the note', async () => {
      const user = userEvent.setup()
      renderNotes()

      await user.click(screen.getAllByRole('button', { name: 'Edit' })[0])
      await user.clear(screen.getByLabelText(/^Note/))
      await user.click(screen.getByRole('button', { name: 'Save changes' }))

      expect(screen.getByRole('alert')).toBeInTheDocument()
      expect(readStoredState().notesByTrip?.[FIXTURE_TRIP_ID]?.[0]?.body).toBe(
        'Detail 1\nSecond line 1',
      )
    })
  })

  describe('pinning a note', () => {
    it('pins and unpins from the list and persists the choice', async () => {
      const user = userEvent.setup()
      renderNotes()

      await user.click(screen.getAllByRole('button', { name: 'Pin' })[0])

      expect(screen.getByText('2 pinned')).toBeInTheDocument()
      expect(readStoredState().notesByTrip?.[FIXTURE_TRIP_ID]?.filter((note) => note.pinned)).toHaveLength(2)

      await user.click(screen.getAllByRole('button', { name: 'Unpin' })[0])

      expect(readStoredState().notesByTrip?.[FIXTURE_TRIP_ID]?.filter((note) => note.pinned)).toHaveLength(1)
    })

    it('does not change the note body when pinning', async () => {
      const user = userEvent.setup()
      renderNotes()
      const before = readStoredState().notesByTrip?.[FIXTURE_TRIP_ID]?.[1]?.body

      await user.click(screen.getAllByRole('button', { name: 'Pin' })[0])

      expect(readStoredState().notesByTrip?.[FIXTURE_TRIP_ID]?.[1]?.body).toBe(before)
    })
  })

  describe('deleting a note', () => {
    it('asks first and keeps the note when the traveller backs out', async () => {
      const user = userEvent.setup()
      renderNotes()

      await user.click(screen.getAllByRole('button', { name: 'Delete' })[0])
      await user.click(screen.getByRole('button', { name: 'Keep it' }))

      expect(screen.getByText('3 notes')).toBeInTheDocument()
      expect(readStoredState().notesByTrip?.[FIXTURE_TRIP_ID]).toHaveLength(3)
    })

    it('removes the note once the traveller confirms', async () => {
      const user = userEvent.setup()
      renderNotes()

      await user.click(screen.getAllByRole('button', { name: 'Delete' })[0])
      await user.click(screen.getByRole('button', { name: 'Delete note' }))

      expect(screen.getByText('2 notes')).toBeInTheDocument()
      expect(screen.queryByRole('heading', { level: 3, name: 'Flight reference' })).not.toBeInTheDocument()
      expect(readStoredState().notesByTrip?.[FIXTURE_TRIP_ID]).toHaveLength(2)
    })

    it('leaves the trip, itinerary and expenses alone', async () => {
      const user = userEvent.setup()
      renderNotes()

      await user.click(screen.getAllByRole('button', { name: 'Delete' })[0])
      await user.click(screen.getByRole('button', { name: 'Delete note' }))

      const stored = readStoredState()
      expect(stored.trips).toHaveLength(1)
      expect(stored.daysByTrip?.[FIXTURE_TRIP_ID]?.[0]?.items).toHaveLength(4)
      expect(stored.expensesByTrip?.[FIXTURE_TRIP_ID]).toHaveLength(5)
    })
  })

  describe('trip isolation', () => {
    it('only ever shows the notes for the trip in the url', () => {
      const otherTripId = 'trip-other'
      const state = fixtureState()
      state.trips = [...state.trips, { ...state.trips[0], id: otherTripId, name: 'Lisbon long weekend' }]
      state.notesByTrip = {
        [FIXTURE_TRIP_ID]: makeFixtureNotes(),
        [otherTripId]: [],
      }

      renderAt(otherTripId, state)

      expect(screen.getByText('No notes yet')).toBeInTheDocument()
      expect(screen.queryByRole('heading', { level: 3, name: 'Flight reference' })).not.toBeInTheDocument()
    })
  })
})
