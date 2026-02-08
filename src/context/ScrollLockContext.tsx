import { createContext, useCallback, useContext, useRef, type ReactNode } from 'react'

type ScrollLockContextValue = {
  lockScroll: () => void
  unlockScroll: () => void
}

const ScrollLockContext = createContext<ScrollLockContextValue | null>(null)

export function ScrollLockProvider({ children }: { children: ReactNode }) {
  const countRef = useRef(0)

  const lockScroll = useCallback(() => {
    countRef.current += 1
    if (countRef.current === 1) {
      document.body.style.overflow = 'hidden'
      document.body.style.touchAction = 'none'
      document.documentElement.style.overflow = 'hidden'
    }
  }, [])

  const unlockScroll = useCallback(() => {
    if (countRef.current > 0) countRef.current -= 1
    if (countRef.current === 0) {
      document.body.style.overflow = ''
      document.body.style.touchAction = ''
      document.documentElement.style.overflow = ''
    }
  }, [])

  const value: ScrollLockContextValue = { lockScroll, unlockScroll }

  return (
    <ScrollLockContext.Provider value={value}>
      {children}
    </ScrollLockContext.Provider>
  )
}

export function useScrollLock(): ScrollLockContextValue | null {
  return useContext(ScrollLockContext)
}
