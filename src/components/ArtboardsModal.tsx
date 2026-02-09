import AppModal from './AppModal'
import CollectionsModalTopBar from './CollectionsModalTopBar'
import { ArtboardsContent } from '../pages/ArtboardsPage'

interface ArtboardsModalProps {
  onClose: () => void
  onBack: () => void
  canGoBack: boolean
}

export default function ArtboardsModal({ onClose, onBack, canGoBack }: ArtboardsModalProps) {
  return (
    <AppModal ariaLabel="Collections" onClose={onClose} onBack={onBack} canGoBack={canGoBack} focusCloseOnOpen>
      <CollectionsModalTopBar />
      <ArtboardsContent inModal />
    </AppModal>
  )
}
