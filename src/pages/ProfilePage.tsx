import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { agent, publicAgent, getPostMediaInfo, getSession, type TimelineItem } from '../lib/bsky'
import { formatRelativeTime, formatExactDateTime } from '../lib/date'
import PostCard from '../components/PostCard'
import PostText from '../components/PostText'
import Layout from '../components/Layout'
import { useViewMode } from '../context/ViewModeContext'
import styles from './ProfilePage.module.css'
import postBlockStyles from './PostDetailPage.module.css'

const REASON_REPOST = 'app.bsky.feed.defs#reasonRepost'

type ProfileTab = 'posts' | 'reposts' | 'liked' | 'text' | 'feeds'

const PROFILE_TABS: ProfileTab[] = ['posts', 'reposts', 'liked', 'text', 'feeds']

type ProfileState = {
  displayName?: string
  avatar?: string
  description?: string
  did: string
  viewer?: { following?: string }
}

type GeneratorView = { uri: string; displayName: string; description?: string; avatar?: string; likeCount?: number }

export default function ProfilePage() {
  const { handle: handleParam } = useParams<{ handle: string }>()
  const handle = handleParam ? decodeURIComponent(handleParam) : ''
  const [tab, setTab] = useState<ProfileTab>('posts')
  const [items, setItems] = useState<TimelineItem[]>([])
  const [cursor, setCursor] = useState<string | undefined>()
  const [likedItems, setLikedItems] = useState<TimelineItem[]>([])
  const [likedCursor, setLikedCursor] = useState<string | undefined>()
  const [feeds, setFeeds] = useState<GeneratorView[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [profile, setProfile] = useState<ProfileState | null>(null)
  const [followLoading, setFollowLoading] = useState(false)
  const [followUriOverride, setFollowUriOverride] = useState<string | null>(null)
  const session = getSession()
  const { viewMode } = useViewMode()
  const readAgent = session ? agent : publicAgent
  const loadMoreSentinelRef = useRef<HTMLDivElement>(null)
  const loadingMoreRef = useRef(false)
  const [tabsBarVisible, setTabsBarVisible] = useState(true)
  const lastScrollYRef = useRef(0)
  const touchStartXRef = useRef(0)
  const SWIPE_THRESHOLD = 50
  const SCROLL_THRESHOLD = 8

  useEffect(() => {
    if (!handle) return
    readAgent
      .getProfile({ actor: handle })
      .then((res) => {
        const data = res.data
        setProfile({
          displayName: data.displayName,
          avatar: data.avatar,
          description: (data as { description?: string }).description,
          did: data.did,
          viewer: (data as { viewer?: { following?: string } }).viewer,
        })
      })
      .catch(() => {})
  }, [handle, readAgent])

  const load = useCallback(async (nextCursor?: string) => {
    if (!handle) return
    try {
      if (nextCursor) setLoadingMore(true)
      else setLoading(true)
      setError(null)
      const res = await readAgent.getAuthorFeed({ actor: handle, limit: 30, cursor: nextCursor })
      setItems((prev) => (nextCursor ? [...prev, ...res.data.feed] : res.data.feed))
      setCursor(res.data.cursor ?? undefined)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load profile')
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [handle, readAgent])

  const loadLiked = useCallback(async (nextCursor?: string) => {
    if (!handle || !profile || session?.did !== profile.did) return
    try {
      if (nextCursor) setLoadingMore(true)
      else setLoading(true)
      setError(null)
      const res = await agent.getActorLikes({ actor: handle, limit: 30, cursor: nextCursor })
      const feed = res.data.feed as TimelineItem[]
      setLikedItems((prev) => (nextCursor ? [...prev, ...feed] : feed))
      setLikedCursor(res.data.cursor ?? undefined)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load likes')
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [handle, profile?.did, session?.did])

  const loadFeeds = useCallback(async () => {
    if (!handle) return
    try {
      setLoading(true)
      setError(null)
      const res = await readAgent.app.bsky.feed.getActorFeeds({ actor: handle, limit: 50 })
      const list = (res.data.feeds || []).map((f: { uri: string; displayName: string; description?: string; avatar?: string; likeCount?: number }) => ({
        uri: f.uri,
        displayName: f.displayName,
        description: f.description,
        avatar: f.avatar,
        likeCount: f.likeCount,
      }))
      setFeeds(list)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load feeds')
    } finally {
      setLoading(false)
    }
  }, [handle, readAgent])

  useEffect(() => {
    if (handle) {
      setProfile(null)
      setFollowUriOverride(null)
      setTab('posts')
      load()
    }
  }, [handle, load])

  useEffect(() => {
    if (tab === 'liked' && profile && session?.did === profile.did) {
      setLikedItems([])
      setLikedCursor(undefined)
      loadLiked()
    }
  }, [tab, profile?.did, session?.did, loadLiked])

  useEffect(() => {
    if (tab === 'feeds') loadFeeds()
  }, [tab, loadFeeds])

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY
      if (y < 60) setTabsBarVisible(true)
      else if (y > lastScrollYRef.current + SCROLL_THRESHOLD) setTabsBarVisible(false)
      else if (y < lastScrollYRef.current - SCROLL_THRESHOLD) setTabsBarVisible(true)
      lastScrollYRef.current = y
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  function goTab(direction: 1 | -1) {
    const idx = PROFILE_TABS.indexOf(tab)
    const next = (idx + direction + PROFILE_TABS.length) % PROFILE_TABS.length
    setTab(PROFILE_TABS[next])
  }

  function onSwipeStart(e: React.TouchEvent) {
    touchStartXRef.current = e.touches[0].clientX
  }

  function onSwipeEnd(e: React.TouchEvent) {
    const dx = e.changedTouches[0].clientX - touchStartXRef.current
    if (dx < -SWIPE_THRESHOLD) goTab(1)
    else if (dx > SWIPE_THRESHOLD) goTab(-1)
  }

  // Infinite scroll: load more when sentinel enters view (posts, reposts, liked, text tabs)
  loadingMoreRef.current = loadingMore
  useEffect(() => {
    const sentinel = loadMoreSentinelRef.current
    if (!sentinel) return
    const activeCursor = tab === 'liked' ? likedCursor : cursor
    if (!activeCursor) return
    const loadMore = tab === 'liked' ? () => loadLiked(likedCursor) : () => load(cursor)
    const observer = new IntersectionObserver(
      (entries) => {
        const [e] = entries
        if (!e?.isIntersecting || loadingMoreRef.current) return
        loadingMoreRef.current = true
        loadMore()
      },
      { rootMargin: '200px', threshold: 0 }
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [tab, cursor, likedCursor, load, loadLiked])

  const followingUri = profile?.viewer?.following ?? followUriOverride
  const isFollowing = !!followingUri
  const isOwnProfile = !!session && !!profile && session.did === profile.did
  const showFollowButton = !!session && !!profile && !isOwnProfile

  const isRepost = (item: TimelineItem) => (item.reason as { $type?: string })?.$type === REASON_REPOST
  const authorFeedItems = tab === 'posts' ? items.filter((i) => !isRepost(i)) : tab === 'reposts' ? items.filter(isRepost) : items
  const mediaItems = authorFeedItems.filter((item) => getPostMediaInfo(item.post))
  const likedMediaItems = likedItems.filter((item) => getPostMediaInfo(item.post))
  const postText = (post: TimelineItem['post']) => (post.record as { text?: string })?.text?.trim() ?? ''
  const isReply = (post: TimelineItem['post']) => !!(post.record as { reply?: unknown })?.reply
  const textItems = authorFeedItems.filter(
    (item) =>
      postText(item.post).length > 0 &&
      !getPostMediaInfo(item.post) &&
      !isReply(item.post),
  )

  async function handleFollow() {
    if (!profile || followLoading || isFollowing) return
    setFollowLoading(true)
    try {
      const res = await agent.follow(profile.did)
      setFollowUriOverride(res.uri)
    } catch {
      // leave state unchanged so user can retry
    } finally {
      setFollowLoading(false)
    }
  }

  async function handleUnfollow() {
    if (!followingUri || followLoading) return
    setFollowLoading(true)
    try {
      await agent.deleteFollow(followingUri)
      setFollowUriOverride(null)
      setProfile((prev) =>
        prev ? { ...prev, viewer: { ...prev.viewer, following: undefined } } : null,
      )
    } catch {
      // leave state unchanged so user can retry
    } finally {
      setFollowLoading(false)
    }
  }

  if (!handle) {
    return (
      <Layout title="Profile" showNav>
        <div className={styles.wrap}>
          <p className={styles.empty}>No profile specified.</p>
        </div>
      </Layout>
    )
  }

  return (
    <Layout title={`@${handle}`} showNav>
      <div className={styles.wrap}>
        <header className={styles.profileHeader}>
          {profile?.avatar && (
            <img src={profile.avatar} alt="" className={styles.avatar} />
          )}
          <div className={styles.profileMeta}>
            {profile?.displayName && (
              <h2 className={styles.displayName}>{profile.displayName}</h2>
            )}
            <div className={styles.handleRow}>
              <p className={styles.handle}>@{handle}</p>
              {showFollowButton &&
                (isFollowing ? (
                  <button
                    type="button"
                    className={`${styles.followBtn} ${styles.followBtnFollowing}`}
                    onClick={handleUnfollow}
                    disabled={followLoading}
                    title="Unfollow"
                  >
                    <span className={styles.followLabelDefault}>Following</span>
                    <span className={styles.followLabelHover}>Unfollow</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    className={styles.followBtn}
                    onClick={handleFollow}
                    disabled={followLoading}
                  >
                    {followLoading ? 'Following…' : 'Follow'}
                  </button>
                ))}
            </div>
            {profile?.description && (
              <p className={styles.description}>
                <PostText text={profile.description} linkDisplay="domain" />
              </p>
            )}
          </div>
        </header>
        <div className={`${styles.tabsSticky} ${tabsBarVisible ? '' : styles.tabsBarHidden}`}>
          <nav className={styles.tabs} aria-label="Profile sections">
            <button
            type="button"
            className={`${styles.tab} ${tab === 'posts' ? styles.tabActive : ''}`}
            onClick={() => setTab('posts')}
          >
            Posts
          </button>
          <button
            type="button"
            className={`${styles.tab} ${tab === 'reposts' ? styles.tabActive : ''}`}
            onClick={() => setTab('reposts')}
          >
            Reposts
          </button>
          <button
            type="button"
            className={`${styles.tab} ${tab === 'liked' ? styles.tabActive : ''}`}
            onClick={() => setTab('liked')}
          >
            Liked
          </button>
          <button
            type="button"
            className={`${styles.tab} ${tab === 'text' ? styles.tabActive : ''}`}
            onClick={() => setTab('text')}
          >
            Text
          </button>
          <button
            type="button"
            className={`${styles.tab} ${tab === 'feeds' ? styles.tabActive : ''}`}
            onClick={() => setTab('feeds')}
          >
            Feeds
          </button>
          </nav>
        </div>
        {error && <p className={styles.error}>{error}</p>}
        <div
          className={styles.profileContent}
          onTouchStart={onSwipeStart}
          onTouchEnd={onSwipeEnd}
        >
        {loading ? (
          <div className={styles.loading}>Loading…</div>
        ) : tab === 'text' ? (
          textItems.length === 0 ? (
            <div className={styles.empty}>No text-only posts (no media, no replies).</div>
          ) : (
            <>
              <ul className={styles.textList}>
                {textItems.map((item) => {
                  const p = item.post
                  const handle = p.author.handle ?? p.author.did
                  const text = postText(p)
                  const createdAt = (p.record as { createdAt?: string })?.createdAt
                  const avatar = p.author.avatar
                  return (
                    <li key={p.uri}>
                      <Link to={`/post/${encodeURIComponent(p.uri)}`} className={styles.textPostLink}>
                        <article className={postBlockStyles.postBlock}>
                          <div className={postBlockStyles.postBlockContent}>
                            <div className={postBlockStyles.postHead}>
                              {avatar && <img src={avatar} alt="" className={postBlockStyles.avatar} />}
                              <div className={postBlockStyles.authorRow}>
                                <Link
                                  to={`/profile/${encodeURIComponent(handle)}`}
                                  className={postBlockStyles.handleLink}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  @{handle}
                                </Link>
                                {createdAt && (
                                  <span
                                    className={postBlockStyles.postTimestamp}
                                    title={formatExactDateTime(createdAt)}
                                  >
                                    {formatRelativeTime(createdAt)}
                                  </span>
                                )}
                              </div>
                            </div>
                            {text ? (
                              <p className={postBlockStyles.postText}>
                                <PostText text={text} />
                              </p>
                            ) : null}
                          </div>
                        </article>
                      </Link>
                    </li>
                  )
                })}
              </ul>
              {cursor && <div ref={loadMoreSentinelRef} className={styles.loadMoreSentinel} aria-hidden />}
              {loadingMore && <div className={styles.loadingMore}>Loading…</div>}
            </>
          )
        ) : tab === 'feeds' ? (
          feeds.length === 0 ? (
            <div className={styles.empty}>No feeds.</div>
          ) : (
            <ul className={styles.feedsList}>
              {feeds.map((f) => (
                <li key={f.uri}>
                  <a
                    href={`https://bsky.app/profile/${handle}/feed/${encodeURIComponent(f.uri)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.feedLink}
                  >
                    <span className={styles.feedName}>{f.displayName}</span>
                    {f.description && <span className={styles.feedDesc}>{f.description}</span>}
                  </a>
                </li>
              ))}
            </ul>
          )
        ) : tab === 'liked' ? (
            !isOwnProfile ? (
            <div className={styles.empty}>Liked posts are only visible to the account owner.</div>
          ) : likedMediaItems.length === 0 ? (
            <div className={styles.empty}>No liked posts with images or videos.</div>
          ) : (
            <>
              <div className={`${styles.grid} ${styles[`gridView${viewMode}`]}`}>
                {likedMediaItems.map((item) => (
                  <PostCard key={item.post.uri} item={item} />
                ))}
              </div>
              {likedCursor && <div ref={loadMoreSentinelRef} className={styles.loadMoreSentinel} aria-hidden />}
              {loadingMore && <div className={styles.loadingMore}>Loading…</div>}
            </>
          )
        ) : mediaItems.length === 0 ? (
          <div className={styles.empty}>
            {tab === 'posts' ? 'No posts with images or videos.' : 'No reposts with images or videos.'}
          </div>
        ) : (
          <>
            <div className={`${styles.grid} ${styles[`gridView${viewMode}`]}`}>
              {mediaItems.map((item) => (
                <PostCard key={item.post.uri} item={item} />
              ))}
            </div>
            {cursor && <div ref={loadMoreSentinelRef} className={styles.loadMoreSentinel} aria-hidden />}
            {loadingMore && <div className={styles.loadingMore}>Loading…</div>}
          </>
        )}
        </div>
      </div>
    </Layout>
  )
}
