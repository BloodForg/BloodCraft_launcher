export type TabKey = 'home' | 'servers' | 'downloads' | 'profile' | 'settings';

export type ServerStatus = 'Online' | 'Offline' | 'Maintenance';

export interface ServerItem {
  id: string;
  name: string;
  shortDesc: string;
  longDesc: string;
  status: ServerStatus;
  bannerUrl: string;
  version: string;
  tags: string[];
  playersOnline: number;
  maxPlayers: number;
  pingMs: number;
  disabled?: boolean;
  soonLabel?: string;
}

export interface NewsItem {
  id: string;
  title: string;
  excerpt: string;
  bannerUrl: string;
  date: string;
}

export interface PromoItem {
  id: string;
  title: string;
  text: string;
  bannerUrl: string;
  linkUrl: string;
}

export interface User {
  username: string;
  avatarUrl: string;
  email: string;
}

export interface DownloadTask {
  id: string;
  title: string;
  status: 'downloading' | 'verifying' | 'paused' | 'completed';
  progress: number;
}

export interface AuthResponse {
  accessToken: string;
  user: User;
}

export interface GameProfile {
  id: string;
  name: string;
  minecraftVersion: string;
  modsSummary: string;
  jvmArgs: string;
}
