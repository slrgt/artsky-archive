import { useRef, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Hls from 'hls.js'
import { getPostMediaInfo, getPostAllMedia, getPostMediaUrl, type TimelineItem } from '../lib/bsky'
import { getArtboards, createArtboard, addPostToArtboard, isPostInArtboard } from '../lib/artboards'
import PostText from './PostText'
import styles from './PostCard.module.css'

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

function isHlsUrl(url: string): boolean {
  return /\.m3u8(\?|$)/i.test(url) || url.includes('m3u8')
}

export default function PostCard({ item }: Props) {
  const navigate = useNavigate()
  const videoRef = useRef<HTMLVideoElement>(null)
  const hlsRef = useRef<Hls | null>(null)
  const { post, reason } = item as { post: typeof item.post; reason?: { $type?: string; by?: { handle?: string; did?: string } } }
  const media = getPostMediaInfo(post)
  const text = (post.record as { text?: string })?.text ?? ''
  const handle = post.author.handle ?? post.author.did
  const isRepost = reason?.$type === 'app.bsky.feed.defs#reasonRepost' && reason?.by
  const repostedByHandle = reason?.by ? (reason.by.handle ?? reason.by.did) : null

  const [imageIndex, setImageIndex] = useState(0)
  const [addOpen, setAddOpen] = useState(false)
  const [addToBoardIds, setAddToBoardIds] = useState<Set<string>>(new Set())
  const [newBoardName, setNewBoardName] = useState('')
  const addRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!addOpen) return
    function onDocClick(e: MouseEvent) {
      if (addRef.current && !addRef.current.contains(e.target as Node)) setAddOpen(false)
    }
    document.addEventListener('click', onDocClick)
    return () => document.removeEventListener('click', onDocClick)
  }, [addOpen])

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

  function handleAddToArtboard() {
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
    if (newBoardName.trim()) {
      const board = createArtboard(newBoardName.trim())
      addPostToArtboard(board.id, payload)
      setNewBoardName('')
    }
    addToBoardIds.forEach((id) => addPostToArtboard(id, payload))
    setAddToBoardIds(new Set())
    setAddOpen(false)
  }

  const isVideo = media.type === 'video' && media.videoPlaylist
  const isMultipleImages = media.type === 'image' && (media.imageCount ?? 0) > 1
  const allMedia = getPostAllMedia(post)
  const imageItems = allMedia.filter((m) => m.type === 'image')
  const currentImageUrl = isMultipleImages && imageItems.length ? imageItems[imageIndex]?.url : media.url
  const n = imageItems.length

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

  return (
    <div className={styles.card}>
      <div
        role="button"
        tabIndex={0}
        className={styles.cardLink}
        onClick={() => navigate(`/post/${encodeURIComponent(post.uri)}`)}
        onKeyDown={(e) => e.key === 'Enter' && navigate(`/post/${encodeURIComponent(post.uri)}`)}
      >
        <div
          className={styles.mediaWrap}
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
            />
          ) : (
            <>
              <img src={currentImageUrl} alt="" className={styles.media} loading="lazy" />
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
        <div className={styles.meta}>
          <div className={styles.handleBlock}>
            <span className={styles.handleRow}>
              {post.author.avatar && (
                <img src={post.author.avatar} alt="" className={styles.authorAvatar} />
              )}
              {isRepost && (
                <span className={styles.repostBadge} title="Repost">
                  <RepostIcon />
                </span>
              )}
              <Link
                to={`/profile/${encodeURIComponent(handle)}`}
                className={styles.handleLink}
                onClick={(e) => e.stopPropagation()}
              >
                @{handle}
              </Link>
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
            {repostedByHandle && (
              <span className={styles.repostedBy}>
                Reposted by{' '}
                <Link
                  to={`/profile/${encodeURIComponent(repostedByHandle)}`}
                  className={styles.handleLink}
                  onClick={(e) => e.stopPropagation()}
                >
                  @{repostedByHandle}
                </Link>
              </span>
            )}
          </div>
          {text ? (
            <p className={styles.text}>
              <PostText text={text} maxLength={80} stopPropagation />
            </p>
          ) : null}
        </div>
      </div>
    </div>
  )
}
