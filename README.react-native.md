# ArtSky – React Native (Expo)

This branch runs as a single **Expo / React Native** app for **web**, **iOS**, and **Android**. The feed uses **FlatList**; design and behavior match the original app where applicable.

## Run

- **Web:** `npm run web` or `npx expo start --web`
- **iOS:** `npm run ios` or `npx expo run:ios`
- **Android:** `npm run android` or `npx expo run:android`
- **Dev server (all platforms):** `npm start` then press `w` (web), `i` (iOS), or `a` (Android)

## Stack

- **Expo SDK 52**, **React Native**, **react-native-web**
- **React Navigation** (bottom tabs: Feed, Search; stack for Post detail)
- **@atproto/api** for Bluesky; **AsyncStorage** on native (with sync-style adapter), **localStorage** on web
- **Storage:** `src/lib/storage.ts` – `hydrateStorage()` is called before the app mounts so `localStorage` is available on native (in-memory + AsyncStorage). No changes needed in `bsky.ts` for storage.
- **OAuth:** Browser-only. On native, `src/lib/oauth.native.ts` is used (stubs); app-password login works.

## What’s included

- **Feed:** FlatList, pull-to-refresh, load more. Logged in → timeline; logged out → guest feed (configurable accounts).
- **Post detail:** Tap a post → stack screen with thread fetch.
- **Search:** Placeholder tab (to be implemented).
- **Theme:** `src/theme.ts` (dark/light) aligned with original CSS variables.

## Removed / not used in this version

- Vite, react-router-dom, `@tanstack/react-virtual`, PWA plugin
- Scroll restoration (browser-specific)
- VirtualizedFeedColumn, FeedShell (route overlay), ScrollRestoration
- CSS modules / `index.css` for the RN app (theme lives in `src/theme.ts`)

The rest of `src/` (lib, config, types, contexts that don’t depend on DOM/router) is shared. The **entry** is `index.js` → `hydrateStorage()` → `App.tsx` (Expo root). The old **Vite entry** (`index.html`, `src/main.tsx`, `src/App.tsx` with router) is no longer used by this branch.

## Assets

Expo expects `assets/icon.png`, `assets/favicon.png`, and `assets/adaptive-icon.png`. Add or adjust in `app.json` if missing.
