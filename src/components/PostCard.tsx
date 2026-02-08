import { useRef, useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import Hls from 'hls.js'
import { getPostMediaInfo, getPostAllMedia, getPostMediaUrl, agent, type TimelineItem } from '../lib/bsky'
import { getArtboards, createArtboard, addPostToArtboard, isPostInArtboard, getArtboard } from '../lib/artboards'
import { putArtboardOnPds } from '../lib/artboardsPds'
import { useSession } from '../context/SessionContext'
import { useArtOnly } from '../context/ArtOnlyContext'
import { formatRelativeTime, formatRelativeTimeTitle } from '../lib/date'
import PostText from './PostText'
import ProfileLink from './ProfileLink'
import PostActionsMenu from './PostActionsMenu'
import styles from './PostCard.module.css'

const LONG_PRESS_MS = 350
const LONG_PRESS_MS_TOUCH = 550
const LONG_PRESS_MOVE_THRESHOLD = 14

interface Props {
  item: TimelineItem
  /** When true, show keyboard-focus ring and parent can use cardRef/addButtonRef */
  isSelected?: boolean
  /** Optional ref (object or callback) to the card root (for scroll-into-view) */
  cardRef?: React.Ref<HTMLDivElement | null>
  /** Optional ref to the add-to-artboard button (for C key) */
  addButtonRef?: React.RefObject<HTMLButtonElement | null>
  /** When true, open the add-to-artboard dropdown (e.g. from C key) */
  openAddDropdown?: boolean
  /** Called when the add-to-artboard dropdown is closed */
  onAddClose?: () => void
  /** When provided, opening the post calls this instead of navigating to /post/:uri (e.g. open in modal) */
  onPostClick?: (uri: string, options?: { openReply?: boolean }) => void
  /** Feed name to show in ... menu (e.g. "Following", feed label) */
  feedLabel?: string
  /** When this changes, open the ... menu (e.g. M key). Unused if openActionsMenu is provided. */
  openActionsMenuTrigger?: number
  /** Controlled: when true, menu is open; use with onActionsMenuClose and onActionsMenuOpen */
  openActionsMenu?: boolean
  /** Called when the ... menu is opened (so parent can set which card's menu is open) */
  onActionsMenuOpen?: () => void
  /** Called when the ... menu closes (so parent can clear open state) */
  onActionsMenuClose?: () => void
  /** Called when media aspect ratio is known (for bento layout) */
  onAspectRatio?: (aspect: number) => void
  /** When true, card fills grid cell height and media uses object-fit: cover (bento mode) */
  fillCell?: boolean
  /** When true, show media blurred with a "Tap to reveal" overlay (NSFW blurred mode) */
  nsfwBlurred?: boolean
  /** Called when user taps to reveal NSFW content */
  onNsfwUnblur?: () => void
  /** When true, media wrap uses fixed height from --feed-card-media-max-height (no aspect-ratio resize on load) */
  constrainMediaHeight?: boolean
  /** Override liked state (e.g. from F key toggle); string = liked, null = unliked, undefined = use post.viewer.like */
  likedUriOverride?: string | null
}

function RepostIcon() {
  return (
    <svg className={styles.repostIcon} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z" />
    </svg>
  )
}

function HeartIcon({ filled }: { filled?: boolean }) {
  return (
    <svg className={styles.longPressIcon} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  )
}

function CollectionIcon() {
  return (
    <svg className={styles.longPressIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M19 11H5v-2h14v2zm0 4H5v-2h14v2zm0-8H5V5h14v2z" />
    </svg>
  )
}

function isHlsUrl(url: string): boolean {
  return /\.m3u8(\?|$)/i.test(url) || url.includes('m3u8')
}

export default function PostCard({ item, isSelected, cardRef: cardRefProp, addButtonRef: _addButtonRef, openAddDropdown, onAddClose, onPostClick, feedLabel, openActionsMenuTrigger, openActionsMenu, onActionsMenuOpen, onActionsMenuClose, onAspectRatio, fillCell, nsfwBlurred, onNsfwUnblur, constrainMediaHeight, likedUriOverride }: Props) {
  const navigate = useNavigate()
  const { session } = useSession()
  const { artOnly } = useArtOnly()
  const videoRef = useRef<HTMLVideoElement>(null)
  const mediaWrapRef = useRef<HTMLDivElement>(null)
  const hlsRef = useRef<Hls | null>(null)
  const { post, reason } = item as { post: typeof item.post; reason?: { $type?: string; by?: { handle?: string; did?: string } } }
  const media = getPostMediaInfo(post)
  const hasMedia = !!media
  const text = (post.record as { text?: string })?.text ?? ''
  const handle = post.author.handle ?? post.author.did
  const repostedByHandle = reason?.by ? (reason.by.handle ?? reason.by.did) : null
  const authorViewer = (post.author as { viewer?: { following?: string } }).viewer
  const isFollowingAuthor = !!authorViewer?.following
  const isOwnPost = session?.did === post.author.did
  const showNotFollowingGreen = !!session && !isOwnPost && !isFollowingAuthor
  const postViewer = (post as { viewer?: { like?: string } })
  const initialLikedUri = postViewer.viewer?.like
  const [likedUri, setLikedUri] = useState<string | undefined>(initialLikedUri)
  const effectiveLikedUri = likedUriOverride !== undefined ? (likedUriOverride ?? undefined) : likedUri

  const [imageIndex, setImageIndex] = useState(0)
  const [multiImageExpanded, setMultiImageExpanded] = useState(false)
  const [mediaAspect, setMediaAspect] = useState<number | null>(() =>
    hasMedia && media?.aspectRatio != null ? media.aspectRatio : null
  )
  const [addOpen, setAddOpen] = useState(false)
  const [addToBoardIds, setAddToBoardIds] = useState<Set<string>>(new Set())
  const [newBoardName, setNewBoardName] = useState('')
  const [showLongPressMenu, setShowLongPressMenu] = useState(false)
  const [longPressViewport, setLongPressViewport] = useState({ x: 0, y: 0 })
  const addRef = useRef<HTMLDivElement>(null)
  const addRefMobile = useRef<HTMLDivElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const longPressMenuRef = useRef<HTMLDivElement>(null)
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const didLongPressRef = useRef(false)
  const longPressPositionRef = useRef({ x: 0, y: 0 })
  const longPressViewportRef = useRef({ x: 0, y: 0 })
  const touchStartRef = useRef({ x: 0, y: 0 })
  const lastTapRef = useRef(0)
  const didDoubleTapRef = useRef(false)

  useEffect(() => {
    if (likedUriOverride !== undefined) {
      setLikedUri(likedUriOverride ?? undefined)
    } else {
      setLikedUri(initialLikedUri)
    }
  }, [post.uri, initialLikedUri, likedUriOverride])

  const clearLongPressTimer = useCallback(() => {
    if (longPressTimerRef.current !== null) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
  }, [])

  const startLongPressTimer = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY
    const isTouch = 'touches' in e
    touchStartRef.current = { x: clientX, y: clientY }
    if (cardRef.current) {
      const rect = cardRef.current.getBoundingClientRect()
      longPressPositionRef.current = { x: clientX - rect.left, y: clientY - rect.top }
    }
    longPressViewportRef.current = { x: clientX, y: clientY }
    clearLongPressTimer()
    const delay = isTouch ? LONG_PRESS_MS_TOUCH : LONG_PRESS_MS
    longPressTimerRef.current = setTimeout(() => {
      longPressTimerRef.current = null
      didLongPressRef.current = true
      setLongPressViewport(longPressViewportRef.current)
      setShowLongPressMenu(true)
    }, delay)
  }, [clearLongPressTimer])

  const checkTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 0) return
    const dx = e.touches[0].clientX - touchStartRef.current.x
    const dy = e.touches[0].clientY - touchStartRef.current.y
    if (Math.hypot(dx, dy) > LONG_PRESS_MOVE_THRESHOLD) clearLongPressTimer()
  }, [clearLongPressTimer])

  useEffect(() => {
    return clearLongPressTimer
  }, [clearLongPressTimer])

  useEffect(() => {
    if (openAddDropdown) setAddOpen(true)
  }, [openAddDropdown])

  const prevAddOpenRef = useRef(addOpen)
  useEffect(() => {
    if (prevAddOpenRef.current && !addOpen) onAddClose?.()
    prevAddOpenRef.current = addOpen
  }, [addOpen, onAddClose])

  useEffect(() => {
    if (!addOpen) return
    function onDocClick(e: MouseEvent) {
      const target = e.target as Node
      if (addRef.current?.contains(target) || addRefMobile.current?.contains(target)) return
      setAddOpen(false)
    }
    document.addEventListener('click', onDocClick)
    return () => document.removeEventListener('click', onDocClick)
  }, [addOpen])

  useEffect(() => {
    if (!showLongPressMenu) return
    function onDocClick(e: MouseEvent) {
      if (longPressMenuRef.current && !longPressMenuRef.current.contains(e.target as Node)) {
        setShowLongPressMenu(false)
        didLongPressRef.current = false
      }
    }
    document.addEventListener('click', onDocClick)
    return () => document.removeEventListener('click', onDocClick)
  }, [showLongPressMenu])

  const boards = getArtboards()

  function toggleBoardSelection(boardId: string) {
    setAddToBoardIds((prev) => {
      const next = new Set(prev)
      if (next.has(boardId)) next.delete(boardId)
      else next.add(boardId)
      return next
    })
  }

  async function handleAddToArtboard() {
    const hasSelection = addToBoardIds.size > 0 || newBoardName.trim().length > 0
    if (!hasSelection) return
    const mediaUrl = getPostMediaUrl(post)
    const allMedia = getPostAllMedia(post)
    const thumbs = allMedia.length > 0 ? allMedia.map((m) => m.url) : undefined
    const payload = {
      uri: post.uri,
      cid: post.cid,
      authorHandle: post.author.handle,
      text: (post.record as { text?: string })?.text?.slice(0, 200),
      thumb: mediaUrl?.url ?? thumbs?.[0],
      thumbs,
    }
    const modifiedIds: string[] = []
    if (newBoardName.trim()) {
      const board = createArtboard(newBoardName.trim())
      addPostToArtboard(board.id, payload)
      modifiedIds.push(board.id)
      setNewBoardName('')
    }
    addToBoardIds.forEach((id) => {
      addPostToArtboard(id, payload)
      modifiedIds.push(id)
    })
    setAddToBoardIds(new Set())
    setAddOpen(false)
    if (session?.did && modifiedIds.length > 0) {
      for (const boardId of modifiedIds) {
        const board = getArtboard(boardId)
        if (board) {
          try {
            await putArtboardOnPds(agent, session.did, board)
          } catch {
            // leave local as is
          }
        }
      }
    }
  }

  const isVideo = hasMedia && media!.type === 'video' && media!.videoPlaylist
  const isMultipleImages = hasMedia && media!.type === 'image' && (media!.imageCount ?? 0) > 1
  const allMedia = getPostAllMedia(post)
  const imageItems = allMedia.filter((m) => m.type === 'image')
  const currentImageUrl = isMultipleImages && imageItems.length ? imageItems[imageIndex]?.url : (media?.url ?? '')
  const n = imageItems.length

  const handleImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget
    if (!img.naturalWidth || !img.naturalHeight) return
    /* For multi-image posts, set aspect only once (from whichever image loads first)
       so the container doesn't resize when cycling – keeps prev/next arrow positions fixed. */
    if (isMultipleImages) {
      setMediaAspect((prev) => (prev != null ? prev : img.naturalWidth! / img.naturalHeight!))
      return
    }
    setMediaAspect(img.naturalWidth / img.naturalHeight)
  }, [isMultipleImages])

  useEffect(() => {
    if (isVideo) setMediaAspect(null)
    else if (hasMedia && media?.aspectRatio != null) setMediaAspect((prev) => prev ?? media.aspectRatio!)
  }, [hasMedia, media?.aspectRatio, media?.videoPlaylist, isVideo])

  /* When post changes (e.g. virtualized list), reset aspect to new post's so reserved size is correct */
  useEffect(() => {
    if (!hasMedia) setMediaAspect(null)
    else if (isVideo) setMediaAspect(null)
    else if (media?.aspectRatio != null) setMediaAspect(media.aspectRatio)
    else setMediaAspect(null)
  }, [post.uri])

  /* Keep previous aspect when switching images so the container doesn't flash to 3/4 and back */

  useEffect(() => {
    if (mediaAspect != null && onAspectRatio) onAspectRatio(mediaAspect)
  }, [mediaAspect, onAspectRatio])

  useEffect(() => {
    if (!isVideo || !media?.videoPlaylist || !videoRef.current) return
    const video = videoRef.current
    const src = media!.videoPlaylist
    if (Hls.isSupported() && isHlsUrl(src)) {
      const hls = new Hls()
      hlsRef.current = hls
      hls.loadSource(src)
      hls.attachMedia(video)
      hls.on(Hls.Events.ERROR, () => {})
      return () => {
        hls.destroy()
        hlsRef.current = null
      }
    }
    if (video.canPlayType('application/vnd.apple.mpegurl') || !isHlsUrl(src)) {
      video.src = src
      return () => {
        video.removeAttribute('src')
      }
    }
  }, [isVideo, media?.videoPlaylist])

  /* Autoplay video when in view, pause when out of view */
  useEffect(() => {
    if (!isVideo || !mediaWrapRef.current || !videoRef.current) return
    const el = mediaWrapRef.current
    const video = videoRef.current
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        if (!entry || !video) return
        if (entry.isIntersecting) {
          video.play().catch(() => {})
        } else {
          video.pause()
        }
      },
      { threshold: 0.25, rootMargin: '0px' }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [isVideo])

  function onMediaEnter() {
    if (videoRef.current) {
      videoRef.current.play().catch(() => {})
    }
  }

  function onMediaLeave() {
    if (videoRef.current) {
      videoRef.current.pause()
      videoRef.current.currentTime = 0
    }
  }

  function handleCardClick(e: React.MouseEvent) {
    if (didLongPressRef.current) {
      e.preventDefault()
      e.stopPropagation()
      didLongPressRef.current = false
      return
    }
    if (didDoubleTapRef.current) {
      didDoubleTapRef.current = false
      e.preventDefault()
      e.stopPropagation()
      return
    }
    if (onPostClick) {
      onPostClick(post.uri)
    } else {
      navigate(`/post/${encodeURIComponent(post.uri)}`)
    }
  }

  async function handleLongPressLike(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    setShowLongPressMenu(false)
    didLongPressRef.current = false
    try {
      await agent.like(post.uri, post.cid)
    } catch {
      // ignore
    }
  }

  async function handleLongPressRepost(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    setShowLongPressMenu(false)
    didLongPressRef.current = false
    try {
      await agent.repost(post.uri, post.cid)
    } catch {
      // ignore
    }
  }

  function handleLongPressAddToCollection(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    setShowLongPressMenu(false)
    didLongPressRef.current = false
    setAddOpen(true)
  }

  const setCardRef = useCallback(
    (el: HTMLDivElement | null) => {
      (cardRef as React.MutableRefObject<HTMLDivElement | null>).current = el
      if (cardRefProp) {
        if (typeof cardRefProp === 'function') cardRefProp(el)
        else (cardRefProp as React.MutableRefObject<HTMLDivElement | null>).current = el
      }
    },
    [cardRefProp],
  )

  return (
    <div ref={setCardRef} className={`${styles.card} ${isSelected ? styles.cardSelected : ''} ${fillCell ? styles.cardFillCell : ''} ${artOnly ? styles.cardArtOnly : ''}`}>
      <div
        role="button"
        tabIndex={0}
        className={styles.cardLink}
        onClick={handleCardClick}
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return
          if (onPostClick) onPostClick(post.uri)
          else navigate(`/post/${encodeURIComponent(post.uri)}`)
        }}
        onMouseDown={(e) => startLongPressTimer(e)}
        onMouseUp={clearLongPressTimer}
        onMouseLeave={clearLongPressTimer}
        onTouchStart={(e) => startLongPressTimer(e)}
        onTouchMove={checkTouchMove}
        onTouchEnd={() => {
          clearLongPressTimer()
          if (didLongPressRef.current) return
          const now = Date.now()
          if (now - lastTapRef.current < 400) {
            lastTapRef.current = 0
            didDoubleTapRef.current = true
            agent.like(post.uri, post.cid).catch(() => {})
          } else {
            lastTapRef.current = now
          }
        }}
        onTouchCancel={clearLongPressTimer}
      >
        <div
          ref={mediaWrapRef}
          className={`${styles.mediaWrap} ${fillCell ? styles.mediaWrapFillCell : ''} ${constrainMediaHeight ? styles.mediaWrapConstrained : ''}`}
          style={
            fillCell || constrainMediaHeight
              ? undefined
              : {
                  aspectRatio:
                    !hasMedia ? '1' : mediaAspect != null ? String(mediaAspect) : isVideo ? '16/9' : undefined,
                }
          }
          onMouseEnter={onMediaEnter}
          onMouseLeave={onMediaLeave}
        >
          {!hasMedia ? (
            <div className={styles.textOnlyPreview}>
              {text ? (
                <div className={styles.textOnlyPreviewText}>
                  <PostText
                    text={text}
                    facets={(post.record as { facets?: unknown[] })?.facets}
                    maxLength={160}
                    stopPropagation
                  />
                </div>
              ) : (
                <span className={styles.textOnlyPreviewEmpty}>Text post</span>
              )}
            </div>
          ) : isVideo ? (
            <video
              ref={videoRef}
              className={styles.media}
              poster={media!.url || undefined}
              muted
              playsInline
              loop
              preload="none"
              onLoadedMetadata={(e) => {
                const v = e.currentTarget
                if (v.videoWidth && v.videoHeight) {
                  setMediaAspect(v.videoWidth / v.videoHeight)
                }
              }}
            />
          ) : isMultipleImages && imageItems.length > 1 ? (
            multiImageExpanded ? (
              <>
                <img
                  src={currentImageUrl}
                  alt=""
                  className={styles.media}
                  loading="lazy"
                  onLoad={handleImageLoad}
                />
                <button
                  type="button"
                  className={styles.mediaArrow}
                  style={{ left: 0 }}
                  aria-label="Previous image"
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    setImageIndex((i) => (n ? (i - 1 + n) % n : 0))
                  }}
                >
                  ‹
                </button>
                <button
                  type="button"
                  className={styles.mediaArrow}
                  style={{ right: 0 }}
                  aria-label="Next image"
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    setImageIndex((i) => (n ? (i + 1) % n : 0))
                  }}
                >
                  ›
                </button>
              </>
            ) : (
              <>
                {/* In-flow spacer so mediaWrap gets height when grid is absolute (fixes 1-col scaling) */}
                <div className={styles.mediaWrapGridSpacer} aria-hidden />
                <div className={styles.mediaWrapGrid}>
                  <div className={styles.mediaGrid} style={{ minHeight: 0 }}>
                    {imageItems.map((imgItem, idx) => (
                      <div key={idx} className={styles.mediaGridCell}>
                        <img
                          src={imgItem.url}
                          alt=""
                          className={styles.mediaGridImg}
                          loading="lazy"
                          onLoad={idx === 0 ? handleImageLoad : undefined}
                        />
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    className={styles.mediaArrow}
                    style={{ left: 0 }}
                    aria-label="Previous image"
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      setMultiImageExpanded(true)
                      setImageIndex(0)
                    }}
                  >
                    ‹
                  </button>
                  <button
                    type="button"
                    className={styles.mediaArrow}
                    style={{ right: 0 }}
                    aria-label="Next image"
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      setMultiImageExpanded(true)
                      setImageIndex(0)
                    }}
                  >
                    ›
                  </button>
                </div>
              </>
            )
          ) : (
            <>
              <img src={currentImageUrl} alt="" className={styles.media} loading="lazy" onLoad={handleImageLoad} />
            </>
          )}
          {nsfwBlurred && onNsfwUnblur && hasMedia && (
            <div
              className={styles.nsfwOverlay}
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onNsfwUnblur()
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onNsfwUnblur()
                }
              }}
              role="button"
              tabIndex={0}
              aria-label="Reveal sensitive content"
            >
              <span className={styles.nsfwOverlayText}>Tap to reveal</span>
            </div>
          )}
        </div>
        {!artOnly && (
        <div className={styles.meta}>
          <div className={styles.handleBlock}>
            <div className={styles.handleRow}>
              {post.author.avatar && (
                <img src={post.author.avatar} alt="" className={styles.authorAvatar} loading="lazy" />
              )}
              <span className={styles.handleRowMain}>
                <span className={effectiveLikedUri ? styles.handleLinkWrapLiked : showNotFollowingGreen ? styles.handleLinkWrapNotFollowing : styles.handleLinkWrap}>
                  <ProfileLink
                    handle={handle}
                    className={styles.handleLink}
                    onClick={(e) => e.stopPropagation()}
                  >
                    @{handle}
                  </ProfileLink>
                </span>
                {repostedByHandle && (
                  <ProfileLink
                    handle={repostedByHandle}
                    className={styles.repostIconLink}
                    onClick={(e) => e.stopPropagation()}
                    title={`Reposted by @${repostedByHandle}`}
                    aria-label={`Reposted by @${repostedByHandle}`}
                  >
                    <RepostIcon />
                  </ProfileLink>
                )}
              </span>
              <span className={styles.handleRowMeta}>
                <div
                  className={`${styles.addWrap} ${addOpen ? styles.addWrapOpen : ''}`}
                  ref={addRef}
                  onClick={(e) => e.stopPropagation()}
                >
                <button
                  type="button"
                  className={styles.addToBoardBtn}
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    setAddOpen((o) => !o)
                  }}
                  aria-label="Collect"
                  aria-expanded={addOpen}
                >
                  +
                </button>
                {addOpen && (
                  <div className={styles.addDropdown}>
                    {boards.length === 0 ? null : (
                      <>
                        {boards.map((b) => {
                          const alreadyIn = isPostInArtboard(b.id, post.uri)
                          const selected = addToBoardIds.has(b.id)
                          return (
                            <label key={b.id} className={styles.addBoardLabel}>
                              <input
                                type="checkbox"
                                checked={selected}
                                onChange={() => !alreadyIn && toggleBoardSelection(b.id)}
                                disabled={alreadyIn}
                                className={styles.addBoardCheckbox}
                              />
                              <span className={styles.addBoardText}>
                                {alreadyIn ? <>✓ {b.name}</> : b.name}
                              </span>
                            </label>
                          )
                        })}
                      </>
                    )}
                    <div className={styles.addDropdownNew}>
                      <input
                        type="text"
                        placeholder="New collection name"
                        value={newBoardName}
                        onChange={(e) => setNewBoardName(e.target.value)}
                        className={styles.addBoardInput}
                        onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddToArtboard())}
                      />
                    </div>
                    <div className={styles.addDropdownActions}>
                      <button
                        type="button"
                        className={styles.addBoardSubmit}
                        onClick={handleAddToArtboard}
                        disabled={addToBoardIds.size === 0 && !newBoardName.trim()}
                      >
                        Add to selected
                      </button>
                    </div>
                  </div>
                )}
              </div>
                {(post.record as { createdAt?: string })?.createdAt && (
                  <span className={styles.postTime} title={formatRelativeTimeTitle((post.record as { createdAt: string }).createdAt)}>
                    {formatRelativeTime((post.record as { createdAt: string }).createdAt)}
                  </span>
                )}
                <div
                  className={styles.actionsMenuWrap}
                  onClick={(e) => e.stopPropagation()}
                  data-open={openActionsMenu === true ? 'true' : undefined}
                >
                  <PostActionsMenu
                    postUri={post.uri}
                    postCid={post.cid}
                    authorDid={post.author.did}
                    rootUri={post.uri}
                    isOwnPost={isOwnPost}
                    feedLabel={feedLabel}
                    openTrigger={openActionsMenu === undefined && isSelected ? openActionsMenuTrigger : undefined}
                    open={openActionsMenu}
                    onOpenChange={onActionsMenuClose !== undefined ? (o) => { if (o) onActionsMenuOpen?.(); else onActionsMenuClose() } : undefined}
                  />
                </div>
            </span>
            </div>
          </div>
          {hasMedia && text ? (
            <p className={styles.text}>
              <PostText text={text} facets={(post.record as { facets?: unknown[] })?.facets} maxLength={80} stopPropagation />
            </p>
          ) : null}
        </div>
        )}
      </div>
      {showLongPressMenu && (
        <div
          ref={longPressMenuRef}
          className={styles.longPressOverlay}
          role="menu"
          aria-label="Post actions"
          style={{
            left: longPressViewport.x,
            top: longPressViewport.y,
          }}
        >
          <button
            type="button"
            className={styles.longPressBtnTop}
            onClick={handleLongPressLike}
            title="Like"
            aria-label="Like"
          >
            <HeartIcon />
          </button>
          <button
            type="button"
            className={styles.longPressBtnBottom}
            onClick={handleLongPressRepost}
            title="Repost"
            aria-label="Repost"
          >
            <RepostIcon />
          </button>
          <button
            type="button"
            className={styles.longPressBtnLeft}
            onClick={handleLongPressAddToCollection}
            title="Add to collection"
            aria-label="Add to collection"
          >
            <CollectionIcon />
          </button>
        </div>
      )}
    </div>
  )
}
