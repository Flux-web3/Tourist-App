import { BrowserRouter, Route, Routes } from 'react-router-dom'
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

export function App() {
  return (
    <TouristProvider>
      <BrowserRouter>
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
