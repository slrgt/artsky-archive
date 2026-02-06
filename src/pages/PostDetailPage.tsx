import { useCallback, useEffect, useRef, useState, useMemo } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import type { AppBskyFeedDefs } from '@atproto/api'
import { agent, publicAgent, postReply, getPostAllMedia, getPostMediaUrl, getSession } from '../lib/bsky'
import { useSession } from '../context/SessionContext'
import { getArtboards, createArtboard, addPostToArtboard, isPostInArtboard } from '../lib/artboards'
import { formatRelativeTime, formatExactDateTime } from '../lib/date'
import Layout from '../components/Layout'
import VideoWithHls from '../components/VideoWithHls'
import PostText from '../components/PostText'
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
  onReply,
  rootPostUri,
  rootPostCid,
  replyingTo,
  replyComment,
  setReplyComment,
  onReplySubmit,
  replyPosting,
  clearReplyingTo,
  commentFormRef,
  replyAs,
}: {
  node: AppBskyFeedDefs.ThreadViewPost | AppBskyFeedDefs.NotFoundPost | AppBskyFeedDefs.BlockedPost | { $type: string }
  depth?: number
  collapsedThreads?: Set<string>
  onToggleCollapse?: (uri: string) => void
  onReply?: (parentUri: string, parentCid: string, handle: string) => void
  rootPostUri?: string
  rootPostCid?: string
  replyingTo?: { uri: string; cid: string; handle: string } | null
  replyComment?: string
  setReplyComment?: (v: string) => void
  onReplySubmit?: (e: React.FormEvent) => void
  replyPosting?: boolean
  clearReplyingTo?: () => void
  commentFormRef?: React.RefObject<HTMLFormElement | null>
  replyAs?: { handle: string; avatar?: string } | null
}) {
  if (!isThreadViewPost(node)) return null
  const { post } = node
  const allMedia = getPostAllMedia(post)
  const text = (post.record as { text?: string })?.text ?? ''
  const handle = post.author.handle ?? post.author.did
  const avatar = post.author.avatar ?? undefined
  const createdAt = (post.record as { createdAt?: string })?.createdAt
  const replies = 'replies' in node && Array.isArray(node.replies) ? (node.replies as (typeof node)[]) : []
  const hasReplies = replies.length > 0
  const isCollapsed = hasReplies && collapsedThreads?.has(post.uri)
  const canCollapse = hasReplies && onToggleCollapse
  const isReplyTarget = replyingTo?.uri === post.uri

  return (
    <article className={styles.postBlock} style={{ marginLeft: depth * 12 }}>
      <div className={styles.postHead}>
        {avatar && <img src={avatar} alt="" className={styles.avatar} />}
        <div className={styles.authorRow}>
          <Link
            to={`/profile/${encodeURIComponent(handle)}`}
            className={styles.handleLink}
          >
            @{handle}
          </Link>
          {createdAt && (
            <span
              className={styles.postTimestamp}
              title={formatExactDateTime(createdAt)}
            >
              {formatRelativeTime(createdAt)}
            </span>
          )}
          {onReply && (
            <button
              type="button"
              className={styles.replyBtn}
              onClick={() => onReply(post.uri, post.cid, handle)}
            >
              Reply
            </button>
          )}
        </div>
      </div>
      {allMedia.length > 0 && <MediaGallery items={allMedia} />}
      {text && (
        <p className={styles.postText}>
          <PostText text={text} />
        </p>
      )}
      {isReplyTarget && replyingTo && setReplyComment && onReplySubmit && clearReplyingTo && commentFormRef && (
        <form ref={commentFormRef} onSubmit={onReplySubmit} className={styles.inlineReplyForm}>
          {replyAs && (
            <p className={styles.replyAs}>
              {replyAs.avatar && <img src={replyAs.avatar} alt="" className={styles.replyAsAvatar} />}
              <span className={styles.replyAsHandle}>@{replyAs.handle}</span>
            </p>
          )}
          <p className={styles.replyingTo}>
            Replying to @{replyingTo.handle}
            <button type="button" className={styles.cancelReply} onClick={clearReplyingTo} aria-label="Cancel reply">
              ×
            </button>
          </p>
          <textarea
            placeholder={`Reply to @${replyingTo.handle}…`}
            value={replyComment ?? ''}
            onChange={(e) => setReplyComment(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && e.metaKey) {
                e.preventDefault()
                if ((replyComment ?? '').trim() && !replyPosting) commentFormRef.current?.requestSubmit()
              }
            }}
            className={styles.textarea}
            rows={2}
            maxLength={300}
            autoFocus
          />
          <p className={styles.hint}>⌘ Enter to post</p>
          <button type="submit" className={styles.submit} disabled={replyPosting || !(replyComment ?? '').trim()}>
            {replyPosting ? 'Posting…' : 'Post reply'}
          </button>
        </form>
      )}
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
                  onReply={onReply}
                  rootPostUri={rootPostUri}
                  rootPostCid={rootPostCid}
                  replyingTo={replyingTo}
                  replyComment={replyComment}
                  setReplyComment={setReplyComment}
                  onReplySubmit={onReplySubmit}
                  replyPosting={replyPosting}
                  clearReplyingTo={clearReplyingTo}
                  commentFormRef={commentFormRef}
                  replyAs={replyAs}
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
  const [addToBoardIds, setAddToBoardIds] = useState<Set<string>>(new Set())
  const [addedToBoard, setAddedToBoard] = useState<string | null>(null)
  const [collapsedThreads, setCollapsedThreads] = useState<Set<string>>(() => new Set())
  const [followLoading, setFollowLoading] = useState(false)
  const [authorFollowed, setAuthorFollowed] = useState(false)
  const [followUriOverride, setFollowUriOverride] = useState<string | null>(null)
  const [likeLoading, setLikeLoading] = useState(false)
  const [repostLoading, setRepostLoading] = useState(false)
  const [likeUriOverride, setLikeUriOverride] = useState<string | null>(null)
  const [repostUriOverride, setRepostUriOverride] = useState<string | null>(null)
  const [replyingTo, setReplyingTo] = useState<{ uri: string; cid: string; handle: string } | null>(null)
  const [newBoardName, setNewBoardName] = useState('')
  const [showBoardDropdown, setShowBoardDropdown] = useState(false)
  const commentFormRef = useRef<HTMLFormElement>(null)
  const boards = getArtboards()
  const session = getSession()
  const { session: sessionFromContext } = useSession()
  const [replyAsProfile, setReplyAsProfile] = useState<{ handle: string; avatar?: string } | null>(null)

  useEffect(() => {
    const s = sessionFromContext ?? session
    if (!s?.did) {
      setReplyAsProfile(null)
      return
    }
    const handle = (s as { handle?: string }).handle ?? s.did
    agent.getProfile({ actor: s.did })
      .then((res) => setReplyAsProfile({ handle: res.data.handle ?? handle, avatar: res.data.avatar }))
      .catch(() => setReplyAsProfile({ handle }))
  }, [sessionFromContext?.did, session?.did])

  const replyAs = replyAsProfile ?? (session ? { handle: (session as { handle?: string }).handle ?? session.did } : null)
  const isOwnPost = thread && isThreadViewPost(thread) && session?.did === thread.post.author.did
  const authorViewer = thread && isThreadViewPost(thread) ? (thread.post.author as { viewer?: { following?: string } }).viewer : undefined
  const followingUri = authorViewer?.following ?? followUriOverride
  const alreadyFollowing = !!followingUri || authorFollowed
  const postViewer = thread && isThreadViewPost(thread) ? (thread.post as { viewer?: { like?: string; repost?: string } }).viewer : undefined
  const likedUri = postViewer?.like ?? likeUriOverride
  const repostedUri = postViewer?.repost ?? repostUriOverride
  const isLiked = !!likedUri
  const isReposted = !!repostedUri

  function toggleCollapse(uri: string) {
    setCollapsedThreads((prev) => {
      const next = new Set(prev)
      if (next.has(uri)) next.delete(uri)
      else next.add(uri)
      return next
    })
  }

  async function handleFollowAuthor() {
    if (!thread || !isThreadViewPost(thread) || followLoading || alreadyFollowing) return
    setFollowLoading(true)
    try {
      const res = await agent.follow(thread.post.author.did)
      setFollowUriOverride(res.uri)
      setAuthorFollowed(true)
    } catch {
      // leave button state unchanged so user can retry
    } finally {
      setFollowLoading(false)
    }
  }

  async function handleUnfollowAuthor() {
    if (!followingUri || followLoading) return
    setFollowLoading(true)
    try {
      await agent.deleteFollow(followingUri)
      setFollowUriOverride(null)
      setAuthorFollowed(false)
    } catch {
      // leave state unchanged so user can retry
    } finally {
      setFollowLoading(false)
    }
  }

  async function handleLike() {
    if (!thread || !isThreadViewPost(thread) || likeLoading) return
    const { uri, cid } = thread.post
    setLikeLoading(true)
    try {
      if (isLiked) {
        await agent.deleteLike(likedUri!)
        setLikeUriOverride(null)
      } else {
        const res = await agent.like(uri, cid)
        setLikeUriOverride(res.uri)
      }
    } catch {
      // leave state unchanged
    } finally {
      setLikeLoading(false)
    }
  }

  async function handleRepost() {
    if (!thread || !isThreadViewPost(thread) || repostLoading) return
    const { uri, cid } = thread.post
    setRepostLoading(true)
    try {
      if (isReposted) {
        await agent.deleteRepost(repostedUri!)
        setRepostUriOverride(null)
      } else {
        const res = await agent.repost(uri, cid)
        setRepostUriOverride(res.uri)
      }
    } catch {
      // leave state unchanged
    } finally {
      setRepostLoading(false)
    }
  }

  const load = useCallback(async () => {
    if (!decodedUri) return
    setLoading(true)
    setError(null)
    const api = getSession() ? agent : publicAgent
    try {
      const res = await api.app.bsky.feed.getPostThread({ uri: decodedUri, depth: 10 })
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
    const parent = replyingTo ?? { uri: rootPost.uri, cid: rootPost.cid }
    setPosting(true)
    try {
      await postReply(rootPost.uri, rootPost.cid, parent.uri, parent.cid, comment.trim())
      setComment('')
      setReplyingTo(null)
      await load()
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to post comment')
    } finally {
      setPosting(false)
    }
  }

  function handleReplyTo(parentUri: string, parentCid: string, handle: string) {
    setReplyingTo({ uri: parentUri, cid: parentCid, handle })
    const form = document.querySelector(`.${styles.commentForm} textarea`) as HTMLTextAreaElement | null
    form?.focus()
  }

  function handleAddToArtboard() {
    if (!thread || !isThreadViewPost(thread)) return
    const hasSelection = addToBoardIds.size > 0 || newBoardName.trim().length > 0
    if (!hasSelection) return
    const post = thread.post
    const media = getPostMediaUrl(post)
    const payload = {
      uri: post.uri,
      cid: post.cid,
      authorHandle: post.author.handle,
      text: (post.record as { text?: string })?.text?.slice(0, 200),
      thumb: media?.url,
    }
    const added: string[] = []
    if (newBoardName.trim()) {
      const board = createArtboard(newBoardName.trim())
      addPostToArtboard(board.id, payload)
      added.push(board.id)
      setNewBoardName('')
    }
    addToBoardIds.forEach((id) => {
      addPostToArtboard(id, payload)
      added.push(id)
    })
    setAddedToBoard(added[0] ?? null)
    setAddToBoardIds(new Set())
    setShowBoardDropdown(false)
  }

  function toggleBoardSelection(boardId: string) {
    setAddToBoardIds((prev) => {
      const next = new Set(prev)
      if (next.has(boardId)) next.delete(boardId)
      else next.add(boardId)
      return next
    })
  }

  if (!decodedUri) {
    navigate('/feed', { replace: true })
    return null
  }

  const rootMedia =
    thread && isThreadViewPost(thread) ? getPostAllMedia(thread.post) : []

  return (
    <Layout title="Post" showNav showColumnView={false}>
      <div className={styles.wrap}>
        {loading && <div className={styles.loading}>Loading…</div>}
        {error && <p className={styles.error}>{error}</p>}
        {thread && isThreadViewPost(thread) && (
          <>
            <article className={styles.postBlock}>
              {rootMedia.length > 0 && <MediaGallery items={rootMedia} autoPlayFirstVideo />}
              <div className={styles.postHead}>
                {thread.post.author.avatar && (
                  <img src={thread.post.author.avatar} alt="" className={styles.avatar} />
                )}
                <div className={styles.authorRow}>
                  <Link
                    to={`/profile/${encodeURIComponent(thread.post.author.handle ?? thread.post.author.did)}`}
                    className={styles.handleLink}
                  >
                    @{thread.post.author.handle ?? thread.post.author.did}
                  </Link>
                  {!isOwnPost && (
                    alreadyFollowing ? (
                      <button
                        type="button"
                        className={`${styles.followBtn} ${styles.followBtnFollowing}`}
                        onClick={handleUnfollowAuthor}
                        disabled={followLoading}
                        title="Unfollow"
                      >
                        <span className={styles.followLabelDefault}>Following</span>
                        <span className={styles.followLabelHover}>Unfollow</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        className={styles.followBtn}
                        onClick={handleFollowAuthor}
                        disabled={followLoading}
                      >
                        {followLoading ? 'Following…' : 'Follow'}
                      </button>
                    )
                  )}
                  {(thread.post.record as { createdAt?: string })?.createdAt && (
                    <span
                      className={styles.postTimestamp}
                      title={formatExactDateTime((thread.post.record as { createdAt: string }).createdAt)}
                    >
                      {formatRelativeTime((thread.post.record as { createdAt: string }).createdAt)}
                    </span>
                  )}
                </div>
              </div>
              {(thread.post.record as { text?: string })?.text && (
                <p className={styles.postText}>
                  <PostText text={(thread.post.record as { text?: string }).text!} />
                </p>
              )}
            </article>
            <section className={styles.actions} aria-label="Post actions">
              <div className={styles.actionRow}>
                <div className={styles.addToBoardWrap}>
                  <button
                    type="button"
                    className={styles.addToBoardTrigger}
                    onClick={() => setShowBoardDropdown((v) => !v)}
                    aria-expanded={showBoardDropdown}
                    aria-haspopup="true"
                  >
                    Add to artboard {showBoardDropdown ? '▾' : '▸'}
                  </button>
                  {showBoardDropdown && (
                    <div className={styles.boardDropdown}>
                      {boards.length === 0 ? null : (
                        <>
                          {boards.map((b) => {
                            const alreadyIn = isPostInArtboard(b.id, thread.post.uri)
                            const selected = addToBoardIds.has(b.id)
                            return (
                              <label key={b.id} className={styles.boardCheckLabel}>
                                <input
                                  type="checkbox"
                                  checked={selected}
                                  onChange={() => !alreadyIn && toggleBoardSelection(b.id)}
                                  disabled={alreadyIn}
                                  className={styles.boardCheckbox}
                                />
                                <span className={styles.boardCheckText}>
                                  {alreadyIn ? (
                                    <>
                                      <span className={styles.boardCheckIcon} aria-hidden>✓</span> {b.name}
                                    </>
                                  ) : (
                                    b.name
                                  )}
                                </span>
                              </label>
                            )
                          })}
                        </>
                      )}
                      <div className={styles.boardDropdownNew}>
                        <input
                          type="text"
                          placeholder="New collection name"
                          value={newBoardName}
                          onChange={(e) => setNewBoardName(e.target.value)}
                          className={styles.newBoardInput}
                          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddToArtboard())}
                        />
                      </div>
                      <div className={styles.boardDropdownActions}>
                        <button
                          type="button"
                          className={styles.addBtn}
                          onClick={handleAddToArtboard}
                          disabled={addToBoardIds.size === 0 && !newBoardName.trim()}
                        >
                          Add to selected
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  className={`${styles.likeRepostBtn} ${isLiked ? styles.likeRepostBtnActive : ''}`}
                  onClick={handleLike}
                  disabled={likeLoading}
                  title={isLiked ? 'Unlike' : 'Like'}
                >
                  {likeLoading ? '…' : isLiked ? '♥' : '♡'} Like
                </button>
                <button
                  type="button"
                  className={`${styles.likeRepostBtn} ${isReposted ? styles.likeRepostBtnActive : ''}`}
                  onClick={handleRepost}
                  disabled={repostLoading}
                  title={isReposted ? 'Remove repost' : 'Repost'}
                >
                  {repostLoading ? '…' : 'Repost'}
                </button>
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
                    onReply={handleReplyTo}
                    rootPostUri={thread.post.uri}
                    rootPostCid={thread.post.cid}
                    replyingTo={replyingTo}
                    replyComment={comment}
                    setReplyComment={setComment}
                    onReplySubmit={handlePostReply}
                    replyPosting={posting}
                    clearReplyingTo={() => setReplyingTo(null)}
                    commentFormRef={commentFormRef}
                    replyAs={replyAs}
                  />
                ))}
              </div>
            )}
            {!replyingTo && (
              <form ref={commentFormRef} onSubmit={handlePostReply} className={styles.commentForm}>
                {replyAs && (
                  <p className={styles.replyAs}>
                    {replyAs.avatar && <img src={replyAs.avatar} alt="" className={styles.replyAsAvatar} />}
                    <span className={styles.replyAsHandle}>@{replyAs.handle}</span>
                  </p>
                )}
                <textarea
                  placeholder="Write a comment…"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && e.metaKey) {
                      e.preventDefault()
                      if (comment.trim() && !posting) commentFormRef.current?.requestSubmit()
                    }
                  }}
                  className={styles.textarea}
                  rows={3}
                  maxLength={300}
                />
                <p className={styles.hint}>⌘ Enter to post</p>
                <button type="submit" className={styles.submit} disabled={posting || !comment.trim()}>
                  {posting ? 'Posting…' : 'Post comment'}
                </button>
              </form>
            )}
          </>
        )}
      </div>
    </Layout>
  )
}
