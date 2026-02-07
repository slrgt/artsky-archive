import type { PostView, TimelineItem } from './lib/bsky'

export type { PostView, TimelineItem }

export type FeedKind = 'timeline' | 'custom'
export interface FeedSource {
  kind: FeedKind
  label: string
  /** For custom: at://did/app.bsky.feed.generator/... */
  uri?: string
}

/** One feed in the mix with its percentage (0–100). Sum of all entries should be 100. */
export interface FeedMixEntry {
  source: FeedSource
  percent: number
}
