import { FloatingNotePage } from './pages/FloatingNotePage';
import { WeeklyPage } from './pages/WeeklyPage';
import type { ElectronAPI } from '../preload/apiTypes';
import { getElectronAPI } from './gateway/electronGateway';
import { ElectronAPIProvider } from './state/providers';

export function AppRouter({ api = getElectronAPI() }: { api?: ElectronAPI }) {
  const view = new URLSearchParams(window.location.search).get('view');
  return (
    <ElectronAPIProvider api={api}>
      {view === 'weekly' ? <WeeklyPage /> : <FloatingNotePage />}
    </ElectronAPIProvider>
  );
}
