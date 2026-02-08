import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { ModalTopBarSlotContext } from '../context/ModalTopBarSlotContext'
import { useScrollLock } from '../context/ScrollLockContext'
import { useSwipeToClose } from '../hooks/useSwipeToClose'
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
}

export default function AppModal({
  ariaLabel,
  children,
  onClose,
  onBack,
  canGoBack,
  focusCloseOnOpen = false,
  transparentTopBar = false,
}: AppModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const closeBtnRef = useRef<HTMLButtonElement>(null)
  const [topBarSlotEl, setTopBarSlotEl] = useState<HTMLDivElement | null>(null)
  const [topBarRightSlotEl, setTopBarRightSlotEl] = useState<HTMLDivElement | null>(null)
  const scrollLock = useScrollLock()
  const isMobile = useSyncExternalStore(subscribeMobile, getMobileSnapshot, () => false)
  const handleSwipeRight = () => (canGoBack ? onBack() : onClose())
  const swipe = useSwipeToClose({
    enabled: isMobile,
    onSwipeRight: handleSwipeRight,
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
    <ModalTopBarSlotContext.Provider value={{ centerSlot: topBarSlotEl, rightSlot: topBarRightSlotEl }}>
      <div
        ref={overlayRef}
        className={styles.overlay}
        onClick={handleBackdropClick}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
      >
        <div
          className={`${styles.pane}${swipe.isReturning ? ` ${styles.paneSwipeReturning}` : ''}`}
          style={swipe.style}
          onTouchStart={swipe.onTouchStart}
          onTouchMove={swipe.onTouchMove}
          onTouchEnd={swipe.onTouchEnd}
        >
          <div className={`${styles.modalTopBar} ${transparentTopBar ? styles.modalTopBarTransparent : ''}`}>
            <div className={styles.modalTopBarLeft}>
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
            </div>
            <div ref={setTopBarSlotEl} className={styles.modalTopBarSlot} />
            <div ref={setTopBarRightSlotEl} className={styles.modalTopBarRight} />
          </div>
          <div ref={scrollRef} className={`${styles.scroll} ${transparentTopBar ? styles.scrollWithTransparentBar : ''}`}>{children}</div>
        </div>
      </div>
    </ModalTopBarSlotContext.Provider>
  )

  return createPortal(modal, document.body)
}
