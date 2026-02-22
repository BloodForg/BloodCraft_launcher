import type { ServerItem } from '../types';
import { contentService } from './contentService';

const devServers: ServerItem[] = [
  {
    id: 'dev-tech',
    name: 'Tech Realm',
    shortDesc: 'Разработка',
    longDesc: 'Сервер в активной разработке. Скоро станет доступен.',
    status: 'Maintenance',
    bannerUrl: 'https://images.unsplash.com/photo-1617886322168-72b886573c6f?auto=format&fit=crop&w=1200&q=80',
    version: '1.21.11',
    tags: ['Разработка'],
    playersOnline: 0,
    maxPlayers: 300,
    pingMs: 0,
    disabled: true,
    soonLabel: 'Скоро'
  },
  {
    id: 'dev-events',
    name: 'Events',
    shortDesc: 'Разработка',
    longDesc: 'Ивентовый сервер готовится к запуску.',
    status: 'Maintenance',
    bannerUrl: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=1200&q=80',
    version: '1.21.11',
    tags: ['Разработка'],
    playersOnline: 0,
    maxPlayers: 300,
    pingMs: 0,
    disabled: true,
    soonLabel: 'Скоро'
  },
  {
    id: 'dev-hardcore',
    name: 'Hardcore',
    shortDesc: 'Разработка',
    longDesc: 'Режим Hardcore находится в разработке.',
    status: 'Maintenance',
    bannerUrl: 'https://images.unsplash.com/photo-1493711662062-fa541adb3fc8?auto=format&fit=crop&w=1200&q=80',
    version: '1.21.11',
    tags: ['Разработка'],
    playersOnline: 0,
    maxPlayers: 300,
    pingMs: 0,
    disabled: true,
    soonLabel: 'Скоро'
  }
];

export const serverService = {
  async getLauncherServers(): Promise<ServerItem[]> {
    const base = await contentService.getServers();
    const primary = base[0] ? [{ ...base[0], disabled: false }] : [];
    return [...primary, ...devServers];
  }
};
