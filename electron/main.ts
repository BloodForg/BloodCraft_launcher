import { app, BrowserWindow, ipcMain, shell } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promises as fs } from 'node:fs';
import log from 'electron-log';
import updaterPkg from 'electron-updater';
import { fetchDistribution, getStatus, install, launch } from './launcher/index.js';
import type { InstallProgress } from './launcher/types.js';
import { devSelfCheck, loginWithSite, logoutSession, mapAuthError, me, refreshSession, runNetworkDiagnostics } from './authService.js';

const { autoUpdater } = updaterPkg as unknown as {
  autoUpdater: import('electron-updater').AppUpdater;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDev = !app.isPackaged;
let mainWindow: BrowserWindow | null = null;
let lastLauncherError: string | undefined;
let installInProgress = false;
let updaterState: {
  status: 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error';
  message?: string;
  progress?: number;
  version?: string;
} = { status: 'idle' };
let lastProgressAt = 0;
let queuedProgress: InstallProgress | null = null;
let progressTimer: NodeJS.Timeout | null = null;
const PROGRESS_THROTTLE_MS = 120;

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

  return win;
}

const sendUpdaterState = (patch: Partial<typeof updaterState>) => {
  updaterState = { ...updaterState, ...patch };
  mainWindow?.webContents.send('updater:status', updaterState);
};

const isUpdater404LatestMac = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();
  return normalized.includes('latest-mac.yml') && normalized.includes('404');
};

const setupUpdater = () => {
  if (!app.isPackaged) {
    log.info('[updater] skipped: app is not packaged');
    return;
  }

  autoUpdater.logger = log;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;

  log.info('[updater] app version', app.getVersion());

  autoUpdater.on('checking-for-update', () => {
    log.info('[updater] checking-for-update');
    sendUpdaterState({ status: 'checking', message: 'Проверка обновлений...' });
  });
  autoUpdater.on('update-available', (info) => {
    log.info('[updater] update-available', { version: info?.version, files: info?.files?.map((f) => f.url) });
    sendUpdaterState({ status: 'available', version: info?.version, message: `Доступно обновление ${info?.version}` });
  });
  autoUpdater.on('update-not-available', (info) => {
    log.info('[updater] update-not-available', { version: info?.version });
    sendUpdaterState({ status: 'not-available', message: 'Обновлений нет', progress: 0 });
  });
  autoUpdater.on('download-progress', (progressObj) => {
    log.info('[updater] download-progress', { percent: progressObj.percent, transferred: progressObj.transferred, total: progressObj.total });
    sendUpdaterState({
      status: 'downloading',
      progress: Math.round(progressObj.percent),
      message: `Загрузка обновления ${Math.round(progressObj.percent)}%`
    });
  });
  autoUpdater.on('update-downloaded', (info) => {
    log.info('[updater] update-downloaded', { version: info?.version });
    sendUpdaterState({ status: 'downloaded', message: `Обновление ${info?.version} скачано` });
  });
  autoUpdater.on('error', (error) => {
    if (isUpdater404LatestMac(error)) {
      log.warn('[updater] latest-mac.yml not found (treated as no updates)', error);
      sendUpdaterState({ status: 'not-available', message: 'Обновления недоступны' });
      return;
    }
    log.error('[updater] error', { message: error instanceof Error ? error.message : String(error) });
    sendUpdaterState({ status: 'error', message: 'Не удалось проверить обновления' });
  });
};

app.whenReady().then(() => {
  log.transports.file.level = 'info';
  log.info('[main] app ready');
  log.info('APP VERSION:', app.getVersion());
  setupUpdater();
  if (isDev) {
    void devSelfCheck();
  }

  ipcMain.handle('shell:openExternal', async (_event, url: string) => {
    await shell.openExternal(url);
    return true;
  });

  ipcMain.handle('network:check', async () => {
    try {
      const diagnostics = await runNetworkDiagnostics();
      return diagnostics;
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

  ipcMain.handle('network:diagnose', async () => {
    return runNetworkDiagnostics();
  });

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

  ipcMain.handle('updater:getStatus', async () => updaterState);
  ipcMain.handle('updater:check', async () => {
    if (!app.isPackaged) {
      log.info('[updater] manual check skipped in dev');
      sendUpdaterState({ status: 'idle', message: undefined, progress: 0 });
      return false;
    }
    try {
      await autoUpdater.checkForUpdates();
      return true;
    } catch (error) {
      if (isUpdater404LatestMac(error)) {
        log.warn('[updater] latest-mac.yml missing on check, treated as no updates');
        sendUpdaterState({ status: 'not-available', message: 'Обновления недоступны' });
        return true;
      }
      log.error('[updater] manual check failed', error);
      sendUpdaterState({ status: 'error', message: 'Не удалось проверить обновления' });
      return false;
    }
  });
  ipcMain.handle('updater:download', async () => {
    if (!app.isPackaged) {
      log.info('[updater] download skipped in dev');
      return false;
    }
    try {
      await autoUpdater.downloadUpdate();
      return true;
    } catch (error) {
      log.error('[updater] download failed', error);
      sendUpdaterState({ status: 'error', message: 'Не удалось скачать обновление' });
      return false;
    }
  });
  ipcMain.handle('updater:restart', async () => {
    autoUpdater.quitAndInstall();
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
      await install((progress: InstallProgress) => {
        emitProgress(progress);
      });
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

  ipcMain.handle('launcher:launch', async (_event, options?: { javaPath?: string; minMemoryGb?: number; maxMemoryGb?: number }) => {
    log.info('[ipc] launcher:launch invoked', options ?? {});
    try {
      await launch((progress: InstallProgress) => emitProgress(progress), options);
      mainWindow?.webContents.send('game:launched', { ok: true, message: 'Minecraft process started' });
      log.info('[ipc] launcher:launch completed');
      return true;
    } catch (error) {
      lastLauncherError = error instanceof Error ? error.message : 'Unknown launcher:launch error';
      log.error('[ipc] launcher:launch failed', { error: lastLauncherError });
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

  if (app.isPackaged) {
    log.info('CHECKING FOR UPDATES');
    autoUpdater.checkForUpdates().catch((error) => {
      if (isUpdater404LatestMac(error)) {
        log.warn('[updater] startup check: latest-mac.yml not found (treated as no updates)');
        sendUpdaterState({ status: 'not-available', message: 'Обновления недоступны' });
        return;
      }
      log.warn('[updater] startup check failed', error);
      sendUpdaterState({ status: 'error', message: 'Не удалось проверить обновления' });
    });
  }

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
