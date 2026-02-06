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

/** Standard.site lexicon collection NSIDs (long-form blogs on AT Protocol). */
export const STANDARD_SITE_DOCUMENT_COLLECTION = 'site.standard.document'
export const STANDARD_SITE_PUBLICATION_COLLECTION = 'site.standard.publication'
/** Standard.site comment lexicon (comments on documents; interoperable with leaflet.pub etc.). */
export const STANDARD_SITE_COMMENT_COLLECTION = 'site.standard.comment'

/** Blob ref as returned from uploadBlob (CID reference). */
export type StandardSiteDocumentBlobRef = { $link: string }

/** A document record from the standard.site lexicon (metadata about a blog post). */
export type StandardSiteDocumentRecord = {
  path?: string
  title?: string
  body?: string
  createdAt?: string
  /** Optional media: array of { image: BlobRef, mimeType: string } for compatibility with uploadBlob shape. */
  media?: Array<{ image: StandardSiteDocumentBlobRef; mimeType?: string }>
  [k: string]: unknown
}

/** Document list item with author and optional base URL for building canonical link. */
export type StandardSiteDocumentView = {
  uri: string
  cid: string
  did: string
  rkey: string
  path: string
  title?: string
  body?: string
  createdAt?: string
  baseUrl?: string
  authorHandle?: string
  authorAvatar?: string
  /** Resolved media URLs for display (built from blob refs). */
  media?: Array<{ url: string; mimeType?: string }>
  /** Raw media refs from the record (for editing: preserve when saving). */
  mediaRefs?: Array<{ image: StandardSiteDocumentBlobRef; mimeType?: string }>
}

/** List site.standard.document records from a repo. Does not require the lexicon to be installed. */
export async function listStandardSiteDocuments(
  client: AtpAgent,
  repo: string,
  opts?: { limit?: number; cursor?: string; reverse?: boolean }
): Promise<{ records: { uri: string; cid: string; value: StandardSiteDocumentRecord }[]; cursor?: string }> {
  const res = await client.com.atproto.repo.listRecords({
    repo,
    collection: STANDARD_SITE_DOCUMENT_COLLECTION,
    limit: opts?.limit ?? 30,
    cursor: opts?.cursor,
    reverse: opts?.reverse ?? true,
  })
  const records = (res.data.records ?? []).map((r: { uri: string; cid: string; value: Record<string, unknown> }) => ({
    uri: r.uri,
    cid: r.cid,
    value: r.value as StandardSiteDocumentRecord,
  }))
  return { records, cursor: res.data.cursor }
}

/** Get the base URL of a publication from a repo (first site.standard.publication record). */
export async function getStandardSitePublicationBaseUrl(client: AtpAgent, repo: string): Promise<string | null> {
  try {
    const res = await client.com.atproto.repo.listRecords({
      repo,
      collection: STANDARD_SITE_PUBLICATION_COLLECTION,
      limit: 1,
    })
    const record = res.data.records?.[0]?.value as { url?: string } | undefined
    return record?.url ?? null
  } catch {
    return null
  }
}

/** Parse an at:// URI into repo (DID), collection, and rkey. */
export function parseAtUri(uri: string): { did: string; collection: string; rkey: string } | null {
  const trimmed = uri.trim()
  if (!trimmed.startsWith('at://')) return null
  const withoutScheme = trimmed.slice('at://'.length)
  const parts = withoutScheme.split('/')
  if (parts.length < 3) return null
  const [did, collection, ...rkeyParts] = parts
  const rkey = rkeyParts.join('/')
  return did && collection && rkey ? { did, collection, rkey } : null
}

/** Fetch a single standard.site document by URI. Returns null if not found or not a site.standard.document. */
export async function getStandardSiteDocument(uri: string): Promise<StandardSiteDocumentView | null> {
  const parsed = parseAtUri(uri)
  if (!parsed || parsed.collection !== STANDARD_SITE_DOCUMENT_COLLECTION) return null
  const client = getSession() ? agent : publicAgent
  try {
    const res = await client.com.atproto.repo.getRecord({
      repo: parsed.did,
      collection: STANDARD_SITE_DOCUMENT_COLLECTION,
      rkey: parsed.rkey,
    })
    const value = res.data?.value as StandardSiteDocumentRecord | undefined
    if (!value) return null
    const [baseUrl, profile] = await Promise.all([
      getStandardSitePublicationBaseUrl(client, parsed.did),
      client.getProfile({ actor: parsed.did }).then((p) => p.data as { handle?: string; avatar?: string }).catch(() => null),
    ])
    const pds = (client as { service?: { host?: string } }).service?.host ?? BSKY_SERVICE.replace(/^https?:\/\//, '')
    const base = pds.startsWith('http') ? pds : `https://${pds}`
    const mediaUrls: Array<{ url: string; mimeType?: string }> = []
    for (const m of value.media ?? []) {
      const cid = typeof m.image === 'object' && m.image && '$link' in m.image ? (m.image as StandardSiteDocumentBlobRef).$link : undefined
      if (cid) mediaUrls.push({ url: `${base}/xrpc/com.atproto.sync.getBlob?did=${parsed.did}&cid=${encodeURIComponent(cid)}`, mimeType: m.mimeType })
    }
    return {
      uri: res.data.uri as string,
      cid: res.data.cid as string,
      did: parsed.did,
      rkey: parsed.rkey,
      path: value.path ?? parsed.rkey,
      title: value.title,
      body: value.body,
      createdAt: value.createdAt,
      baseUrl: baseUrl ?? undefined,
      authorHandle: profile?.handle,
      authorAvatar: profile?.avatar,
      media: mediaUrls.length > 0 ? mediaUrls : undefined,
      mediaRefs: value.media,
    }
  } catch {
    return null
  }
}

/** Delete a standard.site document. Requires session; only the author can delete. */
export async function deleteStandardSiteDocument(uri: string): Promise<void> {
  const session = getSession()
  if (!session?.did) throw new Error('Not logged in')
  const parsed = parseAtUri(uri)
  if (!parsed || parsed.collection !== STANDARD_SITE_DOCUMENT_COLLECTION) throw new Error('Invalid document URI')
  if (parsed.did !== session.did) throw new Error('You can only delete your own posts')
  await agent.com.atproto.repo.deleteRecord({
    repo: session.did,
    collection: STANDARD_SITE_DOCUMENT_COLLECTION,
    rkey: parsed.rkey,
  })
}

/** Upload a blob for use in a standard.site document media array. Requires session. */
export async function uploadStandardSiteDocumentBlob(
  file: File
): Promise<{ image: StandardSiteDocumentBlobRef; mimeType: string }> {
  const session = getSession()
  if (!session?.did) throw new Error('Not logged in')
  const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
  if (!allowed.includes(file.type)) throw new Error('Only JPEG, PNG, GIF, and WebP images are supported')
  const { data } = await agent.uploadBlob(file, { encoding: file.type })
  const blob = data.blob as { $link?: string }
  const link = blob?.$link ?? (data as { blob?: { $link?: string } }).blob?.$link
  if (!link) throw new Error('Upload did not return a blob reference')
  return { image: { $link: link }, mimeType: file.type }
}

/** Update a standard.site document (title, body, media). Requires session; only the author can update. Path is preserved. */
export async function updateStandardSiteDocument(
  uri: string,
  updates: { title?: string; body?: string; media?: Array<{ image: StandardSiteDocumentBlobRef; mimeType?: string }> }
): Promise<StandardSiteDocumentView> {
  const session = getSession()
  if (!session?.did) throw new Error('Not logged in')
  const parsed = parseAtUri(uri)
  if (!parsed || parsed.collection !== STANDARD_SITE_DOCUMENT_COLLECTION) throw new Error('Invalid document URI')
  if (parsed.did !== session.did) throw new Error('You can only edit your own posts')
  const existing = await agent.com.atproto.repo.getRecord({
    repo: session.did,
    collection: STANDARD_SITE_DOCUMENT_COLLECTION,
    rkey: parsed.rkey,
  })
  const current = (existing.data?.value ?? {}) as StandardSiteDocumentRecord
  const record = {
    ...current,
    path: current.path ?? parsed.rkey,
    title: updates.title !== undefined ? updates.title : current.title,
    body: updates.body !== undefined ? updates.body : current.body,
    media: updates.media !== undefined ? updates.media : current.media,
    createdAt: current.createdAt,
  }
  const res = await agent.com.atproto.repo.putRecord({
    repo: session.did,
    collection: STANDARD_SITE_DOCUMENT_COLLECTION,
    rkey: parsed.rkey,
    record,
  })
  const updated = await getStandardSiteDocument(res.data.uri)
  if (!updated) throw new Error('Failed to fetch updated document')
  return updated
}

/** Standard.site comment record (comments on documents; interoperable with leaflet.pub etc.). */
export type StandardSiteCommentRecord = {
  subject: string // AT-URI of the document
  text: string
  createdAt: string
  [k: string]: unknown
}

/** Generate a unique rkey for new records (timestamp + random). */
function generateRecordRkey(): string {
  const t = Math.floor(Date.now() / 1000).toString(36)
  const r = Math.random().toString(36).slice(2, 10)
  return `${t}-${r}`
}

/** Create a standard.site comment on a document. Requires session. */
export async function createStandardSiteComment(documentUri: string, text: string): Promise<{ uri: string; cid: string }> {
  const session = getSession()
  if (!session?.did) throw new Error('Not logged in')
  const parsed = parseAtUri(documentUri)
  if (!parsed || parsed.collection !== STANDARD_SITE_DOCUMENT_COLLECTION) throw new Error('Invalid document URI')
  const t = text.trim()
  if (!t) throw new Error('Comment text is required')
  const record: StandardSiteCommentRecord = {
    subject: documentUri,
    text: t,
    createdAt: new Date().toISOString(),
  }
  const rkey = generateRecordRkey()
  const res = await agent.com.atproto.repo.putRecord({
    repo: session.did,
    collection: STANDARD_SITE_COMMENT_COLLECTION,
    rkey,
    record,
  })
  return { uri: res.data.uri, cid: res.data.cid }
}

/** List standard.site comment records from a repo (e.g. current user). Filter by subject client-side. */
export async function listStandardSiteComments(
  client: AtpAgent,
  repo: string,
  opts?: { limit?: number; cursor?: string }
): Promise<{ records: { uri: string; cid: string; value: StandardSiteCommentRecord }[]; cursor?: string }> {
  try {
    const res = await client.com.atproto.repo.listRecords({
      repo,
      collection: STANDARD_SITE_COMMENT_COLLECTION,
      limit: opts?.limit ?? 100,
      cursor: opts?.cursor,
    })
    const records = (res.data.records ?? []).map((r: { uri: string; cid: string; value: Record<string, unknown> }) => ({
      uri: r.uri,
      cid: r.cid,
      value: r.value as StandardSiteCommentRecord,
    }))
    return { records, cursor: res.data.cursor }
  } catch {
    return { records: [], cursor: undefined }
  }
}

/** Unified reply view for forum post detail (standard.site comment or Bluesky post that links to the doc). */
export type ForumReplyView = {
  uri: string
  cid: string
  author: { did: string; handle?: string; avatar?: string; displayName?: string }
  record: { text?: string; createdAt?: string }
  likeCount?: number
  viewer?: { like?: string }
  isComment?: boolean
}

/** List replies for a standard.site document: comment records (from current user repo) + Bluesky posts that link to this doc. */
export async function listStandardSiteRepliesForDocument(
  documentUri: string,
  domain: string,
  documentUrl?: string | null
): Promise<ForumReplyView[]> {
  const client = getSession() ? agent : publicAgent
  const replies: ForumReplyView[] = []
  const session = getSession()
  const linkMatches = (text: string) =>
    text.includes(documentUri) || (!!documentUrl && text.includes(documentUrl))

  if (session?.did) {
    const { records } = await listStandardSiteComments(agent, session.did, { limit: 100 })
    for (const r of records.filter((rec) => rec.value.subject === documentUri)) {
      const did = r.uri.split('/')[2] ?? session.did
      let handle: string | undefined
      let avatar: string | undefined
      try {
        const profile = await client.getProfile({ actor: did })
        const data = profile.data as { handle?: string; avatar?: string }
        handle = data.handle
        avatar = data.avatar
      } catch {
        // ignore
      }
      replies.push({
        uri: r.uri,
        cid: r.cid,
        author: { did, handle, avatar },
        record: { text: r.value.text, createdAt: r.value.createdAt },
        isComment: true,
      })
    }
  }

  try {
    const { posts } = await searchPostsByDomain(domain)
    for (const p of posts ?? []) {
      const text = (p.record as { text?: string })?.text ?? ''
      if (!linkMatches(text)) continue
      replies.push({
        uri: p.uri,
        cid: p.cid,
        author: p.author as ForumReplyView['author'],
        record: (p.record ?? {}) as ForumReplyView['record'],
        likeCount: (p as { likeCount?: number }).likeCount,
        viewer: (p as { viewer?: { like?: string } }).viewer,
        isComment: false,
      })
    }
  } catch {
    // ignore
  }

  replies.sort((a, b) => {
    const ta = new Date(a.record?.createdAt ?? 0).getTime()
    const tb = new Date(b.record?.createdAt ?? 0).getTime()
    return ta - tb
  })
  return replies
}

/** Get DIDs (and handles) of accounts that the actor follows. */
export async function getFollows(
  client: AtpAgent,
  actor: string,
  opts?: { limit?: number; cursor?: string }
): Promise<{ dids: string[]; handles: Map<string, string>; cursor?: string }> {
  const res = await client.app.bsky.graph.getFollows({
    actor,
    limit: opts?.limit ?? 100,
    cursor: opts?.cursor,
  })
  const dids = (res.data.follows ?? []).map((f: { did: string; handle?: string }) => f.did)
  const handles = new Map<string, string>()
  for (const f of res.data.follows ?? []) {
    const sub = f as { did: string; handle?: string }
    if (sub.handle) handles.set(sub.did, sub.handle)
  }
  return { dids, handles, cursor: res.data.cursor }
}

/** Resolve DID from a publication base URL via .well-known/site.standard.publication. Returns null on CORS/network error. */
export async function resolvePublicationDidFromWellKnown(baseUrl: string): Promise<string | null> {
  try {
    const url = `${baseUrl.replace(/\/$/, '')}/.well-known/site.standard.publication`
    const res = await fetch(url, { method: 'GET', credentials: 'omit' })
    if (!res.ok) return null
    const text = await res.text()
    const atUri = text.trim()
    if (!atUri.startsWith('at://')) return null
    const parts = atUri.slice('at://'.length).split('/')
    if (parts.length < 1) return null
    return parts[0] ?? null
  } catch {
    return null
  }
}

/** Fetch standard.site documents from discovery URLs (and optional DIDs). Uses publicAgent so it works logged out. */
export async function listStandardSiteDocumentsFromDiscovery(
  discoveryUrls: string[],
  discoveryDids: string[] = []
): Promise<StandardSiteDocumentView[]> {
  const client = publicAgent
  const dids: string[] = [...discoveryDids]
  await Promise.all(
    discoveryUrls.map(async (url) => {
      const did = await resolvePublicationDidFromWellKnown(url)
      if (did) dids.push(did)
    })
  )
  const seen = new Set<string>()
  const allViews: StandardSiteDocumentView[] = []
  const limitPerRepo = 30
  await Promise.all(
    dids.map(async (did) => {
      if (seen.has(did)) return
      seen.add(did)
      try {
        const [baseUrl, { records }] = await Promise.all([
          getStandardSitePublicationBaseUrl(client, did),
          listStandardSiteDocuments(client, did, { limit: limitPerRepo, reverse: true }),
        ])
        let handle: string | undefined
        let avatar: string | undefined
        try {
          const profile = await client.getProfile({ actor: did })
          const data = profile.data as { handle?: string; avatar?: string }
          handle = data.handle
          avatar = data.avatar
        } catch {
          // ignore
        }
        for (const r of records) {
          const path = r.value.path ?? r.uri.split('/').pop() ?? ''
          allViews.push({
            uri: r.uri,
            cid: r.cid,
            did,
            rkey: r.uri.split('/').pop() ?? '',
            path,
            title: r.value.title,
            createdAt: r.value.createdAt,
            baseUrl: baseUrl ?? undefined,
            authorHandle: handle,
            authorAvatar: avatar,
          })
        }
      } catch {
        // skip this repo
      }
    })
  )
  allViews.sort((a, b) => {
    const ta = new Date(a.createdAt ?? 0).getTime()
    const tb = new Date(b.createdAt ?? 0).getTime()
    return tb - ta
  })
  return allViews
}

/** Fetch standard.site blog documents from the current user and people they follow. Requires session. */
export async function listStandardSiteDocumentsForForum(): Promise<StandardSiteDocumentView[]> {
  const session = getSession()
  if (!session?.did) return []
  const client = agent
  const selfHandle = (session as { handle?: string }).handle ?? session.did
  const limitPerRepo = 15
  const maxFollows = 50
  const allViews: StandardSiteDocumentView[] = []
  const didToHandle = new Map<string, string>()
  const didToAvatar = new Map<string, string>()
  didToHandle.set(session.did, selfHandle)
  try {
    const { dids: followDids, handles: followHandles } = await getFollows(client, session.did, { limit: maxFollows })
    followHandles.forEach((h, did) => didToHandle.set(did, h))
    const didsToFetch = [session.did, ...followDids]
    const baseUrlCache = new Map<string, string | null>()
    await Promise.all(
      didsToFetch.map(async (did) => {
        const [base, profile] = await Promise.all([
          getStandardSitePublicationBaseUrl(client, did),
          client.getProfile({ actor: did }).then((p) => (p.data as { avatar?: string }).avatar).catch(() => undefined),
        ])
        baseUrlCache.set(did, base)
        if (profile) didToAvatar.set(did, profile)
      })
    )
    const results = await Promise.all(
      didsToFetch.map(async (did) => {
        try {
          const { records } = await listStandardSiteDocuments(client, did, { limit: limitPerRepo, reverse: true })
          const baseUrl = baseUrlCache.get(did) ?? undefined
          const handle = didToHandle.get(did)
          const avatar = didToAvatar.get(did)
          return records.map((r) => {
            const path = r.value.path ?? r.uri.split('/').pop() ?? ''
            return {
              uri: r.uri,
              cid: r.cid,
              did,
              rkey: r.uri.split('/').pop() ?? '',
              path,
              title: r.value.title,
              createdAt: r.value.createdAt,
              baseUrl: baseUrl ?? undefined,
              authorHandle: handle,
              authorAvatar: avatar,
            }
          })
        } catch {
          return []
        }
      })
    )
    for (const list of results) allViews.push(...list)
    allViews.sort((a, b) => {
      const ta = new Date(a.createdAt ?? 0).getTime()
      const tb = new Date(b.createdAt ?? 0).getTime()
      return tb - ta
    })
  } catch {
    // ignore
  }
  return allViews
}

/** Extract site.standard.document AT-URIs from text (e.g. post content). */
const DOCUMENT_URI_REGEX = /at:\/\/[^/]+\/site\.standard\.document\/[^\s)\]}>"\']+/g
function extractDocumentUrisFromText(text: string): string[] {
  const uris = text.match(DOCUMENT_URI_REGEX) ?? []
  return [...new Set(uris)]
}

/** Discover standard.site documents by searching posts that reference standard.site, parsing document URIs from content. Uses publicAgent. */
export async function listStandardSiteDocumentsFromSearch(limit = 60): Promise<StandardSiteDocumentView[]> {
  const client = publicAgent
  const seen = new Set<string>()
  const views: StandardSiteDocumentView[] = []
  let cursor: string | undefined
  const maxPages = 3
  for (let page = 0; page < maxPages; page++) {
    try {
      const res = await client.app.bsky.feed.searchPosts({
        q: 'standard.site',
        domain: 'standard.site',
        limit: 30,
        cursor,
        sort: 'latest',
      })
      const posts = res.data.posts ?? []
      cursor = res.data.cursor
      for (const p of posts) {
        const text = (p.record as { text?: string })?.text ?? ''
        const uris = extractDocumentUrisFromText(text)
        for (const uri of uris) {
          if (seen.has(uri) || views.length >= limit) continue
          seen.add(uri)
          try {
            const doc = await getStandardSiteDocument(uri)
            if (doc) views.push(doc)
          } catch {
            // skip
          }
        }
      }
      if (!cursor || posts.length === 0) break
    } catch {
      break
    }
  }
  views.sort((a, b) => {
    const ta = new Date(a.createdAt ?? 0).getTime()
    const tb = new Date(b.createdAt ?? 0).getTime()
    return tb - ta
  })
  return views
}

/** All forum documents: discovery + search (latest from network) + from you and people you follow. Dedupes by uri. */
export async function listStandardSiteDocumentsAll(discoveryUrls: string[]): Promise<StandardSiteDocumentView[]> {
  const [discovery, fromSearch, fromFollows] = await Promise.all([
    listStandardSiteDocumentsFromDiscovery(discoveryUrls),
    listStandardSiteDocumentsFromSearch(80),
    listStandardSiteDocumentsForForum(),
  ])
  const byUri = new Map<string, StandardSiteDocumentView>()
  for (const d of [...discovery, ...fromSearch, ...fromFollows]) byUri.set(d.uri, d)
  const merged = Array.from(byUri.values())
  merged.sort((a, b) => {
    const ta = new Date(a.createdAt ?? 0).getTime()
    const tb = new Date(b.createdAt ?? 0).getTime()
    return tb - ta
  })
  return merged
}

/** List standard.site blog documents for a single author (by DID). Use for profile blog tab. */
export async function listStandardSiteDocumentsForAuthor(
  client: AtpAgent,
  did: string,
  authorHandle?: string,
  opts?: { limit?: number; cursor?: string }
): Promise<{ documents: StandardSiteDocumentView[]; cursor?: string }> {
  try {
    const [baseUrl, { records, cursor }] = await Promise.all([
      getStandardSitePublicationBaseUrl(client, did),
      listStandardSiteDocuments(client, did, {
        limit: opts?.limit ?? 30,
        cursor: opts?.cursor,
        reverse: true,
      }),
    ])
    const documents: StandardSiteDocumentView[] = records.map((r) => {
      const path = r.value.path ?? r.uri.split('/').pop() ?? ''
      return {
        uri: r.uri,
        cid: r.cid,
        did,
        rkey: r.uri.split('/').pop() ?? '',
        path,
        title: r.value.title,
        createdAt: r.value.createdAt,
        baseUrl: baseUrl ?? undefined,
        authorHandle: authorHandle ?? did,
      }
    })
    return { documents, cursor }
  } catch {
    return { documents: [], cursor: undefined }
  }
}

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
