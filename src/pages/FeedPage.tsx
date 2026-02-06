import { useCallback, useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { agent, getPostMediaInfo, getGuestFeed, type TimelineItem } from '../lib/bsky'
import type { FeedSource } from '../types'
import FeedSelector from '../components/FeedSelector'
import PostCard from '../components/PostCard'
import Layout from '../components/Layout'
import { useSession } from '../context/SessionContext'
import { useViewMode } from '../context/ViewModeContext'
import styles from './FeedPage.module.css'

const DEFAULT_SOURCES: FeedSource[] = [
  { kind: 'timeline', label: 'Following' },
]

export default function FeedPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const { session } = useSession()
  const { viewMode } = useViewMode()
  const [source, setSource] = useState<FeedSource>(DEFAULT_SOURCES[0])
  const [items, setItems] = useState<TimelineItem[]>([])
  const [cursor, setCursor] = useState<string | undefined>()
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const stateSource = (location.state as { feedSource?: FeedSource })?.feedSource
    if (stateSource) {
      setSource(stateSource)
      navigate(location.pathname, { replace: true })
    }
  }, [location.state, location.pathname, navigate])

  const load = useCallback(async (nextCursor?: string) => {
    try {
      if (nextCursor) setLoadingMore(true)
      else setLoading(true)
      setError(null)
      if (!session) {
        const { feed, cursor: next } = await getGuestFeed(30, nextCursor)
        setItems((prev) => (nextCursor ? [...prev, ...feed] : feed))
        setCursor(next)
      } else if (source.kind === 'timeline') {
        const res = await agent.getTimeline({ limit: 30, cursor: nextCursor })
        setItems((prev) => (nextCursor ? [...prev, ...res.data.feed] : res.data.feed))
        setCursor(res.data.cursor ?? undefined)
      } else if (source.uri) {
        const res = await agent.app.bsky.feed.getFeed({ feed: source.uri, limit: 30, cursor: nextCursor })
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
  }, [source, session])

  useEffect(() => {
    load()
  }, [load])

  const mediaItems = items.filter((item) => getPostMediaInfo(item.post))

  return (
    <Layout title="Feed" showNav>
      <div className={styles.wrap}>
        {session && (
          <FeedSelector
            value={source}
            onChange={setSource}
            onAddCustom={(uri) => setSource({ kind: 'custom', label: 'Custom', uri })}
          />
        )}
        {!session && (
          <p className={styles.guestHint}>Showing posts from Blender, Godot Engine &amp; NASA. Sign in to see your feed.</p>
        )}
        {error && <p className={styles.error}>{error}</p>}
        {loading ? (
          <div className={styles.loading}>Loading…</div>
        ) : mediaItems.length === 0 ? (
          <div className={styles.empty}>No posts with images or videos in this feed.</div>
        ) : (
          <>
            <div className={`${styles.masonry} ${styles[`masonryView${viewMode}`]}`}>
              {mediaItems.map((item) => (
                <PostCard key={item.post.uri} item={item} />
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
