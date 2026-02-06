import { AtpAgent, type AtpSessionData, type AtpSessionEvent } from '@atproto/api'
import { GUEST_FEED_ACCOUNTS } from '../config/guestFeed'

const BSKY_SERVICE = 'https://bsky.social'
/** Public AppView for unauthenticated reads (profiles, feeds). */
const PUBLIC_BSKY = 'https://public.api.bsky.app'
const SESSION_KEY = 'artsky-bsky-session'
const ACCOUNTS_KEY = 'artsky-accounts'

type AccountsStore = { activeDid: string | null; sessions: Record<string, AtpSessionData> }

function getAccounts(): AccountsStore {
  try {
    const raw = localStorage.getItem(ACCOUNTS_KEY)
    if (!raw) return { activeDid: null, sessions: {} }
    const parsed = JSON.parse(raw) as AccountsStore
    return { activeDid: parsed.activeDid ?? null, sessions: parsed.sessions ?? {} }
  } catch {
    return { activeDid: null, sessions: {} }
  }
}

function saveAccounts(accounts: AccountsStore) {
  try {
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts))
  } catch {
    // ignore
  }
}

function persistSession(_evt: AtpSessionEvent, session: AtpSessionData | undefined) {
  const accounts = getAccounts()
  if (session) {
    accounts.sessions[session.did] = session
    accounts.activeDid = session.did
    saveAccounts(accounts)
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify(session))
    } catch {
      // ignore
    }
  } else {
    if (accounts.activeDid) {
      delete accounts.sessions[accounts.activeDid]
      const remaining = Object.keys(accounts.sessions)
      accounts.activeDid = remaining[0] ?? null
      saveAccounts(accounts)
    }
    try {
      if (accounts.activeDid) {
        localStorage.setItem(SESSION_KEY, JSON.stringify(accounts.sessions[accounts.activeDid]))
      } else {
        localStorage.removeItem(SESSION_KEY)
      }
    } catch {
      // ignore
    }
  }
}

function getStoredSession(): AtpSessionData | null {
  let accounts = getAccounts()
  if (!accounts.activeDid) {
    try {
      const raw = localStorage.getItem(SESSION_KEY)
      if (raw) {
        const session = JSON.parse(raw) as AtpSessionData
        if (session?.did) {
          accounts = { activeDid: session.did, sessions: { [session.did]: session } }
          saveAccounts(accounts)
          return session
        }
        return session
      }
    } catch {
      // ignore
    }
    return null
  }
  return accounts.sessions[accounts.activeDid] ?? null
}

/** All stored sessions (for account switcher). */
export function getSessionsList(): AtpSessionData[] {
  const accounts = getAccounts()
  if (Object.keys(accounts.sessions).length === 0) {
    const single = getStoredSession()
    if (single) return [single]
    return []
  }
  return Object.values(accounts.sessions)
}

/** Switch active account to the given did; resumes that session on the agent. */
export async function switchAccount(did: string): Promise<boolean> {
  const accounts = getAccounts()
  const session = accounts.sessions[did]
  if (!session?.accessJwt) return false
  try {
    accounts.activeDid = did
    saveAccounts(accounts)
    localStorage.setItem(SESSION_KEY, JSON.stringify(session))
    await agent.resumeSession(session)
    return true
  } catch {
    return false
  }
}

export const agent = new AtpAgent({
  service: BSKY_SERVICE,
  persistSession,
})

/** Agent for unauthenticated reads (profiles, author feeds). Use when no session. */
export const publicAgent = new AtpAgent({ service: PUBLIC_BSKY })

/** Handles for the guest feed (from config). Re-exported for convenience. */
export const GUEST_FEED_HANDLES = GUEST_FEED_ACCOUNTS.map((a) => a.handle)

/** Fetch and merge author feeds for guest (no login). Uses public API so it works when logged out. cursor = offset as string. */
export async function getGuestFeed(
  limit: number,
  cursor?: string,
): Promise<{ feed: TimelineItem[]; cursor: string | undefined }> {
  const offset = cursor ? parseInt(cursor, 10) || 0 : 0
  const need = offset + limit
  const perHandle = Math.ceil(need / GUEST_FEED_HANDLES.length) + 5
  const results = await Promise.all(
    GUEST_FEED_HANDLES.map((actor) =>
      publicAgent.getAuthorFeed({ actor, limit: perHandle }).catch(() => ({ data: { feed: [] } })),
    ),
  )
  const all = results.flatMap((r) => (r.data.feed || []) as TimelineItem[])
  const seen = new Set<string>()
  const deduped = all.filter((item) => {
    if (seen.has(item.post.uri)) return false
    seen.add(item.post.uri)
    return true
  })
  deduped.sort((a, b) => {
    const ta = new Date((a.post.record as { createdAt?: string })?.createdAt ?? 0).getTime()
    const tb = new Date((b.post.record as { createdAt?: string })?.createdAt ?? 0).getTime()
    return tb - ta
  })
  const feed = deduped.slice(offset, offset + limit)
  const nextCursor = deduped.length >= offset + limit ? String(offset + limit) : undefined
  return { feed, cursor: nextCursor }
}

export async function resumeSession(): Promise<boolean> {
  const session = getStoredSession()
  if (!session?.accessJwt) return false
  try {
    await agent.resumeSession(session)
    return true
  } catch {
    try {
      localStorage.removeItem(SESSION_KEY)
    } catch {
      // ignore
    }
    return false
  }
}

export async function login(identifier: string, password: string) {
  const res = await agent.login({ identifier, password })
  return res
}

export async function createAccount(opts: {
  email: string
  password: string
  handle: string
}) {
  const res = await agent.createAccount({
    email: opts.email.trim(),
    password: opts.password,
    handle: opts.handle.trim().toLowerCase().replace(/^@/, ''),
  })
  return res
}

/** Remove current account from the list. If another account exists, switch to it. Returns true if still logged in (switched to another). */
export function logoutCurrentAccount(): boolean {
  const accounts = getAccounts()
  if (accounts.activeDid) {
    delete accounts.sessions[accounts.activeDid]
    const remaining = Object.keys(accounts.sessions)
    accounts.activeDid = remaining[0] ?? null
    saveAccounts(accounts)
    if (accounts.activeDid) {
      const next = accounts.sessions[accounts.activeDid]
      try {
        localStorage.setItem(SESSION_KEY, JSON.stringify(next))
        agent.resumeSession(next)
        return true
      } catch {
        return false
      }
    }
  }
  try {
    localStorage.removeItem(SESSION_KEY)
  } catch {
    // ignore
  }
  return false
}

export function logout() {
  if (!logoutCurrentAccount()) {
    // No other account; storage already cleared
  }
}

export function getSession() {
  return agent.session ?? null
}

export type TimelineResponse = Awaited<ReturnType<typeof agent.getTimeline>>
export type TimelineItem = TimelineResponse['data']['feed'][number]
export type PostView = TimelineItem['post']
export type ThreadView = Awaited<ReturnType<typeof agent.getPostThread>>['data']['thread']

export type PostMediaInfo = {
  url: string
  type: 'image' | 'video'
  imageCount?: number
  videoPlaylist?: string
}

/** Returns media info for a post: thumbnail/first image URL, type, and for video the playlist URL. */
export function getPostMediaInfo(post: PostView): PostMediaInfo | null {
  const embed = post.embed as
    | {
        $type?: string
        images?: { thumb: string; fullsize: string }[]
        thumbnail?: string
        playlist?: string
      }
    | undefined
  if (!embed) return null
  if (embed.$type === 'app.bsky.embed.images#view' && embed.images?.length) {
    const img = embed.images[0]
    return {
      url: img.fullsize ?? img.thumb ?? '',
      type: 'image',
      imageCount: embed.images.length,
    }
  }
  if (embed.$type === 'app.bsky.embed.video#view') {
    const thumb = embed.thumbnail ?? ''
    const playlist = embed.playlist ?? ''
    return { url: thumb, type: 'video', videoPlaylist: playlist || undefined }
  }
  // recordWithMedia: media can be in .media
  const media = (embed as {
    media?: {
      $type?: string
      images?: { fullsize?: string; thumb?: string }[]
      thumbnail?: string
      playlist?: string
    }
  }).media
  if (media?.$type === 'app.bsky.embed.images#view' && media.images?.length) {
    const img = media.images[0]
    return {
      url: img.fullsize ?? img.thumb ?? '',
      type: 'image',
      imageCount: media.images.length,
    }
  }
  if (media?.$type === 'app.bsky.embed.video#view') {
    const playlist = (media as { playlist?: string }).playlist
    return {
      url: media.thumbnail ?? '',
      type: 'video',
      videoPlaylist: playlist,
    }
  }
  return null
}

/** Returns all media items in a post (all images + video if any) for gallery view. */
export function getPostAllMedia(post: PostView): Array<{ url: string; type: 'image' | 'video'; videoPlaylist?: string }> {
  const out: Array<{ url: string; type: 'image' | 'video'; videoPlaylist?: string }> = []
  const embed = post.embed as Record<string, unknown> | undefined
  if (!embed) return out
  const e = embed as {
    $type?: string
    images?: { thumb: string; fullsize: string }[]
    thumbnail?: string
    playlist?: string
    media?: { $type?: string; images?: { fullsize?: string; thumb?: string }[]; thumbnail?: string; playlist?: string }
  }
  if (e.$type === 'app.bsky.embed.images#view' && e.images?.length) {
    for (const img of e.images) {
      out.push({ url: img.fullsize ?? img.thumb ?? '', type: 'image' })
    }
    return out
  }
  if (e.$type === 'app.bsky.embed.video#view') {
    out.push({
      url: e.thumbnail ?? '',
      type: 'video',
      videoPlaylist: e.playlist ?? undefined,
    })
    return out
  }
  const media = e.media
  if (media?.$type === 'app.bsky.embed.images#view' && media.images?.length) {
    for (const img of media.images) {
      out.push({ url: img.fullsize ?? img.thumb ?? '', type: 'image' })
    }
    return out
  }
  if (media?.$type === 'app.bsky.embed.video#view') {
    out.push({
      url: media.thumbnail ?? '',
      type: 'video',
      videoPlaylist: media.playlist,
    })
  }
  return out
}

/** @deprecated Use getPostMediaInfo. Returns first image or video thumbnail for card display. */
export function getPostMediaUrl(post: PostView): { url: string; type: 'image' | 'video' } | null {
  const info = getPostMediaInfo(post)
  return info ? { url: info.url, type: info.type } : null
}

/** Typeahead search for actors (usernames). Uses public API when not logged in (e.g. login page). */
export async function searchActorsTypeahead(q: string, limit = 10) {
  const term = q.trim()
  if (!term) return { actors: [] }
  const api = getSession() ? agent : publicAgent
  const res = await api.app.bsky.actor.searchActorsTypeahead({ q: term, limit })
  return res.data
}

/** Get suggested feeds for search dropdown. */
export async function getSuggestedFeeds(limit = 8) {
  try {
    const res = await agent.app.bsky.feed.getSuggestedFeeds({ limit })
    return res.data.feeds
  } catch {
    return []
  }
}

/** Search posts by hashtag (tag without #). Returns PostView[]; use with cursor for pagination. */
export async function searchPostsByTag(tag: string, cursor?: string) {
  const normalized = tag.replace(/^#/, '').trim()
  if (!normalized) return { posts: [], cursor: undefined as string | undefined }
  const res = await agent.app.bsky.feed.searchPosts({
    q: normalized,
    tag: [normalized],
    limit: 30,
    cursor,
    sort: 'latest',
  })
  return { posts: res.data.posts, cursor: res.data.cursor }
}

/** Domain used for standard.site / long-form blog posts. */
export const STANDARD_SITE_DOMAIN = 'standard.site'

/** Search posts that link to a domain (e.g. standard.site). Works with publicAgent when logged out. */
export async function searchPostsByDomain(
  domain: string,
  cursor?: string,
  author?: string
): Promise<{ posts: PostView[]; cursor: string | undefined }> {
  const client = getSession() ? agent : publicAgent
  try {
    const res = await client.app.bsky.feed.searchPosts({
      q: domain,
      domain,
      limit: 30,
      cursor,
      sort: 'latest',
      ...(author ? { author } : {}),
    })
    return { posts: res.data.posts ?? [], cursor: res.data.cursor }
  } catch {
    return { posts: [], cursor: undefined }
  }
}

/** Get the current account's saved/pinned feeds from preferences. Returns array of { id, type, value, pinned }. */
export async function getSavedFeedsFromPreferences(): Promise<
  { id: string; type: string; value: string; pinned: boolean }[]
> {
  const prefs = await agent.getPreferences()
  const list = (prefs as { savedFeeds?: { id: string; type: string; value: string; pinned: boolean }[] }).savedFeeds
  return list ?? []
}

/** Parse a bsky.app profile feed URL into handle and feed slug. e.g. https://bsky.app/profile/foo.bsky.social/feed/for-you -> { handle: 'foo.bsky.social', feedSlug: 'for-you' } */
export function parseBskyFeedUrl(url: string): { handle: string; feedSlug: string } | null {
  const trimmed = url.trim()
  const m = trimmed.match(
    /^https?:\/\/(?:www\.)?bsky\.app\/profile\/([^/]+)\/feed\/([^/?#]+)/
  )
  if (!m) return null
  return { handle: decodeURIComponent(m[1]), feedSlug: decodeURIComponent(m[2]) }
}

/** Resolve a bsky.app feed URL (or at:// URI) to a feed generator at:// URI. Throws if invalid. */
export async function resolveFeedUri(input: string): Promise<string> {
  const trimmed = input.trim()
  if (trimmed.startsWith('at://')) {
    const res = await agent.app.bsky.feed.getFeedGenerator({ feed: trimmed })
    if (res?.data?.view?.uri) return res.data.view.uri
    throw new Error('Invalid feed URI')
  }
  const parsed = parseBskyFeedUrl(trimmed)
  if (!parsed) throw new Error('Enter a feed URI (at://...) or a bsky.app feed URL')
  const profile = await publicAgent.getProfile({ actor: parsed.handle })
  const did = (profile.data as { did?: string }).did
  if (!did) throw new Error('Could not find that profile')
  const uri = `at://${did}/app.bsky.feed.generator/${parsed.feedSlug}`
  const res = await agent.app.bsky.feed.getFeedGenerator({ feed: uri })
  if (!res?.data?.view?.uri) throw new Error('Could not find that feed')
  return res.data.view.uri
}

/** Add a feed to the account's saved feeds (pinned). */
export async function addSavedFeed(uri: string): Promise<void> {
  await agent.addSavedFeeds([{ type: 'feed', value: uri, pinned: true }])
}

/** Get display name for a feed URI. */
export async function getFeedDisplayName(uri: string): Promise<string> {
  const res = await agent.app.bsky.feed.getFeedGenerator({ feed: uri })
  return (res.data?.view as { displayName?: string })?.displayName ?? uri
}

const COMPOSE_IMAGE_MAX = 4
const COMPOSE_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']

/** Create a new post (no reply). Optional image files (max 4, jpeg/png/gif/webp). */
export async function createPost(
  text: string,
  imageFiles?: File[],
): Promise<{ uri: string; cid: string }> {
  const t = text.trim()
  const images = (imageFiles ?? []).filter((f) => COMPOSE_IMAGE_TYPES.includes(f.type)).slice(0, COMPOSE_IMAGE_MAX)
  if (!t && images.length === 0) throw new Error('Post text or at least one image is required')
  let embed: { $type: 'app.bsky.embed.images'; images: { image: unknown; alt: string }[] } | undefined
  if (images.length > 0) {
    const uploaded = await Promise.all(
      images.map(async (file) => {
        const { data } = await agent.uploadBlob(file, { encoding: file.type })
        return { image: data.blob, alt: '' }
      }),
    )
    embed = { $type: 'app.bsky.embed.images', images: uploaded }
  }
  const res = await agent.post({
    text: t || '',
    embed,
    createdAt: new Date().toISOString(),
  })
  return { uri: res.uri, cid: res.cid }
}

/** List notifications for the current account. */
export async function getNotifications(limit = 30, cursor?: string): Promise<{
  notifications: { uri: string; author: { handle?: string; did: string; avatar?: string; displayName?: string }; reason: string; reasonSubject?: string; isRead: boolean; indexedAt: string; replyPreview?: string }[]
  cursor?: string
}> {
  const res = await agent.listNotifications({ limit, cursor })
  const notifications = (res.data.notifications || []).map((n) => {
    const record = (n as { record?: { text?: string } }).record
    const replyPreview = (n.reason === 'reply' || n.reason === 'quote') && record?.text
      ? record.text.slice(0, 120).replace(/\s+/g, ' ').trim() + (record.text.length > 120 ? '…' : '')
      : undefined
    return {
      uri: n.uri,
      author: n.author as { handle?: string; did: string; avatar?: string; displayName?: string },
      reason: n.reason,
      reasonSubject: (n as { reasonSubject?: string }).reasonSubject,
      isRead: n.isRead,
      indexedAt: n.indexedAt,
      replyPreview,
    }
  })
  return { notifications, cursor: res.data.cursor }
}

/** Get unread notification count. */
export async function getUnreadNotificationCount(): Promise<number> {
  const res = await agent.countUnreadNotifications()
  return res.data.count ?? 0
}

/** Post a reply to a post. For top-level reply use same uri/cid for root and parent. */
export async function postReply(
  rootUri: string,
  rootCid: string,
  parentUri: string,
  parentCid: string,
  text: string
) {
  const t = text.trim()
  if (!t) throw new Error('Comment text is required')
  return agent.post({
    text: t,
    createdAt: new Date().toISOString(),
    reply: {
      root: { uri: rootUri, cid: rootCid },
      parent: { uri: parentUri, cid: parentCid },
    },
  })
}
