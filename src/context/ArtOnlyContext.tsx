import { createContext, useCallback, useContext, useEffect, useState } from 'react'

const STORAGE_KEY = 'artsky-art-only'

type ArtOnlyContextValue = {
  artOnly: boolean
  setArtOnly: (value: boolean) => void
  toggleArtOnly: () => void
}

const ArtOnlyContext = createContext<ArtOnlyContextValue | null>(null)

function getStored(): boolean {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    return v === '1' || v === 'true'
  } catch {
    return false
  }
}

export function ArtOnlyProvider({ children }: { children: React.ReactNode }) {
  const [artOnly, setArtOnlyState] = useState(getStored)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, artOnly ? '1' : '0')
    } catch {
      // ignore
    }
  }, [artOnly])

  const setArtOnly = useCallback((value: boolean) => {
    setArtOnlyState(value)
  }, [])

  const toggleArtOnly = useCallback(() => {
    setArtOnlyState((v) => !v)
  }, [])

  const value: ArtOnlyContextValue = {
    artOnly,
    setArtOnly,
    toggleArtOnly,
  }

  return (
    <ArtOnlyContext.Provider value={value}>
      {children}
    </ArtOnlyContext.Provider>
  )
}

export function useArtOnly() {
  const ctx = useContext(ArtOnlyContext)
  if (!ctx) {
    return { artOnly: false, setArtOnly: () => {}, toggleArtOnly: () => {} }
  }
  return ctx
}
