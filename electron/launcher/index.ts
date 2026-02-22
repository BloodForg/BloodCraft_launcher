import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { promises as fs } from 'node:fs';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { app } from 'electron';
import log from 'electron-log';
import extract from 'extract-zip';
import { DEFAULT_INSTANCE_DIR_NAME, DISTRIBUTION_URL } from './config.js';
import type { Distribution, DistributionFile, InstallProgress, LauncherStatus } from './types.js';

const require = createRequire(import.meta.url);
const { Client } = require('minecraft-launcher-core');

interface InstallMeta {
  installedSha256: string;
  installedAt: string;
  mcVersion: string;
  instanceId: string;
}

interface LaunchOptions {
  javaPath?: string;
  minMemoryGb?: number;
  maxMemoryGb?: number;
}

export function getInstanceDir(): string {
  return path.join(app.getPath('userData'), DEFAULT_INSTANCE_DIR_NAME);
}

function resolveGameDir(instanceId: string): string {
  return path.join(getInstanceDir(), 'game', 'instances', instanceId);
}

function getMetaPath(): string {
  return path.join(getInstanceDir(), 'install-meta.json');
}

function getLauncherLogsDir(): string {
  return path.join(app.getPath('userData'), 'logs');
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

function computeManifestHash(distribution: Distribution): string {
  const source = {
    schema: distribution.schema,
    instanceId: distribution.instanceId,
    minecraft: distribution.minecraft,
    files: distribution.files?.map((f) => ({ path: f.path, sha256: f.sha256, size: f.size })) ?? [],
    package: distribution.package
      ? { url: distribution.package.url, sha256: distribution.package.sha256, size: distribution.package.size }
      : undefined
  };
  return createHash('sha256').update(JSON.stringify(source)).digest('hex');
}

async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

async function removeIfExists(targetPath: string): Promise<void> {
  await fs.rm(targetPath, { recursive: true, force: true });
}

function ensureInsideRoot(rootDir: string, targetPath: string): void {
  const root = path.resolve(rootDir);
  const target = path.resolve(targetPath);
  if (!target.startsWith(root + path.sep) && target !== root) {
    throw new Error(`Unsafe output path: ${targetPath}`);
  }
}

function normalizeProgressMessage(
  stage: InstallProgress['stage'],
  downloaded: number,
  total: number | undefined,
  message: string
): InstallProgress {
  const percent = total && total > 0 ? Math.min(100, Math.round((downloaded / total) * 100)) : undefined;
  return {
    stage,
    percent,
    currentBytes: downloaded,
    totalBytes: total,
    message
  };
}

async function downloadToFile(
  url: string,
  dest: string,
  onChunk: (chunkBytes: number, downloadedForFile: number, totalForFile?: number) => void
): Promise<void> {
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`Failed to download (${url}): ${response.status} ${response.statusText}`);
  }

  await ensureDir(path.dirname(dest));
  const totalForFile = Number(response.headers.get('content-length') ?? 0) || undefined;
  const reader = response.body.getReader();
  const file = createWriteStream(dest);
  let downloadedForFile = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      const chunk = Buffer.from(value);
      downloadedForFile += chunk.byteLength;
      const canContinue = file.write(chunk);
      if (!canContinue) {
        await once(file, 'drain');
      }
      onChunk(chunk.byteLength, downloadedForFile, totalForFile);
    }
  } finally {
    file.end();
    await once(file, 'close');
  }
}

async function downloadFileWithRetry(
  file: DistributionFile,
  outputPath: string,
  onChunk: (chunkBytes: number, downloadedForFile: number, totalForFile?: number) => void,
  retries = 3
): Promise<void> {
  let attempt = 0;
  let lastError: unknown;

  while (attempt < retries) {
    attempt += 1;
    try {
      await removeIfExists(outputPath);
      await downloadToFile(file.url, outputPath, onChunk);
      return;
    } catch (error) {
      lastError = error;
      log.warn(`[launcher] download failed (${file.path}) attempt ${attempt}/${retries}`, error);
      if (attempt >= retries) {
        break;
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function checkJavaAvailable(javaCommand = 'java'): Promise<boolean> {
  return await new Promise<boolean>((resolve) => {
    const proc = spawn(javaCommand, ['-version']);

    proc.once('error', () => resolve(false));
    proc.once('exit', (code) => resolve(code === 0));
  });
}

function validateDistribution(distribution: Distribution): void {
  const schemaOk = typeof distribution.schema === 'number' && distribution.schema >= 1;
  const versionOk = Boolean(distribution.minecraft?.version);
  const instanceOk = Boolean(distribution.instanceId);
  const hasFiles = Array.isArray(distribution.files) && distribution.files.length > 0;
  const hasPackage = Boolean(distribution.package?.url && distribution.package?.sha256);

  if (!schemaOk || !versionOk || !instanceOk || (!hasFiles && !hasPackage)) {
    throw new Error('Invalid distribution manifest format');
  }
}

export async function fetchDistribution(): Promise<Distribution> {
  const response = await fetch(DISTRIBUTION_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch distribution (${DISTRIBUTION_URL}): ${response.status} ${response.statusText}`);
  }

  const distribution = (await response.json()) as Distribution;
  validateDistribution(distribution);
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

async function installFromZipFallback(distribution: Distribution, onProgress: (progress: InstallProgress) => void): Promise<string> {
  if (!distribution.package) {
    throw new Error('Manifest package section is missing');
  }

  const instanceDir = getInstanceDir();
  const gameDir = resolveGameDir(distribution.instanceId);
  const tmpDir = path.join(instanceDir, 'tmp');
  const tmpZip = path.join(tmpDir, 'package.zip');

  await ensureDir(tmpDir);
  await removeIfExists(tmpZip);

  let downloaded = 0;
  const total = distribution.package.size;
  await downloadToFile(distribution.package.url, tmpZip, (chunkBytes) => {
    downloaded += chunkBytes;
    const downloadedMb = (downloaded / (1024 * 1024)).toFixed(1);
    const totalMb = total ? (total / (1024 * 1024)).toFixed(1) : undefined;
    onProgress(
      normalizeProgressMessage(
        'downloading',
        downloaded,
        total,
        total ? `Скачивание клиента... ${downloadedMb}/${totalMb} MB` : `Скачивание клиента... ${downloadedMb} MB`
      )
    );
  });

  onProgress({ stage: 'verifying', message: 'Проверка checksum...' });
  const checksum = await sha256File(tmpZip);
  if (checksum !== distribution.package.sha256) {
    throw new Error(`Bad checksum for package.zip: expected ${distribution.package.sha256}, got ${checksum}`);
  }

  onProgress({ stage: 'extracting', message: 'Распаковка клиента...' });
  await removeIfExists(gameDir);
  await ensureDir(gameDir);
  await extract(tmpZip, { dir: gameDir });
  await removeIfExists(tmpZip);
  return distribution.package.sha256;
}

async function installFromFiles(distribution: Distribution, onProgress: (progress: InstallProgress) => void): Promise<string> {
  const files = distribution.files ?? [];
  if (!files.length) {
    return installFromZipFallback(distribution, onProgress);
  }

  const gameDir = resolveGameDir(distribution.instanceId);
  const tmpDir = path.join(getInstanceDir(), 'tmp', distribution.instanceId);

  await ensureDir(gameDir);
  await ensureDir(tmpDir);

  const totalBytesKnown = files.every((file) => typeof file.size === 'number' && file.size > 0);
  const totalBytes = totalBytesKnown
    ? files.reduce((acc, file) => acc + (file.size ?? 0), 0)
    : undefined;
  let downloadedBytes = 0;

  for (const file of files) {
    const outputPath = path.join(gameDir, file.path);
    ensureInsideRoot(gameDir, outputPath);

    const parentDir = path.dirname(outputPath);
    await ensureDir(parentDir);

    try {
      const existingStat = await fs.stat(outputPath);
      if (existingStat.isFile()) {
        const existingSha = await sha256File(outputPath);
        if (existingSha === file.sha256) {
          downloadedBytes += file.size ?? 0;
          onProgress(normalizeProgressMessage('downloading', downloadedBytes, totalBytes, `Проверено: ${file.path}`));
          continue;
        }
      }
    } catch {
      // file missing or unreadable -> download
    }

    const tempPath = path.join(tmpDir, `${file.path.replace(/[/\\]/g, '_')}.part`);
    await ensureDir(path.dirname(tempPath));
    let fileDownloadedThisPass = 0;

    onProgress(normalizeProgressMessage('downloading', downloadedBytes, totalBytes, `Скачивание: ${file.path}`));

    await downloadFileWithRetry(file, tempPath, (chunkBytes, downloadedForFile, totalForFile) => {
      fileDownloadedThisPass += chunkBytes;
      const effectiveCurrent = downloadedBytes + fileDownloadedThisPass;
      const denominator = totalBytes ?? totalForFile;
      const downloadedMb = (effectiveCurrent / (1024 * 1024)).toFixed(1);
      const totalMb = denominator ? (denominator / (1024 * 1024)).toFixed(1) : undefined;
      const msg = denominator
        ? `Скачивание: ${file.path} ${downloadedMb}/${totalMb} MB`
        : `Скачивание: ${file.path} ${downloadedMb} MB`;
      onProgress(normalizeProgressMessage('downloading', effectiveCurrent, denominator, msg));
      void downloadedForFile;
    });

    onProgress({ stage: 'verifying', message: `Проверка файла: ${file.path}` });
    const sha = await sha256File(tempPath);
    if (sha !== file.sha256) {
      throw new Error(`Bad checksum for ${file.path}: expected ${file.sha256}, got ${sha}`);
    }

    await fs.rename(tempPath, outputPath);
    downloadedBytes += file.size ?? fileDownloadedThisPass;
  }

  return computeManifestHash(distribution);
}

export async function install(onProgress: (progress: InstallProgress) => void): Promise<void> {
  const distribution = await fetchDistribution();
  const instanceDir = getInstanceDir();
  const metaPath = getMetaPath();
  const currentMeta = await readJsonSafe<InstallMeta>(metaPath);
  const targetHash = distribution.files?.length ? computeManifestHash(distribution) : distribution.package?.sha256;

  await ensureDir(instanceDir);
  onProgress({ stage: 'verifying', message: 'Проверка текущей установки...' });

  if (targetHash && currentMeta?.installedSha256 === targetHash) {
    onProgress({ stage: 'done', percent: 100, message: 'Клиент уже актуален' });
    return;
  }

  const installedSha256 = await installFromFiles(distribution, onProgress);

  const meta: InstallMeta = {
    installedSha256,
    installedAt: new Date().toISOString(),
    mcVersion: distribution.minecraft.version,
    instanceId: distribution.instanceId
  };

  onProgress({ stage: 'verifying', message: 'Сохранение метаданных установки...' });
  await writeJsonAtomic(metaPath, meta);
  onProgress({ stage: 'done', percent: 100, message: 'Установка завершена' });
}

async function collectJarFiles(dirPath: string): Promise<string[]> {
  const out: string[] = [];
  const stack = [dirPath];

  while (stack.length) {
    const current = stack.pop();
    if (!current) continue;
    let entries: Array<{ name: string; isDirectory: () => boolean; isFile: () => boolean }> = [];
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (entry.isFile() && fullPath.endsWith('.jar')) {
        out.push(fullPath);
      }
    }
  }

  return out;
}

function applyLaunchPlaceholders(raw: string, context: {
  gameDir: string;
  assetsRoot: string;
  assetIndex: string;
  version: string;
  serverHost?: string;
  serverPort?: number;
}): string {
  const replaceToken = (source: string, token: string, value: string) => source.split(token).join(value);
  return [
    ['${game_directory}', context.gameDir],
    ['${assets_root}', context.assetsRoot],
    ['${assets_index_name}', context.assetIndex],
    ['${version_name}', context.version],
    ['${auth_player_name}', 'BloodPlayer'],
    ['${auth_uuid}', randomUUID()],
    ['${server_host}', context.serverHost ?? ''],
    ['${server_port}', context.serverPort ? String(context.serverPort) : '']
  ].reduce((acc, [token, value]) => replaceToken(acc, token, value), raw);
}

async function launchWithJavaProcess(
  distribution: Distribution,
  gameDir: string,
  onProgress: ((progress: InstallProgress) => void) | undefined,
  options?: LaunchOptions
): Promise<void> {
  const mainClass = distribution.launch?.mainClass;
  if (!mainClass) {
    throw new Error('Manifest launch.mainClass is not defined');
  }

  const javaCmd = options?.javaPath && options.javaPath.trim().length > 0 ? options.javaPath : 'java';
  const javaOk = await checkJavaAvailable(javaCmd);
  if (!javaOk) {
    throw new Error('Java не найдена. Укажите путь к Java в настройках.');
  }

  const jarFiles = await collectJarFiles(gameDir);
  if (!jarFiles.length) {
    throw new Error('В установленной сборке не найдены .jar файлы для запуска');
  }

  const classPath = jarFiles.join(path.delimiter);
  const minMem = Math.max(1, options?.minMemoryGb ?? 2);
  const maxMem = Math.max(minMem, options?.maxMemoryGb ?? 4);
  const assetsRoot = path.join(gameDir, 'assets');

  const jvmArgs = (distribution.launch?.jvmArgs ?? []).map((arg) =>
    applyLaunchPlaceholders(arg, {
      gameDir,
      assetsRoot,
      assetIndex: distribution.minecraft.version,
      version: distribution.minecraft.version,
      serverHost: distribution.server?.host,
      serverPort: distribution.server?.port
    })
  );

  const gameArgs = (distribution.launch?.gameArgs ?? []).map((arg) =>
    applyLaunchPlaceholders(arg, {
      gameDir,
      assetsRoot,
      assetIndex: distribution.minecraft.version,
      version: distribution.minecraft.version,
      serverHost: distribution.server?.host,
      serverPort: distribution.server?.port
    })
  );

  const args = [`-Xms${minMem}G`, `-Xmx${maxMem}G`, ...jvmArgs, '-cp', classPath, mainClass, ...gameArgs];

  await ensureDir(getLauncherLogsDir());
  const logPath = path.join(getLauncherLogsDir(), `minecraft-${Date.now()}.log`);
  const logStream = createWriteStream(logPath, { flags: 'a' });

  onProgress?.({ stage: 'launching', message: 'Запуск Minecraft...' });

  const child = spawn(javaCmd, args, {
    cwd: gameDir,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  child.stdout.on('data', (data: Buffer) => {
    const line = data.toString('utf8');
    logStream.write(line);
    log.info(`[mc] ${line.trim()}`);
  });
  child.stderr.on('data', (data: Buffer) => {
    const line = data.toString('utf8');
    logStream.write(line);
    log.warn(`[mc:err] ${line.trim()}`);
  });
  child.once('error', (error) => {
    log.error('[mc] process error', error);
  });

  await new Promise<void>((resolve) => {
    setTimeout(resolve, 400);
  });
}

async function launchWithMclcFallback(
  distribution: Distribution,
  gameDir: string,
  onProgress: ((progress: InstallProgress) => void) | undefined,
  options?: LaunchOptions
): Promise<void> {
  const launcher = new Client();
  const authorization = {
    access_token: '0',
    client_token: randomUUID(),
    uuid: randomUUID(),
    name: 'BloodPlayer',
    user_properties: '{}',
    meta: { type: 'mojang' as const }
  };

  const minMem = Math.max(1, options?.minMemoryGb ?? 2);
  const maxMem = Math.max(minMem, options?.maxMemoryGb ?? 4);

  const opts = {
    root: gameDir,
    version: {
      number: distribution.minecraft.version,
      type: distribution.minecraft.type ?? 'release'
    },
    memory: {
      min: `${minMem}G`,
      max: `${maxMem}G`
    },
    authorization,
    javaPath: options?.javaPath || undefined
  };

  await new Promise<void>((resolve, reject) => {
    let resolved = false;

    launcher.on('debug', (line: unknown) => {
      log.info('[MCLC:debug]', line);
      if (!resolved) {
        resolved = true;
        resolve();
      }
    });
    launcher.on('data', (line: unknown) => log.info('[MCLC:data]', line));
    launcher.on('download-status', (status: { name?: string; type?: string; current?: number; total?: number }) => {
      const current = status.current ?? 0;
      const total = status.total ?? 0;
      const percent = total > 0 ? Math.max(0, Math.min(100, Math.round((current / total) * 100))) : undefined;
      onProgress?.({
        stage: 'downloading',
        percent,
        currentBytes: current,
        totalBytes: total > 0 ? total : undefined,
        message: percent !== undefined ? `${status.type ?? 'download'} ${status.name ?? ''}: ${percent}%` : `${status.type ?? 'download'} ${status.name ?? ''}`
      });
    });
    launcher.on('error', (error: unknown) => {
      log.error('[MCLC:error]', error);
      if (!resolved) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });

    onProgress?.({ stage: 'launching', message: 'Запуск Minecraft...' });

    try {
      launcher.launch(opts);
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          resolve();
        }
      }, 500);
    } catch (error) {
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

export async function launch(
  onProgress?: (progress: InstallProgress) => void,
  options?: LaunchOptions
): Promise<void> {
  const distribution = await fetchDistribution();
  const meta = await readJsonSafe<InstallMeta>(getMetaPath());
  const targetHash = distribution.files?.length ? computeManifestHash(distribution) : distribution.package?.sha256;

  if (!meta?.installedSha256 || (targetHash && meta.installedSha256 !== targetHash)) {
    throw new Error('Клиент не установлен или устарел. Выполните установку.');
  }

  const gameDir = resolveGameDir(distribution.instanceId);
  await ensureDir(gameDir);

  if (distribution.launch?.mainClass) {
    await launchWithJavaProcess(distribution, gameDir, onProgress, options);
    return;
  }

  await launchWithMclcFallback(distribution, gameDir, onProgress, options);
}
