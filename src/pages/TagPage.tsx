import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { agent, searchPostsByTag, getPostMediaInfo, isPostNsfw } from '../lib/bsky'
import type { TimelineItem } from '../lib/bsky'
import type { AppBskyFeedDefs } from '@atproto/api'
import PostCard from '../components/PostCard'
import Layout from '../components/Layout'
import { useSession } from '../context/SessionContext'
import { useProfileModal } from '../context/ProfileModalContext'
import { useViewMode } from '../context/ViewModeContext'
import { useModeration } from '../context/ModerationContext'
import styles from './TagPage.module.css'

/** Wrap PostView into TimelineItem shape for PostCard */
function toTimelineItem(post: AppBskyFeedDefs.PostView): TimelineItem {
  return { post }
}

export function TagContent({ tag, inModal = false }: { tag: string; inModal?: boolean }) {
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
  const keyboardFocusIndexRef = useRef(0)
  const mediaItemsRef = useRef<TimelineItem[]>([])
  const scrollIntoViewFromKeyboardRef = useRef(false)
  const lastScrollIntoViewIndexRef = useRef(-1)

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
                  onPostClick={inModal ? (uri) => openPostModal(uri) : undefined}
                  nsfwBlurred={nsfwPreference === 'blurred' && isPostNsfw(item.post) && !unblurredUris.has(item.post.uri)}
                  onNsfwUnblur={() => setUnblurred(item.post.uri, true)}
                  likedUriOverride={likeOverrides[item.post.uri]}
                  onLikedChange={(uri, likeRecordUri) => setLikeOverrides((prev) => ({ ...prev, [uri]: likeRecordUri ?? null }))}
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
