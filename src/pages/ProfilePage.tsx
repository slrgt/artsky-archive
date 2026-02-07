import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useProfileModal } from '../context/ProfileModalContext'
import { agent, publicAgent, getPostMediaInfo, getSession, listStandardSiteDocumentsForAuthor, type TimelineItem, type StandardSiteDocumentView } from '../lib/bsky'
import { formatRelativeTime, formatExactDateTime } from '../lib/date'
import PostCard from '../components/PostCard'
import PostText from '../components/PostText'
import Layout from '../components/Layout'
import { useViewMode } from '../context/ViewModeContext'
import styles from './ProfilePage.module.css'
import postBlockStyles from './PostDetailPage.module.css'

const REASON_REPOST = 'app.bsky.feed.defs#reasonRepost'
const REASON_PIN = 'app.bsky.feed.defs#reasonPin'

type ProfileTab = 'posts' | 'reposts' | 'liked' | 'blog' | 'text' | 'feeds'

const PROFILE_TABS: ProfileTab[] = ['posts', 'reposts', 'liked', 'blog', 'text', 'feeds']

type ProfileState = {
  displayName?: string
  avatar?: string
  description?: string
  did: string
  viewer?: { following?: string }
}

type GeneratorView = { uri: string; displayName: string; description?: string; avatar?: string; likeCount?: number }

export function ProfileContent({
  handle,
  openProfileModal,
}: {
  handle: string
  openProfileModal: (h: string) => void
}) {
  const [tab, setTab] = useState<ProfileTab>('posts')
  const [items, setItems] = useState<TimelineItem[]>([])
  const [cursor, setCursor] = useState<string | undefined>()
  const [likedItems, setLikedItems] = useState<TimelineItem[]>([])
  const [likedCursor, setLikedCursor] = useState<string | undefined>()
  const [feeds, setFeeds] = useState<GeneratorView[]>([])
  const [blogDocuments, setBlogDocuments] = useState<StandardSiteDocumentView[]>([])
  const [blogCursor, setBlogCursor] = useState<string | undefined>()
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
  const [keyboardFocusIndex, setKeyboardFocusIndex] = useState(0)
  const [keyboardAddOpen, setKeyboardAddOpen] = useState(false)
  const { openPostModal, isModalOpen } = useProfileModal()
  const lastScrollYRef = useRef(0)
  const touchStartXRef = useRef(0)
  const cardRefsRef = useRef<(HTMLDivElement | null)[]>([])
  const keyboardFocusIndexRef = useRef(0)
  const profileGridItemsRef = useRef<TimelineItem[]>([])
  const SWIPE_THRESHOLD = 100
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
      const res = await readAgent.getAuthorFeed({ actor: handle, limit: 30, cursor: nextCursor, includePins: true })
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

  const loadBlog = useCallback(async (nextCursor?: string) => {
    if (!handle || !profile?.did) return
    try {
      if (nextCursor) setLoadingMore(true)
      else setLoading(true)
      setError(null)
      const { documents, cursor: next } = await listStandardSiteDocumentsForAuthor(readAgent, profile.did, handle, { cursor: nextCursor })
      setBlogDocuments((prev) => (nextCursor ? [...prev, ...documents] : documents))
      setBlogCursor(next)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load blog')
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [handle, profile?.did, readAgent])

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
    if (tab === 'blog' && profile?.did) loadBlog()
  }, [tab, profile?.did, loadBlog])

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
  const isPinned = (item: TimelineItem) => (item.reason as { $type?: string })?.$type === REASON_PIN
  const isQuotePost = (item: TimelineItem) => {
    const embed = (item.post as { embed?: { $type?: string } })?.embed
    return !!embed && (embed.$type === 'app.bsky.embed.record#view' || embed.$type === 'app.bsky.embed.recordWithMedia#view')
  }
  const isRepostOrQuote = (item: TimelineItem) => isRepost(item) || isQuotePost(item)
  const authorFeedItemsRaw =
    tab === 'posts' ? items.filter((i) => !isRepostOrQuote(i)) : tab === 'reposts' ? items.filter(isRepostOrQuote) : items
  const authorFeedItems =
    tab === 'posts'
      ? [...authorFeedItemsRaw].sort((a, b) => (isPinned(b) ? 1 : 0) - (isPinned(a) ? 1 : 0))
      : authorFeedItemsRaw
  const mediaItems = authorFeedItems.filter((item) => getPostMediaInfo(item.post))
  const likedMediaItems = likedItems.filter((item) => getPostMediaInfo(item.post))
  const profileGridItems = tab === 'liked' ? likedMediaItems : mediaItems
  const cols = viewMode === '1' ? 1 : viewMode === '2' ? 2 : 3
  profileGridItemsRef.current = profileGridItems
  keyboardFocusIndexRef.current = keyboardFocusIndex

  useEffect(() => {
    setKeyboardFocusIndex((i) => (profileGridItems.length ? Math.min(i, profileGridItems.length - 1) : 0))
  }, [profileGridItems.length])

  useEffect(() => {
    const el = cardRefsRef.current[keyboardFocusIndex]
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
  }, [keyboardFocusIndex])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isModalOpen) return
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable) return
      if (e.ctrlKey || e.metaKey) return
      const gridTab = tab === 'posts' || tab === 'reposts' || tab === 'liked'
      if (!gridTab) return

      const items = profileGridItemsRef.current
      if (items.length === 0) return
      const i = keyboardFocusIndexRef.current
      const key = e.key.toLowerCase()
      if (key === 'w' || key === 's' || key === 'a' || key === 'd' || key === 'e' || key === 'enter' || key === 'f' || key === 'c') e.preventDefault()

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
      if (key === 'e' || key === 'enter') {
        const item = items[i]
        if (item) openPostModal(item.post.uri)
        return
      }
      if (key === 'f') {
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
  }, [tab, cols, isModalOpen, openPostModal])

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

  return (
    <>
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
            Respected
          </button>
          <button
            type="button"
            className={`${styles.tab} ${tab === 'blog' ? styles.tabActive : ''}`}
            onClick={() => setTab('blog')}
          >
            Blog
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
        ) : tab === 'blog' ? (
          blogDocuments.length === 0 ? (
            <div className={styles.empty}>No standard.site blog posts.</div>
          ) : (
            <>
              <ul className={styles.textList}>
                {blogDocuments.map((doc) => {
                  const authorHandle = doc.authorHandle ?? doc.did
                  const title = doc.title || doc.path || 'Untitled'
                  const createdAt = doc.createdAt
                  const url = doc.baseUrl
                    ? `${doc.baseUrl.replace(/\/$/, '')}/${(doc.path ?? '').replace(/^\//, '')}`.trim() || doc.baseUrl
                    : null
                  return (
                    <li key={doc.uri}>
                      {url ? (
                        <a href={url} target="_blank" rel="noopener noreferrer" className={styles.textPostLink}>
                          <article className={postBlockStyles.postBlock}>
                            <div className={postBlockStyles.postBlockContent}>
                              <div className={postBlockStyles.postHead}>
                                <div className={postBlockStyles.authorRow}>
                                  <Link
                                    to={`/profile/${encodeURIComponent(authorHandle)}`}
                                    className={`${postBlockStyles.handleLink} ${styles.textPostHandleLink}`}
                                    onClick={(e) => {
                                      e.preventDefault()
                                      e.stopPropagation()
                                      openProfileModal(authorHandle)
                                    }}
                                  >
                                    @{authorHandle}
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
                              <p className={postBlockStyles.postText}>{title}</p>
                            </div>
                          </article>
                        </a>
                      ) : (
                        <article className={postBlockStyles.postBlock}>
                          <div className={postBlockStyles.postBlockContent}>
                            <div className={postBlockStyles.postHead}>
                              <div className={postBlockStyles.authorRow}>
                                <Link
                                  to={`/profile/${encodeURIComponent(authorHandle)}`}
                                  className={`${postBlockStyles.handleLink} ${styles.textPostHandleLink}`}
                                  onClick={(e) => {
                                    e.preventDefault()
                                    openProfileModal(authorHandle)
                                  }}
                                >
                                  @{authorHandle}
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
                            <p className={postBlockStyles.postText}>{title}</p>
                          </div>
                        </article>
                      )}
                    </li>
                  )
                })}
              </ul>
              {blogCursor && (
                <button
                  type="button"
                  className={styles.more}
                  onClick={() => loadBlog(blogCursor)}
                  disabled={loadingMore}
                >
                  {loadingMore ? 'Loading…' : 'Load more'}
                </button>
              )}
            </>
          )
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
                                  className={`${postBlockStyles.handleLink} ${styles.textPostHandleLink}`}
                                  onClick={(e) => {
                                    e.preventDefault()
                                    e.stopPropagation()
                                    openProfileModal(handle)
                                  }}
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
                                <PostText text={text} facets={(p.record as { facets?: unknown[] })?.facets} />
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
            <div className={styles.empty}>Respected posts are only visible to the account owner.</div>
          ) : likedMediaItems.length === 0 ? (
            <div className={styles.empty}>No respected posts with images or videos.</div>
          ) : (
            <>
              <div className={`${styles.grid} ${styles[`gridView${viewMode}`]}`}>
                {likedMediaItems.map((item, index) => (
                  <div
                    key={item.post.uri}
                    onMouseEnter={() => setKeyboardFocusIndex(index)}
                  >
                    <PostCard
                      item={item}
                      isSelected={tab === 'liked' && index === keyboardFocusIndex}
                      cardRef={(el) => { cardRefsRef.current[index] = el }}
                      openAddDropdown={tab === 'liked' && index === keyboardFocusIndex && keyboardAddOpen}
                      onAddClose={() => setKeyboardAddOpen(false)}
                      onPostClick={(uri, opts) => openPostModal(uri, opts?.openReply)}
                    />
                  </div>
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
              {mediaItems.map((item, index) => (
                <div
                  key={item.post.uri}
                  onMouseEnter={() => setKeyboardFocusIndex(index)}
                >
                  <PostCard
                    item={item}
                    isSelected={(tab === 'posts' || tab === 'reposts') && index === keyboardFocusIndex}
                    cardRef={(el) => { cardRefsRef.current[index] = el }}
                    openAddDropdown={(tab === 'posts' || tab === 'reposts') && index === keyboardFocusIndex && keyboardAddOpen}
                    onAddClose={() => setKeyboardAddOpen(false)}
                    onPostClick={(uri, opts) => openPostModal(uri, opts?.openReply)}
                  />
                </div>
              ))}
            </div>
            {cursor && <div ref={loadMoreSentinelRef} className={styles.loadMoreSentinel} aria-hidden />}
            {loadingMore && <div className={styles.loadingMore}>Loading…</div>}
          </>
        )}
        </div>
      </div>
    </>
  )
}

export default function ProfilePage() {
  const { handle: handleParam } = useParams<{ handle: string }>()
  const handle = handleParam ? decodeURIComponent(handleParam) : ''
  const { openProfileModal } = useProfileModal()

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
      <ProfileContent handle={handle} openProfileModal={openProfileModal} />
    </Layout>
  )
}
