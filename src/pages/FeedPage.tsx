import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useNavigationType } from 'react-router-dom'
import {
  agent,
  publicAgent,
  getPostMediaInfo,
  getGuestFeed,
  getSavedFeedsFromPreferences,
  getFeedDisplayName,
  resolveFeedUri,
  addSavedFeed,
  getMixedFeed,
  type TimelineItem,
} from '../lib/bsky'
import { GUEST_FEED_ACCOUNTS } from '../config/guestFeed'
import type { FeedSource } from '../types'
import FeedSelector from '../components/FeedSelector'
import PostCard from '../components/PostCard'
import ProfileLink from '../components/ProfileLink'
import Layout from '../components/Layout'
import { useProfileModal } from '../context/ProfileModalContext'
import { useSession } from '../context/SessionContext'
import { useHiddenPosts } from '../context/HiddenPostsContext'
import { useMediaOnly } from '../context/MediaOnlyContext'
import { useFeedMix } from '../context/FeedMixContext'
import { blockAccount } from '../lib/bsky'
import { useViewMode } from '../context/ViewModeContext'
import styles from './FeedPage.module.css'

const PRESET_SOURCES: FeedSource[] = [
  { kind: 'timeline', label: 'Following' },
  { kind: 'custom', label: "What's Hot", uri: 'at://did:plc:z72i7hdynmk6r22z27h6tvur/app.bsky.feed.generator/whats-hot' },
]

export default function FeedPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const navigationType = useNavigationType()
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
  const [keyboardFocusIndex, setKeyboardFocusIndex] = useState(0)
  const [keyboardAddOpen, setKeyboardAddOpen] = useState(false)
  const { openPostModal, isModalOpen } = useProfileModal()
  const cardRefsRef = useRef<(HTMLDivElement | null)[]>([])
  const mediaItemsRef = useRef<TimelineItem[]>([])
  const keyboardFocusIndexRef = useRef(0)
  const lastScrollIntoViewIndexRef = useRef<number>(-1)
  /** Only scroll into view when focus was changed by keyboard (W/S/A/D), not by mouse hover */
  const scrollIntoViewFromKeyboardRef = useRef(false)
  /** Only update focus on mouse enter when the user has actually moved the mouse (not when scroll moved content under cursor) */
  const mouseMovedRef = useRef(false)
  const [blockConfirm, setBlockConfirm] = useState<{ did: string; handle: string; avatar?: string } | null>(null)
  const blockCancelRef = useRef<HTMLButtonElement>(null)
  const blockConfirmRef = useRef<HTMLButtonElement>(null)
  const [openMenuIndex, setOpenMenuIndex] = useState<number | null>(null)

  const presetUris = new Set((PRESET_SOURCES.map((s) => s.uri).filter(Boolean) as string[]))
  const savedDeduped = savedFeedSources.filter((s) => !s.uri || !presetUris.has(s.uri))
  const allSources = [...PRESET_SOURCES, ...savedDeduped]

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

  // Scroll to top when landing on the feed (e.g. clicking logo), but not when returning via back/Q
  useEffect(() => {
    if (navigationType !== 'POP') window.scrollTo(0, 0)
  }, [navigationType])

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

  const {
    entries: mixEntries,
    setEntryPercent,
    toggleSource,
    totalPercent: mixTotalPercent,
  } = useFeedMix()
  const feedLabel =
    mixEntries.length >= 2
      ? 'Feed mix'
      : mixEntries.length === 1
        ? mixEntries[0].source.label
        : source.kind === 'timeline'
          ? 'Following'
          : source.label ?? undefined

  const load = useCallback(async (nextCursor?: string) => {
    try {
      if (nextCursor) setLoadingMore(true)
      else setLoading(true)
      setError(null)
      if (!session) {
        const { feed, cursor: next } = await getGuestFeed(30, nextCursor)
        setItems((prev) => (nextCursor ? [...prev, ...feed] : feed))
        setCursor(next)
      } else if (mixEntries.length >= 2 && mixTotalPercent >= 99) {
        const isLoadMore = !!nextCursor
        let cursorsToUse: Record<string, string> | undefined
        if (isLoadMore && nextCursor) {
          try {
            cursorsToUse = JSON.parse(nextCursor) as Record<string, string>
          } catch {
            cursorsToUse = undefined
          }
        }
        const { feed, cursors: nextCursors } = await getMixedFeed(
          mixEntries.map((e) => ({ source: e.source, percent: e.percent })),
          30,
          cursorsToUse
        )
        setItems((prev) => (isLoadMore ? [...prev, ...feed] : feed))
        setCursor(Object.keys(nextCursors).length > 0 ? JSON.stringify(nextCursors) : undefined)
      } else if (mixEntries.length === 1) {
        const single = mixEntries[0].source
        if (single.kind === 'timeline') {
          const res = await agent.getTimeline({ limit: 30, cursor: nextCursor })
          setItems((prev) => (nextCursor ? [...prev, ...res.data.feed] : res.data.feed))
          setCursor(res.data.cursor ?? undefined)
        } else if (single.uri) {
          const res = await agent.app.bsky.feed.getFeed({ feed: single.uri, limit: 30, cursor: nextCursor })
          setItems((prev) => (nextCursor ? [...prev, ...res.data.feed] : res.data.feed))
          setCursor(res.data.cursor ?? undefined)
        }
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
  }, [source, session, mixEntries, mixTotalPercent])

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
      { rootMargin: '600px', threshold: 0 }
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [cursor, load])

  const { isHidden, addHidden } = useHiddenPosts()
  const { mediaOnly, toggleMediaOnly } = useMediaOnly()
  const displayItems = items
    .filter((item) => (mediaOnly ? getPostMediaInfo(item.post) : true))
    .filter((item) => !isHidden(item.post.uri))
  const cols = viewMode === '1' ? 1 : viewMode === '2' ? 2 : 3
  mediaItemsRef.current = displayItems
  keyboardFocusIndexRef.current = keyboardFocusIndex

  useEffect(() => {
    setKeyboardFocusIndex((i) => (displayItems.length ? Math.min(i, displayItems.length - 1) : 0))
  }, [displayItems.length])

  useEffect(() => {
    const onMouseMove = () => { mouseMovedRef.current = true }
    window.addEventListener('mousemove', onMouseMove)
    return () => window.removeEventListener('mousemove', onMouseMove)
  }, [])

  // When focus moves to another post and a menu is open, close the menu (don't open the new post's menu)
  useEffect(() => {
    if (openMenuIndex !== null && openMenuIndex !== keyboardFocusIndex) setOpenMenuIndex(null)
  }, [keyboardFocusIndex, openMenuIndex])

  // Scroll focused card into view only when focus was changed by keyboard (W/S/A/D), not on mouse hover
  useEffect(() => {
    if (!scrollIntoViewFromKeyboardRef.current) return
    scrollIntoViewFromKeyboardRef.current = false
    if (keyboardFocusIndex === lastScrollIntoViewIndexRef.current) return
    lastScrollIntoViewIndexRef.current = keyboardFocusIndex
    const index = keyboardFocusIndex
    const raf = requestAnimationFrame(() => {
      const el = cardRefsRef.current[index]
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' })
      }
    })
    return () => cancelAnimationFrame(raf)
  }, [keyboardFocusIndex])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isModalOpen) return
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable) return
      if (e.ctrlKey || e.metaKey) return
      if (location.pathname !== '/feed') return

      const items = mediaItemsRef.current // displayItems
      const i = keyboardFocusIndexRef.current
      if (items.length === 0) return

      const key = e.key.toLowerCase()
      /* Ignore key repeat so D/A/W/S move one step only (no skip) */
      if (e.repeat && (key === 'w' || key === 's' || key === 'a' || key === 'd' || e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight')) return
      if (blockConfirm) {
        if (key === 'escape') {
          e.preventDefault()
          setBlockConfirm(null)
          return
        }
        return // let Tab/Enter reach the dialog buttons
      }
      // When ... menu is open, let the menu handle W/S/E/Q (navigate and activate)
      if (openMenuIndex !== null && (key === 'w' || key === 's' || key === 'e' || key === 'q' || e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight')) return
      if (key === 'w' || key === 's' || key === 'a' || key === 'd' || key === 'e' || key === 'enter' || key === 'r' || key === 'f' || key === 'c' || key === 'h' || key === 'b' || key === 'm' || key === '`' || key === '4' || e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') e.preventDefault()

      if (key === 'h') {
        const item = items[i]
        if (item?.post?.uri) {
          addHidden(item.post.uri)
          mouseMovedRef.current = false
          setKeyboardFocusIndex((idx) => Math.max(0, Math.min(idx, items.length - 2)))
        }
        return
      }
      if (key === 'b') {
        const item = items[i]
        if (item?.post?.author && session?.did !== item.post.author.did) {
          setBlockConfirm({
            did: item.post.author.did,
            handle: item.post.author.handle ?? item.post.author.did,
            avatar: item.post.author.avatar,
          })
          requestAnimationFrame(() => blockCancelRef.current?.focus())
        }
        return
      }

      /* Use ref + concrete value (not functional updater) so Strict Mode double-invoke doesn't move two steps */
      if (key === 'w' || e.key === 'ArrowUp') {
        mouseMovedRef.current = false
        scrollIntoViewFromKeyboardRef.current = true
        setKeyboardFocusIndex(Math.max(0, i - cols))
        return
      }
      if (key === 's' || e.key === 'ArrowDown') {
        mouseMovedRef.current = false
        scrollIntoViewFromKeyboardRef.current = true
        setKeyboardFocusIndex(Math.min(items.length - 1, i + cols))
        return
      }
      if (key === 'a' || e.key === 'ArrowLeft') {
        mouseMovedRef.current = false
        scrollIntoViewFromKeyboardRef.current = true
        setKeyboardFocusIndex(Math.max(0, i - 1))
        return
      }
      if (key === 'd' || e.key === 'ArrowRight') {
        mouseMovedRef.current = false
        scrollIntoViewFromKeyboardRef.current = true
        setKeyboardFocusIndex(Math.min(items.length - 1, i + 1))
        return
      }
      if (key === 'e' || key === 'enter') {
        const item = items[i]
        if (item) openPostModal(item.post.uri)
        return
      }
      if (key === 'r') {
        const item = items[i]
        if (item) openPostModal(item.post.uri, true)
        return
      }
      if (key === 'f') {
        const item = items[i]
        if (item?.post?.uri && item?.post?.cid) agent.like(item.post.uri, item.post.cid).catch(() => {})
        return
      }
      if (key === 'c') {
        setKeyboardAddOpen(true)
        return
      }
      if (key === 'm' || key === '`') {
        if (openMenuIndex === i) {
          setOpenMenuIndex(null)
        } else {
          setOpenMenuIndex(i)
        }
        return
      }
      if (key === '4') {
        const item = items[i]
        const author = item?.post?.author as { did: string; viewer?: { following?: string } } | undefined
        if (author && session?.did && session.did !== author.did) {
          const postUri = item.post.uri
          const followingUri = author.viewer?.following
          if (followingUri) {
            agent.deleteFollow(followingUri).then(() => {
              setItems((prev) =>
                prev.map((it): TimelineItem => {
                  if (it.post.uri !== postUri) return it
                  const post = it.post
                  const auth = post.author as { did: string; handle?: string; viewer?: { following?: string } }
                  return {
                    ...it,
                    post: {
                      ...post,
                      author: {
                        ...auth,
                        viewer: { ...auth.viewer, following: undefined },
                      },
                    } as TimelineItem['post'],
                  }
                })
              )
            }).catch(() => {})
          } else {
            agent.follow(author.did).then((res) => {
              setItems((prev) =>
                prev.map((it): TimelineItem => {
                  if (it.post.uri !== postUri) return it
                  const post = it.post
                  const auth = post.author as { did: string; handle?: string; viewer?: { following?: string } }
                  return {
                    ...it,
                    post: {
                      ...post,
                      author: {
                        ...auth,
                        viewer: { ...auth.viewer, following: res.uri },
                      },
                    } as TimelineItem['post'],
                  }
                })
              )
            }).catch(() => {})
          }
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [location.pathname, cols, isModalOpen, openPostModal, blockConfirm, addHidden, session, openMenuIndex])

  useEffect(() => {
    if (blockConfirm) blockCancelRef.current?.focus()
  }, [blockConfirm])

  return (
    <Layout title="Feed" showNav>
      <>
      <div className={styles.wrap}>
        {session && (
          <FeedSelector
            sources={allSources}
            fallbackSource={source}
            mixEntries={mixEntries}
            onToggle={toggleSource}
            setEntryPercent={setEntryPercent}
            onAddCustom={async (input) => {
              setError(null)
              try {
                const uri = await resolveFeedUri(input)
                await addSavedFeed(uri)
                await loadSavedFeeds()
                const label = await getFeedDisplayName(uri)
                toggleSource({ kind: 'custom', label, uri })
              } catch (err) {
                setError(err instanceof Error ? err.message : 'Could not add feed')
              }
            }}
          />
        )}
        <div className={styles.filterRow}>
          <button
            type="button"
            className={mediaOnly ? styles.filterBtn : styles.filterBtnActive}
            onClick={toggleMediaOnly}
            title={mediaOnly ? 'Include text-only posts' : 'Currently showing all posts. Click to show only posts with images or video.'}
            aria-pressed={!mediaOnly}
          >
            {mediaOnly ? 'Include text-only posts' : 'Showing all posts'}
          </button>
        </div>
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
                      <ProfileLink
                        key={a.handle}
                        handle={a.handle}
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
                      </ProfileLink>
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
                    <ProfileLink
                      key={a.handle}
                      handle={a.handle}
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
                    </ProfileLink>
                  )
                })}
              </div>
            )}
          </section>
        )}
        {error && <p className={styles.error}>{error}</p>}
        {loading ? (
          <div className={styles.loading}>Loading…</div>
        ) : displayItems.length === 0 ? (
          <div className={styles.empty}>
            {mediaOnly ? 'No posts with images or videos in this feed.' : 'No posts in this feed.'}
          </div>
        ) : (
          <>
            {cols >= 2 ? (
              <div className={`${styles.gridColumns} ${styles[`gridView${viewMode}`]}`}>
                {Array.from({ length: cols }, (_, colIndex) => (
                  <div key={colIndex} className={styles.gridColumn}>
                    {displayItems
                      .map((item, index) => ({ item, index }))
                      .filter(({ index }) => index % cols === colIndex)
                      .map(({ item, index }) => (
                        <div
                          key={item.post.uri}
                          className={styles.gridItem}
                          onMouseEnter={() => {
                            if (mouseMovedRef.current) {
                              mouseMovedRef.current = false
                              setKeyboardFocusIndex(index)
                            }
                          }}
                        >
                          <PostCard
                            item={item}
                            isSelected={index === keyboardFocusIndex}
                            cardRef={(el) => { cardRefsRef.current[index] = el }}
                            openAddDropdown={index === keyboardFocusIndex && keyboardAddOpen}
                            onAddClose={() => setKeyboardAddOpen(false)}
                            onPostClick={(uri, opts) => openPostModal(uri, opts?.openReply)}
                            feedLabel={(item as { _feedSource?: { label?: string } })._feedSource?.label ?? feedLabel}
                            openActionsMenu={openMenuIndex === index}
                            onActionsMenuOpen={() => setOpenMenuIndex(index)}
                            onActionsMenuClose={() => setOpenMenuIndex(null)}
                            onAspectRatio={undefined}
                            fillCell={false}
                          />
                        </div>
                      ))}
                  </div>
                ))}
              </div>
            ) : (
              <div className={`${styles.grid} ${styles[`gridView${viewMode}`]}`}>
                {displayItems.map((item, index) => (
                  <div
                    key={item.post.uri}
                    onMouseEnter={() => {
                      if (mouseMovedRef.current) {
                        mouseMovedRef.current = false
                        setKeyboardFocusIndex(index)
                      }
                    }}
                  >
                    <PostCard
                      item={item}
                      isSelected={index === keyboardFocusIndex}
                      cardRef={(el) => { cardRefsRef.current[index] = el }}
                      openAddDropdown={index === keyboardFocusIndex && keyboardAddOpen}
                      onAddClose={() => setKeyboardAddOpen(false)}
                      onPostClick={(uri, opts) => openPostModal(uri, opts?.openReply)}
                      feedLabel={(item as { _feedSource?: { label?: string } })._feedSource?.label ?? feedLabel}
                      openActionsMenu={openMenuIndex === index}
                      onActionsMenuOpen={() => setOpenMenuIndex(index)}
                      onActionsMenuClose={() => setOpenMenuIndex(null)}
                      onAspectRatio={undefined}
                      fillCell={false}
                    />
                  </div>
                ))}
              </div>
            )}
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
      {blockConfirm && (
        <div
          className={styles.blockOverlay}
          role="dialog"
          aria-modal="true"
          aria-labelledby="block-dialog-title"
          onKeyDown={(e) => e.key === 'Escape' && setBlockConfirm(null)}
          onClick={() => setBlockConfirm(null)}
        >
          <div className={styles.blockDialog} onClick={(e) => e.stopPropagation()}>
            <h2 id="block-dialog-title" className={styles.blockTitle}>Block user?</h2>
            <div className={styles.blockUser}>
              {blockConfirm.avatar ? (
                <img src={blockConfirm.avatar} alt="" className={styles.blockAvatar} />
              ) : (
                <div className={styles.blockAvatarPlaceholder} />
              )}
              <span className={styles.blockHandle}>@{blockConfirm.handle}</span>
            </div>
            <div className={styles.blockActions}>
              <button
                ref={blockCancelRef}
                type="button"
                className={styles.blockCancelBtn}
                onClick={() => setBlockConfirm(null)}
              >
                Cancel
              </button>
              <button
                ref={blockConfirmRef}
                type="button"
                className={styles.blockConfirmBtn}
                onClick={async () => {
                  if (!blockConfirm) return
                  try {
                    await blockAccount(blockConfirm.did)
                    setBlockConfirm(null)
                  } catch (_) {}
                }}
              >
                Block
              </button>
            </div>
          </div>
        </div>
      )}
      </>
    </Layout>
  )
}
