import { useRef, useState, useCallback, useEffect } from 'react'

const PULL_THRESHOLD_PX = 58
const PULL_COMMIT_PX = 8
const PULL_CAP_PX = 90

export interface UsePullToRefreshOptions {
  /** Scroll container ref. When null, use window/document for scroll position. */
  scrollRef: React.RefObject<HTMLElement | null> | null
  /** Element to attach touch listeners to (for pull detection). When null, use scrollRef. Required when scrollRef is null (e.g. window scroll). */
  touchTargetRef: React.RefObject<HTMLElement | null> | null
  /** Called when user completes a pull-to-refresh. May return a Promise; isRefreshing stays true until it resolves. */
  onRefresh: () => void | Promise<void>
  /** When false, touch handlers are no-ops. Use to disable when e.g. a nested scroll is active. */
  enabled?: boolean
}

export interface UsePullToRefreshResult {
  onTouchStart: (e: React.TouchEvent) => void
  onTouchMove: (e: React.TouchEvent) => void
  onTouchEnd: (e: React.TouchEvent) => void
  /** Current pull distance in px (0 when not pulling). Use for indicator transform. */
  pullDistance: number
  /** True while onRefresh is in progress (after trigger until Promise resolves). */
  isRefreshing: boolean
}

function getScrollTop(scrollRef: React.RefObject<HTMLElement | null> | null): number {
  if (scrollRef?.current) return scrollRef.current.scrollTop
  if (typeof window === 'undefined') return 0
  return window.scrollY ?? document.documentElement.scrollTop
}

/**
 * Pull-to-refresh for mobile: when user is at top and pulls down, trigger onRefresh.
 * Attach returned handlers to the scroll container (or a wrapper); when scrollRef is null (window scroll), still attach to a root element so touch events are captured.
 */
export function usePullToRefresh({
  scrollRef,
  touchTargetRef,
  onRefresh,
  enabled = true,
}: UsePullToRefreshOptions): UsePullToRefreshResult {
  const startYRef = useRef(0)
  const startScrollTopRef = useRef(0)
  const pullingRef = useRef(false)
  const pullDistanceRef = useRef(0)
  const [pullDistance, setPullDistance] = useState(0)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const onRefreshRef = useRef(onRefresh)
  onRefreshRef.current = onRefresh

  const runRefresh = useCallback(async () => {
    setIsRefreshing(true)
    try {
      await Promise.resolve(onRefreshRef.current())
    } finally {
      setIsRefreshing(false)
    }
  }, [])

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (!enabled || e.touches.length !== 1) return
      startYRef.current = e.touches[0].clientY
      startScrollTopRef.current = getScrollTop(scrollRef)
      pullingRef.current = false
      setPullDistance(0)
    },
    [enabled, scrollRef]
  )

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!enabled || e.touches.length !== 1) return
      const scrollTop = getScrollTop(scrollRef)
      const dy = e.touches[0].clientY - startYRef.current

      if (!pullingRef.current) {
        if (scrollTop <= 2 && dy > PULL_COMMIT_PX) {
          pullingRef.current = true
        } else {
          return
        }
      }

      if (pullingRef.current && scrollTop <= 2 && dy > 0) {
        e.preventDefault()
        const capped = Math.min(PULL_CAP_PX, dy)
        pullDistanceRef.current = capped
        setPullDistance(capped)
      }
    },
    [enabled, scrollRef]
  )

  const onTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (!enabled || e.changedTouches.length !== 1) {
        pullingRef.current = false
        setPullDistance(0)
        return
      }
      if (pullingRef.current) {
        const distance = pullDistanceRef.current
        if (distance >= PULL_THRESHOLD_PX && !isRefreshing) {
          runRefresh()
        }
        pullingRef.current = false
        pullDistanceRef.current = 0
        setPullDistance(0)
      }
    },
    [enabled, isRefreshing, runRefresh]
  )

  /* Attach touchmove with passive: false so preventDefault() works when pulling at top (required on mobile). */
  useEffect(() => {
    const el = touchTargetRef?.current ?? scrollRef?.current
    if (!enabled || !el) return
    const onMove = (e: TouchEvent) => {
      if (e.touches.length !== 1) return
      const scrollTop = getScrollTop(scrollRef)
      const dy = e.touches[0].clientY - startYRef.current
      if (!pullingRef.current) {
        if (scrollTop <= 2 && dy > PULL_COMMIT_PX) pullingRef.current = true
        else return
      }
      if (pullingRef.current && scrollTop <= 2 && dy > 0) {
        e.preventDefault()
        const capped = Math.min(PULL_CAP_PX, dy)
        pullDistanceRef.current = capped
        setPullDistance(capped)
      }
    }
    el.addEventListener('touchmove', onMove, { passive: false })
    return () => el.removeEventListener('touchmove', onMove)
  }, [enabled, scrollRef, touchTargetRef])

  return {
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    pullDistance,
    isRefreshing,
  }
}
