import log from 'electron-log';

const AUTH_BASE_URL = 'https://thebloodcraft.ru';
const AUTH_SERVICE_NAME = 'BloodCraft Launcher';
const AUTH_ACCOUNT_REFRESH = 'refreshToken';

export interface AuthUser {
  username: string;
  avatarUrl: string;
  email: string;
}

export interface AuthSession {
  accessToken: string;
  user: AuthUser;
}

export interface AuthErrorPayload {
  code: 'INVALID_CREDENTIALS' | 'NETWORK' | 'UNAUTHORIZED' | 'SERVER' | 'UNKNOWN';
  message: string;
}

let accessToken: string | null = null;

function normalizeUser(raw: unknown): AuthUser {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    username: String(obj.username ?? obj.nickname ?? obj.name ?? 'Player'),
    avatarUrl: String(obj.avatarUrl ?? obj.avatar ?? 'https://api.dicebear.com/8.x/shapes/svg?seed=BloodCraft'),
    email: String(obj.email ?? '')
  };
}

function unwrapData(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object') return {};
  const obj = raw as Record<string, unknown>;
  if (obj.data && typeof obj.data === 'object') {
    return obj.data as Record<string, unknown>;
  }
  return obj;
}

function extractTokens(raw: unknown): { accessToken: string; refreshToken?: string; user?: AuthUser } {
  const data = unwrapData(raw);
  const access =
    typeof data.accessToken === 'string'
      ? data.accessToken
      : typeof data.token === 'string'
        ? data.token
        : typeof data.access_token === 'string'
          ? data.access_token
          : '';

  const refresh =
    typeof data.refreshToken === 'string'
      ? data.refreshToken
      : typeof data.refresh_token === 'string'
        ? data.refresh_token
        : undefined;

  const user = data.user ? normalizeUser(data.user) : undefined;

  if (!access) {
    throw new Error('Auth response does not include access token');
  }

  return { accessToken: access, refreshToken: refresh, user };
}

async function getKeytar(): Promise<{
  getPassword(service: string, account: string): Promise<string | null>;
  setPassword(service: string, account: string, password: string): Promise<void>;
  deletePassword(service: string, account: string): Promise<boolean>;
} | null> {
  try {
    const mod = await import('keytar');
    return (mod.default ?? mod) as {
      getPassword(service: string, account: string): Promise<string | null>;
      setPassword(service: string, account: string, password: string): Promise<void>;
      deletePassword(service: string, account: string): Promise<boolean>;
    };
  } catch (error) {
    log.warn('[auth] keytar unavailable, refresh token will not persist securely', error);
    return null;
  }
}

async function setRefreshToken(token: string | null): Promise<void> {
  const keytar = await getKeytar();
  if (!keytar) return;
  if (!token) {
    await keytar.deletePassword(AUTH_SERVICE_NAME, AUTH_ACCOUNT_REFRESH);
    return;
  }
  await keytar.setPassword(AUTH_SERVICE_NAME, AUTH_ACCOUNT_REFRESH, token);
}

async function getRefreshToken(): Promise<string | null> {
  const keytar = await getKeytar();
  if (!keytar) return null;
  return keytar.getPassword(AUTH_SERVICE_NAME, AUTH_ACCOUNT_REFRESH);
}

function authErrorPayload(error: unknown): AuthErrorPayload {
  if (error && typeof error === 'object' && 'code' in error && 'message' in error) {
    const obj = error as { code: AuthErrorPayload['code']; message: string };
    return { code: obj.code, message: obj.message };
  }
  return {
    code: 'UNKNOWN',
    message: error instanceof Error ? error.message : 'Unknown auth error'
  };
}

async function fetchJson(url: string, init: RequestInit): Promise<Record<string, unknown>> {
  try {
    const response = await fetch(url, {
      ...init,
      headers: {
        'content-type': 'application/json',
        ...(init.headers ?? {})
      }
    });

    const text = await response.text();
    const parsed = text ? (JSON.parse(text) as Record<string, unknown>) : {};

    if (!response.ok) {
      const message =
        typeof parsed.message === 'string'
          ? parsed.message
          : typeof parsed.error === 'string'
            ? parsed.error
            : `${response.status} ${response.statusText}`;
      if (response.status === 401) {
        throw { code: 'INVALID_CREDENTIALS', message } satisfies AuthErrorPayload;
      }
      throw {
        code: response.status >= 500 ? 'SERVER' : 'UNAUTHORIZED',
        message
      } satisfies AuthErrorPayload;
    }

    return parsed;
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error) {
      throw error;
    }
    const message = error instanceof Error ? error.message : 'Network error';
    throw { code: 'NETWORK', message } satisfies AuthErrorPayload;
  }
}

export async function loginWithSite(login: string, password: string): Promise<AuthSession> {
  const payload = await fetchJson(`${AUTH_BASE_URL}/api/launcher/login`, {
    method: 'POST',
    body: JSON.stringify({ login, password })
  });
  const parsed = extractTokens(payload);

  accessToken = parsed.accessToken;
  await setRefreshToken(parsed.refreshToken ?? null);

  const user = parsed.user ?? (await meWithToken(parsed.accessToken));
  log.info('[auth] login success', user.username);
  return { accessToken: parsed.accessToken, user };
}

async function meWithToken(token: string): Promise<AuthUser> {
  const payload = await fetchJson(`${AUTH_BASE_URL}/api/launcher/me`, {
    method: 'GET',
    headers: {
      authorization: `Bearer ${token}`
    }
  });
  return normalizeUser(unwrapData(payload).user ?? unwrapData(payload));
}

export async function me(): Promise<AuthUser> {
  if (!accessToken) {
    throw { code: 'UNAUTHORIZED', message: 'No access token' } satisfies AuthErrorPayload;
  }
  return meWithToken(accessToken);
}

export async function refreshSession(): Promise<AuthSession> {
  const refreshToken = await getRefreshToken();
  if (!refreshToken) {
    throw { code: 'UNAUTHORIZED', message: 'No refresh token' } satisfies AuthErrorPayload;
  }

  const payload = await fetchJson(`${AUTH_BASE_URL}/api/launcher/refresh`, {
    method: 'POST',
    body: JSON.stringify({ refreshToken })
  });
  const parsed = extractTokens(payload);
  accessToken = parsed.accessToken;

  if (parsed.refreshToken && parsed.refreshToken !== refreshToken) {
    await setRefreshToken(parsed.refreshToken);
  }

  const user = parsed.user ?? (await meWithToken(parsed.accessToken));
  return { accessToken: parsed.accessToken, user };
}

export async function logoutSession(): Promise<void> {
  accessToken = null;
  await setRefreshToken(null);
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function mapAuthError(error: unknown): AuthErrorPayload {
  return authErrorPayload(error);
}
