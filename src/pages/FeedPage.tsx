import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useNavigationType } from 'react-router-dom'
import {
  agent,
  getPostMediaInfo,
  getGuestFeed,
  getSavedFeedsFromPreferences,
  getFeedDisplayName,
  resolveFeedUri,
  addSavedFeed,
  getMixedFeed,
  isPostNsfw,
  type TimelineItem,
} from '../lib/bsky'
import type { FeedSource } from '../types'
import FeedSelector from '../components/FeedSelector'
import PostCard from '../components/PostCard'
import Layout from '../components/Layout'
import { useProfileModal } from '../context/ProfileModalContext'
import { useSession } from '../context/SessionContext'
import { useHiddenPosts } from '../context/HiddenPostsContext'
import { useMediaOnly } from '../context/MediaOnlyContext'
import { useFeedMix } from '../context/FeedMixContext'
import { blockAccount } from '../lib/bsky'
import { useViewMode } from '../context/ViewModeContext'
import { useModeration } from '../context/ModerationContext'
import styles from './FeedPage.module.css'

const PRESET_SOURCES: FeedSource[] = [
  { kind: 'timeline', label: 'Following' },
  { kind: 'custom', label: "What's Hot", uri: 'at://did:plc:z72i7hdynmk6r22z27h6tvur/app.bsky.feed.generator/whats-hot' },
]

function sameSource(a: FeedSource, b: FeedSource): boolean {
  return (a.uri ?? a.label) === (b.uri ?? b.label)
}

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

/** Distribute items across columns so each column's estimated total height is roughly equal. */
function distributeByHeight(
  items: TimelineItem[],
  numCols: number
): Array<Array<{ item: TimelineItem; originalIndex: number }>> {
  const columns: Array<Array<{ item: TimelineItem; originalIndex: number }>> = Array.from(
    { length: numCols },
    () => []
  )
  const columnHeights: number[] = Array(numCols).fill(0)
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    const h = estimateItemHeight(item)
    let shortest = 0
    for (let c = 1; c < numCols; c++) {
      if (columnHeights[c] < columnHeights[shortest]) shortest = c
    }
    columns[shortest].push({ item, originalIndex: i })
    columnHeights[shortest] += h
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

/** Same row, column to the left; stays put if already in leftmost column. */
function indexLeftByRow(
  columns: Array<Array<{ item: TimelineItem; originalIndex: number }>>,
  currentIndex: number
): number {
  for (let c = 0; c < columns.length; c++) {
    const row = columns[c].findIndex((e) => e.originalIndex === currentIndex)
    if (row < 0) continue
    if (c === 0) return currentIndex
    const leftCol = columns[c - 1]
    if (row < leftCol.length) return leftCol[row].originalIndex
    return currentIndex
  }
  return currentIndex
}

/** Same row, column to the right; stays put if already in rightmost column. */
function indexRightByRow(
  columns: Array<Array<{ item: TimelineItem; originalIndex: number }>>,
  currentIndex: number
): number {
  for (let c = 0; c < columns.length; c++) {
    const row = columns[c].findIndex((e) => e.originalIndex === currentIndex)
    if (row < 0) continue
    if (c === columns.length - 1) return currentIndex
    const rightCol = columns[c + 1]
    if (row < rightCol.length) return rightCol[row].originalIndex
    return currentIndex
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
 * Left/right nav by shared vertical space: pick the card in the adjacent column that
 * shares the most vertical overlap with the currently focused card.
 */
function indexLeftClosest(
  columns: Array<Array<{ item: TimelineItem; originalIndex: number }>>,
  currentIndex: number,
  getRect: (index: number) => DOMRect | undefined
): number {
  for (let c = 0; c < columns.length; c++) {
    const row = columns[c].findIndex((e) => e.originalIndex === currentIndex)
    if (row < 0) continue
    if (c === 0) return currentIndex
    const leftCol = columns[c - 1]
    const currentRect = getRect(currentIndex)
    if (!currentRect) return indexLeftByRow(columns, currentIndex)
    let bestIndex = leftCol[0].originalIndex
    let bestOverlap = -1
    for (const { originalIndex } of leftCol) {
      const r = getRect(originalIndex)
      if (!r) continue
      const overlap = verticalOverlap(currentRect, r)
      if (overlap > bestOverlap) {
        bestOverlap = overlap
        bestIndex = originalIndex
      }
    }
    return bestIndex
  }
  return currentIndex
}

function indexRightClosest(
  columns: Array<Array<{ item: TimelineItem; originalIndex: number }>>,
  currentIndex: number,
  getRect: (index: number) => DOMRect | undefined
): number {
  for (let c = 0; c < columns.length; c++) {
    const row = columns[c].findIndex((e) => e.originalIndex === currentIndex)
    if (row < 0) continue
    if (c === columns.length - 1) return currentIndex
    const rightCol = columns[c + 1]
    const currentRect = getRect(currentIndex)
    if (!currentRect) return indexRightByRow(columns, currentIndex)
    let bestIndex = rightCol[0].originalIndex
    let bestOverlap = -1
    for (const { originalIndex } of rightCol) {
      const r = getRect(originalIndex)
      if (!r) continue
      const overlap = verticalOverlap(currentRect, r)
      if (overlap > bestOverlap) {
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
  const { session } = useSession()
  const { viewMode } = useViewMode()
  const [source, setSource] = useState<FeedSource>(PRESET_SOURCES[0])
  const [savedFeedSources, setSavedFeedSources] = useState<FeedSource[]>([])
  const [items, setItems] = useState<TimelineItem[]>([])
  const [cursor, setCursor] = useState<string | undefined>()
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const loadMoreSentinelRef = useRef<HTMLDivElement>(null)
  const loadingMoreRef = useRef(false)
  const [keyboardFocusIndex, setKeyboardFocusIndex] = useState(0)
  const [keyboardAddOpen, setKeyboardAddOpen] = useState(false)
  const { openPostModal, isModalOpen } = useProfileModal()
  const cardRefsRef = useRef<(HTMLDivElement | null)[]>([])
  const mediaItemsRef = useRef<TimelineItem[]>([])
  const keyboardFocusIndexRef = useRef(0)
  const lastScrollIntoViewIndexRef = useRef<number>(-1)
  /** Only scroll into view when focus was changed by keyboard (W/S/A/D), not by mouse hover */
  const scrollIntoViewFromKeyboardRef = useRef(false)
  /** Only update focus on mouse enter when the user has actually moved the mouse (not when scroll moved content under cursor) */
  const mouseMovedRef = useRef(false)
  const [blockConfirm, setBlockConfirm] = useState<{ did: string; handle: string; avatar?: string } | null>(null)
  const blockCancelRef = useRef<HTMLButtonElement>(null)
  const blockConfirmRef = useRef<HTMLButtonElement>(null)
  const [openMenuIndex, setOpenMenuIndex] = useState<number | null>(null)
  const [likeOverrides, setLikeOverrides] = useState<Record<string, string | null>>({})
  const prevPathnameRef = useRef(location.pathname)

  const presetUris = new Set((PRESET_SOURCES.map((s) => s.uri).filter(Boolean) as string[]))
  const savedDeduped = savedFeedSources.filter((s) => !s.uri || !presetUris.has(s.uri))
  const allSources = [...PRESET_SOURCES, ...savedDeduped]

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

  // Scroll to top when landing on the feed from another page (e.g. clicking logo), not when only search params change (e.g. opening post modal adds ?post=)
  useEffect(() => {
    const pathnameChanged = prevPathnameRef.current !== location.pathname
    prevPathnameRef.current = location.pathname
    if (navigationType !== 'POP' && pathnameChanged) window.scrollTo(0, 0)
  }, [navigationType, location.pathname])

  useEffect(() => {
    const stateSource = (location.state as { feedSource?: FeedSource })?.feedSource
    if (stateSource) {
      setSource(stateSource)
      navigate(location.pathname, { replace: true })
    }
  }, [location.state, location.pathname, navigate])

  const {
    entries: mixEntries,
    setEntryPercent,
    toggleSource,
    addEntry,
    totalPercent: mixTotalPercent,
  } = useFeedMix()

  const handleToggleSource = useCallback(
    (clicked: FeedSource) => {
      if (mixEntries.length === 0 && !sameSource(clicked, source)) {
        addEntry(source)
        addEntry(clicked)
      } else {
        toggleSource(clicked)
      }
    },
    [mixEntries.length, source, addEntry, toggleSource]
  )
  const feedLabel =
    mixEntries.length >= 2
      ? 'Feed mix'
      : mixEntries.length === 1
        ? mixEntries[0].source.label
        : source.kind === 'timeline'
          ? 'Following'
          : source.label ?? undefined

  const load = useCallback(async (nextCursor?: string) => {
    const cols = viewMode === '1' ? 1 : viewMode === '2' ? 2 : 3
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

  // Infinite scroll: load more when sentinel enters view (one request at a time, only when cursor exists)
  loadingMoreRef.current = loadingMore
  useEffect(() => {
    const sentinel = loadMoreSentinelRef.current
    if (!sentinel || !cursor) return
    const observer = new IntersectionObserver(
      (entries) => {
        const [e] = entries
        if (!e?.isIntersecting || loadingMoreRef.current) return
        loadingMoreRef.current = true
        load(cursor)
      },
      { rootMargin: '600px', threshold: 0 }
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [cursor, load])

  const { isHidden, addHidden } = useHiddenPosts()
  const { mediaOnly } = useMediaOnly()
  const { nsfwPreference, unblurredUris, setUnblurred } = useModeration()
  const displayItems = items
    .filter((item) => (mediaOnly ? getPostMediaInfo(item.post) : true))
    .filter((item) => !isHidden(item.post.uri))
    .filter((item) => nsfwPreference !== 'sfw' || !isPostNsfw(item.post))
  const cols = viewMode === '1' ? 1 : viewMode === '2' ? 2 : 3
  mediaItemsRef.current = displayItems
  keyboardFocusIndexRef.current = keyboardFocusIndex

  useEffect(() => {
    setKeyboardFocusIndex((i) => (displayItems.length ? Math.min(i, displayItems.length - 1) : 0))
  }, [displayItems.length])

  useEffect(() => {
    const onMouseMove = () => { mouseMovedRef.current = true }
    window.addEventListener('mousemove', onMouseMove)
    return () => window.removeEventListener('mousemove', onMouseMove)
  }, [])

  // When focus moves to another post and a menu is open, close the menu (don't open the new post's menu)
  useEffect(() => {
    if (openMenuIndex !== null && openMenuIndex !== keyboardFocusIndex) setOpenMenuIndex(null)
  }, [keyboardFocusIndex, openMenuIndex])

  // Scroll focused card into view only when focus was changed by keyboard (W/S/A/D), not on mouse hover
  useEffect(() => {
    if (!scrollIntoViewFromKeyboardRef.current) return
    scrollIntoViewFromKeyboardRef.current = false
    if (keyboardFocusIndex === lastScrollIntoViewIndexRef.current) return
    lastScrollIntoViewIndexRef.current = keyboardFocusIndex
    const index = keyboardFocusIndex
    const raf = requestAnimationFrame(() => {
      const el = cardRefsRef.current[index]
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' })
      }
    })
    return () => cancelAnimationFrame(raf)
  }, [keyboardFocusIndex])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isModalOpen) return
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable) {
        if (e.key === 'Escape') {
          e.preventDefault()
          target.blur()
        }
        return
      }
      if (e.ctrlKey || e.metaKey) return
      if (location.pathname !== '/feed') return

      const items = mediaItemsRef.current // displayItems
      const i = keyboardFocusIndexRef.current
      if (items.length === 0) return

      const key = e.key.toLowerCase()
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
      // When ... menu is open, let the menu handle W/S/E/Q (navigate and activate)
      if (openMenuIndex !== null && (key === 'w' || key === 's' || key === 'e' || key === 'q' || e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight')) return
      if (key === 'w' || key === 's' || key === 'a' || key === 'd' || key === 'e' || key === 'enter' || key === 'r' || key === 'f' || key === 'c' || key === 'h' || key === 'b' || key === 'm' || key === '`' || key === '4' || e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') e.preventDefault()

      if (key === 'h') {
        const item = items[i]
        if (item?.post?.uri) {
          addHidden(item.post.uri)
          mouseMovedRef.current = false
          setKeyboardFocusIndex((idx) => Math.max(0, Math.min(idx, items.length - 2)))
        }
        return
      }
      if (key === 'b') {
        const item = items[i]
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
      if (key === 'w' || e.key === 'ArrowUp') {
        mouseMovedRef.current = false
        scrollIntoViewFromKeyboardRef.current = true
        const next = cols >= 2
          ? indexAbove(distributeByHeight(items, cols), i)
          : Math.max(0, i - 1)
        setKeyboardFocusIndex(next)
        return
      }
      if (key === 's' || e.key === 'ArrowDown') {
        mouseMovedRef.current = false
        scrollIntoViewFromKeyboardRef.current = true
        const next = cols >= 2
          ? indexBelow(distributeByHeight(items, cols), i)
          : Math.min(items.length - 1, i + 1)
        setKeyboardFocusIndex(next)
        return
      }
      if (key === 'a' || e.key === 'ArrowLeft') {
        mouseMovedRef.current = false
        scrollIntoViewFromKeyboardRef.current = true
        const columns = cols >= 2 ? distributeByHeight(items, cols) : null
        const getRect = (idx: number) => cardRefsRef.current[idx]?.getBoundingClientRect()
        const next =
          cols >= 2 && columns
            ? indexLeftClosest(columns, i, getRect)
            : Math.max(0, i - 1)
        setKeyboardFocusIndex(next)
        return
      }
      if (key === 'd' || e.key === 'ArrowRight') {
        mouseMovedRef.current = false
        scrollIntoViewFromKeyboardRef.current = true
        const columns = cols >= 2 ? distributeByHeight(items, cols) : null
        const getRect = (idx: number) => cardRefsRef.current[idx]?.getBoundingClientRect()
        const next =
          cols >= 2 && columns
            ? indexRightClosest(columns, i, getRect)
            : Math.min(items.length - 1, i + 1)
        setKeyboardFocusIndex(next)
        return
      }
      if (key === 'e' || key === 'enter') {
        const item = items[i]
        if (item) openPostModal(item.post.uri)
        return
      }
      if (key === 'r') {
        const item = items[i]
        if (item) openPostModal(item.post.uri, true)
        return
      }
      if (key === 'f') {
        const item = items[i]
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
      if (key === 'm' || key === '`') {
        if (openMenuIndex === i) {
          setOpenMenuIndex(null)
        } else {
          setOpenMenuIndex(i)
        }
        return
      }
      if (key === '4') {
        const item = items[i]
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
  }, [location.pathname, cols, isModalOpen, openPostModal, blockConfirm, addHidden, session, openMenuIndex, likeOverrides])

  useEffect(() => {
    if (blockConfirm) blockCancelRef.current?.focus()
  }, [blockConfirm])

  return (
    <Layout title="Feed" showNav>
      <>
      <div className={styles.wrap}>
        {session && (
          <FeedSelector
            sources={allSources}
            fallbackSource={source}
            mixEntries={mixEntries}
            onToggle={handleToggleSource}
            setEntryPercent={setEntryPercent}
            onAddCustom={async (input) => {
              setError(null)
              try {
                const uri = await resolveFeedUri(input)
                await addSavedFeed(uri)
                await loadSavedFeeds()
                const label = await getFeedDisplayName(uri)
                handleToggleSource({ kind: 'custom', label, uri })
              } catch (err) {
                setError(err instanceof Error ? err.message : 'Could not add feed')
              }
            }}
          />
        )}
        {error && <p className={styles.error}>{error}</p>}
        {loading ? (
          <div className={styles.loading}>Loading…</div>
        ) : displayItems.length === 0 ? (
          <div className={styles.empty}>
            {mediaOnly ? 'No posts with images or videos in this feed.' : 'No posts in this feed.'}
          </div>
        ) : (
          <>
            {cols >= 2 ? (
              <div className={`${styles.gridColumns} ${styles[`gridView${viewMode}`]}`}>
                {distributeByHeight(displayItems, cols).map((column, colIndex) => (
                  <div key={colIndex} className={styles.gridColumn}>
                    {column.map(({ item, originalIndex }) => (
                      <div
                        key={item.post.uri}
                        className={styles.gridItem}
                        onMouseEnter={() => {
                          if (mouseMovedRef.current) {
                            mouseMovedRef.current = false
                            setKeyboardFocusIndex(originalIndex)
                          }
                        }}
                      >
                        <PostCard
                          item={item}
                          isSelected={originalIndex === keyboardFocusIndex}
                          cardRef={(el) => { cardRefsRef.current[originalIndex] = el }}
                          openAddDropdown={originalIndex === keyboardFocusIndex && keyboardAddOpen}
                          onAddClose={() => setKeyboardAddOpen(false)}
                          onPostClick={(uri, opts) => openPostModal(uri, opts?.openReply)}
                          feedLabel={(item as { _feedSource?: { label?: string } })._feedSource?.label ?? feedLabel}
                          openActionsMenu={openMenuIndex === originalIndex}
                          onActionsMenuOpen={() => setOpenMenuIndex(originalIndex)}
                          onActionsMenuClose={() => setOpenMenuIndex(null)}
                          onAspectRatio={undefined}
                          fillCell={false}
                          nsfwBlurred={nsfwPreference === 'blurred' && isPostNsfw(item.post) && !unblurredUris.has(item.post.uri)}
                          onNsfwUnblur={() => setUnblurred(item.post.uri, true)}
                          likedUriOverride={likeOverrides[item.post.uri]}
                        />
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ) : (
              <div className={`${styles.grid} ${styles[`gridView${viewMode}`]}`}>
                {displayItems.map((item, index) => (
                  <div
                    key={item.post.uri}
                    onMouseEnter={() => {
                      if (mouseMovedRef.current) {
                        mouseMovedRef.current = false
                        setKeyboardFocusIndex(index)
                      }
                    }}
                  >
                    <PostCard
                      item={item}
                      isSelected={index === keyboardFocusIndex}
                      cardRef={(el) => { cardRefsRef.current[index] = el }}
                      openAddDropdown={index === keyboardFocusIndex && keyboardAddOpen}
                      onAddClose={() => setKeyboardAddOpen(false)}
                      onPostClick={(uri, opts) => openPostModal(uri, opts?.openReply)}
                      feedLabel={(item as { _feedSource?: { label?: string } })._feedSource?.label ?? feedLabel}
                      openActionsMenu={openMenuIndex === index}
                      onActionsMenuOpen={() => setOpenMenuIndex(index)}
                      onActionsMenuClose={() => setOpenMenuIndex(null)}
                      onAspectRatio={undefined}
                      fillCell={false}
                      nsfwBlurred={nsfwPreference === 'blurred' && isPostNsfw(item.post) && !unblurredUris.has(item.post.uri)}
                      onNsfwUnblur={() => setUnblurred(item.post.uri, true)}
                      likedUriOverride={likeOverrides[item.post.uri]}
                    />
                  </div>
                ))}
              </div>
            )}
            {cursor && (
              <>
                <div ref={loadMoreSentinelRef} className={styles.loadMoreSentinel} aria-hidden />
                {loadingMore && (
                  <p className={styles.loadingMore} role="status">Loading more…</p>
                )}
              </>
            )}
          </>
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
