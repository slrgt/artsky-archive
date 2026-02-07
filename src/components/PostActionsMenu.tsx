import { useRef, useState, useEffect } from 'react'
import { blockAccount, reportPost, muteThread, deletePost } from '../lib/bsky'
import { getSession } from '../lib/bsky'
import { useHiddenPosts } from '../context/HiddenPostsContext'
import styles from './PostActionsMenu.module.css'

interface PostActionsMenuProps {
  /** Post/reply URI */
  postUri: string
  postCid: string
  /** Author DID (for block) */
  authorDid: string
  /** Root post URI of the thread (for "Mute thread"). If same as postUri, this is the root post. */
  rootUri: string
  /** When true, hide "Block account" (own content) */
  isOwnPost?: boolean
  /** Called after hide (e.g. close modal or remove from view) */
  onHidden?: () => void
  /** Optional class for the trigger button wrapper */
  className?: string
  /** When true, use compact styling (e.g. for comments) */
  compact?: boolean
  /** When set, show "From: {feedLabel}" at top of menu (e.g. feed name) */
  feedLabel?: string
  /** When this number changes, open the menu (e.g. from M key). Ignored when open/onOpenChange are used. */
  openTrigger?: number
  /** Controlled open state (when set, menu open is controlled by parent) */
  open?: boolean
  /** Called when menu should close (escape, click outside) or open (trigger click); use with open for controlled mode */
  onOpenChange?: (open: boolean) => void
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
  openTrigger,
  open: openControlled,
  onOpenChange,
}: PostActionsMenuProps) {
  const session = getSession()
  const { addHidden } = useHiddenPosts()
  const [openUncontrolled, setOpenUncontrolled] = useState(false)
  const [loading, setLoading] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [reportStep, setReportStep] = useState<'main' | 'reason'>('main')
  const feedbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const lastOpenTriggerRef = useRef<number>(0)

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
      setFeedback(null)
      if (feedbackTimeoutRef.current) {
        clearTimeout(feedbackTimeoutRef.current)
        feedbackTimeoutRef.current = null
      }
    }
  }, [open])

  useEffect(() => {
    if (!isControlled && openTrigger != null && openTrigger !== lastOpenTriggerRef.current) {
      lastOpenTriggerRef.current = openTrigger
      setOpenUncontrolled(true)
    }
  }, [openTrigger, isControlled])

  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent) => {
      if (menuRef.current?.contains(e.target as Node)) return
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
        setOpen(false)
        return
      }
      if (key === 'w' || key === 's' || key === 'e' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        const dropdown = dropdownRef.current
        if (!dropdown) return
        const items = Array.from(dropdown.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]'))
        if (items.length === 0) return
        const current = document.activeElement as HTMLButtonElement | null
        const idx = current && items.includes(current) ? items.indexOf(current) : -1
        if (key === 'e') {
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
  }, [open])

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

  async function handleBlock() {
    if (!session?.did || isOwnPost) return
    setLoading('block')
    setFeedback(null)
    try {
      await blockAccount(authorDid)
      showSuccess('Account blocked')
    } catch {
      showError('Could not block. Try again.')
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

  function handleHide() {
    addHidden(postUri)
    setOpen(false)
    onHidden?.()
  }

  async function handleDelete() {
    if (!session?.did || !isOwnPost) return
    setLoading('delete')
    try {
      await deletePost(postUri)
      addHidden(postUri)
      setOpen(false)
      onHidden?.()
    } catch {
      // leave menu open; user can retry
    } finally {
      setLoading(null)
    }
  }

  if (!session?.did) return null

  return (
    <div ref={menuRef} className={`${styles.wrap} ${compact ? styles.wrapCompact : ''} ${className ?? ''}`}>
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setOpen(!open)
        }}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label="More options"
        title="More options"
      >
        ⋯
      </button>
      {open && (
        <div ref={dropdownRef} className={styles.dropdown} role="menu">
          {feedLabel ? (
            <div className={styles.feedLabel} role="presentation">From: {feedLabel}</div>
          ) : null}
          {feedback ? (
            <div className={feedback.type === 'success' ? styles.feedbackSuccess : styles.feedbackError} role="status">
              {feedback.message}
            </div>
          ) : reportStep === 'reason' ? (
            <>
              <button
                type="button"
                className={styles.item}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setReportStep('main') }}
                role="menuitem"
              >
                ← Back
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
                  {loading === 'report' ? '…' : label}
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
                  {loading === 'delete' ? '…' : 'Delete post'}
                </button>
              )}
              {!isOwnPost && (
                <button
                  type="button"
                  className={styles.item}
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleBlock() }}
                  disabled={loading === 'block'}
                  role="menuitem"
                >
                  {loading === 'block' ? '…' : 'Block account'}
                </button>
              )}
              <button
                type="button"
                className={styles.item}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setReportStep('reason') }}
                role="menuitem"
              >
                Report post
              </button>
              <button
                type="button"
                className={styles.item}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleMuteThread() }}
                disabled={loading === 'mute'}
                role="menuitem"
              >
                {loading === 'mute' ? '…' : 'Mute thread'}
              </button>
              <button
                type="button"
                className={styles.item}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleHide() }}
                role="menuitem"
              >
                Hide post
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
