import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { Link } from 'react-router-dom'
import { getArtboard, removePostFromArtboard } from '../lib/artboards'
import { putArtboardOnPds } from '../lib/artboardsPds'
import { agent } from '../lib/bsky'
import { useSession } from '../context/SessionContext'
import Layout from '../components/Layout'
import styles from './ArtboardDetailPage.module.css'

export default function ArtboardDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { session } = useSession()
  const [, setTick] = useState(0)
  const board = id ? getArtboard(id) : undefined

  if (!id) {
    return (
      <Layout title="Collection" showNav>
        <div className={styles.wrap}>
          <p className={styles.empty}>Collection not found.</p>
        </div>
      </Layout>
    )
  }
  if (!board) {
    return (
      <Layout title="Collection" showNav>
        <div className={styles.wrap}>
          <p className={styles.empty}>Collection not found.</p>
        </div>
      </Layout>
    )
  }

  const boardId = board.id
  async function handleRemove(postUri: string) {
    if (!confirm('Remove this post from the collection?')) return
    removePostFromArtboard(boardId, postUri)
    setTick((t) => t + 1)
    if (session?.did) {
      const updated = getArtboard(boardId)
      if (updated) {
        try {
          await putArtboardOnPds(agent, session.did, updated)
        } catch {
          // leave local state as is
        }
      }
    }
  }

  return (
    <Layout title={board.name} showNav>
      <div className={styles.wrap}>
        <p className={styles.count}>{board.posts.length} post{board.posts.length !== 1 ? 's' : ''}</p>
        {board.posts.length === 0 ? (
          <p className={styles.empty}>No posts saved yet. Add posts from the feed.</p>
        ) : (
          <div className={styles.grid}>
            {board.posts.map((p) => (
              <div key={p.uri} className={styles.card}>
                <Link to={`/post/${encodeURIComponent(p.uri)}`} className={styles.link}>
                  <div className={styles.mediaWrap}>
                    {(p.thumbs && p.thumbs.length > 0) ? (
                      <div className={styles.thumbsGrid}>
                        {p.thumbs.map((url, i) => (
                          <img key={i} src={url} alt="" className={p.thumbs!.length === 1 ? `${styles.thumb} ${styles.thumbSpan}` : styles.thumb} loading="lazy" />
                        ))}
                      </div>
                    ) : p.thumb ? (
                      <img src={p.thumb} alt="" className={styles.thumb} loading="lazy" />
                    ) : (
                      <div className={styles.placeholder}>📌</div>
                    )}
                  </div>
                  <div className={styles.meta}>
                    <span className={styles.handle}>@{p.authorHandle ?? 'unknown'}</span>
                    {p.text ? <p className={styles.text}>{p.text.slice(0, 80)}{p.text.length > 80 ? '…' : ''}</p> : null}
                  </div>
                </Link>
                <button
                  type="button"
                  className={styles.remove}
                  onClick={() => handleRemove(p.uri)}
                  title="Remove from collection"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  )
}
