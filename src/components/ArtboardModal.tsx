import { useState } from 'react'
import AppModal from './AppModal'
import { ArtboardDetailContent } from '../pages/ArtboardDetailPage'

interface ArtboardModalProps {
  id: string
  onClose: () => void
  onBack: () => void
  canGoBack: boolean
}

export default function ArtboardModal({ id, onClose, onBack, canGoBack }: ArtboardModalProps) {
  const [refreshFn, setRefreshFn] = useState<(() => void | Promise<void>) | null>(null)
  return (
    <AppModal
      ariaLabel="Collection"
      onClose={onClose}
      onBack={onBack}
      canGoBack={canGoBack}
      onPullToRefresh={refreshFn ? () => refreshFn() : undefined}
    >
      <ArtboardDetailContent id={id} inModal onRegisterRefresh={(fn) => setRefreshFn(() => fn)} />
    </AppModal>
  )
}
