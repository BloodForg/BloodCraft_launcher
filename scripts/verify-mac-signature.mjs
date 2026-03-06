import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

function fail(message) {
  console.error(`[verify-mac-signature] ${message}`);
  process.exit(1);
}

function run(cmd, args) {
  execFileSync(cmd, args, { stdio: 'inherit' });
}

function resolveZipPath() {
  const releaseDir = join(process.cwd(), 'release');
  const explicit = process.argv[2];
  if (explicit) return explicit;

  const zipName = readdirSync(releaseDir)
    .filter((name) => name.endsWith('-mac.zip'))
    .sort()
    .at(-1);

  if (!zipName) {
    fail('No mac zip artifact found in release/');
  }

  return join(releaseDir, zipName);
}

function resolveAppPath() {
  const releaseDir = join(process.cwd(), 'release');
  const explicit = process.argv[3];
  if (explicit) return explicit;

  const arm64 = join(releaseDir, 'mac-arm64', 'BloodCraft.app');
  const x64 = join(releaseDir, 'mac', 'BloodCraft.app');

  try {
    statSync(arm64);
    return arm64;
  } catch {
    // continue
  }

  try {
    statSync(x64);
    return x64;
  } catch {
    fail('Built BloodCraft.app not found under release/mac-arm64 or release/mac');
  }
}

function verifyAppSignature(appPath, label) {
  console.log(`[verify-mac-signature] verifying ${label}: ${appPath}`);
  run('codesign', ['--verify', '--deep', '--strict', '--verbose=2', appPath]);

  try {
    run('spctl', ['--assess', '--type', 'execute', '--verbose', appPath]);
  } catch (error) {
    if (process.env.REQUIRE_SPCTL === '1') {
      throw error;
    }
    console.warn(`[verify-mac-signature] spctl assessment warning (non-fatal): ${appPath}`);
  }
}

const zipPath = resolveZipPath();
const appPath = resolveAppPath();
let tempDir = '';

try {
  statSync(zipPath);
  statSync(appPath);

  verifyAppSignature(appPath, 'built app bundle');

  tempDir = mkdtempSync(join(tmpdir(), 'bloodcraft-mac-sign-'));
  run('unzip', ['-q', zipPath, '-d', tempDir]);

  const rootEntries = readdirSync(tempDir).filter((name) => name !== '__MACOSX');
  if (!rootEntries.includes('BloodCraft.app')) {
    fail('Zip layout invalid: BloodCraft.app is missing at zip root');
  }

  const extractedAppPath = join(tempDir, 'BloodCraft.app');
  verifyAppSignature(extractedAppPath, 'app extracted from updater zip');

  console.log(`[verify-mac-signature] OK: signatures valid for app + updater zip (${zipPath})`);
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
} finally {
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true });
  }
}
