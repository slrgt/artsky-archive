import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'

const STORAGE_KEY = 'artsky-feed-media-only'

type MediaOnlyContextValue = {
  /** When true, feed shows only posts with images/videos. When false, show all posts. */
  mediaOnly: boolean
  setMediaOnly: (value: boolean) => void
  toggleMediaOnly: () => void
}

const MediaOnlyContext = createContext<MediaOnlyContextValue | null>(null)

function getStored(): boolean {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return v !== '0' && v !== 'false'
  } catch {
    return true
  }
}

export function MediaOnlyProvider({ children }: { children: ReactNode }) {
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

  const toggleMediaOnly = useCallback(() => {
    setMediaOnlyState((v) => !v)
  }, [])

  return (
    <MediaOnlyContext.Provider value={{ mediaOnly, setMediaOnly, toggleMediaOnly }}>
      {children}
    </MediaOnlyContext.Provider>
  )
}

export function useMediaOnly() {
  const ctx = useContext(MediaOnlyContext)
  if (!ctx) {
    return { mediaOnly: true, setMediaOnly: () => {}, toggleMediaOnly: () => {} }
  }
  return ctx
}
