import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  getArtboards,
  createArtboard,
  deleteArtboard,
  updateArtboardName,
  getArtboard,
  replaceAllArtboards,
  type Artboard,
} from '../lib/artboards'
import {
  listArtboardsFromPds,
  createArtboardOnPds,
  deleteArtboardFromPds,
  putArtboardOnPds,
} from '../lib/artboardsPds'
import { agent } from '../lib/bsky'
import { useSession } from '../context/SessionContext'
import Layout from '../components/Layout'
import styles from './ArtboardsPage.module.css'

export default function ArtboardsPage() {
  const { session } = useSession()
  const [boards, setBoards] = useState<Artboard[]>(() => getArtboards())
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editMenuOpenId, setEditMenuOpenId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [pdsError, setPdsError] = useState<string | null>(null)

  function refresh() {
    setBoards(getArtboards())
  }

  useEffect(() => {
    if (!session?.did) return
    setSyncing(true)
    setPdsError(null)
    listArtboardsFromPds(agent, session.did)
      .then((pdsBoards) => {
        replaceAllArtboards(pdsBoards)
        refresh()
      })
      .catch((err) => {
        setPdsError(err instanceof Error ? err.message : 'Failed to sync collections')
      })
      .finally(() => setSyncing(false))
  }, [session?.did])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    const name = newName.trim() || 'Untitled'
    const board = createArtboard(name)
    setNewName('')
    refresh()
    if (session?.did) {
      try {
        await createArtboardOnPds(agent, session.did, name, board.id)
      } catch (err) {
        deleteArtboard(board.id)
        refresh()
        setPdsError(err instanceof Error ? err.message : 'Failed to create on server')
      }
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this collection?')) return
    if (session?.did) {
      try {
        await deleteArtboardFromPds(agent, session.did, id)
      } catch {
        // still delete locally
      }
    }
    deleteArtboard(id)
    refresh()
  }

  function startEdit(board: Artboard) {
    setEditMenuOpenId(null)
    setEditingId(board.id)
    setEditName(board.name)
  }

  async function saveEdit() {
    if (!editingId) return
    updateArtboardName(editingId, editName)
    const board = getArtboard(editingId)
    setEditingId(null)
    setEditMenuOpenId(null)
    refresh()
    if (session?.did && board) {
      try {
        await putArtboardOnPds(agent, session.did, board)
      } catch {
        setPdsError('Failed to sync rename')
      }
    }
  }

  return (
    <Layout title="Collections" showNav>
      <div className={styles.wrap}>
        {syncing && <p className={styles.syncing}>Syncing collections…</p>}
        {pdsError && <p className={styles.pdsError}>{pdsError}</p>}
        <form onSubmit={handleCreate} className={styles.createForm}>
          <input
            type="text"
            placeholder="New collection name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className={styles.input}
          />
          <button type="submit" className={styles.createBtn}>Create</button>
        </form>
        {boards.length === 0 ? (
          <p className={styles.empty}>
            No collections yet. Open a post from the feed and use "Collect" to save it here.
          </p>
        ) : (
          <div className={styles.bento}>
            {boards.map((board) => (
              <div key={board.id} className={styles.bentoCard}>
                <Link to={`/artboard/${board.id}`} className={styles.bentoLink}>
                  {board.posts.length > 0 ? (
                    <div className={styles.bentoThumbs}>
                      {board.posts.slice(0, 4).map((p) => (
                        <div key={p.uri} className={styles.bentoThumb}>
                          {p.thumb ? (
                            <img src={p.thumb} alt="" loading="lazy" />
                          ) : (
                            <span className={styles.thumbPlaceholder}>📌</span>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className={styles.bentoEmpty}>No posts yet</div>
                  )}
                  <div className={styles.bentoInfo}>
                    <span className={styles.bentoName}>{board.name}</span>
                    <span className={styles.bentoCount}>{board.posts.length} post{board.posts.length !== 1 ? 's' : ''}</span>
                  </div>
                </Link>
                <div className={styles.bentoActions}>
                  {editingId === board.id ? (
                    <>
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className={styles.editInput}
                        autoFocus
                        onBlur={saveEdit}
                        onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), saveEdit())}
                        onClick={(e) => e.preventDefault()}
                      />
                      <button type="button" className={styles.smallBtn} onClick={(e) => { e.preventDefault(); saveEdit(); }}>Save</button>
                    </>
                  ) : editMenuOpenId === board.id ? (
                    <>
                      <button type="button" className={styles.smallBtn} onClick={(e) => { e.preventDefault(); startEdit(board); }}>Rename</button>
                      <button type="button" className={styles.smallBtnDanger} onClick={(e) => { e.preventDefault(); handleDelete(board.id); setEditMenuOpenId(null); }}>Delete</button>
                    </>
                  ) : (
                    <button type="button" className={styles.smallBtn} onClick={(e) => { e.preventDefault(); setEditMenuOpenId((id) => id === board.id ? null : board.id); }}>Edit</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  )
}
