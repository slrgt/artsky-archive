import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useProfileModal } from '../context/ProfileModalContext'
import { searchActorsTypeahead, getSuggestedFeeds } from '../lib/bsky'
import type { FeedSource } from '../types'
import type { AppBskyActorDefs, AppBskyFeedDefs } from '@atproto/api'
import styles from './SearchBar.module.css'

const DEBOUNCE_MS = 200

/** Extract profile handle from pasted URL: bsky.app/profile/handle or ...?profile=handle (ArtSky). */
function extractProfileHandleFromSearchQuery(text: string): string | null {
  const pathMatch = text.match(/\/profile\/([^/?\s#]+)/i)
  if (pathMatch) {
    try {
      return decodeURIComponent(pathMatch[1].trim())
    } catch {
      return pathMatch[1].trim()
    }
  }
  const paramMatch = text.match(/profile=([^&\s]+)/i)
  if (!paramMatch) return null
  try {
    return decodeURIComponent(paramMatch[1].trim())
  } catch {
    return paramMatch[1].trim()
  }
}

export type SearchFilter = 'all' | 'users' | 'feeds'

function FilterIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 6h16M4 12h10M4 18h6" />
    </svg>
  )
}

function SearchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  )
}

interface Props {
  onSelectFeed?: (source: FeedSource) => void
  /** Optional ref so parent can focus the search input (e.g. from bottom bar) */
  inputRef?: React.RefObject<HTMLInputElement | null>
  /** Compact height for desktop header */
  compact?: boolean
  /** Optional close callback (e.g. for mobile overlay) */
  onClose?: () => void
  /** Show suggestions dropdown above the input (e.g. mobile overlay) */
  suggestionsAbove?: boolean
}

export default function SearchBar({ onSelectFeed, inputRef: externalInputRef, compact, onClose, suggestionsAbove }: Props) {
  const navigate = useNavigate()
  const { openProfileModal, openTagModal, openSearchModal } = useProfileModal()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<SearchFilter>('all')
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [actors, setActors] = useState<AppBskyActorDefs.ProfileViewBasic[]>([])
  const [suggestedFeeds, setSuggestedFeeds] = useState<AppBskyFeedDefs.GeneratorView[]>([])
  const [activeIndex, setActiveIndex] = useState(-1)
  const [filterOpen, setFilterOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const internalInputRef = useRef<HTMLInputElement>(null)
  const inputRef = externalInputRef ?? internalInputRef

  const trimmed = query.trim()
  const isHashtag = trimmed.startsWith('#')
  const tagSlug = isHashtag ? trimmed.slice(1).replace(/\s.*$/, '').toLowerCase() : ''
  const hashtagOption = isHashtag && tagSlug && filter !== 'feeds' ? { type: 'tag' as const, tag: tagSlug } : null

  const fetchActors = useCallback(async (q: string) => {
    if (!q || q.startsWith('#') || filter === 'feeds') {
      setActors([])
      return
    }
    setLoading(true)
    try {
      const res = await searchActorsTypeahead(q, 8)
      setActors(res.actors ?? [])
    } catch {
      setActors([])
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => {
    if (!trimmed || trimmed.startsWith('#') || filter === 'feeds') {
      setActors([])
      return
    }
    const t = setTimeout(() => fetchActors(trimmed), DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [trimmed, filter, fetchActors])

  useEffect(() => {
    if (open && (filter === 'feeds' || filter === 'all') && !trimmed) {
      getSuggestedFeeds(6).then((feeds) => setSuggestedFeeds(feeds ?? []))
    } else {
      setSuggestedFeeds([])
    }
  }, [open, trimmed, filter])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false)
        setFilterOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const options: Array<
    | { type: 'actor'; handle: string; did: string; avatar?: string; displayName?: string }
    | { type: 'tag'; tag: string }
    | { type: 'feed'; view: AppBskyFeedDefs.GeneratorView }
  > = []
  if (hashtagOption) options.push(hashtagOption)
  if (filter !== 'feeds') actors.forEach((a) => options.push({ type: 'actor', handle: a.handle, did: a.did, avatar: a.avatar, displayName: a.displayName }))
  if ((filter === 'feeds' || filter === 'all') && (!trimmed && suggestedFeeds.length)) suggestedFeeds.forEach((f) => options.push({ type: 'feed', view: f }))

  useEffect(() => {
    setActiveIndex(-1)
  }, [query, actors.length, suggestedFeeds.length, hashtagOption])

  function handleSelect(index: number) {
    const opt = options[index]
    if (!opt) return
    setOpen(false)
    setQuery('')
    if (opt.type === 'tag') {
      openTagModal(opt.tag)
      inputRef.current?.blur()
      onClose?.()
    } else if (opt.type === 'actor') {
      openProfileModal(opt.handle)
      inputRef.current?.blur()
      onClose?.()
    } else if (opt.type === 'feed') {
      const v = opt.view
      const source: FeedSource = { kind: 'custom', label: v.displayName ?? v.uri, uri: v.uri }
      if (onSelectFeed) {
        onSelectFeed(source)
      } else {
        navigate('/feed', { state: { feedSource: source } })
      }
      inputRef.current?.blur()
      onClose?.()
    }
  }

  const placeholder =
    filter === 'users' ? 'Search users, #hashtags…' : filter === 'feeds' ? 'Browse feeds…' : 'Search users, feeds, #hashtags…'

  /** Treat as profile only when clearly a handle: pasted URL, or single token that starts with @ or contains a period (e.g. bsky.app, @user). Single words with no period = text/hashtag search. */
  const looksLikeHandle =
    trimmed.length > 0 &&
    !/\s/.test(trimmed) &&
    (trimmed.startsWith('@') || trimmed.includes('.'))

  function handleSubmit() {
    const profileHandle = extractProfileHandleFromSearchQuery(trimmed)
    if (profileHandle) {
      openProfileModal(profileHandle)
      setQuery('')
      setOpen(false)
      inputRef.current?.blur()
      onClose?.()
      return
    }
    if (looksLikeHandle) {
      openProfileModal(trimmed.replace(/^@/, ''))
      setQuery('')
      setOpen(false)
      inputRef.current?.blur()
      onClose?.()
      return
    }
    if (trimmed.length > 0) {
      openSearchModal(trimmed)
      setQuery('')
      setOpen(false)
      inputRef.current?.blur()
      onClose?.()
      return
    }
    if (open && options.length > 0 && activeIndex >= 0) {
      handleSelect(activeIndex)
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      setOpen(false)
      onClose?.()
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSubmit()
      return
    }
    if (!open || options.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => (i < 0 ? 0 : (i + 1) % options.length))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => (i <= 0 ? options.length - 1 : i - 1))
    }
  }

  return (
    <div className={`${styles.wrap} ${compact ? styles.compact : ''} ${suggestionsAbove ? styles.suggestionsAbove : ''}`} ref={containerRef}>
      <div className={styles.searchRow}>
        <button
          type="button"
          className={`${styles.filterIconBtn} ${filterOpen ? styles.filterIconActive : ''}`}
          onClick={() => setFilterOpen((v) => !v)}
          aria-label="Search filter"
          aria-expanded={filterOpen}
        >
          <FilterIcon />
        </button>
        <input
          ref={(el) => {
            (internalInputRef as React.MutableRefObject<HTMLInputElement | null>).current = el
            if (externalInputRef) (externalInputRef as React.MutableRefObject<HTMLInputElement | null>).current = el
          }}
          type="search"
          placeholder={placeholder}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className={styles.input}
          aria-label="Search"
          aria-autocomplete="list"
          aria-expanded={open && options.length > 0}
        />
        <button
          type="button"
          className={styles.searchSubmitBtn}
          onClick={handleSubmit}
          aria-label="Search"
        >
          <SearchIcon />
        </button>
        {filterOpen && (
          <div className={styles.filterDropdown}>
            {(['all', 'users', 'feeds'] as const).map((f) => (
              <button
                key={f}
                type="button"
                className={filter === f ? styles.filterActive : styles.filterBtn}
                onClick={() => {
                  setFilter(f)
                  setFilterOpen(false)
                }}
              >
                {f === 'all' ? 'All' : f === 'users' ? 'Users' : 'Feeds'}
              </button>
            ))}
          </div>
        )}
      </div>
      {open && (options.length > 0 || loading) && (
        <div className={styles.dropdown} role="listbox">
          {loading && options.length === 0 && (
            <div className={styles.item}>Searching…</div>
          )}
          {options.map((opt, i) => {
            if (opt.type === 'tag') {
              return (
                <button
                  key={`tag-${opt.tag}`}
                  type="button"
                  role="option"
                  className={`${styles.item} ${i === activeIndex ? styles.itemActive : ''}`}
                  onClick={() => handleSelect(i)}
                >
                  <span className={styles.itemLabel}>Browse #{opt.tag}</span>
                </button>
              )
            }
            if (opt.type === 'actor') {
              return (
                <button
                  key={opt.did}
                  type="button"
                  role="option"
                  className={`${styles.item} ${i === activeIndex ? styles.itemActive : ''}`}
                  onClick={() => handleSelect(i)}
                >
                  {opt.avatar && <img src={opt.avatar} alt="" className={styles.itemAvatar} loading="lazy" />}
                  <span className={styles.itemLabel}>
                    {opt.displayName ? `${opt.displayName} ` : ''}@{opt.handle}
                  </span>
                </button>
              )
            }
            if (opt.type === 'feed') {
              const v = opt.view
              return (
                <button
                  key={v.uri}
                  type="button"
                  role="option"
                  className={`${styles.item} ${i === activeIndex ? styles.itemActive : ''}`}
                  onClick={() => handleSelect(i)}
                >
                  {v.avatar && <img src={v.avatar} alt="" className={styles.itemAvatar} loading="lazy" />}
                  <span className={styles.itemLabel}>{v.displayName ?? v.uri}</span>
                </button>
              )
            }
            return null
          })}
        </div>
      )}
    </div>
  )
}
