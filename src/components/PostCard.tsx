import { useRef, useEffect, useState, useCallback, useLayoutEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import Hls from 'hls.js'
import { getPostMediaInfoForDisplay, getPostAllMediaForDisplay, getPostMediaUrlForDisplay, agent, type TimelineItem } from '../lib/bsky'
import { getArtboards, createArtboard, addPostToArtboard, isPostInArtboard, isPostInAnyArtboard, getArtboard } from '../lib/artboards'
import { putArtboardOnPds } from '../lib/artboardsPds'
import { useSession } from '../context/SessionContext'
import { useLoginModal } from '../context/LoginModalContext'
import { useArtOnly } from '../context/ArtOnlyContext'
import { useModeration } from '../context/ModerationContext'
import { formatRelativeTime, formatExactDateTime } from '../lib/date'
import { downloadImageWithHandle, downloadVideoWithPostUri } from '../lib/downloadImage'
import PostText from './PostText'
import ProfileLink from './ProfileLink'
import PostActionsMenu from './PostActionsMenu'
import styles from './PostCard.module.css'

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
  /** Called when like state changes from double-tap (so parent can sync likeOverrides); likeRecordUri null = unliked */
  onLikedChange?: (postUri: string, likeRecordUri: string | null) => void
  /** When true, card is marked as seen (e.g. scrolled past); shown darkened */
  seen?: boolean
  /** Called when the ... actions menu opens or closes (for parent to track which card's menu is open) */
  onActionsMenuOpenChange?: (open: boolean) => void
  /** Index of the card (for parent to signal close when focus moves to another card via A/D) */
  cardIndex?: number
  /** Index of the card whose ... menu is currently open (null = none); when this is not cardIndex, this card closes its menu */
  actionsMenuOpenForIndex?: number | null
  /** Index of the focused media within this post (for multi-image keyboard nav); undefined = whole card focused */
  focusedMediaIndex?: number
  /** Called with (mediaIndex, element) so parent can scroll the focused media into view */
  onMediaRef?: (mediaIndex: number, el: HTMLElement | null) => void
}

const REASON_PIN = 'app.bsky.feed.defs#reasonPin'

function RepostIcon() {
  return (
    <svg className={styles.repostIcon} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z" />
    </svg>
  )
}

function PinIcon() {
  return (
    <svg className={styles.pinIcon} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z" />
    </svg>
  )
}

function CollectIcon() {
  return (
    <svg className={styles.collectIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </svg>
  )
}

function DownloadIcon() {
  return (
    <svg className={styles.downloadIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 5v14m0 0l-4-4m4 4l4-4" />
    </svg>
  )
}

function isHlsUrl(url: string): boolean {
  return /\.m3u8(\?|$)/i.test(url) || url.includes('m3u8')
}

export default function PostCard({ item, isSelected, cardRef: cardRefProp, addButtonRef: _addButtonRef, openAddDropdown, onAddClose, onPostClick, onAspectRatio, fillCell, nsfwBlurred, onNsfwUnblur, constrainMediaHeight, likedUriOverride, onLikedChange, seen, onActionsMenuOpenChange, cardIndex, actionsMenuOpenForIndex, focusedMediaIndex, onMediaRef }: Props) {
  const navigate = useNavigate()
  const { session } = useSession()
  const { openLoginModal } = useLoginModal()
  const { artOnly, minimalist } = useArtOnly()
  const { unblurredUris, setUnblurred } = useModeration()
  const videoRef = useRef<HTMLVideoElement>(null)
  const mediaWrapRef = useRef<HTMLDivElement>(null)
  const hlsRef = useRef<Hls | null>(null)
  const { post, reason } = item as { post: typeof item.post; reason?: { $type?: string; by?: { handle?: string; did?: string } } }
  const feedSource = (item as { _feedSource?: { kind?: string; label?: string } })._feedSource
  const feedLabel = feedSource?.label ?? (feedSource?.kind === 'timeline' ? 'Following' : undefined)
  const media = getPostMediaInfoForDisplay(post)
  const hasMedia = !!media
  const text = (post.record as { text?: string })?.text ?? ''
  const embed = post.embed as { $type?: string; uri?: string; title?: string; description?: string; thumb?: string } | undefined
  const externalLink = (() => {
    if (embed?.$type !== 'app.bsky.embed.external#view' || !embed.uri) return null
    let displayTitle = embed.title?.trim() ?? ''
    if (!displayTitle) {
      try { displayTitle = new URL(embed.uri).hostname } catch { displayTitle = embed.uri }
    }
    return { uri: embed.uri, title: displayTitle, description: embed.description ?? '', thumb: embed.thumb }
  })()
  const handle = post.author.handle ?? post.author.did
  const repostedByHandle = reason?.by ? (reason.by.handle ?? reason.by.did) : null
  const isPinned = reason?.$type === REASON_PIN
  const authorViewer = (post.author as { viewer?: { following?: string } }).viewer
  const initialFollowingUri = authorViewer?.following
  const [followUriOverride, setFollowUriOverride] = useState<string | null>(initialFollowingUri ?? null)
  const effectiveFollowingUri = followUriOverride ?? initialFollowingUri ?? null
  const isFollowingAuthor = !!effectiveFollowingUri
  const isOwnPost = session?.did === post.author.did
  const [followLoading, setFollowLoading] = useState(false)
  const postViewer = (post as { viewer?: { like?: string } }).viewer
  const initialLikedUri = postViewer?.like
  const [likedUri, setLikedUri] = useState<string | undefined>(initialLikedUri)
  const [likeLoading, setLikeLoading] = useState(false)
  const [downloadLoading, setDownloadLoading] = useState(false)
  const effectiveLikedUri = likedUriOverride !== undefined ? (likedUriOverride ?? undefined) : likedUri
  const isLiked = !!effectiveLikedUri
  const inAnyArtboard = isPostInAnyArtboard(post.uri)
  const showTransFlagOutline = isLiked && inAnyArtboard

  const [mediaAspect, setMediaAspect] = useState<number | null>(() =>
    hasMedia && media?.aspectRatio != null ? media.aspectRatio : null
  )
  const [addOpen, setAddOpen] = useState(false)
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false)
  const actionsMenuDropdownRef = useRef<HTMLDivElement>(null)
  const [addToBoardIds, setAddToBoardIds] = useState<Set<string>>(new Set())
  const [newBoardName, setNewBoardName] = useState('')
  const addRef = useRef<HTMLDivElement>(null)
  const addRefMobile = useRef<HTMLDivElement>(null)
  const addBtnRef = useRef<HTMLButtonElement>(null)
  const addDropdownRef = useRef<HTMLDivElement>(null)
  const [addDropdownPosition, setAddDropdownPosition] = useState<{ bottom: number; left: number } | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const prevSelectedRef = useRef(isSelected)
  const lastTapRef = useRef(0)
  const didDoubleTapRef = useRef(false)
  const touchSessionRef = useRef(false)
  const openDelayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const touchStartRef = useRef<{ x: number; y: number } | null>(null)
  /* Close ... menu when parent says focus moved to another card (e.g. A/D) */
  useEffect(() => {
    if (cardIndex == null) return
    if (actionsMenuOpenForIndex === cardIndex) return
    if (actionsMenuOpen) setActionsMenuOpen(false)
  }, [actionsMenuOpenForIndex, cardIndex, actionsMenuOpen])

  /* Open ... menu when parent requests it (e.g. M key on focused card) */
  const prevActionsMenuOpenForIndexRef = useRef<number | null>(null)
  useEffect(() => {
    if (cardIndex == null) return
    if (actionsMenuOpenForIndex === cardIndex && prevActionsMenuOpenForIndexRef.current !== cardIndex) {
      setActionsMenuOpen(true)
    }
    prevActionsMenuOpenForIndexRef.current = actionsMenuOpenForIndex ?? null
  }, [actionsMenuOpenForIndex, cardIndex])

  /* Close ... menu when focus, pointer, or mouse goes to another item (e.g. another card) */
  useEffect(() => {
    if (!actionsMenuOpen) return
    const isOutside = (target: Node | null) => {
      if (!target) return true
      if (cardRef.current?.contains(target)) return false
      if (actionsMenuDropdownRef.current?.contains(target)) return false
      return true
    }
    const onFocusIn = (e: FocusEvent) => {
      if (isOutside(e.target as Node)) setActionsMenuOpen(false)
    }
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      const target = (e as MouseEvent).target ?? (e as TouchEvent).target
      if (isOutside(target as Node)) setActionsMenuOpen(false)
    }
    const onMouseOver = (e: MouseEvent) => {
      if (isOutside(e.target as Node)) setActionsMenuOpen(false)
    }
    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('touchstart', onPointerDown, { passive: true })
    document.addEventListener('mouseover', onMouseOver)
    return () => {
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('touchstart', onPointerDown)
      document.removeEventListener('mouseover', onMouseOver)
    }
  }, [actionsMenuOpen])

  useEffect(() => {
    if (likedUriOverride !== undefined) {
      setLikedUri(likedUriOverride ?? undefined)
    } else {
      setLikedUri(initialLikedUri)
    }
  }, [post.uri, initialLikedUri, likedUriOverride])

  useEffect(() => {
    setFollowUriOverride(initialFollowingUri ?? null)
  }, [post.uri, initialFollowingUri])

  async function handleFollowClick(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (followLoading || isOwnPost || !session?.did || isFollowingAuthor) return
    setFollowLoading(true)
    try {
      const res = await agent.follow(post.author.did)
      setFollowUriOverride(res.uri)
    } catch {
      // leave state unchanged
    } finally {
      setFollowLoading(false)
    }
  }

  async function handleLikeClick(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (!session?.did) {
      openLoginModal()
      return
    }
    if (likeLoading) return
    const wasLiked = !!effectiveLikedUri
    const previousLikedUri = effectiveLikedUri || undefined
    setLikeLoading(true)
    if (wasLiked) {
      setLikedUri(undefined)
    } else {
      setLikedUri('pending')
    }
    try {
      if (wasLiked) {
        await agent.deleteLike(previousLikedUri!)
        setLikedUri(undefined)
      } else {
        const res = await agent.like(post.uri, post.cid)
        setLikedUri(res.uri)
      }
    } catch {
      setLikedUri(previousLikedUri)
    } finally {
      setLikeLoading(false)
    }
  }

  async function handleDownload() {
    if (!hasMedia || downloadLoading) return
    if (isVideo && media?.videoPlaylist) {
      setDownloadLoading(true)
      try {
        await downloadVideoWithPostUri(media.videoPlaylist, post.uri)
      } finally {
        setDownloadLoading(false)
      }
      return
    }
    if (hasImage && imageItems.length > 0) {
      setDownloadLoading(true)
      try {
        for (let i = 0; i < imageItems.length; i++) {
          const url = imageItems[i]?.url
          if (url) await downloadImageWithHandle(url, handle, post.uri, imageItems.length > 1 ? i : undefined)
        }
      } finally {
        setDownloadLoading(false)
      }
    }
  }

  useEffect(() => {
    if (openAddDropdown) setAddOpen(true)
  }, [openAddDropdown])

  useEffect(() => {
    return () => {
      if (openDelayTimerRef.current) {
        clearTimeout(openDelayTimerRef.current)
        openDelayTimerRef.current = null
      }
    }
  }, [])

  const prevAddOpenRef = useRef(addOpen)
  useEffect(() => {
    if (prevAddOpenRef.current && !addOpen) onAddClose?.()
    prevAddOpenRef.current = addOpen
  }, [addOpen, onAddClose])

  const updateAddDropdownPosition = useCallback(() => {
    if (!addRef.current) return null
    const rect = addRef.current.getBoundingClientRect()
    return {
      bottom: window.innerHeight - rect.top,
      left: rect.left + rect.width / 2,
    }
  }, [])

  useLayoutEffect(() => {
    if (!addOpen || !addRef.current) {
      setAddDropdownPosition(null)
      return
    }
    setAddDropdownPosition(updateAddDropdownPosition())
  }, [addOpen, updateAddDropdownPosition])

  useEffect(() => {
    if (!addOpen) return
    const onScroll = () => setAddDropdownPosition((prev) => (prev ? updateAddDropdownPosition() ?? prev : prev))
    window.addEventListener('scroll', onScroll, true)
    return () => window.removeEventListener('scroll', onScroll, true)
  }, [addOpen, updateAddDropdownPosition])

  useEffect(() => {
    if (!addOpen) return
    function onDocClick(e: MouseEvent) {
      const target = e.target as Node
      if (addRef.current?.contains(target) || addRefMobile.current?.contains(target)) return
      if (addDropdownRef.current?.contains(target)) return
      setAddOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [addOpen])

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
    const mediaUrl = getPostMediaUrlForDisplay(post)
    const allMedia = getPostAllMediaForDisplay(post)
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
  const allMedia = getPostAllMediaForDisplay(post)
  const imageItems = allMedia.filter((m) => m.type === 'image')
  const hasImage = imageItems.length > 0
  /** Indices in allMedia for each image (for onMediaRef / focusedMediaIndex when multi-image) */
  const imageMediaIndices = useMemo(
    () => allMedia.map((m, i) => (m.type === 'image' ? i : -1)).filter((i): i is number => i >= 0),
    [allMedia]
  )
  const currentImageUrl = isMultipleImages && imageItems.length ? imageItems[0]?.url : (media?.url ?? '')

  const handleImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget
    if (!img.naturalWidth || !img.naturalHeight) return
    /* For multi-image posts, set aspect only once (from whichever image loads first)
       so the container doesn't resize when cycling – keeps prev/next arrow positions fixed. */
    if (isMultipleImages) {
      setMediaAspect((prev) => (prev != null ? prev : img.naturalWidth! / img.naturalHeight!))
      return
    }
    /* Don't overwrite when we already have API aspect – avoids layout shift when image loads */
    setMediaAspect((prev) => (prev != null ? prev : img.naturalWidth / img.naturalHeight))
  }, [isMultipleImages])

  useEffect(() => {
    if (!hasMedia) return
    if (media?.aspectRatio != null) setMediaAspect((prev) => prev ?? media.aspectRatio!)
    else if (!isVideo) setMediaAspect((prev) => prev ?? null)
  }, [hasMedia, media?.aspectRatio, media?.videoPlaylist, isVideo])

  /* When post changes (e.g. virtualized list), reset aspect to new post's so reserved size is correct */
  useEffect(() => {
    if (!hasMedia) setMediaAspect(null)
    else if (media?.aspectRatio != null) setMediaAspect(media.aspectRatio)
    else if (!isVideo) setMediaAspect(null)
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

  /* Unblur NSFW when this card gains focus; reblur when it loses selection. Reused across feed, profile, tag, popups. */
  useEffect(() => {
    const wasSelected = prevSelectedRef.current
    prevSelectedRef.current = isSelected
    if (isSelected && nsfwBlurred && onNsfwUnblur) {
      onNsfwUnblur()
    }
    if (wasSelected && !isSelected && unblurredUris.has(post.uri)) {
      setUnblurred(post.uri, false)
    }
  }, [isSelected, post.uri, unblurredUris, setUnblurred, nsfwBlurred, onNsfwUnblur])

  /* Reblur NSFW when focus leaves the card (click/tab outside). focusout bubbles so we listen on the card root. */
  useEffect(() => {
    const el = cardRef.current
    if (!el || !unblurredUris.has(post.uri)) return
    const onFocusOut = (e: FocusEvent) => {
      const next = e.relatedTarget as Node | null
      if (next != null && el.contains(next)) return
      setUnblurred(post.uri, false)
    }
    el.addEventListener('focusout', onFocusOut)
    return () => el.removeEventListener('focusout', onFocusOut)
  }, [post.uri, unblurredUris, setUnblurred])

  /* Reblur NSFW when media scrolls out of view. */
  useEffect(() => {
    if (!hasMedia || !unblurredUris.has(post.uri) || !mediaWrapRef.current) return
    const el = mediaWrapRef.current
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        if (!entry || entry.intersectionRatio > 0) return
        setUnblurred(post.uri, false)
      },
      { threshold: 0, rootMargin: '0px' }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [hasMedia, post.uri, unblurredUris, setUnblurred])

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
    if (didDoubleTapRef.current) {
      didDoubleTapRef.current = false
      e.preventDefault()
      e.stopPropagation()
      return
    }
    /* On touch devices the synthetic click fires ~300ms after touchEnd; we delay open by 400ms so double-tap can register. Ignore this click and let the timer open. */
    if (touchSessionRef.current) return
    if (onPostClick) {
      onPostClick(post.uri)
    } else {
      navigate(`/post/${encodeURIComponent(post.uri)}`)
    }
  }

  function openPost() {
    if (onPostClick) onPostClick(post.uri)
    else navigate(`/post/${encodeURIComponent(post.uri)}`)
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
    <div ref={setCardRef} data-post-uri={post.uri} className={`${styles.card} ${isSelected ? styles.cardSelected : ''} ${showTransFlagOutline ? styles.cardTransFlag : ''} ${!showTransFlagOutline && isLiked ? styles.cardLiked : ''} ${!showTransFlagOutline && inAnyArtboard ? styles.cardInArtboard : ''} ${seen && !isSelected ? styles.cardSeen : ''} ${fillCell ? styles.cardFillCell : ''} ${artOnly ? styles.cardArtOnly : ''} ${minimalist ? styles.cardMinimalist : ''}`}>
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
        onTouchStart={(e) => {
          touchSessionRef.current = true
          const t = e.touches[0]
          touchStartRef.current = t ? { x: t.clientX, y: t.clientY } : null
        }}
        onTouchEnd={(e) => {
          const start = touchStartRef.current
          touchStartRef.current = null
          const end = e.changedTouches[0]
          const moved =
            start && end
              ? Math.hypot(end.clientX - start.x, end.clientY - start.y)
              : 0
          const isScroll = moved > 12
          if (isScroll) {
            if (openDelayTimerRef.current) {
              clearTimeout(openDelayTimerRef.current)
              openDelayTimerRef.current = null
            }
            touchSessionRef.current = false
            return
          }
          const now = Date.now()
          if (now - lastTapRef.current < 400) {
            lastTapRef.current = 0
            didDoubleTapRef.current = true
            if (openDelayTimerRef.current) {
              clearTimeout(openDelayTimerRef.current)
              openDelayTimerRef.current = null
            }
            e.preventDefault()
            if (effectiveLikedUri) {
              setLikedUri(undefined)
              agent.deleteLike(effectiveLikedUri).then(() => {
                onLikedChange?.(post.uri, null)
              }).catch(() => setLikedUri(effectiveLikedUri))
            } else {
              setLikedUri('pending')
              agent.like(post.uri, post.cid).then((res) => {
                setLikedUri(res.uri)
                onLikedChange?.(post.uri, res.uri)
              }).catch(() => setLikedUri(undefined))
            }
            setTimeout(() => { touchSessionRef.current = false }, 500)
          } else {
            lastTapRef.current = now
            if (openDelayTimerRef.current) clearTimeout(openDelayTimerRef.current)
            openDelayTimerRef.current = setTimeout(() => {
              openDelayTimerRef.current = null
              touchSessionRef.current = false
              openPost()
            }, 400)
          }
        }}
      >
        <div
          ref={(el) => {
            ;(mediaWrapRef as React.MutableRefObject<HTMLDivElement | null>).current = el
            if (onMediaRef && hasMedia && !(isMultipleImages && imageItems.length > 1)) onMediaRef(0, el)
          }}
          className={`${styles.mediaWrap} ${fillCell ? styles.mediaWrapFillCell : ''} ${constrainMediaHeight ? styles.mediaWrapConstrained : ''} ${isMultipleImages && imageItems.length > 1 ? styles.mediaWrapMultiStack : ''}`}
          style={
            fillCell || constrainMediaHeight ||
            (isMultipleImages && imageItems.length > 1)
              ? undefined
              : {
                  aspectRatio:
                    !hasMedia ? '1' : mediaAspect != null ? String(mediaAspect) : isVideo ? '1' : undefined,
                }
          }
          onMouseEnter={onMediaEnter}
          onMouseLeave={onMediaLeave}
        >
          {!hasMedia ? (
            <div className={styles.textOnlyPreview}>
              {text ? (
                <div className={styles.textOnlyPreviewText} onClick={(e) => { e.stopPropagation(); handleCardClick(e); }}>
                  <PostText
                    text={text}
                    facets={(post.record as { facets?: unknown[] })?.facets}
                    maxLength={160}
                    stopPropagation
                    interactive={false}
                  />
                </div>
              ) : null}
              {externalLink ? (
                <a
                  href={externalLink.uri}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.textOnlyPreviewLink}
                  onClick={(e) => e.stopPropagation()}
                >
                  {externalLink.thumb ? (
                    <img src={externalLink.thumb} alt="" className={styles.textOnlyPreviewLinkThumb} loading="lazy" />
                  ) : null}
                  <span className={styles.textOnlyPreviewLinkTitle}>{externalLink.title}</span>
                  {externalLink.description ? (
                    <span className={styles.textOnlyPreviewLinkDesc}>{externalLink.description}</span>
                  ) : null}
                </a>
              ) : null}
              {!text && !externalLink ? (
                <span className={styles.textOnlyPreviewEmpty}>Text post</span>
              ) : null}
            </div>
          ) : isVideo ? (
            <div className={styles.mediaVideoWrap}>
              <video
                ref={videoRef}
                className={styles.media}
                poster={media!.url || undefined}
                muted
                playsInline
                loop
                preload="metadata"
                onLoadedMetadata={(e) => {
                  const v = e.currentTarget
                  if (!v.videoWidth || !v.videoHeight) return
                  /* Set aspect once from video dimensions so vertical/landscape scale correctly; don't overwrite if already set (e.g. from API). */
                  setMediaAspect((prev) => (prev != null ? prev : v.videoWidth / v.videoHeight))
                }}
              />
            </div>
          ) : isMultipleImages && imageItems.length > 1 ? (
            <>
              {/* Spacer height = sum of each image's height at full width so all images fit without cropping */}
                {(() => {
                  const totalInverseAspect = imageItems.reduce((s, m) => s + 1 / (m.aspectRatio || 1), 0)
                  const combinedAspect = 1 / totalInverseAspect
                  return (
                    <div className={styles.mediaWrapGridSpacer} style={{ aspectRatio: String(combinedAspect) }} aria-hidden />
                  )
                })()}
                <div className={styles.mediaWrapGrid}>
                  <div className={styles.mediaGrid} style={{ minHeight: 0 }}>
                    {imageItems.map((imgItem, idx) => {
                      const mediaIndex = imageMediaIndices[idx] ?? idx
                      const isFocused = focusedMediaIndex === mediaIndex
                      return (
                        <div
                          key={idx}
                          ref={(el) => onMediaRef?.(mediaIndex, el)}
                          className={`${styles.mediaGridCell} ${isFocused ? styles.mediaGridCellFocused : ''}`}
                          style={{ flex: `${1 / (imgItem.aspectRatio || 1)} 1 0` }}
                        >
                          <img
                            src={imgItem.url}
                            alt=""
                            className={styles.mediaGridImg}
                            loading="lazy"
                            onLoad={idx === 0 ? handleImageLoad : undefined}
                          />
                        </div>
                      )
                    })}
                  </div>
                </div>
            </>
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
                openPost()
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onNsfwUnblur()
                  openPost()
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
        {(!artOnly || minimalist) && (
        <div className={styles.meta}>
          <div className={styles.cardActionRow} onClick={(e) => e.stopPropagation()}>
            {(hasImage || isVideo) && (
              <div className={styles.cardActionRowLeft}>
                <button
                  type="button"
                  className={styles.cardDownloadBtn}
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    handleDownload()
                  }}
                  disabled={downloadLoading}
                  title={isVideo ? 'Download video' : 'Download image (with @handle)'}
                  aria-label={isVideo ? 'Download video' : 'Download image'}
                >
                  {downloadLoading ? '…' : <DownloadIcon />}
                </button>
              </div>
            )}
            <div className={styles.cardActionRowCenter}>
              <div
                className={`${styles.addWrap} ${addOpen ? styles.addWrapOpen : ''}`}
                ref={addRef}
              >
                <button
                  ref={addBtnRef}
                  type="button"
                  className={`${styles.addToBoardBtn} ${inAnyArtboard ? styles.addToBoardBtnInCollection : ''}`}
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    if (!session?.did) {
                      openLoginModal()
                      return
                    }
                    setAddOpen((o) => !o)
                  }}
                  aria-label="Collect"
                  aria-expanded={addOpen}
                >
                  <CollectIcon />
                </button>
                {addOpen && addDropdownPosition &&
                  createPortal(
                    <div
                      ref={addDropdownRef}
                      className={`${styles.addDropdown} ${styles.addDropdownFixed}`}
                      style={{
                        position: 'fixed',
                        bottom: addDropdownPosition.bottom,
                        left: addDropdownPosition.left,
                        transform: 'translateX(-50%)',
                        zIndex: 1001,
                      }}
                    >
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
                    </div>,
                    document.body
                  )}
              </div>
              {post.author.avatar && (
                isOwnPost || !session || isFollowingAuthor ? (
                  <ProfileLink
                    handle={handle}
                    className={styles.cardActionRowAvatar}
                    onClick={(e) => e.stopPropagation()}
                    aria-label={`View @${handle} profile`}
                  >
                    <img src={post.author.avatar} alt="" loading="lazy" />
                  </ProfileLink>
                ) : (
                  <button
                    type="button"
                    className={`${styles.cardActionRowAvatar} ${styles.cardActionRowAvatarFollow}`}
                    onClick={handleFollowClick}
                    disabled={followLoading}
                    aria-label={`Follow @${handle}`}
                    title={`Follow @${handle}`}
                  >
                    <img src={post.author.avatar} alt="" loading="lazy" />
                    <span className={styles.cardActionRowAvatarPlus} aria-hidden>
                      <svg viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M4 2v4M2 4h4" />
                      </svg>
                    </span>
                  </button>
                )
              )}
              <button
                type="button"
                className={`${styles.cardLikeRepostBtn} ${isLiked ? styles.cardLikeRepostBtnActive : ''}`}
                onClick={handleLikeClick}
                disabled={likeLoading}
                title={isLiked ? 'Remove like' : 'Like'}
                aria-label={isLiked ? 'Remove like' : 'Like'}
              >
                {isLiked ? '♥' : '♡'}
              </button>
            </div>
            <div className={styles.cardActionRowRight}>
              <PostActionsMenu
                postUri={post.uri}
                postCid={post.cid}
                authorDid={post.author.did}
                rootUri={post.uri}
                isOwnPost={isOwnPost}
                compact
                verticalIcon
                className={styles.cardActionsMenu}
                open={actionsMenuOpen}
                onOpenChange={(open) => {
                  setActionsMenuOpen(open)
                  onActionsMenuOpenChange?.(open)
                }}
                dropdownRef={actionsMenuDropdownRef}
                feedLabel={feedLabel}
                postedAt={(post.record as { createdAt?: string })?.createdAt}
                onDownload={hasMedia ? handleDownload : undefined}
                downloadLabel={hasMedia ? (isVideo ? 'Download video' : isMultipleImages ? 'Download photos' : 'Download photo') : undefined}
                downloadLoading={downloadLoading}
              />
            </div>
          </div>
          {!minimalist && (
          <div className={styles.handleBlock}>
            <div className={styles.handleRow}>
              {post.author.avatar ? (
                <img src={post.author.avatar} alt="" className={styles.authorAvatar} loading="lazy" />
              ) : post.author.did ? (
                <span className={styles.authorAvatarPlaceholder} aria-hidden>
                  {(handle || post.author.did).slice(0, 1).toUpperCase()}
                </span>
              ) : null}
              <span className={styles.handleRowMain}>
                <span className={effectiveLikedUri ? styles.handleLinkWrapLiked : styles.handleLinkWrap}>
                  <ProfileLink
                    handle={handle}
                    className={styles.handleLink}
                    onClick={(e) => e.stopPropagation()}
                  >
                    @{handle}
                  </ProfileLink>
                </span>
                {repostedByHandle && (
                  <span
                    className={styles.repostIconLink}
                    role="button"
                    tabIndex={0}
                    title={`Reposted by @${repostedByHandle}`}
                    aria-label={`Reposted by @${repostedByHandle}`}
                    onClick={(e) => { e.stopPropagation(); handleCardClick(e); }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        openPost()
                      }
                    }}
                  >
                    <RepostIcon />
                  </span>
                )}
              </span>
              <span className={styles.handleRowMeta}>
                {isPinned && (
                  <span className={styles.pinIconWrap} title="Pinned">
                    <PinIcon />
                  </span>
                )}
                {(post.record as { createdAt?: string })?.createdAt && (
                  <span className={styles.postTime} title={formatExactDateTime((post.record as { createdAt: string }).createdAt)}>
                    {formatRelativeTime((post.record as { createdAt: string }).createdAt)}
                  </span>
                )}
              </span>
            </div>
          </div>
          )}
          {!minimalist && hasMedia && text ? (
            <p className={styles.text} onClick={(e) => { e.stopPropagation(); handleCardClick(e); }}>
              <PostText text={text} facets={(post.record as { facets?: unknown[] })?.facets} maxLength={80} stopPropagation interactive={false} />
            </p>
          ) : null}
        </div>
        )}
      </div>
    </div>
  )
}
