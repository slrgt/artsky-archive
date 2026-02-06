import { AtpAgent, type AtpSessionData, type AtpSessionEvent } from '@atproto/api'

const BSKY_SERVICE = 'https://bsky.social'
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

/** Handles shown in the guest feed when not logged in */
export const GUEST_FEED_HANDLES = ['studio.blender.org', 'godotengine.org', 'stsci.edu']

/** Fetch and merge author feeds for guest (no login). cursor = offset as string. */
export async function getGuestFeed(
  limit: number,
  cursor?: string,
): Promise<{ feed: TimelineItem[]; cursor: string | undefined }> {
  const offset = cursor ? parseInt(cursor, 10) || 0 : 0
  const need = offset + limit
  const perHandle = Math.ceil(need / GUEST_FEED_HANDLES.length) + 5
  const results = await Promise.all(
    GUEST_FEED_HANDLES.map((actor) =>
      agent.getAuthorFeed({ actor, limit: perHandle }).catch(() => ({ data: { feed: [] } })),
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

/** Typeahead search for actors (usernames). */
export async function searchActorsTypeahead(q: string, limit = 10) {
  const term = q.trim()
  if (!term) return { actors: [] }
  const res = await agent.app.bsky.actor.searchActorsTypeahead({ q: term, limit })
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
