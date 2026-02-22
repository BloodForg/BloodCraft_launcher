export const networkService = {
  async checkOnline(): Promise<boolean> {
    if (!window.bloodcraft?.network) return navigator.onLine;
    return window.bloodcraft.network.check();
  }
};
