import log from 'electron-log';

export const AUTH_BASE_URL = 'https://thebloodcraft.ru';
export const AUTH_LOGIN_URL = `${AUTH_BASE_URL}/api/launcher/login`;
export const AUTH_ME_URL = `${AUTH_BASE_URL}/api/launcher/me`;
export const AUTH_REFRESH_URL = `${AUTH_BASE_URL}/api/launcher/refresh`;
export const AUTH_HEALTH_URL = `${AUTH_BASE_URL}/api/launcher/health`;
const FALLBACK_HEALTH_URL = `${AUTH_BASE_URL}/api/health`;
const AUTH_SERVICE_NAME = 'BloodCraft Launcher';
const AUTH_ACCOUNT_REFRESH = 'refreshToken';
const FETCH_TIMEOUT_MS = 12000;

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
  code: 'INVALID_CREDENTIALS' | 'NETWORK' | 'API_NOT_FOUND' | 'SERVICE_UNAVAILABLE' | 'INVALID_RESPONSE' | 'UNAUTHORIZED' | 'UNKNOWN';
  message: string;
  status?: number;
  url?: string;
}

export interface NetworkProbe {
  ok: boolean;
  status?: number;
  url: string;
  finalUrl?: string;
  message: string;
}

export interface NetworkDiagnostics {
  ok: boolean;
  site: NetworkProbe;
  launcherApi: NetworkProbe;
  summary: string;
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
    throw {
      code: 'INVALID_RESPONSE',
      message: 'Некорректный ответ сервера: отсутствует access token'
    } satisfies AuthErrorPayload;
  }

  return { accessToken: access, refreshToken: refresh, user };
}

function bodyPreview(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, 200);
}

function classifyNetworkError(error: unknown): AuthErrorPayload {
  const message = error instanceof Error ? error.message : String(error ?? 'unknown');
  const causeCode =
    error && typeof error === 'object' && 'cause' in error && (error as { cause?: { code?: string } }).cause?.code
      ? String((error as { cause: { code: string } }).cause.code)
      : '';
  const raw = `${message} ${causeCode}`.toUpperCase();

  if (
    raw.includes('ENOTFOUND') ||
    raw.includes('EAI_AGAIN') ||
    raw.includes('ECONNREFUSED') ||
    raw.includes('ETIMEDOUT') ||
    raw.includes('TIMEOUT') ||
    raw.includes('ECONNRESET') ||
    raw.includes('CERT') ||
    raw.includes('TLS') ||
    raw.includes('SSL') ||
    raw.includes('FETCH FAILED')
  ) {
    return { code: 'NETWORK', message: 'Нет соединения' };
  }

  return { code: 'UNKNOWN', message: 'Ошибка авторизации' };
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
    const obj = error as AuthErrorPayload;
    return {
      code: obj.code,
      message: obj.message,
      status: obj.status,
      url: obj.url
    };
  }
  return classifyNetworkError(error);
}

async function fetchJson(url: string, init: RequestInit): Promise<Record<string, unknown>> {
  const method = (init.method ?? 'GET').toUpperCase();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort('timeout'), FETCH_TIMEOUT_MS);

  try {
    log.info(`[auth] request ${method} ${url}`);
    const response = await fetch(url, {
      ...init,
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        ...(init.headers ?? {})
      }
    });

    const text = await response.text();
    const preview = bodyPreview(text);
    log.info(`[auth] response ${method} ${url} -> ${response.status} final=${response.url} body="${preview}"`);

    let parsed: Record<string, unknown> = {};
    if (text) {
      try {
        parsed = JSON.parse(text) as Record<string, unknown>;
      } catch {
        throw {
          code: 'INVALID_RESPONSE',
          message: 'Некорректный ответ сервера',
          status: response.status,
          url: response.url
        } satisfies AuthErrorPayload;
      }
    }

    if (!response.ok) {
      const backendMessage =
        typeof parsed.message === 'string'
          ? parsed.message
          : typeof parsed.error === 'string'
            ? parsed.error
            : `${response.status} ${response.statusText}`;

      if (response.status === 401 || response.status === 403) {
        throw { code: 'INVALID_CREDENTIALS', message: 'Неверный логин или пароль', status: response.status, url: response.url } satisfies AuthErrorPayload;
      }
      if (response.status === 404) {
        throw {
          code: 'API_NOT_FOUND',
          message: 'API авторизации не найдено (неверный путь)',
          status: response.status,
          url: response.url
        } satisfies AuthErrorPayload;
      }
      if (response.status >= 500) {
        throw {
          code: 'SERVICE_UNAVAILABLE',
          message: 'Сервис временно недоступен',
          status: response.status,
          url: response.url
        } satisfies AuthErrorPayload;
      }

      throw {
        code: 'UNAUTHORIZED',
        message: backendMessage || 'Ошибка авторизации',
        status: response.status,
        url: response.url
      } satisfies AuthErrorPayload;
    }

    return parsed;
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error) {
      log.warn(`[auth] error ${method} ${url}`, error);
      throw error;
    }

    const mapped = classifyNetworkError(error);
    log.warn(`[auth] network/unknown error ${method} ${url}`, { mapped, error: String(error) });
    throw mapped;
  } finally {
    clearTimeout(timer);
  }
}

async function probeUrl(url: string): Promise<NetworkProbe> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort('timeout'), 8000);
  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: { accept: 'application/json,text/plain,*/*' }
    });
    const ok = response.status >= 200 && response.status < 400;
    const message = ok ? 'OK' : response.status === 404 ? 'API не настроено (404)' : response.status >= 500 ? 'Сервис недоступен (5xx)' : `HTTP ${response.status}`;
    log.info(`[network] probe ${url} -> ${response.status} final=${response.url}`);
    return { ok, status: response.status, url, finalUrl: response.url, message };
  } catch (error) {
    const mapped = classifyNetworkError(error);
    log.warn(`[network] probe failed ${url}`, { mapped, error: String(error) });
    return { ok: false, url, message: mapped.code === 'NETWORK' ? 'Нет соединения' : 'Ошибка сети' };
  } finally {
    clearTimeout(timer);
  }
}

export async function runNetworkDiagnostics(): Promise<NetworkDiagnostics> {
  const site = await probeUrl(AUTH_BASE_URL);
  let launcherApi = await probeUrl(AUTH_HEALTH_URL);

  if (!launcherApi.ok && launcherApi.status === 404) {
    const fallback = await probeUrl(FALLBACK_HEALTH_URL);
    if (fallback.ok) {
      launcherApi = {
        ...fallback,
        url: AUTH_HEALTH_URL,
        message: 'launcher health отсутствует, fallback /api/health доступен'
      };
    }
  }

  const ok = site.ok && launcherApi.ok;
  const summary = ok
    ? 'Соединение в порядке'
    : !site.ok
      ? site.message
      : launcherApi.status === 404
        ? 'API не настроено (404)'
        : launcherApi.status && launcherApi.status >= 500
          ? 'Сервис авторизации недоступен'
          : launcherApi.message;

  log.info('[network] diagnostics summary', { ok, summary, site, launcherApi });
  return { ok, site, launcherApi, summary };
}

export async function loginWithSite(login: string, password: string): Promise<AuthSession> {
  const payload = await fetchJson(AUTH_LOGIN_URL, {
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
  const payload = await fetchJson(AUTH_ME_URL, {
    method: 'GET',
    headers: {
      authorization: `Bearer ${token}`
    }
  });
  return normalizeUser(unwrapData(payload).user ?? unwrapData(payload));
}

export async function me(): Promise<AuthUser> {
  if (!accessToken) {
    throw { code: 'UNAUTHORIZED', message: 'Нет активной сессии' } satisfies AuthErrorPayload;
  }
  return meWithToken(accessToken);
}

export async function refreshSession(): Promise<AuthSession> {
  const refreshToken = await getRefreshToken();
  if (!refreshToken) {
    throw { code: 'UNAUTHORIZED', message: 'Нет refresh token' } satisfies AuthErrorPayload;
  }

  const payload = await fetchJson(AUTH_REFRESH_URL, {
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

export function mapAuthError(error: unknown): AuthErrorPayload {
  return authErrorPayload(error);
}

export async function devSelfCheck(): Promise<void> {
  const diagnostics = await runNetworkDiagnostics();
  log.info('[dev-self-check] auth/network', diagnostics);
}
