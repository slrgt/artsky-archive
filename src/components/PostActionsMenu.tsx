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
    if (!open) triggerRef.current?.blur()
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

  async function handleBlock() {
    if (!session?.did || isOwnPost) return
    setLoading('block')
    try {
      await blockAccount(authorDid)
      setOpen(false)
    } catch {
      // leave menu open; user can retry
    } finally {
      setLoading(null)
    }
  }

  async function handleReport() {
    if (!session?.did) return
    setLoading('report')
    try {
      await reportPost(postUri, postCid)
      setOpen(false)
    } catch {
      // leave menu open
    } finally {
      setLoading(null)
    }
  }

  async function handleMuteThread() {
    if (!session?.did) return
    setLoading('mute')
    try {
      await muteThread(rootUri)
      setOpen(false)
    } catch {
      // leave menu open
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
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleReport() }}
            disabled={loading === 'report'}
            role="menuitem"
          >
            {loading === 'report' ? '…' : 'Report post'}
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
        </div>
      )}
    </div>
  )
}
