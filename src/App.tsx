import { Component, useEffect } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { HashRouter, Navigate, Route, Routes, useLocation, useNavigationType } from 'react-router-dom'
import { SessionProvider } from './context/SessionContext'
import { ThemeProvider } from './context/ThemeContext'
import { ViewModeProvider } from './context/ViewModeContext'
import { ArtOnlyProvider } from './context/ArtOnlyContext'
import LoginPage from './pages/LoginPage'
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
            background: '#0f0f1a',
            color: '#e8e8f0',
            fontFamily: 'system-ui, sans-serif',
          }}
        >
          <h1 style={{ margin: '0 0 0.5rem', fontSize: '1.25rem' }}>Something went wrong</h1>
          <pre style={{ margin: 0, fontSize: '0.85rem', color: '#f87171', overflow: 'auto' }}>
            {this.state.error.message}
          </pre>
          <p style={{ margin: '1rem 0 0', fontSize: '0.9rem', color: '#8888a0' }}>
            Check the browser console for details.
          </p>
        </div>
      )
    }
    return this.props.children
  }
}

const SCROLL_KEY_PREFIX = 'artsky-scroll-'
const SCROLL_THROTTLE_MS = 150

function ScrollRestoration() {
  const location = useLocation()
  const navigationType = useNavigationType()

  useEffect(() => {
    const pathname = location.pathname
    const save = () => {
      try {
        const y = window.scrollY ?? document.documentElement.scrollTop
        sessionStorage.setItem(SCROLL_KEY_PREFIX + pathname, String(y))
      } catch {
        // ignore
      }
    }
    let raf = 0
    let last = 0
    const onScroll = () => {
      const now = Date.now()
      if (now - last >= SCROLL_THROTTLE_MS) {
        last = now
        save()
      } else {
        if (raf) cancelAnimationFrame(raf)
        raf = requestAnimationFrame(() => {
          raf = 0
          save()
        })
      }
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (raf) cancelAnimationFrame(raf)
      save()
    }
  }, [location.pathname])

  useEffect(() => {
    if (navigationType !== 'POP') return
    try {
      const raw = sessionStorage.getItem(SCROLL_KEY_PREFIX + location.pathname)
      if (raw === null) return
      const y = parseInt(raw, 10)
      if (!Number.isFinite(y) || y < 0) return
      const restore = () => {
        window.scrollTo(0, y)
      }
      requestAnimationFrame(restore)
      const t1 = setTimeout(restore, 50)
      const t2 = setTimeout(restore, 200) // re-apply after content (e.g. feed) has rendered
      return () => {
        clearTimeout(t1)
        clearTimeout(t2)
      }
    } catch {
      // ignore
    }
  }, [location.pathname, navigationType])

  return null
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
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
        <ScrollRestoration />
        <ThemeProvider>
          <ViewModeProvider>
            <ArtOnlyProvider>
              <SessionProvider>
                <AppRoutes />
              </SessionProvider>
            </ArtOnlyProvider>
          </ViewModeProvider>
        </ThemeProvider>
      </HashRouter>
    </ErrorBoundary>
  )
}
