/**
 * Bluesky-style feed shell: keeps FeedPage mounted when opening posts, profiles, tags.
 * These open as overlays on top of the feed—scroll position is preserved, back feels instant.
 */
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import FeedPage from '../pages/FeedPage'
import PostDetailModal from './PostDetailModal'
import ProfileModal from './ProfileModal'
import TagModal from './TagModal'

function PostOverlay() {
  const { uri } = useParams<{ uri: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const search = new URLSearchParams(location.search)
  const openReply = search.get('reply') === '1'
  const focusUri = search.get('focus') ?? undefined

  if (!uri) return null

  return (
    <PostDetailModal
      uri={decodeURIComponent(uri)}
      openReply={!!openReply}
      focusUri={focusUri}
      onClose={() => navigate(-1)}
      onBack={() => navigate(-1)}
      canGoBack
    />
  )
}

function ProfileOverlay() {
  const { handle } = useParams<{ handle: string }>()
  const navigate = useNavigate()

  if (!handle) return null

  return (
    <ProfileModal
      handle={decodeURIComponent(handle)}
      onClose={() => navigate(-1)}
      onBack={() => navigate(-1)}
      canGoBack
    />
  )
}

function TagOverlay() {
  const { tag } = useParams<{ tag: string }>()
  const navigate = useNavigate()

  if (!tag) return null

  return (
    <TagModal
      tag={decodeURIComponent(tag)}
      onClose={() => navigate(-1)}
      onBack={() => navigate(-1)}
      canGoBack
    />
  )
}

export default function FeedShell() {
  const location = useLocation()
  const pathname = location.pathname

  let overlay: React.ReactNode = null
  if (pathname.startsWith('/post/')) {
    overlay = <PostOverlay />
  } else if (pathname.startsWith('/profile/')) {
    overlay = <ProfileOverlay />
  } else if (pathname.startsWith('/tag/')) {
    overlay = <TagOverlay />
  }

  return (
    <>
      <FeedPage />
      {overlay}
    </>
  )
}
