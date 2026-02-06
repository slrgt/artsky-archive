import { useState, useRef, useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useSession } from '../context/SessionContext'
import { useViewMode } from '../context/ViewModeContext'
import SearchBar from './SearchBar'
import styles from './Layout.module.css'

interface Props {
  title: string
  children: React.ReactNode
  showNav?: boolean
}

export default function Layout({ title, children, showNav }: Props) {
  const loc = useLocation()
  const navigate = useNavigate()
  const { session, sessionsList, logout, switchAccount } = useSession()
  const path = loc.pathname
  const { viewMode, setViewMode, viewOptions } = useViewMode()
  const [viewMenuOpen, setViewMenuOpen] = useState(false)
  const viewMenuRef = useRef<HTMLDivElement>(null)
  const [accountOpen, setAccountOpen] = useState(false)
  const accountRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!viewMenuOpen) return
    function onDocClick(e: MouseEvent) {
      if (viewMenuRef.current && !viewMenuRef.current.contains(e.target as Node)) setViewMenuOpen(false)
    }
    document.addEventListener('click', onDocClick)
    return () => document.removeEventListener('click', onDocClick)
  }, [viewMenuOpen])

  useEffect(() => {
    if (!accountOpen) return
    function onDocClick(e: MouseEvent) {
      if (accountRef.current && !accountRef.current.contains(e.target as Node)) {
        setAccountOpen(false)
      }
    }
    document.addEventListener('click', onDocClick)
    return () => document.removeEventListener('click', onDocClick)
  }, [accountOpen])

  async function handleSelectAccount(did: string) {
    const ok = await switchAccount(did)
    if (ok) setAccountOpen(false)
  }

  function handleAddAccount() {
    setAccountOpen(false)
    navigate('/login', { replace: true })
  }

  function handleLogout() {
    setAccountOpen(false)
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className={styles.wrap}>
      <header className={styles.header}>
        {showNav && (
          <Link to="/feed" className={styles.logoLink} aria-label="ArtSky – back to feed">
            <img src={`${import.meta.env.BASE_URL || '/'}icon.svg`} alt="" className={styles.logoIcon} />
            <span className={styles.logoText}>ArtSky</span>
          </Link>
        )}
        {showNav && (
          <div className={styles.searchSlot}>
            <SearchBar />
          </div>
        )}
        <h1 className={styles.title}>{title}</h1>
        {showNav && (
          <div className={styles.viewWrap} ref={viewMenuRef}>
            <button
              type="button"
              className={styles.viewModeBtn}
              onClick={() => setViewMenuOpen((o) => !o)}
              aria-expanded={viewMenuOpen}
              aria-haspopup="true"
              title="View size"
            >
              View {viewMode} ▾
            </button>
            {viewMenuOpen && (
              <div className={styles.viewDropdown}>
                {viewOptions.map((m) => (
                  <button
                    key={m}
                    type="button"
                    className={m === viewMode ? styles.viewOptionActive : styles.viewOption}
                    onClick={() => { setViewMode(m); setViewMenuOpen(false); }}
                  >
                    View {m} {m === '1' ? '(smallest)' : m === '5' ? '(largest)' : ''}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {showNav && session && (
          <div className={styles.accountWrap} ref={accountRef}>
            <button
              type="button"
              className={styles.accountBtn}
              onClick={() => setAccountOpen((o) => !o)}
              aria-expanded={accountOpen}
              aria-haspopup="true"
              title="Account"
            >
              Account
            </button>
            {accountOpen && (
              <div className={styles.accountDropdown}>
                <p className={styles.accountDropdownTitle}>Accounts</p>
                {sessionsList.map((s) => (
                  <button
                    key={s.did}
                    type="button"
                    className={s.did === session?.did ? styles.accountItemActive : styles.accountItem}
                    onClick={() => handleSelectAccount(s.did)}
                  >
                    @{s.handle}
                    {s.did === session?.did && <span className={styles.accountCheck} aria-hidden> ✓</span>}
                  </button>
                ))}
                <div className={styles.accountDropdownActions}>
                  <button type="button" className={styles.accountAdd} onClick={handleAddAccount}>
                    Add account
                  </button>
                  <button type="button" className={styles.accountSwitch} onClick={handleLogout}>
                    Log out
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </header>
      <main className={styles.main}>
        {children}
      </main>
      {showNav && (
        <nav className={styles.nav} aria-label="Main">
          <Link
            to="/feed"
            className={path === '/feed' ? styles.navActive : ''}
            aria-current={path === '/feed' ? 'page' : undefined}
          >
            Feed
          </Link>
          <Link
            to="/artboards"
            className={path === '/artboards' ? styles.navActive : ''}
            aria-current={path === '/artboards' ? 'page' : undefined}
          >
            Artboards
          </Link>
        </nav>
      )}
    </div>
  )
}
