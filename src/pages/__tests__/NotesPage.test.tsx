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

function noteCard(title: string): HTMLElement {
  return screen.getByRole('heading', { level: 3, name: title }).closest('article') as HTMLElement
}

/** Opens one note's overflow menu and returns the card it belongs to. */
async function openNoteMenu(user: ReturnType<typeof userEvent.setup>, title: string) {
  const card = noteCard(title)
  await user.click(within(card).getByRole('button', { name: `Actions for ${title}` }))
  return card
}

async function chooseNoteAction(
  user: ReturnType<typeof userEvent.setup>,
  title: string,
  action: string,
) {
  const card = await openNoteMenu(user, title)
  await user.click(within(card).getByRole('menuitem', { name: action }))
}

describe('NotesPage', () => {
  it('frames the page around the trip and says what notes are for', () => {
    renderNotes()

    expect(screen.getByRole('heading', { level: 1, name: 'Paris in the Spring' })).toBeInTheDocument()
    expect(
      screen.getByText(/Your own record for this trip: flight references, door codes/),
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

  it('groups the pinned notes first, under their own heading', () => {
    renderNotes()

    const headings = screen.getAllByRole('heading', { level: 2 }).map((node) => node.textContent)
    expect(headings).toEqual(['Pinned', 'Everything else'])

    const pinnedGroup = screen.getByRole('region', { name: 'Pinned' })
    const rest = screen.getByRole('region', { name: 'Everything else' })
    expect(within(pinnedGroup).getAllByRole('heading', { level: 3 }).map((n) => n.textContent)).toEqual(
      ['Flight reference'],
    )
    expect(within(rest).getAllByRole('heading', { level: 3 }).map((n) => n.textContent)).toEqual([
      'Dinner booking',
      'Apartment key safe',
    ])
    // The pinned note also reads differently, not just earlier.
    expect(noteCard('Flight reference')).toHaveClass('border-terracotta/40')
    expect(noteCard('Dinner booking')).not.toHaveClass('border-terracotta/40')
  })

  it('reports how many notes are pinned and marks the pinned one', () => {
    renderNotes()

    expect(screen.getByText('1 pinned')).toBeInTheDocument()
    expect(within(noteCard('Flight reference')).getByText('Pinned')).toBeInTheDocument()
    expect(within(noteCard('Dinner booking')).queryByText('Pinned')).not.toBeInTheDocument()
  })

  it('drops the group headings when nothing is pinned', () => {
    renderNotes(fixtureState({ notes: makeFixtureNotes().map((note) => ({ ...note, pinned: false })) }))

    expect(screen.getAllByRole('heading', { level: 2 }).map((node) => node.textContent)).toEqual([
      'Your notes',
    ])
    expect(screen.queryByText('1 pinned')).not.toBeInTheDocument()
  })

  it('says when each note was added in words, not a full timestamp', () => {
    renderNotes()

    const article = screen.getAllByRole('article')[0]
    // The fixture was created well over a week ago, so it falls back to a plain date.
    expect(within(article).getByText(/^Added/)).toBeInTheDocument()
    expect(within(article).getByText('1 Feb 2026')).toBeInTheDocument()
    expect(within(article).queryByText(/^Updated/)).not.toBeInTheDocument()
  })

  it('keeps every per-note action behind one named menu', async () => {
    const user = userEvent.setup()
    renderNotes()

    expect(screen.queryAllByRole('button', { name: 'Edit' })).toHaveLength(0)
    expect(screen.queryAllByRole('button', { name: 'Delete' })).toHaveLength(0)
    expect(screen.queryAllByRole('button', { name: 'Pin' })).toHaveLength(0)

    const card = await openNoteMenu(user, 'Flight reference')
    expect(
      within(card).getAllByRole('menuitem').map((item) => item.textContent),
    ).toEqual(['keep_offUnpin', 'editEdit', 'delete_outlineDelete'])

    const other = await openNoteMenu(user, 'Dinner booking')
    expect(within(other).getByRole('menuitem', { name: 'Pin' })).toBeInTheDocument()
  })

  it('invites the first note when there are none', () => {
    renderNotes(fixtureState({ notes: [] }))

    expect(screen.getByText('Nothing written down yet')).toBeInTheDocument()
    expect(screen.getByText(/Line breaks stay exactly as you type them/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Write the first note' })).toBeInTheDocument()
  })

  it('says plainly that notes never touch the itinerary or the budget', () => {
    renderNotes()

    expect(screen.getByText(/These notes are yours/)).toBeInTheDocument()
    expect(screen.getByText(/Notes are stored only in this browser/)).toBeInTheDocument()
    expect(
      screen.getByText(/never re-costed, and never\s+counted towards your budget/),
    ).toBeInTheDocument()
  })

  it('refuses an unknown trip without losing the rest', () => {
    renderAt('trip-does-not-exist', fixtureState())

    expect(screen.getByText('We could not find that trip')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to trips' })).toHaveAttribute('href', '/trips')
  })

  describe('writing a note', () => {
    it('saves a note and puts it at the top of the unpinned notes', async () => {
      const user = userEvent.setup()
      renderNotes()

      await openNewNote(user)
      await user.type(screen.getByLabelText(/^Title/), 'Airport transfer')
      await typeBody(user, 'Heads up signs{enter}Platform 4')
      await user.click(screen.getByRole('button', { name: 'Save note' }))

      expect(screen.getByRole('heading', { level: 3, name: 'Airport transfer' })).toBeInTheDocument()
      expect(screen.getByText('4 notes')).toBeInTheDocument()
      const rest = screen.getByRole('region', { name: 'Everything else' })
      expect(within(rest).getAllByRole('heading', { level: 3 })[0]).toHaveTextContent(
        'Airport transfer',
      )
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

      await chooseNoteAction(user, 'Flight reference', 'Edit')
      const field = screen.getByLabelText(/^Note/)
      await user.clear(field)
      await typeBody(user, 'New body{enter}Second line')
      await user.click(screen.getByRole('button', { name: 'Save changes' }))

      expect(readStoredState().notesByTrip?.[FIXTURE_TRIP_ID]?.[0]?.body).toBe(
        'New body\nSecond line',
      )
      const edited = screen.getAllByText(/^Updated/)
      expect(edited).toHaveLength(1)
      expect(edited[0]).toHaveTextContent('just now')
    })

    it('rejects an edit that would empty the note', async () => {
      const user = userEvent.setup()
      renderNotes()

      await chooseNoteAction(user, 'Flight reference', 'Edit')
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

      await chooseNoteAction(user, 'Dinner booking', 'Pin')

      expect(screen.getByText('2 pinned')).toBeInTheDocument()
      expect(readStoredState().notesByTrip?.[FIXTURE_TRIP_ID]?.filter((note) => note.pinned)).toHaveLength(2)
      expect(
        within(screen.getByRole('region', { name: 'Pinned' })).getAllByRole('heading', { level: 3 }),
      ).toHaveLength(2)

      await chooseNoteAction(user, 'Dinner booking', 'Unpin')

      expect(readStoredState().notesByTrip?.[FIXTURE_TRIP_ID]?.filter((note) => note.pinned)).toHaveLength(1)
    })

    it('never claims the text was edited just because the note was pinned', async () => {
      const user = userEvent.setup()
      renderNotes()

      const before = readStoredState().notesByTrip?.[FIXTURE_TRIP_ID]?.[2]?.updatedAt

      await chooseNoteAction(user, 'Dinner booking', 'Pin')

      // Pinning is filing, not writing. `noteService.setPinned` leaves
      // `updatedAt` alone, so the card shows no edit or update claim at all —
      // it used to bump the timestamp and then report the note as touched.
      const card = noteCard('Dinner booking')
      expect(screen.queryAllByText(/^Edited/)).toHaveLength(0)
      expect(within(card).queryByText(/^Updated/)).not.toBeInTheDocument()
      expect(within(card).getByText(/^Added/)).toHaveTextContent('1 Feb 2026')
      expect(readStoredState().notesByTrip?.[FIXTURE_TRIP_ID]?.[2]?.updatedAt).toBe(before)
    })

    it('does not change the note body when pinning', async () => {
      const user = userEvent.setup()
      renderNotes()
      const before = readStoredState().notesByTrip?.[FIXTURE_TRIP_ID]?.[2]?.body

      await chooseNoteAction(user, 'Dinner booking', 'Pin')

      expect(readStoredState().notesByTrip?.[FIXTURE_TRIP_ID]?.[2]?.body).toBe(before)
    })
  })

  describe('deleting a note', () => {
    it('asks first and keeps the note when the traveller backs out', async () => {
      const user = userEvent.setup()
      renderNotes()

      await chooseNoteAction(user, 'Flight reference', 'Delete')

      expect(readStoredState().notesByTrip?.[FIXTURE_TRIP_ID]).toHaveLength(3)
      const dialog = screen.getByRole('dialog', { name: 'Delete this note?' })
      expect(dialog).toHaveTextContent('Flight reference')
      await user.click(within(dialog).getByRole('button', { name: 'Keep it' }))

      expect(screen.getByText('3 notes')).toBeInTheDocument()
      expect(readStoredState().notesByTrip?.[FIXTURE_TRIP_ID]).toHaveLength(3)
    })

    it('removes the note once the traveller confirms', async () => {
      const user = userEvent.setup()
      renderNotes()

      await chooseNoteAction(user, 'Flight reference', 'Delete')
      await user.click(screen.getByRole('button', { name: 'Delete note' }))

      expect(screen.getByText('2 notes')).toBeInTheDocument()
      expect(screen.queryByRole('heading', { level: 3, name: 'Flight reference' })).not.toBeInTheDocument()
      expect(readStoredState().notesByTrip?.[FIXTURE_TRIP_ID]).toHaveLength(2)
    })

    it('leaves the trip, itinerary and expenses alone', async () => {
      const user = userEvent.setup()
      renderNotes()

      await chooseNoteAction(user, 'Flight reference', 'Delete')
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

      expect(screen.getByText('Nothing written down yet')).toBeInTheDocument()
      expect(screen.queryByRole('heading', { level: 3, name: 'Flight reference' })).not.toBeInTheDocument()
    })
  })
})
