import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { ModalTopBarSlotContext } from '../context/ModalTopBarSlotContext'
import { useModalExpand } from '../context/ModalExpandContext'
import { useScrollLock } from '../context/ScrollLockContext'
import { useSwipeToClose } from '../hooks/useSwipeToClose'
import { usePullToRefresh } from '../hooks/usePullToRefresh'
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
  /** When true, focus the close button when the modal opens (e.g. profile/tag). Default false. */
  focusCloseOnOpen?: boolean
  /** When true, top bar has transparent background so content shows through; X button keeps its background. */
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
  focusCloseOnOpen = false,
  transparentTopBar = false,
  hideTopBar = false,
  compact = false,
  onSwipeLeft,
  onPullToRefresh,
}: AppModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const pullRefresh = usePullToRefresh({
    scrollRef,
    touchTargetRef: scrollRef,
    onRefresh: onPullToRefresh ?? (() => {}),
    enabled: !!onPullToRefresh,
  })
  const closeBtnRef = useRef<HTMLButtonElement>(null)
  const [topBarSlotEl, setTopBarSlotEl] = useState<HTMLDivElement | null>(null)
  const [topBarRightSlotEl, setTopBarRightSlotEl] = useState<HTMLDivElement | null>(null)
  const [mobileBottomBarSlotEl, setMobileBottomBarSlotEl] = useState<HTMLDivElement | null>(null)
  const { expanded, setExpanded } = useModalExpand()
  const [bottomBarHidden, setBottomBarHidden] = useState(false)
  const scrollLock = useScrollLock()
  const isMobile = useSyncExternalStore(subscribeMobile, getMobileSnapshot, () => false)
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

  useEffect(() => {
    if (focusCloseOnOpen) closeBtnRef.current?.focus()
  }, [focusCloseOnOpen])

  /* Mobile: hide bottom action bar when user scrolls down; show again when they scroll up or are near top */
  const lastScrollTopRef = useRef(0)
  useEffect(() => {
    const el = scrollRef.current
    if (!el || !isMobile) return
    lastScrollTopRef.current = el.scrollTop
    const onScroll = () => {
      const top = el.scrollTop
      if (top <= 50) {
        setBottomBarHidden(false)
      } else if (top > lastScrollTopRef.current) {
        setBottomBarHidden(true)
      } else {
        setBottomBarHidden(false)
      }
      lastScrollTopRef.current = top
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [isMobile])

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
    <ModalTopBarSlotContext.Provider value={{ centerSlot: topBarSlotEl, rightSlot: topBarRightSlotEl, mobileBottomBarSlot: mobileBottomBarSlotEl, isMobile }}>
      <div
        ref={overlayRef}
        className={`${styles.overlay}${transparentTopBar ? ` ${styles.overlayFlushTop}` : ''}${expanded ? ` ${styles.overlayExpanded}` : ''}`}
        onClick={handleBackdropClick}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
      >
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
            className={`${styles.scroll} ${transparentTopBar ? styles.scrollWithTransparentBar : ''} ${styles.scrollWithBottomBar}`}
            onTouchStart={pullRefresh.onTouchStart}
            onTouchMove={pullRefresh.onTouchMove}
            onTouchEnd={pullRefresh.onTouchEnd}
          >
            {children}
          </div>
          <div className={`${styles.modalBottomBar} ${isMobile && bottomBarHidden ? styles.modalBottomBarHidden : ''}`}>
              <button
                ref={focusCloseOnOpen ? closeBtnRef : undefined}
                type="button"
                className={styles.closeBtn}
                onClick={onClose}
                aria-label="Close"
              >
                ×
              </button>
              {canGoBack ? (
                <button
                  type="button"
                  className={styles.backBtn}
                  onClick={onBack}
                  aria-label="Back to previous"
                >
                  ←
                </button>
              ) : null}
              <div ref={setMobileBottomBarSlotEl} className={styles.modalBottomBarSlot} />
              <button
                type="button"
                className={styles.expandBtn}
                onClick={() => setExpanded(!expanded)}
                aria-label={expanded ? 'Restore popup size' : 'Expand to edges'}
                title={expanded ? 'Restore' : 'Expand to edges'}
              >
                {expanded ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" />
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
                  </svg>
                )}
              </button>
            </div>
        </div>
      </div>
    </ModalTopBarSlotContext.Provider>
  )

  return createPortal(modal, document.body)
}
