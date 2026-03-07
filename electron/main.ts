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
const UPDATE_MANIFEST_BASE_URL = (process.env.BLOODCRAFT_UPDATE_BASE_URL || 'https://thebloodcraft.ru/launcher/updates').replace(/\/+$/, '');
const UPDATE_DOWNLOAD_DIR = path.join(os.homedir(), 'Library', 'Application Support', 'BloodCraft', 'updates');
const UPDATE_TMP_DIR = path.join(UPDATE_DOWNLOAD_DIR, 'tmp');
const UPDATE_TMP_FILE_PATH = path.join(UPDATE_TMP_DIR, 'update.tmp');
const UPDATE_ZIP_FILE_PATH = path.join(UPDATE_DOWNLOAD_DIR, 'BloodCraft-mac.zip');
const UPDATER_LOG_PATH = path.join(os.homedir(), 'Library', 'Logs', 'bloodcraft-launcher', 'updater.log');
const MAC_APP_BACKUP_PATH = '/Applications/BloodCraft.app.backup';
const EXPECTED_VERSION_PATH = path.join(os.homedir(), 'Library', 'Application Support', 'BloodCraft', 'updates', 'expected-version.txt');
const DOWNLOAD_MAX_ATTEMPTS = 3;
const DOWNLOAD_ATTEMPT_TIMEOUT_MS = 10000;
const DOWNLOAD_RETRY_DELAY_MS = 1200;
const UPDATE_CHECK_TIMEOUT_MS = Number.parseInt(process.env.BLOODCRAFT_UPDATE_CHECK_TIMEOUT_MS || '60000', 10);
const MANIFEST_RETRY_ATTEMPTS = 3;

type CustomUpdateStatus = 'idle' | 'checking' | 'update_available' | 'downloading' | 'downloaded' | 'installing' | 'restarting' | 'error';
type UpdateChannel = 'stable' | 'beta' | 'dev';

type LatestManifest = {
  version: string;
  channel?: UpdateChannel;
  url: string;
  sha256: string;
  size: number;
  minBootstrapVersion?: string;
  rolloutPercentage?: number;
  delta?: {
    baseVersion: string;
    url: string;
    sha256: string;
    size: number;
  };
};

type InstallUpdateResult = {
  ok: boolean;
  reason?: 'permission-denied' | 'not-downloaded' | 'spawn-failed' | 'security-check-failed' | 'unknown';
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

function resolveUpdateChannel(): UpdateChannel {
  const raw = (process.env.BLOODCRAFT_UPDATE_CHANNEL || 'stable').toLowerCase();
  if (raw === 'beta' || raw === 'dev') return raw;
  return 'stable';
}

function manifestUrlForChannel(channel: UpdateChannel): string {
  const override = (process.env.BLOODCRAFT_UPDATE_MANIFEST_URL || '').trim();
  if (override) return override;
  if (channel === 'stable') return `${UPDATE_MANIFEST_BASE_URL}/latest.json`;
  return `${UPDATE_MANIFEST_BASE_URL}/latest-${channel}.json`;
}

function rolloutBucket(): number {
  const fingerprint = createHash('sha256').update(app.getPath('userData')).digest('hex');
  return Number.parseInt(fingerprint.slice(0, 8), 16) % 100;
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function cleanupUpdaterTempDirs(): Promise<void> {
  await fs.rm('/tmp/bloodcraft_update', { recursive: true, force: true }).catch(() => undefined);
  await fs.rm(UPDATE_TMP_DIR, { recursive: true, force: true }).catch(() => undefined);
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
  await appendUpdaterLog('expectedVersion', { expectedVersion });
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
    await cleanupUpdaterTempDirs();
    await fs.rm(MAC_APP_BACKUP_PATH, { recursive: true, force: true });
    await fs.rm(EXPECTED_VERSION_PATH, { force: true });
    log.info('[custom-updater] backup removed after successful app start', { backupPath: MAC_APP_BACKUP_PATH, expectedVersion, launchedVersion });
    await appendUpdaterLog('backup_removed_after_successful_start', { backupPath: MAC_APP_BACKUP_PATH, expectedVersion, launchedVersion });
    await appendUpdaterLog('update_success', { expectedVersion, launchedVersion });
    await appendUpdaterLog('backupCleanupSuccess', { ok: true });
  } catch (error) {
    const details = toErrorDetails(error);
    log.warn('[custom-updater] failed to remove backup after startup', { backupPath: MAC_APP_BACKUP_PATH, error: details.message });
    await appendUpdaterLog('backup_remove_failed', { backupPath: MAC_APP_BACKUP_PATH, error: details.message });
    await appendUpdaterLog('backupCleanupSuccess', { ok: false, reason: details.message });
  }
}

async function checkForCustomUpdate(): Promise<{ ok: boolean; available: boolean }> {
  const channel = resolveUpdateChannel();
  const manifestUrl = manifestUrlForChannel(channel);
  const softFailMessage = 'Не удалось проверить обновления. Сервер обновлений временно недоступен.';

  setUpdaterState({ status: 'checking', message: 'Проверка обновлений...' });
  log.info('[custom-updater] check started', { currentVersion: app.getVersion(), url: manifestUrl, channel, timeoutMs: UPDATE_CHECK_TIMEOUT_MS });
  await appendUpdaterLog('check_started', { currentVersion: app.getVersion(), url: manifestUrl, channel, timeoutMs: UPDATE_CHECK_TIMEOUT_MS });

  let lastManifestError = 'unknown';
  for (let attempt = 1; attempt <= MANIFEST_RETRY_ATTEMPTS; attempt += 1) {
    try {
      const response = await axios.get<LatestManifest>(manifestUrl, {
        timeout: UPDATE_CHECK_TIMEOUT_MS,
        validateStatus: () => true
      });

      if (response.status !== 200) {
        throw new Error(`Bad latest.json response status=${response.status}`);
      }

      const manifest = response.data;
      const hasSize = typeof manifest?.size === 'number' && Number.isFinite(manifest.size) && manifest.size > 0;
      const hasMinBootstrap = typeof manifest?.minBootstrapVersion === 'string' && manifest.minBootstrapVersion.trim().length > 0;
      if (!manifest?.version || !manifest?.url || !manifest?.sha256 || !hasSize || !hasMinBootstrap) {
        await appendUpdaterLog('manifest_invalid', {
          reason: 'missing_required_fields',
          hasVersion: Boolean(manifest?.version),
          hasUrl: Boolean(manifest?.url),
          hasSha256: Boolean(manifest?.sha256),
          hasSize,
          hasMinBootstrap
        });
        setUpdaterState({ status: 'idle', message: softFailMessage, progress: 0 });
        return { ok: false, available: false };
      }

      if (manifest.channel && !['stable', 'beta', 'dev'].includes(manifest.channel)) {
        await appendUpdaterLog('manifest_invalid', { reason: 'invalid_channel', channel: manifest.channel });
        setUpdaterState({ status: 'idle', message: softFailMessage, progress: 0 });
        return { ok: false, available: false };
      }

      if (manifest.rolloutPercentage !== undefined) {
        const rolloutRaw = Number(manifest.rolloutPercentage);
        if (!Number.isFinite(rolloutRaw) || rolloutRaw < 0 || rolloutRaw > 100) {
          await appendUpdaterLog('manifest_invalid', { reason: 'invalid_rollout_percentage', rolloutPercentage: manifest.rolloutPercentage });
          setUpdaterState({ status: 'idle', message: softFailMessage, progress: 0 });
          return { ok: false, available: false };
        }
      }

      await appendUpdaterLog('manifest_loaded', {
        status: response.status,
        attempt,
        version: manifest.version,
        channel: manifest.channel ?? channel,
        size: manifest.size,
        minBootstrapVersion: manifest.minBootstrapVersion
      });

      if (manifest.channel && manifest.channel !== channel) {
        setUpdaterState({ status: 'idle', message: 'Обновление для другого канала', version: app.getVersion(), progress: 0 });
        await appendUpdaterLog('step=channel_mismatch_skip', { requestedChannel: channel, manifestChannel: manifest.channel });
        return { ok: true, available: false };
      }

      const resolvedUrl = new URL(manifest.url, manifestUrl).toString();
      if (!resolvedUrl.startsWith('https://') || !isHttpsUrl(resolvedUrl)) {
        await appendUpdaterLog('manifest_invalid', { reason: 'insecure_update_url', url: resolvedUrl });
        setUpdaterState({ status: 'idle', message: softFailMessage, progress: 0 });
        return { ok: false, available: false };
      }

      const minBootstrapVersion = manifest.minBootstrapVersion?.trim() ?? '';
      if (compareVersions(app.getVersion(), minBootstrapVersion) < 0) {
        const message = 'Эта версия лаунчера слишком старая для автообновления. Требуется переустановка.';
        setUpdaterState({ status: 'error', message, version: manifest.version, progress: 0 });
        await appendUpdaterLog('step=bootstrap_blocked', { currentVersion: app.getVersion(), minBootstrapVersion, channel });
        return { ok: false, available: false };
      }

      const rolloutPercentage = Math.max(0, Math.min(100, Number(manifest.rolloutPercentage ?? 100)));
      const bucket = rolloutBucket();
      if (bucket >= rolloutPercentage) {
        setUpdaterState({ status: 'idle', message: 'Обновление пока недоступно для вашего канала', version: app.getVersion(), progress: 0 });
        await appendUpdaterLog('step=rollout_skip', { bucket, rolloutPercentage, channel, version: manifest.version });
        return { ok: true, available: false };
      }

      latestManifest = { ...manifest, channel: manifest.channel ?? channel, url: resolvedUrl };

      const cmp = compareVersions(manifest.version, app.getVersion());
      if (cmp <= 0) {
        setUpdaterState({ status: 'idle', message: 'У вас последняя версия', version: app.getVersion(), progress: 0 });
        log.info('[custom-updater] no update', { latestVersion: manifest.version });
        await appendUpdaterLog('step=no_update_available', { latestVersion: manifest.version, channel });
        return { ok: true, available: false };
      }

      setUpdaterState({
        status: 'update_available',
        message: `Доступно обновление ${manifest.version}`,
        version: manifest.version,
        progress: 0
      });
      log.info('[custom-updater] update found', { latestVersion: manifest.version, url: resolvedUrl, channel });
      await appendUpdaterLog('step=update_available', { latestVersion: manifest.version, url: resolvedUrl, channel });
      return { ok: true, available: true };
    } catch (error) {
      const details = toErrorDetails(error);
      lastManifestError = details.message;
      log.warn('[custom-updater] manifest check attempt failed', { attempt, maxAttempts: MANIFEST_RETRY_ATTEMPTS, error: details.message });
      if (attempt < MANIFEST_RETRY_ATTEMPTS) {
        await appendUpdaterLog('manifest_retry', { attempt, maxAttempts: MANIFEST_RETRY_ATTEMPTS, error: details.message, nextDelayMs: DOWNLOAD_RETRY_DELAY_MS });
        await sleep(DOWNLOAD_RETRY_DELAY_MS);
      }
    }
  }

  log.warn('[custom-updater] manifest check failed after retries', { error: lastManifestError });
  await appendUpdaterLog('manifest_failed', { attempts: MANIFEST_RETRY_ATTEMPTS, error: lastManifestError });
  setUpdaterState({ status: 'idle', message: softFailMessage, progress: 0 });
  return { ok: false, available: false };
}

async function downloadCustomUpdate(): Promise<boolean> {
  if (!latestManifest) {
    const checked = await checkForCustomUpdate();
    if (!checked.available) return false;
  }

  if (!latestManifest) return false;

  if (!latestManifest.url.startsWith('https://') || !isHttpsUrl(latestManifest.url)) {
    setUpdaterState({ status: 'error', message: 'Ошибка загрузки обновления: разрешены только HTTPS ссылки' });
    await appendUpdaterLog('step=download_failed', { reason: 'non_https_url', url: latestManifest.url });
    return false;
  }

  await fs.mkdir(UPDATE_DOWNLOAD_DIR, { recursive: true });
  await fs.mkdir(UPDATE_TMP_DIR, { recursive: true });
  const finalPath = UPDATE_ZIP_FILE_PATH;
  const tempPath = UPDATE_TMP_FILE_PATH;

  setUpdaterState({ status: 'downloading', message: 'Скачивание обновления...', progress: 0, version: latestManifest.version });
  log.info('[custom-updater] download started', { version: latestManifest.version, url: latestManifest.url });

  if (latestManifest.delta?.url && latestManifest.delta.baseVersion === app.getVersion()) {
    await appendUpdaterLog('step=delta_candidate_detected', {
      currentVersion: app.getVersion(),
      deltaUrl: latestManifest.delta.url,
      note: 'fallback_to_full_zip'
    });
  }

  let lastErrorMessage = 'unknown';
  for (let attempt = 1; attempt <= DOWNLOAD_MAX_ATTEMPTS; attempt += 1) {
    await appendUpdaterLog('download_started', {
      attempt,
      maxAttempts: DOWNLOAD_MAX_ATTEMPTS,
      version: latestManifest.version,
      url: latestManifest.url,
      tempPath,
      finalPath,
      timeoutMs: DOWNLOAD_ATTEMPT_TIMEOUT_MS
    });

    try {
      await fs.rm(tempPath, { force: true }).catch(() => undefined);
      const response = await axios.get(latestManifest.url, {
        responseType: 'stream',
        timeout: DOWNLOAD_ATTEMPT_TIMEOUT_MS,
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
      await appendUpdaterLog('download_finished', { attempt, path: tempPath, bytes: downloadedBytes });

      const actualHash = (await hashFileSha256(tempPath)).toLowerCase();
      const expectedHash = latestManifest.sha256.toLowerCase();
      const stat = await fs.stat(tempPath);
      const expectedSize = Number(latestManifest.size ?? 0);
      if (expectedSize > 0 && stat.size !== expectedSize) {
        await fs.rm(tempPath, { force: true });
        await appendUpdaterLog('error: corrupted update archive', { reason: 'size_mismatch', expectedSize, actualSize: stat.size, attempt });
        throw new Error(`corrupted update archive: size mismatch expected=${expectedSize} actual=${stat.size}`);
      }
      if (actualHash !== expectedHash) {
        await fs.rm(tempPath, { force: true });
        await appendUpdaterLog('error: corrupted update archive', { reason: 'sha256_mismatch', expectedHash, actualHash, attempt });
        throw new Error(`corrupted update archive: SHA256 mismatch expected=${expectedHash} actual=${actualHash}`);
      }

      await appendUpdaterLog('archive_verified', { attempt, sha256: actualHash, size: stat.size });

      await fs.rm(finalPath, { force: true }).catch(() => undefined);
      await fs.rename(tempPath, finalPath);
      await appendUpdaterLog('step=download_promoted', { from: tempPath, to: finalPath, attempt });

      downloadedZipPath = finalPath;
      setUpdaterState({
        status: 'downloaded',
        message: 'Обновление скачано',
        progress: 100,
        version: latestManifest.version,
        filePath: finalPath
      });
      await appendUpdaterLog('step=download_ok', { version: latestManifest.version, path: finalPath, sha256: actualHash, attempt });
      return true;
    } catch (error) {
      const details = toErrorDetails(error);
      lastErrorMessage = details.message;
      if (attempt < DOWNLOAD_MAX_ATTEMPTS) {
        await appendUpdaterLog('download_retry', {
          attempt,
          maxAttempts: DOWNLOAD_MAX_ATTEMPTS,
          error: details.message,
          nextDelayMs: DOWNLOAD_RETRY_DELAY_MS
        });
      }
      await appendUpdaterLog('step=download_attempt_failed', {
        attempt,
        maxAttempts: DOWNLOAD_MAX_ATTEMPTS,
        error: details.message
      });
      await fs.rm(tempPath, { force: true }).catch(() => undefined);
      if (attempt < DOWNLOAD_MAX_ATTEMPTS) {
        await sleep(DOWNLOAD_RETRY_DELAY_MS);
      }
    }
  }

  setUpdaterState({ status: 'error', message: `Ошибка загрузки обновления: ${lastErrorMessage}` });
  await appendUpdaterLog('step=download_failed', { error: lastErrorMessage });
  return false;
}

async function installCustomUpdate(): Promise<InstallUpdateResult> {
  if (!downloadedZipPath || !latestManifest) {
    setUpdaterState({ status: 'error', message: 'Обновление не скачано' });
    return { ok: false, reason: 'not-downloaded' };
  }

  setUpdaterState({ status: 'installing', message: 'Подготовка установки обновления...' });
  const expectedVersion = latestManifest.version;
  const expectedSha256 = latestManifest.sha256.toLowerCase();
  const expectedSize = Number(latestManifest.size ?? 0);
  await appendUpdaterLog('install_started', { zip: downloadedZipPath, expectedVersion });
  await appendUpdaterLog('step=install_start', { zip: downloadedZipPath, expectedVersion });

  try {
    await fs.mkdir(path.dirname(EXPECTED_VERSION_PATH), { recursive: true });
    await fs.writeFile(EXPECTED_VERSION_PATH, expectedVersion, 'utf8');
    await fs.access('/Applications', fsConstants.W_OK);
  } catch {
    const message = 'Не удалось установить обновление: нет прав на запись в /Applications.';
    setUpdaterState({ status: 'error', message });
    await appendUpdaterLog('step=install_failed_permission_denied', { dir: '/Applications', expectedVersion });
    return { ok: false, reason: 'permission-denied' };
  }

  try {
    const stat = await fs.stat(downloadedZipPath);
    if (expectedSize > 0 && stat.size !== expectedSize) {
      const message = 'Ошибка установки обновления: corrupted update archive';
      setUpdaterState({ status: 'error', message });
      await appendUpdaterLog('error: corrupted update archive', { stage: 'install_precheck', reason: 'size_mismatch', expectedSize, actualSize: stat.size });
      return { ok: false, reason: 'security-check-failed' };
    }

    const actualSha256 = (await hashFileSha256(downloadedZipPath)).toLowerCase();
    if (actualSha256 !== expectedSha256) {
      const message = 'Ошибка установки обновления: corrupted update archive';
      setUpdaterState({ status: 'error', message });
      await appendUpdaterLog('error: corrupted update archive', {
        stage: 'install_precheck',
        reason: 'sha256_mismatch',
        expectedSha256,
        actualSha256
      });
      return { ok: false, reason: 'security-check-failed' };
    }

    const packagedScript = path.join(process.resourcesPath, 'updater.sh');
    const devScript = path.join(process.cwd(), 'build-resources', 'updater.sh');
    const scriptPath = app.isPackaged ? packagedScript : devScript;

    await fs.access(scriptPath);

    const child = spawn('/bin/bash', [scriptPath, downloadedZipPath, expectedVersion, expectedSha256, String(stat.size)], {
      detached: true,
      stdio: 'ignore'
    });
    child.unref();

    setUpdaterState({ status: 'restarting', message: 'Перезапуск лаунчера...' });
    log.info('[custom-updater] updater spawned', { scriptPath, pid: child.pid, expectedVersion });
    await appendUpdaterLog('expectedVersion', { expectedVersion });
    await appendUpdaterLog('step=install_spawned', { scriptPath, pid: child.pid, expectedVersion, expectedSha256, expectedSize: stat.size });

    log.info('[custom-updater] app quitting for custom update');
    await appendUpdaterLog('step=app_quit_for_update');
    isQuitting = true;
    app.quit();
    return { ok: true };
  } catch (error) {
    const details = toErrorDetails(error);
    setUpdaterState({ status: 'error', message: `Ошибка установки обновления: ${details.message}` });
    await appendUpdaterLog('step=install_failed', { error: details.message });
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

  if (process.env.BLOODCRAFT_HEADLESS_UPDATE_CHECK === '1') {
    try {
      const res = await checkForCustomUpdate();
      log.info('[selfcheck] headless update check result', res);
      app.exit(0);
    } catch (error) {
      const details = toErrorDetails(error);
      log.error('[selfcheck] headless update check failed', details);
      app.exit(1);
    }
    return;
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
