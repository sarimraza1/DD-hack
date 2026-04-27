import { AppProvider, useApp } from './context/AppContext';
import LandingPage from './components/LandingPage';
import Workspace from './components/Workspace';
import './index.css';

function AppContent() {
  const { roomId } = useApp();

  if (!roomId) {
    return <LandingPage />;
  }

  return <Workspace />;
}

export default function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}
