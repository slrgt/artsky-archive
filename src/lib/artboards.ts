const ARTBOARDS_KEY = 'artsky-artboards'

export interface ArtboardPost {
  uri: string
  cid: string
  /** Cached for offline/list view */
  authorHandle?: string
  text?: string
  /** First/single media URL (backward compat and list previews) */
  thumb?: string
  /** All media URLs for posts with multiple images/video (shown in artboard detail) */
  thumbs?: string[]
}

export interface Artboard {
  id: string
  name: string
  posts: ArtboardPost[]
  createdAt: string
}

function load(): Artboard[] {
  try {
    const raw = localStorage.getItem(ARTBOARDS_KEY)
    if (!raw) return []
    return JSON.parse(raw)
  } catch {
    return []
  }
}

function save(boards: Artboard[]) {
  try {
    localStorage.setItem(ARTBOARDS_KEY, JSON.stringify(boards))
  } catch {
    // ignore
  }
}

/** Replace all artboards (e.g. after syncing from PDS). */
export function replaceAllArtboards(boards: Artboard[]): void {
  save(boards)
}

export function getArtboards(): Artboard[] {
  return load()
}

export function getArtboard(id: string): Artboard | undefined {
  return load().find((b) => b.id === id)
}

export function createArtboard(name: string): Artboard {
  const boards = load()
  const id = `board-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
  const board: Artboard = {
    id,
    name: name.trim() || 'Untitled',
    posts: [],
    createdAt: new Date().toISOString(),
  }
  boards.push(board)
  save(boards)
  return board
}

export function updateArtboardName(id: string, name: string): void {
  const boards = load()
  const i = boards.findIndex((b) => b.id === id)
  if (i === -1) return
  boards[i].name = name.trim() || 'Untitled'
  save(boards)
}

export function deleteArtboard(id: string): void {
  save(load().filter((b) => b.id !== id))
}

export function addPostToArtboard(
  boardId: string,
  post: { uri: string; cid: string; authorHandle?: string; text?: string; thumb?: string; thumbs?: string[] }
): boolean {
  const boards = load()
  const board = boards.find((b) => b.id === boardId)
  if (!board) return false
  if (board.posts.some((p) => p.uri === post.uri)) return true // already there
  board.posts.push({
    uri: post.uri,
    cid: post.cid,
    authorHandle: post.authorHandle,
    text: post.text,
    thumb: post.thumb ?? post.thumbs?.[0],
    thumbs: post.thumbs,
  })
  save(boards)
  return true
}

export function removePostFromArtboard(boardId: string, postUri: string): void {
  const boards = load()
  const board = boards.find((b) => b.id === boardId)
  if (!board) return
  board.posts = board.posts.filter((p) => p.uri !== postUri)
  save(boards)
}

export function isPostInArtboard(boardId: string, postUri: string): boolean {
  const board = getArtboard(boardId)
  return board?.posts.some((p) => p.uri === postUri) ?? false
}

/** True if the post is in at least one artboard (for card outline). */
export function isPostInAnyArtboard(postUri: string): boolean {
  const boards = load()
  return boards.some((b) => b.posts.some((p) => p.uri === postUri))
}
