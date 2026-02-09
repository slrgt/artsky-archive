import AppModal from './AppModal'
import { ForumContent } from '../pages/ForumPage'

interface ForumModalProps {
  onClose: () => void
  onBack: () => void
  canGoBack: boolean
}

export default function ForumModal({ onClose, onBack, canGoBack }: ForumModalProps) {
  return (
    <AppModal ariaLabel="Forums" onClose={onClose} onBack={onBack} canGoBack={canGoBack} focusCloseOnOpen>
      <ForumContent inModal />
    </AppModal>
  )
}
