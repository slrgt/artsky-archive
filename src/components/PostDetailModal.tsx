import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { PostDetailContent } from '../pages/PostDetailPage'
import styles from './PostDetailModal.module.css'

interface PostDetailModalProps {
  uri: string
  openReply?: boolean
  onClose: () => void
}

export default function PostDetailModal({ uri, openReply, onClose }: PostDetailModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  function handleBackdropClick(e: React.MouseEvent) {
    if (e.target === overlayRef.current) onClose()
  }

  const modal = (
    <div
      ref={overlayRef}
      className={styles.overlay}
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-label="Post"
    >
      <div className={styles.closeWrap}>
        <button
          type="button"
          className={styles.closeBtn}
          onClick={onClose}
          aria-label="Close"
        >
          ×
        </button>
      </div>
      <div className={styles.pane}>
        <div className={styles.scroll}>
          <PostDetailContent
            uri={uri}
            initialOpenReply={openReply}
            onClose={onClose}
          />
        </div>
      </div>
    </div>
  )

  return createPortal(modal, document.body)
}
