import { createContext, useCallback, useRef, useContext, type ReactNode } from 'react'

type SeenPostsContextValue = {
  /** Register (or unregister with null) the handler that clears seen state and shows all posts. Called when user long-presses Home. */
  setClearSeenHandler: (fn: (() => void) | null) => void
  /** Invoke the registered clear handler (e.g. on Home long-press). No-op if none registered. */
  clearSeenAndShowAll: () => void
  /** Register (or unregister with null) the handler run when Home is clicked while already on feed (hide seen posts + scroll to top). */
  setHomeClickHandler: (fn: (() => void) | null) => void
  /** Invoke the registered Home-click handler. No-op if none registered. */
  onHomeClick: () => void
}

const SeenPostsContext = createContext<SeenPostsContextValue | null>(null)

export function SeenPostsProvider({ children }: { children: ReactNode }) {
  const handlerRef = useRef<(() => void) | null>(null)
  const homeClickRef = useRef<(() => void) | null>(null)

  const setClearSeenHandler = useCallback((fn: (() => void) | null) => {
    handlerRef.current = fn
  }, [])

  const clearSeenAndShowAll = useCallback(() => {
    handlerRef.current?.()
  }, [])

  const setHomeClickHandler = useCallback((fn: (() => void) | null) => {
    homeClickRef.current = fn
  }, [])

  const onHomeClick = useCallback(() => {
    homeClickRef.current?.()
  }, [])

  const value: SeenPostsContextValue = {
    setClearSeenHandler,
    clearSeenAndShowAll,
    setHomeClickHandler,
    onHomeClick,
  }

  return (
    <SeenPostsContext.Provider value={value}>
      {children}
    </SeenPostsContext.Provider>
  )
}

export function useSeenPosts(): SeenPostsContextValue | null {
  return useContext(SeenPostsContext)
}
