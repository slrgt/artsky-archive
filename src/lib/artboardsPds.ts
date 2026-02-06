/**
 * Artboard lexicon: app.artsky.artboard
 * Stores artboards on the user's PDS so they sync across devices.
 */

import type { AtpAgent } from '@atproto/api'
import type { Artboard, ArtboardPost } from './artboards'

const COLLECTION = 'app.artsky.artboard'

export type ArtboardRecord = {
  name: string
  posts: ArtboardPost[]
  createdAt: string
}

function recordToArtboard(rkey: string, value: ArtboardRecord, uri: string): Artboard {
  return {
    id: rkey,
    name: value.name ?? 'Untitled',
    posts: Array.isArray(value.posts) ? value.posts : [],
    createdAt: value.createdAt ?? new Date().toISOString(),
  }
}

function artboardToRecord(board: Artboard): ArtboardRecord {
  return {
    name: board.name,
    posts: board.posts.map((p) => ({
      uri: p.uri,
      cid: p.cid,
      authorHandle: p.authorHandle,
      text: p.text?.slice(0, 2000),
      thumb: p.thumb,
    })),
    createdAt: board.createdAt,
  }
}

/** List all artboard records from the user's PDS. */
export async function listArtboardsFromPds(
  agent: AtpAgent,
  did: string,
): Promise<Artboard[]> {
  const res = await agent.com.atproto.repo.listRecords({
    repo: did,
    collection: COLLECTION,
    limit: 100,
  })
  const boards: Artboard[] = []
  for (const r of res.data.records) {
    const rkey = r.uri.split('/').pop() ?? r.uri
    const value = r.value as ArtboardRecord
    boards.push(recordToArtboard(rkey, value, r.uri))
  }
  boards.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
  return boards
}

/** Create an artboard on the PDS. Returns the new board (with rkey as id). */
export async function createArtboardOnPds(
  agent: AtpAgent,
  did: string,
  name: string,
  id?: string,
): Promise<Artboard> {
  const rkey = id ?? `artboard-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
  const record: ArtboardRecord = {
    name: name.trim() || 'Untitled',
    posts: [],
    createdAt: new Date().toISOString(),
  }
  await agent.com.atproto.repo.putRecord({
    repo: did,
    collection: COLLECTION,
    rkey,
    record,
    validate: false,
  })
  return recordToArtboard(rkey, record, `at://${did}/${COLLECTION}/${rkey}`)
}

/** Update an artboard record on the PDS (full replace). */
export async function putArtboardOnPds(
  agent: AtpAgent,
  did: string,
  board: Artboard,
): Promise<void> {
  await agent.com.atproto.repo.putRecord({
    repo: did,
    collection: COLLECTION,
    rkey: board.id,
    record: artboardToRecord(board),
    validate: false,
  })
}

/** Delete an artboard from the PDS. */
export async function deleteArtboardFromPds(
  agent: AtpAgent,
  did: string,
  rkey: string,
): Promise<void> {
  await agent.com.atproto.repo.deleteRecord({
    repo: did,
    collection: COLLECTION,
    rkey,
  })
}

/** Push a single artboard to the PDS (full replace). Use after add/remove post or rename. */
export async function syncBoardToPds(
  agent: AtpAgent,
  did: string,
  board: Artboard,
): Promise<void> {
  await putArtboardOnPds(agent, did, board)
}
