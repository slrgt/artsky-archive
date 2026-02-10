// ArtSky – Bluesky client focused on art (deploy bump)
import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { HashRouter, Navigate, Route, Routes, useParams } from 'react-router-dom'
import { REPO_URL } from './config/repo'
import * as bsky from './lib/bsky'
import { SessionProvider } from './context/SessionContext'
import { ThemeProvider } from './context/ThemeContext'
import { ViewModeProvider } from './context/ViewModeContext'
import { ArtOnlyProvider } from './context/ArtOnlyContext'
import { MediaOnlyProvider } from './context/MediaOnlyContext'
import { FeedMixProvider } from './context/FeedMixContext'
import { ModalExpandProvider } from './context/ModalExpandContext'
import { ProfileModalProvider } from './context/ProfileModalContext'
import { LoginModalProvider } from './context/LoginModalContext'
import { EditProfileProvider } from './context/EditProfileContext'
import { ScrollLockProvider } from './context/ScrollLockContext'
import { ModerationProvider } from './context/ModerationContext'
import { SeenPostsProvider } from './context/SeenPostsContext'
import FeedPage from './pages/FeedPage'
import PostDetailPage from './pages/PostDetailPage'
import ProfilePage from './pages/ProfilePage'
import TagPage from './pages/TagPage'

/** Official Git SCM logo (https://git-scm.com/images/logos/downloads/Git-Icon-1788C.svg) */
function GitLogo() {
  return (
    <svg width="20" height="20" viewBox="0 0 92 92" fill="none" aria-hidden style={{ flexShrink: 0 }}>
      <path
        fill="#f03c2e"
        fillRule="nonzero"
        d="M90.156 41.965 50.036 1.848a5.918 5.918 0 0 0-8.372 0l-8.328 8.332 10.566 10.566a7.03 7.03 0 0 1 7.23 1.684 7.034 7.034 0 0 1 1.669 7.277l10.187 10.184a7.028 7.028 0 0 1 7.278 1.672 7.04 7.04 0 0 1 0 9.957 7.05 7.05 0 0 1-9.965 0 7.044 7.044 0 0 1-1.528-7.66l-9.5-9.497V59.36a7.04 7.04 0 0 1 1.86 11.29 7.04 7.04 0 0 1-9.957 0 7.04 7.04 0 0 1 0-9.958 7.06 7.06 0 0 1 2.304-1.539V33.926a7.049 7.049 0 0 1-3.82-9.234L29.242 14.272 1.73 41.777a5.925 5.925 0 0 0 0 8.371L41.852 90.27a5.925 5.925 0 0 0 8.37 0l39.934-39.934a5.925 5.925 0 0 0 0-8.371"
      />
    </svg>
  )
}

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('App error:', error, info.componentStack)
    const msg = error?.message ?? ''
    if (/session was deleted by another process|TokenRefreshError/i.test(msg)) {
      const oauth = bsky.getOAuthAccountsSnapshot()
      if (oauth.activeDid) bsky.removeOAuthDid(oauth.activeDid)
    }
  }

  render() {
    if (this.state.error) {
      const isSessionDeleted =
        /session was deleted by another process|TokenRefreshError/i.test(this.state.error.message)
      return (
        <div
          style={{
            minHeight: '100vh',
            padding: '1.5rem',
            background: 'var(--bg)',
            color: 'var(--text)',
            fontFamily: 'system-ui, sans-serif',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
          }}
        >
          <div style={{ maxWidth: '28rem' }}>
            <h1 style={{ margin: '0 0 0.5rem', fontSize: '1.25rem' }}>
              {isSessionDeleted ? 'You were logged out' : 'Something went wrong'}
            </h1>
            <p style={{ margin: 0, fontSize: '0.95rem' }}>
              {isSessionDeleted
                ? 'Your session was ended (for example by signing out in another tab or device). Please sign in again.'
                : this.state.error.message}
            </p>
            {isSessionDeleted && (
              <p style={{ margin: '1rem 0 0', fontSize: '0.9rem' }}>
                <a href="#/feed" style={{ color: 'var(--accent)' }}>
                  Back to feed
                </a>
              </p>
            )}
            {!isSessionDeleted && (
              <>
                <p style={{ margin: '1rem 0 0', fontSize: '0.9rem', color: 'var(--muted)' }}>
                  Try refreshing the page. Check the browser console for details.
                </p>
                <p style={{ margin: '0.75rem 0 0' }}>
                  <button
                    type="button"
                    onClick={() => window.location.reload()}
                    style={{
                      padding: '0.5rem 1rem',
                      fontSize: '0.95rem',
                      cursor: 'pointer',
                      background: 'var(--accent)',
                      color: 'var(--bg)',
                      border: 'none',
                      borderRadius: 'var(--glass-radius-sm, 6px)',
                      fontWeight: 500,
                    }}
                  >
                    Refresh
                  </button>
                </p>
                <p style={{ margin: '1.25rem 0 0', fontSize: '0.9rem' }}>
                  <a
                    href={REPO_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', color: 'var(--muted)', textDecoration: 'none' }}
                    title="View source"
                  >
                    <GitLogo />
                    <span>View source</span>
                  </a>
                </p>
              </>
            )}
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

/** Redirect to feed with artboard modal open (for direct /artboard/:id links). */
function ArtboardRedirect() {
  const { id } = useParams<{ id: string }>()
  return <Navigate to={id ? `/feed?artboard=${encodeURIComponent(id)}` : '/feed'} replace />
}

/** Redirect to feed with forum post modal open (for direct /forum/post/:uri links). */
function ForumPostRedirect() {
  const { '*': splat } = useParams<{ '*': string }>()
  const trimmed = (splat ?? '').replace(/^\/+/, '').trim()
  if (!trimmed) return <Navigate to="/feed?forum=1" replace />
  try {
    const uri = decodeURIComponent(trimmed)
    return <Navigate to={`/feed?forumPost=${encodeURIComponent(uri)}`} replace />
  } catch {
    return <Navigate to={`/feed?forumPost=${encodeURIComponent(trimmed)}`} replace />
  }
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/feed" element={<FeedPage />} />
      <Route path="/forum" element={<Navigate to="/feed?forum=1" replace />} />
      <Route path="/artboards" element={<Navigate to="/feed?artboards=1" replace />} />
      <Route path="/artboard/:id" element={<ArtboardRedirect />} />
      <Route path="/post/:uri" element={<PostDetailPage />} />
      <Route path="/profile/:handle" element={<ProfilePage />} />
      <Route path="/tag/:tag" element={<TagPage />} />
      <Route path="/forum/post/*" element={<ForumPostRedirect />} />
      <Route path="/" element={<Navigate to="/feed" replace />} />
      <Route path="*" element={<Navigate to="/feed" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <ErrorBoundary>
      <HashRouter>
        <ThemeProvider>
          <SessionProvider>
            <ScrollLockProvider>
            <ViewModeProvider>
              <ArtOnlyProvider>
                <MediaOnlyProvider>
                  <FeedMixProvider>
                    <SeenPostsProvider>
                      <EditProfileProvider>
                    <ModerationProvider>
                    <LoginModalProvider>
                    <ModalExpandProvider>
                    <ProfileModalProvider>
                        <AppRoutes />
                    </ProfileModalProvider>
                    </ModalExpandProvider>
                    </LoginModalProvider>
                    </ModerationProvider>
                      </EditProfileProvider>
                    </SeenPostsProvider>
                  </FeedMixProvider>
                </MediaOnlyProvider>
              </ArtOnlyProvider>
            </ViewModeProvider>
            </ScrollLockProvider>
          </SessionProvider>
        </ThemeProvider>
      </HashRouter>
    </ErrorBoundary>
  )
}
