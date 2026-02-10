import { Link } from 'react-router-dom'
import { useProfileModal } from '../context/ProfileModalContext'

interface ProfileLinkProps {
  handle: string
  className?: string
  title?: string
  'aria-label'?: string
  onClick?: (e: React.MouseEvent) => void
  children: React.ReactNode
}

/** Link that opens profile in the modal lightbox instead of navigating. */
export default function ProfileLink({ handle, className, title, 'aria-label': ariaLabel, onClick, children }: ProfileLinkProps) {
  const { openProfileModal } = useProfileModal()
  return (
    <Link
      to={`/profile/${encodeURIComponent(handle)}`}
      className={className}
      title={title}
      aria-label={ariaLabel}
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        openProfileModal(handle)
        onClick?.(e)
      }}
    >
      {children}
    </Link>
  )
}
