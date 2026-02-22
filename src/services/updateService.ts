export type UpdaterStatus = {
  status: 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error';
  message?: string;
  progress?: number;
  version?: string;
};

export const updateService = {
  getStatus: async (): Promise<UpdaterStatus> => {
    if (!window.bloodcraft?.updater) return { status: 'idle' };
    return window.bloodcraft.updater.getStatus();
  },
  check: async (): Promise<boolean> => {
    if (!window.bloodcraft?.updater) return false;
    return window.bloodcraft.updater.check();
  },
  download: async (): Promise<boolean> => {
    if (!window.bloodcraft?.updater) return false;
    return window.bloodcraft.updater.download();
  },
  restart: async (): Promise<{ ok: boolean; reason?: 'not-downloaded' }> => {
    if (!window.bloodcraft?.updater) return { ok: false };
    return window.bloodcraft.updater.restart();
  },
  shipitLogs: async (): Promise<string> => {
    if (!window.bloodcraft?.updater) return '';
    return window.bloodcraft.updater.shipitLogs();
  },
  openUpdateFolder: async (): Promise<string> => {
    if (!window.bloodcraft?.updater) return '';
    return window.bloodcraft.updater.openUpdateFolder();
  },
  onStatus: (cb: (status: UpdaterStatus) => void) => {
    if (!window.bloodcraft?.updater) return () => undefined;
    return window.bloodcraft.updater.onStatus(cb);
  },
  onShipItLog: (cb: (text: string) => void) => {
    if (!window.bloodcraft?.updater?.onShipItLog) return () => undefined;
    return window.bloodcraft.updater.onShipItLog(cb);
  }
};
