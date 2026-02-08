import { useEffect, useState } from 'react'
import {
  listBlockedAccounts,
  listMutedAccounts,
  getMutedWords,
  putMutedWords,
  unblockAccount,
  unmuteAccount,
} from '../lib/bsky'
import { useScrollLock } from '../context/ScrollLockContext'
import styles from './BlockedAndMutedModal.module.css'

type BlockedEntry = { blockUri: string; did: string; handle?: string; displayName?: string; avatar?: string }
type MutedEntry = { did: string; handle: string; displayName?: string; avatar?: string }
type MutedWordEntry = { id?: string; value: string; targets: string[]; actorTarget?: string; expiresAt?: string }

const MUTED_WORD_DURATIONS = [
  { value: '24h' as const, label: '24 hours' },
  { value: '7d' as const, label: '7 days' },
  { value: '30d' as const, label: '30 days' },
  { value: 'forever' as const, label: 'Forever' },
]

function getExpiresAt(duration: '24h' | '7d' | '30d' | 'forever'): string | undefined {
  if (duration === 'forever') return undefined
  const d = new Date()
  if (duration === '24h') d.setHours(d.getHours() + 24)
  else if (duration === '7d') d.setDate(d.getDate() + 7)
  else if (duration === '30d') d.setDate(d.getDate() + 30)
  return d.toISOString()
}

function formatDuration(expiresAt?: string): string {
  if (!expiresAt) return 'Forever'
  const exp = new Date(expiresAt)
  const now = Date.now()
  const ms = exp.getTime() - now
  if (ms <= 0) return 'Expired'
  const hours = Math.round(ms / (1000 * 60 * 60))
  if (hours < 24) return `${hours}h`
  const days = Math.round(ms / (1000 * 60 * 60 * 24))
  if (days <= 30) return `${days} days`
  return expiresAt.slice(0, 10)
}

export default function BlockedAndMutedModal({ onClose }: { onClose: () => void }) {
  const scrollLock = useScrollLock()
  const [blocked, setBlocked] = useState<BlockedEntry[]>([])
  const [muted, setMuted] = useState<MutedEntry[]>([])
  const [mutedWords, setMutedWords] = useState<MutedWordEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [newWordValue, setNewWordValue] = useState('')
  const [newWordDuration, setNewWordDuration] = useState<'24h' | '7d' | '30d' | 'forever'>('forever')
  const [newWordExcludeFollowing, setNewWordExcludeFollowing] = useState(true)
  const [addWordLoading, setAddWordLoading] = useState(false)

  useEffect(() => {
    scrollLock?.lockScroll()
    return () => scrollLock?.unlockScroll()
  }, [scrollLock])

  const load = () => {
    setLoading(true)
    setError(null)
    Promise.all([listBlockedAccounts(), listMutedAccounts(), getMutedWords()])
      .then(([b, m, w]) => {
        setBlocked(b)
        setMuted(m)
        setMutedWords(w)
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [])

  async function handleUnblock(blockUri: string) {
    setActionLoading(blockUri)
    try {
      await unblockAccount(blockUri)
      setBlocked((prev) => prev.filter((e) => e.blockUri !== blockUri))
    } catch {
      setError('Could not unblock')
    } finally {
      setActionLoading(null)
    }
  }

  async function handleUnmute(did: string) {
    setActionLoading(did)
    try {
      await unmuteAccount(did)
      setMuted((prev) => prev.filter((e) => e.did !== did))
    } catch {
      setError('Could not unmute')
    } finally {
      setActionLoading(null)
    }
  }

  async function handleRemoveWord(word: MutedWordEntry) {
    setActionLoading(word.value)
    try {
      const next = mutedWords.filter((w) => w.value !== word.value || w.id !== word.id)
      await putMutedWords(next)
      setMutedWords(next)
    } catch {
      setError('Could not remove word')
    } finally {
      setActionLoading(null)
    }
  }

  async function handleAddWord(e: React.FormEvent) {
    e.preventDefault()
    const value = newWordValue.trim()
    if (!value || addWordLoading) return
    setAddWordLoading(true)
    setError(null)
    try {
      const newEntry: MutedWordEntry = {
        value,
        targets: ['content', 'tag'],
        actorTarget: newWordExcludeFollowing ? 'exclude-following' : 'all',
        expiresAt: getExpiresAt(newWordDuration),
      }
      const next = [...mutedWords, newEntry]
      await putMutedWords(next)
      setMutedWords(next)
      setNewWordValue('')
    } catch {
      setError('Could not add muted word')
    } finally {
      setAddWordLoading(false)
    }
  }

  return (
    <div
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-labelledby="blocked-muted-title"
      onClick={onClose}
    >
      <div className={styles.pane} onClick={(e) => e.stopPropagation()}>
        <div className={styles.topBar}>
          <h2 id="blocked-muted-title" className={styles.title}>
            Blocked & muted
          </h2>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className={styles.scroll}>
          {loading ? (
            <p className={styles.loading}>Loading…</p>
          ) : error ? (
            <p className={styles.error}>{error}</p>
          ) : (
            <>
              <section className={styles.section}>
                <h3 className={styles.sectionTitle}>Blocked accounts</h3>
                {blocked.length === 0 ? (
                  <p className={styles.empty}>No blocked accounts.</p>
                ) : (
                  <ul className={styles.list}>
                    {blocked.map((e) => (
                      <li key={e.blockUri} className={styles.row}>
                        <span className={styles.label}>
                          {e.displayName ? `${e.displayName} ` : ''}@{e.handle ?? e.did}
                        </span>
                        <button
                          type="button"
                          className={styles.actionBtn}
                          onClick={() => handleUnblock(e.blockUri)}
                          disabled={actionLoading === e.blockUri}
                        >
                          {actionLoading === e.blockUri ? '…' : 'Unblock'}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              <section className={styles.section}>
                <h3 className={styles.sectionTitle}>Muted accounts</h3>
                {muted.length === 0 ? (
                  <p className={styles.empty}>No muted accounts.</p>
                ) : (
                  <ul className={styles.list}>
                    {muted.map((e) => (
                      <li key={e.did} className={styles.row}>
                        <span className={styles.label}>
                          {e.displayName ? `${e.displayName} ` : ''}@{e.handle}
                        </span>
                        <button
                          type="button"
                          className={styles.actionBtn}
                          onClick={() => handleUnmute(e.did)}
                          disabled={actionLoading === e.did}
                        >
                          {actionLoading === e.did ? '…' : 'Unmute'}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              <section className={styles.section}>
                <h3 className={styles.sectionTitle}>Muted words</h3>
                <form className={styles.addWordForm} onSubmit={handleAddWord}>
                  <input
                    type="text"
                    className={styles.addWordInput}
                    placeholder="Word or phrase to mute"
                    value={newWordValue}
                    onChange={(e) => setNewWordValue(e.target.value)}
                    maxLength={100}
                    aria-label="Word or phrase to mute"
                  />
                  <div className={styles.addWordOptions}>
                    <label className={styles.durationLabel}>Duration:</label>
                    <select
                      className={styles.durationSelect}
                      value={newWordDuration}
                      onChange={(e) => setNewWordDuration(e.target.value as '24h' | '7d' | '30d' | 'forever')}
                      aria-label="Mute duration"
                    >
                      {MUTED_WORD_DURATIONS.map((d) => (
                        <option key={d.value} value={d.value}>
                          {d.label}
                        </option>
                      ))}
                    </select>
                    <label className={styles.excludeFollowingLabel}>
                      <input
                        type="checkbox"
                        checked={newWordExcludeFollowing}
                        onChange={(e) => setNewWordExcludeFollowing(e.target.checked)}
                        className={styles.excludeFollowingCheckbox}
                      />
                      <span>Exclude people I follow</span>
                    </label>
                  </div>
                  <button
                    type="submit"
                    className={styles.addWordBtn}
                    disabled={!newWordValue.trim() || addWordLoading}
                  >
                    {addWordLoading ? '…' : 'Add muted word'}
                  </button>
                </form>
                {mutedWords.length === 0 ? (
                  <p className={styles.empty}>No muted words yet.</p>
                ) : (
                  <ul className={styles.list}>
                    {mutedWords.map((w, i) => (
                      <li key={w.id ?? w.value + i} className={styles.wordRow}>
                        <div className={styles.wordMeta}>
                          <span className={styles.label}>{w.value}</span>
                          <span className={styles.wordMetaBadges}>
                            <span className={styles.durationBadge}>{formatDuration(w.expiresAt)}</span>
                            {w.actorTarget === 'exclude-following' && (
                              <span className={styles.excludeBadge}>Exclude following</span>
                            )}
                          </span>
                        </div>
                        <button
                          type="button"
                          className={styles.actionBtn}
                          onClick={() => handleRemoveWord(w)}
                          disabled={actionLoading === w.value}
                        >
                          {actionLoading === w.value ? '…' : 'Remove'}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
