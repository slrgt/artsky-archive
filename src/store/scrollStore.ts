import { create } from 'zustand'

/**
 * Scroll state store (Zustand)
 *
 * Stores scroll positions keyed by feed/screen identifier so that:
 * - Each feed (home, following, notifications, custom feeds) can remember its own position
 * - When navigating away and back (browser back button), we restore the exact scroll
 *
 * Keys are typically:
 * - "feed:timeline" | "feed:{uri}" for feed sources
 * - "feed:mixed:{hash}" for mixed feeds
 * - Path-based fallback: "/feed", "/search", etc.
 *
 * Optional: persist to localStorage so scroll survives page reload.
 * Trade-off: stale positions when feed content changes (new posts, deletions).
 */

const SCROLL_STORAGE_KEY = 'artsky_scroll_state'
const PERSIST_DEBOUNCE_MS = 300

export type ScrollState = {
  [key: string]: { scrollY: number }
}

export interface ScrollStore {
  state: ScrollState
  setScrollPosition: (key: string, scrollY: number) => void
  getScrollPosition: (key: string) => number
  /** Remove a key (e.g. when clearing stale data) */
  clearPosition: (key: string) => void
  /** Hydrate from localStorage (call once on app init if persisting) */
  hydrate: () => void
}

function loadFromStorage(): ScrollState {
  try {
    const raw = localStorage.getItem(SCROLL_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (parsed && typeof parsed === 'object') {
      const out: ScrollState = {}
      for (const [k, v] of Object.entries(parsed)) {
        if (typeof v === 'object' && v != null && typeof (v as { scrollY?: number }).scrollY === 'number') {
          const y = (v as { scrollY: number }).scrollY
          if (Number.isFinite(y) && y >= 0) out[k] = { scrollY: y }
        }
      }
      return out
    }
  } catch {
    // ignore
  }
  return {}
}

let persistTimer: ReturnType<typeof setTimeout> | null = null

function persistToStorage(state: ScrollState) {
  if (persistTimer) clearTimeout(persistTimer)
  persistTimer = setTimeout(() => {
    persistTimer = null
    try {
      localStorage.setItem(SCROLL_STORAGE_KEY, JSON.stringify(state))
    } catch {
      // ignore (quota, private mode, etc.)
    }
  }, PERSIST_DEBOUNCE_MS)
}

type ScrollStoreState = {
  state: ScrollState
  /** Whether we've hydrated from localStorage (avoids overwriting with empty on first load) */
  hydrated: boolean
}

export const useScrollStore = create<ScrollStoreState & Omit<ScrollStore, 'state'>>()((set, get) => ({
  state: {},
  hydrated: false,

  setScrollPosition: (key: string, scrollY: number) => {
    if (typeof scrollY !== 'number' || !Number.isFinite(scrollY) || scrollY < 0) return
    set((s) => {
      const next = { ...s.state, [key]: { scrollY } }
      persistToStorage(next)
      return { state: next }
    })
  },

  getScrollPosition: (key: string) => {
    const { state } = get()
    const entry = state[key]
    return entry && typeof entry.scrollY === 'number' && Number.isFinite(entry.scrollY)
      ? entry.scrollY
      : 0
  },

  clearPosition: (key: string) => {
    set((s) => {
      const { [key]: _, ...rest } = s.state
      const next = rest as ScrollState
      persistToStorage(next)
      return { state: next }
    })
  },

  hydrate: () => {
    if (get().hydrated) return
    const loaded = loadFromStorage()
    set((s) => ({ state: { ...s.state, ...loaded }, hydrated: true }))
  },
}))
