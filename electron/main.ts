import { app, BrowserWindow, ipcMain, shell } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promises as fs } from 'node:fs';
import log from 'electron-log';
import { autoUpdater } from 'electron-updater';
import { fetchDistribution, getStatus, install, launch } from './launcher/index.js';
import type { InstallProgress } from './launcher/types.js';

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

const setupUpdater = () => {
  autoUpdater.logger = log;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;

  autoUpdater.on('checking-for-update', () => {
    log.info('[updater] checking for update');
    sendUpdaterState({ status: 'checking', message: 'Проверка обновлений...' });
  });
  autoUpdater.on('update-available', (info) => {
    log.info('[updater] update available', info?.version);
    sendUpdaterState({ status: 'available', version: info?.version, message: `Доступно обновление ${info?.version}` });
  });
  autoUpdater.on('update-not-available', () => {
    log.info('[updater] no updates');
    sendUpdaterState({ status: 'not-available', message: 'Обновлений нет', progress: 0 });
  });
  autoUpdater.on('download-progress', (progressObj) => {
    sendUpdaterState({
      status: 'downloading',
      progress: Math.round(progressObj.percent),
      message: `Загрузка обновления ${Math.round(progressObj.percent)}%`
    });
  });
  autoUpdater.on('update-downloaded', (info) => {
    sendUpdaterState({ status: 'downloaded', message: `Обновление ${info?.version} скачано` });
  });
  autoUpdater.on('error', (error) => {
    log.error('[updater] error', error);
    sendUpdaterState({ status: 'error', message: error?.message ?? String(error) });
  });
};

app.whenReady().then(() => {
  log.transports.file.level = 'info';
  log.info('[main] app ready');
  setupUpdater();

  ipcMain.handle('shell:openExternal', async (_event, url: string) => {
    await shell.openExternal(url);
    return true;
  });

  ipcMain.handle('network:check', async () => {
    try {
      const response = await fetch('https://thebloodcraft.ru', { method: 'GET' });
      return response.ok;
    } catch (error) {
      log.warn('[network] health check failed', error);
      return false;
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
    try {
      await autoUpdater.checkForUpdates();
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      sendUpdaterState({ status: 'error', message });
      return false;
    }
  });
  ipcMain.handle('updater:download', async () => {
    try {
      await autoUpdater.downloadUpdate();
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      sendUpdaterState({ status: 'error', message });
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
    if (installInProgress) {
      return false;
    }

    installInProgress = true;
    lastLauncherError = undefined;

    try {
      await install((progress: InstallProgress) => {
        emitProgress(progress);
      });
      return true;
    } catch (error) {
      lastLauncherError = error instanceof Error ? error.message : 'Unknown launcher:install error';
      emitProgress({ stage: 'error', message: lastLauncherError });
      return false;
    } finally {
      installInProgress = false;
    }
  });

  ipcMain.handle('launcher:launch', async () => {
    try {
      await launch((progress: InstallProgress) => emitProgress(progress));
      return true;
    } catch (error) {
      lastLauncherError = error instanceof Error ? error.message : 'Unknown launcher:launch error';
      emitProgress({ stage: 'error', message: lastLauncherError });
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

  autoUpdater.checkForUpdates().catch((error) => {
    log.warn('[updater] startup check failed', error);
  });

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
