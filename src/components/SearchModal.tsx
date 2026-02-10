import { useCallback, useEffect, useRef, useState } from 'react'
import { agent, searchPostsByPhraseAndTags, getPostMediaInfo, isPostNsfw } from '../lib/bsky'
import type { TimelineItem } from '../lib/bsky'
import type { AppBskyFeedDefs } from '@atproto/api'
import PostCard from './PostCard'
import AppModal from './AppModal'
import MediaModalTopBar from './MediaModalTopBar'
import { useSession } from '../context/SessionContext'
import { useProfileModal } from '../context/ProfileModalContext'
import { useViewMode } from '../context/ViewModeContext'
import { useModeration } from '../context/ModerationContext'
import styles from '../pages/TagPage.module.css'
import feedStyles from '../pages/FeedPage.module.css'
import modalStyles from './SearchModal.module.css'

const ESTIMATE_COL_WIDTH = 280
const CARD_CHROME = 100

function toTimelineItem(post: AppBskyFeedDefs.PostView): TimelineItem {
  return { post }
}

function estimateItemHeight(item: TimelineItem): number {
  const media = getPostMediaInfo(item.post)
  if (!media) return CARD_CHROME + 80
  if (media.aspectRatio != null && media.aspectRatio > 0) {
    return CARD_CHROME + ESTIMATE_COL_WIDTH / media.aspectRatio
  }
  return CARD_CHROME + 220
}

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
    if (row === columns[c].length - 1) return currentIndex
  }
  return currentIndex
}

function indexLeftByRow(
  columns: Array<Array<{ item: TimelineItem; originalIndex: number }>>,
  currentIndex: number
): number {
  for (let c = 0; c < columns.length; c++) {
    const row = columns[c].findIndex((e) => e.originalIndex === currentIndex)
    if (row >= 0 && c > 0) return columns[c - 1][Math.min(row, columns[c - 1].length - 1)].originalIndex
  }
  return currentIndex
}

function indexRightByRow(
  columns: Array<Array<{ item: TimelineItem; originalIndex: number }>>,
  currentIndex: number
): number {
  for (let c = 0; c < columns.length; c++) {
    const row = columns[c].findIndex((e) => e.originalIndex === currentIndex)
    if (row >= 0 && c < columns.length - 1) return columns[c + 1][Math.min(row, columns[c + 1].length - 1)].originalIndex
  }
  return currentIndex
}

function SearchContent({ query, onRegisterRefresh }: { query: string; onRegisterRefresh?: (refresh: () => void | Promise<void>) => void }) {
  const { session } = useSession()
  const { viewMode } = useViewMode()
  const { openPostModal } = useProfileModal()
  const [items, setItems] = useState<TimelineItem[]>([])
  const [cursor, setCursor] = useState<string | undefined>()
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [keyboardFocusIndex, setKeyboardFocusIndex] = useState(0)
  const [keyboardAddOpen, setKeyboardAddOpen] = useState(false)
  const [likeOverrides, setLikeOverrides] = useState<Record<string, string | null>>({})
  const cardRefsRef = useRef<(HTMLDivElement | null)[]>([])
  const loadMoreSentinelRefs = useRef<(HTMLDivElement | null)[]>([])
  const loadingMoreRef = useRef(false)
  const keyboardFocusIndexRef = useRef(0)
  const mediaItemsRef = useRef<TimelineItem[]>([])
  const scrollIntoViewFromKeyboardRef = useRef(false)
  const lastScrollIntoViewIndexRef = useRef(-1)

  const load = useCallback(async (nextCursor?: string) => {
    if (!query.trim()) return
    try {
      if (nextCursor) setLoadingMore(true)
      else setLoading(true)
      setError(null)
      const { posts, cursor: next } = await searchPostsByPhraseAndTags(query.trim(), nextCursor)
      const timelineItems = posts.map(toTimelineItem)
      setItems((prev) => (nextCursor ? [...prev, ...timelineItems] : timelineItems))
      setCursor(next)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Search failed'
      setError(msg === 'Failed to fetch' ? 'Search couldn’t be completed. Check your connection or try again.' : msg)
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [query])

  useEffect(() => {
    if (query.trim()) {
      setItems([])
      setCursor(undefined)
      load()
    }
  }, [query, load])

  useEffect(() => {
    onRegisterRefresh?.(() => load())
  }, [onRegisterRefresh, load])

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
    const numCols = viewMode === '1' ? 1 : viewMode === '2' ? 2 : 3
    for (let c = 0; c < numCols; c++) {
      const el = refs[c]
      if (el) observer.observe(el)
    }
    return () => observer.disconnect()
  }, [cursor, load, viewMode])

  const { nsfwPreference, unblurredUris, setUnblurred } = useModeration()
  const mediaItems = items
    .filter((item) => getPostMediaInfo(item.post))
    .filter((item) => nsfwPreference !== 'sfw' || !isPostNsfw(item.post))
  const cols = viewMode === '1' ? 1 : viewMode === '2' ? 2 : 3
  mediaItemsRef.current = mediaItems
  keyboardFocusIndexRef.current = keyboardFocusIndex

  useEffect(() => {
    setKeyboardFocusIndex((i) => (mediaItems.length ? Math.min(i, mediaItems.length - 1) : 0))
  }, [mediaItems.length])

  useEffect(() => {
    if (!scrollIntoViewFromKeyboardRef.current) return
    scrollIntoViewFromKeyboardRef.current = false
    if (keyboardFocusIndex === lastScrollIntoViewIndexRef.current) return
    lastScrollIntoViewIndexRef.current = keyboardFocusIndex
    const index = keyboardFocusIndex
    const raf = requestAnimationFrame(() => {
      const el = cardRefsRef.current[index]
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' })
    })
    return () => cancelAnimationFrame(raf)
  }, [keyboardFocusIndex])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable) {
        if (e.key === 'Escape') {
          e.preventDefault()
          target.blur()
        }
        return
      }
      if (e.ctrlKey || e.metaKey) return
      if (mediaItems.length === 0) return

      const items = mediaItemsRef.current
      const i = keyboardFocusIndexRef.current
      const columns = distributeByHeight(items, cols)
      const key = e.key.toLowerCase()
      if (key === 'w' || key === 's' || key === 'a' || key === 'd' || key === 'e' || key === 'enter' || key === 'f' || key === 'c' || e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') e.preventDefault()

      if (key === 'w' || e.key === 'ArrowUp') {
        scrollIntoViewFromKeyboardRef.current = true
        setKeyboardFocusIndex((idx) => (cols >= 2 ? indexAbove(columns, idx) : Math.max(0, idx - 1)))
        return
      }
      if (key === 's' || e.key === 'ArrowDown') {
        scrollIntoViewFromKeyboardRef.current = true
        setKeyboardFocusIndex((idx) => (cols >= 2 ? indexBelow(columns, idx) : Math.min(items.length - 1, idx + 1)))
        return
      }
      if (key === 'a' || e.key === 'ArrowLeft') {
        scrollIntoViewFromKeyboardRef.current = true
        setKeyboardFocusIndex((idx) => (cols >= 2 ? indexLeftByRow(columns, idx) : Math.max(0, idx - 1)))
        return
      }
      if (key === 'd' || e.key === 'ArrowRight') {
        scrollIntoViewFromKeyboardRef.current = true
        setKeyboardFocusIndex((idx) => (cols >= 2 ? indexRightByRow(columns, idx) : Math.min(items.length - 1, idx + 1)))
        return
      }
      if (key === 'e' || key === 'enter') {
        const item = items[i]
        if (item) openPostModal(item.post.uri)
        return
      }
      if (key === 'f' && session) {
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
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [mediaItems.length, cols, openPostModal, likeOverrides, session])

  if (!query.trim()) return null

  return (
    <div className={styles.wrap}>
      {error && <p className={styles.error}>{error}</p>}
      {loading ? (
        <div className={styles.loading}>Loading…</div>
      ) : mediaItems.length === 0 ? (
        <div className={styles.empty}>No posts found for this search.</div>
      ) : (
        <div className={`${feedStyles.gridColumns} ${feedStyles[`gridView${viewMode}`]}`}>
          {distributeByHeight(mediaItems, cols).map((column, colIndex) => (
            <div key={colIndex} className={feedStyles.gridColumn}>
              {column.map(({ item, originalIndex }) => (
                <div
                  key={item.post.uri}
                  className={feedStyles.gridItem}
                  onMouseEnter={() => setKeyboardFocusIndex(originalIndex)}
                >
                  <PostCard
                    item={item}
                    isSelected={originalIndex === keyboardFocusIndex}
                    cardRef={(el) => { cardRefsRef.current[originalIndex] = el }}
                    openAddDropdown={originalIndex === keyboardFocusIndex && keyboardAddOpen}
                    onAddClose={() => setKeyboardAddOpen(false)}
                    onPostClick={(uri) => openPostModal(uri)}
                    nsfwBlurred={nsfwPreference === 'blurred' && isPostNsfw(item.post) && !unblurredUris.has(item.post.uri)}
                    onNsfwUnblur={() => setUnblurred(item.post.uri, true)}
                    likedUriOverride={likeOverrides[item.post.uri]}
                    onLikedChange={(uri, likeRecordUri) => setLikeOverrides((prev) => ({ ...prev, [uri]: likeRecordUri ?? null }))}
                  />
                </div>
              ))}
              {cursor && (
                <div
                  ref={(el) => { loadMoreSentinelRefs.current[colIndex] = el }}
                  className={feedStyles.loadMoreSentinel}
                  aria-hidden
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

interface SearchModalProps {
  query: string
  onClose: () => void
  onBack: () => void
  canGoBack: boolean
}

export default function SearchModal({ query, onClose, onBack, canGoBack }: SearchModalProps) {
  const [refreshFn, setRefreshFn] = useState<(() => void | Promise<void>) | null>(null)

  return (
    <AppModal
      ariaLabel={`Search: ${query}`}
      onClose={onClose}
      onBack={onBack}
      canGoBack={canGoBack}
      onPullToRefresh={refreshFn ? () => refreshFn() : undefined}
    >
      <MediaModalTopBar
        centerContent={
          <span className={modalStyles.searchQueryCenter} title={query.trim()}>
            "{query.trim()}"
          </span>
        }
      />
      <SearchContent query={query} onRegisterRefresh={(fn) => setRefreshFn(() => fn)} />
    </AppModal>
  )
}
