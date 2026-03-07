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

const APP_VERSION = '1.3.1';

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
    playHelpAction,
    playHelpText,
    updater,
    setUpdaterState,
    setBottomStatus,
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
    playHelpAction: s.playHelpAction,
    playHelpText: s.playHelpText,
    updater: s.updater,
    setUpdaterState: s.setUpdaterState,
    setBottomStatus: s.setBottomStatus,
    addToast: s.addToast
  }));
  const selectedServer = useLauncherStore(selectSelectedServer);

  const updateBlocksPlay = updater.status === 'downloading' || updater.status === 'downloaded' || updater.status === 'installing' || updater.status === 'restarting';

  const handlePlayClick = () => {
    if (updateBlocksPlay) {
      setBottomStatus('Сначала завершите установку обновления');
      addToast('Обновление в процессе, запуск игры временно недоступен');
      return;
    }
    void logService.info('[ui] play click');
    void playSelectedServer();
  };

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
      const diagnostics = await networkService.checkOnline();
      setNetworkState(
        diagnostics.ok || diagnostics.site.ok,
        diagnostics.summary || (diagnostics.ok ? 'Сеть в порядке' : 'Нет соединения')
      );
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
    void updateService.checkForUpdate();
    return () => unsubscribe();
  }, [token, setUpdaterState]);

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
  const disabledReason = !networkOnline
    ? 'Нет соединения'
    : !selectedServer
      ? 'Выберите сервер'
      : selectedServer.disabled
        ? 'Сервер в разработке'
        : selectedServer.status !== 'Online'
          ? selectedServer.status === 'Maintenance'
            ? 'Сервер на технических работах'
            : 'Сервер недоступен'
          : undefined;
  const effectiveHelpText = playHelpText ?? disabledReason;

  return (
    <div className="h-screen overflow-hidden bg-bc-bg px-4 py-3 text-bc-text">
      <div className="mx-auto flex h-full max-w-[1100px] flex-col">
        <header className="panel mb-4 flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <img src={logoUrl} alt="BloodCraft" className="h-10 w-10 rounded-lg" />
            <div>
              <p className="text-lg font-black">BloodCraft</p>
              <p className="text-xs text-bc-muted">Launcher</p>
            </div>
          </div>
          <button
            className="btn-ghost flex h-10 w-10 items-center justify-center p-0 text-[20px]"
            onClick={() => setSettingsOpen(!settingsOpen)}
            aria-label="Settings"
          >
            <span className="leading-none">⚙</span>
          </button>
        </header>

        {!networkOnline && (
          <div className="panel mb-4 border border-[#E11D2E]/60 bg-[#2A171C] px-4 py-2 text-sm">{networkMessage}</div>
        )}

        <section className="panel relative mb-3 overflow-hidden p-4">
          <div className="absolute right-[-100px] top-[-90px] h-52 w-52 rounded-full bg-[#E11D2E]/10 blur-3xl" />
          <h1 className="text-3xl font-black">Добро пожаловать в BloodCraft</h1>
          <p className="mt-2 block text-sm text-bc-muted">Лаунчер готов к подключению API авторизации, лицензии и профилей.</p>
        </section>

        <div className="grid min-h-0 flex-1 grid-cols-[280px_1fr] gap-4">
          <aside className="panel min-h-0 overflow-auto p-3">
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

          <section className="min-h-0 space-y-4 overflow-auto pr-1">
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

            <div className="grid grid-cols-2 gap-4 pb-1">
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
                    disabled={!networkOnline || updater.status === 'checking'}
                    onClick={async () => {
                      const res = await updateService.checkForUpdate();
                      if (!res.ok) addToast('Проверка обновлений не удалась');
                    }}
                  >
                    Проверить обновления
                  </button>
                </div>
              </div>
            </div>
          </section>
        </div>

        <footer className="panel mt-3 shrink-0 overflow-hidden p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm">{bottomStatus}</p>
              {(updater.status === 'checking' || updater.status === 'downloading' || updater.status === 'downloaded' || updater.status === 'update_available' || updater.status === 'installing' || updater.status === 'restarting') && (
                <p className="text-xs text-bc-muted">
                  {updater.status === 'checking' && 'Проверка обновлений...'}
                  {updater.status === 'downloading' && `Загрузка обновления: ${updater.progress ?? 0}%`}
                  {updater.status === 'update_available' && 'Доступно обновление'}
                  {updater.status === 'downloaded' && 'Обновление скачано'}
                  {updater.status === 'installing' && 'Установка обновления...'}
                  {updater.status === 'restarting' && 'Перезапуск лаунчера...'}
                </p>
              )}
              {effectiveHelpText && <p className="text-xs text-bc-muted">{effectiveHelpText}</p>}
            </div>
            <div className="flex w-[430px] items-center justify-end gap-2">
              {playHelpAction === 'open-site' && (
                <button className="btn-secondary text-xs" onClick={() => openExternal('https://thebloodcraft.ru')}>
                  Открыть сайт
                </button>
              )}
              {playHelpAction === 'retry' && (
                <button className="btn-secondary text-xs" onClick={handlePlayClick}>
                  Проверить позже
                </button>
              )}
              {playHelpAction === 'open-minecraft-log' && (
                <button
                  className="btn-secondary text-xs"
                  onClick={() => {
                    void logService.openLatestMinecraftLog();
                  }}
                >
                  Открыть minecraft-лог
                </button>
              )}
              {playHelpAction === 'open-logs-dir' && (
                <button
                  className="btn-secondary text-xs"
                  onClick={() => {
                    void logService.openLogsDir();
                  }}
                >
                  Открыть папку логов
                </button>
              )}

              {updater.status === 'update_available' && (
                <button
                  className="btn-secondary text-xs"
                  onClick={async () => {
                    const ok = await updateService.downloadUpdate();
                    if (!ok) addToast('Не удалось скачать обновление');
                  }}
                >
                  Скачать обновление
                </button>
              )}

              {updater.status === 'downloaded' && (
                <button
                  className="btn-secondary text-xs"
                  onClick={async () => {
                    const result = await updateService.installUpdate();
                    if (!result.ok) {
                      if (result.reason === 'permission-denied') {
                        addToast('Не удалось установить обновление: нет прав на запись в /Applications.');
                        return;
                      }
                      addToast('Не удалось запустить установку обновления');
                    }
                  }}
                >
                  Установить обновление
                </button>
              )}

              {updater.status === 'error' && (
                <button
                  className="btn-secondary text-xs"
                  onClick={() => {
                    void updateService.openUpdateFolder();
                  }}
                >
                  Открыть папку updates
                </button>
              )}

              <div className="w-[200px]">
                <PlayButton state={effectivePlayState} progress={launchProgress} onClick={handlePlayClick} />
              </div>
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
          const ok = await updateService.checkForUpdate();
          if (!ok.ok) addToast('Не удалось проверить обновления');
        }}
        onOpenUpdateFolder={async () => {
          await updateService.openUpdateFolder();
        }}
        onOpenUpdaterLogPath={async () => {
          const logPath = await updateService.logPath();
          if (logPath) {
            await logService.info(`[updater] log path: ${logPath}`);
            addToast(`updater.log: ${logPath}`);
          }
        }}
        onOpenLogsDir={async () => {
          await logService.openLogsDir();
        }}
        onOpenLatestLog={async () => {
          await logService.openLatestLog();
        }}
        onDiagnoseConnection={async () => {
          const diagnostics = await networkService.diagnose();
          const parts = [
            `Сайт: ${diagnostics.site.status ?? 'n/a'} (${diagnostics.site.message})`,
            `API: ${diagnostics.launcherApi.status ?? 'n/a'} (${diagnostics.launcherApi.message})`
          ];
          addToast(diagnostics.ok ? 'Соединение в порядке' : diagnostics.summary || 'Проблема соединения');
          await logService.info(`[network] manual diagnostics: ${parts.join(' | ')}`);
        }}
      />

      <ToastViewport />
    </div>
  );
}

export default App;
