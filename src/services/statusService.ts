import type { ServerItem } from '../types';
import servers from '../mocks/servers.mock.json';

const delay = (ms = 220) => new Promise((r) => setTimeout(r, ms));

export const statusService = {
  async getServerStatus() {
    await delay();

    const all = servers as ServerItem[];
    const online = all.filter((s) => s.status === 'Online').reduce((acc, s) => acc + s.playersOnline, 0);

    return {
      totalOnline: online,
      popular: all
        .filter((s) => s.status === 'Online')
        .sort((a, b) => b.playersOnline - a.playersOnline)
        .slice(0, 3),
      updatedAt: Date.now()
    };
  }
};

// Future API endpoint:
// GET /api/status/servers
