import type { FeedSource, FeedMixEntry } from '../types'

/** Feed sources shown when logged out; clicking any feed opens the login modal. */
export const GUEST_FEED_SOURCES: FeedSource[] = [
  { kind: 'timeline', label: 'Following' },
  { kind: 'custom', label: 'For You', uri: 'at://did:plc:z72i7hdynmk6r22z27h6tvur/app.bsky.feed.generator/whats-hot' },
  { kind: 'custom', label: 'Popular With Friends', uri: 'at://did:plc:z72i7hdynmk6r22z27h6tvur/app.bsky.feed.generator/with-friends' },
  { kind: 'custom', label: 'Art', uri: 'at://did:plc:z72i7hdynmk6r22z27h6tvur/app.bsky.feed.generator/art' },
]

/** When logged out, show Following and For You as active (50% each). */
export const GUEST_MIX_ENTRIES: FeedMixEntry[] = [
  { source: GUEST_FEED_SOURCES[0], percent: 50 },
  { source: GUEST_FEED_SOURCES[1], percent: 50 },
]
