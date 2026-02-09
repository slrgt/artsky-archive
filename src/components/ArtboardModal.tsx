import AppModal from './AppModal'
import { ArtboardDetailContent } from '../pages/ArtboardDetailPage'

interface ArtboardModalProps {
  id: string
  onClose: () => void
  onBack: () => void
  canGoBack: boolean
}

export default function ArtboardModal({ id, onClose, onBack, canGoBack }: ArtboardModalProps) {
  return (
    <AppModal ariaLabel="Collection" onClose={onClose} onBack={onBack} canGoBack={canGoBack} focusCloseOnOpen>
      <ArtboardDetailContent id={id} inModal />
    </AppModal>
  )
}
