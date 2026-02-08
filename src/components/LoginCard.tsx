import { useState, useEffect, useRef, useCallback, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { useSession } from '../context/SessionContext'
import * as bsky from '../lib/bsky'
import * as oauth from '../lib/oauth'
import type { AppBskyActorDefs } from '@atproto/api'
import styles from '../pages/LoginPage.module.css'

const BLUESKY_SIGNUP_URL = 'https://bsky.app'
const DEBOUNCE_MS = 250

/** Turn technical login/OAuth errors into messages users can understand. */
function toFriendlyLoginError(err: unknown, context: 'app-password' | 'oauth'): string {
  const raw =
    err && typeof err === 'object' && 'message' in err
      ? String((err as { message: string }).message)
      : ''
  const lower = raw.toLowerCase()
  if (lower.includes('loopback') || lower.includes('path component') || lower.includes('client id')) {
    return context === 'oauth'
      ? "Sign-in with Bluesky isn't available from this page address. Try opening the app from its main URL, or use an App Password to log in instead."
      : "We couldn't complete sign-in from this address. Try opening the app from its main URL."
  }
  if (lower.includes('network') || lower.includes('fetch') || lower.includes('failed to fetch')) {
    return 'Connection problem. Check your internet and try again.'
  }
  if (lower.includes('invalid') && (lower.includes('password') || lower.includes('credentials'))) {
    return 'Wrong handle or password. Check your Bluesky handle (or email) and App Password.'
  }
  if (lower.includes('invalid') || lower.includes('unauthorized')) {
    return context === 'app-password'
      ? 'Wrong handle or App Password. Get an App Password from Bluesky: Settings → App passwords.'
      : "We couldn't verify your account. Check your handle and try again, or use an App Password to log in."
  }
  if (raw) return raw
  return context === 'app-password'
    ? 'Log in failed. Use your Bluesky handle (or email) and an App Password from Settings → App passwords.'
    : "Could not start sign-in. Check your handle and try again, or use an App Password to log in."
}

export type LoginMode = 'signin' | 'create'

export interface LoginCardProps {
  /** Initial tab (signin vs create). Updates when prop changes. */
  initialMode?: LoginMode
  /** Called after successful login or account creation. */
  onSuccess?: () => void
  /** When provided, shows a close button in the top-left of the card (e.g. in modal). */
  onClose?: () => void
}

export default function LoginCard({ initialMode = 'signin', onSuccess, onClose }: LoginCardProps) {
  const { login, refreshSession } = useSession()
  const [mode, setMode] = useState<LoginMode>(initialMode)
  useEffect(() => {
    setMode(initialMode)
  }, [initialMode])

  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [showAppPassword, setShowAppPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const [suggestions, setSuggestions] = useState<AppBskyActorDefs.ProfileViewBasic[]>([])
  const [suggestionsOpen, setSuggestionsOpen] = useState(false)
  const [suggestionsLoading, setSuggestionsLoading] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const [dropdownPosition, setDropdownPosition] = useState<{ top: number; left: number; width: number } | null>(null)

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

  useLayoutEffect(() => {
    if (!suggestionsOpen || !(suggestions.length > 0 || suggestionsLoading)) {
      setDropdownPosition(null)
      return
    }
    const el = wrapperRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    setDropdownPosition({
      top: rect.bottom + 2,
      left: rect.left,
      width: rect.width,
    })
  }, [suggestionsOpen, suggestions.length, suggestionsLoading])

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
    const id = identifier.trim().replace(/^@/, '')
    if (!id) return

    if (password.trim()) {
      setLoading(true)
      try {
        await login(id, password)
        onSuccess?.()
      } catch (err: unknown) {
        setError(toFriendlyLoginError(err, 'app-password'))
      } finally {
        setLoading(false)
      }
      return
    }

    // No password: sign in with Bluesky (OAuth redirect)
    setLoading(true)
    try {
      await oauth.signInWithOAuthRedirect(id)
      onSuccess?.()
    } catch (err: unknown) {
      setError(toFriendlyLoginError(err, 'oauth'))
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
      onSuccess?.()
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
          ? 'Account creation now requires verification on Bluesky. Please create your account on the Bluesky website or app, then log in here with an App Password.'
          : message
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.card}>
      {onClose && (
        <button
          type="button"
          className={styles.cardCloseBtn}
          onClick={onClose}
          aria-label="Close"
        >
          ×
        </button>
      )}
      <div className={onClose ? styles.cardContentWithClose : undefined}>
      <h1 className={styles.title}>ArtSky</h1>
      <p className={styles.subtitle}>Bluesky feed & collections</p>

      {mode === 'create' && (
        <div className={styles.tabs} role="tablist" aria-label="Create account or log in">
          <button
            type="button"
            role="tab"
            className={styles.tab}
            onClick={() => {
              setMode('signin')
              setError('')
            }}
          >
            Log in
          </button>
          <span className={`${styles.tab} ${styles.tabActive}`} role="tab" aria-selected id="tab-create">
            Create Account
          </span>
        </div>
      )}

      {mode === 'signin' ? (
        <form id="signin-panel" onSubmit={handleSignIn} className={styles.form} aria-label="Log in">
          <div ref={wrapperRef} className={styles.inputWrap}>
            <label htmlFor="login-identifier" className={styles.srOnly}>
              username.bsky.social or email
            </label>
            <input
              id="login-identifier"
              type="text"
              placeholder="username.bsky.social or email"
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
              aria-describedby={error ? 'login-error' : undefined}
            />
          </div>
          {dropdownPosition &&
            createPortal(
              <div
                className={styles.suggestionsPortal}
                style={{
                  position: 'fixed',
                  top: dropdownPosition.top,
                  left: dropdownPosition.left,
                  width: dropdownPosition.width,
                  zIndex: 202,
                }}
              >
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
                          <img src={actor.avatar} alt="" className={styles.suggestionAvatar} loading="lazy" />
                        )}
                        <div className={styles.suggestionText}>
                          {actor.displayName && (
                            <span className={styles.suggestionDisplayName}>{actor.displayName}</span>
                          )}
                          <span className={styles.suggestionHandle}>@{actor.handle}</span>
                        </div>
                      </li>
                    ))
                  )}
                </ul>
              </div>,
              document.body
            )}
          {showAppPassword && (
            <>
              <label htmlFor="login-password" className={styles.srOnly}>
                App password
              </label>
              <input
                id="login-password"
                type="password"
                placeholder="App password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={styles.input}
                autoComplete="current-password"
                aria-describedby={error ? 'login-error login-app-password-hint' : 'login-app-password-hint'}
              />
              <p id="login-app-password-hint" className={styles.hint}>
                Create an App Password in Bluesky: Settings → App passwords, then enter it above.
              </p>
            </>
          )}
          {error && <p id="login-error" className={styles.error} role="alert">{error}</p>}
          <button type="submit" className={styles.button} disabled={loading}>
            {loading ? 'Logging in…' : password.trim() ? 'Log in' : 'Log in with Bluesky'}
          </button>
          {!showAppPassword ? (
            <button
              type="button"
              className={styles.buttonSecondary}
              onClick={() => setShowAppPassword(true)}
            >
              or use your app password
            </button>
          ) : null}
          <a
            href={BLUESKY_SIGNUP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.signupLink}
          >
            Create account
          </a>
        </form>
      ) : (
        <form id="create-panel" onSubmit={handleCreateAccount} className={styles.form} aria-label="Create account" role="tabpanel" aria-labelledby="tab-create">
          <label htmlFor="create-email" className={styles.srOnly}>Email</label>
          <input
            id="create-email"
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={styles.input}
            autoComplete="email"
            required
          />
          <label htmlFor="create-handle" className={styles.srOnly}>Handle (e.g. you.bsky.social)</label>
          <input
            id="create-handle"
            type="text"
            placeholder="Handle (e.g. you.bsky.social)"
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            className={styles.input}
            autoComplete="username"
            required
          />
          <label htmlFor="create-password" className={styles.srOnly}>Password</label>
          <input
            id="create-password"
            type="password"
            placeholder="Password"
            value={createPassword}
            onChange={(e) => setCreatePassword(e.target.value)}
            className={styles.input}
            autoComplete="new-password"
            required
            minLength={8}
            aria-describedby={error ? 'create-error' : undefined}
          />
          {error && <p id="create-error" className={styles.error} role="alert">{error}</p>}
          <button type="submit" className={styles.button} disabled={loading}>
            {loading ? 'Creating account…' : 'Create account'}
          </button>
          <p className={styles.hint}>
            Bluesky now requires verification to create accounts. Create your account on the Bluesky website or app,
            then return here to log in with an App Password.
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
