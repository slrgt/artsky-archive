import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import PostDetailModal from '../components/PostDetailModal'
import ProfileModal from '../components/ProfileModal'
import TagModal from '../components/TagModal'

export type ModalItem =
  | { type: 'post'; uri: string; openReply?: boolean }
  | { type: 'profile'; handle: string }
  | { type: 'tag'; tag: string }

type ProfileModalContextValue = {
  openProfileModal: (handle: string) => void
  closeProfileModal: () => void
  openPostModal: (uri: string, openReply?: boolean) => void
  closePostModal: () => void
  openTagModal: (tag: string) => void
  /** Go back to previous modal (Q or back button). */
  closeModal: () => void
  /** Close all modals (ESC, backdrop click, or X). */
  closeAllModals: () => void
  /** True if any modal (post or profile or tag) is open. */
  isModalOpen: boolean
  /** True if more than one modal is open (show back button). */
  canGoBack: boolean
}

const ProfileModalContext = createContext<ProfileModalContextValue | null>(null)

/**
 * URL ↔ modal stack: single source of truth for all popups.
 * To add a new modal type: add the variant to ModalItem, then in parseSearchToModalItem (read param)
 * and modalItemToSearch (write param), and in modalItemsMatch. openXxx() just navigates; effect syncs URL → stack.
 */
function parseSearchToModalItem(search: string): ModalItem | null {
  const params = new URLSearchParams(search)
  const postUri = params.get('post')
  if (postUri) return { type: 'post', uri: postUri, openReply: params.get('reply') === '1' }
  const profileHandle = params.get('profile')
  if (profileHandle) return { type: 'profile', handle: profileHandle }
  const tag = params.get('tag')
  if (tag) return { type: 'tag', tag }
  return null
}

function modalItemToSearch(item: ModalItem): string {
  if (item.type === 'post') {
    const s = `post=${encodeURIComponent(item.uri)}`
    return item.openReply ? `${s}&reply=1` : s
  }
  if (item.type === 'profile') return `profile=${encodeURIComponent(item.handle)}`
  if (item.type === 'tag') return `tag=${encodeURIComponent(item.tag)}`
  return ''
}

function modalItemsMatch(a: ModalItem, b: ModalItem): boolean {
  if (a.type !== b.type) return false
  if (a.type === 'post' && b.type === 'post') return a.uri === b.uri && (a.openReply ?? false) === (b.openReply ?? false)
  if (a.type === 'profile' && b.type === 'profile') return a.handle === b.handle
  if (a.type === 'tag' && b.type === 'tag') return a.tag === b.tag
  return false
}

export function ProfileModalProvider({ children }: { children: ReactNode }) {
  const [modalStack, setModalStack] = useState<ModalItem[]>([])
  const location = useLocation()
  const navigate = useNavigate()

  /** Open any modal: only update the URL; one effect syncs URL → stack (works for click and paste/share). */
  const openPostModal = useCallback((uri: string, openReply?: boolean) => {
    navigate({ pathname: location.pathname, search: `?${modalItemToSearch({ type: 'post', uri, openReply })}` })
  }, [location.pathname, navigate])

  const openProfileModal = useCallback((handle: string) => {
    navigate({ pathname: location.pathname, search: `?${modalItemToSearch({ type: 'profile', handle })}` })
  }, [location.pathname, navigate])

  const openTagModal = useCallback((tag: string) => {
    navigate({ pathname: location.pathname, search: `?${modalItemToSearch({ type: 'tag', tag })}` })
  }, [location.pathname, navigate])

  /** Set URL to reflect the new top of stack (or clear if empty). Used after close. */
  const syncUrlToStack = useCallback((nextStack: ModalItem[]) => {
    const search = nextStack.length > 0 ? `?${modalItemToSearch(nextStack[nextStack.length - 1])}` : ''
    navigate({ pathname: location.pathname, search }, { replace: true })
  }, [location.pathname, navigate])

  const closeModal = useCallback(() => {
    setModalStack((prev) => {
      const next = prev.length > 1 ? prev.slice(0, -1) : []
      syncUrlToStack(next)
      return next
    })
  }, [syncUrlToStack])

  const closeAllModals = useCallback(() => {
    setModalStack([])
    syncUrlToStack([])
  }, [syncUrlToStack])

  /** Single source of truth: URL drives which modal(s) are open. One effect syncs URL → stack for all modal types. */
  useEffect(() => {
    const urlTop = parseSearchToModalItem(location.search)
    if (!urlTop) {
      setModalStack([])
      return
    }
    setModalStack((prev) => {
      const top = prev[prev.length - 1]
      if (top && modalItemsMatch(top, urlTop)) return prev
      return [...prev, urlTop]
    })
  }, [location.search])

  const isModalOpen = modalStack.length > 0
  const canGoBack = modalStack.length > 1
  const currentModal = modalStack[modalStack.length - 1] ?? null

  const value: ProfileModalContextValue = {
    openProfileModal,
    closeProfileModal: closeModal,
    closePostModal: closeModal,
    openPostModal,
    openTagModal,
    closeModal,
    closeAllModals,
    isModalOpen,
    canGoBack,
  }

  return (
    <ProfileModalContext.Provider value={value}>
      {children}
      {currentModal?.type === 'post' && (
        <PostDetailModal
          uri={currentModal.uri}
          openReply={currentModal.openReply}
          onClose={closeAllModals}
          onBack={closeModal}
          canGoBack={canGoBack}
        />
      )}
      {currentModal?.type === 'profile' && (
        <ProfileModal
          handle={currentModal.handle}
          onClose={closeAllModals}
          onBack={closeModal}
          canGoBack={canGoBack}
        />
      )}
      {currentModal?.type === 'tag' && (
        <TagModal
          tag={currentModal.tag}
          onClose={closeAllModals}
          onBack={closeModal}
          canGoBack={canGoBack}
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
      openTagModal: () => {},
      closeModal: () => {},
      closeAllModals: () => {},
      isModalOpen: false,
      canGoBack: false,
    }
  }
  return ctx
}
