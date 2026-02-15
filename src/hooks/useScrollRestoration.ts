import { useEffect, useLayoutEffect, useRef, useCallback } from 'react'
import { useLocation, useNavigationType } from 'react-router-dom'
import { useScrollStore } from '../store/scrollStore'

const SCROLL_SAVE_THROTTLE_MS = 150

/**
 * useScrollRestoration(key: string)
 *
 * Saves scroll position to the store on scroll events (throttled).
 * Restores scroll when the route becomes active (e.g. on POP / back navigation).
 *
 * Use this in feed/list screens that should remember their scroll position
 * when the user navigates away and back. The `key` should uniquely identify
 * the feed or screen (e.g. "feed:timeline", "feed:whats-hot").
 *
 * Timing: We restore in useLayoutEffect so it runs before paint, minimizing
 * visible jump. For virtualized lists, we defer with rAF so the list can
 * layout first—otherwise restored scrollY may be applied before content exists.
 */
export function useScrollRestoration(
  key: string,
  options?: {
    /** If true, defer restore by one rAF (for virtualized content) */
    deferred?: boolean
    /** Custom scroll element (default: window) */
    scrollElement?: () => HTMLElement | Window | null
  }
): void {
  const location = useLocation()
  const navigationType = useNavigationType()
  const setScrollPosition = useScrollStore((s) => s.setScrollPosition)
  const getScrollPosition = useScrollStore((s) => s.getScrollPosition)
  const throttleRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isRestoringRef = useRef(false)
  const prevPathRef = useRef(location.pathname)
  /** Track last location.key we restored for — navigationType stays 'POP' after back until next nav, so without this we'd restore on every re-render (e.g. when new posts load) and cause jumpiness */
  const lastRestoredKeyRef = useRef<string | null>(null)

  const getScrollEl = options?.scrollElement ?? (() => (typeof window !== 'undefined' ? window : null))
  const deferred = options?.deferred ?? false

  // Save scroll on scroll events (throttled)
  const saveScroll = useCallback(() => {
    if (isRestoringRef.current || !key) return
    const el = getScrollEl()
    if (!el) return
    const scrollY = el === window ? window.scrollY : (el as HTMLElement).scrollTop
    if (typeof scrollY === 'number' && Number.isFinite(scrollY) && scrollY >= 0) {
      setScrollPosition(key, scrollY)
    }
  }, [key, setScrollPosition, getScrollEl])

  useEffect(() => {
    const el = getScrollEl()
    if (!el) return

    const handleScroll = () => {
      if (throttleRef.current) return
      throttleRef.current = setTimeout(() => {
        throttleRef.current = null
        saveScroll()
      }, SCROLL_SAVE_THROTTLE_MS)
    }

    const target = el === window ? window : (el as HTMLElement)
    target.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      target.removeEventListener('scroll', handleScroll)
      if (throttleRef.current) {
        clearTimeout(throttleRef.current)
        throttleRef.current = null
      }
    }
  }, [getScrollEl, saveScroll])

  // On navigation away: save current scroll for the key we're leaving
  useLayoutEffect(() => {
    return () => {
      if (!isRestoringRef.current && key) {
        const el = getScrollEl()
        if (el) {
          const scrollY = el === window ? window.scrollY : (el as HTMLElement).scrollTop
          if (typeof scrollY === 'number' && Number.isFinite(scrollY)) {
            setScrollPosition(key, scrollY)
          }
        }
      }
    }
  }, [location.key, location.pathname, key, setScrollPosition, getScrollEl])

  // On POP (back/forward) or page reload: restore saved scroll (once per navigation — navigationType stays POP after back so we must guard)
  useLayoutEffect(() => {
    if (!key) return
    const isPop = navigationType === 'POP'
    const isReload =
      typeof performance !== 'undefined' &&
      (performance.getEntriesByType?.('navigation')[0] as PerformanceNavigationTiming | undefined)?.type === 'reload'
    if (!isPop && !isReload) {
      lastRestoredKeyRef.current = null // Reset so next POP will restore
      return
    }
    if (lastRestoredKeyRef.current === location.key) return
    lastRestoredKeyRef.current = location.key

    const savedY = getScrollPosition(key)
    if (!Number.isFinite(savedY) || savedY <= 0) return

    const el = getScrollEl()
    if (!el) return

    const scrollTo = (y: number) => {
      isRestoringRef.current = true
      if (el === window) {
        window.scrollTo({ top: y, left: 0, behavior: 'instant' })
        // Force virtualizer to see the new position (helps after multiple overlay open/close cycles)
        const fireScroll = () => window.dispatchEvent(new Event('scroll', { bubbles: true }))
        fireScroll()
        requestAnimationFrame(fireScroll)
        setTimeout(fireScroll, 50)
      } else {
        ;(el as HTMLElement).scrollTop = y
        ;(el as HTMLElement).dispatchEvent(new Event('scroll', { bubbles: true }))
      }
      requestAnimationFrame(() => {
        isRestoringRef.current = false
      })
    }

    if (deferred) {
      // Virtualized content needs a frame to layout; double-rAF helps
      requestAnimationFrame(() => {
        requestAnimationFrame(() => scrollTo(savedY))
      })
    } else {
      scrollTo(savedY)
    }
  }, [location.key, location.pathname, navigationType, key, getScrollPosition, getScrollEl, deferred])


  prevPathRef.current = location.pathname
}
