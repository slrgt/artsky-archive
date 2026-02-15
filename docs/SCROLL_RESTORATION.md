# Scroll Restoration Architecture

Bluesky-style navigation and scroll behavior: the feed stays mounted when opening posts/profiles, and scroll position is preserved when going back.

## Overview

1. **Feed stays mounted** — Post, profile, and tag views open as overlays on top of the feed. The feed component does not unmount, so its DOM and React state remain intact.

2. **History API** — Navigation uses React Router (`<Link>`, `navigate()`), which pushes/replaces history entries. The browser back button pops history and returns to the previous route.

3. **Per-feed scroll state** — Each feed (Following, What's Hot, custom feeds, mixed) has its own scroll position stored by a unique key. Switching feeds restores that feed's last scroll.

4. **Persistence** — Scroll positions are persisted to `localStorage` so they survive page reload.

## Architecture

### Router Layout

```
Routes
├── /feed           → FeedShell (FeedPage + overlay)
├── /post/:uri      → FeedShell (FeedPage + PostDetailModal overlay)
├── /profile/:handle→ FeedShell (FeedPage + ProfileModal overlay)
├── /tag/:tag       → FeedShell (FeedPage + TagModal overlay)
├── /forum          → ForumPage (full page)
├── /search         → SearchPage (full page)
└── ...
```

`FeedShell` renders `FeedPage` plus an overlay based on the path. Because `/feed`, `/post/*`, `/profile/*`, and `/tag/*` all use the same route element (`FeedShell`), React keeps `FeedPage` mounted. When the path changes to `/post/123`, only the overlay appears; the feed remains underneath with its scroll position intact.

### Scroll State Store (Zustand)

- **Location**: `src/store/scrollStore.ts`
- **Keys**: `feed:timeline`, `feed:{uri}`, `feed:mixed:{hash}`, or path-based (`/forum`, `/search`)
- **Actions**: `setScrollPosition`, `getScrollPosition`, `clearPosition`, `hydrate`
- **Persistence**: Writes to `localStorage` on updates (debounced). `hydrate()` loads on app init.

### useScrollRestoration Hook

- **Location**: `src/hooks/useScrollRestoration.ts`
- **Usage**: `useScrollRestoration(feedKey, { deferred: true })`

**Behavior**:
- Saves scroll position to the store on scroll (throttled).
- Restores on **POP** (back/forward) or **reload** when a saved position exists.
- `deferred: true` — uses double `requestAnimationFrame` so virtualized content can layout before restoring (avoids jump).

### Feed Scroll Key

- **Location**: `src/utils/feedScrollKey.ts`
- **Logic**: `getFeedScrollKey(source, mixEntries, mixTotalPercent)` → `feed:timeline`, `feed:{uri}`, or `feed:mixed:{hash}`

## Integration

### Clicking a Post from the Feed

```tsx
<Link to={`/post/${encodeURIComponent(uri)}`}>
  {/* or */}
  openPostModal(uri)  // ProfileModalContext may use navigate()
</Link>
```

- Pushes `/post/:uri` to history.
- FeedShell shows PostDetailModal overlay.
- Feed stays mounted; scroll position is preserved.

### Going Back

- User presses browser back or in-app back button → `navigate(-1)`.
- History pops; path returns to `/feed`.
- `useScrollRestoration` runs its restore effect (POP).
- `window.scrollTo(0, savedY)` restores the feed scroll.

### Overlay Routes

For `/post/*`, `/profile/*`, `/tag/*`:
- `ScrollRestoration` does **not** scroll to top (feed is underneath).
- On POP back to feed, the hook restores the feed scroll.

## Edge Cases

### Virtualized Lists

- **Pixel offset vs index**: We store `scrollY` (pixel offset). Virtualizers like `@tanstack/react-virtual` use `window` as the scroll container, so `window.scrollY` works.
- **Timing**: With `deferred: true`, we restore after two rAFs so the virtualizer has time to measure and render. Prevents "double scroll" (restore → layout → jump).

### First Visit

- No saved state → `getScrollPosition` returns 0 → no restore. Page stays at top.

### Stale Positions (Persistence)

- After reload, content may have changed (new posts, deletions).
- Restoring can leave a blank area if content height decreased.
- **Mitigation**: Cap stored positions, or clear on refresh if content hash changes. For now we accept minor imperfection.
- **When to clear**: Optional "Clear scroll state" in settings, or clear keys older than N days.

### Feed Switch vs Navigation

- Switching feeds (Following ↔ What's Hot) changes `feedScrollKey`. The hook starts saving/restoring for the new key. Each feed keeps its own scroll.

### Scroll Lock (Modals)

- When a modal is open, `ScrollLockContext` locks body scroll. The feed's `window.scrollY` doesn't change. On close, we're still at the right position.

## Optional: Path-Based Fallback

`ScrollRestoration` still does path-based save/restore for non-feed routes (forum, search, etc.). Those routes use the path as the key. Feed routes use feed-specific keys via the hook.

## Files

| File | Purpose |
|------|---------|
| `src/store/scrollStore.ts` | Zustand store, localStorage persistence |
| `src/hooks/useScrollRestoration.ts` | Save on scroll, restore on POP/reload |
| `src/utils/feedScrollKey.ts` | Derive feed key from source/mix |
| `src/components/ScrollRestoration.tsx` | Hydrate, path-based fallback, scroll-to-top on forward |
| `src/components/FeedShell.tsx` | Keeps FeedPage mounted, overlays for post/profile/tag |
| `src/pages/FeedPage.tsx` | Calls `useScrollRestoration(feedScrollKey, { deferred: true })` |
