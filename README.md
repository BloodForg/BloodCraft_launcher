# BloodCraft Launcher

Electron + React launcher for BloodCraft with real auth, install/launch pipeline, updater, network state, and logs.

## Stack
- Electron + Vite + React + TypeScript
- Zustand
- `minecraft-launcher-core`
- `electron-updater`
- `electron-log`
- `keytar`

## Run (dev)
```bash
cd /Users/bloodforg/Documents/launc/bloodcraft-launcher
npm ci
npm run dev
```

## Build
```bash
npm run build
```

## Build DMG (local)
```bash
npm run dist:mac
```
Output files:
- `/Users/bloodforg/Documents/launc/bloodcraft-launcher/release/BloodCraft-<version>-arm64.dmg`
- `/Users/bloodforg/Documents/launc/bloodcraft-launcher/release/BloodCraft-<version>-arm64-mac.zip`
- `/Users/bloodforg/Documents/launc/bloodcraft-launcher/release/latest-mac.yml`

## Auto-update release flow (GitHub Releases)
Updater reads release channel from GitHub Releases (`BloodForg/BloodCraft_launcher`) and expects `latest-mac.yml`.

Release steps:
1. Update app version in `/Users/bloodforg/Documents/launc/bloodcraft-launcher/package.json`.
2. Commit and push to `main`.
3. Create and push tag:
```bash
git tag vX.Y.Z
git push origin main --tags
```
4. Workflow `/Users/bloodforg/Documents/launc/bloodcraft-launcher/.github/workflows/release-github.yml` builds macOS and publishes:
- `BloodCraft-<version>-arm64.dmg`
- `BloodCraft-<version>-arm64-mac.zip`
- `latest-mac.yml`

Installed launcher flow:
- `0.1.3` checks updates -> sees `0.1.4` -> downloads -> restart to apply.

## Auth API (real)
Launcher uses:
- `POST https://thebloodcraft.ru/api/launcher/login`
- `GET https://thebloodcraft.ru/api/launcher/me`
- `POST https://thebloodcraft.ru/api/launcher/refresh`

Token storage:
- `refreshToken` in Keychain via `keytar` (main process)
- `accessToken` in memory (session runtime)

## Manifest install/launch
Manifest URL:
- `https://thebloodcraft.ru/launcher/manifest.json`

Configured in:
- `/Users/bloodforg/Documents/launc/bloodcraft-launcher/electron/launcher/config.ts`

Manifest should contain `files[]` (preferred) or fallback `package` zip.
Downloaded files are stored in:
- `~/Library/Application Support/BloodCraft/bloodcraft/game/instances/<instanceId>/`

## Logs
- Main + renderer errors go to `electron-log`
- Minecraft runtime output is written to `userData/logs/minecraft-<timestamp>.log`

Open logs from settings modal:
- “Открыть папку логов”
- “Открыть последний лог”

## DMG distribution URL
- [https://thebloodcraft.ru/download](https://thebloodcraft.ru/download)
- [https://thebloodcraft.ru/downloads/BloodCraft.dmg](https://thebloodcraft.ru/downloads/BloodCraft.dmg)

## Integration note for website API
If `/api/launcher/*` endpoints are not deployed yet, use patch doc:
- `/Users/bloodforg/Documents/launc/bloodcraft-launcher/docs/site-launcher-api-patch.md`
