import { AppProvider, useApp } from '@/context/AppContext';
import { Landing } from '@/screens/Landing';
import { WelcomeScreen } from '@/screens/Welcome';
import { TripsHome } from '@/screens/TripsHome';
import { CreateTrip } from '@/screens/CreateTrip';
import { TripOverview } from '@/screens/TripOverview';
import { Itinerary } from '@/screens/Itinerary';
import { Explore } from '@/screens/Explore';
import { Budget } from '@/screens/Budget';

function AppContent() {
  const { screen, user } = useApp();

  if (screen === 'landing') {
    return <Landing />;
  }

  if (!user && screen !== 'welcome') {
    return <WelcomeScreen />;
  }

  switch (screen) {
    case 'welcome':
      return <WelcomeScreen />;
    case 'trips':
      return <TripsHome />;
    case 'create-trip':
      return <CreateTrip />;
    case 'overview':
      return <TripOverview />;
    case 'itinerary':
      return <Itinerary />;
    case 'explore':
      return <Explore />;
    case 'budget':
      return <Budget />;
    default:
      return <WelcomeScreen />;
  }
}

export default function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}
