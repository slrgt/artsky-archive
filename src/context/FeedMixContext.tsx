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

function sameSource(a: FeedSource, b: FeedSource): boolean {
  return (a.uri ?? a.label) === (b.uri ?? b.label)
}

type FeedMixContextValue = {
  entries: FeedMixEntry[]
  enabled: boolean
  setEnabled: (v: boolean) => void
  setEntryPercent: (index: number, percent: number) => void
  addEntry: (source: FeedSource) => void
  removeEntry: (index: number) => void
  /** Toggle source in mix: add with equal split if absent, remove and rebalance if present */
  toggleSource: (source: FeedSource) => void
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
      if (prev.some((e) => sameSource(e.source, source))) return prev
      const next = [...prev, { source, percent: 0 }]
      const n = next.length
      const base = Math.floor(100 / n)
      let remainder = 100 - base * n
      next.forEach((e, i) => {
        next[i] = { ...e, percent: base + (remainder > 0 ? 1 : 0) }
        if (remainder > 0) remainder -= 1
      })
      return next
    })
    setEnabledState(true)
  }, [])

  function rebalance(entries: FeedMixEntry[]): FeedMixEntry[] {
    if (entries.length <= 1) return entries.map((e) => ({ ...e, percent: entries.length === 1 ? 100 : 0 }))
    const n = entries.length
    const base = Math.floor(100 / n)
    let remainder = 100 - base * n
    return entries.map((e) => {
      const p = base + (remainder > 0 ? 1 : 0)
      if (remainder > 0) remainder -= 1
      return { ...e, percent: p }
    })
  }

  const removeEntry = useCallback((index: number) => {
    setEntries((prev) => rebalance(prev.filter((_, i) => i !== index)))
  }, [])

  const toggleSource = useCallback((source: FeedSource) => {
    setEntries((prev) => {
      const idx = prev.findIndex((e) => sameSource(e.source, source))
      if (idx >= 0) return rebalance(prev.filter((_, i) => i !== idx))
      const next = [...prev, { source, percent: 0 }]
      const n = next.length
      const base = Math.floor(100 / n)
      let remainder = 100 - base * n
      next.forEach((e, i) => {
        next[i] = { ...e, percent: base + (remainder > 0 ? 1 : 0) }
        if (remainder > 0) remainder -= 1
      })
      return next
    })
    setEnabledState(true)
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
      toggleSource,
      totalPercent,
    }),
    [entries, enabled, setEnabled, setEntryPercent, addEntry, removeEntry, toggleSource, totalPercent]
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
      toggleSource: () => {},
      totalPercent: 0,
    }
  }
  return ctx
}
