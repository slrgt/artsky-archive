import { useEffect } from 'react'
import type { LoginMode } from './LoginCard'
import LoginCard from './LoginCard'
import styles from './LoginModal.module.css'

interface LoginModalProps {
  isOpen: boolean
  mode: LoginMode
  onClose: () => void
  onSuccess: () => void
}

export default function LoginModal({ isOpen, mode, onClose, onSuccess }: LoginModalProps) {
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null
  return (
    <>
      <div
        className={styles.backdrop}
        onClick={onClose}
        aria-hidden
      />
      <div className={styles.center} role="dialog" aria-modal="true" aria-label="Log in or create account">
        <div className={styles.cardWrap} onClick={(e) => e.stopPropagation()}>
          <LoginCard initialMode={mode} onSuccess={onSuccess} onClose={onClose} />
        </div>
      </div>
    </>
  )
}
