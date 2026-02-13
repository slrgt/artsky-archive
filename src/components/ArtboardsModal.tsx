import { useState } from 'react'
import AppModal from './AppModal'
import CollectionsModalTopBar from './CollectionsModalTopBar'
import { ArtboardsContent } from '../pages/ArtboardsPage'
import styles from './PostDetailModal.module.css'

interface ArtboardsModalProps {
  onClose: () => void
  onBack: () => void
  canGoBack: boolean
}

export default function ArtboardsModal({ onClose, onBack, canGoBack }: ArtboardsModalProps) {
  const [refreshFn, setRefreshFn] = useState<(() => void | Promise<void>) | null>(null)
  return (
    <AppModal
      ariaLabel="Collections"
      onClose={onClose}
      onBack={onBack}
      canGoBack={canGoBack}
      onPullToRefresh={refreshFn ? () => refreshFn() : undefined}
    >
      <div className={styles.modalBetaAlert} role="status">BETA</div>
      <CollectionsModalTopBar />
      <ArtboardsContent inModal onRegisterRefresh={(fn) => setRefreshFn(() => fn)} />
    </AppModal>
  )
}
