import { useCallback, useEffect, useState, useMemo } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import type { AppBskyFeedDefs } from '@atproto/api'
import { agent, postReply, getPostAllMedia, getPostMediaUrl } from '../lib/bsky'
import { getArtboards, addPostToArtboard } from '../lib/artboards'
import Layout from '../components/Layout'
import VideoWithHls from '../components/VideoWithHls'
import styles from './PostDetailPage.module.css'

function isThreadViewPost(
  node: AppBskyFeedDefs.ThreadViewPost | AppBskyFeedDefs.NotFoundPost | AppBskyFeedDefs.BlockedPost | { $type: string }
): node is AppBskyFeedDefs.ThreadViewPost {
  return node && typeof node === 'object' && 'post' in node && !!(node as AppBskyFeedDefs.ThreadViewPost).post
}

function MediaGallery({
  items,
  autoPlayFirstVideo = false,
}: {
  items: Array<{ url: string; type: 'image' | 'video'; videoPlaylist?: string }>
  autoPlayFirstVideo?: boolean
}) {
  const [fullscreenIndex, setFullscreenIndex] = useState<number | null>(null)
  const imageIndices = useMemo(
    () => items.map((m, i) => (m.type === 'image' ? i : -1)).filter((i) => i >= 0),
    [items]
  )

  useEffect(() => {
    if (fullscreenIndex === null) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setFullscreenIndex(null)
      if (e.key === 'ArrowLeft') {
        const idx = imageIndices.indexOf(fullscreenIndex!)
        if (idx > 0) setFullscreenIndex(imageIndices[idx - 1])
      }
      if (e.key === 'ArrowRight') {
        const idx = imageIndices.indexOf(fullscreenIndex!)
        if (idx >= 0 && idx < imageIndices.length - 1)
          setFullscreenIndex(imageIndices[idx + 1])
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [fullscreenIndex, imageIndices])

  if (items.length === 0) return null
  const firstVideoIndex = autoPlayFirstVideo
    ? items.findIndex((m) => m.type === 'video' && m.videoPlaylist)
    : -1

  const currentFullscreenItem =
    fullscreenIndex != null ? items[fullscreenIndex] : null

  return (
    <div className={styles.galleryWrap}>
      <div className={styles.gallery}>
        {items.map((m, i) => {
          if (m.type === 'video' && m.videoPlaylist) {
            return (
              <div key={i} className={styles.galleryVideoWrap}>
                <VideoWithHls
                  playlistUrl={m.videoPlaylist}
                  poster={m.url || undefined}
                  className={styles.galleryVideo}
                  autoPlay={i === firstVideoIndex}
                />
              </div>
            )
          }
          return (
            <button
              key={i}
              type="button"
              className={styles.galleryImageBtn}
              onClick={() => setFullscreenIndex(i)}
              aria-label="View full screen"
            >
              <img src={m.url} alt="" className={styles.galleryMedia} />
            </button>
          )
        })}
      </div>
      {currentFullscreenItem?.type === 'image' && (
        <div
          className={styles.fullscreenOverlay}
          onClick={() => setFullscreenIndex(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Image full screen"
        >
          <button
            type="button"
            className={styles.fullscreenClose}
            onClick={() => setFullscreenIndex(null)}
            aria-label="Close"
          >
            ×
          </button>
          {imageIndices.length > 1 && (
            <>
              <button
                type="button"
                className={styles.fullscreenPrev}
                aria-label="Previous image"
                onClick={(e) => {
                  e.stopPropagation()
                  const idx = imageIndices.indexOf(fullscreenIndex!)
                  if (idx > 0) setFullscreenIndex(imageIndices[idx - 1])
                }}
              >
                ‹
              </button>
              <button
                type="button"
                className={styles.fullscreenNext}
                aria-label="Next image"
                onClick={(e) => {
                  e.stopPropagation()
                  const idx = imageIndices.indexOf(fullscreenIndex!)
                  if (idx < imageIndices.length - 1)
                    setFullscreenIndex(imageIndices[idx + 1])
                }}
              >
                ›
              </button>
            </>
          )}
          <img
            src={currentFullscreenItem.url}
            alt=""
            className={styles.fullscreenImage}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  )
}

function PostBlock({
  node,
  depth = 0,
  collapsedThreads,
  onToggleCollapse,
}: {
  node: AppBskyFeedDefs.ThreadViewPost | AppBskyFeedDefs.NotFoundPost | AppBskyFeedDefs.BlockedPost | { $type: string }
  depth?: number
  collapsedThreads?: Set<string>
  onToggleCollapse?: (uri: string) => void
}) {
  if (!isThreadViewPost(node)) return null
  const { post } = node
  const allMedia = getPostAllMedia(post)
  const text = (post.record as { text?: string })?.text ?? ''
  const handle = post.author.handle ?? post.author.did
  const avatar = post.author.avatar ?? undefined
  const replies = 'replies' in node && Array.isArray(node.replies) ? (node.replies as (typeof node)[]) : []
  const hasReplies = replies.length > 0
  const isCollapsed = hasReplies && collapsedThreads?.has(post.uri)
  const canCollapse = hasReplies && onToggleCollapse

  return (
    <article className={styles.postBlock} style={{ marginLeft: depth * 12 }}>
      <div className={styles.postHead}>
        {avatar && <img src={avatar} alt="" className={styles.avatar} />}
        <Link
          to={`/profile/${encodeURIComponent(handle)}`}
          className={styles.handleLink}
        >
          @{handle}
        </Link>
      </div>
      {text && <p className={styles.postText}>{text}</p>}
      {allMedia.length > 0 && <MediaGallery items={allMedia} />}
      {hasReplies && (
        <div className={styles.repliesContainer}>
          <button
            type="button"
            className={styles.repliesBar}
            onClick={() => canCollapse && onToggleCollapse(post.uri)}
            aria-label={isCollapsed ? 'Expand replies' : 'Collapse replies'}
            title={isCollapsed ? 'Expand replies' : 'Collapse replies'}
          />
          {isCollapsed ? (
            <button
              type="button"
              className={styles.repliesCollapsed}
              onClick={() => onToggleCollapse?.(post.uri)}
            >
              {replies.length} reply{replies.length !== 1 ? 's' : ''}
            </button>
          ) : (
            <div className={styles.replies}>
              {replies.map((r) => (
                <PostBlock
                  key={isThreadViewPost(r) ? r.post.uri : Math.random()}
                  node={r}
                  depth={depth + 1}
                  collapsedThreads={collapsedThreads}
                  onToggleCollapse={onToggleCollapse}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </article>
  )
}

export default function PostDetailPage() {
  const { uri } = useParams<{ uri: string }>()
  const navigate = useNavigate()
  const decodedUri = uri ? decodeURIComponent(uri) : ''
  const [thread, setThread] = useState<
    AppBskyFeedDefs.ThreadViewPost | AppBskyFeedDefs.NotFoundPost | AppBskyFeedDefs.BlockedPost | { $type: string } | null
  >(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [comment, setComment] = useState('')
  const [posting, setPosting] = useState(false)
  const [addToBoardId, setAddToBoardId] = useState<string | null>(null)
  const [addedToBoard, setAddedToBoard] = useState<string | null>(null)
  const [collapsedThreads, setCollapsedThreads] = useState<Set<string>>(() => new Set())
  const boards = getArtboards()

  function toggleCollapse(uri: string) {
    setCollapsedThreads((prev) => {
      const next = new Set(prev)
      if (next.has(uri)) next.delete(uri)
      else next.add(uri)
      return next
    })
  }

  const load = useCallback(async () => {
    if (!decodedUri) return
    setLoading(true)
    setError(null)
    try {
      const res = await agent.app.bsky.feed.getPostThread({ uri: decodedUri, depth: 10 })
      const th = res.data.thread
      setThread(th)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load post')
    } finally {
      setLoading(false)
    }
  }, [decodedUri])

  useEffect(() => {
    load()
  }, [load])

  async function handlePostReply(e: React.FormEvent) {
    e.preventDefault()
    if (!thread || !isThreadViewPost(thread) || !comment.trim()) return
    const rootPost = thread.post
    setPosting(true)
    try {
      await postReply(rootPost.uri, rootPost.cid, comment.trim())
      setComment('')
      await load()
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to post comment')
    } finally {
      setPosting(false)
    }
  }

  function handleAddToArtboard() {
    if (!thread || !isThreadViewPost(thread) || !addToBoardId) return
    const post = thread.post
    const media = getPostMediaUrl(post)
    addPostToArtboard(addToBoardId, {
      uri: post.uri,
      cid: post.cid,
      authorHandle: post.author.handle,
      text: (post.record as { text?: string })?.text?.slice(0, 200),
      thumb: media?.url,
    })
    setAddedToBoard(addToBoardId)
    setAddToBoardId(null)
  }

  if (!decodedUri) {
    navigate('/feed', { replace: true })
    return null
  }

  const rootMedia =
    thread && isThreadViewPost(thread) ? getPostAllMedia(thread.post) : []

  return (
    <Layout title="Post" showNav>
      <div className={styles.wrap}>
        {loading && <div className={styles.loading}>Loading…</div>}
        {error && <p className={styles.error}>{error}</p>}
        {thread && isThreadViewPost(thread) && (
          <>
            <article className={styles.postBlock}>
              <div className={styles.postHead}>
                {thread.post.author.avatar && (
                  <img src={thread.post.author.avatar} alt="" className={styles.avatar} />
                )}
                <Link
                  to={`/profile/${encodeURIComponent(thread.post.author.handle ?? thread.post.author.did)}`}
                  className={styles.handleLink}
                >
                  @{thread.post.author.handle ?? thread.post.author.did}
                </Link>
              </div>
              {(thread.post.record as { text?: string })?.text && (
                <p className={styles.postText}>
                  {(thread.post.record as { text?: string }).text}
                </p>
              )}
              {rootMedia.length > 0 && <MediaGallery items={rootMedia} autoPlayFirstVideo />}
            </article>
            <section className={styles.actions} aria-label="Add to artboard">
              <div className={styles.addToBoard}>
                <label htmlFor="board-select">Add to artboard:</label>
                <select
                  id="board-select"
                  value={addToBoardId ?? ''}
                  onChange={(e) => setAddToBoardId(e.target.value || null)}
                  className={styles.select}
                >
                  <option value="">Choose…</option>
                  {boards.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
                {addToBoardId && (
                  <button type="button" className={styles.addBtn} onClick={handleAddToArtboard}>
                    Add
                  </button>
                )}
              </div>
              {addedToBoard && (
                <p className={styles.added}>
                  Added to {boards.find((b) => b.id === addedToBoard)?.name}
                </p>
              )}
            </section>
            {'replies' in thread && Array.isArray(thread.replies) && thread.replies.length > 0 && (
              <div className={styles.replies}>
                {(thread.replies as (typeof thread)[]).map((r) => (
                  <PostBlock
                    key={isThreadViewPost(r) ? r.post.uri : Math.random()}
                    node={r}
                    depth={0}
                    collapsedThreads={collapsedThreads}
                    onToggleCollapse={toggleCollapse}
                  />
                ))}
              </div>
            )}
            <form onSubmit={handlePostReply} className={styles.commentForm}>
              <textarea
                placeholder="Write a comment…"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                className={styles.textarea}
                rows={3}
                maxLength={300}
              />
              <button type="submit" className={styles.submit} disabled={posting || !comment.trim()}>
                {posting ? 'Posting…' : 'Post comment'}
              </button>
            </form>
          </>
        )}
      </div>
    </Layout>
  )
}
