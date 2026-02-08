import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import type { AppBskyFeedDefs } from '@atproto/api'
import type { AtpSessionData } from '@atproto/api'
import { agent, publicAgent, postReply, getPostAllMedia, getPostMediaUrl, getSession, createDownvote, deleteDownvote, listMyDownvotes } from '../lib/bsky'
import { useSession } from '../context/SessionContext'
import { getArtboards, createArtboard, addPostToArtboard, isPostInArtboard } from '../lib/artboards'
import { formatRelativeTime, formatRelativeTimeTitle } from '../lib/date'
import Layout from '../components/Layout'
import ProfileLink from '../components/ProfileLink'
import VideoWithHls from '../components/VideoWithHls'
import PostText from '../components/PostText'
import PostActionsMenu from '../components/PostActionsMenu'
import { useProfileModal } from '../context/ProfileModalContext'
import { useHiddenPosts } from '../context/HiddenPostsContext'
import styles from './PostDetailPage.module.css'

export function ReplyAsRow({
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
          <img src={replyAs.avatar} alt="" className={styles.replyAsAvatar} loading="lazy" />
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
                          <img src={profile.avatar} alt="" className={styles.replyAsDropdownAvatar} loading="lazy" />
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
  onFocusItem,
}: {
  items: Array<{ url: string; type: 'image' | 'video'; videoPlaylist?: string; aspectRatio?: number }>
  autoPlayFirstVideo?: boolean
  onFocusItem?: (index: number) => void
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
                onFocus={() => onFocusItem?.(i)}
              >
                <VideoWithHls
                  playlistUrl={m.videoPlaylist}
                  poster={m.url || undefined}
                  className={styles.galleryVideo}
                  autoPlay={i === firstVideoIndex}
                  preload={i === firstVideoIndex ? 'metadata' : 'none'}
                />
              </div>
            )
          }
          const aspect = m.type === 'image' && m.aspectRatio != null ? m.aspectRatio : 1
          return (
            <button
              key={i}
              type="button"
              className={styles.galleryImageBtn}
              style={{ aspectRatio: aspect }}
              onClick={() => setFullscreenIndex(i)}
              onFocus={() => onFocusItem?.(i)}
              aria-label="View full screen"
              data-media-item={i}
            >
              <img src={m.url} alt="" className={styles.galleryMedia} loading="lazy" />
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
  onCommentMediaFocus,
  onLike,
  onDownvote,
  likeOverrides,
  myDownvotes,
  likeLoadingUri,
  downvoteLoadingUri,
  isHidden,
  openActionsMenuCommentUri,
  onActionsMenuOpenChange,
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
  onCommentMediaFocus?: (commentUri: string, mediaIndex: number) => void
  onLike?: (uri: string, cid: string, currentLikeUri: string | null) => Promise<void>
  onDownvote?: (uri: string, cid: string, currentDownvoteUri: string | null) => Promise<void>
  likeOverrides?: Record<string, string | null>
  myDownvotes?: Record<string, string>
  likeLoadingUri?: string | null
  downvoteLoadingUri?: string | null
  isHidden?: (uri: string) => boolean
  /** When set, which comment's actions menu is open (used to show like/downvote counts on that comment) */
  openActionsMenuCommentUri?: string | null
  onActionsMenuOpenChange?: (uri: string, open: boolean) => void
}) {
  if (!isThreadViewPost(node)) return null
  const { post } = node
  if (isHidden?.(post.uri)) return null
  const postViewer = post as { viewer?: { like?: string }; likeCount?: number; downvoteCount?: number }
  const likedUri = likeOverrides?.[post.uri] !== undefined ? likeOverrides[post.uri] : postViewer.viewer?.like
  const downvotedUri = myDownvotes?.[post.uri]
  const baseLikeCount = postViewer.likeCount ?? 0
  const wasLikedByApi = !!postViewer.viewer?.like
  const isLikedNow = !!likedUri
  const likeCountDelta = (isLikedNow ? 1 : 0) - (wasLikedByApi ? 1 : 0)
  const likeCount = Math.max(0, baseLikeCount + likeCountDelta)
  const downvoteCount = postViewer.downvoteCount ?? 0
  const allMedia = getPostAllMedia(post)
  const text = (post.record as { text?: string })?.text ?? ''
  const handle = post.author.handle ?? post.author.did
  const avatar = post.author.avatar ?? undefined
  const createdAt = (post.record as { createdAt?: string })?.createdAt
  const rawReplies = 'replies' in node && Array.isArray(node.replies) ? (node.replies as (typeof node)[]) : []
  const replies = isHidden ? rawReplies.filter((r) => !isThreadViewPost(r) || !isHidden((r as AppBskyFeedDefs.ThreadViewPost).post.uri)) : rawReplies
  const hasReplies = replies.length > 0
  const isCollapsed = hasReplies && collapsedThreads?.has(post.uri)
  const canCollapse = !!onToggleCollapse
  const isReplyTarget = replyingTo?.uri === post.uri
  const isFocused = focusedCommentUri === post.uri
  const likeLoading = likeLoadingUri === post.uri
  const downvoteLoading = downvoteLoadingUri === post.uri
  const showCommentCounts = openActionsMenuCommentUri === post.uri

  return (
    <article className={`${styles.postBlock} ${isFocused ? styles.commentFocused : ''}`} style={{ marginLeft: depth * 2 }} data-comment-uri={post.uri} tabIndex={-1}>
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
        {avatar && <img src={avatar} alt="" className={styles.avatar} loading="lazy" />}
        <div className={styles.authorRow}>
          <ProfileLink handle={handle} className={styles.handleLink}>
            @{handle}
          </ProfileLink>
          {createdAt && (
            <span
              className={styles.postTimestamp}
              title={formatRelativeTimeTitle(createdAt)}
            >
              {formatRelativeTime(createdAt)}
            </span>
          )}
        </div>
      </div>
      {allMedia.length > 0 && <MediaGallery items={allMedia} onFocusItem={(i) => onCommentMediaFocus?.(post.uri, i)} />}
      {text && (
        <p className={styles.postText}>
          <PostText text={text} facets={(post.record as { facets?: unknown[] })?.facets} />
        </p>
      )}
      {(onReply || onLike || onDownvote) && (
        <div className={styles.replyBtnRow}>
          {onReply && (
            <button
              type="button"
              className={styles.replyBtn}
              onClick={() => onReply(post.uri, post.cid, handle)}
            >
              Reply
            </button>
          )}
          {onLike && (
            <button
              type="button"
              className={likedUri ? styles.commentLikeBtnLiked : styles.commentLikeBtn}
              onClick={() => onLike(post.uri, post.cid, likedUri ?? null)}
              disabled={likeLoading}
              title={likedUri ? 'Remove like' : 'Like'}
              aria-label={likedUri ? 'Remove like' : 'Like'}
            >
              ↑{showCommentCounts ? ` ${likeCount}` : ''}
            </button>
          )}
          {onDownvote && (
            <button
              type="button"
              className={downvotedUri ? styles.commentDownvoteBtnActive : styles.commentDownvoteBtn}
              onClick={() => onDownvote(post.uri, post.cid, downvotedUri ?? null)}
              disabled={downvoteLoading}
              title={downvotedUri ? 'Remove downvote' : 'Downvote (syncs across AT Protocol)'}
              aria-label={downvotedUri ? 'Remove downvote' : 'Downvote'}
            >
              ↓{showCommentCounts ? ` ${downvoteCount}` : ''}
            </button>
          )}
          <PostActionsMenu
            postUri={post.uri}
            postCid={post.cid}
            authorDid={post.author.did}
            rootUri={rootPostUri ?? post.uri}
            isOwnPost={currentDid === post.author.did}
            compact
            className={styles.commentActionsMenu}
            open={onActionsMenuOpenChange ? openActionsMenuCommentUri === post.uri : undefined}
            onOpenChange={onActionsMenuOpenChange ? (open) => onActionsMenuOpenChange(post.uri, open) : undefined}
          />
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
                      <img src={replyAs.avatar} alt="" className={styles.replyAsAvatar} loading="lazy" />
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
                if ((e.key === 'Enter' || e.key === 'E') && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault()
                  if ((replyComment ?? '').trim() && !replyPosting) commentFormRef.current?.requestSubmit()
                }
              }}
              className={styles.textarea}
              rows={2}
              maxLength={300}
              autoFocus
            />
            <p className={styles.hint}>⌘ Enter or ⌘ E to post</p>
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
                    <div key={r.post.uri} className={styles.collapsedCommentWrap} style={{ marginLeft: replyDepth * 12 }} data-comment-uri={r.post.uri} tabIndex={-1}>
                      <button type="button" className={styles.collapsedCommentBtn} onClick={() => onToggleCollapse?.(r.post.uri)}>
                        <span className={styles.collapsedCommentExpandIcon} aria-hidden>+</span>
                        {r.post.author?.avatar ? (
                          <img src={r.post.author.avatar} alt="" className={styles.collapsedCommentAvatar} loading="lazy" />
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
                    onCommentMediaFocus={onCommentMediaFocus}
                    onLike={onLike}
                    onDownvote={onDownvote}
                    likeOverrides={likeOverrides}
                    myDownvotes={myDownvotes}
                    likeLoadingUri={likeLoadingUri}
                    downvoteLoadingUri={downvoteLoadingUri}
                    isHidden={isHidden}
                    openActionsMenuCommentUri={openActionsMenuCommentUri}
                    onActionsMenuOpenChange={onActionsMenuOpenChange}
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

const MOBILE_BREAKPOINT = 768
function getMobileSnapshot() {
  return typeof window !== 'undefined' ? window.innerWidth < MOBILE_BREAKPOINT : false
}
function subscribeMobile(cb: () => void) {
  if (typeof window === 'undefined') return () => {}
  const mq = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
  mq.addEventListener('change', cb)
  return () => mq.removeEventListener('change', cb)
}

/* Swipe thresholds: require clearly horizontal gesture to avoid accidental triggers when scrolling */
const SWIPE_COMMIT_PX = 28
const SWIPE_HORIZONTAL_RATIO = 2
const SWIPE_TRIGGER_PX = 80
const SWIPE_DRAG_CAP_PX = 140

export interface PostDetailContentProps {
  /** Decoded post URI */
  uri: string
  /** When true, open the reply form focused on load */
  initialOpenReply?: boolean
  /** When provided, render in modal mode (no Layout). Call when uri is empty to close. */
  onClose?: () => void
}

export function PostDetailContent({ uri: uriProp, initialOpenReply, onClose }: PostDetailContentProps) {
  const navigate = useNavigate()
  const { openProfileModal } = useProfileModal()
  const { isHidden } = useHiddenPosts()
  const isMobile = useSyncExternalStore(subscribeMobile, getMobileSnapshot, () => false)
  const decodedUri = uriProp
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
  const [commentLikeOverrides, setCommentLikeOverrides] = useState<Record<string, string | null>>({})
  const [myDownvotes, setMyDownvotes] = useState<Record<string, string>>({})
  const [commentLikeLoadingUri, setCommentLikeLoadingUri] = useState<string | null>(null)
  const [commentDownvoteLoadingUri, setCommentDownvoteLoadingUri] = useState<string | null>(null)
  const [openActionsMenuCommentUri, setOpenActionsMenuCommentUri] = useState<string | null>(null)
  const [newBoardName, setNewBoardName] = useState('')
  const [showBoardDropdown, setShowBoardDropdown] = useState(false)
  const [postSectionIndex, setPostSectionIndex] = useState(0)
  const commentFormRef = useRef<HTMLFormElement>(null)
  const commentFormWrapRef = useRef<HTMLDivElement>(null)
  const mediaSectionRef = useRef<HTMLDivElement>(null)
  const descriptionSectionRef = useRef<HTMLDivElement>(null)
  const commentsSectionRef = useRef<HTMLDivElement>(null)
  const [focusedCommentIndex, setFocusedCommentIndex] = useState(0)
  const [commentFormFocused, setCommentFormFocused] = useState(false)
  const [keyboardFocusIndex, setKeyboardFocusIndex] = useState(0)
  const keyboardFocusIndexRef = useRef(0)
  const prevSectionIndexRef = useRef(0)
  const touchStartXRef = useRef(0)
  const touchStartYRef = useRef(0)
  const horizontalSwipeRef = useRef(false)
  const [swipeTranslateX, setSwipeTranslateX] = useState(0)
  const [swipeReturning, setSwipeReturning] = useState(false)
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
      const [threadRes, downvotes] = await Promise.all([
        api.app.bsky.feed.getPostThread({ uri: decodedUri, depth: 10 }),
        getSession() ? listMyDownvotes().catch(() => ({})) : Promise.resolve({}),
      ])
      setThread(threadRes.data.thread)
      setMyDownvotes(downvotes)
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
    if (!thread || !isThreadViewPost(thread) || !initialOpenReply) return
    const handle = thread.post.author?.handle ?? thread.post.author?.did ?? ''
    setReplyingTo({ uri: thread.post.uri, cid: thread.post.cid, handle })
    requestAnimationFrame(() => {
      const form = document.querySelector(`.${styles.commentForm} textarea`) as HTMLTextAreaElement | null
      form?.focus()
    })
  }, [thread, initialOpenReply])

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

  async function handleCommentLike(uri: string, cid: string, currentLikeUri: string | null) {
    setCommentLikeLoadingUri(uri)
    try {
      if (currentLikeUri) {
        await agent.deleteLike(currentLikeUri)
        setCommentLikeOverrides((m) => ({ ...m, [uri]: null }))
      } else {
        const res = await agent.like(uri, cid)
        setCommentLikeOverrides((m) => ({ ...m, [uri]: res.uri }))
      }
    } catch {
      // leave state unchanged
    } finally {
      setCommentLikeLoadingUri(null)
    }
  }

  async function handleCommentDownvote(uri: string, cid: string, currentDownvoteUri: string | null) {
    setCommentDownvoteLoadingUri(uri)
    try {
      if (currentDownvoteUri) {
        await deleteDownvote(currentDownvoteUri)
        setMyDownvotes((m) => {
          const next = { ...m }
          delete next[uri]
          return next
        })
      } else {
        const recordUri = await createDownvote(uri, cid)
        setMyDownvotes((m) => ({ ...m, [uri]: recordUri }))
      }
    } catch {
      // leave state unchanged
    } finally {
      setCommentDownvoteLoadingUri(null)
    }
  }

  function handleAddToArtboard() {
    if (!thread || !isThreadViewPost(thread)) return
    const hasSelection = addToBoardIds.size > 0 || newBoardName.trim().length > 0
    if (!hasSelection) return
    const post = thread.post
    const media = getPostMediaUrl(post)
    const allMedia = getPostAllMedia(post)
    const thumbs = allMedia.length > 0 ? allMedia.map((m) => m.url) : undefined
    const payload = {
      uri: post.uri,
      cid: post.cid,
      authorHandle: post.author.handle,
      text: (post.record as { text?: string })?.text?.slice(0, 200),
      thumb: media?.url ?? thumbs?.[0],
      thumbs,
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
  const threadRepliesVisible = useMemo(
    () => threadReplies.filter((r) => !isHidden(r.post.uri)),
    [threadReplies, isHidden]
  )
  const threadRepliesFlat = useMemo(
    () => flattenVisibleReplies(threadRepliesVisible, collapsedThreads),
    [threadRepliesVisible, collapsedThreads]
  )
  const threadRepliesFlatRef = useRef(threadRepliesFlat)
  threadRepliesFlatRef.current = threadRepliesFlat
  keyboardFocusIndexRef.current = keyboardFocusIndex

  type FocusItem = { type: 'rootMedia'; index: number } | { type: 'description' } | { type: 'commentMedia'; commentUri: string; mediaIndex: number } | { type: 'comment'; commentUri: string } | { type: 'replyForm' }
  const focusItems = useMemo((): FocusItem[] => {
    const items: FocusItem[] = []
    for (let i = 0; i < rootMediaForNav.length; i++) items.push({ type: 'rootMedia', index: i })
    items.push({ type: 'description' })
    for (const flat of threadRepliesFlat) {
      const node = findReplyByUri(threadRepliesVisible, flat.uri)
      const media = node ? getPostAllMedia(node.post) : []
      for (let i = 0; i < media.length; i++) items.push({ type: 'commentMedia', commentUri: flat.uri, mediaIndex: i })
      items.push({ type: 'comment', commentUri: flat.uri })
    }
    items.push({ type: 'replyForm' })
    return items
  }, [rootMediaForNav.length, threadRepliesFlat, threadRepliesVisible])

  const navTotalItems = focusItems.length
  const handleCommentMediaFocus = useCallback((commentUri: string, mediaIndex: number) => {
    const idx = focusItems.findIndex((it) => it.type === 'commentMedia' && it.commentUri === commentUri && it.mediaIndex === mediaIndex)
    if (idx >= 0) {
      setKeyboardFocusIndex(idx)
      const commentIdx = threadRepliesFlat.findIndex((f) => f.uri === commentUri)
      if (commentIdx >= 0) setFocusedCommentIndex(commentIdx)
    }
  }, [focusItems, threadRepliesFlat])
  const postUri = thread && isThreadViewPost(thread) ? thread.post.uri : null
  useEffect(() => {
    if (postUri) setKeyboardFocusIndex(0)
  }, [postUri])
  useEffect(() => {
    if (navTotalItems <= 0) return
    setKeyboardFocusIndex((i) => Math.min(Math.max(0, i), navTotalItems - 1))
  }, [navTotalItems])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable) {
        if (e.key === 'Escape') {
          e.preventDefault()
          target.blur()
        }
        return
      }
      if (e.ctrlKey || e.metaKey) return
      const key = e.key.toLowerCase()
      if (key === 'f') {
        if (thread && isThreadViewPost(thread)) {
          e.preventDefault()
          handleLike()
        }
        return
      }
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

      const inCommentsSection = hasRepliesSection && (postSectionIndex === postSectionCount - 1 || (commentsSectionRef.current?.contains(target) ?? false))
      const inDescriptionSection = descriptionSectionRef.current?.contains(target) ?? false
      const inMediaSection = mediaSectionRef.current?.contains(target) ?? false
      const inCommentFormWrap = commentFormWrapRef.current?.contains(target) ?? false

      if (key === 'e' || key === 'enter') {
        e.preventDefault()
        if ((commentFormFocused || inCommentFormWrap) && commentFormRef.current) {
          const ta = commentFormRef.current.querySelector('textarea')
          if (ta) {
            (ta as HTMLTextAreaElement).focus()
            setCommentFormFocused(true)
          }
          return
        }
        if (inCommentsSection && threadRepliesFlat.length > 0 && focusedCommentIndex >= 0 && focusedCommentIndex < threadRepliesFlat.length) {
          const focused = threadRepliesFlat[focusedCommentIndex]
          if (focused?.handle) openProfileModal(focused.handle)
          return
        }
        if ((inDescriptionSection || inMediaSection) && thread && isThreadViewPost(thread)) {
          const authorHandle = thread.post.author?.handle ?? thread.post.author?.did ?? ''
          if (authorHandle) openProfileModal(authorHandle)
          return
        }
        return
      }

      if (key !== 'w' && key !== 'a' && key !== 's') return
      if (!thread || !isThreadViewPost(thread)) return

      const totalItems = focusItems.length
      if (totalItems <= 0) return

      const focusItemAtIndex = (idx: number) => {
        const item = focusItems[idx]
        if (!item) return
        setCommentFormFocused(item.type === 'replyForm')
        if (item.type === 'rootMedia') {
          setPostSectionIndex(0)
          setFocusedCommentIndex(0)
          const items = mediaSectionRef.current?.querySelectorAll<HTMLElement>('[data-media-item]')
          const el = items?.[item.index]
          if (el) {
            requestAnimationFrame(() => {
              el.focus()
              el.scrollIntoView({ behavior: 'smooth', block: 'start' })
            })
          }
        } else if (item.type === 'description') {
          setPostSectionIndex(hasMediaSection ? 1 : 0)
          setFocusedCommentIndex(0)
          requestAnimationFrame(() => {
            descriptionSectionRef.current?.focus()
            descriptionSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
          })
        } else if (item.type === 'commentMedia') {
          setPostSectionIndex(postSectionCount - 1)
          const commentIdx = threadRepliesFlat.findIndex((f) => f.uri === item.commentUri)
          setFocusedCommentIndex(commentIdx >= 0 ? commentIdx : 0)
          requestAnimationFrame(() => {
            const commentsSection = commentsSectionRef.current
            if (!commentsSection) return
            const commentEl = Array.from(commentsSection.querySelectorAll<HTMLElement>('[data-comment-uri]')).find((n) => n.getAttribute('data-comment-uri') === item.commentUri)
            const mediaEl = commentEl?.querySelectorAll<HTMLElement>('[data-media-item]')?.[item.mediaIndex]
            if (mediaEl) {
              mediaEl.focus()
              mediaEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
            }
          })
        } else if (item.type === 'comment') {
          setPostSectionIndex(postSectionCount - 1)
          const commentIdx = threadRepliesFlat.findIndex((f) => f.uri === item.commentUri)
          setFocusedCommentIndex(commentIdx >= 0 ? commentIdx : 0)
          requestAnimationFrame(() => {
            const commentsSection = commentsSectionRef.current
            if (!commentsSection) return
            const el = Array.from(commentsSection.querySelectorAll<HTMLElement>('[data-comment-uri]')).find((n) => n.getAttribute('data-comment-uri') === item.commentUri)
            if (el) {
              el.focus()
              el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
            }
          })
        } else {
          setPostSectionIndex(postSectionCount - 1)
          setFocusedCommentIndex(threadRepliesFlat.length - 1)
          requestAnimationFrame(() => {
            commentFormWrapRef.current?.focus()
            commentFormWrapRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
          })
        }
      }

      const current = keyboardFocusIndexRef.current
      const next = key === 'w' ? Math.max(0, current - 1) : Math.min(totalItems - 1, current + 1)
      if (next !== current) {
        e.preventDefault()
        setKeyboardFocusIndex(next)
        focusItemAtIndex(next)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [postSectionCount, postSectionIndex, hasRepliesSection, threadRepliesFlat, focusedCommentIndex, commentFormFocused, thread, hasMediaSection, handleReplyTo, rootMediaForNav.length, openProfileModal, focusItems, handleLike])

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
    /* Only scroll when focus is actually in the comments section (avoids scrolling to comment after W to description) */
    if (!commentsSectionRef.current?.contains(document.activeElement)) return
    const flat = threadRepliesFlatRef.current
    if (focusedCommentIndex < 0 || focusedCommentIndex >= flat.length) return
    const uri = flat[focusedCommentIndex]?.uri
    if (!uri || !commentsSectionRef.current) return
    const nodes = commentsSectionRef.current.querySelectorAll('[data-comment-uri]')
    const el = Array.from(nodes).find((n) => n.getAttribute('data-comment-uri') === uri)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [focusedCommentIndex, hasRepliesSection, postSectionIndex, postSectionCount])

  if (!decodedUri) {
    if (onClose) onClose()
    return null
  }

  const rootMedia =
    thread && isThreadViewPost(thread) ? getPostAllMedia(thread.post) : []

  const authorHandle =
    thread && isThreadViewPost(thread) ? (thread.post.author.handle ?? thread.post.author.did) : null

  const swipeEnabled = onClose && isMobile

  function onSwipeTouchStart(e: React.TouchEvent) {
    if (!swipeEnabled || e.touches.length !== 1) return
    touchStartXRef.current = e.touches[0].clientX
    touchStartYRef.current = e.touches[0].clientY
    horizontalSwipeRef.current = false
  }

  function onSwipeTouchMove(e: React.TouchEvent) {
    if (!swipeEnabled || e.touches.length !== 1) return
    const dx = e.touches[0].clientX - touchStartXRef.current
    const dy = e.touches[0].clientY - touchStartYRef.current
    if (!horizontalSwipeRef.current) {
      if (Math.abs(dx) > SWIPE_COMMIT_PX && Math.abs(dx) > Math.abs(dy) * SWIPE_HORIZONTAL_RATIO) {
        horizontalSwipeRef.current = true
      } else {
        return
      }
    }
    e.preventDefault()
    const capped = Math.max(-SWIPE_DRAG_CAP_PX, Math.min(SWIPE_DRAG_CAP_PX, dx))
    setSwipeTranslateX(capped)
  }

  function onSwipeTouchEnd(e: React.TouchEvent) {
    if (!swipeEnabled || e.changedTouches.length !== 1) {
      setSwipeTranslateX(0)
      setSwipeReturning(false)
      return
    }
    const dx = e.changedTouches[0].clientX - touchStartXRef.current
    const triggered =
      horizontalSwipeRef.current && Math.abs(dx) > SWIPE_TRIGGER_PX &&
      (dx > 0 ? true : dx < 0 && !!authorHandle)
    if (triggered) {
      if (dx > 0) onClose?.()
      else if (authorHandle) openProfileModal(authorHandle)
    } else {
      setSwipeReturning(true)
      setTimeout(() => setSwipeReturning(false), 220)
    }
    horizontalSwipeRef.current = false
    setSwipeTranslateX(0)
  }

  const content = (
      <div
        className={`${styles.wrap}${onClose ? ` ${styles.wrapInModal}` : ''}${swipeReturning ? ` ${styles.wrapSwipeReturning}` : ''}`}
        style={swipeTranslateX !== 0 ? { transform: `translateX(${swipeTranslateX}px)` } : undefined}
        onTouchStart={swipeEnabled ? onSwipeTouchStart : undefined}
        onTouchMove={swipeEnabled ? onSwipeTouchMove : undefined}
        onTouchEnd={swipeEnabled ? onSwipeTouchEnd : undefined}
      >
        {loading && <div className={styles.loading}>Loading…</div>}
        {error && <p className={styles.error}>{error}</p>}
        {thread && isThreadViewPost(thread) && (
          <>
            <article className={`${styles.postBlock} ${styles.rootPostBlock}`}>
              {rootMedia.length > 0 && (
                <div ref={mediaSectionRef}>
                  <MediaGallery
                    items={rootMedia}
                    autoPlayFirstVideo
                    onFocusItem={(i) => setKeyboardFocusIndex(i)}
                  />
                </div>
              )}
              <div
                ref={descriptionSectionRef}
                className={styles.rootPostDescription}
                tabIndex={-1}
                onFocus={() => setKeyboardFocusIndex(rootMediaForNav.length)}
              >
                <div className={styles.postHead}>
                  {thread.post.author.avatar && (
                    <img src={thread.post.author.avatar} alt="" className={styles.avatar} loading="lazy" />
                  )}
                  <div className={styles.authorRow}>
                    <ProfileLink
                      handle={thread.post.author.handle ?? thread.post.author.did}
                      className={styles.handleLink}
                    >
                      @{thread.post.author.handle ?? thread.post.author.did}
                    </ProfileLink>
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
                        title={formatRelativeTimeTitle((thread.post.record as { createdAt: string }).createdAt)}
                      >
                        {formatRelativeTime((thread.post.record as { createdAt: string }).createdAt)}
                      </span>
                    )}
                  </div>
                </div>
                {(thread.post.record as { text?: string })?.text && (
                  <p className={styles.postText}>
                    <PostText text={(thread.post.record as { text?: string }).text!} facets={(thread.post.record as { facets?: unknown[] })?.facets} />
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
                    Collect {showBoardDropdown ? '▾' : '▸'}
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
                  title={isLiked ? 'Remove like' : 'Like'}
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
                {thread && isThreadViewPost(thread) && (
                  <PostActionsMenu
                    postUri={thread.post.uri}
                    postCid={thread.post.cid}
                    authorDid={thread.post.author.did}
                    rootUri={thread.post.uri}
                    isOwnPost={session?.did === thread.post.author.did}
                    onHidden={() => navigate('/feed')}
                  />
                )}
              </div>
              {addedToBoard && (
                <p className={styles.added}>
                  Added to {boards.find((b) => b.id === addedToBoard)?.name}
                </p>
              )}
            </section>
            {'replies' in thread && Array.isArray(thread.replies) && thread.replies.length > 0 && (
              <div
                ref={commentsSectionRef}
                className={styles.replies}
                onFocusCapture={(e) => {
                  const target = e.target as HTMLElement
                  const commentEl = target.closest?.('[data-comment-uri]') as HTMLElement | null
                  if (!commentEl) return
                  const uri = commentEl.getAttribute('data-comment-uri')
                  if (!uri) return
                  const mediaEl = target.closest?.('[data-media-item]') as HTMLElement | null
                  if (mediaEl) {
                    const mi = mediaEl.getAttribute('data-media-item')
                    if (mi != null) {
                      const idx = focusItems.findIndex((it) => it.type === 'commentMedia' && it.commentUri === uri && it.mediaIndex === parseInt(mi, 10))
                      if (idx >= 0) setKeyboardFocusIndex(idx)
                    }
                    return
                  }
                  const idx = focusItems.findIndex((it) => it.type === 'comment' && it.commentUri === uri)
                  if (idx >= 0) {
                    setKeyboardFocusIndex(idx)
                    const commentIdx = threadRepliesFlat.findIndex((f) => f.uri === uri)
                    if (commentIdx >= 0) setFocusedCommentIndex(commentIdx)
                  }
                }}
              >
                {threadRepliesVisible.map((r) => {
                  const currentItem = focusItems[keyboardFocusIndex]
                  const focusedCommentUri = (currentItem?.type === 'comment' || currentItem?.type === 'commentMedia') ? currentItem.commentUri : undefined
                  const commentContentFocusIndex = focusItems.findIndex((it) => it.type === 'comment' && it.commentUri === r.post.uri)
                  const isFocusedCollapsed = hasRepliesSection && currentItem?.type === 'comment' && currentItem.commentUri === r.post.uri
                  if (collapsedThreads.has(r.post.uri)) {
                    const replyCount = 'replies' in r && Array.isArray(r.replies) ? (r.replies as unknown[]).length : 0
                    const label = replyCount === 0 ? 'Comment' : `${replyCount} reply${replyCount !== 1 ? 's' : ''}`
                    const replyHandle = r.post.author?.handle ?? r.post.author?.did ?? ''
                    return (
                      <div
                        key={r.post.uri}
                        data-comment-uri={r.post.uri}
                        tabIndex={-1}
                        className={`${styles.collapsedCommentWrap} ${isFocusedCollapsed ? styles.commentFocused : ''}`}
                        style={{ marginLeft: 0 }}
                        onFocus={() => commentContentFocusIndex >= 0 && setKeyboardFocusIndex(commentContentFocusIndex)}
                      >
                        <button type="button" className={styles.collapsedCommentBtn} onClick={() => toggleCollapse(r.post.uri)}>
                          <span className={styles.collapsedCommentExpandIcon} aria-hidden>+</span>
                          {r.post.author?.avatar ? (
                            <img src={r.post.author.avatar} alt="" className={styles.collapsedCommentAvatar} loading="lazy" />
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
                    <div key={r.post.uri}>
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
                        onCommentMediaFocus={handleCommentMediaFocus}
                        onLike={sessionFromContext ? handleCommentLike : undefined}
                        onDownvote={sessionFromContext ? handleCommentDownvote : undefined}
                        likeOverrides={commentLikeOverrides}
                        myDownvotes={myDownvotes}
                        likeLoadingUri={commentLikeLoadingUri}
                        downvoteLoadingUri={commentDownvoteLoadingUri}
                        openActionsMenuCommentUri={openActionsMenuCommentUri}
                        onActionsMenuOpenChange={(uri, open) => setOpenActionsMenuCommentUri(open ? uri : null)}
                      />
                    </div>
                  )
                })}
              </div>
            )}
            {(!replyingTo || (thread && isThreadViewPost(thread) && replyingTo.uri === thread.post.uri)) && (
              <div className={styles.inlineReplyFormWrap}>
                <div
                  ref={commentFormWrapRef}
                  tabIndex={-1}
                  className={commentFormFocused ? styles.commentFormWrapFocused : undefined}
                  onFocus={() => setKeyboardFocusIndex(focusItems.length - 1)}
                  onBlur={() => {
                    requestAnimationFrame(() => {
                      if (!commentFormRef.current?.contains(document.activeElement)) setCommentFormFocused(false)
                    })
                  }}
                >
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
                              <img src={replyAs.avatar} alt="" className={styles.replyAsAvatar} loading="lazy" />
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
                    if ((e.key === 'Enter' || e.key === 'E') && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault()
                      if (comment.trim() && !posting) commentFormRef.current?.requestSubmit()
                    }
                  }}
                  className={styles.textarea}
                  rows={3}
                  maxLength={300}
                />
                <p className={styles.hint}>⌘ Enter or ⌘ E to post</p>
                <button type="submit" className={styles.submit} disabled={posting || !comment.trim()}>
                  {posting ? 'Posting…' : 'Post comment'}
                </button>
              </form>
                </div>
              </div>
            )}
          </>
        )}
      </div>
  )

  return onClose ? content : <Layout title="Post" showNav>{content}</Layout>
}

export default function PostDetailPage() {
  const { uri } = useParams<{ uri: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const decodedUri = uri ? decodeURIComponent(uri) : ''
  if (!decodedUri) {
    navigate('/feed', { replace: true })
    return null
  }
  return (
    <Layout title="Post" showNav>
      <PostDetailContent
        uri={decodedUri}
        initialOpenReply={(location.state as { openReply?: boolean })?.openReply}
      />
    </Layout>
  )
}
