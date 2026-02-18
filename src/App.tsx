import { AnimatePresence, motion } from 'framer-motion';
import { useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { ServerDetailsPanel } from './components/ServerDetailsPanel';
import { ToastViewport } from './components/ToastViewport';
import { TopBar } from './components/TopBar';
import { useLauncherStore } from './store/useLauncherStore';
import { DownloadsPage } from './pages/DownloadsPage';
import { HomePage } from './pages/HomePage';
import { ProfilePage } from './pages/ProfilePage';
import { ServersPage } from './pages/ServersPage';
import { SettingsPage } from './pages/SettingsPage';

const transition = { duration: 0.24, ease: [0.2, 0.8, 0.2, 1] as [number, number, number, number] };

function App() {
  const tab = useLauncherStore((s) => s.tab);
  const loadContent = useLauncherStore((s) => s.loadContent);

  useEffect(() => {
    loadContent();
  }, [loadContent]);

  return (
    <div className="min-h-screen bg-bc-bg px-5 pb-5 pt-4 text-bc-text">
      <div className="mx-auto max-w-[1880px]">
        <TopBar />

        <div className="flex gap-4">
          <Sidebar />

          <main className="flex-1">
            <AnimatePresence mode="wait">
              <motion.div
                key={tab}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                transition={transition}
              >
                {tab === 'home' && <HomePage />}
                {tab === 'servers' && <ServersPage />}
                {tab === 'downloads' && <DownloadsPage />}
                {tab === 'profile' && <ProfilePage />}
                {tab === 'settings' && <SettingsPage />}
              </motion.div>
            </AnimatePresence>
          </main>

          <ServerDetailsPanel />
        </div>
      </div>

      <ToastViewport />
    </div>
  );
}

export default App;
