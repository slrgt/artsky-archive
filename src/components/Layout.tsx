import { useState, useRef, useEffect, useMemo, useSyncExternalStore } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useSession } from '../context/SessionContext'
import { useTheme } from '../context/ThemeContext'
import { useViewMode, VIEW_LABELS } from '../context/ViewModeContext'
import { useArtOnly } from '../context/ArtOnlyContext'
import { useProfileModal } from '../context/ProfileModalContext'
import { useEditProfile } from '../context/EditProfileContext'
import { useModeration } from '../context/ModerationContext'
import { publicAgent, createPost, getNotifications } from '../lib/bsky'
import SearchBar from './SearchBar'
import styles from './Layout.module.css'

interface Props {
  title: string
  children: React.ReactNode
  showNav?: boolean
}

function FeedIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 21h8M12 17v4" />
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

function SearchIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  )
}

function ForumIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <line x1="10" y1="9" x2="8" y2="9" />
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
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  )
}

function EyeIcon({ off }: { off?: boolean }) {
  if (off) {
    return (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
        <line x1="1" y1="1" x2="23" y2="23" />
      </svg>
    )
  }
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
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
function LogOutIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
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

function UserPlusIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <line x1="19" y1="8" x2="19" y2="14" />
      <line x1="22" y1="11" x2="16" y2="11" />
    </svg>
  )
}

function PencilIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
      <path d="m15 5 4 4" />
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

function ThemeAutoIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M21 3v5h-5" />
      <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
      <path d="M8 16H3v5" />
    </svg>
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
  const { openProfileModal } = useProfileModal()
  const editProfile = useEditProfile()
  const openEditProfile = editProfile?.openEditProfile ?? (() => {})
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
  const themeButtons = (
    <div className={styles.themeButtonGroup} role="group" aria-label="Theme">
      <button
        type="button"
        className={theme === 'light' ? styles.themeBtnActive : styles.themeBtn}
        onClick={() => setTheme('light')}
        title="Light"
        aria-label="Light"
        aria-pressed={theme === 'light'}
      >
        <ThemeSunIcon />
      </button>
      <button
        type="button"
        className={theme === 'system' ? styles.themeBtnActive : styles.themeBtn}
        onClick={() => setTheme('system')}
        title="Auto (system)"
        aria-label="Auto"
        aria-pressed={theme === 'system'}
      >
        <ThemeAutoIcon />
      </button>
      <button
        type="button"
        className={theme === 'dark' ? styles.themeBtnActive : styles.themeBtn}
        onClick={() => setTheme('dark')}
        title="Dark"
        aria-label="Dark"
        aria-pressed={theme === 'dark'}
      >
        <ThemeMoonIcon />
      </button>
    </div>
  )
  const { viewMode, setViewMode, viewOptions } = useViewMode()
  const { artOnly, toggleArtOnly } = useArtOnly()
  const { nsfwPreference, setNsfwPreference } = useModeration()
  const path = loc.pathname
  const isDesktop = useSyncExternalStore(subscribeDesktop, getDesktopSnapshot, () => false)
  const [accountSheetOpen, setAccountSheetOpen] = useState(false)
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [notificationFilter, setNotificationFilter] = useState<'all' | 'reply' | 'follow' | 'like'>('all')
  const [notifications, setNotifications] = useState<{ uri: string; author: { handle?: string; did: string; avatar?: string; displayName?: string }; reason: string; reasonSubject?: string; isRead: boolean; indexedAt: string; replyPreview?: string }[]>([])
  const [notificationsLoading, setNotificationsLoading] = useState(false)
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false)
  const [composeOpen, setComposeOpen] = useState(false)
  const [composeOverlayBottom, setComposeOverlayBottom] = useState(0)
  const [composeText, setComposeText] = useState('')
  const [composeImages, setComposeImages] = useState<File[]>([])
  const [composeImageAlts, setComposeImageAlts] = useState<string[]>([])
  const [composePosting, setComposePosting] = useState(false)
  const [composeError, setComposeError] = useState<string | null>(null)
  const composeFileInputRef = useRef<HTMLInputElement>(null)
  const composeFormRef = useRef<HTMLFormElement>(null)
  const [navVisible, setNavVisible] = useState(true)
  const [searchOverlayBottom, setSearchOverlayBottom] = useState(0)
  const lastScrollY = useRef(0)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const accountBtnRef = useRef<HTMLButtonElement>(null)
  const accountMenuRef = useRef<HTMLDivElement>(null)
  const notificationsMenuRef = useRef<HTMLDivElement>(null)
  const notificationsBtnRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    document.title = title ? `${title} · ArtSky` : 'ArtSky'
  }, [title])

  /* Global keyboard: Q = back (works on all pages when not typing). Ctrl/Cmd+key never handled so browser (e.g. Ctrl+R) and Cmd+Enter submit work. */
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable) return
      if (e.ctrlKey || e.metaKey) return
      if (e.key.toLowerCase() !== 'q') return
      e.preventDefault()
      navigate(-1)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [navigate])

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
    if (!notificationsOpen) return
    const onDocClick = (e: MouseEvent) => {
      const t = e.target as Node
      if (notificationsMenuRef.current?.contains(t) || notificationsBtnRef.current?.contains(t)) return
      setNotificationsOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [notificationsOpen])

  useEffect(() => {
    if (!notificationsOpen || !session) return
    setNotificationsLoading(true)
    getNotifications(30)
      .then(({ notifications: list }) => setNotifications(list))
      .catch(() => setNotifications([]))
      .finally(() => setNotificationsLoading(false))
  }, [notificationsOpen, session])

  const scrollThreshold = 8
  useEffect(() => {
    if (!showNav) return
    const onScroll = () => {
      const y = window.scrollY
      if (y < 60) {
        setNavVisible(true)
      } else if (y > lastScrollY.current + scrollThreshold) {
        setNavVisible(false)
      } else if (y < lastScrollY.current - scrollThreshold) {
        setNavVisible(true)
      }
      lastScrollY.current = y
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [showNav])

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

  function closeMobileSearch() {
    setMobileSearchOpen(false)
    searchInputRef.current?.blur()
  }

  function openAccountPanel() {
    if (isDesktop) setAccountMenuOpen(true)
    else setAccountSheetOpen(true)
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
    navigate('/login', { replace: true })
  }

  function handleLogout() {
    setAccountSheetOpen(false)
    setAccountMenuOpen(false)
    logout()
    navigate('/login', { replace: true })
  }

  const POST_MAX_LENGTH = 300

  function openCompose() {
    setComposeOpen(true)
    setComposeText('')
    setComposeError(null)
    setComposeOverlayBottom(0)
  }

  function closeCompose() {
    setComposeOpen(false)
    setComposeError(null)
  }

  const COMPOSE_IMAGE_MAX = 4
  const COMPOSE_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']

  function addComposeImages(files: FileList | File[]) {
    const list = Array.from(files).filter((f) => COMPOSE_IMAGE_TYPES.includes(f.type))
    const take = Math.min(list.length, COMPOSE_IMAGE_MAX - composeImages.length)
    if (take <= 0) return
    const added = list.slice(0, take)
    setComposeImages((prev) => [...prev, ...added])
    setComposeImageAlts((prev) => [...prev, ...added.map(() => '')])
  }

  function removeComposeImage(index: number) {
    setComposeImages((prev) => prev.filter((_, i) => i !== index))
    setComposeImageAlts((prev) => prev.filter((_, i) => i !== index))
  }

  async function handleComposeSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!session || composePosting) return
    const canSubmit = composeText.trim() || composeImages.length > 0
    if (!canSubmit) return
    setComposeError(null)
    setComposePosting(true)
    try {
      await createPost(composeText, composeImages.length > 0 ? composeImages : undefined, composeImageAlts.length > 0 ? composeImageAlts : undefined)
      setComposeText('')
      setComposeImages([])
      setComposeImageAlts([])
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
      if (form && (composeText.trim() || composeImages.length > 0) && !composePosting) {
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
    () => composeImages.map((f) => URL.createObjectURL(f)),
    [composeImages],
  )
  useEffect(() => {
    return () => composePreviewUrls.forEach((u) => URL.revokeObjectURL(u))
  }, [composePreviewUrls])

  /* Mobile nav: Feed, Forum, New, Search, Accounts (right). Desktop: Feed, Artboards, New, Search, Forum, Accounts */
  const navTrayItems = (
    <>
      <Link
        to="/feed"
        className={path === '/feed' ? styles.navActive : ''}
        aria-current={path === '/feed' ? 'page' : undefined}
      >
        <span className={styles.navIcon}><FeedIcon /></span>
        <span className={styles.navLabel}>Feed</span>
      </Link>
      {isDesktop && (
        <Link
          to="/artboards"
          className={path === '/artboards' ? styles.navActive : ''}
          aria-current={path === '/artboards' ? 'page' : undefined}
        >
          <span className={styles.navIcon}><ArtboardsIcon /></span>
          <span className={styles.navLabel}>Artboards</span>
        </Link>
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
      <button type="button" className={styles.navBtn} onClick={focusSearch} aria-label="Search">
        <span className={styles.navIcon}><SearchIcon /></span>
        <span className={styles.navLabel}>Search</span>
      </button>
      <Link
        to="/forum"
        className={path === '/forum' ? styles.navActive : ''}
        aria-current={path === '/forum' ? 'page' : undefined}
      >
        <span className={styles.navIcon}><ForumIcon /></span>
        <span className={styles.navLabel}>Forum</span>
      </Link>
    </>
  )

  const navItems = (
    <>
      {isDesktop ? (
        /* Desktop: Feed, Artboards, New, Search, Forum */
        navTrayItems
      ) : (
        /* Mobile: Feed, Forum, New, Search (Artboards is in account menu) */
        <>
          <Link
            to="/feed"
            className={path === '/feed' ? styles.navActive : ''}
            aria-current={path === '/feed' ? 'page' : undefined}
          >
            <span className={styles.navIcon}><FeedIcon /></span>
            <span className={styles.navLabel}>Feed</span>
          </Link>
          <Link
            to="/forum"
            className={path === '/forum' ? styles.navActive : ''}
            aria-current={path === '/forum' ? 'page' : undefined}
          >
            <span className={styles.navIcon}><ForumIcon /></span>
            <span className={styles.navLabel}>Forum</span>
          </Link>
          <button type="button" className={styles.navBtn} onClick={openCompose} aria-label="New post">
            <span className={styles.navIcon}><PlusIcon /></span>
            <span className={styles.navLabel}>New</span>
          </button>
          <button type="button" className={styles.navBtn} onClick={focusSearch} aria-label="Search">
            <span className={styles.navIcon}><SearchIcon /></span>
            <span className={styles.navLabel}>Search</span>
          </button>
        </>
      )}
      <button
        type="button"
        className={styles.navBtn}
        onClick={() => openAccountPanel()}
        aria-label="Accounts and settings"
        aria-expanded={accountSheetOpen || accountMenuOpen}
      >
        <span className={styles.navIcon}>
          {currentAccountAvatar ? (
            <img src={currentAccountAvatar} alt="" className={styles.headerAccountAvatar} />
          ) : (
            <AccountIcon />
          )}
        </span>
        <span className={styles.navLabel}>Accounts</span>
      </button>
    </>
  )

  const closeAccountPanel = () => {
    setAccountMenuOpen(false)
    setAccountSheetOpen(false)
  }

  const accountPanelContent = (
    <>
      <section className={styles.menuSection}>
        <span className={styles.menuSectionTitle}>App</span>
        <Link
          to="/artboards"
          className={path === '/artboards' ? styles.menuItemActive : styles.menuItem}
          onClick={closeAccountPanel}
          aria-current={path === '/artboards' ? 'page' : undefined}
        >
          <span className={styles.navIcon}><ArtboardsIcon /></span>
          <span>Artboards</span>
        </Link>
      </section>
      <section className={styles.menuSection}>
        <div className={styles.menuThemeColumnRow}>
          {themeButtons}
          <div className={styles.menuRow}>
            {viewOptions.map((m) => (
              <button
                key={m}
                type="button"
                className={viewMode === m ? styles.menuOptionActive : styles.menuOption}
                onClick={() => setViewMode(m)}
                title={VIEW_LABELS[m]}
                aria-label={VIEW_LABELS[m]}
              >
                {m === '1' && <Column1Icon />}
                {m === '2' && <Column2Icon />}
                {m === '3' && <Column3Icon />}
              </button>
            ))}
          </div>
        </div>
        <div className={styles.menuNsfwRow} role="group" aria-label="Adult content preference">
          {(['blurred', 'nsfw', 'sfw'] as const).map((p) => (
            <button
              key={p}
              type="button"
              className={nsfwPreference === p ? styles.menuNsfwBtnActive : styles.menuNsfwBtn}
              onClick={() => setNsfwPreference(p)}
            >
              {p === 'nsfw' ? 'NSFW' : p === 'sfw' ? 'SFW' : 'Blurred'}
            </button>
          ))}
        </div>
      </section>
      {session && (
        <section className={styles.menuSection}>
          <span className={styles.menuSectionTitle}>Accounts</span>
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
                  <img src={profile.avatar} alt="" className={styles.accountMenuAvatar} />
                ) : (
                  <span className={styles.accountMenuAvatarPlaceholder} aria-hidden>{(handle || s.did).slice(0, 1).toUpperCase()}</span>
                )}
                <span>@{handle}</span>
                {isCurrent && <span className={styles.sheetCheck} aria-hidden> ✓</span>}
              </button>
            )
          })}
          <div className={styles.menuActions}>
            <button
              type="button"
              className={styles.menuActionBtn}
              onClick={() => {
                setAccountMenuOpen(false)
                setAccountSheetOpen(false)
                openEditProfile()
              }}
            >
              Edit profile
            </button>
            <button type="button" className={styles.menuActionBtn} onClick={handleAddAccount}>
              Add account
            </button>
            <button type="button" className={styles.menuActionSecondary} onClick={handleLogout}>
              Log out
            </button>
          </div>
        </section>
      )}
      {!session && (
        <section className={styles.menuSection}>
          <button
            type="button"
            className={styles.menuActionBtn}
            onClick={() => {
              setAccountMenuOpen(false)
              setAccountSheetOpen(false)
              navigate('/login')
            }}
          >
            Sign in
          </button>
        </section>
      )}
    </>
  )

  const accountPanelContentCompact = (
    <>
      <Link
        to="/artboards"
        className={path === '/artboards' ? styles.menuCompactItemActive : styles.menuCompactItem}
        onClick={closeAccountPanel}
        aria-current={path === '/artboards' ? 'page' : undefined}
      >
        <span className={styles.navIcon}><ArtboardsIcon /></span>
        <span className={styles.menuCompactHandle}>Artboards</span>
      </Link>
      {session && (
        <>
          <div className={styles.menuCompactAccounts}>
            {sessionsList.map((s) => {
              const profile = accountProfiles[s.did]
              const handle = profile?.handle ?? (s as { handle?: string }).handle ?? s.did
              const isCurrent = s.did === session?.did
              return (
                <button
                  key={s.did}
                  type="button"
                  className={isCurrent ? styles.menuCompactItemActive : styles.menuCompactItem}
                  onClick={() => {
                    if (isCurrent) {
                      setAccountSheetOpen(false)
                      openProfileModal(handle)
                    } else {
                      handleSelectAccount(s.did)
                    }
                  }}
                  title={isCurrent ? 'View my profile' : `@${handle}`}
                >
                  {profile?.avatar ? (
                    <img src={profile.avatar} alt="" className={styles.accountMenuAvatar} />
                  ) : (
                    <span className={styles.accountMenuAvatarPlaceholder} aria-hidden>{(handle || s.did).slice(0, 1).toUpperCase()}</span>
                  )}
                  <span className={styles.menuCompactHandle}>@{handle}</span>
                </button>
              )
            })}
          </div>
          <div className={styles.menuCompactActions}>
            <button type="button" className={styles.menuCompactActionBtn} onClick={() => { setAccountSheetOpen(false); openEditProfile() }} title="Edit profile" aria-label="Edit profile">
              <PencilIcon />
            </button>
            <button type="button" className={styles.menuCompactActionBtn} onClick={handleAddAccount} title="Add account" aria-label="Add account">
              <PlusIcon />
            </button>
            <button type="button" className={styles.menuCompactActionSec} onClick={handleLogout} title="Log out" aria-label="Log out">
              <LogOutIcon />
            </button>
          </div>
        </>
      )}
      {!session && (
        <div className={styles.menuCompactAuthRow}>
          <Link
            to="/login"
            className={styles.menuCompactAuthBtn}
            onClick={() => setAccountSheetOpen(false)}
          >
            <LogInIcon />
            <span>Log in</span>
          </Link>
          <Link
            to="/login"
            state={{ mode: 'create' }}
            className={styles.menuCompactAuthBtnPrimary}
            onClick={() => setAccountSheetOpen(false)}
          >
            <UserPlusIcon />
            <span>Create account</span>
          </Link>
        </div>
      )}
      <div className={styles.menuCompactRow}>
        {themeButtons}
        {viewOptions.map((m) => (
          <button
            key={m}
            type="button"
            className={viewMode === m ? styles.menuCompactBtnActive : styles.menuCompactBtn}
            onClick={() => setViewMode(m)}
            title={VIEW_LABELS[m]}
            aria-label={VIEW_LABELS[m]}
          >
            {m === '1' && <Column1Icon />}
            {m === '2' && <Column2Icon />}
            {m === '3' && <Column3Icon />}
          </button>
        ))}
      </div>
      <div className={styles.menuCompactNsfwRow} role="group" aria-label="Adult content preference">
        {(['blurred', 'nsfw', 'sfw'] as const).map((p) => (
          <button
            key={p}
            type="button"
            className={nsfwPreference === p ? styles.menuNsfwBtnActive : styles.menuNsfwBtn}
            onClick={() => setNsfwPreference(p)}
          >
            {p === 'nsfw' ? 'NSFW' : p === 'sfw' ? 'SFW' : 'Blurred'}
          </button>
        ))}
      </div>
    </>
  )

  return (
    <div className={`${styles.wrap} ${showNav ? styles.wrapWithHeader : ''}`}>
      <header className={`${styles.header} ${showNav && !session ? styles.headerLoggedOut : ''} ${showNav && !isDesktop && !navVisible ? styles.headerHidden : ''}`}>
        {showNav && (
          <>
            <div className={styles.headerLeft}>
              <Link
                to="/feed"
                className={styles.logoLink}
                aria-label="ArtSky – back to feed"
                onClick={(e) => {
                  if (path === '/feed') {
                    e.preventDefault()
                    window.scrollTo({ top: 0, behavior: 'smooth' })
                  }
                }}
              >
                <img src={`${import.meta.env.BASE_URL || '/'}icon.svg`} alt="" className={styles.logoIcon} />
                <span className={styles.logoText}>ArtSky</span>
              </Link>
              {isDesktop && (
                <>
                  <Link to="/artboards" className={styles.headerArtboardsLink} aria-label="Artboards">
                    Artboards
                  </Link>
                  <Link
                    to="/forum"
                    className={styles.headerArtboardsLink}
                    aria-label="Forum"
                  >
                    Forum
                  </Link>
                </>
              )}
            </div>
            <div className={styles.headerCenter}>
              <SearchBar inputRef={searchInputRef} compact={isDesktop} />
            </div>
            <div className={styles.headerRight}>
              {!session && isDesktop && (
                <>
                  <Link to="/login" className={styles.headerAuthLink}>
                    Log in
                  </Link>
                  <Link to="/login" state={{ mode: 'create' }} className={styles.headerAuthLinkPrimary}>
                    Create account
                  </Link>
                </>
              )}
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
              {session && !isDesktop && (
                <button
                  type="button"
                  className={`${styles.headerBtn} ${artOnly ? styles.headerBtnActive : ''}`}
                  onClick={toggleArtOnly}
                  aria-label={artOnly ? 'Show text on feed' : 'Hide text, focus on art'}
                  title={artOnly ? 'Show text' : 'Art only'}
                >
                  <EyeIcon off={artOnly} />
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
                  {notificationsOpen && (
                    <div ref={notificationsMenuRef} className={styles.notificationsMenu} role="dialog" aria-label="Notifications">
                      <h2 className={styles.menuTitle}>Notifications</h2>
                      <div className={styles.notificationFilters}>
                        <button type="button" className={notificationFilter === 'all' ? styles.notificationFilterActive : styles.notificationFilter} onClick={() => setNotificationFilter('all')}>All</button>
                        <button type="button" className={notificationFilter === 'reply' ? styles.notificationFilterActive : styles.notificationFilter} onClick={() => setNotificationFilter('reply')}>Replies</button>
                        <button type="button" className={notificationFilter === 'follow' ? styles.notificationFilterActive : styles.notificationFilter} onClick={() => setNotificationFilter('follow')}>Follows</button>
                        <button type="button" className={notificationFilter === 'like' ? styles.notificationFilterActive : styles.notificationFilter} onClick={() => setNotificationFilter('like')}>Likes & reposts</button>
                      </div>
                      {notificationsLoading ? (
                        <p className={styles.notificationsLoading}>Loading…</p>
                      ) : (() => {
                        const filtered = notificationFilter === 'all' ? notifications : notificationFilter === 'like'
                          ? notifications.filter((n) => n.reason === 'like' || n.reason === 'repost')
                          : notifications.filter((n) => n.reason === notificationFilter)
                        return filtered.length === 0 ? (
                          <p className={styles.notificationsEmpty}>
                            {notificationFilter === 'all' ? 'No notifications yet.' : 'No matching notifications.'}
                          </p>
                        ) : (
                        <ul className={styles.notificationsList}>
                          {filtered.map((n) => {
                            const handle = n.author.handle ?? n.author.did
                            const isFollow = n.reason === 'follow'
                            const href = isFollow ? `/profile/${encodeURIComponent(handle)}` : `/post/${encodeURIComponent(n.reasonSubject ?? n.uri)}`
                            const reasonLabel =
                              n.reason === 'like' ? 'liked your post' :
                              n.reason === 'repost' ? 'reposted your post' :
                              n.reason === 'follow' ? 'followed you' :
                              n.reason === 'mention' ? 'mentioned you' :
                              n.reason === 'reply' ? 'replied to you' :
                              n.reason === 'quote' ? 'quoted your post' :
                              n.reason
                            return (
                              <li key={n.uri}>
                                <Link
                                  to={href}
                                  className={styles.notificationItem}
                                  onClick={(e) => {
                                    if (isFollow) {
                                      e.preventDefault()
                                      openProfileModal(handle)
                                    }
                                    setNotificationsOpen(false)
                                  }}
                                >
                                  {n.author.avatar ? (
                                    <img src={n.author.avatar} alt="" className={styles.notificationAvatar} />
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
                    </div>
                  )}
                </div>
              )}
              {isDesktop && (
                <div className={styles.headerBtnWrap}>
                  <button
                    ref={accountBtnRef}
                    type="button"
                    className={styles.headerBtn}
                    onClick={() => setAccountMenuOpen((o) => !o)}
                    aria-label="Accounts and settings"
                    aria-expanded={accountMenuOpen}
                  >
                    <span className={styles.navIcon}>
                      {currentAccountAvatar ? (
                        <img src={currentAccountAvatar} alt="" className={styles.headerAccountAvatar} />
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
              )}
            </div>
          </>
        )}
      </header>
      <main className={styles.main}>
        {children}
      </main>
      {showNav && (
        <>
          <nav
            className={`${styles.nav} ${navVisible ? '' : styles.navHidden}`}
            aria-label="Main"
          >
            {navItems}
          </nav>
          {mobileSearchOpen && !isDesktop && (
            <>
              <div
                className={styles.searchOverlayBackdrop}
                onClick={closeMobileSearch}
                aria-hidden
              />
              <div
                className={`${styles.searchOverlayCenter} ${!isDesktop ? styles.searchOverlayMobileTop : styles.searchOverlayAboveKeyboard}`}
                role="dialog"
                aria-label="Search"
                style={!isDesktop ? undefined : { bottom: searchOverlayBottom }}
              >
                <div className={styles.searchOverlayCard}>
                  <SearchBar inputRef={searchInputRef} onClose={closeMobileSearch} suggestionsAbove={isDesktop} />
                </div>
              </div>
            </>
          )}
          {accountSheetOpen && !isDesktop && (
            <>
              <div
                className={styles.sheetBackdrop}
                onClick={() => setAccountSheetOpen(false)}
                aria-hidden
              />
              <div className={styles.accountPopup} role="dialog" aria-label="Accounts and settings">
                <div className={styles.accountPopupContentCompact}>
                  {accountPanelContentCompact}
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
                  <h2 className={styles.composeTitle}>New post</h2>
                  {!session ? (
                    <p className={styles.composeSignIn}>
                      <Link to="/login" onClick={closeCompose}>Sign in</Link> to post.
                    </p>
                  ) : (
                    <form ref={composeFormRef} onSubmit={handleComposeSubmit}>
                      <textarea
                        className={styles.composeTextarea}
                        value={composeText}
                        onChange={(e) => setComposeText(e.target.value.slice(0, POST_MAX_LENGTH))}
                        onKeyDown={(e) => handleComposeKeyDown(e, composeFormRef.current)}
                        placeholder="What's on your mind?"
                        rows={4}
                        maxLength={POST_MAX_LENGTH}
                        disabled={composePosting}
                        autoFocus={isDesktop}
                      />
                      {composeImages.length > 0 && (
                        <div className={styles.composeMediaSection}>
                          <div className={styles.composePreviews}>
                            {composeImages.map((_, i) => (
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
                            {composeImages.map((_, i) => (
                              <div key={i} className={styles.composeAltRow}>
                                <label htmlFor={`compose-alt-${i}`} className={styles.composeAltLabel}>
                                  Image {i + 1}
                                </label>
                                <input
                                  id={`compose-alt-${i}`}
                                  type="text"
                                  className={styles.composeAltInput}
                                  placeholder="Describe this image for people using screen readers"
                                  value={composeImageAlts[i] ?? ''}
                                  onChange={(e) => {
                                    const val = e.target.value.slice(0, 1000)
                                    setComposeImageAlts((prev) => {
                                      const next = [...prev]
                                      while (next.length < composeImages.length) next.push('')
                                      next[i] = val
                                      return next
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
                            disabled={composePosting || composeImages.length >= COMPOSE_IMAGE_MAX}
                            title="Add photo"
                            aria-label="Add photo"
                          >
                            Add media
                          </button>
                          <span className={styles.composeCount} aria-live="polite">
                            {composeText.length}/{POST_MAX_LENGTH}
                          </span>
                        </div>
                        <div className={styles.composeActions}>
                          <button type="button" className={styles.composeCancel} onClick={closeCompose} disabled={composePosting}>
                            Cancel
                          </button>
                          <button
                            type="submit"
                            className={styles.composeSubmit}
                            disabled={composePosting || (!composeText.trim() && composeImages.length === 0)}
                          >
                            {composePosting ? 'Posting…' : 'Post'}
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
        </>
      )}
    </div>
  )
}
