import type { AuthResponse, User } from '../types';

export type AuthErrorCode =
  | 'INVALID_CREDENTIALS'
  | 'NETWORK'
  | 'API_NOT_FOUND'
  | 'SERVICE_UNAVAILABLE'
  | 'INVALID_RESPONSE'
  | 'UNAUTHORIZED'
  | 'UNKNOWN';

export class AuthUiError extends Error {
  code: AuthErrorCode;

  constructor(code: AuthErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

const friendlyMessage = (code?: AuthErrorCode, fallback?: string): string => {
  if (code === 'INVALID_CREDENTIALS' || code === 'UNAUTHORIZED') return 'Неверный логин или пароль';
  if (code === 'NETWORK') return 'Нет соединения';
  if (code === 'API_NOT_FOUND') return 'Сервис авторизации не найден';
  if (code === 'SERVICE_UNAVAILABLE') return 'Сервис временно недоступен';
  if (code === 'INVALID_RESPONSE') return 'Некорректный ответ сервера';
  return fallback || 'Ошибка авторизации';
};

function ensureAuthApi() {
  if (!window.bloodcraft?.auth) {
    throw new AuthUiError('UNKNOWN', 'API авторизации недоступен');
  }
  return window.bloodcraft.auth;
}

export const authService = {
  async login(login: string, password: string): Promise<AuthResponse> {
    if (!login || !password) {
      throw new AuthUiError('UNKNOWN', 'Введите логин и пароль');
    }

    const auth = ensureAuthApi();
    const result = await auth.login(login, password);
    if (!result.ok) {
      throw new AuthUiError(result.error.code, friendlyMessage(result.error.code, result.error.message));
    }

    return {
      accessToken: result.session.accessToken,
      user: result.session.user
    };
  },

  async refresh(): Promise<AuthResponse> {
    const auth = ensureAuthApi();
    const result = await auth.refresh();
    if (!result.ok) {
      throw new AuthUiError(result.error.code, friendlyMessage(result.error.code, result.error.message));
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
    const auth = ensureAuthApi();
    const result = await auth.me();
    if (!result.ok) {
      throw new AuthUiError(result.error.code, friendlyMessage(result.error.code, result.error.message));
    }

    return result.user;
  }
};
