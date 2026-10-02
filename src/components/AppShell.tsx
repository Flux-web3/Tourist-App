import { NavLink, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { PROTOTYPE_LABEL } from '@/lib/labels'
import { useAppState } from '@/state/useTourist'
import { Brand } from './Brand'
import { StorageAlert } from './StorageAlert'
import { ThemeToggle } from './ThemeToggle'
import { Icon } from './ui/Icon'

const TRIP_PATH = /^\/trips\/([^/?#]+)/

function useTripContextId(): string | null {
  const { pathname } = useLocation()
  return TRIP_PATH.exec(pathname)?.[1] ?? null
}

function navClass({ isActive }: { isActive: boolean }): string {
  // A pill, like every other control. The active one is filled and edged so it
  // reads in both themes without leaning on colour alone.
  return [
    'inline-flex min-h-10 items-center rounded-pill border px-3.5 py-1.5 text-label-lg transition-colors',
    isActive
      ? 'border-line-strong bg-surface-high text-ink'
      : 'border-transparent text-ink-muted hover:bg-surface-low hover:text-ink',
  ].join(' ')
}

function MobileTab({
  to,
  label,
  icon,
  end = false,
}: {
  to: string
  label: string
  icon: string
  end?: boolean
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        [
          'flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-label-sm',
          isActive ? 'text-terracotta' : 'text-ink-subtle',
        ].join(' ')
      }
    >
      {({ isActive }) => (
        <>
          {/* The active tab gets a pill behind its icon, the same shape as the desktop nav. */}
          <span
            className={`grid h-8 w-14 place-items-center rounded-pill transition-colors ${
              isActive ? 'bg-surface-high' : ''
            }`}
          >
            <Icon name={icon} size={20} />
          </span>
          {label}
        </>
      )}
    </NavLink>
  )
}

export function AppShell({ children }: { children: ReactNode }) {
  const state = useAppState()
  const location = useLocation()
  const tripId = useTripContextId()
  const trip = state.trips.find((candidate) => candidate.id === tripId) ?? null
  const exploreHref = trip ? `/trips/${trip.id}/explore` : '/explore'
  const onEntry = location.pathname === '/welcome'

  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <a href="#main-content" className="skip-link text-label-lg">
        Skip to main content
      </a>

      <header className="sticky top-0 z-30 border-b border-line bg-canvas/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Brand />

          <nav aria-label="Primary" className="hidden items-center gap-1 md:flex">
            <NavLink to="/trips" className={navClass} end>
              Trips
            </NavLink>
            <NavLink to={exploreHref} className={navClass}>
              Explore
            </NavLink>
          </nav>

          <div className="flex items-center gap-2">
            <ThemeToggle />
            <span
              className="hidden items-center gap-1.5 rounded-pill border border-line-strong bg-surface px-3 py-1.5 text-label-md text-ink-muted sm:inline-flex"
              title={PROTOTYPE_LABEL.localOnly}
            >
              <Icon name={state.user.isGuest ? 'person_outline' : 'person'} size={16} />
              {state.user.isGuest ? PROTOTYPE_LABEL.guest : state.user.name}
            </span>
          </div>
        </div>

        {trip ? (
          <nav
            aria-label="Trip sections"
            className="mx-auto hidden max-w-6xl items-center gap-1 overflow-x-auto border-t border-line px-4 py-1.5 md:flex"
          >
            <span className="mr-2 max-w-56 truncate text-label-md font-semibold text-ink-muted" title={trip.name}>
              {trip.name}
            </span>
            <NavLink to={`/trips/${trip.id}`} end className={navClass}>
              Overview
            </NavLink>
            <NavLink to={`/trips/${trip.id}/itinerary`} className={navClass}>
              Itinerary
            </NavLink>
            <NavLink to={`/trips/${trip.id}/explore`} className={navClass}>
              Explore
            </NavLink>
            <NavLink to={`/trips/${trip.id}/budget`} className={navClass}>
              Budget
            </NavLink>
            <NavLink to={`/trips/${trip.id}/notes`} className={navClass}>
              Notes
            </NavLink>
          </nav>
        ) : null}
      </header>

      {/* Focusable so the skip link and a dialog whose opener was deleted can land here. */}
      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 focus:outline-none"
      >
        {/* Above every screen: a save that is failing matters wherever you are. */}
        <StorageAlert />
        {children}
      </main>

      {/*
        Only the last element needs to clear the fixed bottom navigation. Main
        used to carry the same allowance, which opened a dead band between the
        page and the footer on every mobile screen.
      */}
      <footer
        className={`border-t border-line px-4 py-4 text-body-sm text-ink-subtle ${onEntry ? '' : 'pb-24 md:pb-4'}`}
      >
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2">
          <p>Tourist prototype. Trips, plans and expenses stay on this device.</p>
          <p className="tnum">Itinerary drafts and prices are estimates, not bookings.</p>
        </div>
      </footer>

      {/*
        Not rendered on the entry screen, which also drops its bottom
        clearance. When the nav rendered there anyway it sat on top of the
        footer and the last card. (A `hidden` attribute would not do: the
        `flex` utility outranks Tailwind's low-specificity `[hidden]` rule.)
      */}
      {onEntry ? null : (
      <nav
        aria-label="Sections"
        className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-canvas/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        {trip ? (
          <>
            <MobileTab to={`/trips/${trip.id}`} label="Overview" icon="dashboard" end />
            <MobileTab to={`/trips/${trip.id}/itinerary`} label="Itinerary" icon="calendar_month" />
            <MobileTab to={`/trips/${trip.id}/explore`} label="Explore" icon="explore" />
            <MobileTab to={`/trips/${trip.id}/budget`} label="Budget" icon="account_balance_wallet" />
            <MobileTab to={`/trips/${trip.id}/notes`} label="Notes" icon="sticky_note_2" />
          </>
        ) : (
          <>
            <MobileTab to="/trips" label="Trips" icon="luggage" end />
            <MobileTab to="/explore" label="Explore" icon="explore" />
            <MobileTab to="/trips/new" label="New trip" icon="add_circle" />
          </>
        )}
      </nav>
      )}
    </div>
  )
}
