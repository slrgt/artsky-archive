import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { Agent } from '@atproto/api'
import type { AtpSessionData } from '@atproto/api'
import { REPO_URL } from '../config/repo'
import * as bsky from '../lib/bsky'
import * as oauth from '../lib/oauth'

interface SessionContextValue {
  session: AtpSessionData | null
  sessionsList: AtpSessionData[]
  loading: boolean
  login: (identifier: string, password: string) => Promise<void>
  logout: () => Promise<void>
  switchAccount: (did: string) => Promise<boolean>
  refreshSession: () => void
}

const SessionContext = createContext<SessionContextValue | null>(null)

function isLocalhost(): boolean {
  if (typeof window === 'undefined') return false
  return window.location.hostname === 'localhost'
}

function getInitialSession(): AtpSessionData | null {
  try {
    const fromAgent = bsky.getSession()
    if (fromAgent?.accessJwt) return fromAgent
    return bsky.getStoredSession()
  } catch {
    return null
  }
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  // Show the app immediately; never block on a loading screen so localhost always loads
  const [session, setSession] = useState<AtpSessionData | null>(getInitialSession)
  const [loading] = useState(false)

  useEffect(() => {
    let cancelled = false
    const maxWaitMs = 6000
    const oauthTimeoutMs = 1500

    const finish = (ok: boolean) => {
      if (cancelled) return
      try {
        setSession(ok ? bsky.getSession() : null)
      } catch {
        setSession(null)
      }
    }

    async function init() {
      // On localhost, skip OAuth init so the app doesn't redirect to 127.0.0.1 (library behavior).
      if (!isLocalhost()) {
        const oauthAccounts = bsky.getOAuthAccountsSnapshot()
        try {
          const search = typeof window !== 'undefined' ? window.location.search : ''
          const params = new URLSearchParams(search)
          const hasCallback = params.has('state') && (params.has('code') || params.has('error'))
          const waitMs = hasCallback ? 12_000 : oauthTimeoutMs
          const oauthResult = await Promise.race([
            oauth.initOAuth({
              hasCallback,
              preferredRestoreDid: !hasCallback ? oauthAccounts.activeDid ?? undefined : undefined,
            }),
            new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), waitMs)),
          ])
          if (cancelled) return
          if (oauthResult?.session) {
            bsky.addOAuthDid(oauthResult.session.did)
            const agent = new Agent(oauthResult.session)
            bsky.setOAuthAgent(agent, oauthResult.session)
            finish(true)
            return
          }
        } catch (err) {
          // If session was deleted elsewhere (e.g. another tab/device), clear it so user can sign in again
          const msg = err instanceof Error ? err.message : String(err)
          if (/session was deleted|TokenRefreshError/i.test(msg) && oauthAccounts.activeDid) {
            bsky.removeOAuthDid(oauthAccounts.activeDid)
          }
          // OAuth init failed; fall back to credential
        }
      }
      const ok = await Promise.race([
        bsky.resumeSession(),
        new Promise<boolean>((resolve) => setTimeout(() => resolve(false), maxWaitMs)),
      ])
      finish(ok)
    }
    init().catch(() => finish(false))

    return () => {
      cancelled = true
    }
  }, [])

  const login = useCallback(async (identifier: string, password: string) => {
    await bsky.login(identifier, password)
    setSession(bsky.getSession())
  }, [])

  const logout = useCallback(async () => {
    const stillLoggedIn = await bsky.logoutCurrentAccount()
    setSession(stillLoggedIn ? bsky.getSession() : null)
  }, [])

  const switchAccount = useCallback(async (did: string) => {
    const ok = await bsky.switchAccount(did)
    if (ok) setSession(bsky.getSession())
    return ok
  }, [])

  const refreshSession = useCallback(() => {
    setSession(bsky.getSession())
  }, [])

  let sessionsList: AtpSessionData[] = []
  try {
    sessionsList = bsky.getSessionsList()
  } catch {
    // localStorage or bsky not ready yet
  }

  const value: SessionContextValue = {
    session,
    sessionsList,
    loading,
    login,
    logout,
    switchAccount,
    refreshSession,
  }

  return (
    <SessionContext.Provider value={value}>
      {loading ? (
        <div
          style={{
            margin: 0,
            padding: '2rem 1.5rem',
            textAlign: 'center',
            minHeight: '100dvh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '1rem',
            background: 'var(--bg, #0f0f1a)',
            color: 'var(--text, #e8e8f0)',
            fontFamily: 'system-ui, sans-serif',
            fontSize: '1rem',
          }}
          aria-live="polite"
          aria-busy="true"
        >
          <p style={{ margin: 0, fontSize: '1rem' }}>Loading…</p>
          <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--muted, #888)' }}>
            Try refreshing the page. Check the browser console for details.
          </p>
          <p style={{ margin: 0 }}>
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{
                padding: '0.5rem 1rem',
                fontSize: '0.95rem',
                cursor: 'pointer',
                background: 'var(--accent, #7c3aed)',
                color: 'var(--bg, #0f0f1a)',
                border: 'none',
                borderRadius: 6,
                fontWeight: 500,
              }}
            >
              Refresh
            </button>
          </p>
          <p style={{ margin: 0, fontSize: '0.9rem' }}>
            <a
              href={REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                color: 'var(--muted, #888)',
                textDecoration: 'none',
                fontSize: '0.9rem',
              }}
              title="View source"
            >
              <svg width="20" height="20" viewBox="0 0 92 92" fill="none" aria-hidden style={{ flexShrink: 0 }}>
                <path
                  fill="#f03c2e"
                  fillRule="nonzero"
                  d="M90.156 41.965 50.036 1.848a5.918 5.918 0 0 0-8.372 0l-8.328 8.332 10.566 10.566a7.03 7.03 0 0 1 7.23 1.684 7.034 7.034 0 0 1 1.669 7.277l10.187 10.184a7.028 7.028 0 0 1 7.278 1.672 7.04 7.04 0 0 1 0 9.957 7.05 7.05 0 0 1-9.965 0 7.044 7.044 0 0 1-1.528-7.66l-9.5-9.497V59.36a7.04 7.04 0 0 1 1.86 11.29 7.04 7.04 0 0 1-9.957 0 7.04 7.04 0 0 1 0-9.958 7.06 7.06 0 0 1 2.304-1.539V33.926a7.049 7.049 0 0 1-3.82-9.234L29.242 14.272 1.73 41.777a5.925 5.925 0 0 0 0 8.371L41.852 90.27a5.925 5.925 0 0 0 8.37 0l39.934-39.934a5.925 5.925 0 0 0 0-8.371"
                />
              </svg>
              View source
            </a>
          </p>
        </div>
      ) : (
        children
      )}
    </SessionContext.Provider>
  )
}

export function useSession() {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession must be used within SessionProvider')
  return ctx
}
