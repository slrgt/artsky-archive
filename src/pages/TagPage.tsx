import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { agent, searchPostsByTag, getPostMediaInfo, isPostNsfw } from '../lib/bsky'
import type { TimelineItem } from '../lib/bsky'
import type { AppBskyFeedDefs } from '@atproto/api'
import VirtualizedProfileColumn from '../components/VirtualizedProfileColumn'
import Layout from '../components/Layout'
import { useSession } from '../context/SessionContext'
import { useProfileModal } from '../context/ProfileModalContext'
import { useViewMode } from '../context/ViewModeContext'
import { useModeration } from '../context/ModerationContext'
import { useModalScroll } from '../context/ModalScrollContext'
import styles from './TagPage.module.css'
import profileGridStyles from './ProfilePage.module.css'

const ESTIMATE_COL_WIDTH = 280
const CARD_CHROME = 100

/** Wrap PostView into TimelineItem shape for PostCard */
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
  if (numCols < 1) return []
  const columns: Array<Array<{ item: TimelineItem; originalIndex: number }>> = Array.from(
    { length: numCols },
    () => []
  )
  const columnHeights: number[] = Array(numCols).fill(0)
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    const h = estimateItemHeight(item)
    const lengths = columns.map((col) => col.length)
    const minCount = lengths.length === 0 ? 0 : Math.min(...lengths)
    let best = -1
    for (let c = 0; c < numCols; c++) {
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

export function TagContent({ tag, inModal = false, onRegisterRefresh }: { tag: string; inModal?: boolean; onRegisterRefresh?: (refresh: () => void | Promise<void>) => void }) {
  const navigate = useNavigate()
  const { session } = useSession()
  const { viewMode } = useViewMode()
  const { isModalOpen, openPostModal } = useProfileModal()
  const [items, setItems] = useState<TimelineItem[]>([])
  const [cursor, setCursor] = useState<string | undefined>()
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [keyboardFocusIndex, setKeyboardFocusIndex] = useState(0)
  const [keyboardAddOpen, setKeyboardAddOpen] = useState(false)
  const [likeOverrides, setLikeOverrides] = useState<Record<string, string | null>>({})
  const cardRefsRef = useRef<(HTMLDivElement | null)[]>([])
  const loadMoreSentinelRef = useRef<HTMLDivElement>(null)
  const loadMoreSentinelRefs = useRef<(HTMLDivElement | null)[]>([])
  const loadingMoreRef = useRef(false)
  const keyboardFocusIndexRef = useRef(0)
  const mediaItemsRef = useRef<TimelineItem[]>([])
  const scrollIntoViewFromKeyboardRef = useRef(false)
  const lastScrollIntoViewIndexRef = useRef(-1)
  const modalScrollRef = useModalScroll()
  const gridRef = useRef<HTMLDivElement | null>(null)
  const [scrollMargin, setScrollMargin] = useState(0)

  const load = useCallback(async (nextCursor?: string) => {
    if (!tag) return
    try {
      if (nextCursor) setLoadingMore(true)
      else setLoading(true)
      setError(null)
      const { posts, cursor: next } = await searchPostsByTag(tag, nextCursor)
      const timelineItems = posts.map(toTimelineItem)
      setItems((prev) => (nextCursor ? [...prev, ...timelineItems] : timelineItems))
      setCursor(next)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load tag')
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [tag])

  useEffect(() => {
    if (tag) {
      setItems([])
      setCursor(undefined)
      load()
    }
  }, [tag, load])

  useEffect(() => {
    onRegisterRefresh?.(() => load())
  }, [onRegisterRefresh, load])

  const { nsfwPreference, unblurredUris, setUnblurred } = useModeration()
  const mediaItems = items
    .filter((item) => getPostMediaInfo(item.post))
    .filter((item) => nsfwPreference !== 'sfw' || !isPostNsfw(item.post))
  const cols = viewMode === '1' ? 1 : viewMode === '2' ? 2 : 3
  mediaItemsRef.current = mediaItems
  keyboardFocusIndexRef.current = keyboardFocusIndex

  useLayoutEffect(() => {
    if (inModal || !gridRef.current) return
    const el = gridRef.current
    const update = () => setScrollMargin(el.getBoundingClientRect().top + window.scrollY)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [inModal, mediaItems.length])

  loadingMoreRef.current = loadingMore
  useEffect(() => {
    if (!cursor) return
    const colsForObserver = cols
    const firstSentinel = colsForObserver >= 2 ? loadMoreSentinelRefs.current[0] : loadMoreSentinelRef.current
    if (!firstSentinel) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting || loadingMoreRef.current) return
        loadingMoreRef.current = true
        load(cursor)
      },
      { rootMargin: '600px', threshold: 0 }
    )
    observer.observe(firstSentinel)
    if (colsForObserver >= 2) {
      const refs = loadMoreSentinelRefs.current
      for (let c = 1; c < colsForObserver; c++) {
        const el = refs[c]
        if (el) observer.observe(el)
      }
    }
    return () => observer.disconnect()
  }, [cursor, load, cols])

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
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
    })
    return () => cancelAnimationFrame(raf)
  }, [keyboardFocusIndex])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!inModal && isModalOpen) return
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
      const key = e.key.toLowerCase()
      if (key === 'w' || key === 's' || key === 'a' || key === 'd' || key === 'e' || key === 'enter' || key === 'f' || key === 'c' || e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') e.preventDefault()

      if (key === 'w' || e.key === 'ArrowUp') {
        scrollIntoViewFromKeyboardRef.current = true
        setKeyboardFocusIndex((idx) => Math.max(0, idx - cols))
        return
      }
      if (key === 's' || e.key === 'ArrowDown') {
        scrollIntoViewFromKeyboardRef.current = true
        setKeyboardFocusIndex((idx) => Math.min(items.length - 1, idx + cols))
        return
      }
      if (key === 'a' || e.key === 'ArrowLeft') {
        scrollIntoViewFromKeyboardRef.current = true
        setKeyboardFocusIndex((idx) => Math.max(0, idx - 1))
        return
      }
      if (key === 'd' || e.key === 'ArrowRight') {
        scrollIntoViewFromKeyboardRef.current = true
        setKeyboardFocusIndex((idx) => Math.min(items.length - 1, idx + 1))
        return
      }
      if (key === 'e' || key === 'enter') {
        const item = items[i]
        if (item) {
          if (inModal) openPostModal(item.post.uri)
          else navigate(`/post/${encodeURIComponent(item.post.uri)}`)
        }
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
  }, [mediaItems.length, cols, navigate, isModalOpen, inModal, openPostModal, likeOverrides, session])

  if (!tag) return null

  return (
    <div className={styles.wrap}>
      <header className={styles.header}>
        <h2 className={styles.title}>#{tag}</h2>
      </header>
      {error && <p className={styles.error}>{error}</p>}
      {loading ? (
        <div className={styles.loading}>Loading…</div>
      ) : mediaItems.length === 0 ? (
        <div className={styles.empty}>No posts with images or videos for this tag.</div>
      ) : (
        <>
          <div
            ref={gridRef}
            className={`${profileGridStyles.gridColumns} ${profileGridStyles[`gridView${viewMode}`]}`}
            data-view-mode={viewMode}
          >
            {distributeByHeight(mediaItems, cols).map((column, colIndex) => (
              <VirtualizedProfileColumn
                key={colIndex}
                column={column}
                colIndex={colIndex}
                scrollMargin={scrollMargin}
                scrollRef={inModal ? modalScrollRef : null}
                loadMoreSentinelRef={
                  cursor
                    ? (el) => {
                        if (cols >= 2) loadMoreSentinelRefs.current[colIndex] = el
                        else ((loadMoreSentinelRef as unknown) as { current: HTMLDivElement | null }).current = el
                      }
                    : undefined
                }
                hasCursor={!!cursor}
                keyboardFocusIndex={keyboardFocusIndex}
                keyboardAddOpen={keyboardAddOpen}
                actionsMenuOpenForIndex={null}
                nsfwPreference={nsfwPreference}
                unblurredUris={unblurredUris}
                setUnblurred={setUnblurred}
                likeOverrides={likeOverrides}
                setLikeOverrides={setLikeOverrides}
                openPostModal={
                  inModal
                    ? openPostModal
                    : (uri) => navigate(`/post/${encodeURIComponent(uri)}`)
                }
                cardRef={(index) => (el) => { cardRefsRef.current[index] = el }}
                onActionsMenuOpenChange={() => {}}
                onMouseEnter={(originalIndex) => setKeyboardFocusIndex(originalIndex)}
                onAddClose={() => setKeyboardAddOpen(false)}
                constrainMediaHeight={cols === 1}
                isSelected={(index) => index === keyboardFocusIndex}
              />
            ))}
          </div>
          {loadingMore && <div className={profileGridStyles.loadingMore}>Loading…</div>}
        </>
      )}
    </div>
  )
}

export default function TagPage() {
  const { tag: tagParam } = useParams<{ tag: string }>()
  const tag = tagParam ? decodeURIComponent(tagParam) : ''

  if (!tag) {
    return (
      <Layout title="Tag" showNav>
        <div className={styles.wrap}>
          <p className={styles.empty}>No tag specified.</p>
        </div>
      </Layout>
    )
  }

  return (
    <Layout title={`#${tag}`} showNav>
      <TagContent tag={tag} />
    </Layout>
  )
}
