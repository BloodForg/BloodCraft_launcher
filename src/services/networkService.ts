export type NetworkDiagnostics = {
  ok: boolean;
  summary: string;
  site: { ok: boolean; status?: number; url: string; finalUrl?: string; message: string };
  launcherApi: { ok: boolean; status?: number; url: string; finalUrl?: string; message: string };
};

const fallback: NetworkDiagnostics = {
  ok: navigator.onLine,
  summary: navigator.onLine ? 'Сеть в порядке' : 'Нет соединения',
  site: { ok: navigator.onLine, url: 'https://thebloodcraft.ru', message: navigator.onLine ? 'OK' : 'Нет соединения' },
  launcherApi: {
    ok: navigator.onLine,
    url: 'https://thebloodcraft.ru/api/launcher/health',
    message: navigator.onLine ? 'Статус API неизвестен' : 'Нет соединения'
  }
};

export const networkService = {
  async checkOnline(): Promise<NetworkDiagnostics> {
    if (!window.bloodcraft?.network?.check) return fallback;
    return window.bloodcraft.network.check();
  },
  async diagnose(): Promise<NetworkDiagnostics> {
    if (!window.bloodcraft?.network?.diagnose) return fallback;
    return window.bloodcraft.network.diagnose();
  }
};
