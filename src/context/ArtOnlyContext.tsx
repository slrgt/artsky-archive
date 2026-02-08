import { createContext, useCallback, useContext, useEffect, useState } from 'react'

const STORAGE_KEY = 'artsky-card-view'

export type CardViewMode = 'default' | 'artOnly' | 'minimalist'

type ArtOnlyContextValue = {
  /** Current card view: default (full), artOnly (focus on art), minimalist (only collect + like) */
  cardViewMode: CardViewMode
  setCardViewMode: (value: CardViewMode) => void
  /** Cycle: default → minimalist → artOnly → default (eye: open → half → closed) */
  cycleCardView: () => void
  /** True when mode is artOnly or minimalist (hide full text/handle in card) */
  artOnly: boolean
  /** True when mode is minimalist (only collect + like buttons) */
  minimalist: boolean
  /** @deprecated use setCardViewMode */
  setArtOnly: (value: boolean) => void
  /** @deprecated use cycleCardView */
  toggleArtOnly: () => void
}

const ArtOnlyContext = createContext<ArtOnlyContextValue | null>(null)

function getStored(): CardViewMode {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === 'artOnly' || v === 'minimalist') return v
    if (v === '1' || v === 'true') return 'artOnly' // legacy
    return 'default'
  } catch {
    return 'default'
  }
}

export function ArtOnlyProvider({ children }: { children: React.ReactNode }) {
  const [cardViewMode, setCardViewModeState] = useState<CardViewMode>(getStored)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, cardViewMode)
    } catch {
      // ignore
    }
  }, [cardViewMode])

  const setCardViewMode = useCallback((value: CardViewMode) => {
    setCardViewModeState(value)
  }, [])

  const cycleCardView = useCallback(() => {
    setCardViewModeState((m) => (m === 'default' ? 'minimalist' : m === 'minimalist' ? 'artOnly' : 'default'))
  }, [])

  const setArtOnly = useCallback((value: boolean) => {
    setCardViewModeState(value ? 'artOnly' : 'default')
  }, [])

  const toggleArtOnly = useCallback(() => {
    cycleCardView()
  }, [cycleCardView])

  const artOnly = cardViewMode !== 'default'
  const minimalist = cardViewMode === 'minimalist'

  const value: ArtOnlyContextValue = {
    cardViewMode,
    setCardViewMode,
    cycleCardView,
    artOnly,
    minimalist,
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
    return {
      cardViewMode: 'default' as CardViewMode,
      setCardViewMode: () => {},
      cycleCardView: () => {},
      artOnly: false,
      minimalist: false,
      setArtOnly: () => {},
      toggleArtOnly: () => {},
    }
  }
  return ctx
}
