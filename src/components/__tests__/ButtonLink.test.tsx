import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { ButtonLink } from '@/components/ui/ButtonLink'

function LocationProbe() {
  const location = useLocation()
  return <p>Current route: {location.pathname}</p>
}

function renderLink(ui: React.ReactElement) {
  return render(
    <MemoryRouter initialEntries={['/trips']}>
      {ui}
      <LocationProbe />
    </MemoryRouter>,
  )
}

describe('ButtonLink', () => {
  it('renders an anchor with the target href and an accessible name from children', () => {
    renderLink(<ButtonLink to="/explore">Explore places</ButtonLink>)

    const link = screen.getByRole('link', { name: 'Explore places' })
    expect(link).toHaveAttribute('href', '/explore')
  })

  it('navigates when clicked', async () => {
    const user = userEvent.setup()
    renderLink(<ButtonLink to="/trips/new">Plan a new trip</ButtonLink>)

    expect(screen.getByText('Current route: /trips')).toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: 'Plan a new trip' }))

    expect(screen.getByText('Current route: /trips/new')).toBeInTheDocument()
  })

  it('keeps a generated route as a link rather than a button', () => {
    renderLink(
      <ButtonLink to={`/trips/trip-under-test/itinerary`} aria-describedby="plan-hint">
        Open itinerary
      </ButtonLink>,
    )

    const link = screen.getByRole('link', { name: 'Open itinerary' })
    expect(link).toHaveAttribute('href', '/trips/trip-under-test/itinerary')
    expect(link).toHaveAttribute('aria-describedby', 'plan-hint')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
