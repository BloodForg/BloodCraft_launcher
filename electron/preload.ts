import { contextBridge, ipcRenderer } from 'electron';
import type { Distribution, InstallProgress, LauncherStatus } from './launcher/types.js';

contextBridge.exposeInMainWorld('bloodcraft', {
  openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),
  network: {
    check: (): Promise<boolean> => ipcRenderer.invoke('network:check')
  },
  logger: {
    info: (message: string): Promise<boolean> => ipcRenderer.invoke('logger:info', message),
    error: (message: string): Promise<boolean> => ipcRenderer.invoke('logger:error', message)
  },
  logs: {
    openDir: (): Promise<string> => ipcRenderer.invoke('logs:openDir'),
    openLatest: (): Promise<string> => ipcRenderer.invoke('logs:openLatest')
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
    restart: (): Promise<boolean> => ipcRenderer.invoke('updater:restart'),
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
    }
  },
  launcher: {
    getStatus: (): Promise<LauncherStatus> => ipcRenderer.invoke('launcher:getStatus'),
    getDistribution: (): Promise<Distribution | null> => ipcRenderer.invoke('launcher:getDistribution'),
    install: (): Promise<boolean> => ipcRenderer.invoke('launcher:install'),
    launch: (): Promise<boolean> => ipcRenderer.invoke('launcher:launch'),
    onProgress: (cb: (progress: InstallProgress) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, progress: InstallProgress) => cb(progress);
      ipcRenderer.on('launcher:progress', handler);
      return () => ipcRenderer.removeListener('launcher:progress', handler);
    }
  }
});
