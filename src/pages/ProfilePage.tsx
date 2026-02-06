import { useCallback, useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { agent, getPostMediaInfo, getSession, type TimelineItem } from '../lib/bsky'
import PostCard from '../components/PostCard'
import PostText from '../components/PostText'
import Layout from '../components/Layout'
import { useViewMode } from '../context/ViewModeContext'
import styles from './ProfilePage.module.css'

const REASON_REPOST = 'app.bsky.feed.defs#reasonRepost'

type ProfileTab = 'posts' | 'reposts' | 'liked' | 'text' | 'feeds'

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

  useEffect(() => {
    if (!handle) return
    agent
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
  }, [handle])

  const load = useCallback(async (nextCursor?: string) => {
    if (!handle) return
    try {
      if (nextCursor) setLoadingMore(true)
      else setLoading(true)
      setError(null)
      const res = await agent.getAuthorFeed({ actor: handle, limit: 30, cursor: nextCursor })
      setItems((prev) => (nextCursor ? [...prev, ...res.data.feed] : res.data.feed))
      setCursor(res.data.cursor ?? undefined)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load profile')
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [handle])

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
      const res = await agent.app.bsky.feed.getActorFeeds({ actor: handle, limit: 50 })
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
  }, [handle])

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

  const followingUri = profile?.viewer?.following ?? followUriOverride
  const isFollowing = !!followingUri
  const isOwnProfile = !!session && !!profile && session.did === profile.did
  const showFollowButton = !!session && !!profile && !isOwnProfile

  const isRepost = (item: TimelineItem) => (item.reason as { $type?: string })?.$type === REASON_REPOST
  const authorFeedItems = tab === 'posts' ? items.filter((i) => !isRepost(i)) : tab === 'reposts' ? items.filter(isRepost) : items
  const mediaItems = authorFeedItems.filter((item) => getPostMediaInfo(item.post))
  const likedMediaItems = likedItems.filter((item) => getPostMediaInfo(item.post))
  const postText = (post: TimelineItem['post']) => (post.record as { text?: string })?.text?.trim() ?? ''
  const textItems = authorFeedItems.filter((item) => postText(item.post).length > 0)

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
          {isOwnProfile && (
            <button
              type="button"
              className={`${styles.tab} ${tab === 'liked' ? styles.tabActive : ''}`}
              onClick={() => setTab('liked')}
            >
              Liked
            </button>
          )}
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
        {error && <p className={styles.error}>{error}</p>}
        {loading ? (
          <div className={styles.loading}>Loading…</div>
        ) : tab === 'text' ? (
          textItems.length === 0 ? (
            <div className={styles.empty}>No posts with text.</div>
          ) : (
            <>
              <ul className={styles.textList}>
                {textItems.map((item) => (
                  <li key={item.post.uri}>
                    <Link to={`/post/${encodeURIComponent(item.post.uri)}`} className={styles.textLink}>
                      <span className={styles.textSnippet}>{postText(item.post).slice(0, 200)}{postText(item.post).length > 200 ? '…' : ''}</span>
                    </Link>
                  </li>
                ))}
              </ul>
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
          likedMediaItems.length === 0 ? (
            <div className={styles.empty}>No liked posts with images or videos.</div>
          ) : (
            <>
              <div className={`${styles.grid} ${styles[`gridView${viewMode}`]}`}>
                {likedMediaItems.map((item) => (
                  <PostCard key={item.post.uri} item={item} />
                ))}
              </div>
              {likedCursor && (
                <button
                  type="button"
                  className={styles.more}
                  onClick={() => loadLiked(likedCursor)}
                  disabled={loadingMore}
                >
                  {loadingMore ? 'Loading…' : 'Load more'}
                </button>
              )}
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
