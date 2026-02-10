import { useState, useRef, useEffect, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import type { FeedSource, FeedMixEntry } from '../types'
import { getActorFeeds, getSuggestedFeeds } from '../lib/bsky'
import { useSession } from '../context/SessionContext'
import styles from './FeedSelector.module.css'

const REMIX_EXPLANATION = 'Use + or - to change how many posts you see from each feed.'
const DESKTOP_BREAKPOINT = 768
function subscribeDesktop(cb: () => void) {
  if (typeof window === 'undefined') return () => {}
  const mq = window.matchMedia(`(min-width: ${DESKTOP_BREAKPOINT}px)`)
  mq.addEventListener('change', cb)
  return () => mq.removeEventListener('change', cb)
}
function getDesktopSnapshot() {
  return typeof window !== 'undefined' ? window.innerWidth >= DESKTOP_BREAKPOINT : false
}

function sameSource(a: FeedSource, b: FeedSource): boolean {
  return (a.uri ?? a.label) === (b.uri ?? b.label)
}

interface Props {
  sources: FeedSource[]
  /** When mix is empty, this is the current single feed (for showing active state) */
  fallbackSource: FeedSource
  mixEntries: FeedMixEntry[]
  onToggle: (source: FeedSource) => void
  setEntryPercent: (index: number, percent: number) => void
  onAddCustom: (input: string | FeedSource) => void | Promise<void>
  /** When set, feed pill and add-custom clicks call this instead of onToggle/onAddCustom (e.g. open login). */
  onToggleWhenGuest?: () => void
  /** 'page' = homepage (compact row, no header). 'dropdown' = Feeds dropdown (title, sections, hints). */
  variant?: 'page' | 'dropdown'
  /** URIs of feeds that can be removed (saved custom feeds). When set with onRemoveFeed, long-press shows Delete. */
  removableSourceUris?: Set<string>
  /** Called when user chooses Delete in the feed context menu. */
  onRemoveFeed?: (source: FeedSource) => void | Promise<void>
  /** Called when user chooses Share in the feed context menu; should copy the feed link. */
  onShareFeed?: (source: FeedSource) => void | Promise<void>
  /** Called when user reorders feeds in edit mode; receives the new ordered list. */
  onReorderSources?: (ordered: FeedSource[]) => void
}

const LONG_PRESS_MS = 500

export default function FeedSelector({
  sources,
  fallbackSource,
  mixEntries,
  onToggle,
  setEntryPercent,
  onAddCustom,
  onToggleWhenGuest,
  variant = 'page',
  removableSourceUris,
  onRemoveFeed,
  onShareFeed,
  onReorderSources,
}: Props) {
  const { session } = useSession()
  const [customInput, setCustomInput] = useState('')
  const [showCustom, setShowCustom] = useState(false)
  const [adding, setAdding] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [networkFeeds, setNetworkFeeds] = useState<FeedSource[]>([])
  const [networkLoading, setNetworkLoading] = useState(false)
  const [networkSectionLabel, setNetworkSectionLabel] = useState('')
  const [feedContextMenu, setFeedContextMenu] = useState<{ source: FeedSource; x: number; y: number } | null>(null)
  const [editFeeds, setEditFeeds] = useState(false)
  const helpRef = useRef<HTMLDivElement>(null)
  const contextMenuRef = useRef<HTMLDivElement>(null)
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isDesktop = useSyncExternalStore(subscribeDesktop, getDesktopSnapshot, () => false)

  const searchQuery = customInput.trim().toLowerCase()
  const searchWords = searchQuery ? searchQuery.split(/\s+/).filter(Boolean) : []
  const searchResults =
    searchWords.length > 0
      ? sources.filter((s) => {
          const label = (s.label ?? '').toLowerCase()
          const uri = (s.uri ?? '').toLowerCase()
          return searchWords.every((w) => label.includes(w) || uri.includes(w))
        })
      : []
  const maxSuggestions = 10
  const suggestions = searchResults.slice(0, maxSuggestions)

  /* Search AT Protocol for feeds: by handle (feeds by @user) or suggested when empty */
  useEffect(() => {
    if (!showCustom) {
      setNetworkFeeds([])
      setNetworkSectionLabel('')
      return
    }
    const trimmed = customInput.trim()
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current)
      searchDebounceRef.current = null
    }
    searchDebounceRef.current = setTimeout(() => {
      searchDebounceRef.current = null
      if (trimmed === '') {
        if (session) {
          setNetworkSectionLabel('Suggested feeds')
          setNetworkLoading(true)
          getSuggestedFeeds(10)
            .then((feeds) => {
              setNetworkFeeds(
                (feeds ?? []).map((f) => ({
                  kind: 'custom' as const,
                  label: (f as { displayName?: string }).displayName ?? (f as { uri?: string }).uri ?? '',
                  uri: (f as { uri?: string }).uri,
                }))
              )
            })
            .catch(() => setNetworkFeeds([]))
            .finally(() => setNetworkLoading(false))
        } else {
          setNetworkFeeds([])
        }
        return
      }
      const looksLikeHandle = /^@?[a-zA-Z0-9.-]+$/.test(trimmed) && trimmed.length >= 2
      if (looksLikeHandle) {
        const handle = trimmed.replace(/^@/, '')
        setNetworkSectionLabel(`Feeds by @${handle}`)
        setNetworkLoading(true)
        getActorFeeds(handle, 20)
          .then((feeds) => {
            setNetworkFeeds(
              feeds.map((f) => ({
                kind: 'custom' as const,
                label: f.displayName ?? f.uri,
                uri: f.uri,
              }))
            )
          })
          .catch(() => setNetworkFeeds([]))
          .finally(() => setNetworkLoading(false))
      } else {
        setNetworkFeeds([])
        setNetworkSectionLabel('')
      }
    }, 350)
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
    }
  }, [showCustom, customInput, session])

  useEffect(() => {
    if (!showHelp) return
    function handleClickOutside(e: MouseEvent) {
      if (helpRef.current && !helpRef.current.contains(e.target as Node)) setShowHelp(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showHelp])

  useEffect(() => {
    if (!feedContextMenu) return
    function close(e: MouseEvent | TouchEvent) {
      const target = e.target as Node
      if (contextMenuRef.current?.contains(target)) return
      setFeedContextMenu(null)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('touchstart', close, { passive: true })
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('touchstart', close)
    }
  }, [feedContextMenu])

  async function handleAddCustom(e: React.FormEvent) {
    e.preventDefault()
    const input = customInput.trim()
    if (!input) return
    const looksLikeUrl = /^(https?:\/\/|at:\/\/)/i.test(input) || input.includes('bsky.app')
    if (looksLikeUrl) {
      setAdding(true)
      try {
        await onAddCustom(input)
        setShowCustom(false)
        setCustomInput('')
      } finally {
        setAdding(false)
      }
      return
    }
    if (suggestions.length === 1) {
      onToggle(suggestions[0])
      setShowCustom(false)
      setCustomInput('')
      return
    }
    if (networkFeeds.length === 1) {
      setAdding(true)
      try {
        await onAddCustom(networkFeeds[0])
        setShowCustom(false)
        setCustomInput('')
      } finally {
        setAdding(false)
      }
      return
    }
    setAdding(true)
    try {
      await onAddCustom(input)
      setShowCustom(false)
      setCustomInput('')
    } finally {
      setAdding(false)
    }
  }

  function handleSelectSuggestion(source: FeedSource) {
    onToggle(source)
    setCustomInput('')
    setShowCustom(false)
  }

  async function handleSelectNetworkFeed(source: FeedSource) {
    if (!source.uri) return
    if (onToggleWhenGuest) {
      onToggleWhenGuest()
      return
    }
    setAdding(true)
    try {
      await onAddCustom(source)
      setShowCustom(false)
      setCustomInput('')
    } finally {
      setAdding(false)
    }
  }

  const hasMix = mixEntries.length >= 2
  const isDropdown = variant === 'dropdown'
  const removableSources = sources.filter((s) => s.uri && removableSourceUris?.has(s.uri))
  const canEditFeeds = (removableSources.length > 0 || (sources.length > 0 && onReorderSources)) && (onRemoveFeed || onReorderSources)

  useEffect(() => {
    if (editFeeds && sources.length === 0) setEditFeeds(false)
  }, [editFeeds, sources.length])

  useEffect(() => {
    if (!showHelp || isDropdown) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        setShowHelp(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showHelp, isDropdown])

  const helpButton = (
    <div className={styles.helpWrap} ref={helpRef}>
      <button
        type="button"
        className={styles.helpBtn}
        onClick={() => setShowHelp((v) => !v)}
        aria-label="Explain remix feed and shortcuts"
        aria-expanded={showHelp}
        title="How mixing works"
      >
        ?
      </button>
      {showHelp && isDropdown && (
        <div className={styles.helpPopover} role="tooltip">
          {REMIX_EXPLANATION}
        </div>
      )}
    </div>
  )

  const helpModal =
    showHelp && !isDropdown
      ? createPortal(
          <div
            className={styles.helpModalOverlay}
            onClick={() => setShowHelp(false)}
            role="dialog"
            aria-label="Feed mix and shortcuts"
          >
            <div className={styles.helpModalCard} onClick={(e) => e.stopPropagation()}>
              <p className={styles.helpModalIntro}>{REMIX_EXPLANATION}</p>
              {isDesktop && (
                <>
                  <h3 className={styles.helpModalSubtitle}>Keyboard shortcuts</h3>
                  <dl className={styles.helpModalShortcuts}>
                    <dt>W / ↑</dt>
                    <dd>Move up</dd>
                    <dt>A / ←</dt>
                    <dd>Move left</dd>
                    <dt>S / ↓</dt>
                    <dd>Move down</dd>
                    <dt>D / →</dt>
                    <dd>Move right</dd>
                    <dt>Q</dt>
                    <dd>Quit / close window</dd>
                    <dt>E</dt>
                    <dd>Enter post</dd>
                    <dt>R</dt>
                    <dd>Reply to post</dd>
                    <dt>T</dt>
                    <dd>Toggle text view</dd>
                    <dt>F</dt>
                    <dd>Like / unlike</dd>
                    <dt>C</dt>
                    <dd>Collect post</dd>
                    <dt>B</dt>
                    <dd>Block author (feed)</dd>
                    <dt>4</dt>
                    <dd>Follow author</dd>
                    <dt>Escape</dt>
                    <dd>Escape all windows</dd>
                    <dt>1 / 2 / 3</dt>
                    <dd>1, 2, or 3 column view</dd>
                  </dl>
                </>
              )}
              <button
                type="button"
                className={styles.helpModalClose}
                onClick={() => setShowHelp(false)}
                aria-label="Close"
              >
                Close
              </button>
            </div>
          </div>,
          document.body
        )
      : null

  const pills = (
    <>
      {sources.map((s) => {
          const entryIndex = mixEntries.findIndex((e) => sameSource(e.source, s))
          const isInMix = entryIndex >= 0 || (mixEntries.length === 0 && sameSource(s, fallbackSource))
          const entry = isInMix ? mixEntries[entryIndex] : null
          const showRatio = isInMix && mixEntries.length >= 2 && entry
          const in10 = entry ? Math.max(1, Math.min(10, Math.round(entry.percent / 10))) : 1
          const canDecrease = showRatio && in10 > 1
          const canIncrease = showRatio && in10 < 10
          const plusAddsFeed = !isInMix
          const percent = entry?.percent ?? 0
          const pillButton = (
            <button
              type="button"
              className={`${styles.feedPillWithFill} ${!isInMix ? styles.feedPillInactive : ''}`}
              style={
                isInMix && entry
                  ? percent >= 100
                    ? { background: 'var(--accent)' }
                    : {
                        /* Surface as base; accent gradient on top so no seam at the boundary */
                        backgroundColor: 'var(--surface)',
                        backgroundImage: `linear-gradient(to right, var(--accent) 0%, var(--accent) ${percent}%, transparent ${percent}%)`,
                      }
                  : undefined
              }
              onClick={() => (onToggleWhenGuest ? onToggleWhenGuest() : onToggle(s))}
            >
              <span className={styles.feedPillLabel}>{s.label}</span>
              <span className={styles.feedPillRatio}>
                {isInMix && entry ? `${percent}% of posts` : '0% of posts'}
              </span>
            </button>
          )
          const minusBtn = (
            <button
              type="button"
              className={styles.ratioBtnSide}
              disabled={!canDecrease}
              onClick={(e) => {
                e.stopPropagation()
                if (onToggleWhenGuest) onToggleWhenGuest()
                else if (canDecrease) {
                  const next = Math.max(1, in10 - 1)
                  setEntryPercent(entryIndex, next * 10)
                }
              }}
              aria-label="Fewer posts from this feed"
            >
              −
            </button>
          )
          const plusBtn = (
            <button
              type="button"
              className={styles.ratioBtnSide}
              disabled={!canIncrease && !plusAddsFeed}
              onClick={(e) => {
                e.stopPropagation()
                if (onToggleWhenGuest) onToggleWhenGuest()
                else if (plusAddsFeed) {
                  onToggle(s)
                } else if (canIncrease) {
                  const next = Math.min(10, in10 + 1)
                  setEntryPercent(entryIndex, next * 10)
                }
              }}
              aria-label={plusAddsFeed ? 'Add feed to mix' : 'More posts from this feed'}
            >
              +
            </button>
          )
          const showFeedMenu = (onShareFeed || (onRemoveFeed && s.uri && removableSourceUris?.has(s.uri)))
          const isRemovable = !!(s.uri && removableSourceUris?.has(s.uri))
          const openFeedMenu = (clientX: number, clientY: number) => {
            if (!showFeedMenu) return
            setFeedContextMenu({ source: s, x: clientX, y: clientY })
          }
          return (
            <div
              key={s.uri ?? s.label}
              className={styles.feedPillWrap}
              onContextMenu={(e) => {
                if (!showFeedMenu) return
                e.preventDefault()
                openFeedMenu(e.clientX, e.clientY)
              }}
              onTouchStart={(e) => {
                if (!showFeedMenu || e.changedTouches.length === 0) return
                const touch = e.changedTouches[0]
                longPressTimerRef.current = setTimeout(() => {
                  longPressTimerRef.current = null
                  openFeedMenu(touch.clientX, touch.clientY)
                }, LONG_PRESS_MS)
              }}
              onTouchEnd={() => {
                if (longPressTimerRef.current) {
                  clearTimeout(longPressTimerRef.current)
                  longPressTimerRef.current = null
                }
              }}
              onTouchMove={() => {
                if (longPressTimerRef.current) {
                  clearTimeout(longPressTimerRef.current)
                  longPressTimerRef.current = null
                }
              }}
            >
              {!isDropdown && editFeeds && isRemovable && onRemoveFeed && (
                <button
                  type="button"
                  className={styles.feedPillRemoveBtn}
                  onClick={(e) => {
                    e.stopPropagation()
                    onRemoveFeed(s)
                  }}
                  aria-label={`Remove ${s.label} from pinned feeds`}
                  title="Remove from pinned feeds"
                >
                  ×
                </button>
              )}
              {isDropdown ? (
                <div className={styles.feedPillRow}>
                  {minusBtn}
                  {pillButton}
                  {plusBtn}
                </div>
              ) : (
                <div className={styles.feedPillColumn}>
                  {pillButton}
                  <div className={styles.ratioBtnRow}>
                    {minusBtn}
                    {plusBtn}
                  </div>
                </div>
              )}
            </div>
          )
        })}
    </>
  )

  const hasSuggestions = suggestions.length > 0 || networkFeeds.length > 0 || networkLoading
  const addCustomBlock = showCustom ? (
    <form onSubmit={handleAddCustom} className={styles.customForm}>
      <input
        type="text"
        placeholder="Paste feed URL, or type a handle to find their feeds…"
        value={customInput}
        onChange={(e) => setCustomInput(e.target.value)}
        className={styles.input}
        disabled={adding}
        autoComplete="off"
        aria-autocomplete="list"
        aria-controls={hasSuggestions ? 'feed-search-suggestions' : undefined}
        aria-expanded={hasSuggestions}
      />
      {(suggestions.length > 0 || networkFeeds.length > 0 || networkLoading) && (
        <div id="feed-search-suggestions" className={styles.customSuggestionsWrap} aria-label="Feeds">
          {suggestions.length > 0 && (
            <>
              <div className={styles.customSuggestionsSection}>Your feeds</div>
              <ul className={styles.customSuggestions} role="listbox" aria-label="Your feeds">
                {suggestions.map((s) => (
                <li key={s.uri ?? s.label} role="option">
                  <button
                    type="button"
                    className={styles.customSuggestionItem}
                    onClick={() => handleSelectSuggestion(s)}
                  >
                    {s.label}
                  </button>
                </li>
              ))}
              </ul>
            </>
          )}
          {networkLoading && networkFeeds.length === 0 && (
            <div className={styles.customSuggestionsLoading}>Searching…</div>
          )}
          {networkFeeds.length > 0 && (
            <>
              <div className={styles.customSuggestionsSection}>{networkSectionLabel}</div>
              <ul className={styles.customSuggestions} role="listbox" aria-label={networkSectionLabel}>
                {networkFeeds.map((s) => (
                  <li key={s.uri ?? s.label} role="option">
                    <button
                      type="button"
                      className={styles.customSuggestionItem}
                      onClick={() => handleSelectNetworkFeed(s)}
                      disabled={adding}
                    >
                      {s.label}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
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
    <button
      type="button"
      className={isDropdown ? styles.addFeed : styles.addFeedPage}
      onClick={() => (onToggleWhenGuest ? onToggleWhenGuest() : setShowCustom(true))}
    >
      + Add Custom Feed
    </button>
  )

  const feedMenu =
    feedContextMenu && (onShareFeed || onRemoveFeed) ? (
      <div
        ref={contextMenuRef}
        className={styles.feedContextMenu}
        style={{ left: feedContextMenu.x + 4, top: feedContextMenu.y + 4 }}
        role="menu"
      >
        {onRemoveFeed &&
          feedContextMenu.source.uri &&
          removableSourceUris?.has(feedContextMenu.source.uri) && (
            <button
              type="button"
              className={styles.feedContextMenuItem}
              role="menuitem"
              onClick={() => {
                onRemoveFeed(feedContextMenu.source)
                setFeedContextMenu(null)
              }}
            >
              Delete
            </button>
          )}
        {onShareFeed && (
          <button
            type="button"
            className={styles.feedContextMenuItem}
            role="menuitem"
            onClick={() => {
              onShareFeed(feedContextMenu.source)
              setFeedContextMenu(null)
            }}
          >
            Copy link
          </button>
        )}
      </div>
    ) : null

  if (isDropdown) {
    return (
      <div className={`${styles.wrap} ${styles.wrapDropdown}`}>
        {feedMenu}
        <header className={styles.header}>
          <span className={styles.headerTitle}>{editFeeds ? 'Edit feeds' : 'Feeds'}</span>
          <div className={styles.headerActions}>
            {editFeeds ? (
              <button
                type="button"
                className={styles.editFeedsDoneBtn}
                onClick={() => setEditFeeds(false)}
              >
                Done
              </button>
            ) : canEditFeeds ? (
              <button
                type="button"
                className={styles.editFeedsBtn}
                onClick={() => setEditFeeds(true)}
              >
                Edit
              </button>
            ) : null}
            {helpButton}
          </div>
        </header>
        {editFeeds ? (
          <section className={styles.editFeedsSection} aria-label="Edit feeds">
            <p className={styles.sectionHint}>
              Use ↑ ↓ to change order. Tap Remove to delete a feed from your list.
            </p>
            <ul className={styles.editFeedsList}>
              {sources.map((s, i) => {
                const canMoveUp = onReorderSources && i > 0
                const canMoveDown = onReorderSources && i < sources.length - 1
                const isRemovable = s.uri && removableSourceUris?.has(s.uri)
                const moveUp = () => {
                  if (!canMoveUp || !onReorderSources) return
                  const next = [...sources]
                  ;[next[i - 1], next[i]] = [next[i], next[i - 1]]
                  onReorderSources(next)
                }
                const moveDown = () => {
                  if (!canMoveDown || !onReorderSources) return
                  const next = [...sources]
                  ;[next[i], next[i + 1]] = [next[i + 1], next[i]]
                  onReorderSources(next)
                }
                return (
                  <li key={s.uri ?? s.label ?? i} className={styles.editFeedsItem}>
                    <div className={styles.editFeedsOrderBtns}>
                      <button
                        type="button"
                        className={styles.editFeedsOrderBtn}
                        onClick={moveUp}
                        disabled={!canMoveUp}
                        aria-label={`Move ${s.label} up`}
                        title="Move up"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className={styles.editFeedsOrderBtn}
                        onClick={moveDown}
                        disabled={!canMoveDown}
                        aria-label={`Move ${s.label} down`}
                        title="Move down"
                      >
                        ↓
                      </button>
                    </div>
                    <span className={styles.editFeedsLabel}>{s.label}</span>
                    {isRemovable ? (
                      <button
                        type="button"
                        className={styles.editFeedsRemoveBtn}
                        onClick={() => onRemoveFeed?.(s)}
                        aria-label={`Remove ${s.label}`}
                      >
                        Remove
                      </button>
                    ) : (
                      <span className={styles.editFeedsRemovePlaceholder} aria-hidden />
                    )}
                  </li>
                )
              })}
            </ul>
          </section>
        ) : (
          <>
            <section className={styles.section} aria-label="Choose feeds">
              <p className={styles.sectionHint}>Tap a feed to add or remove it from your mix.</p>
              <div className={styles.tabs}>{pills}</div>
              {hasMix && (
                <p className={styles.ratioHint}>Use − and + on each side of a feed to set how many posts you see from it.</p>
              )}
            </section>
            <section className={styles.sectionAdd}>
              {addCustomBlock}
            </section>
          </>
        )}
      </div>
    )
  }

  return (
    <div className={styles.wrap}>
      {feedMenu}
      {helpModal}
      {/* Page: always show pills; Edit mode adds X on each removable pill and toggles button to Done */}
      <div className={styles.feedRow}>
        <div className={styles.tabs}>
          {pills}
          {canEditFeeds ? (
            <button
              type="button"
              className={styles.editFeedsBtnPage}
              onClick={() => setEditFeeds((v) => !v)}
            >
              {editFeeds ? 'Done' : 'Edit'}
            </button>
          ) : null}
          {helpButton}
        </div>
      </div>
      <div className={styles.feedRowAdd}>
        {addCustomBlock}
      </div>
    </div>
  )
}
