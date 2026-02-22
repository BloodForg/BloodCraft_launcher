import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync } from 'node:fs';
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

function getMcVersion(distribution: Distribution): string {
  return distribution.mcVersion ?? distribution.minecraft?.version ?? '1.21.11';
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
  stream.on('data', (chunk: string | Buffer) => hash.update(chunk));
  await once(stream, 'end');
  return hash.digest('hex');
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

function normalizeProgressMessage(stage: InstallProgress['stage'], downloaded: number, total: number | undefined, message: string): InstallProgress {
  const percent = total && total > 0 ? Math.min(100, Math.round((downloaded / total) * 100)) : undefined;
  return { stage, percent, currentBytes: downloaded, totalBytes: total, message };
}

function computeManifestHash(distribution: Distribution): string {
  const source = {
    schema: distribution.schema ?? 1,
    instanceId: distribution.instanceId,
    mcVersion: getMcVersion(distribution),
    files: distribution.files?.map((f) => ({ path: f.path, sha256: f.sha256, size: f.size })) ?? [],
    zipUrl: distribution.zipUrl,
    zipSha256: distribution.zipSha256,
    zipSize: distribution.zipSize,
    package: distribution.package ? { url: distribution.package.url, sha256: distribution.package.sha256, size: distribution.package.size } : undefined
  };
  return createHash('sha256').update(JSON.stringify(source)).digest('hex');
}

async function downloadToFile(url: string, dest: string, onChunk: (chunkBytes: number, downloadedForFile: number, totalForFile?: number) => void): Promise<void> {
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
      if (!canContinue) await once(file, 'drain');
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
      if (attempt >= retries) break;
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
  const schemaOk = distribution.schema === undefined || (typeof distribution.schema === 'number' && distribution.schema >= 1);
  const versionOk = Boolean(getMcVersion(distribution));
  const instanceOk = Boolean(distribution.instanceId);
  const hasFiles = Array.isArray(distribution.files) && distribution.files.length > 0;
  const hasZip = Boolean(distribution.zipUrl && distribution.zipSha256);
  const hasPackage = Boolean(distribution.package?.url && distribution.package?.sha256);
  if (!schemaOk || !versionOk || !instanceOk || (!hasFiles && !hasZip && !hasPackage)) {
    throw new Error('Invalid distribution manifest format');
  }
}

export async function fetchDistribution(): Promise<Distribution> {
  log.info('[game] fetching manifest', { url: DISTRIBUTION_URL });
  const response = await fetch(DISTRIBUTION_URL, { redirect: 'follow' });
  log.info('[game] manifest response', { url: DISTRIBUTION_URL, finalUrl: response.url, status: response.status });
  if (!response.ok) {
    throw new Error(`Failed to fetch distribution (${DISTRIBUTION_URL}): ${response.status} ${response.statusText}`);
  }
  const distribution = (await response.json()) as Distribution;
  validateDistribution(distribution);
  log.info('[game] manifest loaded', {
    instanceId: distribution.instanceId,
    mcVersion: getMcVersion(distribution),
    filesCount: distribution.files?.length ?? 0,
    hasLaunch: Boolean(distribution.launch),
    mainClass: distribution.launch?.mainClass,
    hasZip: Boolean(distribution.zipUrl || distribution.package?.url)
  });
  return distribution;
}

export async function getStatus(): Promise<LauncherStatus> {
  const instanceDir = getInstanceDir();
  const meta = await readJsonSafe<InstallMeta>(getMetaPath());
  const javaOk = await checkJavaAvailable('/usr/bin/java') || (await checkJavaAvailable('java'));

  return {
    instanceDir,
    javaOk,
    installed: Boolean(meta?.installedSha256),
    installedSha256: meta?.installedSha256,
    mcVersion: meta?.mcVersion,
    instanceId: meta?.instanceId
  };
}

async function installFromZip(distribution: Distribution, onProgress: (progress: InstallProgress) => void): Promise<string> {
  const zipUrl = distribution.zipUrl ?? distribution.package?.url;
  const zipSha = distribution.zipSha256 ?? distribution.package?.sha256;
  const zipSize = distribution.zipSize ?? distribution.package?.size;

  if (!zipUrl || !zipSha) {
    throw new Error('Manifest zip fields are missing');
  }

  const instanceDir = getInstanceDir();
  const gameDir = resolveGameDir(distribution.instanceId);
  const tmpDir = path.join(instanceDir, 'tmp');
  const tmpZip = path.join(tmpDir, `${distribution.instanceId}.zip`);

  await ensureDir(tmpDir);
  await removeIfExists(tmpZip);

  let downloaded = 0;
  let lastLoggedPercent = -1;
  await downloadToFile(zipUrl, tmpZip, (chunkBytes) => {
    downloaded += chunkBytes;
    const downloadedMb = (downloaded / (1024 * 1024)).toFixed(1);
    const totalMb = zipSize ? (zipSize / (1024 * 1024)).toFixed(1) : undefined;
    if (zipSize) {
      const percent = Math.min(100, Math.round((downloaded / zipSize) * 100));
      if (percent >= lastLoggedPercent + 10 || percent === 100) {
        lastLoggedPercent = percent;
        log.info('[game] zip download progress', { percent, downloaded, total: zipSize });
      }
    } else if (downloaded % (25 * 1024 * 1024) < chunkBytes) {
      log.info('[game] zip download progress', { downloaded });
    }
    onProgress(
      normalizeProgressMessage('downloading', downloaded, zipSize, zipSize ? `Загрузка... ${downloadedMb}/${totalMb} MB` : `Загрузка... ${downloadedMb} MB`)
    );
  });

  onProgress({ stage: 'verifying', message: 'Проверка файлов...' });
  const checksum = await sha256File(tmpZip);
  if (checksum !== zipSha) {
    throw new Error(`Bad checksum: expected ${zipSha}, got ${checksum}`);
  }

  onProgress({ stage: 'extracting', message: 'Распаковка клиента...' });
  await removeIfExists(gameDir);
  await ensureDir(gameDir);
  await extract(tmpZip, { dir: gameDir });
  log.info('[game] unzip complete', { gameDir });
  await removeIfExists(tmpZip);
  return zipSha;
}

async function installFromFiles(distribution: Distribution, onProgress: (progress: InstallProgress) => void): Promise<string> {
  const files = distribution.files ?? [];
  if (!files.length) return installFromZip(distribution, onProgress);

  const gameDir = resolveGameDir(distribution.instanceId);
  const tmpDir = path.join(getInstanceDir(), 'tmp', distribution.instanceId);

  await ensureDir(gameDir);
  await ensureDir(tmpDir);

  const totalBytesKnown = files.every((file) => typeof file.size === 'number' && file.size > 0);
  const totalBytes = totalBytesKnown ? files.reduce((acc, file) => acc + (file.size ?? 0), 0) : undefined;
  let downloadedBytes = 0;

  for (const file of files) {
    const outputPath = path.join(gameDir, file.path);
    ensureInsideRoot(gameDir, outputPath);
    await ensureDir(path.dirname(outputPath));

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
      // need download
    }

    const tempPath = path.join(tmpDir, `${file.path.replace(/[/\\]/g, '_')}.part`);
    let fileDownloadedThisPass = 0;

    onProgress(normalizeProgressMessage('downloading', downloadedBytes, totalBytes, `Загрузка: ${file.path}`));

    await downloadFileWithRetry(file, tempPath, (chunkBytes, _downloadedForFile, totalForFile) => {
      fileDownloadedThisPass += chunkBytes;
      const effectiveCurrent = downloadedBytes + fileDownloadedThisPass;
      const denominator = totalBytes ?? totalForFile;
      const downloadedMb = (effectiveCurrent / (1024 * 1024)).toFixed(1);
      const totalMb = denominator ? (denominator / (1024 * 1024)).toFixed(1) : undefined;
      const msg = denominator ? `Загрузка: ${file.path} ${downloadedMb}/${totalMb} MB` : `Загрузка: ${file.path} ${downloadedMb} MB`;
      onProgress(normalizeProgressMessage('downloading', effectiveCurrent, denominator, msg));
    });

    onProgress({ stage: 'verifying', message: `Проверка: ${file.path}` });
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
  const mcVersion = getMcVersion(distribution);

  log.info('[game] install start', {
    manifestUrl: DISTRIBUTION_URL,
    instanceId: distribution.instanceId,
    mcVersion
  });

  const instanceDir = getInstanceDir();
  const metaPath = getMetaPath();
  const currentMeta = await readJsonSafe<InstallMeta>(metaPath);
  const targetHash = distribution.files?.length ? computeManifestHash(distribution) : (distribution.zipSha256 ?? distribution.package?.sha256);

  await ensureDir(instanceDir);
  onProgress({ stage: 'verifying', message: 'Проверка файлов...' });

  if (targetHash && currentMeta?.installedSha256 === targetHash) {
    log.info('[game] install skipped: already up to date', { instanceId: distribution.instanceId });
    onProgress({ stage: 'done', percent: 100, message: 'Клиент уже актуален' });
    return;
  }

  const installedSha256 = await installFromFiles(distribution, onProgress);

  const meta: InstallMeta = {
    installedSha256,
    installedAt: new Date().toISOString(),
    mcVersion,
    instanceId: distribution.instanceId
  };

  onProgress({ stage: 'verifying', message: 'Финальная проверка...' });
  await writeJsonAtomic(metaPath, meta);
  log.info('[game] install complete', { instanceId: distribution.instanceId, installedSha256 });
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

function applyLaunchPlaceholders(raw: string, context: { gameDir: string; assetsRoot: string; assetIndex: string; version: string; classPath?: string; serverHost?: string; serverPort?: number }): string {
  const replaceToken = (source: string, token: string, value: string) => source.split(token).join(value);
  const launcherName = 'BloodCraft';
  const launcherVersion = app.getVersion();
  return [
    ['${natives_directory}', path.join(context.gameDir, 'runtime', 'natives', process.platform === 'darwin' ? 'osx-arm64' : process.platform)],
    ['${library_directory}', path.join(context.gameDir, 'runtime', 'libraries')],
    ['${classpath_separator}', process.platform === 'win32' ? ';' : ':'],
    ['${classpath}', context.classPath ?? ''],
    ['${game_directory}', context.gameDir],
    ['${assets_root}', context.assetsRoot],
    ['${assets_index_name}', context.assetIndex],
    ['${version_name}', context.version],
    ['${auth_player_name}', 'BloodPlayer'],
    ['${auth_uuid}', randomUUID()],
    ['${auth_access_token}', '0'],
    ['${user_type}', 'legacy'],
    ['${version_type}', 'release'],
    ['${launcher_name}', launcherName],
    ['${launcher_version}', launcherVersion],
    ['${clientid}', randomUUID()],
    ['${auth_xuid}', '0'],
    ['${user_properties}', '{}'],
    ['${server_host}', context.serverHost ?? ''],
    ['${server_port}', context.serverPort ? String(context.serverPort) : '']
  ].reduce((acc, [token, value]) => replaceToken(acc, token, value), raw);
}

function hasUnresolvedPlaceholder(value: string): boolean {
  return /\$\{[^}]+\}/.test(value);
}

function sanitizeLaunchArgs(args: string[]): string[] {
  const sanitized: string[] = [];
  for (let i = 0; i < args.length; i += 1) {
    const current = args[i];
    if (current === '--demo') {
      continue;
    }
    if (hasUnresolvedPlaceholder(current)) {
      continue;
    }

    // Skip option + value pair when value still has unresolved placeholder.
    if (current.startsWith('-') && i + 1 < args.length && hasUnresolvedPlaceholder(args[i + 1])) {
      i += 1;
      continue;
    }

    if (current === '-cp' || current === '-classpath') {
      i += 1;
      continue;
    }

    sanitized.push(current);
  }
  return sanitized;
}

async function launchWithJavaProcess(
  distribution: Distribution,
  gameDir: string,
  onProgress: ((progress: InstallProgress) => void) | undefined,
  options?: LaunchOptions
): Promise<void> {
  const mainClass = distribution.launch?.mainClass;
  if (!mainClass) {
    throw new Error('Сборка клиента повреждена или не опубликована');
  }

  const configuredJava = options?.javaPath?.trim();
  const fallbackJava = '/usr/bin/java';
  let javaPath = configuredJava && configuredJava.length > 0 ? configuredJava : fallbackJava;

  if (configuredJava && !existsSync(configuredJava)) {
    log.warn('[game] configured java path not found, fallback to /usr/bin/java', { configuredJava });
    javaPath = fallbackJava;
  }

  const javaExists = existsSync(javaPath) || javaPath === 'java';
  if (!javaExists) {
    throw new Error('Java не найдена. Укажите путь в настройках.');
  }

  const javaOk = await checkJavaAvailable(javaPath);
  if (!javaOk) {
    const fallbackOk = javaPath !== fallbackJava ? await checkJavaAvailable(fallbackJava) : false;
    if (fallbackOk) {
      javaPath = fallbackJava;
    } else {
      throw new Error('Java не найдена. Укажите путь в настройках.');
    }
  }

  const jarFiles = await collectJarFiles(gameDir);
  if (!jarFiles.length) {
    throw new Error('Сборка клиента повреждена или не опубликована');
  }
  for (const jarPath of jarFiles) {
    if (!existsSync(jarPath)) {
      throw new Error('Сборка клиента повреждена или не опубликована');
    }
  }

  const classPath = jarFiles.join(process.platform === 'darwin' ? ':' : path.delimiter);
  if (!classPath.trim()) {
    throw new Error('Сборка клиента повреждена или не опубликована');
  }

  const mcVersion = getMcVersion(distribution);
  const minMem = Math.max(1, options?.minMemoryGb ?? 2);
  const maxMem = Math.max(minMem, options?.maxMemoryGb ?? 4);
  const assetsRoot = path.join(gameDir, 'assets');

  const jvmArgs = sanitizeLaunchArgs((distribution.launch?.jvmArgs ?? []).map((arg) =>
    applyLaunchPlaceholders(arg, {
      gameDir,
      assetsRoot,
      assetIndex: mcVersion,
      version: mcVersion,
      classPath,
      serverHost: distribution.server?.host,
      serverPort: distribution.server?.port
    })
  ));

  const gameArgs = sanitizeLaunchArgs((distribution.launch?.gameArgs ?? []).map((arg) =>
    applyLaunchPlaceholders(arg, {
      gameDir,
      assetsRoot,
      assetIndex: mcVersion,
      version: mcVersion,
      classPath,
      serverHost: distribution.server?.host,
      serverPort: distribution.server?.port
    })
  ));

  const args = [`-Xmx${maxMem}G`, `-Xms${minMem}G`, ...jvmArgs, '-cp', classPath, mainClass, ...gameArgs];

  await ensureDir(getLauncherLogsDir());
  const logPath = path.join(getLauncherLogsDir(), `minecraft-${Date.now()}.log`);
  const logStream = createWriteStream(logPath, { flags: 'a' });

  onProgress?.({ stage: 'launching', message: 'Запуск Minecraft...' });
  log.info('[game] resolved java path', { requestedJavaPath: configuredJava, javaPath });
  const classPathEntriesCount = classPath.split(process.platform === 'darwin' ? ':' : path.delimiter).filter(Boolean).length;
  log.info('[game] launching command summary', {
    javaPath,
    mainClass,
    jvmArgsCount: jvmArgs.length,
    gameArgsCount: gameArgs.length,
    classPathEntriesCount,
    cwd: gameDir
  });
  log.info('[game] launching java', {
    javaPath,
    mainClass,
    argsLength: args.length,
    cwd: gameDir
  });

  const child = spawn(javaPath, args, { cwd: gameDir, stdio: ['ignore', 'pipe', 'pipe'] });

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

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const startTimer = setTimeout(() => {
      if (settled) return;
      settled = true;
      onProgress?.({ stage: 'done', percent: 100, message: 'Minecraft запущен' });
      resolve();
    }, 10_000);

    const settleError = (error: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(startTimer);
      reject(error);
    };

    child.once('error', (error) => {
      settleError(error instanceof Error ? error : new Error(String(error)));
    });

    child.once('exit', (code) => {
      settleError(new Error(`Minecraft завершился (код ${code ?? 0})`));
    });
  });
}

async function launchWithMclcFallback(
  distribution: Distribution,
  gameDir: string,
  onProgress: ((progress: InstallProgress) => void) | undefined,
  options?: LaunchOptions
): Promise<void> {
  const mcVersion = getMcVersion(distribution);
  const launcher = new Client();

  const opts = {
    root: gameDir,
    version: { number: mcVersion, type: distribution.minecraft?.type ?? 'release' },
    memory: { min: `${Math.max(1, options?.minMemoryGb ?? 2)}G`, max: `${Math.max(2, options?.maxMemoryGb ?? 4)}G` },
    authorization: {
      access_token: '0',
      client_token: randomUUID(),
      uuid: randomUUID(),
      name: 'BloodPlayer',
      user_properties: '{}',
      meta: { type: 'mojang' as const }
    },
    javaPath: options?.javaPath || undefined
  };

  onProgress?.({ stage: 'launching', message: 'Запуск Minecraft...' });

  await new Promise<void>((resolve, reject) => {
    let resolved = false;

    launcher.on('debug', (line: unknown) => {
      log.info('[MCLC:debug]', line);
      if (!resolved) {
        resolved = true;
        resolve();
      }
    });

    launcher.on('download-status', (status: { name?: string; type?: string; current?: number; total?: number }) => {
      const current = status.current ?? 0;
      const total = status.total ?? 0;
      const percent = total > 0 ? Math.round((current / total) * 100) : undefined;
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
      if (!resolved) reject(error instanceof Error ? error : new Error(String(error)));
    });

    try {
      launcher.launch(opts);
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          resolve();
        }
      }, 1000);
    } catch (error) {
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

export async function launch(onProgress?: (progress: InstallProgress) => void, options?: LaunchOptions): Promise<void> {
  const distribution = await fetchDistribution();
  const mcVersion = getMcVersion(distribution);

  log.info('[game] play start', {
    manifestUrl: DISTRIBUTION_URL,
    instanceId: distribution.instanceId,
    javaPath: options?.javaPath ?? '/usr/bin/java',
    mcVersion
  });

  const meta = await readJsonSafe<InstallMeta>(getMetaPath());
  const targetHash = distribution.files?.length ? computeManifestHash(distribution) : (distribution.zipSha256 ?? distribution.package?.sha256);

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
