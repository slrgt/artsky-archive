import type { FeedMixEntry, FeedSource } from '../types'

/**
 * Derives a stable scroll key for a feed so each feed tab/source remembers its own position.
 * - Single feed: "feed:timeline" | "feed:{uri}"
 * - Mixed feed: "feed:mixed:{hash}" where hash is a deterministic string from the mix config
 */
export function getFeedScrollKey(
  source: FeedSource,
  mixEntries: FeedMixEntry[],
  mixTotalPercent: number
): string {
  const useMixed = mixEntries.length >= 2 && mixTotalPercent >= 99
  if (useMixed) {
    const parts = mixEntries
      .map((e) => `${e.source.uri ?? e.source.kind ?? e.source.label}:${e.percent}`)
      .sort()
    return `feed:mixed:${parts.join('|')}`
  }
  const single = mixEntries.length === 1 ? mixEntries[0].source : source
  const id = single.uri ?? (single.kind === 'timeline' ? 'timeline' : single.label ?? '')
  return `feed:${id || 'unknown'}`
}
