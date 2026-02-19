# BloodCraft Launcher (UI Template)

Desktop UI-template in BloodCraft visual style.

## Stack
- Electron + React + TypeScript + Vite
- TailwindCSS
- Zustand (state)
- Framer Motion (animations)

## Run
1. `cd /Users/bloodforg/Documents/launc/bloodcraft-launcher`
2. `npm install`
3. `npm run dev`

Build:
- `npm run build`

## Where to edit mock data
- `/Users/bloodforg/Documents/launc/bloodcraft-launcher/src/mocks/servers.mock.json`
- `/Users/bloodforg/Documents/launc/bloodcraft-launcher/src/mocks/news.mock.json`
- `/Users/bloodforg/Documents/launc/bloodcraft-launcher/src/mocks/promos.mock.json`
- `/Users/bloodforg/Documents/launc/bloodcraft-launcher/src/mocks/user.mock.json`
- `/Users/bloodforg/Documents/launc/bloodcraft-launcher/src/mocks/downloads.mock.json`

## Service stubs (for future API)
- `/Users/bloodforg/Documents/launc/bloodcraft-launcher/src/services/authService.ts`
- `/Users/bloodforg/Documents/launc/bloodcraft-launcher/src/services/contentService.ts`
- `/Users/bloodforg/Documents/launc/bloodcraft-launcher/src/services/statusService.ts`

Target endpoints already documented in files:
- `POST /api/auth/login`
- `GET /api/auth/me`
- `GET /api/servers`
- `GET /api/news`
- `GET /api/banners`
- `GET /api/status/servers`

## Project structure
- `electron/` - electron main/preload
- `src/components/` - UI blocks (top bar, sidebar, right panel, buttons, toasts)
- `src/pages/` - tabs: Home, Servers, Downloads, Profile, Settings
- `src/store/useLauncherStore.ts` - global state + states + localStorage token
- `src/services/` - API-ready mock services
- `src/mocks/` - static datasets

## Implemented states
- Auth: loggedOut/loggedIn + simulate login
- Play button: idle/launching/disabled
- Promo/dynamic banners: auto-cycle each 5s + dots + crossfade
- Downloads: queue / empty state + mock controls
- Settings: save + toast
- Logs / Repair: UI-ready stubs

## Not implemented by design
- Real Minecraft launch
- Real file downloading
- Real auth
- Real system dialogs

Final macOS installer file name: BloodCraft.dmg
