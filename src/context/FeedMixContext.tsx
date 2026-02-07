import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { FeedMixEntry, FeedSource } from '../types'

const STORAGE_KEY = 'artsky-feed-mix'

function loadStored(): { entries: FeedMixEntry[]; enabled: boolean } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { entries: [], enabled: false }
    const parsed = JSON.parse(raw) as { entries?: FeedMixEntry[]; enabled?: boolean }
    const entries = Array.isArray(parsed?.entries) ? parsed.entries : []
    return { entries, enabled: !!parsed?.enabled }
  } catch {
    return { entries: [], enabled: false }
  }
}

function save(entries: FeedMixEntry[], enabled: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ entries, enabled }))
  } catch {
    // ignore
  }
}

type FeedMixContextValue = {
  entries: FeedMixEntry[]
  enabled: boolean
  setEnabled: (v: boolean) => void
  setEntryPercent: (index: number, percent: number) => void
  addEntry: (source: FeedSource) => void
  removeEntry: (index: number) => void
  totalPercent: number
}

const FeedMixContext = createContext<FeedMixContextValue | null>(null)

export function FeedMixProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<FeedMixEntry[]>(() => loadStored().entries)
  const [enabled, setEnabledState] = useState(() => loadStored().enabled)

  useEffect(() => {
    save(entries, enabled)
  }, [entries, enabled])

  const setEnabled = useCallback((v: boolean) => {
    setEnabledState(v)
  }, [])

  const setEntryPercent = useCallback((index: number, percent: number) => {
    const n = Math.max(0, Math.min(100, Math.round(percent)))
    setEntries((prev) => {
      const next = prev.map((e, i) => (i === index ? { ...e, percent: n } : e))
      return next
    })
  }, [])

  const addEntry = useCallback((source: FeedSource) => {
    setEntries((prev) => {
      if (prev.some((e) => (e.source.uri ?? e.source.label) === (source.uri ?? source.label))) return prev
      return [...prev, { source, percent: 0 }]
    })
  }, [])

  const removeEntry = useCallback((index: number) => {
    setEntries((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const totalPercent = useMemo(() => entries.reduce((s, e) => s + e.percent, 0), [entries])

  const value = useMemo(
    () => ({
      entries,
      enabled,
      setEnabled,
      setEntryPercent,
      addEntry,
      removeEntry,
      totalPercent,
    }),
    [entries, enabled, setEnabled, setEntryPercent, addEntry, removeEntry, totalPercent]
  )

  return <FeedMixContext.Provider value={value}>{children}</FeedMixContext.Provider>
}

export function useFeedMix() {
  const ctx = useContext(FeedMixContext)
  if (!ctx) {
    return {
      entries: [] as FeedMixEntry[],
      enabled: false,
      setEnabled: () => {},
      setEntryPercent: () => {},
      addEntry: () => {},
      removeEntry: () => {},
      totalPercent: 0,
    }
  }
  return ctx
}
