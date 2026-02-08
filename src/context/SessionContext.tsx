import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { Agent } from '@atproto/api'
import type { AtpSessionData } from '@atproto/api'
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

/** GitHub repo for the app (e.g. source of GitHub Pages build). */
const GITHUB_REPO_URL = 'https://github.com/slrgt/artsky'

function isLocalhost(): boolean {
  if (typeof window === 'undefined') return false
  return window.location.hostname === 'localhost'
}

function getInitialSession(): AtpSessionData | null {
  try {
    return bsky.getSession()
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
    const maxWaitMs = 2500
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
        try {
          const search = typeof window !== 'undefined' ? window.location.search : ''
          const params = new URLSearchParams(search)
          const hasCallback = params.has('state') && (params.has('code') || params.has('error'))
          const waitMs = hasCallback ? 12_000 : oauthTimeoutMs
          const oauthAccounts = bsky.getOAuthAccountsSnapshot()
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
        } catch {
          // OAuth init failed; fall back to credential
        }
      }
      const ok = await Promise.race([
        bsky.resumeSession(),
        new Promise<boolean>((resolve) => setTimeout(() => resolve(false), maxWaitMs - 500)),
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
            padding: '2rem',
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
          Loading…
          <a
            href={GITHUB_REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: 'var(--accent, #7c3aed)',
              fontSize: '0.9rem',
            }}
          >
            View on GitHub
          </a>
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
