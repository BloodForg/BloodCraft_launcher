import { useEffect } from 'react';
import logoUrl from './assets/bloodcraft-logo.svg';
import { LoginScreen } from './components/LoginScreen';
import { PlayButton } from './components/PlayButton';
import { SettingsModal } from './components/SettingsModal';
import { StatusBadge } from './components/StatusBadge';
import { ToastViewport } from './components/ToastViewport';
import { openExternal } from './lib/external';
import { logService } from './services/logService';
import { networkService } from './services/networkService';
import { updateService } from './services/updateService';
import { selectSelectedServer, useLauncherStore } from './store/useLauncherStore';

const APP_VERSION = '0.1.1';

function App() {
  const {
    authChecked,
    token,
    user,
    servers,
    selectedServerId,
    setSelectedServer,
    settingsOpen,
    setSettingsOpen,
    initSession,
    loadContent,
    logout,
    playState,
    launchProgress,
    playSelectedServer,
    networkOnline,
    networkMessage,
    setNetworkState,
    bottomStatus,
    updater,
    setUpdaterState,
    addToast
  } = useLauncherStore((s) => ({
    authChecked: s.authChecked,
    token: s.token,
    user: s.user,
    servers: s.servers,
    selectedServerId: s.selectedServerId,
    setSelectedServer: s.setSelectedServer,
    settingsOpen: s.settingsOpen,
    setSettingsOpen: s.setSettingsOpen,
    initSession: s.initSession,
    loadContent: s.loadContent,
    logout: s.logout,
    playState: s.playState,
    launchProgress: s.launchProgress,
    playSelectedServer: s.playSelectedServer,
    networkOnline: s.networkOnline,
    networkMessage: s.networkMessage,
    setNetworkState: s.setNetworkState,
    bottomStatus: s.bottomStatus,
    updater: s.updater,
    setUpdaterState: s.setUpdaterState,
    addToast: s.addToast
  }));
  const selectedServer = useLauncherStore(selectSelectedServer);

  useEffect(() => {
    void initSession();
  }, [initSession]);

  useEffect(() => {
    if (!token) return;
    void loadContent();
  }, [token, loadContent]);

  useEffect(() => {
    if (!token) return;

    const check = async () => {
      const online = await networkService.checkOnline();
      setNetworkState(online, online ? 'Сеть в порядке' : 'Нет соединения с thebloodcraft.ru');
    };
    void check();
    const id = setInterval(() => {
      void check();
    }, 8000);
    return () => clearInterval(id);
  }, [token, setNetworkState]);

  useEffect(() => {
    if (!token) return;
    const unsubscribe = updateService.onStatus((status) => {
      setUpdaterState(status);
    });
    void updateService.getStatus().then((status) => setUpdaterState(status));
    return () => unsubscribe();
  }, [token, setUpdaterState]);

  useEffect(() => {
    if (!token || !networkOnline) return;
    void updateService.check();
  }, [token, networkOnline]);

  if (!authChecked) {
    return <div className="min-h-screen bg-bc-bg" />;
  }

  if (!token || !user) {
    return (
      <>
        <LoginScreen />
        <ToastViewport />
      </>
    );
  }

  const effectivePlayState =
    !networkOnline || !selectedServer || selectedServer.disabled || selectedServer.status !== 'Online' ? 'disabled' : playState;

  return (
    <div className="min-h-screen bg-bc-bg px-4 py-4 text-bc-text">
      <div className="mx-auto max-w-[1100px]">
        <header className="panel mb-4 flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <img src={logoUrl} alt="BloodCraft" className="h-10 w-10 rounded-lg" />
            <div>
              <p className="text-lg font-black">BloodCraft</p>
              <p className="text-xs text-bc-muted">Launcher</p>
            </div>
          </div>
          <button className="btn-ghost px-3" onClick={() => setSettingsOpen(!settingsOpen)} aria-label="Settings">
            ⚙
          </button>
        </header>

        {!networkOnline && (
          <div className="panel mb-4 border border-[#E11D2E]/60 bg-[#2A171C] px-4 py-2 text-sm">{networkMessage}</div>
        )}

        {updater.status !== 'idle' && updater.status !== 'not-available' && (
          <div className="panel mb-4 flex items-center justify-between gap-3 px-4 py-2 text-sm">
            <span>{updater.message ?? 'Updater status'}</span>
            {updater.status === 'available' && (
              <button
                className="btn-secondary"
                disabled={!networkOnline}
                onClick={async () => {
                  const ok = await updateService.download();
                  if (!ok) addToast('Не удалось скачать обновление');
                }}
              >
                Скачать
              </button>
            )}
            {updater.status === 'downloaded' && (
              <button className="btn-primary" onClick={() => void updateService.restart()}>
                Перезапустить для обновления
              </button>
            )}
          </div>
        )}

        <section className="panel relative mb-4 overflow-hidden p-5">
          <div className="absolute right-[-100px] top-[-90px] h-52 w-52 rounded-full bg-[#E11D2E]/10 blur-3xl" />
          <h1 className="text-3xl font-black">Добро пожаловать в BloodCraft</h1>
          <p className="mt-1 text-sm text-bc-muted">Лаунчер готов к подключению API авторизации, лицензии и профилей.</p>
        </section>

        <div className="grid grid-cols-[280px_1fr] gap-4">
          <aside className="panel p-3">
            <p className="mb-2 text-xs uppercase text-bc-muted">Сервера</p>
            <div className="space-y-2">
              {servers.map((server) => {
                const active = server.id === selectedServerId;
                return (
                  <button
                    key={server.id}
                    onClick={() => setSelectedServer(server.id)}
                    className={`hover-card relative w-full rounded-[16px] border bg-bc-cardSoft p-3 text-left ${
                      active ? 'border-bc-accent shadow-accent' : 'border-white/10'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">{server.name}</span>
                      {server.disabled ? <span className="text-xs text-bc-muted">{server.soonLabel ?? 'Скоро'}</span> : <StatusBadge status={server.status} />}
                    </div>
                    <p className="mt-1 text-xs text-bc-muted">{server.shortDesc}</p>
                  </button>
                );
              })}
            </div>
          </aside>

          <section className="space-y-4">
            <div className="panel p-4">
              <div className="relative h-[210px] overflow-hidden rounded-[18px]">
                {selectedServer && <img src={selectedServer.bannerUrl} alt={selectedServer.name} className="h-full w-full object-cover" />}
                <div className="absolute inset-0 bg-gradient-to-b from-[#170f14]/70 via-transparent to-[#11151B]" />
                <div className="absolute bottom-3 left-3 right-3">
                  <h2 className="text-2xl font-black">{selectedServer?.name ?? 'Сервер не выбран'}</h2>
                  {selectedServer && (
                    <p className="text-sm text-bc-muted">
                      {selectedServer.longDesc}
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="panel p-4">
                <p className="mb-2 text-xs uppercase text-bc-muted">Профиль</p>
                <p className="text-lg font-black">{user.username}</p>
                <p className="text-sm text-bc-muted">Баланс: 1250 BC</p>
                <p className="text-xs text-bc-muted">Роль: Player</p>
                <p className="text-xs text-bc-muted">UUID: demo-uuid</p>
                <button className="btn-secondary mt-3" onClick={() => void logout()}>
                  Выйти
                </button>
              </div>

              <div className="panel p-4">
                <p className="mb-2 text-xs uppercase text-bc-muted">Ссылки</p>
                <div className="grid gap-2">
                  <button className="btn-secondary" onClick={() => openExternal('https://thebloodcraft.ru/profile')}>
                    Профиль на сайте
                  </button>
                  <button
                    className="btn-secondary"
                    disabled={!networkOnline}
                    onClick={async () => {
                      const ok = await updateService.check();
                      if (!ok) addToast('Проверка обновлений не удалась');
                    }}
                  >
                    Проверить обновления
                  </button>
                </div>
              </div>
            </div>
          </section>
        </div>

        <footer className="panel mt-4 overflow-hidden p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm">{bottomStatus}</p>
              {updater.status === 'downloading' && typeof updater.progress === 'number' && (
                <p className="text-xs text-bc-muted">Updater: {updater.progress}%</p>
              )}
            </div>
            <div className="w-[260px]">
              <PlayButton state={effectivePlayState} progress={launchProgress} onClick={() => void playSelectedServer()} />
            </div>
          </div>
          {effectivePlayState === 'launching' && (
            <div className="mt-3 h-[2px] overflow-hidden rounded-full bg-white/10">
              <div className="h-full bg-bc-accent transition-all duration-200 ease-premium" style={{ width: `${launchProgress}%` }} />
            </div>
          )}
        </footer>
      </div>

      <SettingsModal
        appVersion={APP_VERSION}
        onCheckUpdates={async () => {
          if (!networkOnline) {
            addToast('Нет соединения: проверка обновлений недоступна');
            return;
          }
          const ok = await updateService.check();
          if (!ok) addToast('Не удалось проверить обновления');
        }}
        onOpenLogsDir={async () => {
          await logService.openLogsDir();
        }}
        onOpenLatestLog={async () => {
          await logService.openLatestLog();
        }}
      />

      <ToastViewport />
    </div>
  );
}

export default App;
