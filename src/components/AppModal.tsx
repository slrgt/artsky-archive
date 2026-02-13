import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { ModalTopBarSlotContext } from '../context/ModalTopBarSlotContext'
import { ModalScrollProvider } from '../context/ModalScrollContext'
import { useModalExpand } from '../context/ModalExpandContext'
import { useProfileModal } from '../context/ProfileModalContext'
import { useScrollLock } from '../context/ScrollLockContext'
import { useSwipeToClose } from '../hooks/useSwipeToClose'
import { usePullToRefresh, PULL_REFRESH_HOLD_PX } from '../hooks/usePullToRefresh'
import styles from './PostDetailModal.module.css'

const MOBILE_BREAKPOINT = 768
function subscribeMobile(cb: () => void) {
  if (typeof window === 'undefined') return () => {}
  const mq = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
  mq.addEventListener('change', cb)
  return () => mq.removeEventListener('change', cb)
}
function getMobileSnapshot() {
  return typeof window !== 'undefined' ? window.innerWidth < MOBILE_BREAKPOINT : false
}

interface AppModalProps {
  /** Accessible name for the dialog */
  ariaLabel: string
  children: React.ReactNode
  onClose: () => void
  onBack: () => void
  canGoBack: boolean
  /** When true, top bar has transparent background so content shows through. */
  transparentTopBar?: boolean
  /** When true, do not render the top bar (e.g. profile popup uses only the bottom bar). */
  hideTopBar?: boolean
  /** When true, pane uses same size as compose/notifications (420px, 85vh). Default false. */
  compact?: boolean
  /** Optional: called when user completes a swipe left on mobile (e.g. open post author profile). */
  onSwipeLeft?: () => void
  /** Optional: when provided, pull-to-refresh at top of modal scroll triggers this (e.g. refresh post, profile). */
  onPullToRefresh?: () => void | Promise<void>
}

export default function AppModal({
  ariaLabel,
  children,
  onClose,
  onBack,
  canGoBack,
  transparentTopBar = false,
  hideTopBar = false,
  compact = false,
  onSwipeLeft,
  onPullToRefresh,
}: AppModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const { modalScrollHidden, setModalScrollHidden } = useProfileModal()
  const lastScrollYRef = useRef(0)
  const scrollEndTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isMobile = useSyncExternalStore(subscribeMobile, getMobileSnapshot, () => false)
  const pullRefresh = usePullToRefresh({
    scrollRef,
    touchTargetRef: scrollRef,
    onRefresh: onPullToRefresh ?? (() => {}),
    enabled: !!onPullToRefresh && !isMobile,
  })
  const [topBarSlotEl, setTopBarSlotEl] = useState<HTMLDivElement | null>(null)
  const [topBarRightSlotEl, setTopBarRightSlotEl] = useState<HTMLDivElement | null>(null)
  const { expanded, setExpanded } = useModalExpand()
  const scrollLock = useScrollLock()
  const handleSwipeRight = () => (canGoBack ? onBack() : onClose())
  const swipe = useSwipeToClose({
    enabled: isMobile,
    onSwipeRight: handleSwipeRight,
    onSwipeLeft,
  })

  useEffect(() => {
    scrollLock?.lockScroll()
    return () => scrollLock?.unlockScroll()
  }, [scrollLock])

  /* When modal is open, route wheel events to the modal scroll area so scrolling never moves the page behind */
  useEffect(() => {
    const overlay = overlayRef.current
    const scrollEl = scrollRef.current
    if (!overlay || !scrollEl) return
    const onWheel = (e: WheelEvent) => {
      const target = e.target as Node
      if (!overlay.contains(target)) {
        /* Mouse outside modal: prevent page scroll and scroll the popup instead */
        e.preventDefault()
        scrollEl.scrollTop += e.deltaY
        return
      }
      if (scrollEl.contains(target)) return
      /* Mouse over overlay but not the scroll area (e.g. backdrop or top bar): scroll the popup */
      e.preventDefault()
      scrollEl.scrollTop += e.deltaY
    }
    window.addEventListener('wheel', onWheel, { passive: false, capture: true })
    return () => window.removeEventListener('wheel', onWheel, { capture: true })
  }, [])

  /* Modal scroll: hide back/nav/gear when scrolling down (same behavior as homepage) */
  useEffect(() => {
    const el = scrollRef.current
    if (!el || !isMobile) return
    lastScrollYRef.current = el.scrollTop
    const SCROLL_THRESHOLD = 8
    const SCROLL_END_MS = 350
    function onScroll() {
      const scrollEl = scrollRef.current
      if (!scrollEl) return
      const y = scrollEl.scrollTop
      const delta = y - lastScrollYRef.current
      if (delta > SCROLL_THRESHOLD) setModalScrollHidden(true)
      else if (delta < -SCROLL_THRESHOLD) setModalScrollHidden(false)
      lastScrollYRef.current = y
      if (scrollEndTimerRef.current) clearTimeout(scrollEndTimerRef.current)
      scrollEndTimerRef.current = setTimeout(() => {
        scrollEndTimerRef.current = null
        setModalScrollHidden(false)
      }, SCROLL_END_MS)
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      el.removeEventListener('scroll', onScroll)
      if (scrollEndTimerRef.current) clearTimeout(scrollEndTimerRef.current)
    }
  }, [isMobile, setModalScrollHidden])

  /* Mobile: open in expanded mode by default */
  useEffect(() => {
    if (isMobile) setExpanded(true)
  }, [isMobile, setExpanded])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable) {
        if (e.key === 'Escape') {
          e.preventDefault()
          target.blur()
        }
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopImmediatePropagation()
        onClose()
        return
      }
      if (e.key.toLowerCase() === 'q') {
        e.preventDefault()
        e.stopImmediatePropagation()
        onBack()
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [onClose, onBack])

  function handleBackdropClick(e: React.MouseEvent) {
    if (e.target === overlayRef.current) onClose()
  }

  const modal = (
    <ModalTopBarSlotContext.Provider value={{ centerSlot: topBarSlotEl, rightSlot: topBarRightSlotEl, isMobile }}>
      <div
        ref={overlayRef}
        className={`${styles.overlay}${transparentTopBar ? ` ${styles.overlayFlushTop}` : ''}${expanded ? ` ${styles.overlayExpanded}` : ''}`}
        onClick={handleBackdropClick}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
      >
        <button
          type="button"
          className={`${styles.modalFloatingBack}${modalScrollHidden ? ` ${styles.modalFloatingBackScrollHidden}` : ''}`}
          onClick={canGoBack ? onBack : onClose}
          aria-label={canGoBack ? 'Back' : 'Close'}
          title={canGoBack ? 'Back' : 'Close'}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </button>
        <div
          className={`${styles.pane}${swipe.isReturning ? ` ${styles.paneSwipeReturning}` : ''}${transparentTopBar ? ` ${styles.paneNoRightBorder}` : ''}${compact ? ` ${styles.paneCompact}` : ''}${expanded ? ` ${styles.paneExpanded}` : ''}`}
          style={swipe.style}
          onTouchStart={swipe.onTouchStart}
          onTouchMove={swipe.onTouchMove}
          onTouchEnd={swipe.onTouchEnd}
          onClick={(e) => e.stopPropagation()}
        >
          {!hideTopBar && (
            <div className={`${styles.modalTopBar} ${transparentTopBar ? styles.modalTopBarTransparent : ''} ${styles.modalTopBarActionsBelow}`}>
              <div className={styles.modalTopBarLeft} aria-hidden="true">
                {/* X, back, expand are in the bottom bar on all viewports */}
              </div>
              <div ref={setTopBarSlotEl} className={styles.modalTopBarSlot} />
              <div ref={setTopBarRightSlotEl} className={styles.modalTopBarRight} />
            </div>
          )}
          <div
            ref={scrollRef}
            data-modal-scroll
            className={`${styles.scroll} ${transparentTopBar ? styles.scrollWithTransparentBar : ''} ${styles.scrollWithFloatingBack}`}
            onTouchStart={pullRefresh.onTouchStart}
            onTouchMove={pullRefresh.onTouchMove}
            onTouchEnd={pullRefresh.onTouchEnd}
          >
            {onPullToRefresh && (
              <div
                className={styles.pullRefreshHeader}
                style={{ height: pullRefresh.pullDistance > 0 || pullRefresh.isRefreshing ? PULL_REFRESH_HOLD_PX : 0 }}
                aria-hidden={pullRefresh.pullDistance === 0 && !pullRefresh.isRefreshing}
                aria-live="polite"
                aria-label={pullRefresh.isRefreshing ? 'Refreshing' : undefined}
              >
                {(pullRefresh.pullDistance > 0 || pullRefresh.isRefreshing) && (
                  <div className={styles.pullRefreshSpinner} />
                )}
              </div>
            )}
            <div
              className={onPullToRefresh ? styles.pullRefreshContent : undefined}
              style={onPullToRefresh ? { transform: `translateY(${pullRefresh.pullDistance}px)` } : undefined}
            >
              <ModalScrollProvider scrollRef={scrollRef}>
                {children}
              </ModalScrollProvider>
            </div>
          </div>
        </div>
      </div>
    </ModalTopBarSlotContext.Provider>
  )

  return createPortal(modal, document.body)
}
