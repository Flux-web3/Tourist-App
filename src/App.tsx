import { useEffect, useRef } from 'react'
import { BrowserRouter, Route, Routes, useLocation, useNavigationType } from 'react-router-dom'
import { AppShell } from '@/components/AppShell'
import { ErrorBoundary, RouteErrorBoundary } from '@/components/ErrorBoundary'
import { pageTitle } from '@/lib/pageTitle'
import { TouristProvider } from '@/state/TouristProvider'
import { useAppState } from '@/state/useTourist'
import BudgetPage from '@/pages/BudgetPage'
import CreateTripPage from '@/pages/CreateTripPage'
import ExplorePage from '@/pages/ExplorePage'
import ItineraryPage from '@/pages/ItineraryPage'
import LandingPage from '@/pages/LandingPage'
import NotFoundPage from '@/pages/NotFoundPage'
import NotesPage from '@/pages/NotesPage'
import PlaceDetailsPage from '@/pages/PlaceDetailsPage'
import TripOverviewPage from '@/pages/TripOverviewPage'
import TripsHomePage from '@/pages/TripsHomePage'
import WelcomePage from '@/pages/WelcomePage'

/**
 * Puts each new screen at the top.
 *
 * Without this the browser keeps the scroll offset across a client-side
 * navigation, so moving from halfway down a seven-day itinerary to Budget
 * landed the traveller in the middle of the expense list. It deliberately
 * ignores hash links so in-page anchors still work.
 *
 * The jump is `instant`: the page has `scroll-behavior: smooth`, and with the
 * default behaviour every navigation visibly scrolled the new screen up from
 * wherever the old one had been. And it is skipped on Back and Forward
 * (`POP`), where the browser puts the traveller back where they were, so
 * returning from a place lands on the same card in Explore, not at the top.
 */
function ScrollToTop() {
  const { pathname } = useLocation()
  const navigationType = useNavigationType()
  // Read, not depended on: a REPLACE that keeps the path (a filter in the query
  // string, say) changes the type without changing the screen.
  const navigationTypeRef = useRef(navigationType)
  navigationTypeRef.current = navigationType
  useEffect(() => {
    if (navigationTypeRef.current === 'POP') return
    if (window.location.hash) return
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
  }, [pathname])
  return null
}

/**
 * Names the page and, when the page changes, starts the traveller at it.
 *
 * The title was the landing page's on every route, so tabs, history and a
 * screen reader's "which page is this" all said the same thing everywhere. It
 * now follows the path and, on a trip's screens, the trip's name.
 *
 * A client-side navigation also leaves focus on the link that was pressed,
 * which may no longer exist, and announces nothing. Moving focus to the main
 * region puts keyboard and screen-reader users at the start of the new page.
 * Not on first load (the browser handles that), not when the URL names a part
 * of the page with a hash, and never out of an open dialog.
 *
 * This renders before the routes on purpose: effects run in order, so a page
 * that places focus itself when it mounts still has the last word.
 */
function PageAnnouncer() {
  const { pathname } = useLocation()
  const { trips } = useAppState()
  const title = pageTitle(pathname, trips)
  const announcedPath = useRef(pathname)

  useEffect(() => {
    document.title = title
  }, [title])

  useEffect(() => {
    if (announcedPath.current === pathname) return
    announcedPath.current = pathname
    if (window.location.hash) return
    if (document.querySelector('[role="dialog"][aria-modal="true"]')) return
    document.getElementById('main-content')?.focus({ preventScroll: true })
  }, [pathname])

  return null
}

export function App() {
  return (
    // The last resort: whatever fails outside a page still leaves a way back.
    <ErrorBoundary>
      <TouristProvider>
        <BrowserRouter>
          <ScrollToTop />
          <PageAnnouncer />
          <Routes>
            <Route
              path="/"
              element={
                <RouteErrorBoundary inShell={false}>
                  <LandingPage />
                </RouteErrorBoundary>
              }
            />
            <Route
              path="/*"
              element={
                <AppShell>
                  {/* Inside the shell, so the header and navigation outlive a page that fails. */}
                  <RouteErrorBoundary>
                    <Routes>
                      <Route path="/welcome" element={<WelcomePage />} />
                      <Route path="/trips" element={<TripsHomePage />} />
                      <Route path="/trips/new" element={<CreateTripPage />} />
                      <Route path="/trips/:tripId" element={<TripOverviewPage />} />
                      <Route path="/trips/:tripId/itinerary" element={<ItineraryPage />} />
                      <Route path="/trips/:tripId/explore" element={<ExplorePage />} />
                      <Route path="/trips/:tripId/budget" element={<BudgetPage />} />
                      <Route path="/trips/:tripId/notes" element={<NotesPage />} />
                      <Route path="/explore" element={<ExplorePage />} />
                      <Route path="/places/:experienceId" element={<PlaceDetailsPage />} />
                      <Route path="*" element={<NotFoundPage />} />
                    </Routes>
                  </RouteErrorBoundary>
                </AppShell>
              }
            />
          </Routes>
        </BrowserRouter>
      </TouristProvider>
    </ErrorBoundary>
  )
}
