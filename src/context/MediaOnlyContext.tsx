import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { useToast } from './ToastContext'

const STORAGE_KEY = 'artsky-feed-media-only'

type MediaOnlyContextValue = {
  /** When true, feed shows only posts with images/videos. When false, show all posts. */
  mediaOnly: boolean
  setMediaOnly: (value: boolean) => void
  toggleMediaOnly: (options?: { showToast?: boolean }) => void
}

const MediaOnlyContext = createContext<MediaOnlyContextValue | null>(null)

function getStored(): boolean {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === null) return false
    return v !== '0' && v !== 'false'
  } catch {
    return false
  }
}

export function MediaOnlyProvider({ children }: { children: ReactNode }) {
  const toast = useToast()
  const [mediaOnly, setMediaOnlyState] = useState(getStored)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, mediaOnly ? '1' : '0')
    } catch {
      // ignore
    }
  }, [mediaOnly])

  const setMediaOnly = useCallback((value: boolean) => {
    setMediaOnlyState(value)
  }, [])

  const toggleMediaOnly = useCallback((options?: { showToast?: boolean }) => {
    setMediaOnlyState((v) => {
      const next = !v
      if (options?.showToast !== false) toast?.showToast(next ? 'Media only' : 'Media and text')
      return next
    })
  }, [toast])

  return (
    <MediaOnlyContext.Provider value={{ mediaOnly, setMediaOnly, toggleMediaOnly }}>
      {children}
    </MediaOnlyContext.Provider>
  )
}

export function useMediaOnly() {
  const ctx = useContext(MediaOnlyContext)
  if (!ctx) {
    return { mediaOnly: false, setMediaOnly: () => {}, toggleMediaOnly: () => {} }
  }
  return ctx
}
