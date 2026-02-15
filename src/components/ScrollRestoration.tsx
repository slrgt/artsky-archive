/**
 * Scroll restoration: coordinates with the Zustand scroll store and route behavior.
 *
 * 1. Sets history.scrollRestoration = 'manual' so the browser doesn't fight us
 * 2. Hydrates the scroll store from localStorage on app init (persistence across reload)
 * 3. Path-based save/restore for non-feed routes (forum, search, etc.)
 * 4. Feed routes use useScrollRestoration(feedKey) in FeedPage — we skip restore here
 *
 * Feed shell routes (/feed, /post/*, /profile/*, /tag/*) keep FeedPage mounted.
 * Post/profile/tag are overlays; scroll is preserved. On POP (back), FeedPage's
 * useScrollRestoration restores the feed-specific scroll.
 */
import { useEffect, useLayoutEffect, useRef } from 'react'
import { useLocation, useNavigationType } from 'react-router-dom'
import { useScrollStore } from '../store/scrollStore'

const SCROLL_SAVE_THROTTLE_MS = 150

function isFeedRoute(pathname: string): boolean {
  return (
    pathname === '/' ||
    pathname === '/feed' ||
    pathname.startsWith('/feed') ||
    pathname.startsWith('/post/') ||
    pathname.startsWith('/profile/') ||
    pathname.startsWith('/tag/')
  )
}

function isOverlayRoute(pathname: string): boolean {
  return pathname.startsWith('/post/') || pathname.startsWith('/profile/') || pathname.startsWith('/tag/')
}

export default function ScrollRestoration(): null {
  const location = useLocation()
  const navigationType = useNavigationType()
  const setScrollPosition = useScrollStore((s) => s.setScrollPosition)
  const getScrollPosition = useScrollStore((s) => s.getScrollPosition)
  const hydrate = useScrollStore((s) => s.hydrate)
  const scrollSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const currentPathRef = useRef(location.pathname)
  const prevPathRef = useRef(location.pathname)

  prevPathRef.current = currentPathRef.current
  currentPathRef.current = location.pathname

  useEffect(() => {
    if ('scrollRestoration' in history) {
      history.scrollRestoration = 'manual'
    }
  }, [])

  useEffect(() => {
    hydrate()
  }, [hydrate])

  // Path-based scroll save (for non-feed routes; feed uses useScrollRestoration with feed key)
  useEffect(() => {
    const saveScroll = () => {
      const path = currentPathRef.current || '/'
      const y = window.scrollY
      if (typeof y !== 'number' || !Number.isFinite(y) || y < 0) return
      setScrollPosition(path, y)
    }

    const handleScroll = () => {
      if (scrollSaveTimerRef.current) return
      scrollSaveTimerRef.current = setTimeout(() => {
        scrollSaveTimerRef.current = null
        saveScroll()
      }, SCROLL_SAVE_THROTTLE_MS)
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', handleScroll)
      if (scrollSaveTimerRef.current) {
        clearTimeout(scrollSaveTimerRef.current)
        scrollSaveTimerRef.current = null
      }
    }
  }, [setScrollPosition])

  useLayoutEffect(() => {
    return () => {
      const leavingPath = prevPathRef.current || '/'
      if (leavingPath) {
        setScrollPosition(leavingPath, window.scrollY)
      }
    }
  }, [location.key, location.pathname, setScrollPosition])

  useLayoutEffect(() => {
    const path = location.pathname || '/'

    if (navigationType === 'POP') {
      if (isFeedRoute(path)) {
        // Feed routes: FeedPage's useScrollRestoration handles restore with feed-specific key
        return
      }
      const savedY = getScrollPosition(path)
      if (Number.isFinite(savedY) && savedY >= 0) {
        window.scrollTo({ top: savedY, left: 0, behavior: 'instant' })
      }
    } else {
      // Forward navigation: scroll to top for full-page routes (not overlays)
      if (!isOverlayRoute(path)) {
        window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
      }
    }
  }, [location.key, location.pathname, navigationType, getScrollPosition])

  return null
}
