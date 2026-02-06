import { useState, useRef, useEffect, useSyncExternalStore } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useSession } from '../context/SessionContext'
import { useTheme } from '../context/ThemeContext'
import { useViewMode, VIEW_LABELS } from '../context/ViewModeContext'
import { useArtOnly } from '../context/ArtOnlyContext'
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

function SunIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  )
}
function MoonIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  )
}
function SystemIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 21h8M12 17v4" />
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
function PersonIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
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
  const { theme, setTheme } = useTheme()
  const { viewMode, setViewMode, viewOptions } = useViewMode()
  const { artOnly, toggleArtOnly } = useArtOnly()
  const path = loc.pathname
  const isDesktop = useSyncExternalStore(subscribeDesktop, getDesktopSnapshot, () => false)
  const [accountSheetOpen, setAccountSheetOpen] = useState(false)
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false)
  const [navVisible, setNavVisible] = useState(true)
  const lastScrollY = useRef(0)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const accountBtnRef = useRef<HTMLButtonElement>(null)
  const accountMenuRef = useRef<HTMLDivElement>(null)

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
      setTimeout(() => searchInputRef.current?.focus(), 150)
    }
  }

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
          {sessionsList.map((s) => (
            <button
              key={s.did}
              type="button"
              className={s.did === session?.did ? styles.menuItemActive : styles.menuItem}
              onClick={() => handleSelectAccount(s.did)}
            >
              @{s.handle}
              {s.did === session?.did && <span className={styles.sheetCheck} aria-hidden> ✓</span>}
            </button>
          ))}
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
        <div className={styles.menuRow}>
          {(['light', 'dark', 'system'] as const).map((t) => (
            <button
              key={t}
              type="button"
              className={theme === t ? styles.menuOptionActive : styles.menuOption}
              onClick={() => setTheme(t)}
              title={t === 'light' ? 'Light' : t === 'dark' ? 'Dark' : 'System'}
              aria-label={t === 'light' ? 'Light' : t === 'dark' ? 'Dark' : 'System'}
            >
              {t === 'light' ? <SunIcon /> : t === 'dark' ? <MoonIcon /> : <SystemIcon />}
            </button>
          ))}
        </div>
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
            {sessionsList.map((s) => (
              <button
                key={s.did}
                type="button"
                className={s.did === session?.did ? styles.menuCompactItemActive : styles.menuCompactItem}
                onClick={() => handleSelectAccount(s.did)}
                title={`@${s.handle}`}
              >
                <PersonIcon />
                <span className={styles.menuCompactHandle}>@{s.handle}</span>
              </button>
            ))}
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
        {(['light', 'dark', 'system'] as const).map((t) => (
          <button
            key={t}
            type="button"
            className={theme === t ? styles.menuCompactBtnActive : styles.menuCompactBtn}
            onClick={() => setTheme(t)}
            title={t === 'light' ? 'Light' : t === 'dark' ? 'Dark' : 'System'}
            aria-label={t === 'light' ? 'Light' : t === 'dark' ? 'Dark' : 'System'}
          >
            {t === 'light' ? <SunIcon /> : t === 'dark' ? <MoonIcon /> : <SystemIcon />}
          </button>
        ))}
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
              <Link to="/feed" className={styles.logoLink} aria-label="ArtSky – back to feed">
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
                  <Link to="/login" className={styles.headerAuthLink}>
                    Log in
                  </Link>
                  <Link to="/login" state={{ mode: 'create' }} className={styles.headerAuthLinkPrimary}>
                    Create account
                  </Link>
                </>
              ) : (
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
              <div className={styles.searchOverlayCenter} role="dialog" aria-label="Search">
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
        </>
      )}
    </div>
  )
}
