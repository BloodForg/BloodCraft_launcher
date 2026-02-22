import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

function fail(message) {
  console.error(`[verify-mac-zip] ${message}`);
  process.exit(1);
}

const releaseDir = join(process.cwd(), 'release');
const zipArg = process.argv[2];
const zipName =
  zipArg ??
  readdirSync(releaseDir)
    .filter((name) => name.endsWith('-mac.zip'))
    .sort()
    .at(-1);

if (!zipName) {
  fail('No mac zip artifact found in release/');
}

const zipPath = zipArg ? zipArg : join(releaseDir, zipName);
let tempDir = '';

try {
  statSync(zipPath);
  tempDir = mkdtempSync(join(tmpdir(), 'bloodcraft-maczip-'));
  execFileSync('unzip', ['-q', zipPath, '-d', tempDir], { stdio: 'inherit' });

  const rootEntries = readdirSync(tempDir).filter((name) => name !== '__MACOSX');
  const hasRootApp = rootEntries.includes('BloodCraft.app');

  if (!hasRootApp) {
    const nestedAppPath = rootEntries.find((name) => {
      try {
        return readdirSync(join(tempDir, name)).includes('BloodCraft.app');
      } catch {
        return false;
      }
    });

    if (nestedAppPath) {
      fail(`Invalid zip layout: BloodCraft.app is nested under "${nestedAppPath}/". It must be at zip root.`);
    }

    fail('Invalid zip layout: BloodCraft.app not found at zip root.');
  }

  console.log(`[verify-mac-zip] OK: BloodCraft.app is at zip root (${zipPath})`);
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
} finally {
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true });
  }
}
