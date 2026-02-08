/**
 * Guest feed accounts
 *
 * When users are not logged in, the feed shows posts from these Bluesky accounts
 * and a preview section linking to their profiles. Edit this list to change which
 * accounts appear.
 *
 * - handle: Bluesky handle (e.g. studio.blender.org)
 * - label: Short name shown in the UI (e.g. "Blender", "Godot Engine")
 */
export const GUEST_FEED_ACCOUNTS = [
  { handle: 'studio.blender.org', label: 'Blender' },
  { handle: 'godotengine.org', label: 'Godot Engine' },
  { handle: 'stsci.edu', label: 'NASA / STScI' },
  { handle: 'oseanworld.bsky.social', label: 'Osean World' },
  { handle: 'osean.world', label: 'Osean' },
] as const

export type GuestFeedAccount = (typeof GUEST_FEED_ACCOUNTS)[number]
