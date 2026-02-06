import { useCallback, useEffect, useRef, useState, useMemo } from 'react'
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom'
import type { AppBskyFeedDefs } from '@atproto/api'
import type { AtpSessionData } from '@atproto/api'
import { agent, publicAgent, postReply, getPostAllMedia, getPostMediaUrl, getSession } from '../lib/bsky'
import { useSession } from '../context/SessionContext'
import { getArtboards, createArtboard, addPostToArtboard, isPostInArtboard } from '../lib/artboards'
import { formatRelativeTime, formatExactDateTime } from '../lib/date'
import Layout from '../components/Layout'
import VideoWithHls from '../components/VideoWithHls'
import PostText from '../components/PostText'
import styles from './PostDetailPage.module.css'

function ReplyAsRow({
  replyAs,
  sessionsList,
  switchAccount,
  currentDid,
}: {
  replyAs: { handle: string; avatar?: string }
  sessionsList: AtpSessionData[]
  switchAccount: (did: string) => Promise<boolean>
  currentDid: string
}) {
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [accountProfiles, setAccountProfiles] = useState<Record<string, { avatar?: string; handle?: string }>>({})
  const wrapRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!dropdownOpen) return
    const onDocClick = (e: MouseEvent) => {
      if (wrapRef.current?.contains(e.target as Node)) return
      setDropdownOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [dropdownOpen])
  const sessionsDidKey = useMemo(() => sessionsList.map((s) => s.did).sort().join(','), [sessionsList])
  useEffect(() => {
    if (sessionsList.length === 0) {
      setAccountProfiles({})
      return
    }
    let cancelled = false
    sessionsList.forEach((s) => {
      publicAgent.getProfile({ actor: s.did }).then((res) => {
        if (cancelled) return
        const data = res.data as { avatar?: string; handle?: string }
        setAccountProfiles((prev) => ({ ...prev, [s.did]: { avatar: data.avatar, handle: data.handle } }))
      }).catch(() => {})
    })
    return () => { cancelled = true }
  }, [sessionsDidKey, sessionsList])
  const canSwitch = sessionsList.length > 1
  return (
    <p className={styles.replyAs}>
      <span className={styles.replyAsLabel}>Replying as</span>
      <span className={styles.replyAsUserChip}>
        {replyAs.avatar ? (
          <img src={replyAs.avatar} alt="" className={styles.replyAsAvatar} />
        ) : (
          <span className={styles.replyAsAvatarPlaceholder} aria-hidden>{replyAs.handle.slice(0, 1).toUpperCase()}</span>
        )}
        <div className={styles.replyAsHandleWrap} ref={wrapRef}>
          {canSwitch ? (
            <>
              <button
                type="button"
                className={styles.replyAsHandleBtn}
                onClick={() => setDropdownOpen((o) => !o)}
                aria-expanded={dropdownOpen}
                aria-haspopup="true"
              >
                @{replyAs.handle}
              </button>
              {dropdownOpen && (
                <div className={styles.replyAsDropdown} role="menu">
                  {sessionsList.map((s) => {
                    const profile = accountProfiles[s.did]
                    const handle = profile?.handle ?? (s as { handle?: string }).handle ?? s.did
                    const isCurrent = s.did === currentDid
                    return (
                      <button
                        key={s.did}
                        type="button"
                        role="menuitem"
                        className={isCurrent ? styles.replyAsDropdownItemActive : styles.replyAsDropdownItem}
                        onClick={async () => {
                          const ok = await switchAccount(s.did)
                          if (ok) setDropdownOpen(false)
                        }}
                      >
                        {profile?.avatar ? (
                          <img src={profile.avatar} alt="" className={styles.replyAsDropdownAvatar} />
                        ) : (
                          <span className={styles.replyAsDropdownAvatarPlaceholder} aria-hidden>{(handle || s.did).slice(0, 1).toUpperCase()}</span>
                        )}
                        <span className={styles.replyAsDropdownHandle}>@{handle}</span>
                        {isCurrent && <span className={styles.replyAsDropdownCheck} aria-hidden>✓</span>}
                      </button>
                    )
                  })}
                </div>
              )}
            </>
          ) : (
            <span className={styles.replyAsHandle}>@{replyAs.handle}</span>
          )}
        </div>
      </span>
    </p>
  )
}

function isThreadViewPost(
  node: AppBskyFeedDefs.ThreadViewPost | AppBskyFeedDefs.NotFoundPost | AppBskyFeedDefs.BlockedPost | { $type: string }
): node is AppBskyFeedDefs.ThreadViewPost {
  return node && typeof node === 'object' && 'post' in node && !!(node as AppBskyFeedDefs.ThreadViewPost).post
}

/** Flatten visible comments in display order (expanded threads include nested replies). */
function flattenVisibleReplies(
  replies: AppBskyFeedDefs.ThreadViewPost[],
  collapsed: Set<string>
): { uri: string; handle: string }[] {
  return replies.flatMap((r) => {
    const uri = r.post.uri
    const handle = r.post.author?.handle ?? r.post.author?.did ?? ''
    if (collapsed.has(uri)) return [{ uri, handle }]
    const nested =
      'replies' in r && Array.isArray(r.replies)
        ? (r.replies as unknown[]).filter((x): x is AppBskyFeedDefs.ThreadViewPost => isThreadViewPost(x as Parameters<typeof isThreadViewPost>[0]))
        : []
    return [{ uri, handle }, ...flattenVisibleReplies(nested, collapsed)]
  })
}

function findReplyByUri(
  replies: AppBskyFeedDefs.ThreadViewPost[],
  uri: string
): AppBskyFeedDefs.ThreadViewPost | null {
  for (const r of replies) {
    if (r.post.uri === uri) return r
    const nested =
      'replies' in r && Array.isArray(r.replies)
        ? (r.replies as unknown[]).filter((x): x is AppBskyFeedDefs.ThreadViewPost => isThreadViewPost(x as Parameters<typeof isThreadViewPost>[0]))
        : []
    const found = findReplyByUri(nested, uri)
    if (found) return found
  }
  return null
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
              <div
                key={i}
                className={styles.galleryVideoWrap}
                data-media-item={i}
                tabIndex={0}
              >
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
              data-media-item={i}
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
  sessionsList,
  switchAccount,
  currentDid,
  focusedCommentUri,
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
  sessionsList?: AtpSessionData[]
  switchAccount?: (did: string) => Promise<boolean>
  currentDid?: string
  focusedCommentUri?: string
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
  const canCollapse = !!onToggleCollapse
  const isReplyTarget = replyingTo?.uri === post.uri
  const isFocused = focusedCommentUri === post.uri

  return (
    <article className={`${styles.postBlock} ${isFocused ? styles.commentFocused : ''}`} style={{ marginLeft: depth * 12 }} data-comment-uri={post.uri}>
      {canCollapse && (
        <div className={styles.collapseColumn}>
          <button
            type="button"
            className={styles.collapseBtn}
            onClick={() => onToggleCollapse?.(post.uri)}
            aria-label={isCollapsed ? 'Expand this comment' : 'Collapse this comment'}
            title={isCollapsed ? 'Expand this comment' : 'Collapse this comment'}
          >
            <span className={styles.collapseIcon} aria-hidden>−</span>
          </button>
          <button
            type="button"
            className={styles.collapseStrip}
            onClick={() => onToggleCollapse?.(post.uri)}
            aria-label={isCollapsed ? 'Expand this comment' : 'Collapse this comment'}
            title={isCollapsed ? 'Expand this comment' : 'Collapse this comment'}
          />
        </div>
      )}
      <div className={styles.postBlockContent}>
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
        </div>
      </div>
      {allMedia.length > 0 && <MediaGallery items={allMedia} />}
      {text && (
        <p className={styles.postText}>
          <PostText text={text} />
        </p>
      )}
      {onReply && (
        <div className={styles.replyBtnRow}>
          <button
            type="button"
            className={styles.replyBtn}
            onClick={() => onReply(post.uri, post.cid, handle)}
          >
            Reply
          </button>
        </div>
      )}
      {isReplyTarget && replyingTo && setReplyComment && onReplySubmit && clearReplyingTo && commentFormRef && (
        <div className={styles.inlineReplyFormWrap}>
          <form ref={commentFormRef} onSubmit={onReplySubmit} className={styles.inlineReplyForm}>
            <div className={styles.inlineReplyFormHeader}>
              <button type="button" className={styles.cancelReply} onClick={clearReplyingTo} aria-label="Cancel reply">
                ×
              </button>
              {replyAs && (sessionsList && switchAccount && currentDid ? (
                <ReplyAsRow replyAs={replyAs} sessionsList={sessionsList} switchAccount={switchAccount} currentDid={currentDid} />
              ) : (
                <p className={styles.replyAs}>
                  <span className={styles.replyAsLabel}>Replying as</span>
                  <span className={styles.replyAsUserChip}>
                    {replyAs.avatar ? (
                      <img src={replyAs.avatar} alt="" className={styles.replyAsAvatar} />
                    ) : (
                      <span className={styles.replyAsAvatarPlaceholder} aria-hidden>{replyAs.handle.slice(0, 1).toUpperCase()}</span>
                    )}
                    <span className={styles.replyAsHandle}>@{replyAs.handle}</span>
                  </span>
                </p>
              ))}
            </div>
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
        </div>
      )}
      {hasReplies && (
        <div className={styles.repliesContainer}>
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
              {replies.map((r) => {
                if (!isThreadViewPost(r)) return null
                const replyDepth = depth + 1
                if (collapsedThreads?.has(r.post.uri)) {
                  const replyCount = 'replies' in r && Array.isArray(r.replies) ? (r.replies as unknown[]).length : 0
                  const label = replyCount === 0 ? 'Comment' : `${replyCount} reply${replyCount !== 1 ? 's' : ''}`
                  const replyHandle = r.post.author?.handle ?? r.post.author?.did ?? ''
                  return (
                    <div key={r.post.uri} className={styles.collapsedCommentWrap} style={{ marginLeft: replyDepth * 12 }}>
                      <button type="button" className={styles.collapsedCommentBtn} onClick={() => onToggleCollapse?.(r.post.uri)}>
                        <span className={styles.collapsedCommentExpandIcon} aria-hidden>+</span>
                        {r.post.author?.avatar ? (
                          <img src={r.post.author.avatar} alt="" className={styles.collapsedCommentAvatar} />
                        ) : (
                          <span className={styles.collapsedCommentAvatarPlaceholder} aria-hidden>{replyHandle.slice(0, 1).toUpperCase()}</span>
                        )}
                        <span className={styles.collapsedCommentHandle}>@{replyHandle}</span>
                        <span className={styles.collapsedCommentLabel}>{label}</span>
                      </button>
                    </div>
                  )
                }
                return (
                  <PostBlock
                    key={r.post.uri}
                    node={r}
                    depth={replyDepth}
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
                    sessionsList={sessionsList}
                    switchAccount={switchAccount}
                    currentDid={currentDid}
                    focusedCommentUri={focusedCommentUri}
                  />
                )
              })}
            </div>
          )}
        </div>
      )}
      </div>
    </article>
  )
}

export default function PostDetailPage() {
  const { uri } = useParams<{ uri: string }>()
  const navigate = useNavigate()
  const location = useLocation()
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
  const [postSectionIndex, setPostSectionIndex] = useState(0)
  const commentFormRef = useRef<HTMLFormElement>(null)
  const mediaSectionRef = useRef<HTMLDivElement>(null)
  const descriptionSectionRef = useRef<HTMLDivElement>(null)
  const commentsSectionRef = useRef<HTMLDivElement>(null)
  const [focusedCommentIndex, setFocusedCommentIndex] = useState(0)
  const prevSectionIndexRef = useRef(0)
  const boards = getArtboards()
  const session = getSession()
  const { session: sessionFromContext, sessionsList, switchAccount } = useSession()
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
  }, [decodedUri, sessionFromContext?.did])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    const state = location.state as { openReply?: boolean } | null
    if (!thread || !isThreadViewPost(thread) || !state?.openReply) return
    const handle = thread.post.author?.handle ?? thread.post.author?.did ?? ''
    setReplyingTo({ uri: thread.post.uri, cid: thread.post.cid, handle })
    navigate(location.pathname, { replace: true, state: {} })
    requestAnimationFrame(() => {
      const form = document.querySelector(`.${styles.commentForm} textarea`) as HTMLTextAreaElement | null
      form?.focus()
    })
  }, [thread, location.state, location.pathname, navigate])

  useEffect(() => {
    if (!replyingTo) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        setReplyingTo(null)
        const el = document.activeElement
        if (el instanceof HTMLElement) el.blur()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [replyingTo])

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

  const rootMediaForNav =
    thread && isThreadViewPost(thread) ? getPostAllMedia(thread.post) : []
  const hasMediaSection = rootMediaForNav.length > 0
  const hasRepliesSection =
    thread && isThreadViewPost(thread) && 'replies' in thread &&
    Array.isArray(thread.replies) && thread.replies.length > 0
  const postSectionCount = (hasMediaSection ? 1 : 0) + 1 + (hasRepliesSection ? 1 : 0)

  const threadReplies = thread && isThreadViewPost(thread) && 'replies' in thread && Array.isArray(thread.replies)
    ? (thread.replies as (typeof thread)[]).filter((r): r is AppBskyFeedDefs.ThreadViewPost => isThreadViewPost(r))
    : []
  const threadRepliesFlat = useMemo(
    () => flattenVisibleReplies(threadReplies, collapsedThreads),
    [threadReplies, collapsedThreads]
  )
  const threadRepliesFlatRef = useRef(threadRepliesFlat)
  threadRepliesFlatRef.current = threadRepliesFlat

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable) return
      const key = e.key.toLowerCase()
      if (key === 'r') {
        const t = thread
        if (!t || !isThreadViewPost(t)) return
        e.preventDefault()
        const inCommentsSection = hasRepliesSection && postSectionIndex === postSectionCount - 1
        if (inCommentsSection && threadRepliesFlat.length > 0 && focusedCommentIndex >= 0 && focusedCommentIndex < threadRepliesFlat.length) {
          const focused = threadRepliesFlat[focusedCommentIndex]
          const replyNode = findReplyByUri(threadReplies, focused.uri)
          if (replyNode) handleReplyTo(replyNode.post.uri, replyNode.post.cid, focused.handle)
        } else if (postSectionIndex === (hasMediaSection ? 1 : 0)) {
          const handle = t.post.author?.handle ?? t.post.author?.did ?? ''
          handleReplyTo(t.post.uri, t.post.cid, handle)
        }
        return
      }
      if (key !== 'w' && key !== 'a' && key !== 's') return
      if (postSectionCount <= 1 && key !== 'w') return

      const inCommentsSection = hasRepliesSection && postSectionIndex === postSectionCount - 1
      const inDescriptionSection = descriptionSectionRef.current?.contains(target) ?? false
      const inMediaSection = mediaSectionRef.current?.contains(target) ?? false

      if (key === 'w') {
        if (inDescriptionSection && hasMediaSection && rootMediaForNav.length > 0) {
          e.preventDefault()
          setPostSectionIndex(0)
          const mediaSection = mediaSectionRef.current
          const items = mediaSection?.querySelectorAll<HTMLElement>('[data-media-item]')
          const last = items?.[rootMediaForNav.length - 1]
          if (last) {
            requestAnimationFrame(() => {
              last.focus()
              last.scrollIntoView({ behavior: 'smooth', block: 'center' })
            })
          }
          return
        }
        if (inMediaSection && rootMediaForNav.length > 0) {
          const mediaSection = mediaSectionRef.current
          const items = mediaSection?.querySelectorAll<HTMLElement>('[data-media-item]')
          let el: HTMLElement | null = target
          let currentIndex = -1
          while (el && el !== mediaSection) {
            const idx = el.getAttribute?.('data-media-item')
            if (idx != null) {
              currentIndex = parseInt(idx, 10)
              break
            }
            el = el.parentElement
          }
          if (currentIndex >= 0) {
            e.preventDefault()
            if (currentIndex > 0) {
              const prev = items?.[currentIndex - 1]
              if (prev) {
                requestAnimationFrame(() => {
                  prev.focus()
                  prev.scrollIntoView({ behavior: 'smooth', block: 'center' })
                })
              }
            } else {
              setPostSectionIndex(1)
              requestAnimationFrame(() => descriptionSectionRef.current?.focus())
            }
            return
          }
        }
      }

      if (key === 's' || key === 'a') {
        if (inDescriptionSection && hasMediaSection && rootMediaForNav.length > 0) {
          e.preventDefault()
          setPostSectionIndex(0)
          const mediaSection = mediaSectionRef.current
          const items = mediaSection?.querySelectorAll<HTMLElement>('[data-media-item]')
          const first = items?.[0]
          if (first) {
            requestAnimationFrame(() => {
              first.focus()
              first.scrollIntoView({ behavior: 'smooth', block: 'center' })
            })
          }
          return
        }
        if (inMediaSection && rootMediaForNav.length > 0) {
          const mediaSection = mediaSectionRef.current
          const items = mediaSection?.querySelectorAll<HTMLElement>('[data-media-item]')
          let el: HTMLElement | null = target
          let currentIndex = -1
          while (el && el !== mediaSection) {
            const idx = el.getAttribute?.('data-media-item')
            if (idx != null) {
              currentIndex = parseInt(idx, 10)
              break
            }
            el = el.parentElement
          }
          if (currentIndex >= 0 && currentIndex < rootMediaForNav.length - 1) {
            e.preventDefault()
            const next = items?.[currentIndex + 1]
            if (next) {
              requestAnimationFrame(() => {
                next.focus()
                next.scrollIntoView({ behavior: 'smooth', block: 'center' })
              })
            }
            return
          }
        }
      }

      if (postSectionCount <= 1) return
      e.preventDefault()

      const nextComment = key === 'w' || key === 's' || key === 'a'
      if (inCommentsSection && threadRepliesFlat.length > 0 && nextComment) {
        if (key === 'w') {
          if (focusedCommentIndex === 0) {
            setPostSectionIndex(hasMediaSection ? 1 : 0)
          } else {
            setFocusedCommentIndex((i) => Math.max(0, i - 1))
          }
        } else {
          setFocusedCommentIndex((i) => Math.min(threadRepliesFlat.length - 1, i + 1))
        }
        return
      }

      if (key === 'w') {
        setPostSectionIndex((i) => Math.max(0, i - 1))
      } else {
        setPostSectionIndex((i) => Math.min(postSectionCount - 1, i + 1))
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [postSectionCount, postSectionIndex, hasRepliesSection, threadRepliesFlat, focusedCommentIndex, thread, hasMediaSection, handleReplyTo, rootMediaForNav.length])

  useEffect(() => {
    if (postSectionCount <= 1) return
    /* Only scroll when user has moved focus to a different section (e.g. comments). Don't scroll on initial load so the post stays at the top. */
    const onPostSection = postSectionIndex === 0 || (hasMediaSection && postSectionIndex === 1)
    if (onPostSection) return
    let ref: HTMLDivElement | null = null
    if (hasRepliesSection && postSectionIndex === postSectionCount - 1) ref = commentsSectionRef.current
    if (ref) ref.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [postSectionIndex, hasMediaSection, hasRepliesSection, postSectionCount])

  useEffect(() => {
    if (hasMediaSection && postSectionIndex === 0 && rootMediaForNav.length > 0) {
      const mediaSection = mediaSectionRef.current
      const items = mediaSection?.querySelectorAll<HTMLElement>('[data-media-item]')
      const activeElement = document.activeElement as HTMLElement
      const isMediaFocused = mediaSection?.contains(activeElement) && activeElement.hasAttribute?.('data-media-item')
      if (!isMediaFocused && items && items.length > 0) {
        const first = items[0]
        requestAnimationFrame(() => {
          first.focus()
          first.scrollIntoView({ behavior: 'smooth', block: 'center' })
        })
      }
    }
  }, [postSectionIndex, hasMediaSection, rootMediaForNav.length])

  useEffect(() => {
    if (postSectionIndex === postSectionCount - 1 && hasRepliesSection && prevSectionIndexRef.current !== postSectionCount - 1) {
      setFocusedCommentIndex(0)
    }
    prevSectionIndexRef.current = postSectionIndex
  }, [postSectionIndex, postSectionCount, hasRepliesSection])

  useEffect(() => {
    if (threadRepliesFlat.length > 0) {
      setFocusedCommentIndex((i) => Math.min(i, threadRepliesFlat.length - 1))
    }
  }, [threadRepliesFlat.length])

  useEffect(() => {
    const inCommentsSection = hasRepliesSection && postSectionIndex === postSectionCount - 1
    if (!inCommentsSection || postSectionCount <= 1) return
    const flat = threadRepliesFlatRef.current
    if (focusedCommentIndex < 0 || focusedCommentIndex >= flat.length) return
    const uri = flat[focusedCommentIndex]?.uri
    if (!uri || !commentsSectionRef.current) return
    const nodes = commentsSectionRef.current.querySelectorAll('[data-comment-uri]')
    const el = Array.from(nodes).find((n) => n.getAttribute('data-comment-uri') === uri)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [focusedCommentIndex, hasRepliesSection, postSectionIndex, postSectionCount])

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
            <article className={`${styles.postBlock} ${styles.rootPostBlock}`}>
              {rootMedia.length > 0 && (
                <div ref={mediaSectionRef}>
                  <MediaGallery items={rootMedia} autoPlayFirstVideo />
                </div>
              )}
              <div
                ref={descriptionSectionRef}
                className={postSectionIndex === (hasMediaSection ? 1 : 0) ? styles.sectionFocused : undefined}
                tabIndex={-1}
              >
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
              </div>
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
              <div ref={commentsSectionRef} className={styles.replies}>
                {threadReplies.map((r) => {
                  const focusedCommentUri = threadRepliesFlat[focusedCommentIndex]?.uri
                  const flatIndex = threadRepliesFlat.findIndex((f) => f.uri === r.post.uri)
                  const isFocusedCollapsed = hasRepliesSection && postSectionIndex === postSectionCount - 1 && flatIndex >= 0 && flatIndex === focusedCommentIndex
                  if (collapsedThreads.has(r.post.uri)) {
                    const replyCount = 'replies' in r && Array.isArray(r.replies) ? (r.replies as unknown[]).length : 0
                    const label = replyCount === 0 ? 'Comment' : `${replyCount} reply${replyCount !== 1 ? 's' : ''}`
                    const replyHandle = r.post.author?.handle ?? r.post.author?.did ?? ''
                    return (
                      <div
                        key={r.post.uri}
                        data-comment-uri={r.post.uri}
                        className={`${styles.collapsedCommentWrap} ${isFocusedCollapsed ? styles.commentFocused : ''}`}
                        style={{ marginLeft: 0 }}
                      >
                        <button type="button" className={styles.collapsedCommentBtn} onClick={() => toggleCollapse(r.post.uri)}>
                          <span className={styles.collapsedCommentExpandIcon} aria-hidden>+</span>
                          {r.post.author?.avatar ? (
                            <img src={r.post.author.avatar} alt="" className={styles.collapsedCommentAvatar} />
                          ) : (
                            <span className={styles.collapsedCommentAvatarPlaceholder} aria-hidden>{replyHandle.slice(0, 1).toUpperCase()}</span>
                          )}
                          <span className={styles.collapsedCommentHandle}>@{replyHandle}</span>
                          <span className={styles.collapsedCommentLabel}>{label}</span>
                        </button>
                      </div>
                    )
                  }
                  return (
                    <div
                      key={r.post.uri}
                      data-comment-uri={r.post.uri}
                    >
                      <PostBlock
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
                        sessionsList={sessionsList}
                        switchAccount={switchAccount}
                        currentDid={sessionFromContext?.did ?? undefined}
                        focusedCommentUri={focusedCommentUri}
                      />
                    </div>
                  )
                })}
              </div>
            )}
            {(!replyingTo || (thread && isThreadViewPost(thread) && replyingTo.uri === thread.post.uri)) && (
              <div className={styles.inlineReplyFormWrap}>
                <form ref={commentFormRef} onSubmit={handlePostReply} className={styles.commentForm}>
                  {replyAs && (
                    <div className={styles.inlineReplyFormHeader}>
                      {replyingTo && (
                        <button type="button" className={styles.cancelReply} onClick={() => setReplyingTo(null)} aria-label="Cancel reply">
                          ×
                        </button>
                      )}
                      {sessionsList && sessionFromContext?.did ? (
                        <ReplyAsRow replyAs={replyAs} sessionsList={sessionsList} switchAccount={switchAccount} currentDid={sessionFromContext.did} />
                      ) : (
                        <p className={styles.replyAs}>
                          <span className={styles.replyAsLabel}>Replying as</span>
                          <span className={styles.replyAsUserChip}>
                            {replyAs.avatar ? (
                              <img src={replyAs.avatar} alt="" className={styles.replyAsAvatar} />
                            ) : (
                              <span className={styles.replyAsAvatarPlaceholder} aria-hidden>{replyAs.handle.slice(0, 1).toUpperCase()}</span>
                            )}
                            <span className={styles.replyAsHandle}>@{replyAs.handle}</span>
                          </span>
                        </p>
                      )}
                    </div>
                  )}
                  <textarea
                  placeholder={replyingTo ? `Reply to @${replyingTo.handle}…` : 'Write a comment…'}
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
              </div>
            )}
          </>
        )}
      </div>
    </Layout>
  )
}
