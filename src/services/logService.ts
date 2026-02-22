export const logService = {
  async info(message: string) {
    if (window.bloodcraft?.logger) {
      await window.bloodcraft.logger.info(message);
      return;
    }
    console.info(message);
  },
  async error(message: string) {
    if (window.bloodcraft?.logger) {
      await window.bloodcraft.logger.error(message);
      return;
    }
    console.error(message);
  },
  async openLogsDir() {
    if (!window.bloodcraft?.logs) return;
    await window.bloodcraft.logs.openDir();
  },
  async openLatestLog() {
    if (!window.bloodcraft?.logs) return;
    await window.bloodcraft.logs.openLatest();
  }
};
