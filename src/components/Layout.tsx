import { useState, useRef, useEffect, useMemo, useSyncExternalStore } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useSession } from '../context/SessionContext'
import { useTheme } from '../context/ThemeContext'
import { useViewMode, VIEW_LABELS } from '../context/ViewModeContext'
import { useArtOnly } from '../context/ArtOnlyContext'
import { publicAgent, createPost, getNotifications } from '../lib/bsky'
import SearchBar from './SearchBar'
import styles from './Layout.module.css'

interface Props {
  title: string
  children: React.ReactNode
  showNav?: boolean
  /** When false, hide the column view (1/2/3) button; use on pages like post detail where it doesn't apply. */
  showColumnView?: boolean
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

function ComposeIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 19l7-7 3 3-7 7-3-3z" />
      <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
      <path d="M2 2l7.586 7.586" />
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

export default function Layout({ title, children, showNav, showColumnView = true }: Props) {
  const loc = useLocation()
  const navigate = useNavigate()
  const { session, sessionsList, logout, switchAccount } = useSession()
  const [accountProfiles, setAccountProfiles] = useState<Record<string, { avatar?: string; handle?: string }>>({})
  const sessionsDidKey = useMemo(() => sessionsList.map((s) => s.did).sort().join(','), [sessionsList])

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
  }, [sessionsDidKey, sessionsList])
  const { theme, setTheme } = useTheme()
  const themeThumbTop = theme === 'light' ? '0' : theme === 'system' ? '33.333%' : '66.666%'
  const themeSwitchVertical = (
    <div className={styles.themeSwitchVertical} role="group" aria-label="Theme">
      <div className={styles.themeSwitchTrack}>
        <span className={styles.themeSwitchThumb} style={{ top: themeThumbTop }} aria-hidden />
        <button type="button" className={styles.themeSwitchZone} onClick={() => setTheme('light')} title="Light" aria-label="Light" aria-pressed={theme === 'light'} />
        <button type="button" className={styles.themeSwitchZone} onClick={() => setTheme('system')} title="Auto (system)" aria-label="Auto" aria-pressed={theme === 'system'} />
        <button type="button" className={styles.themeSwitchZone} onClick={() => setTheme('dark')} title="Dark" aria-label="Dark" aria-pressed={theme === 'dark'} />
      </div>
    </div>
  )
  const { viewMode, setViewMode, viewOptions } = useViewMode()
  const { artOnly, toggleArtOnly } = useArtOnly()
  const path = loc.pathname
  const isDesktop = useSyncExternalStore(subscribeDesktop, getDesktopSnapshot, () => false)
  const [accountSheetOpen, setAccountSheetOpen] = useState(false)
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [notifications, setNotifications] = useState<{ uri: string; author: { handle?: string; did: string; avatar?: string; displayName?: string }; reason: string; reasonSubject?: string; isRead: boolean; indexedAt: string }[]>([])
  const [notificationsLoading, setNotificationsLoading] = useState(false)
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false)
  const [composeOpen, setComposeOpen] = useState(false)
  const [composeText, setComposeText] = useState('')
  const [composePosting, setComposePosting] = useState(false)
  const [composeError, setComposeError] = useState<string | null>(null)
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
          searchInputRef.current?.focus()
        }, 100)
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

  function closeMobileSearch() {
    setMobileSearchOpen(false)
    searchInputRef.current?.blur()
  }

  function cycleViewMode() {
    if (isDesktop) {
      setViewMode(viewMode === '1' ? '2' : viewMode === '2' ? '3' : '1')
    } else {
      const idx = viewOptions.indexOf(viewMode)
      const next = (idx + 1) % viewOptions.length
      setViewMode(viewOptions[next])
    }
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
  }

  function closeCompose() {
    setComposeOpen(false)
    setComposeText('')
    setComposeError(null)
  }

  async function handleComposeSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!session || composePosting) return
    setComposeError(null)
    setComposePosting(true)
    try {
      await createPost(composeText)
      closeCompose()
      navigate('/feed')
    } catch (err) {
      setComposeError(err instanceof Error ? err.message : 'Failed to post')
    } finally {
      setComposePosting(false)
    }
  }

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
      <Link
        to="/artboards"
        className={path === '/artboards' ? styles.navActive : ''}
        aria-current={path === '/artboards' ? 'page' : undefined}
      >
        <span className={styles.navIcon}><ArtboardsIcon /></span>
        <span className={styles.navLabel}>Artboards</span>
      </Link>
      <button
        type="button"
        className={styles.navBtn}
        onClick={openCompose}
        aria-label="New post"
      >
        <span className={styles.navIcon}><ComposeIcon /></span>
        <span className={styles.navLabel}>Post</span>
      </button>
      <button type="button" className={styles.navBtn} onClick={focusSearch} aria-label="Search">
        <span className={styles.navIcon}><SearchIcon /></span>
        <span className={styles.navLabel}>Search</span>
      </button>
    </>
  )

  const navItems = (
    <>
      {navTrayItems}
      <button
        type="button"
        className={styles.navBtn}
        onClick={() => openAccountPanel()}
        aria-label="Account and settings"
        aria-expanded={accountSheetOpen || accountMenuOpen}
      >
        <span className={styles.navIcon}><AccountIcon /></span>
        <span className={styles.navLabel}>Account</span>
      </button>
    </>
  )

  const accountPanelContent = (
    <>
      {session && (
        <section className={styles.menuSection}>
          <span className={styles.menuSectionTitle}>Accounts</span>
          {sessionsList.map((s) => {
            const profile = accountProfiles[s.did]
            const handle = profile?.handle ?? (s as { handle?: string }).handle ?? s.did
            return (
              <button
                key={s.did}
                type="button"
                className={s.did === session?.did ? styles.menuItemActive : styles.menuItem}
                onClick={() => handleSelectAccount(s.did)}
              >
                {profile?.avatar ? (
                  <img src={profile.avatar} alt="" className={styles.accountMenuAvatar} />
                ) : (
                  <span className={styles.accountMenuAvatarPlaceholder} aria-hidden>{(handle || s.did).slice(0, 1).toUpperCase()}</span>
                )}
                <span>@{handle}</span>
                {s.did === session?.did && <span className={styles.sheetCheck} aria-hidden> ✓</span>}
              </button>
            )
          })}
          <div className={styles.menuActions}>
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
      <section className={styles.menuSection}>
        <span className={styles.menuSectionTitle}>Appearance</span>
        {themeSwitchVertical}
      </section>
      <section className={styles.menuSection}>
        <span className={styles.menuSectionTitle}>Columns</span>
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
      </section>
    </>
  )

  const accountPanelContentCompact = (
    <>
      {session && (
        <>
          <div className={styles.menuCompactAccounts}>
            {sessionsList.map((s) => {
              const profile = accountProfiles[s.did]
              const handle = profile?.handle ?? (s as { handle?: string }).handle ?? s.did
              return (
                <button
                  key={s.did}
                  type="button"
                  className={s.did === session?.did ? styles.menuCompactItemActive : styles.menuCompactItem}
                  onClick={() => handleSelectAccount(s.did)}
                  title={`@${handle}`}
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
        {themeSwitchVertical}
      </div>
      <div className={styles.menuCompactRow}>
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
    </>
  )

  return (
    <div className={`${styles.wrap} ${showNav ? styles.wrapWithHeader : ''}`}>
      <header className={`${styles.header} ${showNav && !session ? styles.headerLoggedOut : ''}`}>
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
                <Link to="/artboards" className={styles.headerArtboardsLink} aria-label="Artboards">
                  Artboards
                </Link>
              )}
            </div>
            <div className={styles.headerCenter}>
              <SearchBar inputRef={searchInputRef} compact={isDesktop} />
            </div>
            <div className={styles.headerRight}>
              {!session ? (
                <>
                  {showColumnView && (
                    <button
                      type="button"
                      className={styles.headerBtn}
                      onClick={cycleViewMode}
                      aria-label={`View: ${VIEW_LABELS[viewMode]}. Click to cycle.`}
                      title={VIEW_LABELS[viewMode]}
                    >
                      {viewMode === '1' && <Column1Icon />}
                      {viewMode === '2' && <Column2Icon />}
                      {viewMode === '3' && <Column3Icon />}
                    </button>
                  )}
                  {themeSwitchVertical}
                  <Link to="/login" className={styles.headerAuthLink}>
                    Log in
                  </Link>
                  <Link to="/login" state={{ mode: 'create' }} className={styles.headerAuthLinkPrimary}>
                    Create account
                  </Link>
                </>
              ) : (
                <>
              {isDesktop && (
                <button
                  type="button"
                  className={styles.headerBtn}
                  onClick={openCompose}
                  aria-label="New post"
                  title="New post"
                >
                  <ComposeIcon />
                </button>
              )}
              {showColumnView && (
                <button
                  type="button"
                  className={styles.headerBtn}
                  onClick={cycleViewMode}
                  aria-label={`View: ${VIEW_LABELS[viewMode]}. Click to cycle.`}
                  title={VIEW_LABELS[viewMode]}
                >
                  {viewMode === '1' && <Column1Icon />}
                  {viewMode === '2' && <Column2Icon />}
                  {viewMode === '3' && <Column3Icon />}
                </button>
              )}
              {themeSwitchVertical}
              {!isDesktop && (
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
                      {notificationsLoading ? (
                        <p className={styles.notificationsLoading}>Loading…</p>
                      ) : notifications.length === 0 ? (
                        <p className={styles.notificationsEmpty}>No notifications yet.</p>
                      ) : (
                        <ul className={styles.notificationsList}>
                          {notifications.map((n) => {
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
                                  onClick={() => setNotificationsOpen(false)}
                                >
                                  {n.author.avatar ? (
                                    <img src={n.author.avatar} alt="" className={styles.notificationAvatar} />
                                  ) : (
                                    <span className={styles.notificationAvatarPlaceholder} aria-hidden>{handle.slice(0, 1).toUpperCase()}</span>
                                  )}
                                  <span className={styles.notificationText}>
                                    <strong>@{handle}</strong> {reasonLabel}
                                  </span>
                                </Link>
                              </li>
                            )
                          })}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              )}
              <div className={styles.headerBtnWrap}>
                <button
                  ref={accountBtnRef}
                  type="button"
                  className={styles.headerBtn}
                  onClick={() => setAccountMenuOpen((o) => !o)}
                  aria-label="Account and settings"
                  aria-expanded={accountMenuOpen}
                >
                  <AccountIcon />
                </button>
                {accountMenuOpen && (
                  <div ref={accountMenuRef} className={styles.accountMenu} role="menu" aria-label="Account and settings">
                    <h2 className={styles.menuTitle}>Account</h2>
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
                className={`${styles.searchOverlayCenter} ${styles.searchOverlayAboveKeyboard}`}
                role="dialog"
                aria-label="Search"
                style={{ bottom: searchOverlayBottom }}
              >
                <div className={styles.searchOverlayCard}>
                  <SearchBar inputRef={searchInputRef} onClose={closeMobileSearch} suggestionsAbove />
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
              <div className={styles.accountPopup} role="dialog" aria-label="Account and settings">
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
              <div className={styles.composeOverlay} role="dialog" aria-label="New post">
                <div className={styles.composeCard}>
                  <h2 className={styles.composeTitle}>New post</h2>
                  {!session ? (
                    <p className={styles.composeSignIn}>
                      <Link to="/login" onClick={closeCompose}>Sign in</Link> to post.
                    </p>
                  ) : (
                    <form onSubmit={handleComposeSubmit}>
                      <textarea
                        className={styles.composeTextarea}
                        value={composeText}
                        onChange={(e) => setComposeText(e.target.value.slice(0, POST_MAX_LENGTH))}
                        placeholder="What's on your mind?"
                        rows={4}
                        maxLength={POST_MAX_LENGTH}
                        disabled={composePosting}
                        autoFocus
                      />
                      <div className={styles.composeFooter}>
                        <span className={styles.composeCount} aria-live="polite">
                          {composeText.length}/{POST_MAX_LENGTH}
                        </span>
                        <div className={styles.composeActions}>
                          <button type="button" className={styles.composeCancel} onClick={closeCompose} disabled={composePosting}>
                            Cancel
                          </button>
                          <button type="submit" className={styles.composeSubmit} disabled={composePosting || !composeText.trim()}>
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
