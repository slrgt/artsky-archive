import { useState } from 'react'
import AppModal from './AppModal'
import { ForumContent } from '../pages/ForumPage'
import styles from './PostDetailModal.module.css'

interface ForumModalProps {
  onClose: () => void
  onBack: () => void
  canGoBack: boolean
}

export default function ForumModal({ onClose, onBack, canGoBack }: ForumModalProps) {
  const [refreshFn, setRefreshFn] = useState<(() => void | Promise<void>) | null>(null)
  return (
    <AppModal
      ariaLabel="Forums"
      onClose={onClose}
      onBack={onBack}
      canGoBack={canGoBack}
      onPullToRefresh={refreshFn ? () => refreshFn() : undefined}
    >
      <div className={styles.modalBetaAlert} role="status">BETA</div>
      <ForumContent inModal onRegisterRefresh={(fn) => setRefreshFn(() => fn)} />
    </AppModal>
  )
}
