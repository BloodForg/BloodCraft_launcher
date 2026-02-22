import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const jreRoot = path.join(repoRoot, 'build-resources', 'jre');
const targetJava = path.join(jreRoot, 'Contents', 'Home', 'bin', 'java');
const binaryUrl =
  'https://api.adoptium.net/v3/binary/latest/21/ga/mac/aarch64/jre/hotspot/normal/eclipse?project=jdk';

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function detectExtractedJre(extractDir) {
  const entries = await fs.readdir(extractDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const candidate = path.join(extractDir, entry.name, 'Contents', 'Home');
    if (await exists(path.join(candidate, 'bin', 'java'))) {
      return candidate;
    }
  }
  return null;
}

async function main() {
  if (await exists(targetJava)) {
    console.log(`[fetch-jre] JRE already present: ${targetJava}`);
    return;
  }

  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'bloodcraft-jre-'));
  const archivePath = path.join(tmpRoot, 'jre21-mac-aarch64.tar.gz');
  const extractDir = path.join(tmpRoot, 'extract');

  try {
    console.log('[fetch-jre] Downloading Temurin JRE 21 (macOS aarch64)...');
    await ensureDir(path.dirname(archivePath));
    await execFileAsync('curl', ['-fL', '-o', archivePath, binaryUrl]);
    await ensureDir(extractDir);
    await execFileAsync('tar', ['-xzf', archivePath, '-C', extractDir]);

    const extractedHome = await detectExtractedJre(extractDir);
    if (!extractedHome) {
      throw new Error('Unable to locate extracted JRE Contents/Home');
    }

    const targetHome = path.join(jreRoot, 'Contents', 'Home');
    await fs.rm(jreRoot, { recursive: true, force: true });
    await ensureDir(path.dirname(targetHome));
    await fs.cp(extractedHome, targetHome, { recursive: true });

    if (!(await exists(targetJava))) {
      throw new Error(`JRE installation failed, java not found at ${targetJava}`);
    }

    console.log(`[fetch-jre] Ready: ${targetJava}`);
  } finally {
    await fs.rm(tmpRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(`[fetch-jre] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
