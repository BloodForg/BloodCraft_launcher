#!/usr/bin/env node
import { createWriteStream } from 'node:fs';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { spawn } from 'node:child_process';

const VERSION = process.argv[2] ?? '1.21.11';
const OUT_DIR = process.argv[3] ?? `/tmp/bloodcraft-runtime-${VERSION}`;
const ARCH = process.arch === 'arm64' ? 'arm64' : 'x64';
const OS_NAME = process.platform === 'darwin' ? 'osx' : process.platform === 'win32' ? 'windows' : 'linux';
const AUTH_CLIENT_MOD = {
  path: 'mods/bloodcraft-auth-client-1.0.0.jar',
  url: 'https://thebloodcraft.ru/launcher/files/bloodcraft-auth-client-1.0.0.jar',
  sha256: 'fbfa4607c5d99fae1ad2528cdbf1e6b7d6d33dc6a36133544616f5674c45e506'
};
const FABRIC_API_MOD = {
  path: 'mods/fabric-api-0.115.1+1.21.1.jar',
  url: 'https://maven.fabricmc.net/net/fabricmc/fabric-api/fabric-api/0.115.1+1.21.1/fabric-api-0.115.1+1.21.1.jar',
  sha256: '3b952cfa1b4b82579da4699c49a60148a326768b5746ff3dfc25a6a96a8d0ea7'
};

const versionManifestUrl = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';

const ensureDir = async (dir) => fs.mkdir(dir, { recursive: true });
const exists = async (p) => fs.access(p).then(() => true).catch(() => false);

const fetchJson = async (url) => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status} ${r.statusText} for ${url}`);
  return r.json();
};

const downloadFile = async (url, dest) => {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`Download failed ${url}: ${res.status}`);
  await ensureDir(path.dirname(dest));
  const tmp = `${dest}.part`;
  await pipeline(res.body, createWriteStream(tmp));
  await fs.rename(tmp, dest);
};

const FEATURE_FLAGS = {
  is_demo_user: false,
  has_custom_resolution: false,
  has_quick_plays_support: false,
  is_quick_play_singleplayer: false,
  is_quick_play_multiplayer: false,
  is_quick_play_realms: false
};

const applyRules = (rules = []) => {
  if (!rules || rules.length === 0) return true;
  let allowed = false;
  for (const rule of rules) {
    const action = rule.action === 'allow';
    const os = rule.os?.name;
    const arch = rule.os?.arch;
    const features = rule.features ?? {};
    const osOk = !os || os === OS_NAME || (os === 'osx' && OS_NAME === 'osx');
    const archOk = !arch || arch === ARCH || (arch === 'x86_64' && ARCH === 'x64') || (arch === 'arm64' && ARCH === 'arm64');
    const featuresOk = Object.entries(features).every(([key, value]) => FEATURE_FLAGS[key] === value);
    if (osOk && archOk && featuresOk) allowed = action;
  }
  return allowed;
};

const resolveArgs = (args = []) => {
  const out = [];
  for (const entry of args) {
    if (typeof entry === 'string') {
      out.push(entry);
      continue;
    }
    if (!applyRules(entry.rules)) continue;
    if (Array.isArray(entry.value)) out.push(...entry.value);
    else if (typeof entry.value === 'string') out.push(entry.value);
  }
  return out;
};

const run = async () => {
  await ensureDir(OUT_DIR);
  const runtimeRoot = path.join(OUT_DIR, 'runtime');
  const versionsDir = path.join(runtimeRoot, 'versions', VERSION);
  const librariesDir = path.join(runtimeRoot, 'libraries');
  const assetsDir = path.join(runtimeRoot, 'assets');
  const nativesDir = path.join(runtimeRoot, 'natives', 'osx-arm64');
  const metaDir = path.join(runtimeRoot, 'meta');
  await Promise.all([ensureDir(versionsDir), ensureDir(librariesDir), ensureDir(assetsDir), ensureDir(nativesDir), ensureDir(metaDir)]);

  const vm = await fetchJson(versionManifestUrl);
  const versionMeta = vm.versions.find((v) => v.id === VERSION);
  if (!versionMeta?.url) throw new Error(`Version ${VERSION} not found in Mojang version manifest`);

  const versionJson = await fetchJson(versionMeta.url);
  const mcVersion = versionJson.id;

  const clientJarPath = path.join(versionsDir, 'client.jar');
  await downloadFile(versionJson.downloads.client.url, clientJarPath);

  const librariesToAdd = [];
  const nativesToExtract = [];

  for (const lib of versionJson.libraries ?? []) {
    if (!applyRules(lib.rules)) continue;

    if (lib.downloads?.artifact?.url && lib.downloads?.artifact?.path) {
      librariesToAdd.push({
        url: lib.downloads.artifact.url,
        path: path.join(librariesDir, lib.downloads.artifact.path),
        rel: path.join('runtime', 'libraries', lib.downloads.artifact.path)
      });
    }

    if (lib.natives && lib.downloads?.classifiers) {
      const candidates = [
        lib.natives.osx?.replace('${arch}', ARCH),
        lib.natives.osx,
        'natives-macos-arm64',
        'natives-osx-arm64',
        'natives-macos',
        'natives-osx'
      ].filter(Boolean);

      let chosen = null;
      for (const key of candidates) {
        if (key && lib.downloads.classifiers[key]) {
          chosen = lib.downloads.classifiers[key];
          break;
        }
      }

      if (chosen?.url && chosen?.path) {
        const nativeJar = path.join(librariesDir, chosen.path);
        nativesToExtract.push(nativeJar);
        librariesToAdd.push({
          url: chosen.url,
          path: nativeJar,
          rel: path.join('runtime', 'libraries', chosen.path)
        });
      }
    }
  }

  const pool = 16;
  let idx = 0;
  const workers = new Array(pool).fill(0).map(async () => {
    while (idx < librariesToAdd.length) {
      const i = idx++;
      const item = librariesToAdd[i];
      if (!(await exists(item.path))) {
        await downloadFile(item.url, item.path);
      }
    }
  });
  await Promise.all(workers);

  for (const nativeJar of nativesToExtract) {
    await new Promise((resolve, reject) => {
      const p = spawn('unzip', ['-o', nativeJar, '-d', nativesDir, '-x', 'META-INF/*'], { stdio: 'ignore' });
      p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`unzip failed for ${nativeJar}`))));
      p.on('error', reject);
    });
  }

  const assetIndexUrl = versionJson.assetIndex.url;
  const assetIndexId = versionJson.assetIndex.id;
  const assetIndexJson = await fetchJson(assetIndexUrl);

  const indexPath = path.join(assetsDir, 'indexes', `${assetIndexId}.json`);
  await ensureDir(path.dirname(indexPath));
  await fs.writeFile(indexPath, JSON.stringify(assetIndexJson, null, 2));

  const objects = Object.entries(assetIndexJson.objects ?? {}).map(([name, meta]) => {
    const hash = meta.hash;
    return {
      name,
      hash,
      url: `https://resources.download.minecraft.net/${hash.slice(0, 2)}/${hash}`,
      path: path.join(assetsDir, 'objects', hash.slice(0, 2), hash)
    };
  });

  let objIdx = 0;
  const objWorkers = new Array(24).fill(0).map(async () => {
    while (objIdx < objects.length) {
      const i = objIdx++;
      const obj = objects[i];
      if (!(await exists(obj.path))) {
        await downloadFile(obj.url, obj.path);
      }
    }
  });
  await Promise.all(objWorkers);

  const cp = [];
  const seen = new Set();
  for (const lib of librariesToAdd) {
    if (!lib.rel.endsWith('.jar')) continue;
    if (seen.has(lib.rel)) continue;
    seen.add(lib.rel);
    cp.push(lib.rel);
  }
  cp.push(path.join('runtime', 'versions', VERSION, 'client.jar'));

  const jvmArgs = resolveArgs(versionJson.arguments?.jvm ?? versionJson.minecraftArguments?.split(' ') ?? []);
  const gameArgs = resolveArgs(versionJson.arguments?.game ?? []);

  const launchJson = {
    mainClass: versionJson.mainClass,
    classpath: cp,
    jvmArgs,
    gameArgs,
    paths: {
      assetsDir: path.join('runtime', 'assets'),
      assetIndex: assetIndexId,
      nativesDir: path.join('runtime', 'natives', 'osx-arm64'),
      gameDir: 'game',
      librariesDir: path.join('runtime', 'libraries')
    }
  };

  await fs.writeFile(path.join(metaDir, 'version.json'), JSON.stringify(versionJson, null, 2));
  await fs.writeFile(path.join(metaDir, 'assetIndex.json'), JSON.stringify(assetIndexJson, null, 2));
  await fs.writeFile(path.join(metaDir, 'launch.json'), JSON.stringify(launchJson, null, 2));

  const zipPath = path.join(OUT_DIR, `client-${VERSION}.zip`);
  await new Promise((resolve, reject) => {
    const p = spawn('zip', ['-qr', zipPath, 'runtime'], { cwd: OUT_DIR, stdio: 'ignore' });
    p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`zip failed with ${code}`))));
    p.on('error', reject);
  });

  const buf = await fs.readFile(zipPath);
  const sha = crypto.createHash('sha256').update(buf).digest('hex');
  const size = buf.length;

  const manifest = {
    instanceId: 'bloodcraft-main',
    mcVersion: VERSION,
    files: [AUTH_CLIENT_MOD, FABRIC_API_MOD],
    zipUrl: `https://thebloodcraft.ru/launcher/files/client-${VERSION}.zip`,
    zipSha256: sha,
    zipSize: size,
    launch: {
      mainClass: versionJson.mainClass,
      jvmArgs: [],
      gameArgs: []
    }
  };
  const manifestPath = path.join(OUT_DIR, 'manifest.json');
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));

  console.log(JSON.stringify({
    version: VERSION,
    outDir: OUT_DIR,
    zipPath,
    zipSha256: sha,
    zipSize: size,
    manifestPath,
    assetIndexId,
    javaVersion: versionJson.javaVersion?.majorVersion
  }, null, 2));
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
