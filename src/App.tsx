import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
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
import ArtboardsPage from './pages/ArtboardsPage'
import ArtboardDetailPage from './pages/ArtboardDetailPage'
import PostDetailPage from './pages/PostDetailPage'
import ProfilePage from './pages/ProfilePage'
import TagPage from './pages/TagPage'
import ForumPage from './pages/ForumPage'
import ForumPostDetailPage from './pages/ForumPostDetailPage'

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('App error:', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
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
          <h1 style={{ margin: '0 0 0.5rem', fontSize: '1.25rem' }}>Something went wrong</h1>
          <pre style={{ margin: 0, fontSize: '0.85rem', color: 'var(--error)', overflow: 'auto' }}>
            {this.state.error.message}
          </pre>
          <p style={{ margin: '1rem 0 0', fontSize: '0.9rem', color: 'var(--muted)' }}>
            Check the browser console for details.
          </p>
        </div>
      )
    }
    return this.props.children
  }
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/feed" element={<FeedPage />} />
      <Route path="/artboards" element={<ArtboardsPage />} />
      <Route path="/artboard/:id" element={<ArtboardDetailPage />} />
      <Route path="/post/:uri" element={<PostDetailPage />} />
      <Route path="/profile/:handle" element={<ProfilePage />} />
      <Route path="/tag/:tag" element={<TagPage />} />
      <Route path="/forum" element={<ForumPage />} />
      <Route path="/forum/post/*" element={<ForumPostDetailPage />} />
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
                    <ProfileModalProvider>
                    <LoginModalProvider>
                      <AppRoutes />
                    </LoginModalProvider>
                    </ProfileModalProvider>
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
