import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { useSyncExternalStore } from 'react'
import { useSession } from './SessionContext'
import { useToast } from './ToastContext'

const STORAGE_KEY = 'artsky-view-mode'
const DESKTOP_BREAKPOINT = 768

export type ViewMode = '1' | '2' | '3'

const VIEW_OPTIONS: ViewMode[] = ['1', '2', '3']

/** Human-readable labels: view N = N Columns */
export const VIEW_LABELS: Record<ViewMode, string> = {
  '1': '1 Column',
  '2': '2 Columns',
  '3': '3 Columns',
}

type ViewModeContextValue = {
  viewMode: ViewMode
  setViewMode: (mode: ViewMode) => void
  /** Cycle 1 → 2 → 3 → 1 (uses current state, safe for header toggle). Shows toast unless options.showToast is false. */
  cycleViewMode: (anchor?: HTMLElement, options?: { showToast?: boolean }) => void
  viewOptions: ViewMode[]
}

const ViewModeContext = createContext<ViewModeContextValue | null>(null)

function getStored(): ViewMode | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === '1' || v === '2' || v === '3') return v
    if (v === '4' || v === '5') return '3' /* migrate old 4/5 column preference to 3 */
  } catch {
    // ignore
  }
  return null
}

function getDesktopSnapshot() {
  return typeof window !== 'undefined' ? window.innerWidth >= DESKTOP_BREAKPOINT : false
}
function subscribeDesktop(cb: () => void) {
  if (typeof window === 'undefined') return () => {}
  const mq = window.matchMedia(`(min-width: ${DESKTOP_BREAKPOINT}px)`)
  mq.addEventListener('change', cb)
  return () => mq.removeEventListener('change', cb)
}

export function ViewModeProvider({ children }: { children: React.ReactNode }) {
  const { session } = useSession()
  const toast = useToast()
  const isDesktop = useSyncExternalStore(subscribeDesktop, getDesktopSnapshot, () => false)
  const stored = getStored()
  const defaultMode: ViewMode = !session && isDesktop ? '3' : '2'
  const [viewMode, setViewModeState] = useState<ViewMode>(() => {
    const v = stored ?? defaultMode
    return v === '1' || v === '2' || v === '3' ? v : defaultMode
  })

  useEffect(() => {
    if (getStored() !== null) return
    const nextDefault: ViewMode = !session && isDesktop ? '3' : '2'
    setViewModeState((prev) => (prev === nextDefault ? prev : nextDefault))
  }, [session, isDesktop])

  const setViewMode = useCallback((mode: ViewMode) => {
    const safe: ViewMode = mode === '1' || mode === '2' || mode === '3' ? mode : '2'
    setViewModeState(safe)
    try {
      localStorage.setItem(STORAGE_KEY, safe)
    } catch {
      // ignore
    }
  }, [])

  const cycleViewMode = useCallback((_anchor?: HTMLElement, options?: { showToast?: boolean }) => {
    setViewModeState((prev) => {
      const i = VIEW_OPTIONS.indexOf(prev)
      const next: ViewMode = VIEW_OPTIONS[i >= 0 ? (i + 1) % VIEW_OPTIONS.length : 0]
      try {
        localStorage.setItem(STORAGE_KEY, next)
      } catch {
        // ignore
      }
      if (options?.showToast !== false) toast?.showToast(VIEW_LABELS[next])
      return next
    })
  }, [toast])

  const value: ViewModeContextValue = {
    viewMode,
    setViewMode,
    cycleViewMode,
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
