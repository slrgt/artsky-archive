import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { useToast } from './ToastContext'

const STORAGE_KEY = 'artsky-moderation-nsfw'

export type NsfwPreference = 'nsfw' | 'sfw' | 'blurred'

export const NSFW_CYCLE: readonly NsfwPreference[] = ['sfw', 'blurred', 'nsfw'] as const
export const NSFW_LABELS: Record<NsfwPreference, string> = { sfw: 'SFW', blurred: 'Blurred', nsfw: 'NSFW' }

type ModerationContextValue = {
  nsfwPreference: NsfwPreference
  setNsfwPreference: (p: NsfwPreference, anchor?: HTMLElement, options?: { showToast?: boolean }) => void
  /** Cycle: SFW → Blurred → NSFW → SFW. Shows toast unless options.showToast is false. */
  cycleNsfwPreference: (anchor?: HTMLElement, options?: { showToast?: boolean }) => void
  /** URIs of posts the user has chosen to unblur (blurred mode). Cleared on page refresh. */
  unblurredUris: Set<string>
  setUnblurred: (uri: string, revealed: boolean) => void
}

const ModerationContext = createContext<ModerationContextValue | null>(null)

function getStored(): NsfwPreference {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === 'nsfw' || v === 'sfw' || v === 'blurred') return v
  } catch {
    // ignore
  }
  return 'blurred'
}

export function ModerationProvider({ children }: { children: React.ReactNode }) {
  const toast = useToast()
  const [nsfwPreference, setNsfwPreferenceState] = useState<NsfwPreference>(getStored)
  const [unblurredUris, setUnblurredUris] = useState<Set<string>>(() => new Set())

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, nsfwPreference)
    } catch {
      // ignore
    }
  }, [nsfwPreference])

  const setNsfwPreference = useCallback((p: NsfwPreference, _anchor?: HTMLElement, options?: { showToast?: boolean }) => {
    setNsfwPreferenceState(p)
    if (options?.showToast !== false) toast?.showToast(NSFW_LABELS[p])
  }, [toast])

  const cycleNsfwPreference = useCallback((_anchor?: HTMLElement, options?: { showToast?: boolean }) => {
    setNsfwPreferenceState((prev) => {
      const i = NSFW_CYCLE.indexOf(prev)
      const next = NSFW_CYCLE[(i + 1) % NSFW_CYCLE.length]
      if (options?.showToast !== false) toast?.showToast(NSFW_LABELS[next])
      return next
    })
  }, [toast])

  const setUnblurred = useCallback((uri: string, revealed: boolean) => {
    setUnblurredUris((prev) => {
      const next = new Set(prev)
      if (revealed) next.add(uri)
      else next.delete(uri)
      return next
    })
  }, [])

  const value: ModerationContextValue = {
    nsfwPreference,
    setNsfwPreference,
    cycleNsfwPreference,
    unblurredUris,
    setUnblurred,
  }

  return (
    <ModerationContext.Provider value={value}>
      {children}
    </ModerationContext.Provider>
  )
}

export function useModeration() {
  const ctx = useContext(ModerationContext)
  if (!ctx) {
    return {
      nsfwPreference: 'blurred' as NsfwPreference,
      setNsfwPreference: () => {},
      cycleNsfwPreference: () => {},
      unblurredUris: new Set<string>(),
      setUnblurred: () => {},
    }
  }
  return ctx
}
