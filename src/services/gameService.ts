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
  }
};
