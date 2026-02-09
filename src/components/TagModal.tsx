import { TagContent } from '../pages/TagPage'
import AppModal from './AppModal'

interface TagModalProps {
  tag: string
  onClose: () => void
  onBack: () => void
  canGoBack: boolean
}

export default function TagModal({ tag, onClose, onBack, canGoBack }: TagModalProps) {
  return (
    <AppModal
      ariaLabel={`#${tag}`}
      onClose={onClose}
      onBack={onBack}
      canGoBack={canGoBack}
    >
      <TagContent tag={tag} inModal />
    </AppModal>
  )
}
