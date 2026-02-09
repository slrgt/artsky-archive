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

/** Generic Git logo (not GitHub) – Git SCM branching icon. */
function GitLogo() {
  return (
    <svg width="20" height="20" viewBox="0 0 32 32" fill="currentColor" aria-hidden style={{ flexShrink: 0 }}>
      <path d="M29.472 14.753a6.028 6.028 0 0 0-1.723-4.53 5.965 5.965 0 0 0-4.532-1.722c-1.31-.063-2.64.145-3.875.563-2.537-1.737-5.747-2.193-8.657-1.23-2.91.964-5.257 3.165-6.687 5.91-1.43 2.745-1.817 5.93-1.067 8.93-.91.59-1.96.987-3.067 1.157a5.965 5.965 0 0 0-4.532 1.722 6.028 6.028 0 0 0-1.723 4.53c0 1.588.619 3.082 1.742 4.2a5.965 5.965 0 0 0 4.532 1.722c.995 0 1.96-.194 2.867-.567 2.537 1.737 5.747 2.193 8.657 1.23 2.91-.964 5.257-3.165 6.687-5.91 1.43-2.745 1.817-5.93 1.067-8.93.91-.59 1.96-.987 3.067-1.157a5.965 5.965 0 0 0 4.532-1.722 6.028 6.028 0 0 0 1.723-4.53z" />
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
          }}
        >
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
                    <ProfileModalProvider>
                      <AppRoutes />
                    </ProfileModalProvider>
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
