import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { promises as fs } from 'node:fs';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { app } from 'electron';
import extract from 'extract-zip';
import { DEFAULT_INSTANCE_DIR_NAME, DISTRIBUTION_URL } from './config.js';
import type { Distribution, InstallProgress, LauncherStatus } from './types.js';

const require = createRequire(import.meta.url);
const { Client } = require('minecraft-launcher-core');

interface InstallMeta {
  installedSha256: string;
  installedAt: string;
  mcVersion: string;
  instanceId: string;
}

export function getInstanceDir(): string {
  return path.join(app.getPath('userData'), DEFAULT_INSTANCE_DIR_NAME);
}

function getGameDir(): string {
  return path.join(getInstanceDir(), 'game');
}

function getMetaPath(): string {
  return path.join(getInstanceDir(), 'install-meta.json');
}

async function readJsonSafe<T>(filePath: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function writeJsonAtomic(filePath: string, data: unknown): Promise<void> {
  const tmpPath = `${filePath}.tmp`;
  await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf8');
  await fs.rename(tmpPath, filePath);
}

async function sha256File(filePath: string): Promise<string> {
  const hash = createHash('sha256');
  const stream = createReadStream(filePath);

  stream.on('data', (chunk: string | Buffer) => {
    hash.update(chunk);
  });

  await once(stream, 'end');

  return hash.digest('hex');
}

async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

async function removeIfExists(targetPath: string): Promise<void> {
  await fs.rm(targetPath, { recursive: true, force: true });
}

async function downloadToFile(url: string, dest: string, onProgress: (progress: InstallProgress) => void): Promise<void> {
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`Failed to download package: ${response.status} ${response.statusText}`);
  }

  const total = Number(response.headers.get('content-length') ?? 0);
  const reader = response.body.getReader();
  const file = createWriteStream(dest);
  let downloaded = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      downloaded += value.byteLength;
      const canContinue = file.write(Buffer.from(value));
      if (!canContinue) {
        await once(file, 'drain');
      }

      const percent = total > 0 ? Math.min(100, Math.round((downloaded / total) * 100)) : undefined;
      const downloadedMb = (downloaded / (1024 * 1024)).toFixed(1);
      const totalMb = total > 0 ? (total / (1024 * 1024)).toFixed(1) : undefined;
      onProgress({
        stage: 'downloading',
        percent,
        currentBytes: downloaded,
        totalBytes: total > 0 ? total : undefined,
        message: percent !== undefined ? `Downloading package... ${percent}% (${downloadedMb}/${totalMb} MB)` : `Downloading package... ${downloadedMb} MB`
      });
    }
  } finally {
    file.end();
    await once(file, 'close');
  }
}

async function checkJavaAvailable(): Promise<boolean> {
  return await new Promise<boolean>((resolve) => {
    const proc = spawn('java', ['-version']);

    proc.once('error', () => resolve(false));
    proc.once('exit', (code) => resolve(code === 0));
  });
}

export async function fetchDistribution(): Promise<Distribution> {
  const response = await fetch(DISTRIBUTION_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch distribution: ${response.status} ${response.statusText}`);
  }

  const distribution = (await response.json()) as Distribution;
  const schemaOk = typeof distribution.schema === 'number' && distribution.schema >= 1;
  const versionOk = Boolean(distribution.minecraft?.version);
  const packageUrlOk = Boolean(distribution.package?.url);
  const packageShaOk = Boolean(distribution.package?.sha256);

  if (!schemaOk || !versionOk || !packageUrlOk || !packageShaOk) {
    throw new Error('Invalid distribution.json format');
  }

  return distribution;
}

export async function getStatus(): Promise<LauncherStatus> {
  const instanceDir = getInstanceDir();
  const meta = await readJsonSafe<InstallMeta>(getMetaPath());
  const javaOk = await checkJavaAvailable();

  return {
    instanceDir,
    javaOk,
    installed: Boolean(meta?.installedSha256),
    installedSha256: meta?.installedSha256,
    mcVersion: meta?.mcVersion,
    instanceId: meta?.instanceId
  };
}

export async function install(onProgress: (progress: InstallProgress) => void): Promise<void> {
  const distribution = await fetchDistribution();
  const instanceDir = getInstanceDir();
  const metaPath = getMetaPath();
  const gameDir = getGameDir();
  const tmpDir = path.join(instanceDir, 'tmp');
  const tmpZip = path.join(tmpDir, 'package.zip');
  const currentMeta = await readJsonSafe<InstallMeta>(metaPath);

  await ensureDir(instanceDir);
  await ensureDir(tmpDir);

  onProgress({ stage: 'verifying', message: 'Checking current installation...' });
  if (currentMeta?.installedSha256 && currentMeta.installedSha256 === distribution.package.sha256) {
    onProgress({ stage: 'done', percent: 100, message: 'Already up to date' });
    return;
  }

  await removeIfExists(tmpZip);
  await downloadToFile(distribution.package.url, tmpZip, onProgress);

  onProgress({ stage: 'verifying', message: 'Validating package checksum...' });
  const checksum = await sha256File(tmpZip);
  if (checksum !== distribution.package.sha256) {
    throw new Error('Bad checksum');
  }

  onProgress({ stage: 'extracting', message: 'Extracting package...' });
  await removeIfExists(gameDir);
  await ensureDir(gameDir);
  await extract(tmpZip, { dir: gameDir });

  const newMeta: InstallMeta = {
    installedSha256: checksum,
    installedAt: new Date().toISOString(),
    mcVersion: distribution.minecraft.version,
    instanceId: distribution.instanceId
  };

  onProgress({ stage: 'verifying', message: 'Writing install metadata...' });
  await writeJsonAtomic(metaPath, newMeta);

  await removeIfExists(tmpZip);
  onProgress({ stage: 'done', percent: 100, message: 'Install complete' });
}

export async function launch(onProgress?: (progress: InstallProgress) => void): Promise<void> {
  const distribution = await fetchDistribution();
  const meta = await readJsonSafe<InstallMeta>(getMetaPath());
  const gameDir = getGameDir();

  if (!meta?.installedSha256 || meta.installedSha256 !== distribution.package.sha256) {
    throw new Error('Client is not installed or outdated. Run install first.');
  }

  await ensureDir(gameDir);

  const launcher = new Client();
  const authorization = {
    access_token: '0',
    client_token: randomUUID(),
    uuid: randomUUID(),
    name: 'BloodPlayer',
    user_properties: '{}',
    meta: { type: 'mojang' as const }
  };

  const opts = {
    root: gameDir,
    version: {
      number: distribution.minecraft.version,
      type: distribution.minecraft.type ?? 'release'
    },
    memory: {
      min: '2G',
      max: '4G'
    },
    authorization
  };

  await new Promise<void>((resolve, reject) => {
    let resolved = false;
    let launchArgsChecked = false;

    launcher.on('debug', (line: unknown) => {
      console.log('[MCLC:debug]', line);
      if (!resolved) {
        resolved = true;
        resolve();
      }
    });
    launcher.on('data', (line: unknown) => console.log('[MCLC:data]', line));
    launcher.on('download-status', (status: { name?: string; type?: string; current?: number; total?: number }) => {
      const current = status.current ?? 0;
      const total = status.total ?? 0;
      const percent = total > 0 ? Math.max(0, Math.min(100, Math.round((current / total) * 100))) : undefined;
      const currentMb = (current / (1024 * 1024)).toFixed(1);
      const totalMb = total > 0 ? (total / (1024 * 1024)).toFixed(1) : undefined;
      onProgress?.({
        stage: 'downloading',
        percent,
        currentBytes: current,
        totalBytes: total > 0 ? total : undefined,
        message:
          percent !== undefined
            ? `${status.type ?? 'download'}: ${status.name ?? ''} ${percent}% (${currentMb}/${totalMb} MB)`.trim()
            : `${status.type ?? 'download'}: ${status.name ?? ''} ${currentMb} MB`.trim()
      });
    });
    launcher.on('progress', (progress: { type?: string; task?: number; total?: number }) => {
      const task = progress.task ?? 0;
      const total = progress.total ?? 0;
      const percent = total > 0 ? Math.max(0, Math.min(100, Math.round((task / total) * 100))) : undefined;
      onProgress?.({
        stage: 'downloading',
        percent,
        message:
          percent !== undefined
            ? `${progress.type ?? 'progress'}: ${task}/${total} (${percent}%)`
            : `${progress.type ?? 'progress'}: ${task}/${total}`
      });
    });
    launcher.on('arguments', (args: string[]) => {
      if (launchArgsChecked) return;
      launchArgsChecked = true;
      const versionIdx = args.indexOf('--version');
      const assetIdx = args.indexOf('--assetIndex');
      const argVersion = versionIdx >= 0 ? args[versionIdx + 1] : undefined;
      const argAssetIndex = assetIdx >= 0 ? args[assetIdx + 1] : undefined;
      if (argVersion !== distribution.minecraft.version || argAssetIndex !== distribution.minecraft.version) {
        reject(new Error(`Launch args mismatch: --version=${argVersion}, --assetIndex=${argAssetIndex}, expected=${distribution.minecraft.version}`));
      }
    });
    launcher.on('error', (error: unknown) => {
      console.error('[MCLC:error]', error);
      onProgress?.({ stage: 'error', message: error instanceof Error ? error.message : String(error) });
      if (!resolved) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });

    try {
      launcher.launch(opts);
      if (!resolved) {
        setTimeout(() => {
          if (!resolved) {
            resolved = true;
            resolve();
          }
        }, 300);
      }
    } catch (error) {
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}
