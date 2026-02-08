# artsky

---

# 🚨🚨🚨 WEE WOO WEE WOO WARNING 🚨🚨🚨

**THIS WAS ENTIRELY VIBE CODED BY A BLENDER ANIMATOR WITHOUT THE CODING SKILLS TO MAKE THIS BY HAND YET BUT WANTED IT TO EXIST SOOOO YEAH IT MIGHT DISAPPEAR TOMORROW USE ANY OF THE IDEAS TO MAKE A BETTER HAND MADE VERSION IF YA CAN K THX BYE LOVE YA**

---

A **PWA** (Progressive Web App) that works as an app-style view for [Bluesky](https://bsky.app) (AT Protocol). Use it on your phone or desktop: masonry feed of images and videos, artboards to save posts, and comment on posts with your Bluesky account.

## Features

- **Feed**: Home timeline and custom Bluesky feeds in a masonry grid of images and videos.
- **Artboards**: Create boards and add posts from the feed; view and remove them later.
- **Comments**: Open any post, write a comment, and post it as a reply from your Bluesky account.
- **PWA**: Install on your phone or desktop; works offline for the UI (feed loads when online).

## Login

Use your **Bluesky handle** (or email) and an **App Password**.

1. In Bluesky go to **Settings → App passwords**.
2. Create a new app password and copy it.
3. In artsky, sign in with your handle and that app password (not your main account password).

## Branches (main vs dev)

- **`main`** – Live site. Pushes deploy to **https://YOUR_USERNAME.github.io/artsky/**.
- **`dev`** – Dev site. Pushes deploy to a **separate** URL, **https://YOUR_USERNAME.github.io/artsky-dev/**, so you and others can test the dev version online before merging to main.

**Workflow:** Push to `dev` → dev site updates. When ready, merge `dev` into `main` → live site updates.

To create and push `dev` once (if you don't have it yet):
```bash
git checkout -b dev
git push -u origin dev
```

### One-time setup for the dev site

So that pushes to `dev` can deploy to the separate dev URL, do this once:

1. **Create the dev repo**  
   On GitHub, create a new repo **artsky-dev** (same account as artsky, e.g. `slrgt/artsky-dev`). It can be empty (no need to clone or add files).

2. **Create a Personal Access Token**  
   GitHub → **Settings** (your profile) → **Developer settings** → **Personal access tokens** → **Tokens (classic)** → **Generate new token**. Give it a name (e.g. "artsky dev deploy"), scope **repo**, then generate and **copy the token**.

3. **Add the token as a secret in the artsky repo**  
   Open the **artsky** repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**. Name: **DEV_DEPLOY_TOKEN**, value: the token you copied. Save.

4. **Turn on GitHub Pages for artsky-dev**  
   Open the **artsky-dev** repo → **Settings** → **Pages** → **Build and deployment** → **Source**: **Deploy from a branch**. Branch: **main** (or **master**), folder **/ (root)**. Save.

After the first push to `dev`, the workflow will build and push the built app into **artsky-dev**; the dev site will be at **https://YOUR_USERNAME.github.io/artsky-dev/**.

## Deploy to GitHub Pages

1. Push this repo to GitHub (e.g. `https://github.com/YOUR_USERNAME/artsky`).

2. **Use GitHub Actions for Pages (required)**  
   In the repo go to **Settings → Pages → Build and deployment → Source** and set it to **GitHub Actions**.  
   If you use “Deploy from a branch”, the site will serve the repo’s raw files and the app will not load (you’ll see “Loading failed for the module with source …/src/main.tsx”).

3. Push to `main` (or re-run the “Deploy to GitHub Pages” workflow). The workflow builds the app and deploys the built files from `dist/`.

4. The app will be at: **`https://YOUR_USERNAME.github.io/artsky/`**  
   Open this exact URL (including the `/artsky/` path). Do not open the repo root or a raw file.

5. On your phone, open that URL in Safari/Chrome and use “Add to Home Screen” to install the PWA.

### “Loading failed for the module” or “Disallowed MIME type (text/html)”

The **built** app is not being served; the server is sending the repo’s raw `index.html`, which points at `src/main.tsx` (source, not a built bundle).

- **Fix:** In the repo go to **Settings → Pages → Build and deployment → Source** and set it to **GitHub Actions**. Then trigger a deploy (push to `main` or re-run the workflow). The workflow deploys the contents of `dist/` (the built app).

- **URL:** Open **`https://YOUR_USERNAME.github.io/artsky/`** (with the trailing slash). The app’s `base` is `/artsky/`; it will not work at `https://YOUR_USERNAME.github.io/` alone.

## Local development

```bash
npm install
npm run dev
```

Open **http://localhost:5173/** (dev uses base `/`). For production-like base path locally, run `npm run build && npm run preview` and open the URL shown (e.g. with base `/artsky/`).

## Tech

- **Vite** + **React** + **TypeScript**
- **@atproto/api** for Bluesky (timeline, feeds, post, reply)
- **react-router-dom** (HashRouter for GitHub Pages)
- **vite-plugin-pwa** for manifest and service worker
- Artboards and session stored in **localStorage** (no backend)

## Guest feed (logged-out users)

When users are not signed in, the feed shows posts from a fixed list of Bluesky accounts and a preview section with links to their profiles. To change which accounts appear:

- **Edit** `src/config/guestFeed.ts`  
  Each entry has a `handle` (e.g. `studio.blender.org`) and a `label` (e.g. `Blender`) used in the UI. Add, remove, or reorder entries there; the feed and the preview section update automatically.

## Repo structure

- `src/config/guestFeed.ts` – **Guest feed accounts** (edit this to change what logged-out users see)
- `src/lib/bsky.ts` – Bluesky agent, session persistence, feed/reply helpers
- `src/lib/artboards.ts` – Artboard CRUD in localStorage
- `src/pages/` – Login, Feed, Artboards, Artboard detail, Post detail
- `src/components/` – Layout, FeedSelector, PostCard, etc.

## License

AGPL-3.0-or-later. See [LICENSE](LICENSE).
