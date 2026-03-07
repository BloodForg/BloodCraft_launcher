import { contextBridge, ipcRenderer } from 'electron';
import type { Distribution, InstallProgress, LauncherStatus } from './launcher/types.js';

type UpdaterStatus = {
  status: 'idle' | 'checking' | 'update_available' | 'downloading' | 'downloaded' | 'installing' | 'restarting' | 'error';
  message?: string;
  progress?: number;
  version?: string;
  filePath?: string;
};

type InstallUpdateResult = {
  ok: boolean;
  reason?: 'permission-denied' | 'not-downloaded' | 'spawn-failed' | 'security-check-failed' | 'unknown';
};

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
    getStatus: (): Promise<UpdaterStatus> => ipcRenderer.invoke('updater:getStatus'),
    checkForUpdate: (): Promise<{ ok: boolean; available: boolean }> => ipcRenderer.invoke('updater:checkForUpdate'),
    downloadUpdate: (): Promise<boolean> => ipcRenderer.invoke('updater:downloadUpdate'),
    installUpdate: (): Promise<InstallUpdateResult> => ipcRenderer.invoke('updater:installUpdate'),
    openUpdateFolder: (): Promise<string> => ipcRenderer.invoke('updater:openUpdateFolder'),
    logPath: (): Promise<string> => ipcRenderer.invoke('updater:logPath'),
    onStatus: (cb: (status: UpdaterStatus) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, status: UpdaterStatus) => cb(status);
      ipcRenderer.on('updater:status', handler);
      return () => ipcRenderer.removeListener('updater:status', handler);
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
