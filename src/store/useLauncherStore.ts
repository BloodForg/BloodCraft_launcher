import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import downloadsMock from '../mocks/downloads.mock.json';
import { authService } from '../services/authService';
import { contentService } from '../services/contentService';
import { statusService } from '../services/statusService';
import { TARGET_MINECRAFT_VERSION } from '../config/version';
import type { DownloadTask, GameProfile, NewsItem, PromoItem, ServerItem, TabKey, User } from '../types';

interface Toast {
  id: number;
  text: string;
}

type PlayState = 'idle' | 'launching' | 'disabled';

interface LauncherState {
  tab: TabKey;
  token: string | null;
  user: User | null;
  authLoading: boolean;
  loginForm: { login: string; password: string };

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

  playSelectedServer: () => void;
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
      tab: 'home',
      token: null,
      user: null,
      authLoading: false,
      loginForm: { login: '', password: '' },

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
      setLoginForm: (patch) => set((s) => ({ loginForm: { ...s.loginForm, ...patch } })),

      login: async () => {
        const { login, password } = get().loginForm;
        set({ authLoading: true });
        try {
          const res = await authService.login(login, password);
          set({ token: res.token, user: res.user, authLoading: false });
          get().addToast(`Вы вошли как ${res.user.username}`);
        } catch (error) {
          set({ authLoading: false });
          get().addToast(error instanceof Error ? error.message : 'Ошибка входа');
        }
      },

      logout: async () => {
        await authService.logout();
        set({ token: null, user: null, playState: 'idle', launchProgress: 0 });
        get().addToast('Вы вышли из профиля');
      },

      simulateLoginToggle: async () => {
        if (get().token) {
          await get().logout();
          return;
        }
        const me = await authService.me();
        set({ token: 'simulated_token', user: me });
        get().addToast('Simulate login: успешно');
      },

      loadContent: async () => {
        const [servers, news, promos] = await Promise.all([
          contentService.getServers(),
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

      playSelectedServer: () => {
        const s = get();
        const server = s.servers.find((x) => x.id === s.selectedServerId);

        if (!server || server.status !== 'Online') {
          set({ playState: 'disabled' });
          return;
        }

        set({ playState: 'launching', launchProgress: 0 });

        const timer = setInterval(() => {
          const state = get();
          const value = Math.min(100, state.launchProgress + 11);
          set({ launchProgress: value });

          if (value >= 100) {
            clearInterval(timer);
            set({ playState: 'idle', launchProgress: 0 });
            get().addToast('Запуск клиента (UI-заглушка)');
          }
        }, 180);
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
      partialize: (s) => ({
        token: s.token,
        user: s.user,
        settings: s.settings,
        selectedProfileId: s.selectedProfileId
      })
    }
  )
);

export const selectSelectedServer = (s: LauncherState) => s.servers.find((x) => x.id === s.selectedServerId) ?? null;
export const selectSelectedProfile = (s: LauncherState) => s.profiles.find((x) => x.id === s.selectedProfileId) ?? s.profiles[0];
