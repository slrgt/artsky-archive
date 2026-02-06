import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { agent, searchPostsByTag, getPostMediaInfo } from '../lib/bsky'
import type { TimelineItem } from '../lib/bsky'
import type { AppBskyFeedDefs } from '@atproto/api'
import PostCard from '../components/PostCard'
import Layout from '../components/Layout'
import { useViewMode } from '../context/ViewModeContext'
import styles from './TagPage.module.css'

/** Wrap PostView into TimelineItem shape for PostCard */
function toTimelineItem(post: AppBskyFeedDefs.PostView): TimelineItem {
  return { post }
}

export default function TagPage() {
  const { tag: tagParam } = useParams<{ tag: string }>()
  const tag = tagParam ? decodeURIComponent(tagParam) : ''
  const navigate = useNavigate()
  const { viewMode } = useViewMode()
  const [items, setItems] = useState<TimelineItem[]>([])
  const [cursor, setCursor] = useState<string | undefined>()
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [keyboardFocusIndex, setKeyboardFocusIndex] = useState(0)
  const [keyboardAddOpen, setKeyboardAddOpen] = useState(false)
  const cardRefsRef = useRef<(HTMLDivElement | null)[]>([])
  const keyboardFocusIndexRef = useRef(0)
  const mediaItemsRef = useRef<TimelineItem[]>([])

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

  const mediaItems = items.filter((item) => getPostMediaInfo(item.post))
  const cols = viewMode === '1' ? 1 : viewMode === '2' ? 2 : 3
  mediaItemsRef.current = mediaItems
  keyboardFocusIndexRef.current = keyboardFocusIndex

  useEffect(() => {
    setKeyboardFocusIndex((i) => (mediaItems.length ? Math.min(i, mediaItems.length - 1) : 0))
  }, [mediaItems.length])

  useEffect(() => {
    const el = cardRefsRef.current[keyboardFocusIndex]
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
  }, [keyboardFocusIndex])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable) return
      if (mediaItems.length === 0) return

      const items = mediaItemsRef.current
      const i = keyboardFocusIndexRef.current
      const key = e.key.toLowerCase()
      if (key === 'w' || key === 's' || key === 'a' || key === 'd' || key === 'e' || key === 'x' || key === 'c') e.preventDefault()

      if (key === 'w') {
        setKeyboardFocusIndex((idx) => Math.max(0, idx - cols))
        return
      }
      if (key === 's') {
        setKeyboardFocusIndex((idx) => Math.min(items.length - 1, idx + cols))
        return
      }
      if (key === 'a' || e.key === 'ArrowLeft') {
        setKeyboardFocusIndex((idx) => Math.max(0, idx - 1))
        return
      }
      if (key === 'd' || e.key === 'ArrowRight') {
        setKeyboardFocusIndex((idx) => Math.min(items.length - 1, idx + 1))
        return
      }
      if (key === 'e') {
        const item = items[i]
        if (item) navigate(`/post/${encodeURIComponent(item.post.uri)}`)
        return
      }
      if (key === 'x') {
        const item = items[i]
        if (item?.post?.uri && item?.post?.cid) agent.like(item.post.uri, item.post.cid).catch(() => {})
        return
      }
      if (key === 'c') {
        setKeyboardAddOpen(true)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [mediaItems.length, cols, navigate])

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
            <div className={`${styles.grid} ${styles[`gridView${viewMode}`]}`}>
              {mediaItems.map((item, index) => (
                <div
                  key={item.post.uri}
                  onMouseEnter={() => setKeyboardFocusIndex(index)}
                >
                  <PostCard
                    item={item}
                    isSelected={index === keyboardFocusIndex}
                    cardRef={(el) => { cardRefsRef.current[index] = el }}
                    openAddDropdown={index === keyboardFocusIndex && keyboardAddOpen}
                    onAddClose={() => setKeyboardAddOpen(false)}
                  />
                </div>
              ))}
            </div>
            {cursor && (
              <button
                type="button"
                className={styles.more}
                onClick={() => load(cursor)}
                disabled={loadingMore}
              >
                {loadingMore ? 'Loading…' : 'Load more'}
              </button>
            )}
          </>
        )}
      </div>
    </Layout>
  )
}
