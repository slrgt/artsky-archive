import { useState } from 'react'
import AppModal from './AppModal'
import { ForumPostContent } from '../pages/ForumPostDetailPage'
import { ArtSkyForumPostContent } from '../pages/ArtSkyForumPostDetailPage'

function isArtSkyForumUri(uri: string): boolean {
  return uri.includes('app.artsky.forum.post')
}

interface ForumPostModalProps {
  documentUri: string
  onClose: () => void
  onBack: () => void
  canGoBack: boolean
}

export default function ForumPostModal({ documentUri, onClose, onBack, canGoBack }: ForumPostModalProps) {
  const [refreshFn, setRefreshFn] = useState<(() => void | Promise<void>) | null>(null)
  const isArtSky = isArtSkyForumUri(documentUri)
  return (
    <AppModal
      ariaLabel="Forum post"
      onClose={onClose}
      onBack={onBack}
      canGoBack={canGoBack}
      onPullToRefresh={refreshFn ? () => refreshFn() : undefined}
    >
      {isArtSky ? (
        <ArtSkyForumPostContent documentUri={documentUri} onClose={onClose} onRegisterRefresh={(fn) => setRefreshFn(() => fn)} />
      ) : (
        <ForumPostContent documentUri={documentUri} onClose={onClose} onRegisterRefresh={(fn) => setRefreshFn(() => fn)} />
      )}
    </AppModal>
  )
}
