import AppModal from './AppModal'
import { ForumPostContent } from '../pages/ForumPostDetailPage'

interface ForumPostModalProps {
  documentUri: string
  onClose: () => void
  onBack: () => void
  canGoBack: boolean
}

export default function ForumPostModal({ documentUri, onClose, onBack, canGoBack }: ForumPostModalProps) {
  return (
    <AppModal ariaLabel="Forum post" onClose={onClose} onBack={onBack} canGoBack={canGoBack} focusCloseOnOpen>
      <ForumPostContent documentUri={documentUri} onClose={onClose} />
    </AppModal>
  )
}
