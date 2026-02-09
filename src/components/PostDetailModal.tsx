import { useState, useEffect } from 'react'
import { useProfileModal } from '../context/ProfileModalContext'
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
  const { openProfileModal } = useProfileModal()
  const [authorHandle, setAuthorHandle] = useState<string | null>(null)

  useEffect(() => {
    setAuthorHandle(null)
  }, [uri])

  const handleSwipeLeft = () => {
    if (authorHandle) {
      onBack()
      openProfileModal(authorHandle)
    }
  }

  return (
    <AppModal
      ariaLabel="Post"
      onClose={onClose}
      onBack={onBack}
      canGoBack={canGoBack}
      transparentTopBar
      onSwipeLeft={authorHandle ? handleSwipeLeft : undefined}
    >
      <PostDetailContent
        uri={uri}
        initialOpenReply={openReply}
        initialFocusedCommentUri={focusUri}
        onClose={onClose}
        onAuthorHandle={setAuthorHandle}
      />
    </AppModal>
  )
}
