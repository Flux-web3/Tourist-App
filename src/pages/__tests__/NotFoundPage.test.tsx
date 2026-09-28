import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import NotFoundPage from '@/pages/NotFoundPage'
import { renderWithProviders } from '@/test/renderWithProviders'

describe('NotFoundPage', () => {
  it('says the page is not part of the trip without blaming the traveller', () => {
    renderWithProviders(<NotFoundPage />, { route: '/trips/trip-under-test/nonsense' })

    expect(screen.getByText('That page is not part of this trip')).toBeInTheDocument()
    expect(
      screen.getByText('The link may be out of date. Your trips and itinerary are still where you left them.'),
    ).toBeInTheDocument()
  })

  it('points the way back to the trip list', () => {
    renderWithProviders(<NotFoundPage />, { route: '/nowhere' })

    const link = screen.getByRole('link', { name: 'Back to trips' })
    expect(link).toHaveAttribute('href', '/trips')
  })
})
