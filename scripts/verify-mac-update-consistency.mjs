import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

function fail(message) {
  console.error(`[verify-mac-update-consistency] ${message}`);
  process.exit(1);
}

function sha512Base64(filePath) {
  const hash = createHash('sha512');
  hash.update(readFileSync(filePath));
  return hash.digest('base64');
}

const releaseDir = join(process.cwd(), 'release');
const ymlPath = join(releaseDir, 'latest-mac.yml');

let yml = '';
try {
  yml = readFileSync(ymlPath, 'utf8');
} catch (error) {
  fail(`Cannot read ${ymlPath}: ${error instanceof Error ? error.message : String(error)}`);
}

const versionMatch = yml.match(/^version:\s*([^\n]+)$/m);
if (!versionMatch) fail('latest-mac.yml missing version');
const version = versionMatch[1].trim().replace(/^'|'$/g, '');

const fileEntries = [];
const fileRegex = /-\s+url:\s*([^\n]+)\n\s+sha512:\s*([^\n]+)\n\s+size:\s*(\d+)/g;
let match;
while ((match = fileRegex.exec(yml)) !== null) {
  fileEntries.push({
    url: match[1].trim().replace(/^'|'$/g, ''),
    sha512: match[2].trim().replace(/^'|'$/g, ''),
    size: Number.parseInt(match[3], 10),
  });
}

if (fileEntries.length < 2) {
  fail('latest-mac.yml must include at least zip and dmg in files[]');
}

for (const entry of fileEntries) {
  const filePath = join(releaseDir, entry.url);
  let size;
  try {
    size = statSync(filePath).size;
  } catch {
    fail(`Missing file referenced by latest-mac.yml: ${entry.url}`);
  }

  if (size !== entry.size) {
    fail(`Size mismatch for ${entry.url}: yml=${entry.size}, actual=${size}`);
  }

  const actualSha = sha512Base64(filePath);
  if (actualSha !== entry.sha512) {
    fail(`sha512 mismatch for ${entry.url}`);
  }
}

const pathMatch = yml.match(/^path:\s*([^\n]+)$/m);
if (!pathMatch) fail('latest-mac.yml missing path field');
const pathValue = pathMatch[1].trim().replace(/^'|'$/g, '');
if (!pathValue.endsWith('-mac.zip')) {
  fail(`path must reference updater zip, got: ${pathValue}`);
}

const pathEntry = fileEntries.find((entry) => entry.url === pathValue);
if (!pathEntry) {
  fail(`path (${pathValue}) does not match any files[].url`);
}

if (!pathValue.includes(version)) {
  fail(`path (${pathValue}) does not include version ${version}`);
}

console.log(`[verify-mac-update-consistency] OK: version=${version}, files=${fileEntries.length}`);
