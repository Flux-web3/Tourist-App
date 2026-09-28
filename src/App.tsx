import { useEffect } from 'react'
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom'
import { AppShell } from '@/components/AppShell'
import { TouristProvider } from '@/state/TouristProvider'
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
 * landed the traveller in the middle of the expense list. Honours
 * `prefers-reduced-motion` by way of `scroll-behavior` in the base layer, and
 * deliberately ignores hash links so in-page anchors still work.
 */
function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    if (window.location.hash) return
    window.scrollTo({ top: 0, left: 0 })
  }, [pathname])
  return null
}

export function App() {
  return (
    <TouristProvider>
      <BrowserRouter>
        <ScrollToTop />
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route
            path="/*"
            element={
              <AppShell>
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
              </AppShell>
            }
          />
        </Routes>
      </BrowserRouter>
    </TouristProvider>
  )
}
