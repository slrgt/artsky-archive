import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  agent,
  publicAgent,
  getPostMediaInfo,
  getGuestFeed,
  getSavedFeedsFromPreferences,
  getFeedDisplayName,
  resolveFeedUri,
  addSavedFeed,
  type TimelineItem,
} from '../lib/bsky'
import { GUEST_FEED_ACCOUNTS } from '../config/guestFeed'
import type { FeedSource } from '../types'
import FeedSelector from '../components/FeedSelector'
import PostCard from '../components/PostCard'
import Layout from '../components/Layout'
import { useSession } from '../context/SessionContext'
import { useViewMode } from '../context/ViewModeContext'
import styles from './FeedPage.module.css'

const PRESET_SOURCES: FeedSource[] = [
  { kind: 'timeline', label: 'Following' },
  { kind: 'custom', label: "What's Hot", uri: 'at://did:plc:z72i7hdynmk6r22z27h6tvur/app.bsky.feed.generator/whats-hot' },
]

export default function FeedPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const { session } = useSession()
  const { viewMode } = useViewMode()
  const [source, setSource] = useState<FeedSource>(PRESET_SOURCES[0])
  const [savedFeedSources, setSavedFeedSources] = useState<FeedSource[]>([])
  const [items, setItems] = useState<TimelineItem[]>([])
  const [cursor, setCursor] = useState<string | undefined>()
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [guestProfiles, setGuestProfiles] = useState<Record<string, { avatar?: string; displayName?: string }>>({})
  const [followedGuestHandles, setFollowedGuestHandles] = useState<string[]>([])
  const loadMoreSentinelRef = useRef<HTMLDivElement>(null)
  const loadingMoreRef = useRef(false)

  const allSources = [...PRESET_SOURCES, ...savedFeedSources]

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

  // Scroll to top when landing on the feed (e.g. clicking logo from another page)
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [])

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
      // Single request at a time; limit 30 per page to avoid heavy responses
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
      { rootMargin: '200px', threshold: 0 }
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [cursor, load])

  const mediaItems = items.filter((item) => getPostMediaInfo(item.post))

  return (
    <Layout title="Feed" showNav>
      <div className={styles.wrap}>
        {session && (
          <FeedSelector
            sources={allSources}
            value={source}
            onChange={setSource}
            onAddCustom={async (input) => {
              setError(null)
              try {
                const uri = await resolveFeedUri(input)
                await addSavedFeed(uri)
                await loadSavedFeeds()
                const label = await getFeedDisplayName(uri)
                setSource({ kind: 'custom', label, uri })
              } catch (err) {
                setError(err instanceof Error ? err.message : 'Could not add feed')
              }
            }}
          />
        )}
        {showGuestSection && (
          <section className={styles.guestSection} aria-label={session ? 'Accounts you follow' : 'Guest feed'}>
            {session ? (
              <p className={styles.guestHint}>Quick access to accounts you follow:</p>
            ) : (
              <>
                <p className={styles.guestHint}>Showing posts from these accounts:</p>
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
                <div className={styles.guestSignInRow}>
                  <Link to="/login" className={styles.guestSignInBtn}>
                    Sign in
                  </Link>
                  <span className={styles.guestSignInSuffix}> to see your feed</span>
                </div>
              </>
            )}
            {session && (
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
                      <div className={styles.guestPreviewText}>
                        <span className={styles.guestPreviewLabel}>@{a.handle}</span>
                        <span className={styles.guestPreviewName}>{profile?.displayName ?? a.label}</span>
                      </div>
                    </Link>
                  )
                })}
              </div>
            )}
          </section>
        )}
        {error && <p className={styles.error}>{error}</p>}
        {loading ? (
          <div className={styles.loading}>Loading…</div>
        ) : mediaItems.length === 0 ? (
          <div className={styles.empty}>No posts with images or videos in this feed.</div>
        ) : (
          <>
            <div className={`${styles.grid} ${styles[`gridView${viewMode}`]}`}>
              {mediaItems.map((item) => (
                <PostCard key={item.post.uri} item={item} />
              ))}
            </div>
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
    </Layout>
  )
}
