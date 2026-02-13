import { useSearchParams, useNavigate, Navigate } from 'react-router-dom'
import Layout from '../components/Layout'
import { ForumPostContent } from './ForumPostDetailPage'
import { ArtSkyForumPostContent } from './ArtSkyForumPostDetailPage'

function isArtSkyForumUri(uri: string): boolean {
  return uri.includes('app.artsky.forum.post')
}

export default function ForumPostPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const documentUri = searchParams.get('uri') ?? ''

  if (!documentUri) {
    return <Navigate to="/forum" replace />
  }

  const handleClose = () => navigate(-1)
  const isArtSky = isArtSkyForumUri(documentUri)

  return (
    <Layout title="Forum post" showNav>
      {isArtSky ? (
        <ArtSkyForumPostContent documentUri={documentUri} onClose={handleClose} />
      ) : (
        <ForumPostContent documentUri={documentUri} onClose={handleClose} />
      )}
    </Layout>
  )
}
