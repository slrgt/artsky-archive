import { useState, useRef, useEffect, useSyncExternalStore } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useSession } from '../context/SessionContext'
import { useTheme } from '../context/ThemeContext'
import { useViewMode, VIEW_LABELS, type ViewMode } from '../context/ViewModeContext'
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

function AccountIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  )
}

function ViewIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
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
  const { session, sessionsList, logout, switchAccount } = useSession()
  const { theme, setTheme } = useTheme()
  const { viewMode, setViewMode, viewOptions } = useViewMode()
  const path = loc.pathname
  const isDesktop = useSyncExternalStore(subscribeDesktop, getDesktopSnapshot, () => false)
  const [accountSheetOpen, setAccountSheetOpen] = useState(false)
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)
  const [viewMenuOpen, setViewMenuOpen] = useState(false)
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false)
  const [navVisible, setNavVisible] = useState(true)
  const lastScrollY = useRef(0)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const accountBtnRef = useRef<HTMLButtonElement>(null)
  const viewBtnRef = useRef<HTMLButtonElement>(null)
  const accountMenuRef = useRef<HTMLDivElement>(null)
  const viewMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    document.title = title ? `${title} · ArtSky` : 'ArtSky'
  }, [title])

  useEffect(() => {
    if (!viewMenuOpen && !accountMenuOpen) return
    const onDocClick = (e: MouseEvent) => {
      const t = e.target as Node
      if (
        viewMenuRef.current?.contains(t) || viewBtnRef.current?.contains(t) ||
        accountMenuRef.current?.contains(t) || accountBtnRef.current?.contains(t)
      ) return
      setViewMenuOpen(false)
      setAccountMenuOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [viewMenuOpen, accountMenuOpen])

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
      requestAnimationFrame(() => {
        requestAnimationFrame(() => searchInputRef.current?.focus())
      })
    }
  }

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
      <section className={styles.menuSection}>
        <span className={styles.menuSectionTitle}>Appearance</span>
        <div className={styles.menuRow}>
          {(['light', 'dark', 'system'] as const).map((t) => (
            <button
              key={t}
              type="button"
              className={theme === t ? styles.menuOptionActive : styles.menuOption}
              onClick={() => setTheme(t)}
            >
              {t === 'light' ? 'Light' : t === 'dark' ? 'Dark' : 'System'}
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
            >
              {VIEW_LABELS[m]}
            </button>
          ))}
        </div>
      </section>
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
    </>
  )

  return (
    <div className={styles.wrap}>
      <header className={styles.header}>
        {showNav && (
          <>
            <Link to="/feed" className={styles.logoLink} aria-label="ArtSky – back to feed">
              <img src={`${import.meta.env.BASE_URL || '/'}icon.svg`} alt="" className={styles.logoIcon} />
              <span className={styles.logoText}>ArtSky</span>
            </Link>
            <div className={styles.navTray} aria-label="Main">
              {navTrayItems}
            </div>
            <div className={styles.headerRight}>
              <div className={styles.headerBtnWrap}>
                <button
                  ref={viewBtnRef}
                  type="button"
                  className={styles.headerBtn}
                  onClick={() => setViewMenuOpen((o) => !o)}
                  aria-label="View mode"
                  aria-expanded={viewMenuOpen}
                >
                  <ViewIcon />
                </button>
                {viewMenuOpen && (
                  <div ref={viewMenuRef} className={styles.viewMenu} role="menu">
                    {(['1', '2', '3', '4', '5'] as ViewMode[]).map((m) => (
                      <button
                        key={m}
                        type="button"
                        role="menuitem"
                        className={viewMode === m ? styles.menuOptionActive : styles.menuOption}
                        onClick={() => { setViewMode(m); setViewMenuOpen(false) }}
                      >
                        {VIEW_LABELS[m]}
                      </button>
                    ))}
                  </div>
                )}
              </div>
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
            </div>
            <div className={styles.searchSlot}>
              <SearchBar inputRef={searchInputRef} compact={isDesktop} />
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
                  <SearchBar inputRef={searchInputRef} onClose={closeMobileSearch} />
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
                <div className={styles.accountPopupContent}>
                  <h2 className={styles.sheetTitle}>Account</h2>
                  {accountPanelContent}
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
