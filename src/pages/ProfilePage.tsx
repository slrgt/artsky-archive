import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useParams, Link } from 'react-router-dom'
import { useProfileModal } from '../context/ProfileModalContext'
import { useEditProfile } from '../context/EditProfileContext'
import { useModalTopBarSlot } from '../context/ModalTopBarSlotContext'
import { agent, publicAgent, getAgent, getPostMediaInfo, getPostMediaInfoForDisplay, getSession, getActorFeeds, listStandardSiteDocumentsForAuthor, listActivitySubscriptions, putActivitySubscription, isPostNsfw, getFolloweesWhoFollowTarget, type TimelineItem, type StandardSiteDocumentView, type ProfileViewBasic } from '../lib/bsky'
import { setInitialPostForUri } from '../lib/postCache'
import type { AtpAgent } from '@atproto/api'
import { formatRelativeTime, formatExactDateTime } from '../lib/date'
import PostCard from '../components/PostCard'
import PostText from '../components/PostText'
import ProfileActionsMenu from '../components/ProfileActionsMenu'
import BlockedAndMutedModal from '../components/BlockedAndMutedModal'
import { FollowListModal } from '../components/FollowListModal'
import Layout from '../components/Layout'
import { useViewMode, type ViewMode } from '../context/ViewModeContext'
import { useModeration, type NsfwPreference } from '../context/ModerationContext'
import { useHideReposts } from '../context/HideRepostsContext'
import { EyeOpenIcon, EyeHalfIcon, EyeClosedIcon } from '../components/Icons'
import styles from './ProfilePage.module.css'
import postBlockStyles from './PostDetailPage.module.css'

const REASON_REPOST = 'app.bsky.feed.defs#reasonRepost'
const REASON_PIN = 'app.bsky.feed.defs#reasonPin'

const VIEW_MODE_CYCLE: ViewMode[] = ['1', '2', '3']

/** Nominal column width for height estimation (px). */
const ESTIMATE_COL_WIDTH = 280
const CARD_CHROME = 100

function estimateItemHeight(item: TimelineItem): number {
  const media = getPostMediaInfo(item.post)
  if (!media) return CARD_CHROME + 80
  if (media.aspectRatio != null && media.aspectRatio > 0) {
    return CARD_CHROME + ESTIMATE_COL_WIDTH / media.aspectRatio
  }
  return CARD_CHROME + 220
}

/** Distribute items so no column is much longer than others: cap count difference at 1, then pick by smallest estimated height. */
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

function indexAbove(
  columns: Array<Array<{ item: TimelineItem; originalIndex: number }>>,
  currentIndex: number
): number {
  for (let c = 0; c < columns.length; c++) {
    const row = columns[c].findIndex((e) => e.originalIndex === currentIndex)
    if (row > 0) return columns[c][row - 1].originalIndex
    if (row === 0) return currentIndex
  }
  return currentIndex
}

function indexBelow(
  columns: Array<Array<{ item: TimelineItem; originalIndex: number }>>,
  currentIndex: number
): number {
  for (let c = 0; c < columns.length; c++) {
    const row = columns[c].findIndex((e) => e.originalIndex === currentIndex)
    if (row >= 0 && row < columns[c].length - 1) return columns[c][row + 1].originalIndex
    if (row >= 0) return currentIndex
  }
  return currentIndex
}

function indexLeftByRow(
  columns: Array<Array<{ item: TimelineItem; originalIndex: number }>>,
  currentIndex: number
): number {
  for (let c = 0; c < columns.length; c++) {
    const row = columns[c].findIndex((e) => e.originalIndex === currentIndex)
    if (row < 0) continue
    if (c === 0) return currentIndex
    const leftCol = columns[c - 1]
    if (row < leftCol.length) return leftCol[row].originalIndex
    return currentIndex
  }
  return currentIndex
}

function indexRightByRow(
  columns: Array<Array<{ item: TimelineItem; originalIndex: number }>>,
  currentIndex: number
): number {
  for (let c = 0; c < columns.length; c++) {
    const row = columns[c].findIndex((e) => e.originalIndex === currentIndex)
    if (row < 0) continue
    if (c === columns.length - 1) return currentIndex
    const rightCol = columns[c + 1]
    if (row < rightCol.length) return rightCol[row].originalIndex
    return currentIndex
  }
  return currentIndex
}

function ColumnIcon({ cols }: { cols: 1 | 2 | 3 }) {
  const w = 14
  const h = 12
  const gap = 2
  const barW = cols === 1 ? 4 : (w - (cols - 1) * gap) / cols
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} fill="currentColor" aria-hidden>
      {cols === 1 && <rect x={(w - barW) / 2} y={0} width={barW} height={h} rx={1} />}
      {cols === 2 && (
        <>
          <rect x={0} y={0} width={barW} height={h} rx={1} />
          <rect x={barW + gap} y={0} width={barW} height={h} rx={1} />
        </>
      )}
      {cols === 3 && (
        <>
          <rect x={0} y={0} width={barW} height={h} rx={1} />
          <rect x={barW + gap} y={0} width={barW} height={h} rx={1} />
          <rect x={(barW + gap) * 2} y={0} width={barW} height={h} rx={1} />
        </>
      )}
    </svg>
  )
}

function NsfwEyeIcon({ mode }: { mode: NsfwPreference }) {
  if (mode === 'sfw') return <EyeClosedIcon size={24} />
  if (mode === 'blurred') return <EyeHalfIcon size={24} />
  return <EyeOpenIcon size={24} />
}

type ProfileTab = 'posts' | 'reposts' | 'blog' | 'text' | 'feeds'
type ProfilePostsFilter = 'all' | 'liked'

type ProfileState = {
  displayName?: string
  avatar?: string
  description?: string
  did: string
  viewer?: { following?: string }
  verification?: { verifiedStatus?: string }
}

type GeneratorView = { uri: string; displayName: string; description?: string; avatar?: string; likeCount?: number }

export function ProfileContent({
  handle,
  openProfileModal,
  inModal = false,
  onRegisterRefresh,
}: {
  handle: string
  openProfileModal: (h: string) => void
  /** When true, we are the profile popup content so keyboard shortcuts always apply. When false, skip if another modal (e.g. post) is open. */
  inModal?: boolean
  /** When in a modal, call with a function that refreshes this view (used for pull-to-refresh). */
  onRegisterRefresh?: (refresh: () => void | Promise<void>) => void
}) {
  const [tab, setTab] = useState<ProfileTab>('posts')
  const [profilePostsFilter, setProfilePostsFilter] = useState<ProfilePostsFilter>('all')
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
  const [notificationSubscribed, setNotificationSubscribed] = useState<boolean | null>(null)
  const [notificationLoading, setNotificationLoading] = useState(false)
  const session = getSession()
  const { viewMode, setViewMode } = useViewMode()
  const readAgent = session ? agent : publicAgent
  const loadMoreSentinelRef = useRef<HTMLDivElement>(null)
  /** One sentinel per column so we load more when the user nears the bottom of any column (avoids blank space in short columns). */
  const loadMoreSentinelRefs = useRef<(HTMLDivElement | null)[]>([])
  const loadingMoreRef = useRef(false)
  const [tabsBarVisible] = useState(true)
  const [keyboardFocusIndex, setKeyboardFocusIndex] = useState(0)
  const [keyboardAddOpen, setKeyboardAddOpen] = useState(false)
  const [actionsMenuOpenForIndex, setActionsMenuOpenForIndex] = useState<number | null>(null)
  const [showBlockedMutedModal, setShowBlockedMutedModal] = useState(false)
  const [followListModal, setFollowListModal] = useState<'followers' | 'following' | 'mutuals' | 'followedByFollows' | null>(null)
  const [followeesWhoFollowPreview, setFolloweesWhoFollowPreview] = useState<ProfileViewBasic[] | null>(null)
  const [, setFolloweesWhoFollowLoading] = useState(false)
  const [likeOverrides, setLikeOverrides] = useState<Record<string, string | null>>({})
  const { openPostModal, isModalOpen } = useProfileModal()
  const editProfileCtx = useEditProfile()
  const topBarSlots = useModalTopBarSlot()
  const topBarRightSlot = topBarSlots?.rightSlot ?? null
  const openEditProfile = editProfileCtx?.openEditProfile ?? (() => {})
  const editSavedVersion = editProfileCtx?.editSavedVersion ?? 0
  const cardRefsRef = useRef<(HTMLDivElement | null)[]>([])
  const keyboardFocusIndexRef = useRef(0)
  const profileGridItemsRef = useRef<TimelineItem[]>([])
  const scrollIntoViewFromKeyboardRef = useRef(false)
  const lastScrollIntoViewIndexRef = useRef(-1)
  const mouseMovedRef = useRef(false)

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
          verification: (data as { verification?: { verifiedStatus?: string } }).verification,
        })
      })
      .catch(() => {})
  }, [handle, readAgent, editSavedVersion])

  useEffect(() => {
    if (!session || !profile) {
      setNotificationSubscribed(null)
      return
    }
    if (session.did === profile.did) return
    listActivitySubscriptions()
      .then((subs) => setNotificationSubscribed(subs.some((s) => s.did === profile.did)))
      .catch(() => setNotificationSubscribed(null))
  }, [session, profile?.did])

  useEffect(() => {
    if (!session || !profile || session.did === profile.did) {
      setFolloweesWhoFollowPreview(null)
      setFolloweesWhoFollowLoading(false)
      return
    }
    setFolloweesWhoFollowLoading(true)
    let cancelled = false
    const timeoutId = setTimeout(() => {
      if (!cancelled) setFolloweesWhoFollowLoading(false)
    }, 12000)
    const client = getAgent() as AtpAgent
    getFolloweesWhoFollowTarget(client, session.did, profile.did, { limit: 30 })
      .then(({ list }) => {
        if (!cancelled) setFolloweesWhoFollowPreview(list)
      })
      .catch(() => {
        if (!cancelled) setFolloweesWhoFollowPreview([])
      })
      .finally(() => {
        if (!cancelled) setFolloweesWhoFollowLoading(false)
      })
    return () => {
      cancelled = true
      clearTimeout(timeoutId)
    }
  }, [session?.did, profile?.did])

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

  const loadFeeds = useCallback(async () => {
    if (!handle) return
    try {
      setLoading(true)
      setError(null)
      const list = await getActorFeeds(handle, 50)
      setFeeds(list)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load feeds')
      setFeeds([])
    } finally {
      setLoading(false)
    }
  }, [handle])

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

  const loadLiked = useCallback(async (nextCursor?: string) => {
    if (!handle || !session || !profile || session.did !== profile.did) return
    try {
      if (nextCursor) setLoadingMore(true)
      else setLoading(true)
      setError(null)
      const res = await agent.getActorLikes({ actor: handle, limit: 30, cursor: nextCursor })
      const feed = (res.data.feed ?? []) as TimelineItem[]
      setLikedItems((prev) => (nextCursor ? [...prev, ...feed] : feed))
      setLikedCursor(res.data.cursor ?? undefined)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load liked posts')
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [handle, profile?.did, session?.did])

  useEffect(() => {
    if (handle) {
      setProfile(null)
      setFollowUriOverride(null)
      setTab('posts')
      setProfilePostsFilter('all')
      setLikedItems([])
      setLikedCursor(undefined)
      load()
    }
  }, [handle, load])

  useEffect(() => {
    if (profilePostsFilter === 'liked' && handle && session && profile && session.did === profile.did) {
      loadLiked()
    }
  }, [profilePostsFilter, handle, profile?.did, session?.did, loadLiked])

  useEffect(() => {
    if (tab === 'feeds') loadFeeds()
  }, [tab, loadFeeds])

  useEffect(() => {
    if (tab === 'blog' && profile?.did) loadBlog()
  }, [tab, profile?.did, loadBlog])

  useEffect(() => {
    onRegisterRefresh?.(async () => {
      await load()
      await loadFeeds()
      await loadBlog()
      await loadLiked()
    })
  }, [onRegisterRefresh, load, loadFeeds, loadBlog, loadLiked])

  // Infinite scroll: load more when any column's sentinel is about to enter view (posts, reposts tabs).
  // Per-column sentinels when cols >= 2 so short columns trigger load before blank space; 800px
  // rootMargin to load before user sees empty space. Fallback timer handles the case where a very
  // tall post pushes short-column sentinels beyond rootMargin and the observer never sees them.
  loadingMoreRef.current = loadingMore
  const colsForObserver = viewMode === '1' ? 1 : viewMode === '2' ? 2 : 3
  const loadMoreCursor = tab === 'posts' && profilePostsFilter === 'liked' ? likedCursor : cursor
  const loadMore = tab === 'posts' && profilePostsFilter === 'liked' ? (c: string) => loadLiked(c) : load
  useEffect(() => {
    if (tab !== 'posts' && tab !== 'reposts') return
    if (!loadMoreCursor) return
    const firstSentinel = colsForObserver >= 2 ? loadMoreSentinelRefs.current[0] : loadMoreSentinelRef.current
    const root = inModal ? firstSentinel?.closest('[data-modal-scroll]') ?? null : null
    let retryId = 0
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && !loadingMoreRef.current) {
            loadingMoreRef.current = true
            loadMore(loadMoreCursor)
            break
          }
        }
      },
      { root: root ?? undefined, rootMargin: '800px', threshold: 0 }
    )
    if (colsForObserver >= 2) {
      const refs = loadMoreSentinelRefs.current
      for (let c = 0; c < colsForObserver; c++) {
        const el = refs[c]
        if (el) observer.observe(el)
      }
      // Fallback: if any column's sentinel scrolled beyond rootMargin (very tall post), check after a short delay.
      retryId = window.setTimeout(() => {
        if (loadingMoreRef.current) return
        const rootBottom = root ? root.getBoundingClientRect().bottom : window.innerHeight
        for (let c = 0; c < colsForObserver; c++) {
          const el = refs[c]
          if (!el) continue
          if (el.getBoundingClientRect().bottom < rootBottom) {
            loadingMoreRef.current = true
            loadMore(loadMoreCursor)
            return
          }
        }
      }, 200)
    } else {
      const sentinel = loadMoreSentinelRef.current
      if (sentinel) observer.observe(sentinel)
    }
    return () => {
      observer.disconnect()
      clearTimeout(retryId)
    }
  }, [tab, profilePostsFilter, loadMoreCursor, load, loadLiked, loadMore, inModal, colsForObserver])

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
  const itemsForPostsTab = profilePostsFilter === 'liked' ? likedItems : items
  /* Posts tab + my posts: original posts + quote posts with media. Posts tab + liked: all liked posts (no filter). Reposts tab: reposts + quote posts. Text tab: text-only from same source as posts (includes quote posts with only text, per getPostMediaInfoForDisplay). */
  const authorFeedItemsRaw =
    tab === 'posts'
      ? profilePostsFilter === 'liked'
        ? likedItems
        : itemsForPostsTab.filter((i) => !isRepost(i) && (!isQuotePost(i) || !!getPostMediaInfo(i.post)))
      : tab === 'reposts'
        ? items.filter(isRepostOrQuote)
        : tab === 'text'
          ? itemsForPostsTab
          : items
  const authorFeedItems =
    tab === 'posts'
      ? [...authorFeedItemsRaw].sort((a, b) => (isPinned(b) ? 1 : 0) - (isPinned(a) ? 1 : 0))
      : authorFeedItemsRaw
  const { nsfwPreference, cycleNsfwPreference, unblurredUris, setUnblurred } = useModeration()
  const mediaItems = authorFeedItems
    .filter((item) => getPostMediaInfoForDisplay(item.post))
    .filter((item) => nsfwPreference !== 'sfw' || !isPostNsfw(item.post))
  const profileGridItems = mediaItems

  /* For modal: which tabs have content (hide empty categories) */
  const tabHasContent = useMemo(() => {
    const postsSource = profilePostsFilter === 'liked' ? likedItems : items
    const postsMedia = profilePostsFilter === 'liked' ? postsSource : postsSource.filter((i) => !isRepost(i) && (!isQuotePost(i) || !!getPostMediaInfo(i.post)))
      .filter((i) => getPostMediaInfoForDisplay(i.post))
      .filter((i) => nsfwPreference !== 'sfw' || !isPostNsfw(i.post))
    const repostsMedia = items.filter(isRepostOrQuote)
      .filter((i) => getPostMediaInfoForDisplay(i.post))
      .filter((i) => nsfwPreference !== 'sfw' || !isPostNsfw(i.post))
    /* Text tab: same source as posts (all or liked). Includes quote posts with only text (getPostMediaInfoForDisplay is null when outer and quoted have no media). */
    const textOnly = postsSource.filter((i) => !isRepost(i)).filter((i) => {
      const text = (i.post.record as { text?: string })?.text?.trim() ?? ''
      const hasMedia = getPostMediaInfoForDisplay(i.post)
      const isReplyPost = !!(i.post.record as { reply?: unknown })?.reply
      return text.length > 0 && !hasMedia && !isReplyPost
    })
    return {
      posts: postsMedia.length > 0,
      reposts: repostsMedia.length > 0,
      blog: blogDocuments.length > 0,
      text: textOnly.length > 0,
      feeds: feeds.length > 0,
    }
  }, [items, likedItems, profilePostsFilter, blogDocuments, feeds, nsfwPreference])

  const visibleTabs = useMemo((): ProfileTab[] => {
    const t: ProfileTab[] = []
    if (tabHasContent.posts || isOwnProfile) t.push('posts')
    if (tabHasContent.reposts) t.push('reposts')
    if (tabHasContent.blog) t.push('blog')
    if (tabHasContent.text) t.push('text')
    if (tabHasContent.feeds) t.push('feeds')
    return t
  }, [tabHasContent, isOwnProfile])

  useEffect(() => {
    if (loading || visibleTabs.length === 0) return
    if (!visibleTabs.includes(tab)) setTab(visibleTabs[0])
  }, [loading, visibleTabs, tab])
  const cols = viewMode === '1' ? 1 : viewMode === '2' ? 2 : 3
  profileGridItemsRef.current = profileGridItems
  keyboardFocusIndexRef.current = keyboardFocusIndex

  useEffect(() => {
    setKeyboardFocusIndex((i) => (profileGridItems.length ? Math.min(i, profileGridItems.length - 1) : 0))
  }, [profileGridItems.length])

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
      /* When on full page, don't steal keys if another modal (e.g. post) is open. When we are the profile popup (inModal), always handle. */
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
      const gridTab = tab === 'posts' || tab === 'reposts'
      if (!gridTab) return

      const items = profileGridItemsRef.current
      if (items.length === 0) return
      const i = keyboardFocusIndexRef.current
      const key = e.key.toLowerCase()
      if (key === 'w' || key === 's' || key === 'a' || key === 'd' || key === 'e' || key === 'enter' || key === 'f' || key === 'c' || key === 'm' || key === '`' || e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight') e.preventDefault()

      if (key === 'w' || e.key === 'ArrowUp') {
        mouseMovedRef.current = false
        scrollIntoViewFromKeyboardRef.current = true
        if (cols >= 2) {
          const columns = distributeByHeight(items, cols)
          setKeyboardFocusIndex((idx) => indexAbove(columns, idx))
        } else {
          setKeyboardFocusIndex((idx) => Math.max(0, idx - 1))
        }
        return
      }
      if (key === 's' || e.key === 'ArrowDown') {
        mouseMovedRef.current = false
        scrollIntoViewFromKeyboardRef.current = true
        if (cols >= 2) {
          const columns = distributeByHeight(items, cols)
          setKeyboardFocusIndex((idx) => indexBelow(columns, idx))
        } else {
          setKeyboardFocusIndex((idx) => Math.min(items.length - 1, idx + 1))
        }
        return
      }
      if (key === 'a' || e.key === 'ArrowLeft') {
        mouseMovedRef.current = false
        scrollIntoViewFromKeyboardRef.current = true
        setActionsMenuOpenForIndex(null)
        if (cols >= 2) {
          const columns = distributeByHeight(items, cols)
          setKeyboardFocusIndex((idx) => indexLeftByRow(columns, idx))
        } else {
          setKeyboardFocusIndex((idx) => Math.max(0, idx - 1))
        }
        return
      }
      if (key === 'd' || e.key === 'ArrowRight') {
        mouseMovedRef.current = false
        scrollIntoViewFromKeyboardRef.current = true
        setActionsMenuOpenForIndex(null)
        if (cols >= 2) {
          const columns = distributeByHeight(items, cols)
          setKeyboardFocusIndex((idx) => indexRightByRow(columns, idx))
        } else {
          setKeyboardFocusIndex((idx) => Math.min(items.length - 1, idx + 1))
        }
        return
      }
      if ((key === 'm' || key === '`') && i >= 0) {
        const menuOpenForFocusedCard = actionsMenuOpenForIndex === i
        if (menuOpenForFocusedCard) {
          setActionsMenuOpenForIndex(null)
        } else {
          setActionsMenuOpenForIndex(i)
        }
        return
      }
      if (key === 'e' || key === 'enter') {
        const item = items[i]
        if (item) openPostModal(item.post.uri)
        return
      }
      if (key === 'f') {
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
  }, [tab, cols, isModalOpen, openPostModal, inModal, likeOverrides, actionsMenuOpenForIndex])

  useEffect(() => {
    const onMouseMove = () => { mouseMovedRef.current = true }
    window.addEventListener('mousemove', onMouseMove)
    return () => window.removeEventListener('mousemove', onMouseMove)
  }, [])

  const postText = (post: TimelineItem['post']) => (post.record as { text?: string })?.text?.trim() ?? ''
  const isReply = (post: TimelineItem['post']) => !!(post.record as { reply?: unknown })?.reply
  const textItems = authorFeedItems.filter(
    (item) =>
      postText(item.post).length > 0 &&
      !getPostMediaInfoForDisplay(item.post) &&
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

  async function handleNotificationToggle() {
    if (!profile || notificationLoading) return
    const next = !notificationSubscribed
    setNotificationLoading(true)
    try {
      await putActivitySubscription(profile.did, next)
      setNotificationSubscribed(next)
    } catch {
      // leave state unchanged so user can retry
    } finally {
      setNotificationLoading(false)
    }
  }

  const hideReposts = useHideReposts()
  const hideRepostsFromThisUser = !!profile && hideReposts?.isHidingRepostsFrom(profile.did)
  const showNotificationBell = !!session && !!profile && !isOwnProfile && isFollowing

  return (
    <>
      <div className={`${styles.wrap} ${inModal ? styles.wrapInModal : ''}`}>
        <header className={styles.profileHeader}>
          <div className={styles.profileHeaderMain}>
            {profile?.avatar && (
              <img src={profile.avatar} alt="" className={styles.avatar} loading="lazy" />
            )}
            <div className={styles.profileMeta}>
              {profile?.displayName && (
                <h2 className={styles.displayName}>{profile.displayName}</h2>
              )}
              <div className={styles.handleRow}>
                <p className={styles.handle}>
                  @{handle}
                </p>
                {isOwnProfile && (
                  <>
                    <button
                      type="button"
                      className={styles.followBtn}
                      onClick={openEditProfile}
                      title="Edit profile"
                    >
                      Edit profile
                    </button>
                    <button
                      type="button"
                      className={styles.blockedMutedBtn}
                      onClick={() => setShowBlockedMutedModal(true)}
                      title="View blocked accounts and muted words"
                    >
                      Blocked & muted
                    </button>
                    <div className={styles.postsFilterRow} role="group" aria-label="Filter posts">
                      <button
                        type="button"
                        className={`${styles.postsFilterBtn} ${styles.postsFilterBtnInHeader} ${profilePostsFilter === 'liked' ? styles.postsFilterBtnActive : ''}`}
                        onClick={() => {
                          setProfilePostsFilter((prev) => (prev === 'liked' ? 'all' : 'liked'))
                          setTab('posts')
                        }}
                        title={profilePostsFilter === 'liked' ? 'Show my posts' : 'Show liked posts'}
                      >
                        Liked
                      </button>
                    </div>
                  </>
                )}
                <div className={styles.followNotifyRow}>
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
                  {showNotificationBell && (
                    <button
                      type="button"
                      className={`${styles.notificationBellBtn} ${notificationSubscribed ? styles.notificationBellBtnActive : ''}`}
                      onClick={handleNotificationToggle}
                      disabled={notificationLoading}
                      title={notificationSubscribed ? 'Stop notifications for this account' : 'Get notifications when this account posts'}
                      aria-label={notificationSubscribed ? 'Stop notifications' : 'Notify when they post'}
                    >
                      {notificationSubscribed ? (
                        <svg className={styles.notificationBellIcon} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                          <path d="M12 2C10.9 2 10 2.9 10 4v.7c-2.5.4-4.4 2.6-4.4 5.2v4.4l-1.8 1.8c-.4.4-.4 1 0 1.4.2.2.5.3.7.3s.5-.1.7-.3l.2-.2h7.2l.2.2c.4.4 1 .4 1.4 0s.4-1 0-1.4l-1.8-1.8V9.9c0-2.6-1.9-4.8-4.4-5.2V4c0-1.1-.9-2-2-2zm0 18c-1.1 0-2-.9-2-2h4c0 1.1-.9 2-2 2z" />
                        </svg>
                      ) : (
                        <svg className={styles.notificationBellIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                        </svg>
                      )}
                    </button>
                  )}
                </div>
              </div>
              {profile?.description && (
                <p className={styles.description}>
                  <PostText text={profile.description} linkDisplay="domain" />
                </p>
              )}
              {profile && (
                <>
                  <div className={styles.followListRow} role="group" aria-label="Followers, following, and mutuals">
                    <button
                      type="button"
                      className={styles.followListBtn}
                      onClick={() => setFollowListModal('followers')}
                    >
                      Followers
                    </button>
                    <button
                      type="button"
                      className={styles.followListBtn}
                      onClick={() => setFollowListModal('following')}
                    >
                      Following
                    </button>
                    {isOwnProfile && (
                      <button
                        type="button"
                        className={styles.followListBtn}
                        onClick={() => setFollowListModal('mutuals')}
                      >
                        Mutuals
                      </button>
                    )}
                  </div>
                  {!isOwnProfile && followeesWhoFollowPreview && followeesWhoFollowPreview.length > 0 && (
                    <button
                      type="button"
                      className={styles.followedByFollowsPreview}
                      onClick={() => setFollowListModal('followedByFollows')}
                    >
                      <span className={styles.followedByFollowsAvatars}>
                        {followeesWhoFollowPreview.slice(0, 2).map((p) =>
                          p.avatar ? (
                            <img
                              key={p.did}
                              src={p.avatar}
                              alt=""
                              className={styles.followedByFollowsAvatar}
                              loading="lazy"
                            />
                          ) : (
                            <span
                              key={p.did}
                              className={styles.followedByFollowsAvatarPlaceholder}
                              aria-hidden
                            >
                              {(p.displayName ?? p.handle ?? p.did).slice(0, 1).toUpperCase()}
                            </span>
                          )
                        )}
                      </span>
                      <span className={styles.followedByFollowsText}>
                        {followeesWhoFollowPreview.length === 1
                          ? `Followed by @${followeesWhoFollowPreview[0].handle ?? followeesWhoFollowPreview[0].did} you follow`
                          : followeesWhoFollowPreview.length === 2
                            ? `Followed by @${followeesWhoFollowPreview[0].handle ?? followeesWhoFollowPreview[0].did}, @${followeesWhoFollowPreview[1].handle ?? followeesWhoFollowPreview[1].did} you follow`
                            : `Followed by @${followeesWhoFollowPreview[0].handle ?? followeesWhoFollowPreview[0].did}, @${followeesWhoFollowPreview[1].handle ?? followeesWhoFollowPreview[1].did} + ${followeesWhoFollowPreview.length - 2} more you follow`}
                      </span>
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
          {profile && (
            <ProfileActionsMenu
              profileDid={profile.did}
              profileHandle={handle}
              isOwnProfile={isOwnProfile}
              isFollowing={isFollowing}
              hideRepostsFromThisUser={hideRepostsFromThisUser}
              onToggleHideReposts={hideReposts ? () => hideReposts.toggleHideRepostsFrom(profile.did) : undefined}
              className={styles.profileMenu}
            />
          )}
        </header>
        {showBlockedMutedModal && (
          <BlockedAndMutedModal onClose={() => setShowBlockedMutedModal(false)} />
        )}
        {followListModal && profile && (
          <FollowListModal
            mode={followListModal}
            actor={profile.did}
            onClose={() => setFollowListModal(null)}
            viewerDid={followListModal === 'followedByFollows' ? session?.did : undefined}
            authenticatedClient={followListModal === 'followedByFollows' ? agent : undefined}
          />
        )}
        {inModal && topBarRightSlot
          ? createPortal(
              <div className={styles.modalBottomBarButtons}>
                <button
                  type="button"
                  className={`${styles.toggleBtn} ${styles.toggleBtnBottomBar} ${styles.toggleBtnIcon}`}
                  onClick={() => {
                    const i = VIEW_MODE_CYCLE.indexOf(viewMode)
                    setViewMode(VIEW_MODE_CYCLE[(i + 1) % VIEW_MODE_CYCLE.length])
                  }}
                  title={`${viewMode} column(s). Click to cycle.`}
                  aria-label={`${viewMode} columns`}
                >
                  <ColumnIcon cols={viewMode === '1' ? 1 : viewMode === '2' ? 2 : 3} />
                </button>
                <button
                  type="button"
                  className={`${styles.toggleBtn} ${styles.toggleBtnBottomBar} ${styles.toggleBtnIcon} ${nsfwPreference !== 'sfw' ? styles.toggleBtnActive : ''}`}
                  onClick={(e) => cycleNsfwPreference(e.currentTarget)}
                  title={`${nsfwPreference}. Click to cycle: SFW → Blurred → NSFW`}
                  aria-label={`NSFW filter: ${nsfwPreference}`}
                >
                  <NsfwEyeIcon mode={nsfwPreference} />
                </button>
              </div>,
              topBarRightSlot,
            )
          : null}
        {!inModal && (
          <div className={`${styles.tabsSticky} ${tabsBarVisible ? '' : styles.tabsBarHidden}`}>
            <nav className={styles.tabs} aria-label="Profile sections">
              {visibleTabs.map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`${styles.tab} ${tab === t ? styles.tabActive : ''}`}
                  onClick={() => setTab(t)}
                >
                  {t === 'posts' ? 'Posts' : t === 'reposts' ? 'Reposts' : t === 'blog' ? 'Threads' : t === 'text' ? 'Text' : 'Feeds'}
                </button>
              ))}
            </nav>
          </div>
        )}
        {inModal && (
          <div className={styles.tabsRowInModal}>
            <nav className={`${styles.tabs} ${styles.tabsInModal}`} aria-label="Profile sections">
              {visibleTabs.map((t) => (
              <button
                key={t}
                type="button"
                className={`${styles.tab} ${tab === t ? styles.tabActive : ''}`}
                onClick={() => setTab(t)}
              >
                {t === 'posts' ? 'Posts' : t === 'reposts' ? 'Reposts' : t === 'blog' ? 'Threads' : t === 'text' ? 'Text' : 'Feeds'}
              </button>
            ))}
            </nav>
          </div>
        )}
        {error && <p className={styles.error}>{error}</p>}
        <div className={styles.profileContent}>
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
              <div className={`${styles.grid} ${styles.gridView1}`} data-view-mode="1">
                {textItems.map((item) => (
                  <div key={item.post.uri}>
                    <PostCard
                      item={item}
                      onPostClick={(uri, opts) => {
                        if (opts?.initialItem) setInitialPostForUri(uri, opts.initialItem)
                        openPostModal(uri, opts?.openReply)
                      }}
                      nsfwBlurred={nsfwPreference === 'blurred' && isPostNsfw(item.post) && !unblurredUris.has(item.post.uri)}
                      onNsfwUnblur={() => setUnblurred(item.post.uri, true)}
                      constrainMediaHeight
                      likedUriOverride={likeOverrides[item.post.uri]}
                      onLikedChange={(uri, likeRecordUri) => setLikeOverrides((prev) => ({ ...prev, [uri]: likeRecordUri ?? null }))}
                    />
                  </div>
                ))}
              </div>
              {cursor && <div ref={loadMoreSentinelRef} className={styles.loadMoreSentinel} aria-hidden />}
              {loadingMore && <div className={styles.loadingMore}>Loading…</div>}
            </>
          )
        ) : tab === 'feeds' ? (
          feeds.length === 0 ? (
            <div className={styles.empty}>No feeds.</div>
          ) : (
            <ul className={styles.feedsList}>
              {feeds.map((f) => {
                const feedSlug = f.uri.split('/').pop() ?? ''
                const feedUrl = feedSlug
                  ? `https://bsky.app/profile/${encodeURIComponent(handle)}/feed/${encodeURIComponent(feedSlug)}`
                  : f.uri
                return (
                  <li key={f.uri}>
                    <a
                      href={feedUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.feedLink}
                    >
                      <span className={styles.feedName}>{f.displayName}</span>
                      {f.description && <span className={styles.feedDesc}>{f.description}</span>}
                    </a>
                  </li>
                )
              })}
            </ul>
          )
        ) : mediaItems.length === 0 ? (
          <div className={styles.empty}>
            {tab === 'posts'
              ? profilePostsFilter === 'liked'
                ? 'No liked posts with images or videos.'
                : 'No posts with images or videos.'
              : 'No reposts with images or videos.'}
          </div>
        ) : (
          <>
            {cols >= 2 ? (
              <div className={`${styles.gridColumns} ${styles[`gridView${viewMode}`]}`} data-view-mode={viewMode}>
                {distributeByHeight(mediaItems, cols).map((column, colIndex) => (
                  <div key={colIndex} className={styles.gridColumn}>
                    {column.map(({ item, originalIndex }) => (
                      <div
                        key={item.post.uri}
                        className={styles.gridItem}
                        onMouseEnter={() => {
                          if (mouseMovedRef.current) {
                            mouseMovedRef.current = false
                            setKeyboardFocusIndex(originalIndex)
                          }
                        }}
                      >
                        <PostCard
                          item={item}
                          isSelected={(tab === 'posts' || tab === 'reposts') && originalIndex === keyboardFocusIndex}
                          cardRef={(el) => { cardRefsRef.current[originalIndex] = el }}
                          openAddDropdown={(tab === 'posts' || tab === 'reposts') && originalIndex === keyboardFocusIndex && keyboardAddOpen}
                          onAddClose={() => setKeyboardAddOpen(false)}
                          onPostClick={(uri, opts) => {
                        if (opts?.initialItem) setInitialPostForUri(uri, opts.initialItem)
                        openPostModal(uri, opts?.openReply)
                      }}
                          nsfwBlurred={nsfwPreference === 'blurred' && isPostNsfw(item.post) && !unblurredUris.has(item.post.uri)}
                          onNsfwUnblur={() => setUnblurred(item.post.uri, true)}
                          constrainMediaHeight={false}
                          likedUriOverride={likeOverrides[item.post.uri]}
                          onLikedChange={(uri, likeRecordUri) => setLikeOverrides((prev) => ({ ...prev, [uri]: likeRecordUri ?? null }))}
                          onActionsMenuOpenChange={(open) => setActionsMenuOpenForIndex(open ? originalIndex : null)}
                          cardIndex={originalIndex}
                          actionsMenuOpenForIndex={actionsMenuOpenForIndex}
                        />
                      </div>
                    ))}
                    {cursor && (
                      <div
                        ref={(el) => { loadMoreSentinelRefs.current[colIndex] = el }}
                        className={styles.loadMoreSentinel}
                        aria-hidden
                      />
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className={`${styles.grid} ${styles[`gridView${viewMode}`]}`} data-view-mode={viewMode}>
                {mediaItems.map((item, index) => (
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
                      isSelected={(tab === 'posts' || tab === 'reposts') && index === keyboardFocusIndex}
                      cardRef={(el) => { cardRefsRef.current[index] = el }}
                      openAddDropdown={(tab === 'posts' || tab === 'reposts') && index === keyboardFocusIndex && keyboardAddOpen}
                      onAddClose={() => setKeyboardAddOpen(false)}
                      onPostClick={(uri, opts) => {
                        if (opts?.initialItem) setInitialPostForUri(uri, opts.initialItem)
                        openPostModal(uri, opts?.openReply)
                      }}
                      nsfwBlurred={nsfwPreference === 'blurred' && isPostNsfw(item.post) && !unblurredUris.has(item.post.uri)}
                      onNsfwUnblur={() => setUnblurred(item.post.uri, true)}
                      constrainMediaHeight={cols === 1}
                      likedUriOverride={likeOverrides[item.post.uri]}
                      onLikedChange={(uri, likeRecordUri) => setLikeOverrides((prev) => ({ ...prev, [uri]: likeRecordUri ?? null }))}
                      onActionsMenuOpenChange={(open) => setActionsMenuOpenForIndex(open ? index : null)}
                      cardIndex={index}
                      actionsMenuOpenForIndex={actionsMenuOpenForIndex}
                    />
                  </div>
                ))}
              </div>
            )}
            {cursor && cols === 1 && <div ref={loadMoreSentinelRef} className={styles.loadMoreSentinel} aria-hidden />}
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
