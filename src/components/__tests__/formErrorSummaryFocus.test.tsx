import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { EditTripDialog } from '@/components/EditTripDialog'
import { ExpenseFormDialog } from '@/components/ExpenseFormDialog'
import { NoteFormDialog } from '@/components/NoteFormDialog'
import CreateTripPage from '@/pages/CreateTripPage'
import { FIXTURE_TRIP_ID, fixtureState } from '@/pages/__tests__/tripFixture'
import { createEmptyState } from '@/services/persistence'
import { useTourist } from '@/state/useTourist'
import { renderWithProviders } from '@/test/renderWithProviders'
import type { ReactNode } from 'react'
import type { Trip } from '@/domain/types'

/*
  After a failed submit the error summary takes focus, once. It used to take it
  again every time typing cleared an error, which pulled focus out of the field
  mid-word: "Lagos" arrived as "La". And a second failed submit, with the same
  number of errors, moved nothing at all.
*/

function WithTrip({ children }: { children: (trip: Trip) => ReactNode }) {
  const { state } = useTourist()
  const trip = state.trips.find((candidate) => candidate.id === FIXTURE_TRIP_ID)
  return trip ? <>{children(trip)}</> : null
}

function renderCreate() {
  renderWithProviders(
    <Routes>
      <Route path="/trips/new" element={<CreateTripPage />} />
    </Routes>,
    { route: '/trips/new', state: createEmptyState() },
  )
}

function renderWithTrip(children: (trip: Trip) => ReactNode) {
  renderWithProviders(<WithTrip>{children}</WithTrip>, { state: fixtureState() })
}

const noop = () => undefined

describe('error summary focus: Create trip', () => {
  const submit = () => screen.getByRole('button', { name: 'Create trip and draft itinerary' })

  it('leaves a whole typed word, and focus, in the field after a failed submit', async () => {
    const user = userEvent.setup()
    renderCreate()

    await user.click(submit())
    expect(screen.getByRole('alert')).toHaveFocus()

    const origin = screen.getByLabelText(/Travelling from/)
    await user.click(origin)
    await user.keyboard('Lagos')

    expect(origin).toHaveValue('Lagos')
    expect(origin).toHaveFocus()
  })

  it('moves focus to the summary again on a second failed submit', async () => {
    const user = userEvent.setup()
    renderCreate()

    await user.click(submit())
    await user.click(submit())

    expect(screen.getByRole('alert')).toHaveFocus()
  })
})

describe('error summary focus: Edit trip', () => {
  const save = () => screen.getByRole('button', { name: 'Save changes' })

  it('leaves a whole typed word, and focus, in the field after a failed submit', async () => {
    const user = userEvent.setup()
    renderWithTrip((trip) => <EditTripDialog trip={trip} open onClose={noop} />)

    const origin = screen.getByLabelText(/Travelling from/)
    await user.clear(origin)
    await user.click(save())
    expect(screen.getByRole('alert')).toHaveFocus()

    await user.click(origin)
    await user.keyboard('Lagos')

    expect(origin).toHaveValue('Lagos')
    expect(origin).toHaveFocus()
  })

  it('moves focus to the summary again on a second failed submit', async () => {
    const user = userEvent.setup()
    renderWithTrip((trip) => <EditTripDialog trip={trip} open onClose={noop} />)

    await user.clear(screen.getByLabelText(/Travelling from/))
    await user.click(save())
    await user.click(save())

    expect(screen.getByRole('alert')).toHaveFocus()
  })
})

describe('error summary focus: Add expense', () => {
  const save = () => screen.getByRole('button', { name: 'Save expense' })

  it('leaves a whole typed word, and focus, in the field after a failed submit', async () => {
    const user = userEvent.setup()
    renderWithTrip((trip) => <ExpenseFormDialog trip={trip} open onClose={noop} />)

    await user.click(save())
    expect(screen.getByRole('alert')).toHaveFocus()

    const description = screen.getByLabelText(/What was it for/)
    await user.click(description)
    await user.keyboard('Dinner')

    expect(description).toHaveValue('Dinner')
    expect(description).toHaveFocus()
  })

  it('moves focus to the summary again on a second failed submit', async () => {
    const user = userEvent.setup()
    renderWithTrip((trip) => <ExpenseFormDialog trip={trip} open onClose={noop} />)

    await user.click(save())
    await user.click(save())

    expect(screen.getByRole('alert')).toHaveFocus()
  })
})

describe('error summary focus: New note', () => {
  const save = () => screen.getByRole('button', { name: 'Save note' })

  it('leaves a whole typed word, and focus, in the field after a failed submit', async () => {
    const user = userEvent.setup()
    renderWithTrip((trip) => <NoteFormDialog trip={trip} open onClose={noop} />)

    await user.click(save())
    expect(screen.getByRole('alert')).toHaveFocus()

    const body = screen.getByLabelText(/^Note/)
    await user.click(body)
    await user.keyboard('Seat 21A')

    expect(body).toHaveValue('Seat 21A')
    expect(body).toHaveFocus()
  })

  it('moves focus to the summary again on a second failed submit', async () => {
    const user = userEvent.setup()
    renderWithTrip((trip) => <NoteFormDialog trip={trip} open onClose={noop} />)

    await user.click(save())
    await user.click(save())

    expect(screen.getByRole('alert')).toHaveFocus()
  })
})
