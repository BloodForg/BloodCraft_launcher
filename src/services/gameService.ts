type LauncherProgress = {
  stage: 'idle' | 'downloading' | 'extracting' | 'verifying' | 'launching' | 'done' | 'error';
  percent?: number;
  message?: string;
  currentBytes?: number;
  totalBytes?: number;
};

type LaunchOptions = {
  javaPath?: string;
  minMemoryGb?: number;
  maxMemoryGb?: number;
  username?: string;
  uuid?: string;
};

export const gameService = {
  async getStatus() {
    if (!window.bloodcraft?.launcher) return null;
    return window.bloodcraft.launcher.getStatus();
  },
  async install() {
    if (!window.bloodcraft?.launcher) return false;
    return window.bloodcraft.launcher.install();
  },
  async launch(options?: LaunchOptions) {
    if (!window.bloodcraft?.launcher) return false;
    return window.bloodcraft.launcher.launch(options);
  },
  onProgress(cb: (progress: LauncherProgress) => void) {
    if (!window.bloodcraft?.launcher) return () => undefined;
    return window.bloodcraft.launcher.onProgress(cb);
  },
  onStatus(cb: (status: { stage: string; message: string; percent?: number }) => void) {
    if (!window.bloodcraft?.launcher?.onGameStatus) return () => undefined;
    return window.bloodcraft.launcher.onGameStatus(cb);
  },
  onError(cb: (error: { code: string; message: string }) => void) {
    if (!window.bloodcraft?.launcher?.onGameError) return () => undefined;
    return window.bloodcraft.launcher.onGameError(cb);
  },
  onLaunched(cb: (payload: { ok: boolean; message: string }) => void) {
    if (!window.bloodcraft?.launcher?.onGameLaunched) return () => undefined;
    return window.bloodcraft.launcher.onGameLaunched(cb);
  }
};
