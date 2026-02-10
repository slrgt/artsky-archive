import { useRef, useState, useEffect } from 'react'
import { blockAccount, unblockAccount, agent, publicAgent, getSession } from '../lib/bsky'
import { formatExactDateTimeLongMonth } from '../lib/date'
import styles from './ProfileActionsMenu.module.css'

interface ProfileActionsMenuProps {
  profileDid: string
  profileHandle: string
  isOwnProfile: boolean
  className?: string
}

export default function ProfileActionsMenu({
  profileDid,
  profileHandle,
  isOwnProfile,
  className,
}: ProfileActionsMenuProps) {
  const session = getSession()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [blockStep, setBlockStep] = useState<'idle' | 'confirm'>('idle')
  const [authorBlockingUri, setAuthorBlockingUri] = useState<string | null>(null)
  const [profileMeta, setProfileMeta] = useState<{ createdAt?: string; indexedAt?: string } | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) setBlockStep('idle')
  }, [open])

  useEffect(() => {
    if (!open) return
    const client = getSession() ? agent : publicAgent
    let cancelled = false
    client.getProfile({ actor: profileDid }).then((res) => {
      if (cancelled) return
      const data = res.data as {
        viewer?: { blocking?: string }
        createdAt?: string
        indexedAt?: string
      }
      setAuthorBlockingUri(data.viewer?.blocking ?? null)
      setProfileMeta({
        createdAt: data.createdAt ?? undefined,
        indexedAt: data.indexedAt ?? undefined,
      })
    }).catch(() => {
      if (!cancelled) {
        setAuthorBlockingUri(null)
        setProfileMeta(null)
      }
    })
    return () => { cancelled = true }
  }, [open, profileDid])

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
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'q') {
        e.preventDefault()
        if (blockStep === 'confirm') setBlockStep('idle')
        else setOpen(false)
        return
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, blockStep])

  function showSuccess(message: string) {
    setFeedback({ type: 'success', message })
    setTimeout(() => {
      setOpen(false)
      setFeedback(null)
    }, 1500)
  }

  function showError(message: string) {
    setFeedback({ type: 'error', message })
  }

  async function handleBlockConfirm() {
    if (!session?.did || isOwnProfile) return
    setLoading('block')
    setFeedback(null)
    try {
      const { uri } = await blockAccount(profileDid)
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

  function handleCopyProfileLink() {
    const base = typeof window !== 'undefined' ? window.location.origin + (import.meta.env.BASE_URL || '/').replace(/\/$/, '') : ''
    const url = `${base}/profile/${encodeURIComponent(profileHandle)}`
    navigator.clipboard.writeText(url).then(
      () => showSuccess('Link copied'),
      () => showError('Could not copy link')
    )
  }

  const loggedIn = !!session?.did
  const showBlockUnblock = loggedIn && !isOwnProfile

  return (
    <div ref={menuRef} className={`${styles.wrap} ${className ?? ''}`}>
      <button
        type="button"
        className={styles.trigger}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setOpen(!open)
        }}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label="Profile options"
        title="Profile options"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
          <circle cx="4" cy="12" r="2" fill="currentColor" />
          <circle cx="12" cy="12" r="2" fill="currentColor" />
          <circle cx="20" cy="12" r="2" fill="currentColor" />
        </svg>
      </button>
      {open && (
        <div ref={dropdownRef} className={styles.dropdown} role="menu">
          {feedback ? (
            <div className={feedback.type === 'success' ? styles.feedbackSuccess : styles.feedbackError} role="status">
              {feedback.message}
            </div>
          ) : blockStep === 'confirm' ? (
            <>
              <button
                type="button"
                className={styles.item}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setBlockStep('idle') }}
                role="menuitem"
              >
                ← Back
              </button>
              <div className={styles.label}>
                Block @{profileHandle}?
              </div>
              <button
                type="button"
                className={styles.item}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleBlockConfirm() }}
                disabled={loading === 'block'}
                role="menuitem"
              >
                {loading === 'block' ? '…' : 'Yes, block'}
              </button>
            </>
          ) : (
            <>
              {showBlockUnblock && (
                authorBlockingUri ? (
                  <button
                    type="button"
                    className={styles.item}
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleUnblock() }}
                    disabled={loading === 'unblock'}
                    role="menuitem"
                  >
                    {loading === 'unblock' ? '…' : 'Unblock account'}
                  </button>
                ) : (
                  <button
                    type="button"
                    className={styles.item}
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setBlockStep('confirm') }}
                    role="menuitem"
                  >
                    Block user
                  </button>
                )
              )}
              <button
                type="button"
                className={styles.item}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleCopyProfileLink() }}
                role="menuitem"
              >
                Copy profile link
              </button>
              {profileMeta && (profileMeta.createdAt || profileMeta.indexedAt) && (
                <div className={styles.profileMeta} role="status">
                  {profileMeta.createdAt && (
                    <p className={styles.profileMetaLine} title={formatExactDateTimeLongMonth(profileMeta.createdAt)}>
                      Account created: {formatExactDateTimeLongMonth(profileMeta.createdAt)}
                    </p>
                  )}
                  {profileMeta.indexedAt &&
                    (!profileMeta.createdAt ||
                      new Date(profileMeta.indexedAt).getTime() - new Date(profileMeta.createdAt).getTime() > 60_000) && (
                    <p className={styles.profileMetaLine} title={formatExactDateTimeLongMonth(profileMeta.indexedAt)}>
                      Profile last updated: {formatExactDateTimeLongMonth(profileMeta.indexedAt)}
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
