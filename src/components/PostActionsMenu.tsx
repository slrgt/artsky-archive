import { useRef, useState, useEffect, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { blockAccount, unblockAccount, reportPost, muteThread, deletePost, agent } from '../lib/bsky'
import { getSession } from '../lib/bsky'
import { formatRelativeTimeTitle, formatExactDateTime } from '../lib/date'
import styles from './PostActionsMenu.module.css'

const ICON_SIZE = 18

function DownloadIcon() {
  return (
    <svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 5v14m0 0l-4-4m4 4l4-4" />
    </svg>
  )
}
function LinkIcon() {
  return (
    <svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  )
}
function BackIcon() {
  return (
    <svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <line x1="19" y1="12" x2="5" y2="12" />
      <polyline points="12 19 5 12 12 5" />
    </svg>
  )
}
function BlockIcon() {
  return (
    <svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="10" />
      <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
    </svg>
  )
}
function UnblockIcon() {
  return (
    <svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M18 6L6 18M6 6l12 12" />
      <circle cx="12" cy="12" r="10" />
    </svg>
  )
}
function ReportIcon() {
  return (
    <svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
      <line x1="4" y1="22" x2="4" y2="15" />
    </svg>
  )
}
function MuteIcon() {
  return (
    <svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <line x1="23" y1="9" x2="17" y2="15" />
      <line x1="17" y1="9" x2="23" y2="15" />
    </svg>
  )
}
function TrashIcon() {
  return (
    <svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  )
}

interface PostActionsMenuProps {
  /** Post/reply URI */
  postUri: string
  postCid: string
  /** Author DID (for block) */
  authorDid: string
  /** Root post URI of the thread (for "Mute thread"). If same as postUri, this is the root post. */
  rootUri: string
  /** When true, hide "Block user" (own content) */
  isOwnPost?: boolean
  /** Called after delete (e.g. close modal) */
  onHidden?: () => void
  /** Optional class for the trigger button wrapper */
  className?: string
  /** When true, use compact styling (e.g. for comments) */
  compact?: boolean
  /** When set, show "From: {feedLabel}" at top of menu (e.g. feed name) */
  feedLabel?: string
  /** Post creation time (ISO string); when set, show relative time e.g. "Posted 2h ago" */
  postedAt?: string
  /** When this number changes, open the menu (e.g. from M key). Ignored when open/onOpenChange are used. */
  openTrigger?: number
  /** Controlled open state (when set, menu open is controlled by parent) */
  open?: boolean
  /** Called when menu should close (escape, click outside) or open (trigger click); use with open for controlled mode */
  onOpenChange?: (open: boolean) => void
  /** When true, show vertical three dots (⋮) instead of horizontal (⋯) */
  verticalIcon?: boolean
  /** Optional download action; when set with downloadLabel, show "Download …" menu item */
  onDownload?: () => void
  /** Label for download item: e.g. "Download photo", "Download photos", "Download video" */
  downloadLabel?: string
  /** When true, show loading state on the download menu item */
  downloadLoading?: boolean
  /** Optional ref to receive the dropdown DOM element (e.g. for parent to detect focus outside) */
  dropdownRef?: React.RefObject<HTMLDivElement | null>
}

export default function PostActionsMenu({
  postUri,
  postCid,
  authorDid,
  rootUri,
  isOwnPost,
  onHidden,
  className,
  compact,
  feedLabel,
  postedAt,
  openTrigger,
  open: openControlled,
  onOpenChange,
  verticalIcon,
  onDownload,
  downloadLabel,
  downloadLoading,
  dropdownRef: dropdownRefProp,
}: PostActionsMenuProps) {
  const session = getSession()
  const [openUncontrolled, setOpenUncontrolled] = useState(false)
  const [loading, setLoading] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [reportStep, setReportStep] = useState<'main' | 'reason'>('main')
  const [blockStep, setBlockStep] = useState<'idle' | 'confirm'>('idle')
  const [authorBlockingUri, setAuthorBlockingUri] = useState<string | null>(null)
  const [authorHandle, setAuthorHandle] = useState<string | null>(null)
  const feedbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const lastOpenTriggerRef = useRef<number>(0)
  /** Fixed position for portaled dropdown so it appears above the trigger and isn't clipped by overflow */
  const [dropdownPosition, setDropdownPosition] = useState<{ bottom: number; right: number } | null>(null)

  const isControlled = openControlled !== undefined && onOpenChange !== undefined
  const open = isControlled ? openControlled : openUncontrolled
  function setOpen(value: boolean) {
    if (isControlled) onOpenChange?.(value)
    else setOpenUncontrolled(value)
  }

  useEffect(() => {
    if (!open) {
      triggerRef.current?.blur()
      setReportStep('main')
      setBlockStep('idle')
      setFeedback(null)
      if (feedbackTimeoutRef.current) {
        clearTimeout(feedbackTimeoutRef.current)
        feedbackTimeoutRef.current = null
      }
    }
  }, [open])

  /* When menu opens and logged in and not own post, fetch profile to get viewer.blocking and handle */
  useEffect(() => {
    if (!open || !session?.did || isOwnPost) return
    let cancelled = false
    agent.getProfile({ actor: authorDid }).then((res) => {
      if (cancelled) return
      const data = res.data as { viewer?: { blocking?: string }; handle?: string }
      setAuthorBlockingUri(data.viewer?.blocking ?? null)
      setAuthorHandle(data.handle ?? null)
    }).catch(() => {
      if (!cancelled) {
        setAuthorBlockingUri(null)
        setAuthorHandle(null)
      }
    })
    return () => { cancelled = true }
  }, [open, session?.did, isOwnPost, authorDid])

  useEffect(() => {
    if (!isControlled && openTrigger != null && openTrigger !== lastOpenTriggerRef.current) {
      lastOpenTriggerRef.current = openTrigger
      if (triggerRef.current) {
        const rect = triggerRef.current.getBoundingClientRect()
        setDropdownPosition({
          bottom: window.innerHeight - rect.top,
          right: window.innerWidth - rect.right,
        })
      }
      setOpenUncontrolled(true)
    }
  }, [openTrigger, isControlled])

  function updateDropdownPosition() {
    if (!triggerRef.current) return null
    const rect = triggerRef.current.getBoundingClientRect()
    return {
      bottom: window.innerHeight - rect.top,
      right: window.innerWidth - rect.right,
    }
  }

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) {
      setDropdownPosition(null)
      return
    }
    setDropdownPosition(updateDropdownPosition())
  }, [open])

  /* Keep dropdown aligned with trigger when user scrolls (dropdown is position:fixed so we must update its coords) */
  useEffect(() => {
    if (!open) return
    const onScroll = () => setDropdownPosition((prev) => (prev ? updateDropdownPosition() ?? prev : prev))
    window.addEventListener('scroll', onScroll, true)
    return () => window.removeEventListener('scroll', onScroll, true)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node
      if (menuRef.current?.contains(target)) return
      if (dropdownRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  useEffect(() => {
    if (!open) return
    const dropdown = dropdownRef.current
    if (dropdown) {
      const items = dropdown.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]')
      const first = items[0]
      if (first) first.focus()
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase()
      if (key === 'escape' || key === 'q') {
        e.preventDefault()
        if (blockStep === 'confirm') {
          setBlockStep('idle')
        } else {
          setOpen(false)
          triggerRef.current?.focus()
        }
        return
      }
      if (key === '`' || key === 'm') {
        e.preventDefault()
        setOpen(false)
        triggerRef.current?.focus()
        return
      }
      if (key === 'w' || key === 's' || key === 'e' || key === 'enter' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        const dropdown = dropdownRef.current
        if (!dropdown) return
        const items = Array.from(dropdown.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]'))
        if (items.length === 0) return
        const current = document.activeElement as HTMLButtonElement | null
        const idx = current && items.includes(current) ? items.indexOf(current) : -1
        if (key === 'e' || key === 'enter') {
          e.preventDefault()
          if (idx >= 0 && !items[idx].disabled) items[idx].click()
          return
        }
        if (key === 'w' || e.key === 'ArrowUp') {
          e.preventDefault()
          const nextIdx = idx <= 0 ? items.length - 1 : idx - 1
          items[nextIdx].focus()
          return
        }
        if (key === 's' || e.key === 'ArrowDown') {
          e.preventDefault()
          const nextIdx = idx < 0 || idx >= items.length - 1 ? 0 : idx + 1
          items[nextIdx].focus()
          return
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, blockStep])

  function showSuccess(message: string) {
    setFeedback({ type: 'success', message })
    if (feedbackTimeoutRef.current) clearTimeout(feedbackTimeoutRef.current)
    feedbackTimeoutRef.current = setTimeout(() => {
      feedbackTimeoutRef.current = null
      setOpen(false)
      setFeedback(null)
    }, 1800)
  }

  function showError(message: string) {
    setFeedback({ type: 'error', message })
  }

  async function handleBlockConfirm() {
    if (!session?.did || isOwnPost) return
    setLoading('block')
    setFeedback(null)
    try {
      const { uri } = await blockAccount(authorDid)
      setAuthorBlockingUri(uri)
      setBlockStep('idle')
      showSuccess('Account blocked')
    } catch {
      showError('Could not block. Try again.')
    } finally {
      setLoading(null)
    }
  }

  async function handleUnblock() {
    if (!authorBlockingUri) return
    setLoading('unblock')
    setFeedback(null)
    try {
      await unblockAccount(authorBlockingUri)
      setAuthorBlockingUri(null)
      showSuccess('Account unblocked')
    } catch {
      showError('Could not unblock. Try again.')
    } finally {
      setLoading(null)
    }
  }

  const REPORT_REASONS: { label: string; reasonType: string }[] = [
    { label: 'Spam', reasonType: 'com.atproto.moderation.defs#reasonSpam' },
    { label: 'Harassment', reasonType: 'com.atproto.moderation.defs#reasonViolation' },
    { label: 'Misleading', reasonType: 'com.atproto.moderation.defs#reasonMisleading' },
    { label: 'Other', reasonType: 'com.atproto.moderation.defs#reasonOther' },
  ]

  async function handleReportWithReason(reasonType: string) {
    if (!session?.did) return
    setLoading('report')
    setFeedback(null)
    try {
      await reportPost(postUri, postCid, reasonType)
      showSuccess('Report sent to Bluesky')
    } catch {
      showError('Could not send report. Try again.')
    } finally {
      setLoading(null)
    }
  }

  async function handleMuteThread() {
    if (!session?.did) return
    setLoading('mute')
    setFeedback(null)
    try {
      await muteThread(rootUri)
      showSuccess('Thread muted')
    } catch {
      showError('Could not mute thread. Try again.')
    } finally {
      setLoading(null)
    }
  }

  function handleCopyLink() {
    const base = typeof window !== 'undefined' ? window.location.origin + (import.meta.env.BASE_URL || '/').replace(/\/$/, '') : ''
    const url = `${base}/post/${encodeURIComponent(postUri)}`
    navigator.clipboard.writeText(url).then(
      () => showSuccess('Link copied'),
      () => showError('Could not copy link')
    )
  }

  async function handleDelete() {
    if (!session?.did || !isOwnPost) return
    setLoading('delete')
    try {
      await deletePost(postUri)
      setOpen(false)
      onHidden?.()
    } catch {
      // leave menu open; user can retry
    } finally {
      setLoading(null)
    }
  }

  const loggedIn = !!session?.did

  return (
    <div ref={menuRef} className={`${styles.wrap} ${compact ? styles.wrapCompact : ''} ${className ?? ''}`}>
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          if (!open && triggerRef.current) {
            const rect = triggerRef.current.getBoundingClientRect()
            setDropdownPosition({
              bottom: window.innerHeight - rect.top,
              right: window.innerWidth - rect.right,
            })
          }
          setOpen(!open)
        }}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label="More options"
        title="More options"
      >
        {verticalIcon ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
            <circle cx="12" cy="4" r="2" fill="currentColor" />
            <circle cx="12" cy="12" r="2" fill="currentColor" />
            <circle cx="12" cy="20" r="2" fill="currentColor" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
            <circle cx="4" cy="12" r="2" fill="currentColor" />
            <circle cx="12" cy="12" r="2" fill="currentColor" />
            <circle cx="20" cy="12" r="2" fill="currentColor" />
          </svg>
        )}
      </button>
      {open && dropdownPosition &&
        createPortal(
          <div
            ref={(el) => {
              (dropdownRef as React.MutableRefObject<HTMLDivElement | null>).current = el
              if (dropdownRefProp) (dropdownRefProp as React.MutableRefObject<HTMLDivElement | null>).current = el
            }}
            className={`${styles.dropdown} ${styles.dropdownFixed} ${compact ? styles.dropdownCompact : ''}`}
            style={{
              position: 'fixed',
              bottom: dropdownPosition.bottom,
              right: dropdownPosition.right,
            }}
            role="menu"
          >
            {feedLabel ? (
            <div className={styles.feedLabel} role="presentation">From: {feedLabel}</div>
          ) : null}
            {postedAt ? (
            <div className={styles.postedAt} role="presentation" title={formatExactDateTime(postedAt)}>
              Posted {formatRelativeTimeTitle(postedAt)}
            </div>
          ) : null}
          {feedback ? (
            <div className={feedback.type === 'success' ? styles.feedbackSuccess : styles.feedbackError} role="status">
              {feedback.message}
            </div>
          ) : !loggedIn ? (
            <>
              {onDownload && downloadLabel && (
                <button
                  type="button"
                  className={styles.item}
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDownload() }}
                  disabled={downloadLoading}
                  role="menuitem"
                >
                  <span className={styles.itemIcon}>{downloadLoading ? '…' : <DownloadIcon />}</span>
                  {downloadLoading ? '' : downloadLabel}
                </button>
              )}
              <button
                type="button"
                className={styles.item}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleCopyLink() }}
                role="menuitem"
              >
                <span className={styles.itemIcon}><LinkIcon /></span>
                Copy link to post
              </button>
            </>
          ) : blockStep === 'confirm' ? (
            <>
              <button
                type="button"
                className={styles.item}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setBlockStep('idle') }}
                role="menuitem"
              >
                <span className={styles.itemIcon}><BackIcon /></span>
                Back
              </button>
              <div className={styles.reportReasonLabel}>
                Block {authorHandle ? `@${authorHandle}` : 'this user'}?
              </div>
              <button
                type="button"
                className={styles.item}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleBlockConfirm() }}
                disabled={loading === 'block'}
                role="menuitem"
              >
                <span className={styles.itemIcon}>{loading === 'block' ? '…' : <BlockIcon />}</span>
                {loading === 'block' ? '' : 'Yes, block'}
              </button>
            </>
          ) : reportStep === 'reason' ? (
            <>
              <button
                type="button"
                className={styles.item}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setReportStep('main') }}
                role="menuitem"
              >
                <span className={styles.itemIcon}><BackIcon /></span>
                Back
              </button>
              <div className={styles.reportReasonLabel}>Report to Bluesky</div>
              {REPORT_REASONS.map(({ label, reasonType }) => (
                <button
                  key={reasonType}
                  type="button"
                  className={styles.item}
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleReportWithReason(reasonType) }}
                  disabled={loading === 'report'}
                  role="menuitem"
                >
                  <span className={styles.itemIcon}>{loading === 'report' ? '…' : <ReportIcon />}</span>
                  {loading === 'report' ? '' : label}
                </button>
              ))}
            </>
          ) : (
            <>
              {isOwnPost && (
                <button
                  type="button"
                  className={styles.item}
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDelete() }}
                  disabled={loading === 'delete'}
                  role="menuitem"
                >
                  <span className={styles.itemIcon}>{loading === 'delete' ? '…' : <TrashIcon />}</span>
                  {loading === 'delete' ? '' : 'Delete post'}
                </button>
              )}
              {!isOwnPost && (
                authorBlockingUri ? (
                  <button
                    type="button"
                    className={styles.item}
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleUnblock() }}
                    disabled={loading === 'unblock'}
                    role="menuitem"
                  >
                    <span className={styles.itemIcon}>{loading === 'unblock' ? '…' : <UnblockIcon />}</span>
                    {loading === 'unblock' ? '' : 'Unblock account'}
                  </button>
                ) : (
                  <button
                    type="button"
                    className={styles.item}
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setBlockStep('confirm') }}
                    role="menuitem"
                  >
                    <span className={styles.itemIcon}><BlockIcon /></span>
                    Block user
                  </button>
                )
              )}
              <button
                type="button"
                className={styles.item}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setReportStep('reason') }}
                role="menuitem"
              >
                <span className={styles.itemIcon}><ReportIcon /></span>
                Report post
              </button>
              <button
                type="button"
                className={styles.item}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleMuteThread() }}
                disabled={loading === 'mute'}
                role="menuitem"
              >
                <span className={styles.itemIcon}>{loading === 'mute' ? '…' : <MuteIcon />}</span>
                {loading === 'mute' ? '' : 'Mute thread'}
              </button>
              {onDownload && downloadLabel && (
                <button
                  type="button"
                  className={styles.item}
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDownload() }}
                  disabled={downloadLoading}
                  role="menuitem"
                >
                  <span className={styles.itemIcon}>{downloadLoading ? '…' : <DownloadIcon />}</span>
                  {downloadLoading ? '' : downloadLabel}
                </button>
              )}
              <button
                type="button"
                className={styles.item}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleCopyLink() }}
                role="menuitem"
              >
                <span className={styles.itemIcon}><LinkIcon /></span>
                Copy link to post
              </button>
            </>
          )}
          </div>,
          document.body
        )
      }
    </div>
  )
}
