import { createContext, useCallback, useContext, useEffect, useState } from 'react'

const STORAGE_KEY = 'artsky-view-mode'
export type ViewMode = '1' | '2' | '3' | '4' | '5'

const VIEW_OPTIONS: ViewMode[] = ['1', '2', '3', '4', '5']

/** Human-readable labels: view N = N columns */
export const VIEW_LABELS: Record<ViewMode, string> = {
  '1': '1 column',
  '2': '2 columns',
  '3': '3 columns',
  '4': '4 columns',
  '5': '5 columns',
}

type ViewModeContextValue = {
  viewMode: ViewMode
  setViewMode: (mode: ViewMode) => void
  viewOptions: ViewMode[]
}

const ViewModeContext = createContext<ViewModeContextValue | null>(null)

function getStored(): ViewMode {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === '1' || v === '2' || v === '3' || v === '4' || v === '5') return v
  } catch {
    // ignore
  }
  return '2'
}

export function ViewModeProvider({ children }: { children: React.ReactNode }) {
  const [viewMode, setViewModeState] = useState<ViewMode>(getStored)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, viewMode)
    } catch {
      // ignore
    }
  }, [viewMode])

  const setViewMode = useCallback((mode: ViewMode) => {
    setViewModeState(mode)
  }, [])

  const value: ViewModeContextValue = {
    viewMode,
    setViewMode,
    viewOptions: VIEW_OPTIONS,
  }

  return (
    <ViewModeContext.Provider value={value}>
      {children}
    </ViewModeContext.Provider>
  )
}

export function useViewMode() {
  const ctx = useContext(ViewModeContext)
  if (!ctx) throw new Error('useViewMode must be used within ViewModeProvider')
  return ctx
}
