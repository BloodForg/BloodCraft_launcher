import type { NewsItem, PromoItem, ServerItem } from '../types';
import servers from '../mocks/servers.mock.json';
import news from '../mocks/news.mock.json';
import promos from '../mocks/promos.mock.json';

const delay = (ms = 280) => new Promise((r) => setTimeout(r, ms));

export const contentService = {
  async getServers(): Promise<ServerItem[]> {
    await delay();
    return servers as ServerItem[];
  },

  async getServer(id: string): Promise<ServerItem | undefined> {
    await delay(180);
    return (servers as ServerItem[]).find((s) => s.id === id);
  },

  async getNews(): Promise<NewsItem[]> {
    await delay();
    return news as NewsItem[];
  },

  async getPromos(): Promise<PromoItem[]> {
    await delay();
    return promos as PromoItem[];
  }
};

// Future API endpoints:
// GET /api/servers
// GET /api/news
// GET /api/banners
