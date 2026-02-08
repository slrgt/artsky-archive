import { useRef, useState, useCallback } from 'react'

/** Thresholds: require clearly horizontal gesture to avoid accidental triggers when scrolling */
const SWIPE_COMMIT_PX = 28
const SWIPE_HORIZONTAL_RATIO = 2
const SWIPE_TRIGGER_PX = 80
const SWIPE_DRAG_CAP_PX = 140

export interface UseSwipeToCloseOptions {
  /** When false, touch handlers are no-ops and translateX stays 0 */
  enabled: boolean
  /** Called when user completes a swipe to the right (go back / close) */
  onSwipeRight: () => void
  /** Optional: called when user completes a swipe to the left (e.g. open profile) */
  onSwipeLeft?: () => void
}

export interface UseSwipeToCloseResult {
  onTouchStart: (e: React.TouchEvent) => void
  onTouchMove: (e: React.TouchEvent) => void
  onTouchEnd: (e: React.TouchEvent) => void
  /** Current drag offset in px (positive = dragging right). Apply as transform: translateX(...) */
  translateX: number
  /** True briefly after a cancelled swipe for snap-back transition */
  isReturning: boolean
  /** Inline style for the swiping element (transform when dragging, undefined when 0) */
  style: React.CSSProperties | undefined
}

/**
 * Reusable swipe-to-close/back gesture for modals and overlays.
 * Use on the pane/content element: attach handlers and style, add a class when isReturning for transition.
 */
export function useSwipeToClose({
  enabled,
  onSwipeRight,
  onSwipeLeft,
}: UseSwipeToCloseOptions): UseSwipeToCloseResult {
  const touchStartXRef = useRef(0)
  const touchStartYRef = useRef(0)
  const horizontalSwipeRef = useRef(false)
  const [translateX, setTranslateX] = useState(0)
  const [isReturning, setIsReturning] = useState(false)

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (!enabled || e.touches.length !== 1) return
      touchStartXRef.current = e.touches[0].clientX
      touchStartYRef.current = e.touches[0].clientY
      horizontalSwipeRef.current = false
    },
    [enabled]
  )

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!enabled || e.touches.length !== 1) return
      const dx = e.touches[0].clientX - touchStartXRef.current
      const dy = e.touches[0].clientY - touchStartYRef.current
      if (!horizontalSwipeRef.current) {
        if (
          Math.abs(dx) > SWIPE_COMMIT_PX &&
          Math.abs(dx) > Math.abs(dy) * SWIPE_HORIZONTAL_RATIO
        ) {
          horizontalSwipeRef.current = true
        } else {
          return
        }
      }
      e.preventDefault()
      const capped = Math.max(
        -SWIPE_DRAG_CAP_PX,
        Math.min(SWIPE_DRAG_CAP_PX, dx)
      )
      setTranslateX(capped)
    },
    [enabled]
  )

  const onTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (!enabled || e.changedTouches.length !== 1) {
        setTranslateX(0)
        setIsReturning(false)
        return
      }
      const dx = e.changedTouches[0].clientX - touchStartXRef.current
      const triggered =
        horizontalSwipeRef.current &&
        Math.abs(dx) > SWIPE_TRIGGER_PX &&
        (dx > 0 ? true : dx < 0 && !!onSwipeLeft)
      if (triggered) {
        if (dx > 0) onSwipeRight()
        else if (onSwipeLeft) onSwipeLeft()
      } else {
        setIsReturning(true)
        setTimeout(() => setIsReturning(false), 220)
      }
      horizontalSwipeRef.current = false
      setTranslateX(0)
    },
    [enabled, onSwipeRight, onSwipeLeft]
  )

  const style: React.CSSProperties | undefined =
    translateX !== 0 ? { transform: `translateX(${translateX}px)` } : undefined

  return {
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    translateX,
    isReturning,
    style,
  }
}
