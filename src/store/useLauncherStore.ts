import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import downloadsMock from '../mocks/downloads.mock.json';
import { AuthUiError, authService } from '../services/authService';
import { contentService } from '../services/contentService';
import { gameService } from '../services/gameService';
import { logService } from '../services/logService';
import { serverService } from '../services/serverService';
import { statusService } from '../services/statusService';
import { TARGET_MINECRAFT_VERSION } from '../config/version';
import { useSettingsStore } from './useSettingsStore';
import type { DownloadTask, GameProfile, NewsItem, PromoItem, ServerItem, TabKey, User } from '../types';

interface Toast {
  id: number;
  text: string;
}

type PlayState = 'idle' | 'launching' | 'disabled';

interface LauncherState {
  authChecked: boolean;
  tab: TabKey;
  token: string | null;
  user: User | null;
  authLoading: boolean;
  loginErrorCode: 'none' | 'NETWORK' | 'INVALID_CREDENTIALS' | 'API_NOT_FOUND' | 'SERVICE_UNAVAILABLE' | 'INVALID_RESPONSE' | 'UNAUTHORIZED' | 'UNKNOWN';
  loginErrorMessage?: string;
  loginForm: { login: string; password: string };
  settingsOpen: boolean;
  networkOnline: boolean;
  networkMessage: string;
  bottomStatus: string;
  playHelpAction: 'none' | 'open-site' | 'retry' | 'open-logs';
  playHelpText?: string;
  updater: {
    status: 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error';
    message?: string;
    progress?: number;
    version?: string;
  };

  servers: ServerItem[];
  selectedServerId: string | null;
  serverFilter: { type: string; version: string; onlineOnly: boolean };

  news: NewsItem[];
  promos: PromoItem[];
  promoIndex: number;
  dynamicBannerIndex: number;

  playState: PlayState;
  launchProgress: number;

  downloads: DownloadTask[];
  statusTotalOnline: number;
  statusPopular: ServerItem[];
  statusUpdatedAt: number;

  profiles: GameProfile[];
  selectedProfileId: string;

  settings: {
    memoryGb: number;
    installPath: string;
    javaPath: string;
    autoUpdate: boolean;
    showLogs: boolean;
    windowedMode: boolean;
  };

  logs: string[];
  toasts: Toast[];

  setTab: (tab: TabKey) => void;
  setSettingsOpen: (open: boolean) => void;
  setNetworkState: (online: boolean, message?: string) => void;
  setBottomStatus: (value: string) => void;
  setUpdaterState: (value: LauncherState['updater']) => void;
  initSession: () => Promise<void>;
  setLoginForm: (patch: Partial<{ login: string; password: string }>) => void;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  simulateLoginToggle: () => Promise<void>;

  loadContent: () => Promise<void>;
  refreshStatus: () => Promise<void>;
  setSelectedServer: (id: string) => void;
  setServerFilter: (patch: Partial<{ type: string; version: string; onlineOnly: boolean }>) => void;

  nextPromo: () => void;
  setPromoIndex: (index: number) => void;
  nextDynamicBanner: () => void;
  setDynamicBannerIndex: (index: number) => void;

  playSelectedServer: () => Promise<void>;
  cyclePlayState: () => void;

  setSelectedProfile: (id: string) => void;

  setMemoryGb: (value: number) => void;
  setInstallPath: (value: string) => void;
  setJavaPath: (value: string) => void;
  setSettingFlag: (k: 'autoUpdate' | 'showLogs' | 'windowedMode', v: boolean) => void;
  saveSettings: () => void;

  setDownloads: (tasks: DownloadTask[]) => void;
  patchDownload: (id: string, patch: Partial<DownloadTask>) => void;

  addLog: (line: string) => void;
  clearLogs: () => void;

  addToast: (text: string) => void;
  dismissToast: (id: number) => void;
}

const profiles: GameProfile[] = [
  {
    id: 'vanilla-default',
    name: 'Vanilla+ (Default)',
    minecraftVersion: TARGET_MINECRAFT_VERSION,
    modsSummary: 'Core Pack (42 mods)',
    jvmArgs: '-Xms2G -Xmx6G -XX:+UseG1GC'
  },
  {
    id: 'vanilla-low',
    name: 'Vanilla+ LowEnd',
    minecraftVersion: TARGET_MINECRAFT_VERSION,
    modsSummary: 'Lite Pack (18 mods)',
    jvmArgs: '-Xms2G -Xmx4G -XX:+UseSerialGC'
  },
  {
    id: 'vanilla-high',
    name: 'Vanilla+ High',
    minecraftVersion: TARGET_MINECRAFT_VERSION,
    modsSummary: 'Ultra Pack (61 mods)',
    jvmArgs: '-Xms4G -Xmx10G -XX:+UseG1GC'
  }
];

let toastId = 0;

export const useLauncherStore = create<LauncherState>()(
  persist(
    (set, get) => ({
      authChecked: false,
      tab: 'home',
      token: null,
      user: null,
      authLoading: false,
      loginErrorCode: 'none',
      loginErrorMessage: undefined,
      loginForm: { login: '', password: '' },
      settingsOpen: false,
      networkOnline: true,
      networkMessage: 'Сеть в порядке',
      bottomStatus: 'Лаунчер готов к запуску',
      playHelpAction: 'none',
      playHelpText: undefined,
      updater: { status: 'idle' },

      servers: [],
      selectedServerId: null,
      serverFilter: { type: 'Все типы', version: 'Все версии', onlineOnly: false },

      news: [],
      promos: [],
      promoIndex: 0,
      dynamicBannerIndex: 0,

      playState: 'idle',
      launchProgress: 0,

      downloads: downloadsMock as DownloadTask[],
      statusTotalOnline: 0,
      statusPopular: [],
      statusUpdatedAt: Date.now(),

      profiles,
      selectedProfileId: profiles[0].id,

      settings: {
        memoryGb: 6,
        installPath: '/Games/BloodCraft',
        javaPath: '/Library/Java/JavaVirtualMachines/jdk-21.jdk/Contents/Home/bin/java',
        autoUpdate: true,
        showLogs: true,
        windowedMode: false
      },

      logs: [
        '[INFO] Launcher initialized.',
        '[INFO] Content service: mock mode enabled.',
        '[WARN] Minecraft start is disabled in UI template mode.'
      ],
      toasts: [],

      setTab: (tab) => set({ tab }),
      setSettingsOpen: (open) => set({ settingsOpen: open }),
      setNetworkState: (online, message) => set({ networkOnline: online, networkMessage: message ?? (online ? 'Сеть в порядке' : 'Нет соединения') }),
      setBottomStatus: (value) => set({ bottomStatus: value }),
      setUpdaterState: (value) => set({ updater: value }),
      initSession: async () => {
        try {
          const refreshed = await authService.refresh();
          set({ token: refreshed.accessToken, user: refreshed.user, authChecked: true });
        } catch (error) {
          await logService.info(`[auth] session refresh skipped: ${error instanceof Error ? error.message : 'unknown'}`);
          set({ token: null, user: null, authChecked: true });
        }
      },
      setLoginForm: (patch) => set((s) => ({ loginForm: { ...s.loginForm, ...patch } })),

      login: async () => {
        const { login, password } = get().loginForm;
        set({ authLoading: true, loginErrorCode: 'none', loginErrorMessage: undefined });
        try {
          const res = await authService.login(login, password);
          set({ token: res.accessToken, user: res.user, authLoading: false, authChecked: true, loginErrorCode: 'none', loginErrorMessage: undefined });
          await logService.info(`[auth] login success for ${res.user.username}`);
          get().addToast(`Вы вошли как ${res.user.username}`);
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Ошибка входа';
          const code = error instanceof AuthUiError ? error.code : 'UNKNOWN';
          set({ authLoading: false, loginErrorCode: code, loginErrorMessage: message });
          await logService.error(`[auth] login failed: code=${code} message=${message}`);
          get().addToast(message);
        }
      },

      logout: async () => {
        await authService.logout();
        set({ token: null, user: null, playState: 'idle', launchProgress: 0, settingsOpen: false });
        await logService.info('[auth] logout');
        get().addToast('Вы вышли из профиля');
      },

      simulateLoginToggle: async () => {
        if (get().token) {
          await get().logout();
          return;
        }
        try {
          const refreshed = await authService.refresh();
          set({ token: refreshed.accessToken, user: refreshed.user });
          get().addToast('Simulate login: использован refresh token');
        } catch {
          get().addToast('Simulate login недоступен без активной сессии');
        }
      },

      loadContent: async () => {
        const [servers, news, promos] = await Promise.all([
          serverService.getLauncherServers(),
          contentService.getNews(),
          contentService.getPromos()
        ]);

        set((s) => ({
          servers,
          selectedServerId: s.selectedServerId ?? servers[0]?.id ?? null,
          news,
          promos
        }));

        await get().refreshStatus();
      },

      refreshStatus: async () => {
        const status = await statusService.getServerStatus();
        set({
          statusTotalOnline: status.totalOnline,
          statusPopular: status.popular,
          statusUpdatedAt: status.updatedAt
        });
      },

      setSelectedServer: (id) => {
        set({ selectedServerId: id });
      },

      setServerFilter: (patch) => {
        set((s) => ({ serverFilter: { ...s.serverFilter, ...patch } }));
      },

      nextPromo: () => {
        set((s) => ({
          promoIndex: s.promos.length ? (s.promoIndex + 1) % s.promos.length : 0
        }));
      },

      setPromoIndex: (index) => {
        set((s) => ({ promoIndex: s.promos.length ? (index + s.promos.length) % s.promos.length : 0 }));
      },

      nextDynamicBanner: () => {
        set((s) => ({
          dynamicBannerIndex: s.promos.length ? (s.dynamicBannerIndex + 1) % s.promos.length : 0
        }));
      },
      setDynamicBannerIndex: (index) => {
        set((s) => ({
          dynamicBannerIndex: s.promos.length ? (index + s.promos.length) % s.promos.length : 0
        }));
      },

      playSelectedServer: async () => {
        const s = get();
        const server = s.servers.find((x) => x.id === s.selectedServerId);
        await logService.info(
          `[store] play called offline=${String(!s.networkOnline)} selectedServerId=${s.selectedServerId ?? 'none'} playState=${s.playState} launchProgress=${s.launchProgress}`
        );

        set({ bottomStatus: 'Подготовка запуска...', playHelpAction: 'none', playHelpText: undefined });

        if (s.playState === 'launching') {
          set({
            playState: 'launching',
            bottomStatus: 'Установка уже идёт...',
            playHelpAction: 'none',
            playHelpText: 'Дождитесь завершения текущей операции.'
          });
          await logService.info('[store] play blocked: installation already in progress');
          return;
        }

        if (!s.networkOnline) {
          set({ playState: 'disabled', bottomStatus: 'Нет соединения', playHelpAction: 'retry', playHelpText: 'Проверьте сеть и попробуйте снова.' });
          await logService.info('[store] play blocked: offline');
          return;
        }

        if (!server) {
          set({
            playState: 'disabled',
            bottomStatus: 'Выберите сервер',
            playHelpAction: 'none',
            playHelpText: 'Сначала выберите сервер для запуска.'
          });
          await logService.info('[store] play blocked: no server selected');
          return;
        }

        if (server.disabled) {
          set({
            playState: 'disabled',
            bottomStatus: 'Сервер в разработке',
            playHelpAction: 'none',
            playHelpText: 'Этот сервер пока недоступен. Статус: Скоро.'
          });
          await logService.info(`[store] play blocked: server disabled (${server.id})`);
          return;
        }

        if (server.status !== 'Online') {
          set({
            playState: 'disabled',
            bottomStatus: server.status === 'Maintenance' ? 'Сервер на технических работах' : 'Сервер недоступен',
            playHelpAction: 'none',
            playHelpText: 'Выберите другой сервер или попробуйте позже.'
          });
          await logService.info(`[store] play blocked: server status ${server.status} (${server.id})`);
          return;
        }

        set({ playState: 'launching', launchProgress: 0, bottomStatus: 'Подготовка к запуску...', playHelpAction: 'none', playHelpText: undefined });
        let unsubscribe: (() => void) | undefined;
        let unsubscribeStatus: (() => void) | undefined;
        let unsubscribeError: (() => void) | undefined;
        let unsubscribeLaunched: (() => void) | undefined;
        let launchSucceeded = false;

        if (!window.bloodcraft?.launcher) {
          console.error('[Launcher IPC] window.bloodcraft.launcher is unavailable');
          await logService.error('[launcher] API unavailable in renderer');
          set({
            playState: 'disabled',
            bottomStatus: 'Ошибка запуска: IPC недоступен',
            playHelpAction: 'open-logs',
            playHelpText: 'Перезапустите лаунчер. Если проблема повторится, откройте логи.'
          });
          get().addToast('Launcher API недоступен');
          return;
        }

        try {
          set({ bottomStatus: 'Проверка файлов...' });
          const status = await gameService.getStatus();
          console.log('[Launcher status]', status);
          await logService.info(`[launcher] status: ${JSON.stringify(status)}`);

          unsubscribe = gameService.onProgress((progress) => {
            const percent = typeof progress.percent === 'number' ? progress.percent : 0;
            const message = progress.message ?? 'Обработка...';
            console.log('[Launcher progress]', progress.stage, message);
            if (typeof progress.percent === 'number') {
              set({ launchProgress: progress.percent, bottomStatus: message });
            } else {
              set({ bottomStatus: message });
            }
            if (progress.stage === 'done') set({ launchProgress: 100, bottomStatus: 'Установка завершена' });
            if (progress.stage === 'error') set({ bottomStatus: message || 'Ошибка установки' });
            void logService.info(`[launcher] progress ${progress.stage} ${percent}% ${message}`);
          });
          unsubscribeStatus = gameService.onStatus((status) => {
            if (status.message) {
              set({ bottomStatus: status.message });
            }
          });
          unsubscribeError = gameService.onError((error) => {
            set({
              playState: 'disabled',
              bottomStatus: error.message || 'Ошибка запуска',
              playHelpAction: 'open-logs',
              playHelpText: 'Откройте логи для деталей.'
            });
          });
          unsubscribeLaunched = gameService.onLaunched(() => {
            launchSucceeded = true;
            set({
              playState: 'idle',
              launchProgress: 100,
              bottomStatus: 'Minecraft запущен',
              playHelpAction: 'none',
              playHelpText: undefined
            });
          });

          const installOk = await gameService.install();
          if (!installOk) {
            const failedStatus = await gameService.getStatus().catch(() => null);
            const rawError = failedStatus?.lastError ?? '';
            const has404 = rawError.includes('404');
            if (has404) {
              await logService.error(`[launcher] install failed with 404: ${rawError}`);
              set({
                playState: 'disabled',
                bottomStatus: 'Клиент пока не опубликован',
                playHelpAction: 'open-site',
                playHelpText: 'Клиент пока не опубликован. Проверьте позже.'
              });
              get().addToast('Клиент пока не опубликован');
              return;
            }
            get().addToast(rawError ? 'Не удалось установить клиент' : 'Ошибка установки клиента');
            set({
              playState: 'disabled',
              bottomStatus: 'Ошибка установки клиента',
              playHelpAction: 'open-logs',
              playHelpText: 'Проверьте логи запуска и повторите попытку.'
            });
            return;
          }

          set({ bottomStatus: 'Запуск Minecraft...' });
          const settings = useSettingsStore.getState();
          const launchOk = await gameService.launch({
            javaPath: settings.javaMode === 'custom' ? settings.javaPath : undefined,
            minMemoryGb: Math.max(2, Math.floor(settings.ramGb / 2)),
            maxMemoryGb: settings.ramGb
          });
          if (!launchOk) {
            const failedStatus = await gameService.getStatus().catch(() => null);
            await logService.error(`[launcher] launch failed: ${failedStatus?.lastError ?? 'unknown'}`);
            get().addToast('Ошибка запуска клиента');
            set({
              playState: 'disabled',
              bottomStatus: 'Ошибка запуска клиента',
              playHelpAction: 'open-logs',
              playHelpText: 'Откройте логи и проверьте Java/файлы клиента.'
            });
          }
        } catch (error) {
          console.error('[Launcher IPC] play flow failed', error);
          await logService.error(`[launcher] play flow failed: ${error instanceof Error ? error.message : 'unknown error'}`);
          get().addToast('Ошибка запуска клиента');
          set({
            playState: 'disabled',
            bottomStatus: 'Ошибка запуска: проверьте настройки',
            playHelpAction: 'open-logs',
            playHelpText: 'Откройте логи для деталей.'
          });
        } finally {
          unsubscribe?.();
          unsubscribeStatus?.();
          unsubscribeError?.();
          unsubscribeLaunched?.();
          if (!launchSucceeded && get().playState === 'launching') {
            set({ playState: 'idle', launchProgress: 0, bottomStatus: 'Лаунчер готов к запуску', playHelpAction: 'none', playHelpText: undefined });
          }
        }
      },

      cyclePlayState: () => {
        const current = get().playState;
        const next = current === 'idle' ? 'launching' : current === 'launching' ? 'disabled' : 'idle';
        set({ playState: next, launchProgress: next === 'launching' ? 42 : 0 });
      },

      setSelectedProfile: (id) => set({ selectedProfileId: id }),

      setMemoryGb: (value) => set((s) => ({ settings: { ...s.settings, memoryGb: value } })),
      setInstallPath: (value) => set((s) => ({ settings: { ...s.settings, installPath: value } })),
      setJavaPath: (value) => set((s) => ({ settings: { ...s.settings, javaPath: value } })),
      setSettingFlag: (k, v) => set((s) => ({ settings: { ...s.settings, [k]: v } })),
      saveSettings: () => get().addToast('Сохранено'),

      setDownloads: (tasks) => set({ downloads: tasks }),
      patchDownload: (id, patch) => {
        set((s) => ({ downloads: s.downloads.map((d) => (d.id === id ? { ...d, ...patch } : d)) }));
      },

      addLog: (line) => set((s) => ({ logs: [...s.logs, line] })),
      clearLogs: () => set({ logs: [] }),

      addToast: (text) => {
        const id = ++toastId;
        set((s) => ({ toasts: [...s.toasts, { id, text }] }));

        setTimeout(() => {
          get().dismissToast(id);
        }, 2600);
      },
      dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
    }),
    {
      name: 'bloodcraft-launcher-state',
      version: 2,
      migrate: (persistedState: unknown) => {
        const state = (persistedState as Partial<LauncherState>) ?? {};
        return {
          ...state,
          token: null,
          user: null
        };
      },
      partialize: (s) => ({
        token: null,
        user: null,
        settings: s.settings,
        selectedProfileId: s.selectedProfileId
      })
    }
  )
);

export const selectSelectedServer = (s: LauncherState) => s.servers.find((x) => x.id === s.selectedServerId) ?? null;
export const selectSelectedProfile = (s: LauncherState) => s.profiles.find((x) => x.id === s.selectedProfileId) ?? s.profiles[0];
