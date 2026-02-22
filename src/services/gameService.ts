type LauncherProgress = {
  stage: 'idle' | 'downloading' | 'extracting' | 'verifying' | 'done' | 'error';
  percent?: number;
  message?: string;
  currentBytes?: number;
  totalBytes?: number;
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
  async launch() {
    if (!window.bloodcraft?.launcher) return false;
    return window.bloodcraft.launcher.launch();
  },
  onProgress(cb: (progress: LauncherProgress) => void) {
    if (!window.bloodcraft?.launcher) return () => undefined;
    return window.bloodcraft.launcher.onProgress(cb);
  }
};
