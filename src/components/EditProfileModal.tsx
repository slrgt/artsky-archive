import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { agent, getSession } from '../lib/bsky'
import { useScrollLock } from '../context/ScrollLockContext'
import styles from './EditProfileModal.module.css'

const DESCRIPTION_MAX = 256

interface EditProfileModalProps {
  onClose: () => void
  onSaved?: () => void
}

const AVATAR_ACCEPT = 'image/jpeg,image/png,image/gif,image/webp'
const AVATAR_MAX_MB = 1

export default function EditProfileModal({ onClose, onSaved }: EditProfileModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const scrollLock = useScrollLock()
  const [displayName, setDisplayName] = useState('')
  const [handle, setHandle] = useState('')
  const [description, setDescription] = useState('')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    scrollLock?.lockScroll()
    return () => scrollLock?.unlockScroll()
  }, [scrollLock])

  useEffect(() => {
    const session = getSession()
    if (!session?.did) {
      onClose()
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    agent
      .getProfile({ actor: session.did })
      .then((res) => {
        if (cancelled) return
        const d = res.data as { displayName?: string; handle?: string; description?: string; avatar?: string }
        setDisplayName(d.displayName ?? '')
        setHandle(d.handle ?? '')
        setDescription(d.description ?? '')
        setAvatarUrl(d.avatar ?? null)
      })
      .catch(() => {
        if (!cancelled) setError('Failed to load profile')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [onClose])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopImmediatePropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [onClose])

  useEffect(() => {
    return () => {
      if (avatarUrl?.startsWith('blob:')) URL.revokeObjectURL(avatarUrl)
    }
  }, [avatarUrl])

  function handleBackdropClick(e: React.MouseEvent) {
    if (e.target === overlayRef.current) onClose()
  }

  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!AVATAR_ACCEPT.split(',').map((t) => t.trim()).includes(file.type)) {
      setError('Please choose a JPEG, PNG, GIF, or WebP image.')
      return
    }
    if (file.size > AVATAR_MAX_MB * 1024 * 1024) {
      setError(`Image must be under ${AVATAR_MAX_MB} MB.`)
      return
    }
    setError(null)
    setAvatarFile(file)
    setAvatarUrl(URL.createObjectURL(file))
  }

  function clearAvatar() {
    if (avatarFile) {
      if (avatarUrl && avatarUrl.startsWith('blob:')) URL.revokeObjectURL(avatarUrl)
      setAvatarFile(null)
      setAvatarUrl(null)
    } else {
      setAvatarUrl(null)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const session = getSession()
    if (!session?.did || saving) return
    const newHandle = handle.trim().toLowerCase()
    const newDisplayName = displayName.trim() || undefined
    const newDescription = description.trim().slice(0, DESCRIPTION_MAX) || undefined
    setError(null)
    setSaving(true)
    try {
      const currentProfile = await agent.getProfile({ actor: session.did }).then((r) => r.data as { handle?: string })
      if (newHandle && newHandle !== (currentProfile.handle ?? '')) {
        await agent.updateHandle({ handle: newHandle })
      }
      let newAvatar: unknown
      if (avatarFile) {
        const { data } = await agent.uploadBlob(avatarFile, { encoding: avatarFile.type })
        newAvatar = data.blob
      }
      await agent.upsertProfile((existing) => {
        const out: Record<string, unknown> = {
          ...existing,
          displayName: newDisplayName,
          description: newDescription,
        }
        if (newAvatar) out.avatar = newAvatar
        else if (avatarUrl === null && !avatarFile) out.avatar = undefined
        return out
      })
      if (avatarUrl?.startsWith('blob:')) URL.revokeObjectURL(avatarUrl)
      onSaved?.()
      onClose()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save profile'
      setError(msg)
    } finally {
      setSaving(false)
    }
  }

  const modal = (
    <div
      ref={overlayRef}
      className={styles.overlay}
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-label="Edit profile"
    >
      <div className={styles.pane}>
        <div className={styles.modalTopBar}>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close">
            ×
          </button>
          <span className={styles.title}>Edit profile</span>
        </div>
        <div className={styles.scroll}>
          {loading ? (
            <p className={styles.loading}>Loading…</p>
          ) : (
            <form onSubmit={handleSubmit} className={styles.form}>
              {error && <p className={styles.error} role="alert">{error}</p>}
              <div className={styles.avatarSection}>
                <div className={styles.avatarWrap}>
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="" className={styles.avatarImg} loading="lazy" />
                  ) : (
                    <div className={styles.avatarPlaceholder} aria-hidden />
                  )}
                </div>
                <div className={styles.avatarActions}>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={AVATAR_ACCEPT}
                    className={styles.avatarInput}
                    onChange={handleAvatarChange}
                    aria-label="Change profile picture"
                  />
                  <button
                    type="button"
                    className={styles.avatarBtn}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Change photo
                  </button>
                  {(avatarUrl || avatarFile) && (
                    <button
                      type="button"
                      className={styles.avatarBtnSecondary}
                      onClick={clearAvatar}
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
              <label className={styles.label}>
                Display name
                <input
                  type="text"
                  className={styles.input}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Your display name"
                  maxLength={64}
                  autoComplete="name"
                />
              </label>
              <label className={styles.label}>
                Username
                <input
                  type="text"
                  className={styles.input}
                  value={handle}
                  onChange={(e) => setHandle(e.target.value)}
                  placeholder="you.bsky.social"
                  autoComplete="username"
                />
                <span className={styles.hint}>Your @handle (e.g. you.bsky.social)</span>
              </label>
              <label className={styles.label}>
                Bio
                <textarea
                  className={styles.textarea}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Tell us about yourself"
                  maxLength={DESCRIPTION_MAX}
                  rows={4}
                />
                <span className={styles.hint}>{description.length} / {DESCRIPTION_MAX}</span>
              </label>
              <div className={styles.actions}>
                <button type="button" className={styles.cancelBtn} onClick={onClose}>
                  Cancel
                </button>
                <button type="submit" className={styles.submitBtn} disabled={saving}>
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )

  return createPortal(modal, document.body)
}
