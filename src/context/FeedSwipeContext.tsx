import { createContext, useContext, type ReactNode } from 'react'
import type { FeedSource } from '../types'

type FeedSwipeContextValue = {
  feedSources: FeedSource[]
  setSingleFeed: (source: FeedSource) => void
}

const FeedSwipeContext = createContext<FeedSwipeContextValue | null>(null)

export function useFeedSwipe() {
  return useContext(FeedSwipeContext)
}

export function FeedSwipeProvider({
  feedSources,
  setSingleFeed,
  children,
}: {
  feedSources: FeedSource[]
  setSingleFeed: (source: FeedSource) => void
  children: ReactNode
}) {
  return (
    <FeedSwipeContext.Provider value={{ feedSources, setSingleFeed }}>
      {children}
    </FeedSwipeContext.Provider>
  )
}
