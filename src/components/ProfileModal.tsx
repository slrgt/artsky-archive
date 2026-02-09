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

  return (
    <AppModal
      ariaLabel="Profile"
      onClose={onClose}
      onBack={onBack}
      canGoBack={canGoBack}
      compact
    >
      <ProfileContent handle={handle} openProfileModal={openProfileModal} inModal />
    </AppModal>
  )
}
