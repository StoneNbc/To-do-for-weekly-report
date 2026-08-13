import { FloatingNotePage } from './pages/FloatingNotePage';
import { WeeklyPage } from './pages/WeeklyPage';

export function AppRouter() {
  const view = new URLSearchParams(window.location.search).get('view');
  return view === 'weekly' ? <WeeklyPage /> : <FloatingNotePage />;
}
