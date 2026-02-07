import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import PostDetailModal from '../components/PostDetailModal'
import ProfileModal from '../components/ProfileModal'

type ModalState =
  | { type: 'post'; uri: string; openReply?: boolean }
  | { type: 'profile'; handle: string }
  | null

type ProfileModalContextValue = {
  openProfileModal: (handle: string) => void
  closeProfileModal: () => void
  openPostModal: (uri: string, openReply?: boolean) => void
  closePostModal: () => void
  /** Close whichever modal is open (post or profile). */
  closeModal: () => void
  /** True if any modal (post or profile) is open. */
  isModalOpen: boolean
}

const ProfileModalContext = createContext<ProfileModalContextValue | null>(null)

export function ProfileModalProvider({ children }: { children: ReactNode }) {
  const [modalState, setModalState] = useState<ModalState>(null)

  const openProfileModal = useCallback((handle: string) => {
    setModalState({ type: 'profile', handle })
  }, [])

  const closeProfileModal = useCallback(() => {
    setModalState((s) => (s?.type === 'profile' ? null : s))
  }, [])

  const openPostModal = useCallback((uri: string, openReply?: boolean) => {
    setModalState({ type: 'post', uri, openReply })
  }, [])

  const closePostModal = useCallback(() => {
    setModalState((s) => (s?.type === 'post' ? null : s))
  }, [])

  const closeModal = useCallback(() => {
    setModalState(null)
  }, [])

  const isModalOpen = modalState !== null

  const value: ProfileModalContextValue = {
    openProfileModal,
    closeProfileModal,
    openPostModal,
    closePostModal,
    closeModal,
    isModalOpen,
  }

  return (
    <ProfileModalContext.Provider value={value}>
      {children}
      {modalState?.type === 'post' && (
        <PostDetailModal
          uri={modalState.uri}
          openReply={modalState.openReply}
          onClose={closeModal}
        />
      )}
      {modalState?.type === 'profile' && (
        <ProfileModal
          handle={modalState.handle}
          onClose={closeModal}
        />
      )}
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
      closeModal: () => {},
      isModalOpen: false,
    }
  }
  return ctx
}
