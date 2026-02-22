import { contextBridge, ipcRenderer } from 'electron';
import type { Distribution, InstallProgress, LauncherStatus } from './launcher/types.js';

contextBridge.exposeInMainWorld('bloodcraft', {
  openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),
  app: {
    quit: (): Promise<boolean> => ipcRenderer.invoke('app:quit')
  },
  auth: {
    login: (
      login: string,
      password: string
    ): Promise<
      | { ok: true; session: { accessToken: string; user: { username: string; avatarUrl: string; email: string; uuid?: string } } }
      | { ok: false; error: { code: string; message: string } }
    > => ipcRenderer.invoke('auth:login', login, password),
    me: (): Promise<{ ok: true; user: { username: string; avatarUrl: string; email: string; uuid?: string } } | { ok: false; error: { code: string; message: string } }> =>
      ipcRenderer.invoke('auth:me'),
    refresh: (): Promise<
      | { ok: true; session: { accessToken: string; user: { username: string; avatarUrl: string; email: string; uuid?: string } } }
      | { ok: false; error: { code: string; message: string } }
    > => ipcRenderer.invoke('auth:refresh'),
    logout: (): Promise<{ ok: true } | { ok: false; error: { code: string; message: string } }> => ipcRenderer.invoke('auth:logout')
  },
  network: {
    check: (): Promise<{
      ok: boolean;
      summary: string;
      site: { ok: boolean; status?: number; url: string; finalUrl?: string; message: string };
      launcherApi: { ok: boolean; status?: number; url: string; finalUrl?: string; message: string };
    }> => ipcRenderer.invoke('network:check'),
    diagnose: (): Promise<{
      ok: boolean;
      summary: string;
      site: { ok: boolean; status?: number; url: string; finalUrl?: string; message: string };
      launcherApi: { ok: boolean; status?: number; url: string; finalUrl?: string; message: string };
    }> => ipcRenderer.invoke('network:diagnose')
  },
  logger: {
    info: (message: string): Promise<boolean> => ipcRenderer.invoke('logger:info', message),
    error: (message: string): Promise<boolean> => ipcRenderer.invoke('logger:error', message)
  },
  logs: {
    openDir: (): Promise<string> => ipcRenderer.invoke('logs:openDir'),
    openLatest: (): Promise<string> => ipcRenderer.invoke('logs:openLatest'),
    openLatestMinecraft: (): Promise<string> => ipcRenderer.invoke('logs:openLatestMinecraft')
  },
  updater: {
    getStatus: (): Promise<{
      status: 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error';
      message?: string;
      progress?: number;
      version?: string;
    }> => ipcRenderer.invoke('updater:getStatus'),
    check: (): Promise<boolean> => ipcRenderer.invoke('updater:check'),
    download: (): Promise<boolean> => ipcRenderer.invoke('updater:download'),
    restart: (): Promise<{ ok: boolean; reason?: 'not-downloaded' }> => ipcRenderer.invoke('updater:restart'),
    shipitLogs: (): Promise<string> => ipcRenderer.invoke('updater:shipitLogs'),
    openUpdateFolder: (): Promise<string> => ipcRenderer.invoke('updater:openUpdateFolder'),
    onStatus: (
      cb: (status: {
        status: 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error';
        message?: string;
        progress?: number;
        version?: string;
      }) => void
    ) => {
      const handler = (_event: Electron.IpcRendererEvent, status: { status: 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error'; message?: string; progress?: number; version?: string }) =>
        cb(status);
      ipcRenderer.on('updater:status', handler);
      return () => ipcRenderer.removeListener('updater:status', handler);
    },
    onShipItLog: (cb: (text: string) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, text: string) => cb(text);
      ipcRenderer.on('updater:shipit-log', handler);
      return () => ipcRenderer.removeListener('updater:shipit-log', handler);
    }
  },
  launcher: {
    getStatus: (): Promise<LauncherStatus> => ipcRenderer.invoke('launcher:getStatus'),
    getDistribution: (): Promise<Distribution | null> => ipcRenderer.invoke('launcher:getDistribution'),
    install: (): Promise<boolean> => ipcRenderer.invoke('launcher:install'),
    launch: (options?: { javaPath?: string; minMemoryGb?: number; maxMemoryGb?: number; username?: string; uuid?: string }): Promise<boolean> =>
      ipcRenderer.invoke('launcher:launch', options),
    onProgress: (cb: (progress: InstallProgress) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, progress: InstallProgress) => cb(progress);
      ipcRenderer.on('launcher:progress', handler);
      return () => ipcRenderer.removeListener('launcher:progress', handler);
    },
    onGameStatus: (cb: (status: { stage: string; message: string; percent?: number }) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, status: { stage: string; message: string; percent?: number }) => cb(status);
      ipcRenderer.on('game:status', handler);
      return () => ipcRenderer.removeListener('game:status', handler);
    },
    onGameError: (cb: (error: { code: string; message: string }) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, error: { code: string; message: string }) => cb(error);
      ipcRenderer.on('game:error', handler);
      return () => ipcRenderer.removeListener('game:error', handler);
    },
    onGameLaunched: (cb: (payload: { ok: boolean; message: string }) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, payload: { ok: boolean; message: string }) => cb(payload);
      ipcRenderer.on('game:launched', handler);
      return () => ipcRenderer.removeListener('game:launched', handler);
    }
  }
});
