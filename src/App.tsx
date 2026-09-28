import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AppShell } from '@/components/AppShell'
import { TouristProvider } from '@/state/TouristProvider'
import BudgetPage from '@/pages/BudgetPage'
import CreateTripPage from '@/pages/CreateTripPage'
import ExplorePage from '@/pages/ExplorePage'
import ItineraryPage from '@/pages/ItineraryPage'
import NotFoundPage from '@/pages/NotFoundPage'
import PlaceDetailsPage from '@/pages/PlaceDetailsPage'
import TripOverviewPage from '@/pages/TripOverviewPage'
import TripsHomePage from '@/pages/TripsHomePage'
import WelcomePage from '@/pages/WelcomePage'

export function App() {
  return (
    <TouristProvider>
      <BrowserRouter>
        <AppShell>
          <Routes>
            <Route path="/" element={<WelcomePage />} />
            <Route path="/trips" element={<TripsHomePage />} />
            <Route path="/trips/new" element={<CreateTripPage />} />
            <Route path="/trips/:tripId" element={<TripOverviewPage />} />
            <Route path="/trips/:tripId/itinerary" element={<ItineraryPage />} />
            <Route path="/trips/:tripId/explore" element={<ExplorePage />} />
            <Route path="/trips/:tripId/budget" element={<BudgetPage />} />
            <Route path="/explore" element={<ExplorePage />} />
            <Route path="/places/:experienceId" element={<PlaceDetailsPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </AppShell>
      </BrowserRouter>
    </TouristProvider>
  )
}
