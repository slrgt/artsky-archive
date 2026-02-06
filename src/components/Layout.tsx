import { useState, useRef, useEffect, useSyncExternalStore } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useSession } from '../context/SessionContext'
import { useTheme } from '../context/ThemeContext'
import { useViewMode, VIEW_LABELS } from '../context/ViewModeContext'
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
  const [navVisible, setNavVisible] = useState(true)
  const lastScrollY = useRef(0)
  const searchInputRef = useRef<HTMLInputElement>(null)

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
    window.scrollTo({ top: 0, behavior: 'smooth' })
    setTimeout(() => searchInputRef.current?.focus(), 300)
  }

  async function handleSelectAccount(did: string) {
    const ok = await switchAccount(did)
    if (ok) setAccountSheetOpen(false)
  }

  function handleAddAccount() {
    setAccountSheetOpen(false)
    navigate('/login', { replace: true })
  }

  function handleLogout() {
    setAccountSheetOpen(false)
    logout()
    navigate('/login', { replace: true })
  }

  const navItems = (
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
      <button
        type="button"
        className={styles.navBtn}
        onClick={() => setAccountSheetOpen(true)}
        aria-label="Account and settings"
        aria-expanded={accountSheetOpen}
      >
        <span className={styles.navIcon}><AccountIcon /></span>
        <span className={styles.navLabel}>Account</span>
      </button>
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
              {navItems}
            </div>
            <h1 className={styles.title}>{title}</h1>
            <div className={styles.searchSlot}>
              <SearchBar inputRef={searchInputRef} compact={isDesktop} />
            </div>
          </>
        )}
        {!showNav && <h1 className={styles.title}>{title}</h1>}
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
          {accountSheetOpen && (
            <div
              className={styles.sheetBackdrop}
              onClick={() => setAccountSheetOpen(false)}
              aria-hidden
            />
          )}
          <div className={`${styles.sheet} ${accountSheetOpen ? styles.sheetOpen : ''}`} role="dialog" aria-label="Account and settings">
            <div className={styles.sheetHandle} />
            <div className={styles.sheetContent}>
              <h2 className={styles.sheetTitle}>Account</h2>

              <section className={styles.sheetSection}>
                <h3 className={styles.sheetSectionTitle}>Appearance</h3>
                <div className={styles.sheetRow}>
                  {(['light', 'dark', 'system'] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      className={theme === t ? styles.sheetOptionActive : styles.sheetOption}
                      onClick={() => setTheme(t)}
                    >
                      {t === 'light' ? 'Light' : t === 'dark' ? 'Dark' : 'System'}
                    </button>
                  ))}
                </div>
              </section>

              <section className={styles.sheetSection}>
                <h3 className={styles.sheetSectionTitle}>Columns</h3>
                <div className={styles.sheetRow}>
                  {viewOptions.map((m) => (
                    <button
                      key={m}
                      type="button"
                      className={viewMode === m ? styles.sheetOptionActive : styles.sheetOption}
                      onClick={() => setViewMode(m)}
                    >
                      {VIEW_LABELS[m]}
                    </button>
                  ))}
                </div>
              </section>

              {session && (
                <section className={styles.sheetSection}>
                  <h3 className={styles.sheetSectionTitle}>Accounts</h3>
                  {sessionsList.map((s) => (
                    <button
                      key={s.did}
                      type="button"
                      className={s.did === session?.did ? styles.sheetItemActive : styles.sheetItem}
                      onClick={() => handleSelectAccount(s.did)}
                    >
                      @{s.handle}
                      {s.did === session?.did && <span className={styles.sheetCheck} aria-hidden> ✓</span>}
                    </button>
                  ))}
                  <div className={styles.sheetActions}>
                    <button type="button" className={styles.sheetActionBtn} onClick={handleAddAccount}>
                      Add account
                    </button>
                    <button type="button" className={styles.sheetActionSecondary} onClick={handleLogout}>
                      Log out
                    </button>
                  </div>
                </section>
              )}

              {!session && (
                <section className={styles.sheetSection}>
                  <button type="button" className={styles.sheetActionBtn} onClick={() => { setAccountSheetOpen(false); navigate('/login'); }}>
                    Sign in
                  </button>
                </section>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
