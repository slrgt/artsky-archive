import { useSearchParams, Navigate } from 'react-router-dom'
import Layout from '../components/Layout'
import { SearchContent } from '../components/SearchModal'

export default function SearchPage() {
  const [searchParams] = useSearchParams()
  const query = searchParams.get('q') ?? ''

  if (!query.trim()) {
    return <Navigate to="/feed" replace />
  }

  return (
    <Layout title={`Search: ${query}`} showNav>
      <SearchContent query={query} />
    </Layout>
  )
}
