import { Link } from 'react-router-dom'

interface ProfileLinkProps {
  handle: string
  className?: string
  title?: string
  'aria-label'?: string
  onClick?: (e: React.MouseEvent) => void
  children: React.ReactNode
}

/** Link to profile page (full-page mode: normal navigation). */
export default function ProfileLink({ handle, className, title, 'aria-label': ariaLabel, onClick, children }: ProfileLinkProps) {
  return (
    <Link
      to={`/profile/${encodeURIComponent(handle)}`}
      className={className}
      title={title}
      aria-label={ariaLabel}
      onClick={onClick}
    >
      {children}
    </Link>
  )
}
