import { app, BrowserWindow, ipcMain, shell } from 'electron';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { promises as fs, constants as fsConstants } from 'node:fs';
import { createReadStream, createWriteStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { spawn } from 'node:child_process';
import log from 'electron-log';
import axios from 'axios';
import { fetchDistribution, getStatus, install, launch } from './launcher/index.js';
import type { InstallProgress } from './launcher/types.js';
import { devSelfCheck, fetchJoinTokenForLaunch, loginWithSite, logoutSession, mapAuthError, me, refreshSession, runNetworkDiagnostics, setAccessTokenForOps, verifyJoinTokenPreflight } from './authService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDev = !app.isPackaged;
let mainWindow: BrowserWindow | null = null;
let lastLauncherError: string | undefined;
let installInProgress = false;
let isQuitting = false;

const PROGRESS_THROTTLE_MS = 120;
const UPDATE_MANIFEST_URL = 'https://thebloodcraft.ru/launcher/updates/latest.json';
const UPDATE_DOWNLOAD_DIR = path.join(os.homedir(), 'Library', 'Application Support', 'BloodCraft', 'updates');
const UPDATER_LOG_PATH = path.join(os.homedir(), 'Library', 'Logs', 'bloodcraft-launcher', 'updater.log');
const MAC_APP_BACKUP_PATH = '/Applications/BloodCraft.app.backup';
const EXPECTED_VERSION_PATH = path.join(os.homedir(), 'Library', 'Application Support', 'BloodCraft', 'updates', 'expected-version.txt');

type CustomUpdateStatus = 'idle' | 'checking' | 'update_available' | 'downloading' | 'downloaded' | 'installing' | 'restarting' | 'error';

type LatestManifest = {
  version: string;
  url: string;
  sha256: string;
  minBootstrapVersion?: string;
};

type InstallUpdateResult = {
  ok: boolean;
  reason?: 'permission-denied' | 'not-downloaded' | 'spawn-failed' | 'unknown';
};

let updaterState: {
  status: CustomUpdateStatus;
  message?: string;
  progress?: number;
  version?: string;
  filePath?: string;
} = { status: 'idle' };

let latestManifest: LatestManifest | null = null;
let downloadedZipPath: string | null = null;
let lastProgressAt = 0;
let queuedProgress: InstallProgress | null = null;
let progressTimer: NodeJS.Timeout | null = null;

function parseVersion(version: string): number[] {
  return version
    .split('.')
    .map((part) => Number.parseInt(part, 10))
    .map((part) => (Number.isFinite(part) ? part : 0));
}

function compareVersions(left: string, right: string): number {
  const l = parseVersion(left);
  const r = parseVersion(right);
  const max = Math.max(l.length, r.length);
  for (let i = 0; i < max; i += 1) {
    const lv = l[i] ?? 0;
    const rv = r[i] ?? 0;
    if (lv > rv) return 1;
    if (lv < rv) return -1;
  }
  return 0;
}

function toErrorDetails(error: unknown): {
  message: string;
  name: string;
  stack?: string;
  cause?: unknown;
  raw?: unknown;
} {
  if (error instanceof Error) {
    return {
      message: error.message,
      name: error.name,
      stack: error.stack,
      cause: (error as Error & { cause?: unknown }).cause
    };
  }

  if (error && typeof error === 'object') {
    const candidate = error as { message?: unknown; name?: unknown; stack?: unknown; cause?: unknown };
    return {
      message: typeof candidate.message === 'string' ? candidate.message : JSON.stringify(error),
      name: typeof candidate.name === 'string' ? candidate.name : 'NonErrorThrow',
      stack: typeof candidate.stack === 'string' ? candidate.stack : undefined,
      cause: candidate.cause,
      raw: error
    };
  }

  return {
    message: String(error ?? 'Unknown error'),
    name: 'UnknownError',
    raw: error
  };
}

async function appendUpdaterLog(message: string, extra?: Record<string, unknown>): Promise<void> {
  try {
    await fs.mkdir(path.dirname(UPDATER_LOG_PATH), { recursive: true });
    const line = `[${new Date().toISOString()}] ${message}${extra ? ` ${JSON.stringify(extra)}` : ''}\n`;
    await fs.appendFile(UPDATER_LOG_PATH, line, 'utf8');
  } catch (error) {
    log.warn('[custom-updater] failed to write updater log', error);
  }
}

function setUpdaterState(patch: Partial<typeof updaterState>) {
  updaterState = { ...updaterState, ...patch };
  mainWindow?.webContents.send('updater:status', updaterState);
}

function flushProgress(force = false) {
  if (!mainWindow || !queuedProgress) return;
  if (!force && Date.now() - lastProgressAt < PROGRESS_THROTTLE_MS) return;
  mainWindow.webContents.send('launcher:progress', queuedProgress);
  mainWindow.webContents.send('game:progress', queuedProgress);
  const statusMessage = queuedProgress.message ?? queuedProgress.stage;
  mainWindow.webContents.send('game:status', { stage: queuedProgress.stage, message: statusMessage, percent: queuedProgress.percent });
  if (queuedProgress.stage === 'error') {
    mainWindow.webContents.send('game:error', { code: 'GAME_ERROR', message: statusMessage });
  }
  queuedProgress = null;
  lastProgressAt = Date.now();
}

function emitProgress(progress: InstallProgress) {
  const terminal = progress.stage === 'done' || progress.stage === 'error';
  queuedProgress = progress;

  if (terminal) {
    if (progressTimer) {
      clearTimeout(progressTimer);
      progressTimer = null;
    }
    flushProgress(true);
    return;
  }

  flushProgress(false);
  if (!progressTimer) {
    progressTimer = setTimeout(() => {
      progressTimer = null;
      flushProgress(true);
    }, PROGRESS_THROTTLE_MS);
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 980,
    minHeight: 680,
    title: 'BloodCraft Launcher',
    backgroundColor: '#0B0D10',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (isDev) {
    win.loadURL('http://localhost:5173');
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  win.on('closed', () => {
    if (mainWindow === win) {
      mainWindow = null;
    }
  });

  win.on('close', () => {
    if (isQuitting) {
      log.info('[window] close allowed (quitting)');
      return;
    }
    log.info('[window] close requested');
  });

  return win;
}

function sanitizeFileName(url: string): string {
  try {
    const parsed = new URL(url);
    const base = path.basename(parsed.pathname);
    return base || 'BloodCraft-mac.zip';
  } catch {
    return 'BloodCraft-mac.zip';
  }
}

async function hashFileSha256(filePath: string): Promise<string> {
  const hash = createHash('sha256');
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve());
  });
  return hash.digest('hex');
}

async function cleanupBackupAfterSuccessfulStart(): Promise<void> {
  if (process.platform !== 'darwin') return;
  if (!process.execPath.includes('/Applications/BloodCraft.app/')) return;

  try {
    await fs.access(MAC_APP_BACKUP_PATH);
  } catch {
    return;
  }

  let expectedVersion = '';
  try {
    expectedVersion = (await fs.readFile(EXPECTED_VERSION_PATH, 'utf8')).trim();
  } catch {
    expectedVersion = '';
  }

  const launchedVersion = app.getVersion();
  await appendUpdaterLog('launchedVersion', { launchedVersion });
  log.info('[custom-updater] post-update proof', { expectedVersion, launchedVersion });

  if (!expectedVersion || expectedVersion !== launchedVersion) {
    await appendUpdaterLog('backup_cleanup_skipped', {
      reason: 'version_mismatch_or_missing_expected',
      expectedVersion,
      launchedVersion
    });
    await appendUpdaterLog('backupCleanupSuccess', { ok: false, reason: 'version_mismatch_or_missing_expected' });
    return;
  }

  try {
    await fs.rm(MAC_APP_BACKUP_PATH, { recursive: true, force: true });
    await fs.rm(EXPECTED_VERSION_PATH, { force: true });
    log.info('[custom-updater] backup removed after successful app start', { backupPath: MAC_APP_BACKUP_PATH, expectedVersion, launchedVersion });
    await appendUpdaterLog('backup_removed_after_successful_start', { backupPath: MAC_APP_BACKUP_PATH, expectedVersion, launchedVersion });
    await appendUpdaterLog('backupCleanupSuccess', { ok: true });
  } catch (error) {
    const details = toErrorDetails(error);
    log.warn('[custom-updater] failed to remove backup after startup', { backupPath: MAC_APP_BACKUP_PATH, error: details.message });
    await appendUpdaterLog('backup_remove_failed', { backupPath: MAC_APP_BACKUP_PATH, error: details.message });
    await appendUpdaterLog('backupCleanupSuccess', { ok: false, reason: details.message });
  }
}

async function checkForCustomUpdate(): Promise<{ ok: boolean; available: boolean }> {
  setUpdaterState({ status: 'checking', message: 'Проверка обновлений...' });
  log.info('[custom-updater] check started', { currentVersion: app.getVersion(), url: UPDATE_MANIFEST_URL });
  await appendUpdaterLog('checking_for_update', { currentVersion: app.getVersion(), url: UPDATE_MANIFEST_URL });

  try {
    const response = await axios.get<LatestManifest>(UPDATE_MANIFEST_URL, {
      timeout: 15000,
      validateStatus: () => true
    });

    if (response.status !== 200 || !response.data?.version || !response.data?.url || !response.data?.sha256) {
      throw new Error(`Bad latest.json response status=${response.status}`);
    }

    const manifest = response.data;
    const resolvedUrl = new URL(manifest.url, UPDATE_MANIFEST_URL).toString();
    latestManifest = { ...manifest, url: resolvedUrl };

    const cmp = compareVersions(manifest.version, app.getVersion());
    if (cmp <= 0) {
      setUpdaterState({ status: 'idle', message: 'У вас последняя версия', version: app.getVersion(), progress: 0 });
      log.info('[custom-updater] no update', { latestVersion: manifest.version });
      await appendUpdaterLog('no_update_available', { latestVersion: manifest.version });
      return { ok: true, available: false };
    }

    setUpdaterState({
      status: 'update_available',
      message: `Доступно обновление ${manifest.version}`,
      version: manifest.version,
      progress: 0
    });
    log.info('[custom-updater] update found', { latestVersion: manifest.version, url: resolvedUrl });
    await appendUpdaterLog('update_available', { latestVersion: manifest.version, url: resolvedUrl });
    return { ok: true, available: true };
  } catch (error) {
    const details = toErrorDetails(error);
    setUpdaterState({ status: 'error', message: `Ошибка проверки обновлений: ${details.message}` });
    await appendUpdaterLog('check_failed', { error: details.message });
    return { ok: false, available: false };
  }
}

async function downloadCustomUpdate(): Promise<boolean> {
  if (!latestManifest) {
    const checked = await checkForCustomUpdate();
    if (!checked.available) return false;
  }

  if (!latestManifest) return false;

  await fs.mkdir(UPDATE_DOWNLOAD_DIR, { recursive: true });
  const fileName = sanitizeFileName(latestManifest.url);
  const finalPath = path.join(UPDATE_DOWNLOAD_DIR, fileName);
  const tempPath = `${finalPath}.part`;

  setUpdaterState({ status: 'downloading', message: 'Скачивание обновления...', progress: 0, version: latestManifest.version });
  log.info('[custom-updater] download started', { version: latestManifest.version, url: latestManifest.url, fileName });
  await appendUpdaterLog('download_start', { version: latestManifest.version, url: latestManifest.url, fileName });

  try {
    const response = await axios.get(latestManifest.url, {
      responseType: 'stream',
      timeout: 600000,
      validateStatus: () => true
    });

    if (response.status !== 200) {
      throw new Error(`Download failed status=${response.status}`);
    }

    const totalBytes = Number(response.headers['content-length'] ?? 0);
    let downloadedBytes = 0;

    response.data.on('data', (chunk: Buffer) => {
      downloadedBytes += chunk.length;
      if (totalBytes > 0) {
        const percent = Math.min(100, Math.round((downloadedBytes / totalBytes) * 100));
        setUpdaterState({ status: 'downloading', progress: percent, message: `Скачивание обновления ${percent}%` });
      }
    });

    await pipeline(response.data, createWriteStream(tempPath));
    log.info('[custom-updater] download finished', { path: tempPath });

    const actualHash = (await hashFileSha256(tempPath)).toLowerCase();
    const expectedHash = latestManifest.sha256.toLowerCase();
    if (actualHash !== expectedHash) {
      await fs.rm(tempPath, { force: true });
      throw new Error(`SHA256 mismatch expected=${expectedHash} actual=${actualHash}`);
    }
    log.info('[custom-updater] hash verified', { sha256: actualHash });

    await fs.rename(tempPath, finalPath);

    downloadedZipPath = finalPath;
    setUpdaterState({
      status: 'downloaded',
      message: 'Обновление скачано',
      progress: 100,
      version: latestManifest.version,
      filePath: finalPath
    });
    await appendUpdaterLog('download_ok', { version: latestManifest.version, path: finalPath, sha256: actualHash });
    return true;
  } catch (error) {
    const details = toErrorDetails(error);
    setUpdaterState({ status: 'error', message: `Ошибка загрузки обновления: ${details.message}` });
    await appendUpdaterLog('download_failed', { error: details.message });
    await fs.rm(tempPath, { force: true }).catch(() => undefined);
    return false;
  }
}

async function installCustomUpdate(): Promise<InstallUpdateResult> {
  if (!downloadedZipPath) {
    setUpdaterState({ status: 'error', message: 'Обновление не скачано' });
    return { ok: false, reason: 'not-downloaded' };
  }

  setUpdaterState({ status: 'installing', message: 'Подготовка установки обновления...' });
  const expectedVersion = latestManifest?.version ?? '';
  await appendUpdaterLog('install_start', { zip: downloadedZipPath, expectedVersion });

  try {
    await fs.mkdir(path.dirname(EXPECTED_VERSION_PATH), { recursive: true });
    await fs.writeFile(EXPECTED_VERSION_PATH, expectedVersion, 'utf8');
    await fs.access('/Applications', fsConstants.W_OK);
  } catch {
    const message = 'Не удалось установить обновление: нет прав на запись в /Applications.';
    setUpdaterState({ status: 'error', message });
    await appendUpdaterLog('install_failed_permission_denied', { dir: '/Applications', expectedVersion });
    return { ok: false, reason: 'permission-denied' };
  }

  try {
    const packagedScript = path.join(process.resourcesPath, 'updater.sh');
    const devScript = path.join(process.cwd(), 'build-resources', 'updater.sh');
    const scriptPath = app.isPackaged ? packagedScript : devScript;

    await fs.access(scriptPath);

    const child = spawn('/bin/bash', [scriptPath, downloadedZipPath, expectedVersion], {
      detached: true,
      stdio: 'ignore'
    });
    child.unref();

    setUpdaterState({ status: 'restarting', message: 'Перезапуск лаунчера...' });
    log.info('[custom-updater] updater spawned', { scriptPath, pid: child.pid, expectedVersion });
    await appendUpdaterLog('expectedVersion', { expectedVersion });
    await appendUpdaterLog('install_spawned', { scriptPath, pid: child.pid, expectedVersion });

    log.info('[custom-updater] app quitting for custom update');
    isQuitting = true;
    app.quit();
    return { ok: true };
  } catch (error) {
    const details = toErrorDetails(error);
    setUpdaterState({ status: 'error', message: `Ошибка установки обновления: ${details.message}` });
    await appendUpdaterLog('install_failed', { error: details.message });
    return { ok: false, reason: 'spawn-failed' };
  }
}

async function runHeadlessSelfcheck(): Promise<void> {
  const accessToken = (process.env.BLOODCRAFT_TEST_ACCESS_TOKEN || '').trim();
  const username = (process.env.BLOODCRAFT_TEST_USERNAME || 'BloodForg').trim();
  const uuid = (process.env.BLOODCRAFT_TEST_UUID || '05e43929-3af9-33de-90cd-5be2611720b7').trim();

  if (!accessToken) {
    throw new Error('BLOODCRAFT_TEST_ACCESS_TOKEN is required for headless selfcheck');
  }

  log.info('[selfcheck] headless selfcheck started');
  setAccessTokenForOps(accessToken);

  const diagnostics = await runNetworkDiagnostics();
  log.info('[selfcheck] network diagnostics', diagnostics);
  if (!diagnostics.ok) {
    throw new Error(`Selfcheck failed: ${diagnostics.summary}`);
  }

  const preflightToken = await fetchJoinTokenForLaunch();
  await verifyJoinTokenPreflight(preflightToken.token);

  const launchToken = await fetchJoinTokenForLaunch();
  log.info('[selfcheck] launch token ready', {
    tokenLen: launchToken.token.length,
    expiresIn: launchToken.expiresIn
  });

  await install((progress) => {
    log.info('[selfcheck] install progress', progress);
  });

  await launch((progress) => {
    log.info('[selfcheck] launch progress', progress);
  }, {
    username,
    uuid,
    joinToken: launchToken.token
  });

  log.info('[selfcheck] launch invoked successfully');
  await new Promise((resolve) => setTimeout(resolve, 45000));
  log.info('[selfcheck] post-launch wait finished');
}

app.whenReady().then(async () => {
  log.transports.file.level = 'info';
  log.info('[main] app ready');
  log.info('APP VERSION:', app.getVersion());
  await appendUpdaterLog(`launcher_started version=${app.getVersion()}`, { appVersion: app.getVersion(), execPath: process.execPath });
  await cleanupBackupAfterSuccessfulStart();

  if (isDev) {
    void devSelfCheck();
  }

  if (process.env.BLOODCRAFT_HEADLESS_SELFCHECK === '1') {
    try {
      await runHeadlessSelfcheck();
      app.exit(0);
    } catch (error) {
      const details = toErrorDetails(error);
      log.error('[selfcheck] failed', details);
      app.exit(1);
    }
    return;
  }

  ipcMain.handle('shell:openExternal', async (_event, url: string) => {
    await shell.openExternal(url);
    return true;
  });

  ipcMain.handle('network:check', async () => {
    try {
      return await runNetworkDiagnostics();
    } catch (error) {
      log.warn('[network] health check failed', error);
      return {
        ok: false,
        summary: 'Нет соединения',
        site: { ok: false, url: 'https://thebloodcraft.ru', message: 'Нет соединения' },
        launcherApi: { ok: false, url: 'https://thebloodcraft.ru/api/launcher/health', message: 'Нет соединения' }
      };
    }
  });

  ipcMain.handle('network:diagnose', async () => runNetworkDiagnostics());

  ipcMain.handle('auth:login', async (_event, login: string, password: string) => {
    try {
      return { ok: true, session: await loginWithSite(login, password) };
    } catch (error) {
      const mapped = mapAuthError(error);
      log.warn('[auth] login failed', mapped);
      return { ok: false, error: mapped };
    }
  });

  ipcMain.handle('auth:me', async () => {
    try {
      return { ok: true, user: await me() };
    } catch (error) {
      const mapped = mapAuthError(error);
      log.warn('[auth] me failed', mapped);
      return { ok: false, error: mapped };
    }
  });

  ipcMain.handle('auth:refresh', async () => {
    try {
      return { ok: true, session: await refreshSession() };
    } catch (error) {
      const mapped = mapAuthError(error);
      log.warn('[auth] refresh failed', mapped);
      return { ok: false, error: mapped };
    }
  });

  ipcMain.handle('auth:logout', async () => {
    try {
      await logoutSession();
      return { ok: true };
    } catch (error) {
      const mapped = mapAuthError(error);
      log.warn('[auth] logout failed', mapped);
      return { ok: false, error: mapped };
    }
  });

  ipcMain.handle('logger:info', async (_event, message: string) => {
    log.info('[renderer]', message);
    return true;
  });

  ipcMain.handle('logger:error', async (_event, message: string) => {
    log.error('[renderer]', message);
    return true;
  });

  ipcMain.handle('logs:openDir', async () => {
    const logsDir = path.join(app.getPath('userData'), 'logs');
    await fs.mkdir(logsDir, { recursive: true });
    await shell.openPath(logsDir);
    return logsDir;
  });

  ipcMain.handle('logs:openLatest', async () => {
    const logPath = log.transports.file.getFile().path;
    await shell.openPath(logPath);
    return logPath;
  });

  ipcMain.handle('logs:openLatestMinecraft', async () => {
    const logsDir = path.join(app.getPath('userData'), 'logs');
    await fs.mkdir(logsDir, { recursive: true });
    const entries = await fs.readdir(logsDir, { withFileTypes: true });
    const minecraftLogs = entries
      .filter((entry) => entry.isFile() && /^minecraft-\d+\.log$/.test(entry.name))
      .map((entry) => entry.name)
      .sort((a, b) => Number(b.match(/\d+/)?.[0] ?? 0) - Number(a.match(/\d+/)?.[0] ?? 0));
    const latest = minecraftLogs[0];
    if (!latest) {
      await shell.openPath(logsDir);
      return logsDir;
    }
    const latestPath = path.join(logsDir, latest);
    await shell.openPath(latestPath);
    return latestPath;
  });

  ipcMain.handle('updater:getStatus', async () => updaterState);
  ipcMain.handle('updater:checkForUpdate', async () => checkForCustomUpdate());
  ipcMain.handle('updater:downloadUpdate', async () => downloadCustomUpdate());
  ipcMain.handle('updater:installUpdate', async () => installCustomUpdate());

  ipcMain.handle('updater:check', async () => checkForCustomUpdate());
  ipcMain.handle('updater:download', async () => downloadCustomUpdate());
  ipcMain.handle('updater:restart', async () => installCustomUpdate());

  ipcMain.handle('updater:openUpdateFolder', async () => {
    await fs.mkdir(UPDATE_DOWNLOAD_DIR, { recursive: true });
    await shell.openPath(UPDATE_DOWNLOAD_DIR);
    return UPDATE_DOWNLOAD_DIR;
  });

  ipcMain.handle('updater:logPath', async () => UPDATER_LOG_PATH);

  ipcMain.handle('app:quit', async () => {
    log.info('[app] quit requested from renderer');
    isQuitting = true;
    app.quit();
    return true;
  });

  ipcMain.handle('launcher:getStatus', async () => {
    try {
      const status = await getStatus();
      return { ...status, lastError: lastLauncherError ?? status.lastError };
    } catch (error) {
      lastLauncherError = error instanceof Error ? error.message : 'Unknown launcher:getStatus error';
      return {
        instanceDir: '',
        javaOk: false,
        lastError: lastLauncherError
      };
    }
  });

  ipcMain.handle('launcher:install', async () => {
    log.info('[ipc] launcher:install invoked');
    if (installInProgress) {
      log.info('[ipc] launcher:install skipped: already in progress');
      return false;
    }

    installInProgress = true;
    lastLauncherError = undefined;

    try {
      await install((progress: InstallProgress) => emitProgress(progress));
      log.info('[ipc] launcher:install completed');
      return true;
    } catch (error) {
      lastLauncherError = error instanceof Error ? error.message : 'Unknown launcher:install error';
      log.error('[ipc] launcher:install failed', { error: lastLauncherError });
      emitProgress({ stage: 'error', message: lastLauncherError });
      return false;
    } finally {
      installInProgress = false;
    }
  });

  ipcMain.handle('launcher:launch', async (_event, options?: { javaPath?: string; minMemoryGb?: number; maxMemoryGb?: number; username?: string; uuid?: string }) => {
    log.info('[ipc] launcher:launch invoked', options ?? {});
    try {
      const diagnostics = await runNetworkDiagnostics();
      if (!diagnostics.ok) {
        throw new Error(`Selfcheck failed: ${diagnostics.summary}`);
      }

      const preflightToken = await fetchJoinTokenForLaunch();
      await verifyJoinTokenPreflight(preflightToken.token);

      const joinToken = await fetchJoinTokenForLaunch();
      log.info('[ipc] launcher:launch auth ready', {
        preflightTokenLen: preflightToken.token.length,
        joinTokenExpiresIn: joinToken.expiresIn,
        hasJoinToken: Boolean(joinToken.token)
      });

      await launch((progress: InstallProgress) => emitProgress(progress), {
        ...options,
        joinToken: joinToken.token
      });
      mainWindow?.webContents.send('game:launched', { ok: true, message: 'Minecraft process started' });
      log.info('[ipc] launcher:launch completed');
      return true;
    } catch (error) {
      const details = toErrorDetails(error);
      lastLauncherError = details.message;
      log.error('[ipc] launcher:launch failed', {
        message: details.message,
        name: details.name,
        stack: details.stack,
        cause: details.cause,
        raw: details.raw,
        options
      });
      emitProgress({ stage: 'error', message: lastLauncherError });
      mainWindow?.webContents.send('game:error', { code: 'LAUNCH_FAILED', message: lastLauncherError });
      return false;
    }
  });

  ipcMain.handle('launcher:getDistribution', async () => {
    try {
      return await fetchDistribution();
    } catch (error) {
      lastLauncherError = error instanceof Error ? error.message : 'Unknown launcher:getDistribution error';
      return null;
    }
  });

  mainWindow = createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  isQuitting = true;
  log.info('[app] before-quit set isQuitting=true');
});

app.on('will-quit', () => {
  log.info('[app] will-quit');
});

app.on('quit', () => {
  log.info('[app] quit');
});
