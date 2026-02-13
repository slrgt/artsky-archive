import { createContext, useContext, type ReactNode } from 'react'

/** When inside AppModal, provides the modal's scroll container ref for virtualization. */
const ModalScrollContext = createContext<React.RefObject<HTMLDivElement | null> | null>(null)

export function ModalScrollProvider({
  scrollRef,
  children,
}: {
  scrollRef: React.RefObject<HTMLDivElement | null>
  children: ReactNode
}) {
  return (
    <ModalScrollContext.Provider value={scrollRef}>
      {children}
    </ModalScrollContext.Provider>
  )
}

export function useModalScroll(): React.RefObject<HTMLDivElement | null> | null {
  return useContext(ModalScrollContext)
}
