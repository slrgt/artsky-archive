import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { listStandardSiteDocumentsAll, listStandardSiteDocumentsForForum, getSession, type StandardSiteDocumentView } from '../lib/bsky'
import { FORUM_DISCOVERY_URLS } from '../config/forumDiscovery'
import { formatRelativeTime, formatRelativeTimeTitle } from '../lib/date'
import { useListKeyboardNav } from '../hooks/useListKeyboardNav'
import Layout from '../components/Layout'
import ProfileLink from '../components/ProfileLink'
import { useProfileModal } from '../context/ProfileModalContext'
import styles from './ForumPage.module.css'
import postBlockStyles from './PostDetailPage.module.css'

function documentUrl(doc: StandardSiteDocumentView): string | null {
  if (!doc.baseUrl) return null
  const base = doc.baseUrl.replace(/\/$/, '')
  const path = (doc.path ?? '').replace(/^\//, '')
  return path ? `${base}/${path}` : base
}

function matchesSearch(doc: StandardSiteDocumentView, q: string): boolean {
  if (!q.trim()) return true
  const lower = q.toLowerCase().trim()
  const title = (doc.title ?? '').toLowerCase()
  const body = (doc.body ?? '').toLowerCase()
  const handle = (doc.authorHandle ?? '').toLowerCase()
  const path = (doc.path ?? '').toLowerCase()
  return title.includes(lower) || body.includes(lower) || handle.includes(lower) || path.includes(lower)
}

const BODY_PREVIEW_LENGTH = 140

function bodyPreview(body: string | undefined): string {
  if (!body?.trim()) return ''
  const oneLine = body.replace(/\s+/g, ' ').trim()
  if (oneLine.length <= BODY_PREVIEW_LENGTH) return oneLine
  return oneLine.slice(0, BODY_PREVIEW_LENGTH).trim() + '…'
}

type ForumTab = 'all' | 'followed' | 'mine'

export function ForumContent({ inModal = false }: { inModal?: boolean }) {
  const [tab, setTab] = useState<ForumTab>('all')
  const [documents, setDocuments] = useState<StandardSiteDocumentView[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [focusedIndex, setFocusedIndex] = useState(0)
  const session = getSession()
  const { isModalOpen, openForumPostModal } = useProfileModal()
  const listRef = useRef<HTMLUListElement>(null)

  const load = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      if (tab === 'all') {
        const list = await listStandardSiteDocumentsAll(FORUM_DISCOVERY_URLS)
        setDocuments(list)
      } else {
        const list = await listStandardSiteDocumentsForForum()
        if (tab === 'followed') {
          setDocuments(session?.did ? list.filter((doc) => doc.did !== session.did) : [])
        } else {
          setDocuments(session?.did ? list.filter((doc) => doc.did === session.did) : [])
        }
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load forum')
    } finally {
      setLoading(false)
    }
  }, [tab, session?.did])

  useEffect(() => {
    setDocuments([])
    load()
  }, [load])

  const filteredDocuments = useMemo(
    () => documents.filter((doc) => matchesSearch(doc, searchQuery)),
    [documents, searchQuery]
  )

  useEffect(() => {
    setFocusedIndex((i) => (filteredDocuments.length ? Math.min(i, filteredDocuments.length - 1) : 0))
  }, [filteredDocuments.length])

  useEffect(() => {
    if (!listRef.current || focusedIndex < 0) return
    const li = listRef.current.querySelector(`[data-forum-index="${focusedIndex}"]`)
    if (li) li.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [focusedIndex])

  useListKeyboardNav({
    enabled: filteredDocuments.length > 0 && (inModal || !isModalOpen),
    itemCount: filteredDocuments.length,
    focusedIndex,
    setFocusedIndex,
    onActivate: (index) => {
      const doc = filteredDocuments[index]
      if (doc) openForumPostModal(doc.uri)
    },
    useCapture: true,
  })

  const showSignInForTab = (tab === 'followed' || tab === 'mine') && !session

  const wrap = (
    <div className={styles.wrap}>
        <header className={styles.header}>
          <h2 className={styles.title}>Forums</h2>
          <p className={styles.subtitle}>
            Posts from the ATmosphere using the <a href="https://standard.site" target="_blank" rel="noopener noreferrer" className={styles.standardLink}>standard.site</a> lexicon
          </p>
          <div className={styles.tabs}>
            <button
              type="button"
              className={tab === 'all' ? styles.tabActive : styles.tab}
              onClick={() => setTab('all')}
              aria-pressed={tab === 'all'}
            >
              All Posts
            </button>
            <button
              type="button"
              className={tab === 'followed' ? styles.tabActive : styles.tab}
              onClick={() => setTab('followed')}
              aria-pressed={tab === 'followed'}
            >
              Followed
            </button>
            <button
              type="button"
              className={tab === 'mine' ? styles.tabActive : styles.tab}
              onClick={() => setTab('mine')}
              aria-pressed={tab === 'mine'}
            >
              My Posts
            </button>
          </div>
          <div className={styles.searchRow}>
            <input
              type="search"
              className={styles.searchInput}
              placeholder="Search posts…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search forums posts"
            />
          </div>
        </header>
        {error && <p className={styles.error}>{error}</p>}
        {showSignInForTab ? (
          <div className={styles.empty}>Log in to see {tab === 'followed' ? 'posts from people you follow' : 'your posts'}.</div>
        ) : loading ? (
          <div className={styles.loading}>
            {tab === 'all' ? 'Loading discovered posts…' : tab === 'followed' ? 'Loading followed posts…' : 'Loading your posts…'}
          </div>
        ) : filteredDocuments.length === 0 ? (
          <div className={styles.empty}>
            {documents.length === 0
              ? tab === 'all'
                ? 'No standard.site posts discovered yet. Add more publication URLs in forum discovery config.'
                : tab === 'followed'
                  ? 'No posts yet from people you follow.'
                  : 'You haven\'t posted in the forums yet.'
              : 'No posts match your search.'}
          </div>
        ) : (
          <ul ref={listRef} className={styles.list}>
            {filteredDocuments.map((doc, index) => {
              const handle = doc.authorHandle ?? doc.did
              const url = documentUrl(doc)
              const createdAt = doc.createdAt
              const title = doc.title || doc.path || 'Untitled'
              const head = (
                <div className={postBlockStyles.postHead}>
                  {doc.authorAvatar ? (
                    <img src={doc.authorAvatar} alt="" className={postBlockStyles.avatar} loading="lazy" />
                  ) : (
                    <span className={styles.avatarPlaceholder} aria-hidden>{(handle || doc.did).slice(0, 1).toUpperCase()}</span>
                  )}
                  <div className={postBlockStyles.authorRow}>
                    <ProfileLink
                      handle={handle}
                      className={postBlockStyles.handleLink}
                      onClick={(e) => e.stopPropagation()}
                    >
                      @{handle}
                    </ProfileLink>
                    {createdAt && (
                      <span
                        className={postBlockStyles.postTimestamp}
                        title={formatRelativeTimeTitle(createdAt)}
                      >
                        {formatRelativeTime(createdAt)}
                      </span>
                    )}
                  </div>
                </div>
              )
              const isFocused = index === focusedIndex
              return (
                <li key={doc.uri} data-forum-index={index}>
                  <Link
                    to="#"
                    className={isFocused ? `${styles.postLink} ${styles.postLinkFocused}` : styles.postLink}
                    onClick={(e) => {
                      e.preventDefault()
                      openForumPostModal(doc.uri)
                    }}
                  >
                    <article className={postBlockStyles.postBlock}>
                      <div className={postBlockStyles.postBlockContent}>
                        {head}
                        <p className={postBlockStyles.postText}>{title}</p>
                        {bodyPreview(doc.body) && (
                          <p className={styles.bodyPreview}>{bodyPreview(doc.body)}</p>
                        )}
                        {!url && <p className={styles.noUrl}>No publication URL</p>}
                      </div>
                    </article>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </div>
  )

  return wrap
}

export default function ForumPage() {
  return (
    <Layout title="Forums" showNav>
      <ForumContent />
    </Layout>
  )
}
