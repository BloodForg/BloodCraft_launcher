import type { AuthResponse, User } from '../types';

const friendlyMessage = (code?: string, fallback?: string): string => {
  if (code === 'INVALID_CREDENTIALS' || code === 'UNAUTHORIZED') return 'Неверный логин или пароль';
  if (code === 'NETWORK') return 'Нет соединения';
  return fallback || 'Ошибка авторизации';
};

export const authService = {
  async login(login: string, password: string): Promise<AuthResponse> {
    if (!login || !password) {
      throw new Error('Введите логин и пароль');
    }
    if (!window.bloodcraft?.auth) {
      throw new Error('API авторизации недоступен');
    }

    const result = await window.bloodcraft.auth.login(login, password);
    if (!result.ok) {
      throw new Error(friendlyMessage(result.error.code, result.error.message));
    }

    return {
      accessToken: result.session.accessToken,
      user: result.session.user
    };
  },

  async refresh(): Promise<AuthResponse> {
    if (!window.bloodcraft?.auth) {
      throw new Error('API авторизации недоступен');
    }

    const result = await window.bloodcraft.auth.refresh();
    if (!result.ok) {
      throw new Error(friendlyMessage(result.error.code, result.error.message));
    }

    return {
      accessToken: result.session.accessToken,
      user: result.session.user
    };
  },

  async logout(): Promise<void> {
    if (!window.bloodcraft?.auth) return;
    await window.bloodcraft.auth.logout();
  },

  async me(): Promise<User> {
    if (!window.bloodcraft?.auth) {
      throw new Error('API авторизации недоступен');
    }

    const result = await window.bloodcraft.auth.me();
    if (!result.ok) {
      throw new Error(friendlyMessage(result.error.code, result.error.message));
    }

    return result.user;
  }
};
