export type UpdaterStatus = {
  status: 'idle' | 'checking' | 'update_available' | 'downloading' | 'downloaded' | 'installing' | 'restarting' | 'error';
  message?: string;
  progress?: number;
  version?: string;
  filePath?: string;
};

export type InstallUpdateResult = {
  ok: boolean;
  reason?: 'permission-denied' | 'not-downloaded' | 'spawn-failed' | 'unknown';
};

export const updateService = {
  getStatus: async (): Promise<UpdaterStatus> => {
    if (!window.bloodcraft?.updater) return { status: 'idle' };
    return window.bloodcraft.updater.getStatus();
  },
  checkForUpdate: async (): Promise<{ ok: boolean; available: boolean }> => {
    if (!window.bloodcraft?.updater) return { ok: false, available: false };
    return window.bloodcraft.updater.checkForUpdate();
  },
  downloadUpdate: async (): Promise<boolean> => {
    if (!window.bloodcraft?.updater) return false;
    return window.bloodcraft.updater.downloadUpdate();
  },
  installUpdate: async (): Promise<InstallUpdateResult> => {
    if (!window.bloodcraft?.updater) return { ok: false, reason: 'unknown' };
    return window.bloodcraft.updater.installUpdate();
  },
  openUpdateFolder: async (): Promise<string> => {
    if (!window.bloodcraft?.updater) return '';
    return window.bloodcraft.updater.openUpdateFolder();
  },
  logPath: async (): Promise<string> => {
    if (!window.bloodcraft?.updater?.logPath) return '';
    return window.bloodcraft.updater.logPath();
  },
  onStatus: (cb: (status: UpdaterStatus) => void) => {
    if (!window.bloodcraft?.updater) return () => undefined;
    return window.bloodcraft.updater.onStatus(cb);
  }
};
