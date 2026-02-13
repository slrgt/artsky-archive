import { Link } from 'react-router-dom'

interface TagLinkProps {
  tag: string
  className?: string
  onClick?: (e: React.MouseEvent) => void
  children: React.ReactNode
}

/** Link to tag page (full-page mode: normal navigation). */
export default function TagLink({ tag, className, onClick, children }: TagLinkProps) {
  const tagSlug = encodeURIComponent(tag.replace(/^#/, ''))
  return (
    <Link to={`/tag/${tagSlug}`} className={className} onClick={onClick}>
      {children}
    </Link>
  )
}
