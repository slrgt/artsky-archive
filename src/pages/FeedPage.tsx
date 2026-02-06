import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { agent, publicAgent, getPostMediaInfo, getGuestFeed, type TimelineItem } from '../lib/bsky'
import { GUEST_FEED_ACCOUNTS } from '../config/guestFeed'
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
  const [guestProfiles, setGuestProfiles] = useState<Record<string, { avatar?: string; displayName?: string }>>({})
  const [followedGuestHandles, setFollowedGuestHandles] = useState<string[]>([])

  // When logged in, see which guest accounts the user follows (so we can show the preview section for those).
  useEffect(() => {
    if (!session) {
      setFollowedGuestHandles([])
      return
    }
    const followed: string[] = []
    let done = 0
    GUEST_FEED_ACCOUNTS.forEach((a) => {
      agent.getProfile({ actor: a.handle }).then((res) => {
        const v = (res.data as { viewer?: { following?: string } }).viewer
        if (v?.following) followed.push(a.handle)
        done += 1
        if (done === GUEST_FEED_ACCOUNTS.length) setFollowedGuestHandles(followed)
      }).catch(() => {
        done += 1
        if (done === GUEST_FEED_ACCOUNTS.length) setFollowedGuestHandles(followed)
      })
    })
  }, [session])

  const showGuestSection =
    (!session && GUEST_FEED_ACCOUNTS.length > 0) ||
    (!!session && followedGuestHandles.length > 0)
  const guestHandlesToShow = !session
    ? GUEST_FEED_ACCOUNTS.map((a) => a.handle)
    : followedGuestHandles

  useEffect(() => {
    if (!showGuestSection || guestHandlesToShow.length === 0) return
    guestHandlesToShow.forEach((handle) => {
      publicAgent.getProfile({ actor: handle }).then((res) => {
        const d = res.data
        setGuestProfiles((prev) => ({
          ...prev,
          [handle]: { avatar: d.avatar, displayName: d.displayName },
        }))
      }).catch(() => {})
    })
  }, [showGuestSection, guestHandlesToShow.join(',')])

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
        {showGuestSection && (
          <section className={styles.guestSection} aria-label={session ? 'Accounts you follow' : 'Guest feed'}>
            <p className={styles.guestHint}>
              {session ? (
                <>Quick access to accounts you follow:</>
              ) : (
                <>
                  Showing posts from{' '}
                  {GUEST_FEED_ACCOUNTS.map((a, i) => (
                    <span key={a.handle}>
                      {i > 0 && i === GUEST_FEED_ACCOUNTS.length - 1 ? ' & ' : i > 0 ? ', ' : ''}
                      <Link to={`/profile/${encodeURIComponent(a.handle)}`} className={styles.guestLink}>
                        {a.label}
                      </Link>
                    </span>
                  ))}
                  . Sign in to see your feed.
                </>
              )}
            </p>
            <div className={styles.guestPreview}>
              {guestHandlesToShow.map((handle) => {
                const a = GUEST_FEED_ACCOUNTS.find((x) => x.handle === handle)
                if (!a) return null
                const profile = guestProfiles[a.handle]
                return (
                  <Link
                    key={a.handle}
                    to={`/profile/${encodeURIComponent(a.handle)}`}
                    className={styles.guestPreviewCard}
                  >
                    {profile?.avatar ? (
                      <img src={profile.avatar} alt="" className={styles.guestPreviewAvatar} />
                    ) : (
                      <span className={styles.guestPreviewAvatarPlaceholder} aria-hidden>@{a.handle.slice(0, 1)}</span>
                    )}
                    <span className={styles.guestPreviewLabel}>@{a.handle}</span>
                    <span className={styles.guestPreviewName}>{profile?.displayName ?? a.label}</span>
                  </Link>
                )
              })}
            </div>
          </section>
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
