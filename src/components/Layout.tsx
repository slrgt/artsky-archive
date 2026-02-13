import React, { useState, useRef, useEffect, useMemo, useCallback, useSyncExternalStore } from 'react'
import { flushSync } from 'react-dom'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useSession } from '../context/SessionContext'
import { useTheme } from '../context/ThemeContext'
import { useViewMode, VIEW_LABELS } from '../context/ViewModeContext'
import { useArtOnly, CARD_VIEW_LABELS } from '../context/ArtOnlyContext'
import { useProfileModal } from '../context/ProfileModalContext'
import { useLoginModal } from '../context/LoginModalContext'
import { useEditProfile } from '../context/EditProfileContext'
import { useModeration, NSFW_LABELS } from '../context/ModerationContext'
import { useMediaOnly } from '../context/MediaOnlyContext'
import { useScrollLock } from '../context/ScrollLockContext'
import { useSeenPosts } from '../context/SeenPostsContext'
import { useToast } from '../context/ToastContext'
import { publicAgent, createPost, postReply, getNotifications, getUnreadNotificationCount, updateSeenNotifications, getSavedFeedsFromPreferences, getFeedDisplayName, resolveFeedUri, addSavedFeed, removeSavedFeedByUri, getFeedShareUrl } from '../lib/bsky'
import type { FeedSource } from '../types'
import { GUEST_FEED_SOURCES, GUEST_MIX_ENTRIES } from '../config/feedSources'
import { useFeedMix } from '../context/FeedMixContext'
import { FeedSwipeProvider } from '../context/FeedSwipeContext'
import SearchBar from './SearchBar'
import FeedSelector from './FeedSelector'
import ComposerSuggestions from './ComposerSuggestions'
import PostText from './PostText'
import CharacterCountWithCircle from './CharacterCountWithCircle'
import { CardDefaultIcon, CardMinimalistIcon, CardArtOnlyIcon, EyeOpenIcon, EyeHalfIcon, EyeClosedIcon } from './Icons'
import styles from './Layout.module.css'

const PRESET_FEED_SOURCES: FeedSource[] = [
  { kind: 'timeline', label: 'Following' },
  { kind: 'custom', label: "What's Hot", uri: 'at://did:plc:z72i7hdynmk6r22z27h6tvur/app.bsky.feed.generator/whats-hot' },
]

const HIDDEN_PRESET_FEEDS_KEY = 'artsky-hidden-preset-feeds'
const FEED_ORDER_KEY = 'artsky-feed-order'

function feedSourceId(s: FeedSource): string {
  return s.uri ?? (s.kind === 'timeline' ? 'timeline' : s.label ?? '')
}

function loadHiddenPresetUris(): Set<string> {
  try {
    const raw = localStorage.getItem(HIDDEN_PRESET_FEEDS_KEY)
    if (!raw) return new Set()
    const arr = JSON.parse(raw) as string[]
    return Array.isArray(arr) ? new Set(arr) : new Set()
  } catch {
    return new Set()
  }
}

function loadFeedOrder(): string[] {
  try {
    const raw = localStorage.getItem(FEED_ORDER_KEY)
    if (!raw) return []
    const arr = JSON.parse(raw) as string[]
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

interface Props {
  title: string
  children: React.ReactNode
  showNav?: boolean
}

/** Handlers for pull-to-refresh on the feed page; when set, Layout attaches them to the feed wrapper so the top strip is included. */
export interface FeedPullRefreshHandlers {
  onTouchStart: (e: React.TouchEvent) => void
  onTouchMove: (e: React.TouchEvent) => void
  onTouchEnd: (e: React.TouchEvent) => void
}

export const FeedPullRefreshContext = React.createContext<{
  wrapperRef: React.RefObject<HTMLDivElement | null> | null
  setHandlers: ((handlers: FeedPullRefreshHandlers | null) => void) | null
}>({ wrapperRef: null, setHandlers: null })

/** Home icon (purplesky-style: roof house) */
function HomeIcon({ active }: { active?: boolean }) {
  const sw = active ? 2.5 : 2
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  )
}

/** Eye-off icon for seen-posts button (tap = hide seen, hold = show seen) */
function SeenPostsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  )
}

function ArtboardsIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
    </svg>
  )
}

function SearchIcon({ active }: { active?: boolean }) {
  const sw = active ? 2.5 : 2
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  )
}

/** Forums: chat bubble (purplesky-style) */
function ForumIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
    </svg>
  )
}

function FeedsIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="18" x2="20" y2="18" />
    </svg>
  )
}

function AccountIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  )
}

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  )
}

/** Eye icon for NSFW preference: closed = SFW, half = Blurred, open = NSFW. Inline SVG matching public/icons/eye-*.svg */
function NsfwEyeIcon({ mode }: { mode: 'open' | 'half' | 'closed' }) {
  if (mode === 'open') return <EyeOpenIcon size={24} />
  if (mode === 'half') return <EyeHalfIcon size={24} />
  return <EyeClosedIcon size={24} />
}

/** Preview card mode icons: full card (show all), compact (minimalist), image only (art only). Inline SVG matching public/icons/card-*.svg */
function CardModeIcon({ mode }: { mode: 'default' | 'minimalist' | 'artOnly' }) {
  if (mode === 'default') return <CardDefaultIcon size={20} />
  if (mode === 'minimalist') return <CardMinimalistIcon size={20} />
  return <CardArtOnlyIcon size={20} />
}

function Column1Icon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="7" y="3" width="10" height="18" rx="1" />
    </svg>
  )
}
function Column2Icon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="3" width="8" height="18" rx="1" />
      <rect x="13" y="3" width="8" height="18" rx="1" />
    </svg>
  )
}
function Column3Icon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="2" y="3" width="5" height="18" rx="1" />
      <rect x="9.5" y="3" width="5" height="18" rx="1" />
      <rect x="17" y="3" width="5" height="18" rx="1" />
    </svg>
  )
}
function PlusIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}
function ChevronDownIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}
function LogInIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
      <polyline points="10 17 15 12 10 7" />
      <line x1="15" y1="12" x2="3" y2="12" />
    </svg>
  )
}

function ThemeSunIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  )
}

function ThemeMoonIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  )
}

/** Half sun, half moon – standard for "follow system" theme. */
function ThemeAutoIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3v18" />
      <path d="M6 12a6 6 0 0 1 6-6 6 6 0 0 1 6 6" />
      <circle cx="16.5" cy="12" r="2" />
    </svg>
  )
}

function GearIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}

function AboutIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4M12 8h.01" />
    </svg>
  )
}

/** Media mode: image-only vs image+text. Compact icon to match other gear button widths. */
function MediaModeIcon({ mediaOnly }: { mediaOnly: boolean }) {
  if (mediaOnly) {
    return (
      <span className={styles.mediaModeIconWrap}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <rect x="5" y="5" width="14" height="14" rx="2" />
          <circle cx="9" cy="9" r="1.5" />
          <path d="M19 17l-5-5-7 7" />
        </svg>
      </span>
    )
  }
  return (
    <span className={styles.mediaModeIconWrap}>
      <svg viewBox="0 0 18 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="1" y="4" width="8" height="8" rx="1" />
        <line x1="11" y1="6" x2="16" y2="6" />
        <line x1="11" y1="10" x2="16" y2="10" />
        <line x1="11" y1="14" x2="14" y2="14" />
      </svg>
    </span>
  )
}

const DESKTOP_BREAKPOINT = 768
function getDesktopSnapshot() {
  return typeof window !== 'undefined' ? window.innerWidth >= DESKTOP_BREAKPOINT : false
}
function subscribeDesktop(cb: () => void) {
  if (typeof window === 'undefined') return () => {}
  const mq = window.matchMedia(`(min-width: ${DESKTOP_BREAKPOINT}px)`)
  mq.addEventListener('change', cb)
  return () => mq.removeEventListener('change', cb)
}

export default function Layout({ title, children, showNav }: Props) {
  const loc = useLocation()
  const navigate = useNavigate()
  const { openProfileModal, openPostModal, isModalOpen, modalScrollHidden, openForumModal, openArtboardsModal, closeAllModals } = useProfileModal()
  const search = loc.search
  const isForumModalOpen = /\bforum=1\b/.test(search)
  const isArtboardsModalOpen = /\bartboards=1\b/.test(search) || /\bartboard=/.test(search)
  const { openLoginModal } = useLoginModal()
  const editProfile = useEditProfile()
  const { session, sessionsList, logout, switchAccount } = useSession()
  const [accountProfiles, setAccountProfiles] = useState<Record<string, { avatar?: string; handle?: string }>>({})
  const [accountProfilesVersion, setAccountProfilesVersion] = useState(0)
  const sessionsDidKey = useMemo(() => sessionsList.map((s) => s.did).sort().join(','), [sessionsList])
  const currentAccountAvatar = session ? accountProfiles[session.did]?.avatar : null

  useEffect(() => {
    editProfile?.registerOnSaved(() => setAccountProfilesVersion((v) => v + 1))
  }, [editProfile?.registerOnSaved])

  useEffect(() => {
    if (sessionsList.length === 0) {
      setAccountProfiles({})
      return
    }
    let cancelled = false
    sessionsList.forEach((s) => {
      publicAgent.getProfile({ actor: s.did }).then((res) => {
        if (cancelled) return
        const data = res.data as { avatar?: string; handle?: string }
        setAccountProfiles((prev) => ({ ...prev, [s.did]: { avatar: data.avatar, handle: data.handle } }))
      }).catch(() => {})
    })
    return () => { cancelled = true }
  }, [sessionsDidKey, sessionsList, accountProfilesVersion])
  const { theme, setTheme } = useTheme()
  const { viewMode, setViewMode, cycleViewMode } = useViewMode()
  const { cardViewMode, cycleCardView } = useArtOnly()
  const { nsfwPreference, cycleNsfwPreference } = useModeration()
  const { mediaOnly, toggleMediaOnly } = useMediaOnly()
  const path = loc.pathname
  const isDesktop = useSyncExternalStore(subscribeDesktop, getDesktopSnapshot, () => false)
  const scrollLock = useScrollLock()
  const [, setAccountSheetOpen] = useState(false)
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const feedPullRefreshWrapperRef = useRef<HTMLDivElement>(null)
  const [feedPullRefreshHandlers, setFeedPullRefreshHandlers] = useState<FeedPullRefreshHandlers | null>(null)
  const [notificationFilter, setNotificationFilter] = useState<'all' | 'reply' | 'follow'>('all')
  const [feedsDropdownOpen, setFeedsDropdownOpen] = useState(false)
  const [feedsClosingAngle, setFeedsClosingAngle] = useState<number | null>(null)
  const [feedsChevronNoTransition, setFeedsChevronNoTransition] = useState(false)
  const prevFeedsOpenRef = useRef(false)
  const [savedFeedSources, setSavedFeedSources] = useState<FeedSource[]>([])
  const [hiddenPresetUris, setHiddenPresetUris] = useState<Set<string>>(loadHiddenPresetUris)
  const [feedOrder, setFeedOrder] = useState<string[]>(loadFeedOrder)
  const [feedAddError, setFeedAddError] = useState<string | null>(null)
  const feedsDropdownRef = useRef<HTMLDivElement>(null)
  const feedsBtnRef = useRef<HTMLButtonElement>(null)
  const feedsChevronRef = useRef<HTMLSpanElement>(null)
  const [notifications, setNotifications] = useState<{ uri: string; author: { handle?: string; did: string; avatar?: string; displayName?: string }; reason: string; reasonSubject?: string; isRead: boolean; indexedAt: string; replyPreview?: string }[]>([])
  const [notificationsLoading, setNotificationsLoading] = useState(false)
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0)
  const unreadCountInitialFetchDoneRef = useRef(false)
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false)
  const [composeOpen, setComposeOpen] = useState(false)
  const [composeOverlayBottom, setComposeOverlayBottom] = useState(0)
  type ComposeSegment = { text: string; images: File[]; imageAlts: string[] }
  const [composeSegments, setComposeSegments] = useState<ComposeSegment[]>([{ text: '', images: [], imageAlts: [] }])
  const [composeSegmentIndex, setComposeSegmentIndex] = useState(0)
  const [composePosting, setComposePosting] = useState(false)
  const [composeError, setComposeError] = useState<string | null>(null)
  const composeFileInputRef = useRef<HTMLInputElement>(null)
  const composeFormRef = useRef<HTMLFormElement>(null)
  const currentSegment = composeSegments[composeSegmentIndex] ?? { text: '', images: [], imageAlts: [] }
  const navVisible = true
  const [mobileNavScrollHidden, setMobileNavScrollHidden] = useState(false)
  const [feedFloatButtonsExpanded, setFeedFloatButtonsExpanded] = useState(false)
  const gearFloatWrapRef = useRef<HTMLDivElement>(null)
  const headerGearWrapRef = useRef<HTMLDivElement>(null)
  const lastScrollYRef = useRef(0)
  const scrollEndTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [aboutOpen, setAboutOpen] = useState(false)
  const [searchOverlayBottom, setSearchOverlayBottom] = useState(0)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const accountBtnRef = useRef<HTMLButtonElement>(null)
  const accountMenuRef = useRef<HTMLDivElement>(null)
  const notificationsMenuRef = useRef<HTMLDivElement>(null)
  const notificationsBtnRef = useRef<HTMLButtonElement>(null)
  const lastSeenAtSyncedRef = useRef<string>('')
  const maxSeenInViewRef = useRef<string>('')
  const markSeenDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const markSeenObserverCleanupRef = useRef<(() => void) | null>(null)
  const homeLongPressTriggeredRef = useRef(false)
  const homeHoldTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const seenLongPressTriggeredRef = useRef(false)
  const seenHoldTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const accountLongPressTriggeredRef = useRef(false)
  const accountHoldTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const seenPosts = useSeenPosts()
  const toast = useToast()
  const HOME_HOLD_MS = 500
  const { entries: mixEntries, setEntryPercent, toggleSource, addEntry, setSingleFeed } = useFeedMix()
  const presetUris = new Set((PRESET_FEED_SOURCES.map((s) => s.uri).filter(Boolean) as string[]))
  const visiblePresets = PRESET_FEED_SOURCES.filter((s) => !s.uri || !hiddenPresetUris.has(s.uri))
  const savedDeduped = savedFeedSources.filter((s) => !s.uri || !presetUris.has(s.uri))
  const allFeedSources = useMemo(() => {
    const combined: FeedSource[] = [...visiblePresets, ...savedDeduped]
    if (feedOrder.length === 0) return combined
    const orderMap = new Map(feedOrder.map((id, i) => [id, i]))
    return [...combined].sort((a, b) => {
      const ia = orderMap.get(feedSourceId(a)) ?? 9999
      const ib = orderMap.get(feedSourceId(b)) ?? 9999
      return ia - ib
    })
  }, [visiblePresets, savedDeduped, feedOrder])
  const fallbackFeedSource = visiblePresets[0] ?? PRESET_FEED_SOURCES[0]
  const handleFeedsToggleSource = useCallback(
    (clicked: FeedSource) => {
      if (mixEntries.length === 0) {
        addEntry(fallbackFeedSource)
        addEntry(clicked)
      } else {
        toggleSource(clicked)
      }
    },
    [mixEntries.length, addEntry, toggleSource]
  )

  const handleReorderFeeds = useCallback((ordered: FeedSource[]) => {
    const ids = ordered.map(feedSourceId).filter(Boolean)
    setFeedOrder(ids)
    try {
      localStorage.setItem(FEED_ORDER_KEY, JSON.stringify(ids))
    } catch {
      // ignore
    }
  }, [])

  const removableSourceUris = useMemo(
    () => new Set([...savedDeduped.map((s) => s.uri).filter(Boolean) as string[], ...presetUris]),
    [savedDeduped]
  )

  const startHomeHold = useCallback(() => {
    homeHoldTimerRef.current = setTimeout(() => {
      homeLongPressTriggeredRef.current = true
      seenPosts?.clearSeenAndShowAll()
      homeHoldTimerRef.current = null
    }, HOME_HOLD_MS)
  }, [seenPosts])

  const endHomeHold = useCallback(() => {
    if (homeHoldTimerRef.current) {
      clearTimeout(homeHoldTimerRef.current)
      homeHoldTimerRef.current = null
    }
  }, [])

  const seenHoldAnchorRef = useRef<HTMLElement | null>(null)
  const startSeenHold = useCallback((e: React.PointerEvent) => {
    seenHoldAnchorRef.current = e.currentTarget as HTMLElement
    seenHoldTimerRef.current = setTimeout(() => {
      seenLongPressTriggeredRef.current = true
      seenPosts?.announceShowSeen(seenHoldAnchorRef.current ?? undefined)
      seenPosts?.clearSeenAndShowAll()
      seenHoldTimerRef.current = null
    }, HOME_HOLD_MS)
  }, [seenPosts])

  const endSeenHold = useCallback(() => {
    if (seenHoldTimerRef.current) {
      clearTimeout(seenHoldTimerRef.current)
      seenHoldTimerRef.current = null
    }
  }, [])

  const seenBtnClick = useCallback((e?: React.MouseEvent<HTMLButtonElement>) => {
    if (seenLongPressTriggeredRef.current) {
      seenLongPressTriggeredRef.current = false
      return
    }
    seenPosts?.onHideSeenOnly(e?.currentTarget ?? undefined)
    if (path !== '/feed') navigate('/feed')
  }, [seenPosts, path, navigate])

  const startAccountHold = useCallback(() => {
    accountHoldTimerRef.current = setTimeout(() => {
      accountLongPressTriggeredRef.current = true
      setAccountMenuOpen(true)
      accountHoldTimerRef.current = null
    }, HOME_HOLD_MS)
  }, [])

  const endAccountHold = useCallback(() => {
    if (accountHoldTimerRef.current) {
      clearTimeout(accountHoldTimerRef.current)
      accountHoldTimerRef.current = null
    }
  }, [])

  const accountBtnClick = useCallback(() => {
    if (accountLongPressTriggeredRef.current) {
      accountLongPressTriggeredRef.current = false
      return
    }
    if (session) {
      const handle = accountProfiles[session.did]?.handle ?? (session as { handle?: string }).handle ?? session.did
      setAccountMenuOpen(false)
      openProfileModal(handle)
    } else {
      setAccountMenuOpen((o) => !o)
    }
  }, [session, accountProfiles, openProfileModal])

  const homeBtnClick = useCallback(() => {
    if (homeLongPressTriggeredRef.current) {
      homeLongPressTriggeredRef.current = false
      return
    }
    if (isModalOpen) {
      closeAllModals()
      if (path !== '/feed') navigate('/feed')
    } else {
      if (path === '/feed') {
        seenPosts?.onHomeClick()
      } else {
        navigate('/feed')
      }
    }
  }, [path, seenPosts, navigate, isModalOpen, closeAllModals])

  useEffect(() => {
    document.title = title ? `${title} · ArtSky` : 'ArtSky'
  }, [title])

  /* Global keyboard: Q = back; 1/2/3 = column view. Do not handle when a popup is open so the popup gets shortcuts and scroll. */
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isModalOpen) return
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable) {
        if (e.key === 'Escape') {
          e.preventDefault()
          target.blur()
        }
        return
      }
      if (e.ctrlKey || e.metaKey) return
      const key = e.key.toLowerCase()
      if (key === '1' || key === '2' || key === '3') {
        e.preventDefault()
        setViewMode(key as '1' | '2' | '3')
        return
      }
      if (key === 't') {
        e.preventDefault()
        toggleMediaOnly()
        return
      }
      if (key !== 'q' && e.key !== 'Backspace') return
      /* On feed, Q is reserved for closing the ... actions menu; don't treat it as back */
      if (key === 'q' && (loc.pathname === '/' || loc.pathname.startsWith('/feed'))) return
      e.preventDefault()
      navigate(-1)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [navigate, isModalOpen, setViewMode, toggleMediaOnly, loc.pathname])

  useEffect(() => {
    if (!accountMenuOpen) return
    const onDocClick = (e: MouseEvent) => {
      const t = e.target as Node
      if (accountMenuRef.current?.contains(t) || accountBtnRef.current?.contains(t)) return
      setAccountMenuOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [accountMenuOpen])

  useEffect(() => {
    if (!feedFloatButtonsExpanded) return
    const onDocClick = (e: MouseEvent) => {
      const t = e.target as Node
      if (gearFloatWrapRef.current?.contains(t) || headerGearWrapRef.current?.contains(t)) return
      setFeedFloatButtonsExpanded(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [feedFloatButtonsExpanded])

  useEffect(() => {
    if (!aboutOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        setAboutOpen(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [aboutOpen])

  useEffect(() => {
    if (!notificationsOpen) return
    const onDocClick = (e: MouseEvent) => {
      const t = e.target as Node
      if (notificationsMenuRef.current?.contains(t) || notificationsBtnRef.current?.contains(t)) return
      setNotificationsOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [notificationsOpen])

  const loadSavedFeeds = useCallback(async (appendIfMissing?: FeedSource) => {
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
      const serverUris = new Set(withLabels.map((s) => s.uri).filter(Boolean))
      setSavedFeedSources((prev) => {
        const merged: FeedSource[] = [...withLabels]
        for (const s of prev) {
          if (s.uri && !serverUris.has(s.uri) && !merged.some((m) => m.uri === s.uri)) merged.push(s)
        }
        if (appendIfMissing?.uri && !merged.some((m) => m.uri === appendIfMissing.uri)) {
          merged.push(appendIfMissing)
        }
        return merged
      })
    } catch {
      setSavedFeedSources([])
    }
  }, [session])

  /** When user selects a feed from the header search bar: add to saved list, enable it, then go to feed so the pill appears. */
  const handleSelectFeedFromSearch = useCallback(
    async (source: FeedSource) => {
      if (!source.uri) {
        navigate('/feed', { state: { feedSource: source } })
        return
      }
      if (!session) {
        navigate('/feed', { state: { feedSource: source } })
        return
      }
      setFeedAddError(null)
      try {
        const uri = await resolveFeedUri(source.uri)
        await addSavedFeed(uri)
        const label = source.label ?? (await getFeedDisplayName(uri))
        const normalized: FeedSource = { kind: 'custom', label, uri }
        setSavedFeedSources((prev) => (prev.some((s) => s.uri === uri) ? prev : [...prev, normalized]))
        handleFeedsToggleSource(normalized)
        await loadSavedFeeds(normalized)
        navigate('/feed', { state: { feedSource: normalized } })
      } catch (err) {
        setFeedAddError(err instanceof Error ? err.message : 'Could not add feed. Try again.')
        navigate('/feed', { state: { feedSource: source } })
      }
    },
    [session, navigate, handleFeedsToggleSource, loadSavedFeeds]
  )

  const handleRemoveFeed = useCallback(
    async (source: FeedSource) => {
      if (!source.uri) return
      try {
        await removeSavedFeedByUri(source.uri)
        setSavedFeedSources((prev) => prev.filter((s) => s.uri !== source.uri))
        if (mixEntries.some((e) => e.source.uri === source.uri)) toggleSource(source)
        if (presetUris.has(source.uri)) {
          setHiddenPresetUris((prev) => {
            const next = new Set(prev)
            next.add(source.uri!)
            try {
              localStorage.setItem(HIDDEN_PRESET_FEEDS_KEY, JSON.stringify([...next]))
            } catch {
              // ignore
            }
            return next
          })
        }
        await loadSavedFeeds()
      } catch {
        // ignore
      }
    },
    [mixEntries, toggleSource, loadSavedFeeds]
  )

  const handleShareFeed = useCallback(async (source: FeedSource) => {
    if (!source.uri) return
    try {
      const url = await getFeedShareUrl(source.uri)
      await navigator.clipboard.writeText(url)
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    if (session) loadSavedFeeds()
  }, [session, loadSavedFeeds])

  useEffect(() => {
    if (feedsDropdownOpen && session) loadSavedFeeds()
  }, [feedsDropdownOpen, session, loadSavedFeeds])

  useEffect(() => {
    if (feedsDropdownOpen) setFeedAddError(null)
  }, [feedsDropdownOpen])

  useEffect(() => {
    if (prevFeedsOpenRef.current && !feedsDropdownOpen) setFeedsClosingAngle(360)
    prevFeedsOpenRef.current = feedsDropdownOpen
  }, [feedsDropdownOpen])

  /* Clear no-transition class only after we've painted 0deg, so 360→0 doesn't animate */
  useEffect(() => {
    if (!feedsChevronNoTransition || feedsClosingAngle !== null) return
    const id = requestAnimationFrame(() => {
      setFeedsChevronNoTransition(false)
    })
    return () => cancelAnimationFrame(id)
  }, [feedsChevronNoTransition, feedsClosingAngle])

  useEffect(() => {
    if (!feedsDropdownOpen) return
    const onDocClick = (e: MouseEvent) => {
      const t = e.target as Node
      if (feedsDropdownRef.current?.contains(t) || feedsBtnRef.current?.contains(t)) return
      setFeedsDropdownOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [feedsDropdownOpen])

  useEffect(() => {
    if (!notificationsOpen || !session) return
    setNotificationsLoading(true)
    getNotifications(30)
      .then(({ notifications: list }) => {
        setNotifications(list)
        setUnreadNotificationCount(0)
        // Advance server seenAt so the unread count clears; then refetch count so we don't show the dot if server was stale.
        updateSeenNotifications()
          .then(() => getUnreadNotificationCount().then(setUnreadNotificationCount))
          .catch(() => {})
      })
      .catch(() => setNotifications([]))
      .finally(() => setNotificationsLoading(false))
  }, [notificationsOpen, session])

  /* Mark notifications as seen when they scroll into view */
  useEffect(() => {
    if (!notificationsOpen || !session || notifications.length === 0) return
    maxSeenInViewRef.current = lastSeenAtSyncedRef.current
    markSeenObserverCleanupRef.current = null
    const timeoutId = setTimeout(() => {
      const lists = document.querySelectorAll<HTMLUListElement>('[data-notifications-list]')
      if (lists.length === 0) return
      const markSeenIfNeeded = () => {
        const maxSeenIndexedAt = maxSeenInViewRef.current
        if (maxSeenIndexedAt === '' || maxSeenIndexedAt === lastSeenAtSyncedRef.current) return
        lastSeenAtSyncedRef.current = maxSeenIndexedAt
        updateSeenNotifications(maxSeenIndexedAt)
          .then(() => {
            setNotifications((prev) =>
              prev.map((n) => (n.indexedAt <= maxSeenIndexedAt ? { ...n, isRead: true } : n))
            )
            const newlyRead = notifications.filter((n) => n.indexedAt <= maxSeenIndexedAt && !n.isRead).length
            setUnreadNotificationCount((prev) => Math.max(0, prev - newlyRead))
          })
          .catch(() => {})
      }
      const scheduleMarkSeen = () => {
        if (markSeenDebounceRef.current) clearTimeout(markSeenDebounceRef.current)
        markSeenDebounceRef.current = setTimeout(markSeenIfNeeded, 400)
      }
      const observer = new IntersectionObserver(
        (entries) => {
          for (const e of entries) {
            if (!e.isIntersecting) continue
            const at = e.target.getAttribute('data-indexed-at')
            if (at && (maxSeenInViewRef.current === '' || at > maxSeenInViewRef.current)) {
              maxSeenInViewRef.current = at
            }
          }
          scheduleMarkSeen()
        },
        { root: null, rootMargin: '0px', threshold: 0.25 }
      )
      const observed: Element[] = []
      lists.forEach((ul) => {
        ul.querySelectorAll('[data-indexed-at]').forEach((el) => {
          observer.observe(el)
          observed.push(el)
        })
      })
      markSeenObserverCleanupRef.current = () => {
        if (markSeenDebounceRef.current) clearTimeout(markSeenDebounceRef.current)
        observed.forEach((el) => observer.unobserve(el))
      }
    }, 0)
    return () => {
      clearTimeout(timeoutId)
      markSeenObserverCleanupRef.current?.()
      markSeenObserverCleanupRef.current = null
    }
  }, [notificationsOpen, session, notifications])

  /* Fetch unread count when session exists. On initial load/refresh don't show the dot (server count can be stale). */
  useEffect(() => {
    if (!session) {
      unreadCountInitialFetchDoneRef.current = false
      return
    }
    getUnreadNotificationCount()
      .then((count) => {
        if (!unreadCountInitialFetchDoneRef.current) {
          unreadCountInitialFetchDoneRef.current = true
          setUnreadNotificationCount(0)
        } else {
          setUnreadNotificationCount(count)
        }
      })
      .catch(() => setUnreadNotificationCount(0))
  }, [session])

  /* Sync unread count when tab/window becomes visible (e.g. user read notifications in Bluesky app or another tab) */
  useEffect(() => {
    if (!session || typeof document === 'undefined') return
    function onVisibilityChange() {
      if (document.visibilityState === 'visible') {
        getUnreadNotificationCount()
          .then(setUnreadNotificationCount)
          .catch(() => {})
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [session])

  /* Do not refetch unread count on panel close – server can be stale and would bring the dot back. Count is updated when panel opens (after updateSeen) and on visibility change. */
  const prevNotificationsOpenRef = useRef(false)
  prevNotificationsOpenRef.current = notificationsOpen

  /* When any full-screen popup is open, lock body scroll so only the popup scrolls */
  const anyPopupOpen = isModalOpen || (mobileSearchOpen && !isDesktop) || composeOpen || aboutOpen
  useEffect(() => {
    if (!scrollLock || !anyPopupOpen) return
    scrollLock.lockScroll()
    return () => scrollLock.unlockScroll()
  }, [anyPopupOpen, scrollLock])

  function focusSearch() {
    if (isDesktop) {
      window.scrollTo({ top: 0, behavior: 'smooth' })
      setTimeout(() => searchInputRef.current?.focus(), 300)
    } else {
      setMobileSearchOpen(true)
      setSearchOverlayBottom(0)
      requestAnimationFrame(() => {
        setTimeout(() => {
          searchInputRef.current?.focus({ preventScroll: false })
        }, 200)
      })
    }
  }

  useEffect(() => {
    if (!mobileSearchOpen || typeof window === 'undefined') return
    const vv = window.visualViewport
    if (!vv) return
    const viewport = vv
    function update() {
      setSearchOverlayBottom(window.innerHeight - (viewport.offsetTop + viewport.height))
    }
    update()
    viewport.addEventListener('resize', update)
    viewport.addEventListener('scroll', update)
    return () => {
      viewport.removeEventListener('resize', update)
      viewport.removeEventListener('scroll', update)
    }
  }, [mobileSearchOpen])

  /* On mobile: focus search input when overlay opens so the keyboard pops up immediately */
  useEffect(() => {
    if (!mobileSearchOpen || isDesktop) return
    const id = setTimeout(() => {
      searchInputRef.current?.focus({ preventScroll: false })
    }, 100)
    return () => clearTimeout(id)
  }, [mobileSearchOpen, isDesktop])

  useEffect(() => {
    if (!composeOpen || isDesktop || typeof window === 'undefined') return
    const vv = window.visualViewport
    if (!vv) return
    const viewport = vv
    function update() {
      setComposeOverlayBottom(window.innerHeight - (viewport.offsetTop + viewport.height))
    }
    update()
    viewport.addEventListener('resize', update)
    viewport.addEventListener('scroll', update)
    return () => {
      viewport.removeEventListener('resize', update)
      viewport.removeEventListener('scroll', update)
    }
  }, [composeOpen, isDesktop])

  /* Mobile: hide bottom nav when scrolling down; show when scrolling up or when scroll stops */
  useEffect(() => {
    if (typeof window === 'undefined' || isDesktop || !showNav) return
    lastScrollYRef.current = window.scrollY
    const SCROLL_THRESHOLD = 8
    const SCROLL_END_MS = 350
    function onScroll() {
      const y = window.scrollY
      const delta = y - lastScrollYRef.current
      if (delta > SCROLL_THRESHOLD) setMobileNavScrollHidden(true)
      else if (delta < -SCROLL_THRESHOLD) setMobileNavScrollHidden(false)
      lastScrollYRef.current = y
      if (scrollEndTimerRef.current) clearTimeout(scrollEndTimerRef.current)
      scrollEndTimerRef.current = setTimeout(() => {
        scrollEndTimerRef.current = null
        setMobileNavScrollHidden(false)
      }, SCROLL_END_MS)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (scrollEndTimerRef.current) clearTimeout(scrollEndTimerRef.current)
    }
  }, [isDesktop, showNav])

  function closeMobileSearch() {
    setMobileSearchOpen(false)
    searchInputRef.current?.blur()
  }

  async function handleSelectAccount(did: string) {
    const ok = await switchAccount(did)
    if (ok) {
      setAccountSheetOpen(false)
      setAccountMenuOpen(false)
    }
  }

  function handleAddAccount() {
    setAccountSheetOpen(false)
    setAccountMenuOpen(false)
    openLoginModal()
  }

  function handleLogout() {
    setAccountSheetOpen(false)
    setAccountMenuOpen(false)
    logout()
  }

  const POST_MAX_LENGTH = 300

  function openCompose() {
    setComposeOpen(true)
    setComposeSegments([{ text: '', images: [], imageAlts: [] }])
    setComposeSegmentIndex(0)
    setComposeError(null)
    setComposeOverlayBottom(0)
  }

  function closeCompose() {
    setComposeOpen(false)
    setComposeError(null)
  }

  const COMPOSE_IMAGE_MAX = 4
  const COMPOSE_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']

  function setCurrentSegmentText(value: string) {
    setComposeSegments((prev) => {
      const n = [...prev]
      const seg = n[composeSegmentIndex]
      if (seg) n[composeSegmentIndex] = { ...seg, text: value }
      return n
    })
  }

  function addComposeImages(files: FileList | File[]) {
    const list = Array.from(files).filter((f) => COMPOSE_IMAGE_TYPES.includes(f.type))
    const seg = currentSegment
    const take = Math.min(list.length, COMPOSE_IMAGE_MAX - seg.images.length)
    if (take <= 0) return
    const added = list.slice(0, take)
    setComposeSegments((prev) => {
      const n = [...prev]
      const s = n[composeSegmentIndex]
      if (s) n[composeSegmentIndex] = { ...s, images: [...s.images, ...added], imageAlts: [...s.imageAlts, ...added.map(() => '')] }
      return n
    })
  }

  function removeComposeImage(index: number) {
    setComposeSegments((prev) => {
      const n = [...prev]
      const s = n[composeSegmentIndex]
      if (s) n[composeSegmentIndex] = { ...s, images: s.images.filter((_, i) => i !== index), imageAlts: s.imageAlts.filter((_, i) => i !== index) }
      return n
    })
  }

  function addComposeThreadSegment() {
    setComposeSegments((prev) => [...prev, { text: '', images: [], imageAlts: [] }])
    setComposeSegmentIndex((prev) => prev + 1)
  }

  async function handleComposeSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!session || composePosting) return
    const toPost = composeSegments.filter((s) => s.text.trim() || s.images.length > 0)
    if (toPost.length === 0) return
    setComposeError(null)
    setComposePosting(true)
    try {
      let rootUri: string | null = null
      let rootCid: string | null = null
      let parentUri: string | null = null
      let parentCid: string | null = null
      for (let i = 0; i < toPost.length; i++) {
        const s = toPost[i]
        if (i === 0) {
          const r = await createPost(s.text, s.images.length > 0 ? s.images : undefined, s.imageAlts.length > 0 ? s.imageAlts : undefined)
          rootUri = r.uri
          rootCid = r.cid
          parentUri = r.uri
          parentCid = r.cid
        } else {
          if (!s.text.trim()) continue
          const r = await postReply(rootUri!, rootCid!, parentUri!, parentCid!, s.text)
          parentUri = r.uri
          parentCid = r.cid
        }
      }
      setComposeSegments([{ text: '', images: [], imageAlts: [] }])
      setComposeSegmentIndex(0)
      closeCompose()
      navigate('/feed')
    } catch (err) {
      setComposeError(err instanceof Error ? err.message : 'Failed to post')
    } finally {
      setComposePosting(false)
    }
  }

  function handleComposeKeyDown(e: React.KeyboardEvent, form: HTMLFormElement | null) {
    if ((e.key === 'Enter' || e.key === 'E') && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      if (form && (currentSegment.text.trim() || currentSegment.images.length > 0) && !composePosting) {
        form.requestSubmit()
      }
    }
  }

  function handleComposeDrop(e: React.DragEvent) {
    e.preventDefault()
    if (!e.dataTransfer?.files?.length) return
    addComposeImages(e.dataTransfer.files)
  }

  function handleComposeDragOver(e: React.DragEvent) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }

  const composePreviewUrls = useMemo(
    () => currentSegment.images.map((f) => URL.createObjectURL(f)),
    [currentSegment.images],
  )
  useEffect(() => {
    return () => composePreviewUrls.forEach((u) => URL.revokeObjectURL(u))
  }, [composePreviewUrls])

  /* Mobile nav: Feed, Forum, New, Search, Accounts (right). Desktop: Feed, Artboards, New, Search, Forum, Accounts */
  const searchActive = mobileSearchOpen && !isDesktop
  const homeActive = path === '/feed' && !isModalOpen && !searchActive
  const navTrayItems = (
    <>
      <button
        type="button"
        className={homeActive ? styles.navActive : ''}
        aria-current={homeActive ? 'page' : undefined}
        onPointerDown={startHomeHold}
        onPointerUp={endHomeHold}
        onPointerLeave={endHomeHold}
        onPointerCancel={endHomeHold}
        onClick={homeBtnClick}
        title="Home (hold to show all seen posts)"
      >
        <span className={styles.navIcon}><HomeIcon active={homeActive} /></span>
        <span className={styles.navLabel}>Home</span>
      </button>
      {isDesktop && (
        <button
          type="button"
          className={isArtboardsModalOpen && !searchActive ? styles.navActive : ''}
          onClick={openArtboardsModal}
          aria-pressed={isArtboardsModalOpen}
        >
          <span className={styles.navIcon}><ArtboardsIcon /></span>
          <span className={styles.navLabel}>Collections</span>
        </button>
      )}
      <button
        type="button"
        className={styles.navBtn}
        onClick={openCompose}
        aria-label="New post"
      >
        <span className={styles.navIcon}><PlusIcon /></span>
        <span className={styles.navLabel}>New</span>
      </button>
      <button type="button" className={searchActive ? styles.navActive : styles.navBtn} onClick={focusSearch} aria-label="Search" aria-pressed={searchActive}>
        <span className={styles.navIcon}><SearchIcon active={searchActive} /></span>
        <span className={styles.navLabel}>Search</span>
      </button>
      <button
        type="button"
        className={isForumModalOpen && !searchActive ? styles.navActive : ''}
        onClick={openForumModal}
        aria-pressed={isForumModalOpen}
      >
        <span className={styles.navIcon}><ForumIcon /></span>
        <span className={styles.navLabel}>Forums</span>
      </button>
    </>
  )

  const navItems = (
    <>
      {isDesktop ? (
        /* Desktop: Feed, Artboards, New, Search, Forum */
        navTrayItems
      ) : (
        /* Mobile: Home, Forums, New, Search, Profile (right). Seen-posts button floats above Home; Collections in account menu. */
        <>
          <div className={styles.navHomeWrap}>
            <button
              type="button"
              className={homeActive ? styles.navActive : ''}
              aria-current={homeActive ? 'page' : undefined}
              onPointerDown={startHomeHold}
              onPointerUp={endHomeHold}
              onPointerLeave={endHomeHold}
              onPointerCancel={endHomeHold}
              onClick={homeBtnClick}
              title="Home (hold to show all seen posts)"
            >
              <span className={styles.navIcon}><HomeIcon active={homeActive} /></span>
            </button>
          </div>
          <button
            type="button"
            className={isForumModalOpen && !searchActive ? styles.navActive : ''}
            onClick={openForumModal}
            aria-pressed={isForumModalOpen}
            aria-label="Forums"
          >
            <span className={styles.navIcon}><ForumIcon /></span>
          </button>
          <button type="button" className={styles.navBtn} onClick={openCompose} aria-label="New post">
            <span className={styles.navIcon}><PlusIcon /></span>
          </button>
          <button type="button" className={searchActive ? styles.navActive : styles.navBtn} onClick={focusSearch} aria-label="Search" aria-pressed={searchActive}>
            <span className={styles.navIcon}><SearchIcon active={searchActive} /></span>
          </button>
          <div className={styles.navProfileWrap}>
            <button
              ref={accountBtnRef}
              type="button"
              className={styles.navProfileBtn}
              onPointerDown={startAccountHold}
              onPointerUp={endAccountHold}
              onPointerLeave={endAccountHold}
              onPointerCancel={endAccountHold}
              onClick={accountBtnClick}
              aria-label={session ? 'Profile (hold for accounts)' : 'Account'}
              aria-expanded={accountMenuOpen}
              title={session ? 'Profile (hold for accounts and settings)' : 'Account'}
            >
              <span className={styles.navIcon}>
                {session && currentAccountAvatar ? (
                  <img src={currentAccountAvatar} alt="" className={styles.navProfileAvatar} loading="lazy" />
                ) : (
                  <AccountIcon />
                )}
              </span>
            </button>
          </div>
        </>
      )}
    </>
  )

  const notificationsPanelContent = (
    <>
      <h2 className={styles.menuTitle}>Notifications</h2>
      <div className={styles.notificationFilters}>
        <button type="button" className={notificationFilter === 'all' ? styles.notificationFilterActive : styles.notificationFilter} onClick={() => setNotificationFilter('all')}>All</button>
        <button type="button" className={notificationFilter === 'reply' ? styles.notificationFilterActive : styles.notificationFilter} onClick={() => setNotificationFilter('reply')}>Replies</button>
        <button type="button" className={notificationFilter === 'follow' ? styles.notificationFilterActive : styles.notificationFilter} onClick={() => setNotificationFilter('follow')}>Follows</button>
      </div>
      {notificationsLoading ? (
        <p className={styles.notificationsLoading}>Loading…</p>
      ) : (() => {
        const filtered = notificationFilter === 'all' ? notifications : notifications.filter((n) => n.reason === notificationFilter)
        return filtered.length === 0 ? (
          <p className={styles.notificationsEmpty}>
            {notificationFilter === 'all' ? 'No notifications yet.' : 'No matching notifications.'}
          </p>
        ) : (
          <ul className={styles.notificationsList} data-notifications-list>
            {filtered.map((n) => {
              const handle = n.author.handle ?? n.author.did
              const isFollow = n.reason === 'follow'
              const isReplyOrLike = n.reason === 'reply' || n.reason === 'like'
              const href = isFollow ? `/profile/${encodeURIComponent(handle)}` : `/post/${encodeURIComponent(n.reasonSubject ?? n.uri)}`
              const reasonLabel =
                n.reason === 'like' ? 'liked your post' :
                n.reason === 'repost' ? 'reposted your post' :
                n.reason === 'follow' ? 'followed you' :
                n.reason === 'mention' ? 'mentioned you' :
                n.reason === 'reply' ? 'replied to you' :
                n.reason === 'quote' ? 'quoted your post' :
                n.reason
              const useModalOnClick = !isDesktop && (isFollow || isReplyOrLike || n.reason === 'repost' || n.reason === 'mention' || n.reason === 'quote')
              return (
                <li key={n.uri} data-indexed-at={n.indexedAt}>
                  <Link
                    to={href}
                    className={styles.notificationItem}
                    onClick={(e) => {
                      setNotificationsOpen(false)
                      if (useModalOnClick) {
                        e.preventDefault()
                        if (isFollow) {
                          openProfileModal(handle)
                        } else if (isReplyOrLike) {
                          openPostModal(n.uri, undefined, n.uri)
                        } else {
                          openPostModal(n.reasonSubject ?? n.uri)
                        }
                      } else if (isFollow) {
                        e.preventDefault()
                        openProfileModal(handle)
                      }
                    }}
                  >
                    {n.author.avatar ? (
                      <img src={n.author.avatar} alt="" className={styles.notificationAvatar} loading="lazy" />
                    ) : (
                      <span className={styles.notificationAvatarPlaceholder} aria-hidden>{handle.slice(0, 1).toUpperCase()}</span>
                    )}
                    <span className={styles.notificationTextWrap}>
                      <span className={styles.notificationText}>
                        <strong>@{handle}</strong> {reasonLabel}
                      </span>
                      {n.replyPreview && (
                        <span className={styles.notificationReplyPreview}>{n.replyPreview}</span>
                      )}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        )
      })()}
    </>
  )

  const accountPanelContent = (
    <>
      {session && (
        <>
          <section className={styles.menuSection}>
            <div className={styles.menuProfileAndAccounts}>
              <button
                type="button"
                className={`${styles.menuProfileBtn} ${styles.menuProfileBtnAccentHover}`}
                onClick={() => {
                  setAccountMenuOpen(false)
                  setAccountSheetOpen(false)
                  openArtboardsModal()
                }}
                title="Collections"
              >
                <span className={styles.menuProfileIconWrap} aria-hidden>
                  <ArtboardsIcon />
                </span>
                <span>Collections</span>
              </button>
              <div className={styles.menuAccountsBlock}>
                {sessionsList.map((s) => {
            const profile = accountProfiles[s.did]
            const handle = profile?.handle ?? (s as { handle?: string }).handle ?? s.did
            const isCurrent = s.did === session?.did
            return (
              <button
                key={s.did}
                type="button"
                className={isCurrent ? styles.menuItemActive : styles.menuItem}
                onClick={() => {
                  if (isCurrent) {
                    setAccountMenuOpen(false)
                    setAccountSheetOpen(false)
                    openProfileModal(handle)
                  } else {
                    handleSelectAccount(s.did)
                  }
                }}
                title={isCurrent ? 'View my profile' : `Switch to @${handle}`}
              >
                {profile?.avatar ? (
                  <img src={profile.avatar} alt="" className={styles.accountMenuAvatar} loading="lazy" />
                ) : (
                  <span className={styles.accountMenuAvatarPlaceholder} aria-hidden>{(handle || s.did).slice(0, 1).toUpperCase()}</span>
                )}
                {isCurrent ? (
                  <span className={styles.menuAccountLabel}>
                    <span className={styles.menuAccountLabelDefault}>@{handle}</span>
                    <span className={styles.menuAccountLabelHover}>Open profile</span>
                  </span>
                ) : (
                  <span>@{handle}</span>
                )}
                {isCurrent && <span className={styles.sheetCheck} aria-hidden> ✓</span>}
              </button>
            )
          })}
              </div>
            </div>
            <div className={styles.menuActions}>
              <button type="button" className={styles.menuActionBtn} onClick={handleAddAccount}>
                Add account
              </button>
              <button type="button" className={styles.menuActionSecondary} onClick={handleLogout}>
                Log out
              </button>
            </div>
          </section>
        </>
      )}
      {!session && (
        <section className={styles.menuSection}>
          <div className={styles.menuProfileAndAccounts}>
            {isDesktop ? (
              <button
                type="button"
                className={`${styles.menuProfileBtn} ${styles.menuProfileBtnAccentHover}`}
                onClick={() => {
                  setAccountMenuOpen(false)
                  setAccountSheetOpen(false)
                  openLoginModal('create')
                }}
              >
                <span className={styles.menuProfileIconWrap} aria-hidden>
                  <AccountIcon />
                </span>
                <span>Create account</span>
              </button>
            ) : (
              <a
                href="https://bsky.app"
                target="_blank"
                rel="noopener noreferrer"
                className={`${styles.menuProfileBtn} ${styles.menuProfileBtnAccentHover}`}
                onClick={() => {
                  setAccountMenuOpen(false)
                  setAccountSheetOpen(false)
                }}
              >
                <span className={styles.menuProfileIconWrap} aria-hidden>
                  <AccountIcon />
                </span>
                <span>Create account</span>
              </a>
            )}
            <div className={styles.menuAccountsBlock}>
              <button
                type="button"
                className={styles.menuAuthLink}
                onClick={() => {
                  setAccountMenuOpen(false)
                  setAccountSheetOpen(false)
                  openLoginModal()
                }}
              >
                <LogInIcon />
                <span>Log in with Bluesky</span>
              </button>
            </div>
          </div>
        </section>
      )}
    </>
  )

  const feedPullRefreshContextValue = useMemo(
    () => ({
      wrapperRef: showNav && path === '/feed' ? feedPullRefreshWrapperRef : null,
      setHandlers: showNav && path === '/feed' ? setFeedPullRefreshHandlers : null,
    }),
    [showNav, path]
  )

  return (
    <div className={`${styles.wrap} ${showNav && isDesktop ? styles.wrapWithHeader : ''} ${showNav && !isDesktop ? styles.wrapMobileTop : ''}`}>
      <FeedPullRefreshContext.Provider value={feedPullRefreshContextValue}>
      <FeedSwipeProvider feedSources={session ? allFeedSources : GUEST_FEED_SOURCES} setSingleFeed={setSingleFeed}>
      <a href="#main-content" className={styles.skipLink}>
        Skip to main content
      </a>
      {showNav && isDesktop && (
      <header className={`${styles.header} ${!session ? styles.headerLoggedOut : ''}`} role="banner">
        {(
          <>
            <div className={styles.headerLeft}>
              {isDesktop && (
                <div ref={headerGearWrapRef} className={styles.headerGearWrap}>
                  <button
                    type="button"
                    className={`${styles.headerGearBtn} float-btn ${feedFloatButtonsExpanded ? styles.feedFloatGearActive : ''}`}
                    onClick={() => setFeedFloatButtonsExpanded((e) => !e)}
                    title={feedFloatButtonsExpanded ? 'Hide view options' : 'Show view options'}
                    aria-label={feedFloatButtonsExpanded ? 'Hide view options' : 'Show view options'}
                    aria-expanded={feedFloatButtonsExpanded}
                  >
                    <GearIcon />
                  </button>
                  <div
                    className={`${styles.headerGearExpandable} ${styles.gearFloatExpandable} ${feedFloatButtonsExpanded ? styles.feedFloatButtonsExpandableOpen : ''}`}
                    aria-hidden={!feedFloatButtonsExpanded}
                  >
                    <button
                      type="button"
                      className={`${styles.nsfwFloatBtn} ${styles.gearExpandableBtn} float-btn`}
                      onClick={(e) => cycleNsfwPreference(e.currentTarget, { showToast: false })}
                      title={`${nsfwPreference}. Click to cycle: SFW → Blurred → NSFW`}
                      aria-label={`Content: ${nsfwPreference}. Click to cycle.`}
                    >
                      <NsfwEyeIcon mode={nsfwPreference === 'sfw' ? 'closed' : nsfwPreference === 'blurred' ? 'half' : 'open'} />
                      <span className={styles.gearExpandableLabel}>{NSFW_LABELS[nsfwPreference]}</span>
                    </button>
                    <button
                      type="button"
                      className={`${styles.feedFloatBtn} ${styles.gearExpandableBtn} float-btn`}
                      onClick={() => setTheme(theme === 'light' ? 'system' : theme === 'system' ? 'dark' : 'light')}
                      title={`Theme: ${theme}. Click to cycle.`}
                      aria-label={`Theme: ${theme}. Click to cycle.`}
                    >
                      <span className={styles.feedFloatThemeIcon}>
                        {theme === 'light' ? <ThemeSunIcon /> : theme === 'dark' ? <ThemeMoonIcon /> : <ThemeAutoIcon />}
                      </span>
                      <span className={styles.gearExpandableLabel}>{theme === 'light' ? 'Light' : theme === 'dark' ? 'Dark' : 'Auto'}</span>
                    </button>
                    <button
                      type="button"
                      className={`${styles.feedFloatBtn} ${styles.gearExpandableBtn} float-btn`}
                      onClick={(e) => cycleCardView(e.currentTarget, { showToast: false })}
                      title={CARD_VIEW_LABELS[cardViewMode]}
                      aria-label={CARD_VIEW_LABELS[cardViewMode]}
                    >
                      <CardModeIcon mode={cardViewMode === 'default' ? 'default' : cardViewMode === 'minimalist' ? 'minimalist' : 'artOnly'} />
                      <span className={styles.gearExpandableLabel}>{CARD_VIEW_LABELS[cardViewMode]}</span>
                    </button>
                    <button
                      type="button"
                      className={`${styles.feedFloatBtn} ${styles.gearExpandableBtn} float-btn`}
                      onClick={() => toggleMediaOnly({ showToast: false })}
                      title={mediaOnly ? 'Media only. Click for Media & Text.' : 'Media and text. Click for Media only.'}
                      aria-label={mediaOnly ? 'Media only' : 'Media and text'}
                    >
                      <MediaModeIcon mediaOnly={mediaOnly} />
                      <span className={styles.gearExpandableLabel}>{mediaOnly ? 'Media only' : 'Media & text'}</span>
                    </button>
                    <button
                      type="button"
                      className={`${styles.feedFloatBtn} ${styles.gearExpandableBtn} float-btn`}
                      onClick={(e) => cycleViewMode(e.currentTarget, { showToast: false })}
                      title={`${VIEW_LABELS[viewMode]}. Click to cycle.`}
                      aria-label={`Columns: ${VIEW_LABELS[viewMode]}. Click to cycle.`}
                    >
                      {viewMode === '1' && <Column1Icon />}
                      {viewMode === '2' && <Column2Icon />}
                      {viewMode === '3' && <Column3Icon />}
                      <span className={styles.gearExpandableLabel}>{VIEW_LABELS[viewMode]}</span>
                    </button>
                    <button
                      type="button"
                      className={`${styles.feedFloatBtn} ${styles.gearExpandableBtn} float-btn`}
                      onClick={() => setAboutOpen(true)}
                      title="About ArtSky and keyboard shortcuts"
                      aria-label="About ArtSky"
                    >
                      <AboutIcon />
                      <span className={styles.gearExpandableLabel}>About</span>
                    </button>
                  </div>
                </div>
              )}
              <button
                type="button"
                className={styles.logoLink}
                aria-label="ArtSky – back to feed"
                title={path === '/feed' ? 'Home (hold to show all seen posts)' : 'Back to feed'}
                onPointerDown={startHomeHold}
                onPointerUp={endHomeHold}
                onPointerLeave={endHomeHold}
                onPointerCancel={endHomeHold}
                onClick={homeBtnClick}
              >
                <img src={`${import.meta.env.BASE_URL || '/'}icon.svg`} alt="" className={styles.logoIcon} />
                <span className={styles.logoText}>ArtSky</span>
                {import.meta.env.VITE_APP_ENV === 'dev' && (
                  <span className={styles.logoDev}> dev</span>
                )}
              </button>
            </div>
            <div className={styles.headerCenter}>
              {isDesktop ? (
                <div className={styles.headerSearchRow}>
                  <div className={styles.headerSearchSide}>
                    <div className={styles.headerFeedsWrap} ref={feedsDropdownRef}>
                      <button
                        ref={feedsBtnRef}
                        type="button"
                        className={feedsDropdownOpen ? styles.headerFeedsLinkActive : styles.headerFeedsLink}
                        aria-label="Feeds"
                        aria-expanded={feedsDropdownOpen}
                        onClick={() => setFeedsDropdownOpen((o) => !o)}
                      >
                        Feeds
                      </button>
                      {feedsDropdownOpen && (
                        <div className={styles.feedsDropdown} role="dialog" aria-label="Remix feeds">
                          {feedAddError && (
                            <p className={styles.feedAddError} role="alert">
                              {feedAddError}
                            </p>
                          )}
                          <FeedSelector
                            variant="dropdown"
                            sources={session ? allFeedSources : GUEST_FEED_SOURCES}
                            fallbackSource={session ? fallbackFeedSource : GUEST_FEED_SOURCES[0]}
                            mixEntries={session ? mixEntries : GUEST_MIX_ENTRIES}
                            onToggle={handleFeedsToggleSource}
                            setEntryPercent={setEntryPercent}
                            onAddCustom={async (input) => {
                              if (!session) return
                              setFeedAddError(null)
                              try {
                                const isFeedSource = typeof input === 'object' && input !== null && 'uri' in input
                                const uri = isFeedSource ? await resolveFeedUri((input as FeedSource).uri!) : await resolveFeedUri(input as string)
                                await addSavedFeed(uri)
                                const label = isFeedSource ? (input as FeedSource).label ?? await getFeedDisplayName(uri) : await getFeedDisplayName(uri)
                                const source: FeedSource = { kind: 'custom', label, uri }
                                setSavedFeedSources((prev) => (prev.some((s) => s.uri === uri) ? prev : [...prev, source]))
                                handleFeedsToggleSource(source)
                                await loadSavedFeeds(source)
                              } catch (err) {
                                setFeedAddError(err instanceof Error ? err.message : 'Could not add feed. Try again.')
                              }
                            }}
                            onToggleWhenGuest={session ? undefined : openLoginModal}
                            removableSourceUris={session ? removableSourceUris : undefined}
                            onRemoveFeed={session ? handleRemoveFeed : undefined}
                            onShareFeed={session ? handleShareFeed : undefined}
                            onReorderSources={session ? handleReorderFeeds : undefined}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                  <div className={styles.headerSearchBarWrap}>
                    <SearchBar inputRef={searchInputRef} compact={isDesktop} onSelectFeed={handleSelectFeedFromSearch} />
                  </div>
                  <div className={styles.headerSearchSide}>
                    <button
                      type="button"
                      className={session ? styles.headerForumLink : styles.headerForumLinkLoggedOut}
                      aria-label="Forums"
                      onClick={openForumModal}
                    >
                      Forums
                    </button>
                  </div>
                </div>
              ) : (
                <div className={styles.headerCenterMobile}>
                  <div className={styles.headerFeedsWrap} ref={feedsDropdownRef}>
                    <button
                      ref={feedsBtnRef}
                      type="button"
                      className={feedsDropdownOpen ? styles.headerFeedsBtnActive : styles.headerFeedsBtn}
                      aria-label="Feeds"
                      aria-expanded={feedsDropdownOpen}
                      onClick={() => setFeedsDropdownOpen((o) => !o)}
                    >
                      <FeedsIcon />
                      <span className={styles.headerFeedsBtnLabel}>Feeds</span>
                    </button>
                    {feedsDropdownOpen && (
                      <div className={styles.feedsDropdown} role="dialog" aria-label="Remix feeds">
                        {feedAddError && (
                          <p className={styles.feedAddError} role="alert">
                            {feedAddError}
                          </p>
                        )}
                        <FeedSelector
                          variant="dropdown"
                          sources={session ? allFeedSources : GUEST_FEED_SOURCES}
                          fallbackSource={session ? fallbackFeedSource : GUEST_FEED_SOURCES[0]}
                          mixEntries={session ? mixEntries : GUEST_MIX_ENTRIES}
                          onToggle={handleFeedsToggleSource}
                          setEntryPercent={setEntryPercent}
                          onAddCustom={async (input) => {
                            if (!session) return
                            setFeedAddError(null)
                            try {
                              const isFeedSource = typeof input === 'object' && input !== null && 'uri' in input
                              const uri = isFeedSource ? await resolveFeedUri((input as FeedSource).uri!) : await resolveFeedUri(input as string)
                              await addSavedFeed(uri)
                              const label = isFeedSource ? (input as FeedSource).label ?? await getFeedDisplayName(uri) : await getFeedDisplayName(uri)
                              const source: FeedSource = { kind: 'custom', label, uri }
                              setSavedFeedSources((prev) => (prev.some((s) => s.uri === uri) ? prev : [...prev, source]))
                              handleFeedsToggleSource(source)
                              await loadSavedFeeds(source)
                            } catch (err) {
                              setFeedAddError(err instanceof Error ? err.message : 'Could not add feed. Try again.')
                            }
                          }}
                          onToggleWhenGuest={session ? undefined : openLoginModal}
                          removableSourceUris={session ? removableSourceUris : undefined}
                          onRemoveFeed={session ? handleRemoveFeed : undefined}
                          onShareFeed={session ? handleShareFeed : undefined}
                          onReorderSources={session ? handleReorderFeeds : undefined}
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
            <div className={styles.headerRight}>
              {session && isDesktop && (
                <button
                  type="button"
                  className={styles.headerBtnWithLabel}
                  onClick={openCompose}
                  aria-label="New post"
                  title="New post"
                >
                  <PlusIcon />
                  <span className={styles.headerBtnLabel}>New</span>
                </button>
              )}
              {session && (
                <div className={styles.headerBtnWrap}>
                  <button
                    ref={notificationsBtnRef}
                    type="button"
                    className={styles.headerBtn}
                    onClick={() => setNotificationsOpen((o) => !o)}
                    aria-label="Notifications"
                    aria-expanded={notificationsOpen}
                    title="Notifications"
                  >
                    <BellIcon />
                  </button>
                  {unreadNotificationCount > 0 && (
                    <span className={styles.notificationUnreadDot} aria-hidden />
                  )}
                  {notificationsOpen && (
                    <div ref={notificationsMenuRef} className={styles.notificationsMenu} role="dialog" aria-label="Notifications">
                      {notificationsPanelContent}
                    </div>
                  )}
                </div>
              )}
              {isDesktop && (
                <>
                  {!session && (
                    <button
                      type="button"
                      className={styles.headerAuthLink}
                      onClick={() => openLoginModal()}
                    >
                      Log in
                    </button>
                  )}
                  <div className={styles.headerBtnWrap}>
                    <button
                      ref={accountBtnRef}
                      type="button"
                      className={styles.headerBtn}
                      onPointerDown={startAccountHold}
                      onPointerUp={endAccountHold}
                      onPointerLeave={endAccountHold}
                      onPointerCancel={endAccountHold}
                      onClick={accountBtnClick}
                      aria-label="Profile (hold for accounts)"
                      aria-expanded={accountMenuOpen}
                      title="Profile (hold for accounts and settings)"
                    >
                      <span className={styles.navIcon}>
                        {currentAccountAvatar ? (
                          <img src={currentAccountAvatar} alt="" className={styles.headerAccountAvatar} loading="lazy" />
                        ) : (
                          <AccountIcon />
                        )}
                      </span>
                    </button>
                    {accountMenuOpen && (
                      <div ref={accountMenuRef} className={styles.accountMenu} role="menu" aria-label="Accounts and settings">
                        {accountPanelContent}
                      </div>
                    )}
                  </div>
                </>
              )}
              {/* Mobile: Log in (when logged out) + account button – same positions as desktop */}
              {!isDesktop && (
                <>
                  {!session && (
                    <button
                      type="button"
                      className={styles.headerAuthLink}
                      onClick={() => openLoginModal()}
                    >
                      Log in
                    </button>
                  )}
                  <div className={styles.headerAccountMenuWrap}>
                    <button
                      ref={accountBtnRef}
                      type="button"
                      className={styles.headerAccountNavBtn}
                      onPointerDown={startAccountHold}
                      onPointerUp={endAccountHold}
                      onPointerLeave={endAccountHold}
                      onPointerCancel={endAccountHold}
                      onClick={accountBtnClick}
                      aria-label="Profile (hold for accounts)"
                      aria-expanded={accountMenuOpen}
                      title="Profile (hold for accounts and settings)"
                    >
                      <span className={styles.navIcon}>
                        {currentAccountAvatar ? (
                          <img src={currentAccountAvatar} alt="" className={styles.headerAccountAvatar} loading="lazy" />
                        ) : (
                          <AccountIcon />
                        )}
                      </span>
                    </button>
                    {accountMenuOpen && (
                      <div ref={accountMenuRef} className={styles.accountMenu} role="menu" aria-label="Accounts and settings">
                        {accountPanelContent}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </header>
      )}
      {showNav && !isDesktop && (
        <div className={`${styles.feedsFloatWrap} feeds-float-wrap`} ref={feedsDropdownRef}>
          <button
            ref={feedsBtnRef}
            type="button"
            className={`${styles.feedsFloatBtn} float-btn ${feedsDropdownOpen ? styles.feedsFloatBtnActive : ''}`}
            onClick={() => setFeedsDropdownOpen((o) => !o)}
            aria-label="Feeds"
            aria-expanded={feedsDropdownOpen}
          >
            <span className={styles.feedsFloatLabel}>Feeds</span>
            <span
              ref={feedsChevronRef}
              className={`${styles.feedsFloatChevronWrap} ${feedsChevronNoTransition ? styles.feedsFloatChevronWrapNoTransition : ''}`}
              style={{
                transform: `rotate(${feedsDropdownOpen ? 180 : (feedsClosingAngle ?? 0)}deg)`,
              }}
              onTransitionEnd={() => {
                if (feedsClosingAngle === 360) {
                  flushSync(() => setFeedsChevronNoTransition(true))
                  setFeedsClosingAngle(null)
                }
              }}
            >
              <ChevronDownIcon />
            </span>
          </button>
          {feedsDropdownOpen && (
            <div className={styles.feedsDropdown} role="dialog" aria-label="Remix feeds">
              {feedAddError && (
                <p className={styles.feedAddError} role="alert">
                  {feedAddError}
                </p>
              )}
              <FeedSelector
                variant="dropdown"
                touchFriendly
                sources={session ? allFeedSources : GUEST_FEED_SOURCES}
                fallbackSource={session ? fallbackFeedSource : GUEST_FEED_SOURCES[0]}
                mixEntries={session ? mixEntries : GUEST_MIX_ENTRIES}
                onToggle={handleFeedsToggleSource}
                setEntryPercent={setEntryPercent}
                onAddCustom={async (input) => {
                  if (!session) return
                  setFeedAddError(null)
                  try {
                    const isFeedSource = typeof input === 'object' && input !== null && 'uri' in input
                    const uri = isFeedSource ? await resolveFeedUri((input as FeedSource).uri!) : await resolveFeedUri(input as string)
                    await addSavedFeed(uri)
                    const label = isFeedSource ? (input as FeedSource).label ?? await getFeedDisplayName(uri) : await getFeedDisplayName(uri)
                    const source: FeedSource = { kind: 'custom', label, uri }
                    setSavedFeedSources((prev) => (prev.some((s) => s.uri === uri) ? prev : [...prev, source]))
                    handleFeedsToggleSource(source)
                    await loadSavedFeeds(source)
                  } catch (err) {
                    setFeedAddError(err instanceof Error ? err.message : 'Could not add feed. Try again.')
                  }
                }}
                onToggleWhenGuest={session ? undefined : openLoginModal}
                removableSourceUris={session ? removableSourceUris : undefined}
                onRemoveFeed={session ? handleRemoveFeed : undefined}
                onShareFeed={session ? handleShareFeed : undefined}
                onReorderSources={session ? handleReorderFeeds : undefined}
              />
            </div>
          )}
        </div>
      )}
      {showNav && !isDesktop && path === '/feed' && (
        <div ref={gearFloatWrapRef} className={`${styles.gearFloatWrap} ${isModalOpen ? styles.gearFloatWrapModalOpen : ''} ${isModalOpen && modalScrollHidden ? styles.gearFloatWrapScrollHidden : ''}`}>
          <button
            type="button"
            className={`${styles.feedFloatBtn} float-btn ${feedFloatButtonsExpanded ? styles.feedFloatGearActive : ''}`}
            onClick={() => setFeedFloatButtonsExpanded((e) => !e)}
            title={feedFloatButtonsExpanded ? 'Hide view options' : 'Show view options'}
            aria-label={feedFloatButtonsExpanded ? 'Hide view options' : 'Show view options'}
            aria-expanded={feedFloatButtonsExpanded}
          >
            <GearIcon />
          </button>
          <div
            className={`${styles.feedFloatButtonsExpandable} ${styles.gearFloatExpandable} ${feedFloatButtonsExpanded ? styles.feedFloatButtonsExpandableOpen : ''}`}
            aria-hidden={!feedFloatButtonsExpanded}
          >
            <button
              type="button"
              className={`${styles.nsfwFloatBtn} ${styles.gearExpandableBtn} float-btn`}
              onClick={(e) => cycleNsfwPreference(e.currentTarget, { showToast: false })}
              title={`${nsfwPreference}. Click to cycle: SFW → Blurred → NSFW`}
              aria-label={`Content: ${nsfwPreference}. Click to cycle.`}
            >
              <NsfwEyeIcon mode={nsfwPreference === 'sfw' ? 'closed' : nsfwPreference === 'blurred' ? 'half' : 'open'} />
              <span className={styles.gearExpandableLabel}>{NSFW_LABELS[nsfwPreference]}</span>
            </button>
            <button
              type="button"
              className={`${styles.feedFloatBtn} ${styles.gearExpandableBtn} float-btn`}
              onClick={() => setTheme(theme === 'light' ? 'system' : theme === 'system' ? 'dark' : 'light')}
              title={`Theme: ${theme}. Click to cycle.`}
              aria-label={`Theme: ${theme}. Click to cycle.`}
            >
              <span className={styles.feedFloatThemeIcon}>
                {theme === 'light' ? <ThemeSunIcon /> : theme === 'dark' ? <ThemeMoonIcon /> : <ThemeAutoIcon />}
              </span>
              <span className={styles.gearExpandableLabel}>{theme === 'light' ? 'Light' : theme === 'dark' ? 'Dark' : 'Auto'}</span>
            </button>
            <button
              type="button"
              className={`${styles.feedFloatBtn} ${styles.gearExpandableBtn} float-btn`}
              onClick={(e) => cycleCardView(e.currentTarget, { showToast: false })}
              title={CARD_VIEW_LABELS[cardViewMode]}
              aria-label={CARD_VIEW_LABELS[cardViewMode]}
            >
              <CardModeIcon mode={cardViewMode === 'default' ? 'default' : cardViewMode === 'minimalist' ? 'minimalist' : 'artOnly'} />
              <span className={styles.gearExpandableLabel}>{CARD_VIEW_LABELS[cardViewMode]}</span>
            </button>
            <button
              type="button"
              className={`${styles.feedFloatBtn} ${styles.gearExpandableBtn} float-btn`}
              onClick={() => toggleMediaOnly({ showToast: false })}
              title={mediaOnly ? 'Media only. Click for Media & Text.' : 'Media and text. Click for Media only.'}
              aria-label={mediaOnly ? 'Media only' : 'Media and text'}
            >
              <MediaModeIcon mediaOnly={mediaOnly} />
              <span className={styles.gearExpandableLabel}>{mediaOnly ? 'Media only' : 'Media & text'}</span>
            </button>
            <button
              type="button"
              className={`${styles.feedFloatBtn} ${styles.gearExpandableBtn} float-btn`}
              onClick={(e) => cycleViewMode(e.currentTarget, { showToast: false })}
              title={`${VIEW_LABELS[viewMode]}. Click to cycle.`}
              aria-label={`Columns: ${VIEW_LABELS[viewMode]}. Click to cycle.`}
            >
              {viewMode === '1' && <Column1Icon />}
              {viewMode === '2' && <Column2Icon />}
              {viewMode === '3' && <Column3Icon />}
              <span className={styles.gearExpandableLabel}>{VIEW_LABELS[viewMode]}</span>
            </button>
            <button
              type="button"
              className={`${styles.feedFloatBtn} ${styles.gearExpandableBtn} float-btn`}
              onClick={() => setAboutOpen(true)}
              title="About ArtSky and keyboard shortcuts"
              aria-label="About ArtSky"
            >
              <AboutIcon />
              <span className={styles.gearExpandableLabel}>About</span>
            </button>
          </div>
        </div>
      )}
      {showNav && !isDesktop && !session && (
        <div className={`${styles.loginFloatWrap} login-float-wrap`}>
          <button
            type="button"
            className={`${styles.loginFloatBtn} float-btn`}
            onClick={() => openLoginModal()}
            aria-label="Log in"
            title="Log in"
          >
            Log in
          </button>
        </div>
      )}
      {showNav && !isDesktop && session && (
        <div className={`${styles.notificationFloatWrap} notification-float-wrap`}>
          <button
            ref={notificationsBtnRef}
            type="button"
            className={styles.notificationFloatBtn}
            onClick={() => setNotificationsOpen((o) => !o)}
            aria-label="Notifications"
            aria-expanded={notificationsOpen}
            title="Notifications"
          >
            <BellIcon />
            {unreadNotificationCount > 0 && (
              <span className={styles.notificationUnreadDot} aria-hidden />
            )}
          </button>
          {notificationsOpen && (
            <div ref={notificationsMenuRef} className={styles.notificationsMenu} role="dialog" aria-label="Notifications">
              {notificationsPanelContent}
            </div>
          )}
        </div>
      )}
      {showNav && !isDesktop && accountMenuOpen && (
        <div className={styles.accountMenuAboveWrap}>
          <div ref={accountMenuRef} className={styles.accountMenuAbove} role="menu" aria-label="Accounts and settings">
            {accountPanelContent}
          </div>
        </div>
      )}
      <main id="main-content" className={styles.main} aria-label="Main content">
        {showNav && path === '/feed' ? (
          <div
            ref={feedPullRefreshWrapperRef}
            onTouchStart={feedPullRefreshHandlers?.onTouchStart}
            onTouchMove={feedPullRefreshHandlers?.onTouchMove}
            onTouchEnd={feedPullRefreshHandlers?.onTouchEnd}
          >
            <FeedSelector
              variant="page"
              sources={session ? allFeedSources : GUEST_FEED_SOURCES}
              fallbackSource={session ? fallbackFeedSource : GUEST_FEED_SOURCES[0]}
              mixEntries={session ? mixEntries : GUEST_MIX_ENTRIES}
              onToggle={handleFeedsToggleSource}
              setEntryPercent={setEntryPercent}
              onAddCustom={async (input) => {
                if (!session) return
                setFeedAddError(null)
                try {
                  const isFeedSource = typeof input === 'object' && input !== null && 'uri' in input
                  const uri = isFeedSource ? await resolveFeedUri((input as FeedSource).uri!) : await resolveFeedUri(input as string)
                  await addSavedFeed(uri)
                  const label = isFeedSource ? (input as FeedSource).label ?? await getFeedDisplayName(uri) : await getFeedDisplayName(uri)
                  const source: FeedSource = { kind: 'custom', label, uri }
                  setSavedFeedSources((prev) => (prev.some((s) => s.uri === uri) ? prev : [...prev, source]))
                  handleFeedsToggleSource(source)
                  await loadSavedFeeds(source)
                } catch (err) {
                  setFeedAddError(err instanceof Error ? err.message : 'Could not add feed. Try again.')
                }
              }}
              onToggleWhenGuest={session ? undefined : openLoginModal}
              removableSourceUris={session ? removableSourceUris : undefined}
              onRemoveFeed={session ? handleRemoveFeed : undefined}
              onShareFeed={session ? handleShareFeed : undefined}
              onReorderSources={session ? handleReorderFeeds : undefined}
            />
            {children}
          </div>
        ) : (
          children
        )}
      </main>
      {showNav && (
        <>
          <div
            className={`${styles.navOuter} nav-outer ${navVisible ? '' : styles.navHidden} ${!isDesktop && (mobileNavScrollHidden || (isModalOpen && modalScrollHidden)) ? styles.navOuterScrollHidden : ''}`}
          >
            {!isModalOpen && (
              <button
                type="button"
                className={`${styles.seenPostsFloatBtn} hide-seen-fab float-btn`}
                onPointerDown={(e) => startSeenHold(e)}
                onPointerUp={endSeenHold}
                onPointerLeave={endSeenHold}
                onPointerCancel={endSeenHold}
                onClick={(e) => seenBtnClick(e)}
                title="Tap to hide seen posts, hold to show them again"
                aria-label="Seen posts: tap to hide, hold to show again"
              >
                <SeenPostsIcon />
              </button>
            )}
            <nav
              className={`${styles.nav} nav`}
              aria-label="Main navigation"
            >
              {navItems}
            </nav>
          </div>
          {mobileSearchOpen && !isDesktop && (
            <>
              <div
                className={styles.searchOverlayBackdrop}
                onClick={closeMobileSearch}
                aria-hidden
              />
              <div
                className={`${styles.searchOverlayCenter} ${!isDesktop ? styles.searchOverlayMobileBottom : styles.searchOverlayAboveKeyboard}`}
                role="dialog"
                aria-label="Search"
                style={!isDesktop ? undefined : { bottom: searchOverlayBottom }}
              >
                <div className={styles.searchOverlayCard}>
                  <SearchBar inputRef={searchInputRef} onClose={closeMobileSearch} suggestionsAbove onSelectFeed={handleSelectFeedFromSearch} />
                </div>
              </div>
            </>
          )}
          {composeOpen && (
            <>
              <div
                className={styles.searchOverlayBackdrop}
                onClick={closeCompose}
                aria-hidden
              />
              <div
                className={`${styles.composeOverlay} ${!isDesktop ? styles.composeOverlayMobile : ''}`}
                role="dialog"
                aria-label="New post"
                onClick={closeCompose}
                onDragOver={handleComposeDragOver}
                onDrop={handleComposeDrop}
                style={!isDesktop ? { bottom: composeOverlayBottom } : undefined}
              >
                <div className={styles.composeCard} onClick={(e) => e.stopPropagation()}>
                  <header className={styles.composeHeader}>
                    <button type="button" className={styles.composeCancel} onClick={closeCompose} disabled={composePosting}>
                      Cancel
                    </button>
                    <h2 className={styles.composeTitle}>New post</h2>
                    <div className={styles.composeHeaderPostWrap}>
                      {session && (
                        <button
                          type="submit"
                          form="compose-form"
                          className={styles.composeSubmit}
                          disabled={composePosting || composeSegments.every((s) => !s.text.trim() && s.images.length === 0)}
                        >
                          {composePosting ? 'Posting…' : 'Post'}
                        </button>
                      )}
                    </div>
                  </header>
                  {!session ? (
                    <p className={styles.composeSignIn}>
                      <button type="button" className={styles.composeSignInLink} onClick={() => { closeCompose(); openLoginModal(); }}>Log in</button> to post.
                    </p>
                  ) : (
                    <form id="compose-form" ref={composeFormRef} onSubmit={handleComposeSubmit}>
                      {composeSegments.length > 1 && (
                        <div className={styles.composePreviousPosts} role="region" aria-label="Posts in thread">
                          <p className={styles.composePreviousPostsTitle}>Posts in thread — click to edit</p>
                          <div className={styles.composePreviousPostsList}>
                            {composeSegments.map((seg, i) =>
                              i === composeSegmentIndex ? null : (
                                <button
                                  key={i}
                                  type="button"
                                  className={styles.composePreviousPostCard}
                                  onClick={() => setComposeSegmentIndex(i)}
                                  disabled={composePosting}
                                  aria-label={`Edit post ${i + 1}`}
                                >
                                  <span className={styles.composePreviousPostLabel}>
                                    Post {i + 1}
                                  </span>
                                  {seg.text.trim() ? (
                                    <div className={styles.composePreviousPostText}>
                                      <PostText text={seg.text} interactive={false} />
                                    </div>
                                  ) : seg.images.length > 0 ? null : (
                                    <div className={styles.composePreviousPostText}><em>Empty</em></div>
                                  )}
                                  {seg.images.length > 0 && (
                                    <p className={styles.composePreviousPostMedia}>
                                      {seg.images.length} image{seg.images.length !== 1 ? 's' : ''}
                                    </p>
                                  )}
                                </button>
                              )
                            )}
                          </div>
                        </div>
                      )}
                      {composeSegments.length > 1 && (
                        <p className={styles.composeSegmentLabel}>Post {composeSegmentIndex + 1} of {composeSegments.length}</p>
                      )}
                      <ComposerSuggestions
                        className={styles.composeTextarea}
                        value={currentSegment.text}
                        onChange={setCurrentSegmentText}
                        onKeyDown={(e) => handleComposeKeyDown(e, composeFormRef.current)}
                        placeholder="What's on your mind? Type @ for users, # for hashtags, % for forum posts"
                        rows={4}
                        maxLength={POST_MAX_LENGTH}
                        disabled={composePosting}
                        autoFocus={isDesktop}
                      />
                      {currentSegment.images.length > 0 && (
                        <div className={styles.composeMediaSection}>
                          <div className={styles.composePreviews}>
                            {currentSegment.images.map((_, i) => (
                              <div key={i} className={styles.composePreviewWrap}>
                                <img
                                  src={composePreviewUrls[i]}
                                  alt=""
                                  className={styles.composePreviewImg}
                                />
                                <button
                                  type="button"
                                  className={styles.composePreviewRemove}
                                  onClick={() => removeComposeImage(i)}
                                  aria-label="Remove image"
                                  disabled={composePosting}
                                >
                                  ×
                                </button>
                              </div>
                            ))}
                          </div>
                          <p className={styles.composeAltPrompt}>Describe each image for accessibility (alt text).</p>
                          <div className={styles.composeAltFields}>
                            {currentSegment.images.map((_, i) => (
                              <div key={i} className={styles.composeAltRow}>
                                <label htmlFor={`compose-alt-${composeSegmentIndex}-${i}`} className={styles.composeAltLabel}>
                                  Image {i + 1}
                                </label>
                                <input
                                  id={`compose-alt-${composeSegmentIndex}-${i}`}
                                  type="text"
                                  className={styles.composeAltInput}
                                  placeholder="Describe this image for people using screen readers"
                                  value={currentSegment.imageAlts[i] ?? ''}
                                  onChange={(e) => {
                                    const val = e.target.value.slice(0, 1000)
                                    setComposeSegments((prev) => {
                                      const n = [...prev]
                                      const s = n[composeSegmentIndex]
                                      if (!s) return prev
                                      const nextAlts = [...s.imageAlts]
                                      while (nextAlts.length < s.images.length) nextAlts.push('')
                                      nextAlts[i] = val
                                      n[composeSegmentIndex] = { ...s, imageAlts: nextAlts }
                                      return n
                                    })
                                  }}
                                  maxLength={1000}
                                  disabled={composePosting}
                                  aria-label={`Alt text for image ${i + 1}`}
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      <div className={styles.composeFooter}>
                        <div className={styles.composeFooterLeft}>
                          <input
                            ref={composeFileInputRef}
                            type="file"
                            accept="image/jpeg,image/png,image/gif,image/webp"
                            multiple
                            className={styles.composeFileInput}
                            onChange={(e) => {
                              if (e.target.files?.length) addComposeImages(e.target.files)
                              e.target.value = ''
                            }}
                          />
                          <button
                            type="button"
                            className={styles.composeAddMedia}
                            onClick={() => composeFileInputRef.current?.click()}
                            disabled={composePosting || currentSegment.images.length >= COMPOSE_IMAGE_MAX}
                            title="Add photo"
                            aria-label="Add photo"
                          >
                            Add media
                          </button>
                        </div>
                        <div className={styles.composeActions}>
                          <CharacterCountWithCircle used={currentSegment.text.length} max={POST_MAX_LENGTH} />
                          <button
                            type="button"
                            className={styles.composeAddThread}
                            onClick={addComposeThreadSegment}
                            disabled={composePosting}
                            title="Add to thread"
                            aria-label="Add to thread"
                          >
                            +
                          </button>
                        </div>
                      </div>
                      {composeError && <p className={styles.composeError}>{composeError}</p>}
                    </form>
                  )}
                </div>
              </div>
            </>
          )}
          {aboutOpen && (
            <>
              <div
                className={styles.searchOverlayBackdrop}
                onClick={() => setAboutOpen(false)}
                aria-hidden
              />
              <div
                className={styles.aboutOverlay}
                role="dialog"
                aria-label="About ArtSky"
                onClick={() => setAboutOpen(false)}
              >
                <div className={styles.aboutCard} onClick={(e) => e.stopPropagation()}>
                  <h2 className={styles.aboutTitle}>ArtSky</h2>
                  <p className={styles.aboutIntro}>
                    A Bluesky client focused on art.
                  </p>
                  <h3 className={styles.aboutSubtitle}>Keyboard shortcuts</h3>
                  <dl className={styles.aboutShortcuts}>
                    <dt>W / ↑</dt><dd>Move up</dd>
                    <dt>A / ←</dt><dd>Move left</dd>
                    <dt>S / ↓</dt><dd>Move down</dd>
                    <dt>D / →</dt><dd>Move right</dd>
                    <dt>Q</dt><dd>Quit / close window</dd>
                    <dt>E</dt><dd>Enter post</dd>
                    <dt>R</dt><dd>Reply to post</dd>
                    <dt>T</dt><dd>Toggle text view</dd>
                    <dt>F</dt><dd>Like / unlike</dd>
                    <dt>C</dt><dd>Collect post</dd>
                    <dt>B</dt><dd>Block author (feed)</dd>
                    <dt>4</dt><dd>Follow author</dd>
                    <dt>Escape</dt><dd>Escape all windows</dd>
                    <dt>1 / 2 / 3</dt><dd>1, 2, or 3 column view</dd>
                  </dl>
                  <button
                    type="button"
                    className={styles.aboutClose}
                    onClick={() => setAboutOpen(false)}
                    aria-label="Close"
                  >
                    Close
                  </button>
                </div>
              </div>
            </>
          )}
        </>
      )}
      {toast?.toastMessage && (
        <div className="app-toast float-btn" role="status" aria-live="polite">
          {toast.toastMessage}
        </div>
      )}
      </FeedSwipeProvider>
      </FeedPullRefreshContext.Provider>
    </div>
  )
}
