import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import type { AppBskyFeedDefs } from '@atproto/api'
import type { AtpSessionData } from '@atproto/api'
import { agent, publicAgent, postReply, getPostAllMedia, getPostMediaUrl, getQuotedPostView, getSession, createQuotePost, createDownvote, deleteDownvote, listMyDownvotes } from '../lib/bsky'
import { downloadImageWithHandle, downloadVideoWithPostUri } from '../lib/downloadImage'
import { useSession } from '../context/SessionContext'
import { getArtboards, createArtboard, addPostToArtboard, isPostInArtboard } from '../lib/artboards'
import { formatRelativeTime, formatExactDateTime } from '../lib/date'
import Layout from '../components/Layout'
import ProfileLink from '../components/ProfileLink'
import VideoWithHls from '../components/VideoWithHls'
import PostText from '../components/PostText'
import PostActionsMenu from '../components/PostActionsMenu'
import { useProfileModal } from '../context/ProfileModalContext'
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
  if (items.length === 0) return null
  const firstVideoIndex = autoPlayFirstVideo
    ? items.findIndex((m) => m.type === 'video' && m.videoPlaylist)
    : -1

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
            <div
              key={i}
              className={styles.galleryImageBtn}
              style={{ aspectRatio: aspect }}
              data-media-item={i}
              tabIndex={0}
              onFocus={() => onFocusItem?.(i)}
            >
              <img src={m.url} alt="" className={styles.galleryMedia} loading="lazy" />
            </div>
          )
        })}
      </div>
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
  /** When set, which comment's actions menu is open (used to show like/downvote counts on that comment) */
  openActionsMenuCommentUri?: string | null
  onActionsMenuOpenChange?: (uri: string, open: boolean) => void
}) {
  if (!isThreadViewPost(node)) return null
  const { post } = node
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
  const replies = rawReplies
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
              title={formatExactDateTime(createdAt)}
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
            verticalIcon
            className={styles.commentActionsMenu}
            open={onActionsMenuOpenChange ? openActionsMenuCommentUri === post.uri : undefined}
            onOpenChange={onActionsMenuOpenChange ? (open) => onActionsMenuOpenChange(post.uri, open) : undefined}
            postedAt={(post.record as { createdAt?: string })?.createdAt}
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

export interface PostDetailContentProps {
  /** Decoded post URI */
  uri: string
  /** When true, open the reply form focused on load */
  initialOpenReply?: boolean
  /** When set, scroll to and focus this reply/comment in the thread (e.g. from notification) */
  initialFocusedCommentUri?: string
  /** When provided, render in modal mode (no Layout). Call when uri is empty to close. */
  onClose?: () => void
  /** Called when thread loads with the root post author handle (e.g. for swipe-left-to-open-profile). */
  onAuthorHandle?: (handle: string) => void
}

export function PostDetailContent({ uri: uriProp, initialOpenReply, initialFocusedCommentUri, onClose, onAuthorHandle }: PostDetailContentProps) {
  const navigate = useNavigate()
  const { openProfileModal } = useProfileModal()
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
  const [openActionsMenuUri, setOpenActionsMenuUri] = useState<string | null>(null)
  const [newBoardName, setNewBoardName] = useState('')
  const [showBoardDropdown, setShowBoardDropdown] = useState(false)
  const [downloadLoading, setDownloadLoading] = useState(false)
  const [showRepostDropdown, setShowRepostDropdown] = useState(false)
  const [showQuoteComposer, setShowQuoteComposer] = useState(false)
  const [quoteText, setQuoteText] = useState('')
  const [quoteImages, setQuoteImages] = useState<File[]>([])
  const [quoteImageAlts, setQuoteImageAlts] = useState<string[]>([])
  const [quotePosting, setQuotePosting] = useState(false)
  const [quoteError, setQuoteError] = useState<string | null>(null)
  const quoteFileInputRef = useRef<HTMLInputElement>(null)
  const repostDropdownRef = useRef<HTMLDivElement>(null)
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
  const scrollIntoViewFromKeyboardRef = useRef(false)
  const appliedInitialFocusUriRef = useRef<string | null>(null)
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

  async function handleDownload() {
    if (!thread || !isThreadViewPost(thread) || downloadLoading) return
    const mediaList = getPostAllMedia(thread.post)
    if (mediaList.length === 0) return
    const first = mediaList[0]
    const handle = thread.post.author.handle ?? thread.post.author.did
    const postUri = thread.post.uri
    if (first.type === 'video' && first.videoPlaylist) {
      setDownloadLoading(true)
      try {
        await downloadVideoWithPostUri(first.videoPlaylist, postUri)
      } finally {
        setDownloadLoading(false)
      }
      return
    }
    setDownloadLoading(true)
    try {
      await downloadImageWithHandle(first.url, handle, postUri)
    } finally {
      setDownloadLoading(false)
    }
  }

  const QUOTE_MAX_LENGTH = 300
  const QUOTE_IMAGE_MAX = 4
  const QUOTE_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']

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

  function addQuoteImages(files: FileList | File[]) {
    const list = Array.from(files).filter((f) => QUOTE_IMAGE_TYPES.includes(f.type))
    const take = Math.min(list.length, QUOTE_IMAGE_MAX - quoteImages.length)
    if (take <= 0) return
    setQuoteImages((prev) => [...prev, ...list.slice(0, take)])
    setQuoteImageAlts((prev) => [...prev, ...list.slice(0, take).map(() => '')])
  }

  function removeQuoteImage(index: number) {
    setQuoteImages((prev) => prev.filter((_, i) => i !== index))
    setQuoteImageAlts((prev) => prev.filter((_, i) => i !== index))
  }

  function openQuoteComposer() {
    setShowRepostDropdown(false)
    setShowQuoteComposer(true)
    setQuoteText('')
    setQuoteImages([])
    setQuoteImageAlts([])
    setQuoteError(null)
  }

  function closeQuoteComposer() {
    setShowQuoteComposer(false)
    setQuoteError(null)
  }

  async function handleQuoteSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!thread || !isThreadViewPost(thread) || quotePosting || !session?.did) return
    const canSubmit = quoteText.trim() || quoteImages.length > 0
    if (!canSubmit) return
    setQuoteError(null)
    setQuotePosting(true)
    try {
      await createQuotePost(
        thread.post.uri,
        thread.post.cid,
        quoteText,
        quoteImages.length > 0 ? quoteImages : undefined,
        quoteImageAlts.length > 0 ? quoteImageAlts : undefined,
      )
      closeQuoteComposer()
      navigate('/feed')
    } catch (err: unknown) {
      setQuoteError(err instanceof Error ? err.message : 'Failed to post quote')
    } finally {
      setQuotePosting(false)
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

  const quotePreviewUrls = useMemo(
    () => quoteImages.map((f) => URL.createObjectURL(f)),
    [quoteImages],
  )
  useEffect(() => {
    return () => quotePreviewUrls.forEach((u) => URL.revokeObjectURL(u))
  }, [quotePreviewUrls])

  useEffect(() => {
    if (!showRepostDropdown) return
    function onDocClick(e: MouseEvent) {
      const target = e.target as Node
      if (repostDropdownRef.current?.contains(target)) return
      setShowRepostDropdown(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [showRepostDropdown])

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
  const threadRepliesVisible = threadReplies
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
    if (thread && isThreadViewPost(thread) && onAuthorHandle) {
      const handle = thread.post.author?.handle ?? thread.post.author?.did ?? ''
      if (handle) onAuthorHandle(handle)
    }
  }, [thread, onAuthorHandle])
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

      if (key === 'm' || key === '`') {
        const focusInActionsMenu = (document.activeElement as HTMLElement)?.closest?.('[role="menu"]')
        if (focusInActionsMenu && openActionsMenuUri != null) {
          e.preventDefault()
          setOpenActionsMenuUri(null)
          return
        }
        if (thread && isThreadViewPost(thread) && focusItems.length > 0) {
          const i = keyboardFocusIndexRef.current
          const item = focusItems[i]
          if (item) {
            let uri: string | null = null
            if (item.type === 'description' || item.type === 'rootMedia') {
              uri = thread.post.uri
            } else if (item.type === 'comment' || item.type === 'commentMedia') {
              uri = item.commentUri
            }
            if (uri != null) {
              e.preventDefault()
              if (openActionsMenuUri === uri) {
                setOpenActionsMenuUri(null)
              } else {
                setOpenActionsMenuUri(uri)
              }
            }
          }
        }
        return
      }

      if (key !== 'w' && key !== 'a' && key !== 's') return
      if (!thread || !isThreadViewPost(thread)) return

      const totalItems = focusItems.length
      if (totalItems <= 0) return

      const focusItemAtIndex = (idx: number, prevIndex?: number) => {
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
          const mediaCount = focusItems.filter((it) => it.type === 'commentMedia' && it.commentUri === item.commentUri).length
          const prevItem = prevIndex !== undefined ? focusItems[prevIndex] : undefined
          const cameFromSameCommentLastMedia =
            prevItem?.type === 'commentMedia' &&
            prevItem.commentUri === item.commentUri &&
            mediaCount > 0 &&
            prevItem.mediaIndex === mediaCount - 1
          if (cameFromSameCommentLastMedia && idx + 1 < focusItems.length) {
            setKeyboardFocusIndex(idx + 1)
            focusItemAtIndex(idx + 1, idx)
            return
          }
          setPostSectionIndex(postSectionCount - 1)
          const commentIdx = threadRepliesFlat.findIndex((f) => f.uri === item.commentUri)
          setFocusedCommentIndex(commentIdx >= 0 ? commentIdx : 0)
          const focusMediaInstead = mediaCount > 0 && prevIndex !== undefined
          const mediaIndexToFocus = focusMediaInstead ? (idx < prevIndex ? mediaCount - 1 : 0) : -1
          if (mediaIndexToFocus >= 0) {
            const commentMediaIdx = focusItems.findIndex(
              (it) => it.type === 'commentMedia' && it.commentUri === item.commentUri && it.mediaIndex === mediaIndexToFocus
            )
            if (commentMediaIdx >= 0) setKeyboardFocusIndex(commentMediaIdx)
          }
          requestAnimationFrame(() => {
            const commentsSection = commentsSectionRef.current
            if (!commentsSection) return
            const commentEl = Array.from(commentsSection.querySelectorAll<HTMLElement>('[data-comment-uri]')).find((n) => n.getAttribute('data-comment-uri') === item.commentUri)
            if (!commentEl) return
            if (mediaIndexToFocus >= 0) {
              const mediaEl = commentEl.querySelectorAll<HTMLElement>('[data-media-item]')?.[mediaIndexToFocus]
              if (mediaEl) {
                mediaEl.focus()
                mediaEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
              }
            } else {
              commentEl.focus()
              commentEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
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
        scrollIntoViewFromKeyboardRef.current = true
        setKeyboardFocusIndex(next)
        focusItemAtIndex(next, current)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [postSectionCount, postSectionIndex, hasRepliesSection, threadRepliesFlat, focusedCommentIndex, commentFormFocused, thread, hasMediaSection, handleReplyTo, rootMediaForNav.length, openProfileModal, focusItems, handleLike, openActionsMenuUri])

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

  /* When opened with initialFocusedCommentUri (e.g. from notification), scroll to that reply */
  useEffect(() => {
    if (!initialFocusedCommentUri || !thread || !isThreadViewPost(thread) || threadRepliesFlat.length === 0) return
    if (appliedInitialFocusUriRef.current === initialFocusedCommentUri) return
    appliedInitialFocusUriRef.current = initialFocusedCommentUri
    const commentIdx = threadRepliesFlat.findIndex((f) => f.uri === initialFocusedCommentUri)
    if (commentIdx < 0) return
    setFocusedCommentIndex(commentIdx)
    const focusIdx = focusItems.findIndex((it) => (it.type === 'comment' || it.type === 'commentMedia') && it.commentUri === initialFocusedCommentUri)
    if (focusIdx >= 0) setKeyboardFocusIndex(focusIdx)
    requestAnimationFrame(() => {
      const commentsSection = commentsSectionRef.current
      if (!commentsSection) return
      const el = Array.from(commentsSection.querySelectorAll('[data-comment-uri]')).find(
        (n) => n.getAttribute('data-comment-uri') === initialFocusedCommentUri
      )
      if (el) (el as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' })
    })
  }, [initialFocusedCommentUri, thread, threadRepliesFlat, focusItems])

  useEffect(() => {
    const inCommentsSection = hasRepliesSection && postSectionIndex === postSectionCount - 1
    if (!inCommentsSection || postSectionCount <= 1) return
    if (!commentsSectionRef.current?.contains(document.activeElement)) return
    const flat = threadRepliesFlatRef.current
    if (focusedCommentIndex < 0 || focusedCommentIndex >= flat.length) return
    const uri = flat[focusedCommentIndex]?.uri
    if (!uri || !commentsSectionRef.current) return
    const nodes = commentsSectionRef.current.querySelectorAll('[data-comment-uri]')
    const el = Array.from(nodes).find((n) => n.getAttribute('data-comment-uri') === uri)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [focusedCommentIndex, hasRepliesSection, postSectionIndex, postSectionCount])

  /* Scroll focused comment into view when focus changed by keyboard (W/S), like homepage cards */
  useEffect(() => {
    if (!scrollIntoViewFromKeyboardRef.current) return
    scrollIntoViewFromKeyboardRef.current = false
    const item = focusItems[keyboardFocusIndex]
    if (!item || (item.type !== 'comment' && item.type !== 'commentMedia') || !commentsSectionRef.current) return
    let el: Element | null = null
    if (item.type === 'comment') {
      el = Array.from(commentsSectionRef.current.querySelectorAll('[data-comment-uri]')).find(
        (n) => n.getAttribute('data-comment-uri') === item.commentUri
      ) ?? null
    } else {
      const commentEl = Array.from(commentsSectionRef.current.querySelectorAll('[data-comment-uri]')).find(
        (n) => n.getAttribute('data-comment-uri') === item.commentUri
      )
      el = commentEl?.querySelectorAll('[data-media-item]')?.[item.mediaIndex] ?? null
    }
    if (el) {
      const raf = requestAnimationFrame(() => {
        ;(el as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' })
      })
      return () => cancelAnimationFrame(raf)
    }
  }, [keyboardFocusIndex, focusItems])

  if (!decodedUri) {
    if (onClose) onClose()
    return null
  }

  const rootMedia =
    thread && isThreadViewPost(thread) ? getPostAllMedia(thread.post) : []

  const content = (
      <div className={`${styles.wrap}${onClose ? ` ${styles.wrapInModal}` : ''}`}>
        {loading && <div className={styles.loading}>Loading…</div>}
        {error && <p className={styles.error}>{error}</p>}
        {thread && isThreadViewPost(thread) && (
          <>
            <article className={`${styles.postBlock} ${styles.rootPostBlock}`}>
              {rootMedia.length > 0 && (
                <div
                  ref={mediaSectionRef}
                  onMouseEnter={() => rootMediaForNav.length > 0 && setKeyboardFocusIndex(0)}
                >
                  <MediaGallery
                    items={rootMedia}
                    autoPlayFirstVideo
                    onFocusItem={(i) => setKeyboardFocusIndex(i)}
                  />
                </div>
              )}
            <section className={styles.actions} aria-label="Post actions">
              <div className={styles.actionRow}>
                {rootMedia.length > 0 && (
                  <button
                    type="button"
                    className={styles.downloadBtn}
                    onClick={handleDownload}
                    disabled={downloadLoading}
                    title={rootMedia[0].type === 'video' ? 'Download video' : 'Download image'}
                    aria-label={rootMedia[0].type === 'video' ? 'Download video' : 'Download image'}
                  >
                    {downloadLoading ? '…' : '↓'} Download
                  </button>
                )}
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
                <div className={styles.repostWrap} ref={repostDropdownRef}>
                  <button
                    type="button"
                    className={`${styles.likeRepostBtn} ${isReposted ? styles.likeRepostBtnActive : ''} ${showRepostDropdown ? styles.repostTriggerOpen : ''}`}
                    onClick={() => setShowRepostDropdown((v) => !v)}
                    disabled={repostLoading}
                    title={isReposted ? 'Remove repost' : 'Repost or quote'}
                    aria-expanded={showRepostDropdown}
                    aria-haspopup="true"
                  >
                    {repostLoading ? '…' : 'Repost ▾'}
                  </button>
                  {showRepostDropdown && (
                    <div className={styles.repostDropdown} role="menu">
                      <button
                        type="button"
                        className={styles.repostDropdownItem}
                        role="menuitem"
                        onClick={() => {
                          setShowRepostDropdown(false)
                          handleRepost()
                        }}
                        disabled={repostLoading}
                      >
                        {isReposted ? 'Remove repost' : 'Repost'}
                      </button>
                      <button
                        type="button"
                        className={styles.repostDropdownItem}
                        role="menuitem"
                        onClick={openQuoteComposer}
                        disabled={!session?.did}
                      >
                        Quote post
                      </button>
                    </div>
                  )}
                </div>
                {thread && isThreadViewPost(thread) && (
                  <PostActionsMenu
                    postUri={thread.post.uri}
                    postCid={thread.post.cid}
                    authorDid={thread.post.author.did}
                    rootUri={thread.post.uri}
                    isOwnPost={session?.did === thread.post.author.did}
                    compact
                    verticalIcon
                    open={openActionsMenuUri === thread.post.uri}
                    onOpenChange={(open) => setOpenActionsMenuUri(open ? thread.post.uri : null)}
                    onHidden={() => navigate('/feed')}
                    postedAt={(thread.post.record as { createdAt?: string })?.createdAt}
                  />
                )}
              </div>
              {addedToBoard && (
                <p className={styles.added}>
                  Added to {boards.find((b) => b.id === addedToBoard)?.name}
                </p>
              )}
            </section>
              <div
                ref={descriptionSectionRef}
                className={styles.rootPostDescription}
                tabIndex={-1}
                onFocus={() => setKeyboardFocusIndex(rootMediaForNav.length)}
                onMouseEnter={() => setKeyboardFocusIndex(rootMediaForNav.length)}
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
                        title={formatExactDateTime((thread.post.record as { createdAt: string }).createdAt)}
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
                {(() => {
                  const quoted = getQuotedPostView(thread.post)
                  if (!quoted) return null
                  const quotedHandle = quoted.author?.handle ?? quoted.author?.did ?? ''
                  const quotedText = (quoted.record as { text?: string })?.text ?? ''
                  const quotedMedia = getPostAllMedia(quoted)
                  const quotedFirstMedia = quotedMedia[0]
                  return (
                    <div className={styles.quotedPostWrap}>
                      <p className={styles.quotedPostLabel}>Quoting</p>
                      <button
                        type="button"
                        className={styles.quotedPostCard}
                        onClick={() => {
                          navigate(`/post/${encodeURIComponent(quoted.uri)}`)
                          onClose?.()
                        }}
                      >
                        <div className={styles.quotedPostHead}>
                          {quoted.author?.avatar ? (
                            <img src={quoted.author.avatar} alt="" className={styles.quotedPostAvatar} loading="lazy" />
                          ) : (
                            <span className={styles.quotedPostAvatarPlaceholder} aria-hidden>{quotedHandle.slice(0, 1).toUpperCase()}</span>
                          )}
                          <ProfileLink handle={quotedHandle} className={styles.quotedPostHandle} onClick={(e) => e.stopPropagation()}>
                            @{quotedHandle}
                          </ProfileLink>
                          {(quoted.record as { createdAt?: string })?.createdAt && (
                            <span className={styles.quotedPostTime} title={formatExactDateTime((quoted.record as { createdAt: string }).createdAt)}>
                              {formatRelativeTime((quoted.record as { createdAt: string }).createdAt)}
                            </span>
                          )}
                        </div>
                        {quotedFirstMedia && (
                          <div className={styles.quotedPostMedia}>
                            {quotedFirstMedia.type === 'image' ? (
                              <img src={quotedFirstMedia.url} alt="" loading="lazy" className={styles.quotedPostThumb} />
                            ) : quotedFirstMedia.videoPlaylist ? (
                              <div className={styles.quotedPostVideoThumb} style={{ backgroundImage: quotedFirstMedia.url ? `url(${quotedFirstMedia.url})` : undefined }} />
                            ) : null}
                          </div>
                        )}
                        {quotedText ? (
                          <p className={styles.quotedPostText}>
                            <PostText text={quotedText} facets={(quoted.record as { facets?: unknown[] })?.facets} maxLength={200} stopPropagation />
                          </p>
                        ) : null}
                      </button>
                    </div>
                  )
                })()}
              </div>
            </article>
            {'replies' in thread && Array.isArray(thread.replies) && thread.replies.length > 0 && (
              <div
                ref={commentsSectionRef}
                className={`${styles.replies} ${styles.repliesTopLevel}`}
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
                        className={styles.topLevelCommentWrap}
                        data-comment-uri={r.post.uri}
                        tabIndex={-1}
                        onMouseEnter={() => {
                          if (commentContentFocusIndex >= 0) {
                            setKeyboardFocusIndex(commentContentFocusIndex)
                            setFocusedCommentIndex(threadRepliesFlat.findIndex((f) => f.uri === r.post.uri))
                          }
                        }}
                      >
                      <div
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
                      </div>
                    )
                  }
                  return (
                    <div
                      key={r.post.uri}
                      className={styles.topLevelCommentWrap}
                      onMouseEnter={() => {
                        if (commentContentFocusIndex >= 0) {
                          setKeyboardFocusIndex(commentContentFocusIndex)
                          setFocusedCommentIndex(threadRepliesFlat.findIndex((f) => f.uri === r.post.uri))
                        }
                      }}
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
                        onCommentMediaFocus={handleCommentMediaFocus}
                        onLike={sessionFromContext ? handleCommentLike : undefined}
                        onDownvote={sessionFromContext ? handleCommentDownvote : undefined}
                        likeOverrides={commentLikeOverrides}
                        myDownvotes={myDownvotes}
                        likeLoadingUri={commentLikeLoadingUri}
                        downvoteLoadingUri={commentDownvoteLoadingUri}
                        openActionsMenuCommentUri={openActionsMenuUri}
                        onActionsMenuOpenChange={(uri, open) => setOpenActionsMenuUri(open ? uri : null)}
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
                  onMouseEnter={() => setKeyboardFocusIndex(focusItems.length - 1)}
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
        {showQuoteComposer && (
          <>
            <div className={styles.quoteComposerBackdrop} onClick={closeQuoteComposer} aria-hidden />
            <div
              className={styles.quoteComposerOverlay}
              role="dialog"
              aria-label="Quote post"
              onClick={closeQuoteComposer}
              onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy' }}
              onDrop={(e) => { e.preventDefault(); if (e.dataTransfer?.files?.length) addQuoteImages(e.dataTransfer.files) }}
            >
              <div className={styles.quoteComposerCard} onClick={(e) => e.stopPropagation()}>
                <h2 className={styles.quoteComposerTitle}>Quote post</h2>
                {!session?.did ? (
                  <p className={styles.quoteComposerSignIn}>Log in to quote posts.</p>
                ) : (
                  <form
                    onSubmit={handleQuoteSubmit}
                    onKeyDown={(e) => {
                      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                        e.preventDefault()
                        handleQuoteSubmit(e as unknown as React.FormEvent)
                      }
                    }}
                  >
                    <textarea
                      className={styles.quoteComposerTextarea}
                      value={quoteText}
                      onChange={(e) => setQuoteText(e.target.value.slice(0, QUOTE_MAX_LENGTH))}
                      placeholder="Add your thoughts..."
                      rows={4}
                      maxLength={QUOTE_MAX_LENGTH}
                      disabled={quotePosting}
                      autoFocus
                    />
                    {quoteImages.length > 0 && (
                      <div className={styles.quoteComposerMediaSection}>
                        <div className={styles.quoteComposerPreviews}>
                          {quoteImages.map((_, i) => (
                            <div key={i} className={styles.quoteComposerPreviewWrap}>
                              <img src={quotePreviewUrls[i]} alt="" className={styles.quoteComposerPreviewImg} />
                              <button
                                type="button"
                                className={styles.quoteComposerPreviewRemove}
                                onClick={() => removeQuoteImage(i)}
                                aria-label="Remove image"
                                disabled={quotePosting}
                              >
                                ×
                              </button>
                            </div>
                          ))}
                        </div>
                        <p className={styles.quoteComposerAltPrompt}>Describe each image for accessibility (alt text).</p>
                        <div className={styles.quoteComposerAltFields}>
                          {quoteImages.map((_, i) => (
                            <div key={i} className={styles.quoteComposerAltRow}>
                              <label htmlFor={`quote-alt-${i}`} className={styles.quoteComposerAltLabel}>Image {i + 1}</label>
                              <input
                                id={`quote-alt-${i}`}
                                type="text"
                                className={styles.quoteComposerAltInput}
                                placeholder="Describe this image"
                                value={quoteImageAlts[i] ?? ''}
                                onChange={(e) => {
                                  const val = e.target.value.slice(0, 1000)
                                  setQuoteImageAlts((prev) => {
                                    const next = [...prev]
                                    while (next.length < quoteImages.length) next.push('')
                                    next[i] = val
                                    return next
                                  })
                                }}
                                maxLength={1000}
                                disabled={quotePosting}
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className={styles.quoteComposerFooter}>
                      <div className={styles.quoteComposerFooterLeft}>
                        <input
                          ref={quoteFileInputRef}
                          type="file"
                          accept="image/jpeg,image/png,image/gif,image/webp"
                          multiple
                          className={styles.quoteComposerFileInput}
                          onChange={(e) => {
                            if (e.target.files?.length) addQuoteImages(e.target.files)
                            e.target.value = ''
                          }}
                        />
                        <button
                          type="button"
                          className={styles.quoteComposerAddMedia}
                          onClick={() => quoteFileInputRef.current?.click()}
                          disabled={quotePosting || quoteImages.length >= QUOTE_IMAGE_MAX}
                          title="Add photo"
                          aria-label="Add photo"
                        >
                          Add media
                        </button>
                        <span className={styles.quoteComposerCount} aria-live="polite">
                          {quoteText.length}/{QUOTE_MAX_LENGTH}
                        </span>
                      </div>
                      <div className={styles.quoteComposerActions}>
                        <button type="button" className={styles.quoteComposerCancel} onClick={closeQuoteComposer} disabled={quotePosting}>
                          Cancel
                        </button>
                        <button
                          type="submit"
                          className={styles.quoteComposerSubmit}
                          disabled={quotePosting || (!quoteText.trim() && quoteImages.length === 0)}
                        >
                          {quotePosting ? 'Posting…' : 'Quote post'}
                        </button>
                      </div>
                    </div>
                    {quoteError && <p className={styles.quoteComposerError}>{quoteError}</p>}
                  </form>
                )}
              </div>
            </div>
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
