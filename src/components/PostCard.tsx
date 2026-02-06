import { useRef, useEffect, useState, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Hls from 'hls.js'
import { getPostMediaInfo, getPostAllMedia, getPostMediaUrl, agent, type TimelineItem } from '../lib/bsky'
import { getArtboards, createArtboard, addPostToArtboard, isPostInArtboard, getArtboard } from '../lib/artboards'
import { putArtboardOnPds } from '../lib/artboardsPds'
import { useSession } from '../context/SessionContext'
import { useArtOnly } from '../context/ArtOnlyContext'
import PostText from './PostText'
import styles from './PostCard.module.css'

const LONG_PRESS_MS = 350
const LONG_PRESS_MS_TOUCH = 550
const LONG_PRESS_MOVE_THRESHOLD = 14

interface Props {
  item: TimelineItem
}

function VideoIcon() {
  return (
    <svg className={styles.mediaIcon} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M8 5v14l11-7L8 5z" />
    </svg>
  )
}

function ImagesIcon() {
  return (
    <svg className={styles.mediaIcon} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M22 16V4c0-1.1-.9-2-2-2H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2zm-11-4l2.03 2.71L16 11l4 5H8l3-4zM2 6v14c0 1.1.9 2 2 2h14v-2H4V6H2z" />
    </svg>
  )
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

export default function PostCard({ item }: Props) {
  const navigate = useNavigate()
  const { session } = useSession()
  const { artOnly } = useArtOnly()
  const videoRef = useRef<HTMLVideoElement>(null)
  const hlsRef = useRef<Hls | null>(null)
  const { post, reason } = item as { post: typeof item.post; reason?: { $type?: string; by?: { handle?: string; did?: string } } }
  const media = getPostMediaInfo(post)
  const text = (post.record as { text?: string })?.text ?? ''
  const handle = post.author.handle ?? post.author.did
  const repostedByHandle = reason?.by ? (reason.by.handle ?? reason.by.did) : null

  const [imageIndex, setImageIndex] = useState(0)
  const [mediaAspect, setMediaAspect] = useState<number | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [addToBoardIds, setAddToBoardIds] = useState<Set<string>>(new Set())
  const [newBoardName, setNewBoardName] = useState('')
  const [showLongPressMenu, setShowLongPressMenu] = useState(false)
  const [longPressViewport, setLongPressViewport] = useState({ x: 0, y: 0 })
  const addRef = useRef<HTMLDivElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const longPressMenuRef = useRef<HTMLDivElement>(null)
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const didLongPressRef = useRef(false)
  const longPressPositionRef = useRef({ x: 0, y: 0 })
  const longPressViewportRef = useRef({ x: 0, y: 0 })
  const touchStartRef = useRef({ x: 0, y: 0 })
  const lastTapRef = useRef(0)
  const didDoubleTapRef = useRef(false)

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
    if (!addOpen) return
    function onDocClick(e: MouseEvent) {
      if (addRef.current && !addRef.current.contains(e.target as Node)) setAddOpen(false)
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

  if (!media) return null

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
    const payload = {
      uri: post.uri,
      cid: post.cid,
      authorHandle: post.author.handle,
      text: (post.record as { text?: string })?.text?.slice(0, 200),
      thumb: mediaUrl?.url,
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

  const isVideo = media.type === 'video' && media.videoPlaylist
  const isMultipleImages = media.type === 'image' && (media.imageCount ?? 0) > 1
  const allMedia = getPostAllMedia(post)
  const imageItems = allMedia.filter((m) => m.type === 'image')
  const currentImageUrl = isMultipleImages && imageItems.length ? imageItems[imageIndex]?.url : media.url
  const n = imageItems.length

  const handleImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget
    if (img.naturalWidth && img.naturalHeight) {
      setMediaAspect(img.naturalWidth / img.naturalHeight)
    }
  }, [])

  /* Keep previous aspect when switching images so the container doesn't flash to 3/4 and back */
  useEffect(() => {
    if (isVideo) setMediaAspect(null)
  }, [isVideo, media.videoPlaylist])

  useEffect(() => {
    if (!isVideo || !media.videoPlaylist || !videoRef.current) return
    const video = videoRef.current
    const src = media.videoPlaylist
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
  }, [isVideo, media.videoPlaylist])

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
    navigate(`/post/${encodeURIComponent(post.uri)}`)
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

  return (
    <div ref={cardRef} className={styles.card}>
      <div
        role="button"
        tabIndex={0}
        className={styles.cardLink}
        onClick={handleCardClick}
        onKeyDown={(e) => e.key === 'Enter' && navigate(`/post/${encodeURIComponent(post.uri)}`)}
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
          className={styles.mediaWrap}
          style={{
            aspectRatio:
              mediaAspect != null ? String(mediaAspect) : isVideo ? '16/9' : undefined,
          }}
          onMouseEnter={onMediaEnter}
          onMouseLeave={onMediaLeave}
        >
          {isVideo ? (
            <video
              ref={videoRef}
              className={styles.media}
              poster={media.url || undefined}
              muted
              playsInline
              loop
              preload="metadata"
              onLoadedMetadata={(e) => {
                const v = e.currentTarget
                if (v.videoWidth && v.videoHeight) {
                  setMediaAspect(v.videoWidth / v.videoHeight)
                }
              }}
            />
          ) : (
            <>
              <img src={currentImageUrl} alt="" className={styles.media} loading="lazy" onLoad={handleImageLoad} />
              {isMultipleImages && imageItems.length > 1 && (
                <>
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
              )}
            </>
          )}
        </div>
        {!artOnly && (
        <div className={styles.meta}>
          <div className={styles.handleBlock}>
            <span className={styles.handleRow}>
              {post.author.avatar && (
                <img src={post.author.avatar} alt="" className={styles.authorAvatar} />
              )}
              <Link
                to={`/profile/${encodeURIComponent(handle)}`}
                className={styles.handleLink}
                onClick={(e) => e.stopPropagation()}
              >
                @{handle}
              </Link>
              {repostedByHandle && (
                <Link
                  to={`/profile/${encodeURIComponent(repostedByHandle)}`}
                  className={styles.repostIconLink}
                  onClick={(e) => e.stopPropagation()}
                  title={`Reposted by @${repostedByHandle}`}
                  aria-label={`Reposted by @${repostedByHandle}`}
                >
                  <RepostIcon />
                </Link>
              )}
              {isVideo && (
                <span className={styles.mediaBadge} title="Video – hover to play, click to open post">
                  <VideoIcon />
                </span>
              )}
              {isMultipleImages && (
                <span className={styles.mediaBadge} title={`${media.imageCount} images`}>
                  <ImagesIcon />
                </span>
              )}
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
                  aria-label="Add to artboard"
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
            </span>
          </div>
          {text ? (
            <p className={styles.text}>
              <PostText text={text} maxLength={80} stopPropagation />
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
