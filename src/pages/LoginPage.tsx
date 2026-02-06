import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useSession } from '../context/SessionContext'
import * as bsky from '../lib/bsky'
import type { AppBskyActorDefs } from '@atproto/api'
import styles from './LoginPage.module.css'

const BLUESKY_SIGNIN_URL = 'https://bsky.app/signin'
const BLUESKY_SIGNUP_URL = 'https://bsky.app/signup'
const DEBOUNCE_MS = 250

type Mode = 'signin' | 'create'

export default function LoginPage() {
  const { login, refreshSession } = useSession()
  const navigate = useNavigate()
  const location = useLocation()
  const locationMode = (location.state as { mode?: Mode })?.mode
  const [mode, setMode] = useState<Mode>(locationMode ?? 'signin')
  useEffect(() => {
    if (locationMode === 'signin' || locationMode === 'create') setMode(locationMode)
  }, [locationMode])

  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const [suggestions, setSuggestions] = useState<AppBskyActorDefs.ProfileViewBasic[]>([])
  const [suggestionsOpen, setSuggestionsOpen] = useState(false)
  const [suggestionsLoading, setSuggestionsLoading] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const wrapperRef = useRef<HTMLDivElement>(null)

  const [email, setEmail] = useState('')
  const [handle, setHandle] = useState('')
  const [createPassword, setCreatePassword] = useState('')

  const fetchSuggestions = useCallback(async (q: string) => {
    const term = q.trim().replace(/^@/, '')
    if (!term || term.length < 2) {
      setSuggestions([])
      return
    }
    setSuggestionsLoading(true)
    try {
      const res = await bsky.searchActorsTypeahead(term, 8)
      setSuggestions(res.actors ?? [])
      setActiveIndex(0)
    } catch {
      setSuggestions([])
    } finally {
      setSuggestionsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (identifier.trim().replace(/^@/, '').length < 2) {
      setSuggestions([])
      setSuggestionsOpen(false)
      return
    }
    const t = setTimeout(() => fetchSuggestions(identifier), DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [identifier, fetchSuggestions])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setSuggestionsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    const id = identifier.trim()
    if (!id) return

    if (!password.trim()) {
      setError(
        'Enter an App Password to sign in here (Bluesky Settings → App passwords), or use the link below to sign in on Bluesky.',
      )
      return
    }

    setLoading(true)
    try {
      await login(id, password)
      navigate('/feed', { replace: true })
    } catch (err: unknown) {
      const message =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message: string }).message)
          : 'Sign in failed. Use your Bluesky handle (or email) and an App Password from Settings → App passwords.'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  async function handleCreateAccount(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await bsky.createAccount({
        email: email.trim(),
        password: createPassword,
        handle: handle.trim().toLowerCase().replace(/^@/, ''),
      })
      refreshSession()
      navigate('/feed', { replace: true })
    } catch (err: unknown) {
      const message =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message: string }).message)
          : 'Could not create account. Check that the handle is available.'
      const isVerificationRequired =
        typeof message === 'string' &&
        (message.toLowerCase().includes('verification') || message.toLowerCase().includes('latest version'))
      setError(
        isVerificationRequired
          ? 'Account creation now requires verification on Bluesky. Please create your account on the Bluesky website or app, then sign in here with an App Password.'
          : message
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.card}>
        <h1 className={styles.title}>ArtSky</h1>
        <p className={styles.subtitle}>Bluesky feed & artboards</p>

        <div className={styles.tabs}>
          <button
            type="button"
            className={mode === 'signin' ? styles.tabActive : styles.tab}
            onClick={() => {
              setMode('signin')
              setError('')
            }}
          >
            Sign in
          </button>
          <button
            type="button"
            className={mode === 'create' ? styles.tabActive : styles.tab}
            onClick={() => {
              setMode('create')
              setError('')
            }}
          >
            Create account
          </button>
        </div>

        {mode === 'signin' ? (
          <form onSubmit={handleSignIn} className={styles.form}>
            <div ref={wrapperRef} className={styles.inputWrap}>
              <input
                type="text"
                placeholder="Handle or email"
                value={identifier}
                onChange={(e) => {
                  setIdentifier(e.target.value)
                  setSuggestionsOpen(true)
                }}
                onFocus={() => suggestions.length > 0 && setSuggestionsOpen(true)}
                onKeyDown={(e) => {
                  if (!suggestionsOpen || suggestions.length === 0) return
                  if (e.key === 'ArrowDown') {
                    e.preventDefault()
                    setActiveIndex((i) => (i + 1) % suggestions.length)
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault()
                    setActiveIndex((i) => (i - 1 + suggestions.length) % suggestions.length)
                  } else if (e.key === 'Enter' && suggestions[activeIndex]) {
                    e.preventDefault()
                    const h = suggestions[activeIndex].handle
                    setIdentifier(h ?? '')
                    setSuggestionsOpen(false)
                  } else if (e.key === 'Escape') {
                    setSuggestionsOpen(false)
                  }
                }}
                className={styles.input}
                autoComplete="username"
                required
              />
              {suggestionsOpen && (suggestions.length > 0 || suggestionsLoading) && (
                <ul className={styles.suggestions} role="listbox">
                  {suggestionsLoading && suggestions.length === 0 ? (
                    <li className={styles.suggestion} role="option" aria-disabled>
                      <span className={styles.suggestionsLoading}>Searching…</span>
                    </li>
                  ) : (
                    suggestions.map((actor, i) => (
                      <li
                        key={actor.did}
                        role="option"
                        aria-selected={i === activeIndex}
                        className={i === activeIndex ? styles.suggestionActive : styles.suggestion}
                        onMouseDown={(e) => {
                          e.preventDefault()
                          setIdentifier(actor.handle ?? '')
                          setSuggestionsOpen(false)
                        }}
                      >
                        {actor.avatar && (
                          <img src={actor.avatar} alt="" className={styles.suggestionAvatar} />
                        )}
                        <span className={styles.suggestionHandle}>@{actor.handle}</span>
                        {actor.displayName && (
                          <span className={styles.suggestionName}>{actor.displayName}</span>
                        )}
                      </li>
                    ))
                  )}
                </ul>
              )}
            </div>
            <input
              type="password"
              placeholder="App password (optional — leave blank to sign in with Bluesky)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={styles.input}
              autoComplete="current-password"
            />
            {error && <p className={styles.error}>{error}</p>}
            <button type="submit" className={styles.button} disabled={loading}>
              {password.trim() ? (loading ? 'Signing in…' : 'Sign in') : 'Sign in with Bluesky'}
            </button>
            <p className={styles.hint}>
              Create an App Password in Bluesky: Settings → App passwords, then enter it above.
            </p>
            <a
              href={BLUESKY_SIGNIN_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.signupLink}
            >
              Sign in on Bluesky →
            </a>
          </form>
        ) : (
          <form onSubmit={handleCreateAccount} className={styles.form}>
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={styles.input}
              autoComplete="email"
              required
            />
            <input
              type="text"
              placeholder="Handle (e.g. you.bsky.social)"
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              className={styles.input}
              autoComplete="username"
              required
            />
            <input
              type="password"
              placeholder="Password"
              value={createPassword}
              onChange={(e) => setCreatePassword(e.target.value)}
              className={styles.input}
              autoComplete="new-password"
              required
              minLength={8}
            />
            {error && <p className={styles.error}>{error}</p>}
            <button type="submit" className={styles.button} disabled={loading}>
              {loading ? 'Creating account…' : 'Create account'}
            </button>
            <p className={styles.hint}>
              Bluesky now requires verification to create accounts. Create your account on the Bluesky website or app,
              then return here to sign in with an App Password.
            </p>
            <a
              href={BLUESKY_SIGNUP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.signupLink}
            >
              Create account on Bluesky →
            </a>
          </form>
        )}
      </div>
    </div>
  )
}
