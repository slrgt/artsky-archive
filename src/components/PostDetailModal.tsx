import { PostDetailContent } from '../pages/PostDetailPage'
import AppModal from './AppModal'

interface PostDetailModalProps {
  uri: string
  openReply?: boolean
  focusUri?: string
  onClose: () => void
  onBack: () => void
  canGoBack: boolean
}

export default function PostDetailModal({ uri, openReply, focusUri, onClose, onBack, canGoBack }: PostDetailModalProps) {
  return (
    <AppModal ariaLabel="Post" onClose={onClose} onBack={onBack} canGoBack={canGoBack} transparentTopBar>
      <PostDetailContent
        uri={uri}
        initialOpenReply={openReply}
        initialFocusedCommentUri={focusUri}
        onClose={onClose}
      />
    </AppModal>
  )
}
