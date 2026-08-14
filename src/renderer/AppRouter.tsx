import { FloatingNotePage } from './pages/FloatingNotePage';
import { WeeklyPage } from './pages/WeeklyPage';
import { SettingsPage } from './pages/SettingsPage';
import type { ElectronAPI } from '../preload/apiTypes';
import { getElectronAPI } from './gateway/electronGateway';
import { ElectronAPIProvider } from './state/providers';

/** 两个 BrowserWindow 复用同一 Renderer bundle，通过只读 query 选择入口页面。 */
export function AppRouter({ api = getElectronAPI() }: { api?: ElectronAPI }) {
  const view = new URLSearchParams(window.location.search).get('view');
  // 未知值安全回退到便利贴，避免 query 被手改后得到空白窗口。
  return (
    <ElectronAPIProvider api={api}>
      {view === 'weekly' ? (
        <WeeklyPage />
      ) : view === 'settings' ? (
        <SettingsPage />
      ) : (
        <FloatingNotePage />
      )}
    </ElectronAPIProvider>
  );
}
