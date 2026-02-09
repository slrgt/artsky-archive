import { useState, useEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { Link } from 'react-router-dom'
import { getArtboard, removePostFromArtboard } from '../lib/artboards'
import { putArtboardOnPds } from '../lib/artboardsPds'
import { agent } from '../lib/bsky'
import { useSession } from '../context/SessionContext'
import { useProfileModal } from '../context/ProfileModalContext'
import { useListKeyboardNav } from '../hooks/useListKeyboardNav'
import Layout from '../components/Layout'
import styles from './ArtboardDetailPage.module.css'

export function ArtboardDetailContent({ id, inModal = false }: { id: string; inModal?: boolean }) {
  const { session } = useSession()
  const { openPostModal } = useProfileModal()
  const [, setTick] = useState(0)
  const [focusedIndex, setFocusedIndex] = useState(0)
  const gridRef = useRef<HTMLDivElement>(null)
  const board = id ? getArtboard(id) : undefined
  const posts = board?.posts ?? []

  useEffect(() => {
    setFocusedIndex((i) => (posts.length ? Math.min(i, posts.length - 1) : 0))
  }, [posts.length])

  useEffect(() => {
    if (!inModal || !gridRef.current || focusedIndex < 0) return
    const el = gridRef.current.querySelector(`[data-collection-post-index="${focusedIndex}"]`)
    if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [inModal, focusedIndex])

  useListKeyboardNav({
    enabled: inModal && posts.length > 0,
    itemCount: posts.length,
    focusedIndex,
    setFocusedIndex,
    columns: 2,
    onActivate: (index) => {
      const p = posts[index]
      if (p) openPostModal(p.uri)
    },
    useCapture: true,
  })

  if (!id || !board) {
    return (
      <div className={styles.wrap}>
        <p className={styles.empty}>Collection not found.</p>
      </div>
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

  const wrap = (
    <div className={styles.wrap}>
      <p className={styles.count}>{posts.length} post{posts.length !== 1 ? 's' : ''}</p>
      {posts.length === 0 ? (
        <p className={styles.empty}>No posts saved yet. Add posts from the feed.</p>
      ) : (
        <div ref={gridRef} className={styles.grid}>
          {posts.map((p, index) => (
            <div key={p.uri} className={`${styles.card} ${inModal && index === focusedIndex ? styles.cardFocused : ''}`} data-collection-post-index={inModal ? index : undefined}>
              {inModal ? (
                <button type="button" className={styles.link} onClick={() => openPostModal(p.uri)}>
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
                </button>
              ) : (
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
              )}
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
  )

  return wrap
}

export default function ArtboardDetailPage() {
  const { id } = useParams<{ id: string }>()
  return (
    <Layout title={getArtboard(id ?? '')?.name ?? 'Collection'} showNav>
      <ArtboardDetailContent id={id ?? ''} />
    </Layout>
  )
}
