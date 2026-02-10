import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useNavigationType } from 'react-router-dom'
import {
  agent,
  getPostMediaInfo,
  getPostAllMediaForDisplay,
  getGuestFeed,
  getSavedFeedsFromPreferences,
  getFeedDisplayName,
  getMixedFeed,
  isPostNsfw,
  type TimelineItem,
} from '../lib/bsky'
import type { FeedSource } from '../types'
import PostCard from '../components/PostCard'
import Layout from '../components/Layout'
import { useProfileModal } from '../context/ProfileModalContext'
import { useLoginModal } from '../context/LoginModalContext'
import { useSession } from '../context/SessionContext'
import { useMediaOnly } from '../context/MediaOnlyContext'
import { useFeedMix } from '../context/FeedMixContext'
import { useFeedSwipe } from '../context/FeedSwipeContext'
import { blockAccount } from '../lib/bsky'
import { useViewMode } from '../context/ViewModeContext'
import { useModeration } from '../context/ModerationContext'
import { useSeenPosts } from '../context/SeenPostsContext'
import { usePullToRefresh } from '../hooks/usePullToRefresh'
import styles from './FeedPage.module.css'

const SEEN_POSTS_KEY = 'artsky-seen-posts'
const SEEN_POSTS_MAX = 2000

function loadSeenUris(): Set<string> {
  try {
    const raw = localStorage.getItem(SEEN_POSTS_KEY)
    if (!raw) return new Set()
    const arr = JSON.parse(raw) as string[]
    return Array.isArray(arr) ? new Set(arr) : new Set()
  } catch {
    return new Set()
  }
}

function saveSeenUris(uris: Set<string>) {
  try {
    const arr = [...uris]
    const toSave = arr.length > SEEN_POSTS_MAX ? arr.slice(-SEEN_POSTS_MAX) : arr
    localStorage.setItem(SEEN_POSTS_KEY, JSON.stringify(toSave))
  } catch {
    // ignore
  }
}

const PRESET_SOURCES: FeedSource[] = [
  { kind: 'timeline', label: 'Following' },
  { kind: 'custom', label: "What's Hot", uri: 'at://did:plc:z72i7hdynmk6r22z27h6tvur/app.bsky.feed.generator/whats-hot' },
]

/** Nominal column width for height estimation (px). */
const ESTIMATE_COL_WIDTH = 280
const CARD_CHROME = 100

function estimateItemHeight(item: TimelineItem): number {
  const media = getPostMediaInfo(item.post)
  if (!media) return CARD_CHROME + 80
  if (media.aspectRatio != null && media.aspectRatio > 0) {
    return CARD_CHROME + ESTIMATE_COL_WIDTH / media.aspectRatio
  }
  return CARD_CHROME + 220
}

/** Distribute items so no column is much longer than others: cap count difference at 1, then pick by smallest estimated height. */
function distributeByHeight(
  items: TimelineItem[],
  numCols: number
): Array<Array<{ item: TimelineItem; originalIndex: number }>> {
  const cols = Math.min(3, Math.max(1, Math.floor(numCols)))
  if (cols < 1) return []
  const columns: Array<Array<{ item: TimelineItem; originalIndex: number }>> = Array.from(
    { length: cols },
    () => []
  )
  const columnHeights: number[] = Array(cols).fill(0)
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    const h = estimateItemHeight(item)
    const lengths = columns.map((col) => col.length)
    const minCount = lengths.length === 0 ? 0 : Math.min(...lengths)
    let best = -1
    for (let c = 0; c < cols; c++) {
      if (columns[c].length > minCount + 1) continue
      if (best === -1 || columnHeights[c] < columnHeights[best]) best = c
      else if (columnHeights[c] === columnHeights[best] && columns[c].length < columns[best].length) best = c
    }
    if (best === -1) best = 0
    columns[best].push({ item, originalIndex: i })
    columnHeights[best] += h
  }
  return columns
}

/** Given columns from distributeByHeight, return the index of the card directly above or below the one at currentIndex, or currentIndex if none. */
function indexAbove(
  columns: Array<Array<{ item: TimelineItem; originalIndex: number }>>,
  currentIndex: number
): number {
  for (let c = 0; c < columns.length; c++) {
    const row = columns[c].findIndex((e) => e.originalIndex === currentIndex)
    if (row > 0) return columns[c][row - 1].originalIndex
    if (row === 0) return currentIndex
  }
  return currentIndex
}

function indexBelow(
  columns: Array<Array<{ item: TimelineItem; originalIndex: number }>>,
  currentIndex: number
): number {
  for (let c = 0; c < columns.length; c++) {
    const row = columns[c].findIndex((e) => e.originalIndex === currentIndex)
    if (row >= 0 && row < columns[c].length - 1) return columns[c][row + 1].originalIndex
    if (row >= 0) return currentIndex
  }
  return currentIndex
}

/** Vertical overlap (shared space) between two rects in px. */
function verticalOverlap(a: DOMRect, b: DOMRect): number {
  const top = Math.max(a.top, b.top)
  const bottom = Math.min(a.bottom, b.bottom)
  return Math.max(0, bottom - top)
}

/**
 * Left nav: pick the card in the left column with the most vertical overlap.
 * If no card in that column has a valid rect (none loaded yet), stay put.
 */
function indexLeftClosest(
  columns: Array<Array<{ item: TimelineItem; originalIndex: number }>>,
  currentIndex: number,
  getRect: (index: number) => DOMRect | undefined
): number {
  for (let c = 0; c < columns.length; c++) {
    if (columns[c].findIndex((e) => e.originalIndex === currentIndex) < 0) continue
    if (c === 0) return currentIndex
    const leftCol = columns[c - 1]
    const currentRect = getRect(currentIndex)
    if (!currentRect) return currentIndex
    let bestIndex = currentIndex
    let bestOverlap = -1
    for (const { originalIndex } of leftCol) {
      const r = getRect(originalIndex)
      if (!r) continue
      const overlap = verticalOverlap(currentRect, r)
      if (overlap > 0 && overlap > bestOverlap) {
        bestOverlap = overlap
        bestIndex = originalIndex
      }
    }
    return bestIndex
  }
  return currentIndex
}

/**
 * Right nav: pick the card in the right column with the most vertical overlap.
 * If no card in that column has a valid rect (none loaded yet), stay put.
 */
function indexRightClosest(
  columns: Array<Array<{ item: TimelineItem; originalIndex: number }>>,
  currentIndex: number,
  getRect: (index: number) => DOMRect | undefined
): number {
  for (let c = 0; c < columns.length; c++) {
    if (columns[c].findIndex((e) => e.originalIndex === currentIndex) < 0) continue
    if (c === columns.length - 1) return currentIndex
    const rightCol = columns[c + 1]
    const currentRect = getRect(currentIndex)
    if (!currentRect) return currentIndex
    let bestIndex = currentIndex
    let bestOverlap = -1
    for (const { originalIndex } of rightCol) {
      const r = getRect(originalIndex)
      if (!r) continue
      const overlap = verticalOverlap(currentRect, r)
      if (overlap > 0 && overlap > bestOverlap) {
        bestOverlap = overlap
        bestIndex = originalIndex
      }
    }
    return bestIndex
  }
  return currentIndex
}

export default function FeedPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const navigationType = useNavigationType()
  const { openLoginModal } = useLoginModal()
  const { session } = useSession()
  const { viewMode } = useViewMode()
  const [source, setSource] = useState<FeedSource>(PRESET_SOURCES[0])
  const [, setSavedFeedSources] = useState<FeedSource[]>([])
  const [items, setItems] = useState<TimelineItem[]>([])
  const [cursor, setCursor] = useState<string | undefined>()
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** One sentinel per column so we load more when the user nears the bottom of any column (avoids blank space in short columns). */
  const loadMoreSentinelRefs = useRef<(HTMLDivElement | null)[]>([])
  const loadingMoreRef = useRef(false)
  const [keyboardFocusIndex, setKeyboardFocusIndex] = useState(0)
  const [keyboardAddOpen, setKeyboardAddOpen] = useState(false)
  const [actionsMenuOpenForIndex, setActionsMenuOpenForIndex] = useState<number | null>(null)
  const { openPostModal, isModalOpen } = useProfileModal()
  const cardRefsRef = useRef<(HTMLDivElement | null)[]>([])
  /** Refs for focused media elements: [cardIndex][mediaIndex] for scroll-into-view on multi-image posts */
  const mediaRefsRef = useRef<Record<number, Record<number, HTMLElement | null>>>({})
  const mediaItemsRef = useRef<TimelineItem[]>([])
  const keyboardFocusIndexRef = useRef(0)
  const actionsMenuOpenForIndexRef = useRef<number | null>(null)
  const lastScrollIntoViewIndexRef = useRef<number>(-1)
  /** Only scroll into view when focus was changed by keyboard (W/S/A/D), not by mouse hover */
  const scrollIntoViewFromKeyboardRef = useRef(false)
  /** Only update focus on mouse enter when the user has actually moved the mouse (not when scroll moved content under cursor) */
  const mouseMovedRef = useRef(false)
  /** True after W/S/A/D nav so we suppress hover outline on non-selected cards (focus is not moved to the card) */
  const [keyboardNavActive, setKeyboardNavActive] = useState(false)
  /** When true, focus was set by mouse hover – don’t lift one image in multi-image cards; only keyboard A/D should */
  const [focusSetByMouse, setFocusSetByMouse] = useState(false)
  const [blockConfirm, setBlockConfirm] = useState<{ did: string; handle: string; avatar?: string } | null>(null)
  const blockCancelRef = useRef<HTMLButtonElement>(null)
  const blockConfirmRef = useRef<HTMLButtonElement>(null)
  const [likeOverrides, setLikeOverrides] = useState<Record<string, string | null>>({})
  const [seenUris, setSeenUris] = useState<Set<string>>(loadSeenUris)
  /** Snapshot of seen URIs at last “reset” (refresh or navigate to feed); only these are hidden from the list. Newly seen posts while scrolling stay visible (darkened). */
  const [seenUrisAtReset, setSeenUrisAtReset] = useState<Set<string>>(() => new Set(loadSeenUris()))
  const prevPathnameRef = useRef(location.pathname)
  const seenUrisRef = useRef(seenUris)
  seenUrisRef.current = seenUris
  const seenPostsContext = useSeenPosts()

  // Register clear-seen handler so that long-press on Home can bring back all hidden (seen) items.
  useEffect(() => {
    if (!seenPostsContext) return
    seenPostsContext.setClearSeenHandler(() => {
      try {
        localStorage.removeItem(SEEN_POSTS_KEY)
      } catch {
        // ignore
      }
      seenUrisRef.current = new Set()
      setSeenUris(new Set())
      setSeenUrisAtReset(new Set())
    })
    return () => {
      seenPostsContext.setClearSeenHandler(null)
    }
  }, [seenPostsContext])

  // When Home/logo is clicked while already on feed: hide seen posts (take snapshot) and scroll to top.
  // Defer to next frame so any IntersectionObserver callbacks from the same tick run first and seenUrisRef is up to date (fixes "two clicks" on logo/Home).
  useEffect(() => {
    if (!seenPostsContext) return
    seenPostsContext.setHomeClickHandler(() => {
      requestAnimationFrame(() => {
        setSeenUrisAtReset(new Set(seenUrisRef.current))
        window.scrollTo(0, 0)
      })
    })
    return () => {
      seenPostsContext.setHomeClickHandler(null)
    }
  }, [seenPostsContext])

  const loadSavedFeeds = useCallback(async () => {
    if (!session) {
      setSavedFeedSources([])
      return
    }
    try {
      const list = await getSavedFeedsFromPreferences()
      const feeds = list.filter((f) => f.type === 'feed' && f.pinned)
      const withLabels = await Promise.all(
        feeds.map(async (f) => ({
          kind: 'custom' as const,
          label: await getFeedDisplayName(f.value).catch(() => f.value),
          uri: f.value,
        }))
      )
      setSavedFeedSources(withLabels)
    } catch {
      setSavedFeedSources([])
    }
  }, [session])

  useEffect(() => {
    loadSavedFeeds()
  }, [loadSavedFeeds])

  // When landing on the feed (refresh or logo/feed button): scroll to top and take snapshot of seen URIs so only those are hidden; newly seen posts while scrolling stay visible.
  useEffect(() => {
    const pathnameChanged = prevPathnameRef.current !== location.pathname
    const isFeed = location.pathname === '/' || location.pathname.startsWith('/feed')
    if (isFeed && pathnameChanged) setSeenUrisAtReset(new Set(seenUris))
    prevPathnameRef.current = location.pathname
    if (navigationType !== 'POP' && pathnameChanged) window.scrollTo(0, 0)
  }, [location.pathname, navigationType, seenUris])

  useEffect(() => {
    const stateSource = (location.state as { feedSource?: FeedSource })?.feedSource
    if (stateSource) {
      setSource(stateSource)
      navigate(location.pathname, { replace: true })
    }
  }, [location.state, location.pathname, navigate])

  const {
    entries: mixEntries,
    totalPercent: mixTotalPercent,
  } = useFeedMix()
  const feedSwipe = useFeedSwipe()

  const swipeStartRef = useRef<{ x: number; y: number } | null>(null)
  const swipeGestureRef = useRef<'unknown' | 'swipe' | 'pull'>('unknown')

  function sameFeedSource(a: FeedSource, b: FeedSource): boolean {
    return (a.uri ?? a.label) === (b.uri ?? b.label)
  }

  const load = useCallback(async (nextCursor?: string) => {
    const cols = Math.min(3, Math.max(1, viewMode === '1' ? 1 : viewMode === '2' ? 2 : 3))
    const limit = cols >= 2 ? cols * 10 : 30
    try {
      if (nextCursor) setLoadingMore(true)
      else setLoading(true)
      setError(null)
      if (!session) {
        const { feed, cursor: next } = await getGuestFeed(limit, nextCursor)
        setItems((prev) => (nextCursor ? [...prev, ...feed] : feed))
        setCursor(next)
      } else if (mixEntries.length >= 2 && mixTotalPercent >= 99) {
        const isLoadMore = !!nextCursor
        let cursorsToUse: Record<string, string> | undefined
        if (isLoadMore && nextCursor) {
          try {
            cursorsToUse = JSON.parse(nextCursor) as Record<string, string>
          } catch {
            cursorsToUse = undefined
          }
        }
        const { feed, cursors: nextCursors } = await getMixedFeed(
          mixEntries.map((e) => ({ source: e.source, percent: e.percent })),
          limit,
          cursorsToUse
        )
        setItems((prev) => (isLoadMore ? [...prev, ...feed] : feed))
        setCursor(Object.keys(nextCursors).length > 0 ? JSON.stringify(nextCursors) : undefined)
      } else if (mixEntries.length === 1) {
        const single = mixEntries[0].source
        if (single.kind === 'timeline') {
          const res = await agent.getTimeline({ limit, cursor: nextCursor })
          setItems((prev) => (nextCursor ? [...prev, ...res.data.feed] : res.data.feed))
          setCursor(res.data.cursor ?? undefined)
        } else if (single.uri) {
          const res = await agent.app.bsky.feed.getFeed({ feed: single.uri, limit, cursor: nextCursor })
          setItems((prev) => (nextCursor ? [...prev, ...res.data.feed] : res.data.feed))
          setCursor(res.data.cursor ?? undefined)
        }
      } else if (source.kind === 'timeline') {
        const res = await agent.getTimeline({ limit, cursor: nextCursor })
        setItems((prev) => (nextCursor ? [...prev, ...res.data.feed] : res.data.feed))
        setCursor(res.data.cursor ?? undefined)
      } else if (source.uri) {
        const res = await agent.app.bsky.feed.getFeed({ feed: source.uri, limit, cursor: nextCursor })
        setItems((prev) => (nextCursor ? [...prev, ...res.data.feed] : res.data.feed))
        setCursor(res.data.cursor ?? undefined)
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load feed'
      setError(msg)
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [source, session, mixEntries, mixTotalPercent])

  useEffect(() => {
    load()
  }, [load])

  // Infinite scroll: load more when any column's sentinel enters view (so short columns trigger load before blank space shows)
  loadingMoreRef.current = loadingMore
  useEffect(() => {
    if (!cursor) return
    const refs = loadMoreSentinelRefs.current
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && !loadingMoreRef.current) {
            loadingMoreRef.current = true
            load(cursor)
            break
          }
        }
      },
      { rootMargin: '600px', threshold: 0 }
    )
    const cols = Math.min(3, Math.max(1, viewMode === '1' ? 1 : viewMode === '2' ? 2 : 3))
    for (let c = 0; c < cols; c++) {
      const el = refs[c]
      if (el) observer.observe(el)
    }
    return () => observer.disconnect()
  }, [cursor, load, viewMode])

  const { mediaOnly } = useMediaOnly()
  const { nsfwPreference, unblurredUris, setUnblurred } = useModeration()
  const displayItems = items
    .filter((item) => (mediaOnly ? getPostMediaInfo(item.post) : true))
    .filter((item) => !seenUrisAtReset.has(item.post.uri))
    .filter((item) => nsfwPreference !== 'sfw' || !isPostNsfw(item.post))
  const itemsAfterOtherFilters = items
    .filter((item) => (mediaOnly ? getPostMediaInfo(item.post) : true))
    .filter((item) => nsfwPreference !== 'sfw' || !isPostNsfw(item.post))
  const emptyBecauseAllSeen = displayItems.length === 0 && itemsAfterOtherFilters.length > 0
  const cols = Math.min(3, Math.max(1, viewMode === '1' ? 1 : viewMode === '2' ? 2 : 3))
  /** Flat list of focus targets: one per media item per post (multi-image posts get multiple entries). */
  const focusTargets = useMemo(() => {
    const out: { cardIndex: number; mediaIndex: number }[] = []
    displayItems.forEach((item, cardIndex) => {
      const all = getPostAllMediaForDisplay(item.post)
      const n = Math.max(1, all.length)
      for (let m = 0; m < n; m++) out.push({ cardIndex, mediaIndex: m })
    })
    return out
  }, [displayItems])
  /** First focus index for each card (top image; for S and A/D). */
  const firstFocusIndexForCard = useMemo(() => {
    const out: number[] = []
    let idx = 0
    displayItems.forEach((item, cardIndex) => {
      out[cardIndex] = idx
      const all = getPostAllMediaForDisplay(item.post)
      idx += Math.max(1, all.length)
    })
    return out
  }, [displayItems])
  /** Last focus index for each card (bottom image; for W when moving to card above). */
  const lastFocusIndexForCard = useMemo(() => {
    const out: number[] = []
    displayItems.forEach((item, cardIndex) => {
      const all = getPostAllMediaForDisplay(item.post)
      const n = Math.max(1, all.length)
      out[cardIndex] = firstFocusIndexForCard[cardIndex] + n - 1
    })
    return out
  }, [displayItems, firstFocusIndexForCard])
  mediaItemsRef.current = displayItems
  keyboardFocusIndexRef.current = keyboardFocusIndex
  actionsMenuOpenForIndexRef.current = actionsMenuOpenForIndex

  useEffect(() => {
    setKeyboardFocusIndex((i) => {
      if (i < 0) return i
      if (focusTargets.length === 0) return 0
      return Math.min(i, focusTargets.length - 1)
    })
  }, [focusTargets.length])

  useEffect(() => {
    saveSeenUris(seenUris)
  }, [seenUris])

  // Mark posts as seen when scrolled past (card top above viewport)
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting && entry.boundingClientRect.top < 0) {
            const uri = (entry.target as HTMLElement).getAttribute('data-post-uri')
            if (uri) {
              const next = new Set(seenUrisRef.current).add(uri)
              seenUrisRef.current = next
              setSeenUris(next)
            }
          }
        }
      },
      { threshold: 0, rootMargin: '0px' }
    )
    for (let i = 0; i < displayItems.length; i++) {
      const el = cardRefsRef.current[i]
      if (el) observer.observe(el)
    }
    return () => observer.disconnect()
  }, [displayItems.length])

  useEffect(() => {
    const onMouseMove = () => { mouseMovedRef.current = true }
    window.addEventListener('mousemove', onMouseMove)
    return () => window.removeEventListener('mousemove', onMouseMove)
  }, [])

  // Scroll focused card/media into view only when focus was changed by keyboard (W/S/A/D), not on mouse hover
  useEffect(() => {
    if (!scrollIntoViewFromKeyboardRef.current) return
    scrollIntoViewFromKeyboardRef.current = false
    if (keyboardFocusIndex === lastScrollIntoViewIndexRef.current) return
    lastScrollIntoViewIndexRef.current = keyboardFocusIndex
    const target = focusTargets[keyboardFocusIndex]
    const raf = requestAnimationFrame(() => {
      const cardIndex = target?.cardIndex ?? keyboardFocusIndex
      const mediaIndex = target?.mediaIndex ?? 0
      const mediaEl = mediaRefsRef.current[cardIndex]?.[mediaIndex]
      const el = mediaEl ?? cardRefsRef.current[cardIndex]
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' })
      }
    })
    return () => cancelAnimationFrame(raf)
  }, [keyboardFocusIndex, focusTargets])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      /* Never affect feed when a popup is open: check both context and URL (URL covers first render after open). */
      const hasContentModalInUrl = /[?&](post|profile|tag|forumPost|artboard)=/.test(location.search)
      if (isModalOpen || hasContentModalInUrl) return
      const eventTarget = e.target as HTMLElement
      if (eventTarget.tagName === 'INPUT' || eventTarget.tagName === 'TEXTAREA' || eventTarget.tagName === 'SELECT' || eventTarget.isContentEditable) {
        if (e.key === 'Escape') {
          e.preventDefault()
          eventTarget.blur()
        }
        return
      }
      if (e.ctrlKey || e.metaKey) return

      const items = mediaItemsRef.current // displayItems
      const i = keyboardFocusIndexRef.current
      if (items.length === 0 || focusTargets.length === 0) return

      setFocusSetByMouse(false)
      const focusTarget = focusTargets[i]
      const currentCardIndex = focusTarget?.cardIndex ?? 0

      const key = e.key.toLowerCase()
      const focusInActionsMenu = (document.activeElement as HTMLElement)?.closest?.('[role="menu"]')
      const menuOpenForFocusedCard = actionsMenuOpenForIndex === currentCardIndex
      if ((focusInActionsMenu || menuOpenForFocusedCard) && (key === 'w' || key === 's' || key === 'e' || key === 'enter' || key === 'q' || key === 'escape')) {
        return
      }
      /* Ignore key repeat for left/right only (so A/D don’t skip); allow repeat for W/S so holding moves up/down */
      if (e.repeat && (key === 'a' || key === 'd' || e.key === 'ArrowLeft' || e.key === 'ArrowRight')) return
      if (blockConfirm) {
        if (key === 'escape') {
          e.preventDefault()
          setBlockConfirm(null)
          return
        }
        return // let Tab/Enter reach the dialog buttons
      }
      if (key === 'w' || key === 's' || key === 'a' || key === 'd' || key === 'e' || key === 'enter' || key === 'r' || key === 'f' || key === 'c' || key === 'h' || key === 'b' || key === 'm' || key === '`' || key === '4' || e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') e.preventDefault()

      if (key === 'b') {
        const item = items[currentCardIndex]
        if (item?.post?.author && session?.did !== item.post.author.did) {
          setBlockConfirm({
            did: item.post.author.did,
            handle: item.post.author.handle ?? item.post.author.did,
            avatar: item.post.author.avatar,
          })
          requestAnimationFrame(() => blockCancelRef.current?.focus())
        }
        return
      }

      /* Use ref + concrete value (not functional updater) so Strict Mode double-invoke doesn't move two steps */
      const fromNone = i < 0
      const columns = cols >= 2 ? distributeByHeight(items, cols) : null
      const getRect = (idx: number) => cardRefsRef.current[idx]?.getBoundingClientRect()
      if (key === 'w' || e.key === 'ArrowUp') {
        mouseMovedRef.current = false
        setKeyboardNavActive(true)
        scrollIntoViewFromKeyboardRef.current = true
        const onFirstImageOfCard = i === firstFocusIndexForCard[currentCardIndex]
        const next = fromNone
          ? (lastFocusIndexForCard[items.length - 1] ?? focusTargets.length - 1)
          : !onFirstImageOfCard
            ? Math.max(0, i - 1)
            : (() => {
                const nextCard = cols >= 2 && columns ? indexAbove(columns, currentCardIndex) : Math.max(0, currentCardIndex - 1)
                return lastFocusIndexForCard[nextCard] ?? firstFocusIndexForCard[nextCard] ?? 0
              })()
        setKeyboardFocusIndex(next)
        return
      }
      if (key === 's' || e.key === 'ArrowDown') {
        mouseMovedRef.current = false
        setKeyboardNavActive(true)
        scrollIntoViewFromKeyboardRef.current = true
        const onLastImageOfCard = i === lastFocusIndexForCard[currentCardIndex]
        const next = fromNone
          ? 0
          : !onLastImageOfCard
            ? Math.min(focusTargets.length - 1, i + 1)
            : (() => {
                const nextCard = cols >= 2 && columns ? indexBelow(columns, currentCardIndex) : Math.min(items.length - 1, currentCardIndex + 1)
                return firstFocusIndexForCard[nextCard] ?? i
              })()
        setKeyboardFocusIndex(next)
        return
      }
      if (key === 'a' || e.key === 'ArrowLeft') {
        mouseMovedRef.current = false
        setKeyboardNavActive(true)
        scrollIntoViewFromKeyboardRef.current = true
        const nextCard = fromNone ? 0 : cols >= 2 && columns ? indexLeftClosest(columns, currentCardIndex, getRect) : currentCardIndex
        const next = fromNone ? 0 : nextCard !== currentCardIndex ? (lastFocusIndexForCard[nextCard] ?? i) : i
        if (next !== i) setActionsMenuOpenForIndex(null)
        setKeyboardFocusIndex(next)
        return
      }
      if (key === 'd' || e.key === 'ArrowRight') {
        mouseMovedRef.current = false
        setKeyboardNavActive(true)
        scrollIntoViewFromKeyboardRef.current = true
        const nextCard = fromNone ? 0 : cols >= 2 && columns ? indexRightClosest(columns, currentCardIndex, getRect) : currentCardIndex
        const next = fromNone ? 0 : nextCard !== currentCardIndex ? (lastFocusIndexForCard[nextCard] ?? i) : i
        if (next !== i) setActionsMenuOpenForIndex(null)
        setKeyboardFocusIndex(next)
        return
      }
      if ((key === 'm' || key === '`') && i >= 0) {
        if (menuOpenForFocusedCard) {
          setActionsMenuOpenForIndex(null)
        } else {
          setActionsMenuOpenForIndex(currentCardIndex)
        }
        return
      }
      if (key === 'e' || key === 'enter') {
        const item = items[currentCardIndex]
        if (item) openPostModal(item.post.uri)
        return
      }
      if (key === 'r') {
        const item = items[currentCardIndex]
        if (item) openPostModal(item.post.uri, true)
        return
      }
      if (key === 'f') {
        const item = items[currentCardIndex]
        if (!item?.post?.uri || !item?.post?.cid) return
        const uri = item.post.uri
        const currentLikeUri = uri in likeOverrides ? (likeOverrides[uri] ?? undefined) : (item.post as { viewer?: { like?: string } }).viewer?.like
        if (currentLikeUri) {
          agent.deleteLike(currentLikeUri).then(() => {
            setLikeOverrides((prev) => ({ ...prev, [uri]: null }))
          }).catch(() => {})
        } else {
          agent.like(uri, item.post.cid).then((res) => {
            setLikeOverrides((prev) => ({ ...prev, [uri]: res.uri }))
          }).catch(() => {})
        }
        return
      }
      if (key === 'c') {
        setKeyboardAddOpen(true)
        return
      }
      if (key === '4') {
        const item = items[currentCardIndex]
        const author = item?.post?.author as { did: string; viewer?: { following?: string } } | undefined
        if (author && session?.did && session.did !== author.did) {
          const postUri = item.post.uri
          const followingUri = author.viewer?.following
          if (followingUri) {
            agent.deleteFollow(followingUri).then(() => {
              setItems((prev) =>
                prev.map((it): TimelineItem => {
                  if (it.post.uri !== postUri) return it
                  const post = it.post
                  const auth = post.author as { did: string; handle?: string; viewer?: { following?: string } }
                  return {
                    ...it,
                    post: {
                      ...post,
                      author: {
                        ...auth,
                        viewer: { ...auth.viewer, following: undefined },
                      },
                    } as TimelineItem['post'],
                  }
                })
              )
            }).catch(() => {})
          } else {
            agent.follow(author.did).then((res) => {
              setItems((prev) =>
                prev.map((it): TimelineItem => {
                  if (it.post.uri !== postUri) return it
                  const post = it.post
                  const auth = post.author as { did: string; handle?: string; viewer?: { following?: string } }
                  return {
                    ...it,
                    post: {
                      ...post,
                      author: {
                        ...auth,
                        viewer: { ...auth.viewer, following: res.uri },
                      },
                    } as TimelineItem['post'],
                  }
                })
              )
            }).catch(() => {})
          }
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [location.search, cols, isModalOpen, openPostModal, blockConfirm, session, likeOverrides, actionsMenuOpenForIndex, focusTargets, firstFocusIndexForCard, lastFocusIndexForCard])

  useEffect(() => {
    if (blockConfirm) blockCancelRef.current?.focus()
  }, [blockConfirm])

  const pullRefreshTargetRef = useRef<HTMLDivElement>(null)
  const pullRefresh = usePullToRefresh({
    scrollRef: { current: null },
    touchTargetRef: pullRefreshTargetRef,
    onRefresh: () => load(),
    enabled: true,
  })

  const swipeEnabled =
    !!feedSwipe && mixEntries.length === 1 && feedSwipe.feedSources.length > 1

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      pullRefresh.onTouchStart(e)
      if (swipeEnabled && e.touches.length === 1) {
        swipeStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
        swipeGestureRef.current = 'unknown'
      }
    },
    [swipeEnabled, pullRefresh]
  )

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (swipeEnabled && swipeStartRef.current && e.touches.length === 1) {
        if (swipeGestureRef.current === 'unknown') {
          const dx = e.touches[0].clientX - swipeStartRef.current.x
          const dy = e.touches[0].clientY - swipeStartRef.current.y
          if (Math.abs(dx) > 20 || Math.abs(dy) > 20) {
            swipeGestureRef.current = Math.abs(dx) > 2 * Math.abs(dy) ? 'swipe' : 'pull'
          }
        }
        if (swipeGestureRef.current === 'pull' || swipeGestureRef.current === 'unknown') {
          pullRefresh.onTouchMove(e)
        }
      } else {
        pullRefresh.onTouchMove(e)
      }
    },
    [swipeEnabled, pullRefresh]
  )

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (swipeEnabled && feedSwipe && swipeStartRef.current && e.changedTouches.length === 1) {
        const dx = e.changedTouches[0].clientX - swipeStartRef.current.x
        const dy = e.changedTouches[0].clientY - swipeStartRef.current.y
        if (
          swipeGestureRef.current === 'swipe' &&
          Math.abs(dx) > 80 &&
          Math.abs(dx) > 2 * Math.abs(dy)
        ) {
          const sources = feedSwipe.feedSources
          const cur = mixEntries[0].source
          const idx = sources.findIndex((s) => sameFeedSource(s, cur))
          if (idx >= 0) {
            const nextIdx = dx < 0 ? (idx + 1) % sources.length : (idx - 1 + sources.length) % sources.length
            feedSwipe.setSingleFeed(sources[nextIdx])
          }
        }
        swipeStartRef.current = null
        swipeGestureRef.current = 'unknown'
      }
      pullRefresh.onTouchEnd(e)
    },
    [swipeEnabled, feedSwipe, mixEntries, pullRefresh]
  )

  return (
    <Layout title="Feed" showNav>
      <>
      <div
        ref={pullRefreshTargetRef}
        className={styles.wrap}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div
          key={mixEntries.length === 1 ? (mixEntries[0].source.uri ?? mixEntries[0].source.label) : 'mixed'}
          className={styles.feedContentTransition}
        >
        {error && <p className={styles.error}>{error}</p>}
        {loading ? (
          <div className={styles.loading}>Loading…</div>
        ) : displayItems.length === 0 ? (
          <div className={styles.empty}>
            {emptyBecauseAllSeen
              ? <>You've seen all the posts in this feed.<br />New posts will appear as they're posted.</>
              : mediaOnly
                ? 'No posts with images or videos in this feed.'
                : 'No posts in this feed.'}
          </div>
        ) : (
          <>
            <div
              className={`${styles.gridColumns} ${styles[`gridView${viewMode}`]}`}
              data-feed-cards
              data-view-mode={viewMode}
              data-keyboard-nav={keyboardNavActive || undefined}
              onMouseLeave={() => setKeyboardFocusIndex(-1)}
            >
              {distributeByHeight(displayItems, cols).map((column, colIndex) => (
                <div key={colIndex} className={styles.gridColumn}>
                  {column.map(({ item, originalIndex }) => (
                    <div
                      key={item.post.uri}
                      className={styles.gridItem}
                      onMouseEnter={() => {
                        if (mouseMovedRef.current) {
                          mouseMovedRef.current = false
                          setKeyboardNavActive(false)
                          setFocusSetByMouse(true)
                          setKeyboardFocusIndex(firstFocusIndexForCard[originalIndex] ?? 0)
                        }
                      }}
                    >
                      <PostCard
                        item={item}
                        isSelected={focusTargets[keyboardFocusIndex]?.cardIndex === originalIndex}
                        focusedMediaIndex={
                          focusTargets[keyboardFocusIndex]?.cardIndex === originalIndex && !(focusSetByMouse && getPostAllMediaForDisplay(item.post).length > 1)
                            ? focusTargets[keyboardFocusIndex]?.mediaIndex
                            : undefined
                        }
                        onMediaRef={(mediaIndex, el) => {
                          if (!mediaRefsRef.current[originalIndex]) mediaRefsRef.current[originalIndex] = {}
                          mediaRefsRef.current[originalIndex][mediaIndex] = el
                        }}
                        cardRef={(el) => { cardRefsRef.current[originalIndex] = el }}
                        openAddDropdown={focusTargets[keyboardFocusIndex]?.cardIndex === originalIndex && keyboardAddOpen}
                        onAddClose={() => setKeyboardAddOpen(false)}
                        onActionsMenuOpenChange={(open) => setActionsMenuOpenForIndex(open ? originalIndex : null)}
                        cardIndex={originalIndex}
                        actionsMenuOpenForIndex={actionsMenuOpenForIndex}
                        onPostClick={(uri, opts) => openPostModal(uri, opts?.openReply)}
                        onAspectRatio={undefined}
                        fillCell={false}
                        nsfwBlurred={nsfwPreference === 'blurred' && isPostNsfw(item.post) && !unblurredUris.has(item.post.uri)}
                        onNsfwUnblur={() => setUnblurred(item.post.uri, true)}
                        likedUriOverride={likeOverrides[item.post.uri]}
                        onLikedChange={(uri, likeRecordUri) => setLikeOverrides((prev) => ({ ...prev, [uri]: likeRecordUri ?? null }))}
                        seen={seenUris.has(item.post.uri)}
                      />
                    </div>
                  ))}
                  {cursor && (
                    <div
                      ref={(el) => { loadMoreSentinelRefs.current[colIndex] = el }}
                      className={styles.loadMoreSentinel}
                      aria-hidden
                    />
                  )}
                </div>
              ))}
            </div>
            {session && (
              <div className={styles.loadMoreRow}>
                {loadingMore && (
                  <p className={styles.loadingMore} role="status">Loading more…</p>
                )}
                <button
                  type="button"
                  className={styles.loadMoreBtn}
                  onClick={() => cursor && !loadingMore && load(cursor)}
                  disabled={loadingMore || !cursor}
                >
                  {cursor ? 'Load more' : 'No more posts'}
                </button>
              </div>
            )}
          </>
        )}
        </div>
        {!session && (
          <div className={styles.feedLoginHint}>
            <div className={styles.feedLoginHintBtnRow}>
              <button type="button" className={styles.feedLoginHintBtn} onClick={() => openLoginModal()}>
                Log in
              </button>
            </div>
            <p className={styles.feedLoginHintText}>
              Or{' '}
              <button type="button" className={styles.feedLoginHintLink} onClick={() => openLoginModal('create')}>
                create an account
              </button>
              {' to see your own feeds.'}
            </p>
          </div>
        )}
      </div>
      {blockConfirm && (
        <div
          className={styles.blockOverlay}
          role="dialog"
          aria-modal="true"
          aria-labelledby="block-dialog-title"
          onKeyDown={(e) => e.key === 'Escape' && setBlockConfirm(null)}
          onClick={() => setBlockConfirm(null)}
        >
          <div className={styles.blockDialog} onClick={(e) => e.stopPropagation()}>
            <h2 id="block-dialog-title" className={styles.blockTitle}>Block user?</h2>
            <div className={styles.blockUser}>
              {blockConfirm.avatar ? (
                <img src={blockConfirm.avatar} alt="" className={styles.blockAvatar} loading="lazy" />
              ) : (
                <div className={styles.blockAvatarPlaceholder} />
              )}
              <span className={styles.blockHandle}>@{blockConfirm.handle}</span>
            </div>
            <div className={styles.blockActions}>
              <button
                ref={blockCancelRef}
                type="button"
                className={styles.blockCancelBtn}
                onClick={() => setBlockConfirm(null)}
              >
                Cancel
              </button>
              <button
                ref={blockConfirmRef}
                type="button"
                className={styles.blockConfirmBtn}
                onClick={async () => {
                  if (!blockConfirm) return
                  try {
                    await blockAccount(blockConfirm.did)
                    setBlockConfirm(null)
                  } catch (_) {}
                }}
              >
                Block
              </button>
            </div>
          </div>
        </div>
      )}
      </>
    </Layout>
  )
}
