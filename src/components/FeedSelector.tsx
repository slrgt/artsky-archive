import { useState } from 'react'
import type { FeedSource, FeedMixEntry } from '../types'
import styles from './FeedSelector.module.css'

function sameSource(a: FeedSource, b: FeedSource): boolean {
  return (a.uri ?? a.label) === (b.uri ?? b.label)
}

interface Props {
  sources: FeedSource[]
  /** When mix is empty, this is the current single feed (for showing active state) */
  fallbackSource: FeedSource
  mixEntries: FeedMixEntry[]
  mixTotalPercent: number
  onToggle: (source: FeedSource) => void
  setEntryPercent: (index: number, percent: number) => void
  onAddCustom: (input: string) => void | Promise<void>
}

export default function FeedSelector({
  sources,
  fallbackSource,
  mixEntries,
  mixTotalPercent,
  onToggle,
  setEntryPercent,
  onAddCustom,
}: Props) {
  const [customInput, setCustomInput] = useState('')
  const [showCustom, setShowCustom] = useState(false)
  const [adding, setAdding] = useState(false)

  async function handleAddCustom(e: React.FormEvent) {
    e.preventDefault()
    const input = customInput.trim()
    if (!input) return
    setAdding(true)
    try {
      await onAddCustom(input)
      setShowCustom(false)
      setCustomInput('')
    } finally {
      setAdding(false)
    }
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.tabs}>
        {sources.map((s) => {
          const entryIndex = mixEntries.findIndex((e) => sameSource(e.source, s))
          const isInMix = entryIndex >= 0 || (mixEntries.length === 0 && sameSource(s, fallbackSource))
          const entry = isInMix ? mixEntries[entryIndex] : null
          const showPercent = isInMix && mixEntries.length >= 2
          return (
            <div key={s.uri ?? s.label} className={styles.feedPillWrap}>
              <button
                type="button"
                className={isInMix ? styles.active : ''}
                onClick={() => onToggle(s)}
              >
                {s.label}
              </button>
              {showPercent && entry && (
                <div className={styles.percentRow}>
                  <button
                    type="button"
                    className={styles.percentArrow}
                    onClick={(e) => {
                      e.stopPropagation()
                      const next = Math.max(0, Math.min(100, entry.percent - 1))
                      setEntryPercent(entryIndex, next)
                    }}
                    aria-label="Decrease percent"
                  >
                    ↓
                  </button>
                  <span className={styles.percentValue}>{entry.percent}%</span>
                  <button
                    type="button"
                    className={styles.percentArrow}
                    onClick={(e) => {
                      e.stopPropagation()
                      const next = Math.max(0, Math.min(100, entry.percent + 1))
                      setEntryPercent(entryIndex, next)
                    }}
                    aria-label="Increase percent"
                  >
                    ↑
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
      {mixEntries.length >= 2 && (
        <p className={styles.mixTotal}>Total: {mixTotalPercent}%</p>
      )}
      {showCustom ? (
        <form onSubmit={handleAddCustom} className={styles.customForm}>
          <input
            type="text"
            placeholder="https://bsky.app/profile/handle.bsky.social/feed/feed-name"
            value={customInput}
            onChange={(e) => setCustomInput(e.target.value)}
            className={styles.input}
            disabled={adding}
          />
          <div className={styles.customActions}>
            <button type="submit" className={styles.btn} disabled={adding}>
              {adding ? 'Adding…' : 'Add'}
            </button>
            <button type="button" className={styles.btnSecondary} onClick={() => setShowCustom(false)} disabled={adding}>
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button type="button" className={styles.addFeed} onClick={() => setShowCustom(true)}>
          + Add custom feed
        </button>
      )}
    </div>
  )
}
