# BloodCraft Launcher

Electron + React launcher UI in BloodCraft style with login flow, server selection, install/launch pipeline, updater, network state, and logs.

## Stack
- Electron + Vite + React + TypeScript
- Zustand
- Framer Motion
- `minecraft-launcher-core`
- `electron-updater`
- `electron-log`

## Run
```bash
cd /Users/bloodforg/Documents/launc/bloodcraft-launcher
npm install
npm run dev
```

## Build
```bash
npm run build
```

## DMG build
```bash
npm run dist:mac
```
Output:
- `/Users/bloodforg/Documents/launc/bloodcraft-launcher/release/BloodCraft.dmg`

## Key modules
- `/Users/bloodforg/Documents/launc/bloodcraft-launcher/src/services/authService.ts`
- `/Users/bloodforg/Documents/launc/bloodcraft-launcher/src/services/updateService.ts`
- `/Users/bloodforg/Documents/launc/bloodcraft-launcher/src/services/networkService.ts`
- `/Users/bloodforg/Documents/launc/bloodcraft-launcher/src/services/serverService.ts`
- `/Users/bloodforg/Documents/launc/bloodcraft-launcher/src/services/gameService.ts`
- `/Users/bloodforg/Documents/launc/bloodcraft-launcher/src/services/logService.ts`
- `/Users/bloodforg/Documents/launc/bloodcraft-launcher/src/store/useSettingsStore.ts`
- `/Users/bloodforg/Documents/launc/bloodcraft-launcher/electron/main.ts`
- `/Users/bloodforg/Documents/launc/bloodcraft-launcher/electron/preload.ts`

## Icons
Source logo:
- `/Users/bloodforg/Documents/launc/bloodcraft-launcher/src/assets/bloodcraft-logo.svg`

Generate app icons:
```bash
npm run icons:generate
```
Generated:
- `/Users/bloodforg/Documents/launc/bloodcraft-launcher/build/icon.png`
- `/Users/bloodforg/Documents/launc/bloodcraft-launcher/build/app.icns`

## Auto update
Configured through `electron-updater` in:
- `/Users/bloodforg/Documents/launc/bloodcraft-launcher/electron/main.ts`

Publisher target:
- GitHub releases (`BloodForg/BloodCraft_launcher`)

## Download URL
- [http://thebloodcraft.ru/downloads/BloodCraft.dmg](http://thebloodcraft.ru/downloads/BloodCraft.dmg)
