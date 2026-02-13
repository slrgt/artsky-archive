import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'

/**
 * Full-page mode: all "modal" opens navigate to full page routes instead of showing overlays.
 * No modals are rendered; everything uses standard routing.
 */
type ProfileModalContextValue = {
  openProfileModal: (handle: string) => void
  closeProfileModal: () => void
  openPostModal: (uri: string, openReply?: boolean, focusUri?: string) => void
  closePostModal: () => void
  openTagModal: (tag: string) => void
  openSearchModal: (query: string) => void
  openForumModal: () => void
  openForumPostModal: (documentUri: string) => void
  openArtboardsModal: () => void
  openArtboardModal: (id: string) => void
  openQuotesModal: (postUri: string) => void
  closeModal: () => void
  closeAllModals: () => void
  isModalOpen: boolean
  canGoBack: boolean
  modalScrollHidden: boolean
  setModalScrollHidden: (v: boolean) => void
}

const ProfileModalContext = createContext<ProfileModalContextValue | null>(null)

export function ProfileModalProvider({ children }: { children: ReactNode }) {
  const [modalScrollHidden, setModalScrollHidden] = useState(false)
  const navigate = useNavigate()

  const goBack = useCallback(() => {
    navigate(-1)
  }, [navigate])

  const goFeed = useCallback(() => {
    navigate('/feed')
  }, [navigate])

  const openProfileModal = useCallback(
    (handle: string) => {
      navigate(`/profile/${encodeURIComponent(handle)}`)
    },
    [navigate]
  )

  const openPostModal = useCallback(
    (uri: string, openReply?: boolean, focusUri?: string) => {
      const params = new URLSearchParams()
      if (openReply) params.set('reply', '1')
      if (focusUri) params.set('focus', focusUri)
      const qs = params.toString()
      navigate(`/post/${encodeURIComponent(uri)}${qs ? `?${qs}` : ''}`)
    },
    [navigate]
  )

  const openTagModal = useCallback(
    (tag: string) => {
      const slug = tag.replace(/^#/, '')
      navigate(`/tag/${encodeURIComponent(slug)}`)
    },
    [navigate]
  )

  const openSearchModal = useCallback(
    (query: string) => {
      navigate(`/search?q=${encodeURIComponent(query)}`)
    },
    [navigate]
  )

  const openForumModal = useCallback(() => {
    navigate('/forum')
  }, [navigate])

  const openForumPostModal = useCallback(
    (documentUri: string) => {
      navigate(`/forum/post?uri=${encodeURIComponent(documentUri)}`)
    },
    [navigate]
  )

  const openArtboardsModal = useCallback(() => {
    navigate('/artboards')
  }, [navigate])

  const openArtboardModal = useCallback(
    (id: string) => {
      navigate(`/artboard/${encodeURIComponent(id)}`)
    },
    [navigate]
  )

  const openQuotesModal = useCallback(
    (postUri: string) => {
      navigate(`/quotes?post=${encodeURIComponent(postUri)}`)
    },
    [navigate]
  )

  const value: ProfileModalContextValue = {
    openProfileModal,
    closeProfileModal: goBack,
    openPostModal,
    closePostModal: goBack,
    openTagModal,
    openSearchModal,
    openForumModal,
    openForumPostModal,
    openArtboardsModal,
    openArtboardModal,
    openQuotesModal,
    closeModal: goBack,
    closeAllModals: goFeed,
    isModalOpen: false,
    canGoBack: false,
    modalScrollHidden,
    setModalScrollHidden,
  }

  return (
    <ProfileModalContext.Provider value={value}>
      {children}
    </ProfileModalContext.Provider>
  )
}

export function useProfileModal() {
  const ctx = useContext(ProfileModalContext)
  if (!ctx) {
    return {
      openProfileModal: () => {},
      closeProfileModal: () => {},
      openPostModal: () => {},
      closePostModal: () => {},
      openTagModal: () => {},
      openSearchModal: () => {},
      openForumModal: () => {},
      openForumPostModal: () => {},
      openArtboardsModal: () => {},
      openArtboardModal: () => {},
      openQuotesModal: () => {},
      closeModal: () => {},
      closeAllModals: () => {},
      isModalOpen: false,
      canGoBack: false,
      modalScrollHidden: false,
      setModalScrollHidden: () => {},
    }
  }
  return ctx
}
