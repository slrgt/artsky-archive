import { useState } from 'react'
import { useProfileModal } from '../context/ProfileModalContext'
import { ProfileContent } from '../pages/ProfilePage'
import AppModal from './AppModal'

interface ProfileModalProps {
  handle: string
  onClose: () => void
  onBack: () => void
  canGoBack: boolean
}

export default function ProfileModal({ handle, onClose, onBack, canGoBack }: ProfileModalProps) {
  const { openProfileModal } = useProfileModal()
  const [refreshFn, setRefreshFn] = useState<(() => void | Promise<void>) | null>(null)

  return (
    <AppModal
      ariaLabel="Profile"
      onClose={onClose}
      onBack={onBack}
      canGoBack={canGoBack}
      hideTopBar
      onPullToRefresh={refreshFn ? () => refreshFn() : undefined}
    >
      <ProfileContent
        handle={handle}
        openProfileModal={openProfileModal}
        inModal
        onRegisterRefresh={(fn) => setRefreshFn(() => fn)}
      />
    </AppModal>
  )
}
