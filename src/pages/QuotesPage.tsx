import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams, Navigate } from 'react-router-dom'
import { getQuotes } from '../lib/bsky'
import type { TimelineItem } from '../lib/bsky'
import VirtualizedProfileColumn from '../components/VirtualizedProfileColumn'
import Layout from '../components/Layout'
import { useProfileModal } from '../context/ProfileModalContext'
import { useModeration } from '../context/ModerationContext'
import profileGridStyles from './ProfilePage.module.css'
import styles from '../components/QuotesModal.module.css'

export default function QuotesPage() {
  const [searchParams] = useSearchParams()
  const postUri = searchParams.get('post') ?? ''
  const { openPostModal } = useProfileModal()
  const { nsfwPreference, unblurredUris, setUnblurred } = useModeration()
  const [items, setItems] = useState<TimelineItem[]>([])
  const [cursor, setCursor] = useState<string | undefined>()
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [likeOverrides, setLikeOverrides] = useState<Record<string, string | null>>({})
  const loadMoreSentinelRef = useRef<HTMLDivElement>(null)

  const load = useCallback(
    async (nextCursor?: string) => {
      if (!postUri) return
      try {
        if (nextCursor) setLoadingMore(true)
        else setLoading(true)
        setError(null)
        const { posts, cursor: next } = await getQuotes(postUri, { limit: 30, cursor: nextCursor })
        const timelineItems = posts.map((post) => ({ post } as TimelineItem))
        setItems((prev) => (nextCursor ? [...prev, ...timelineItems] : timelineItems))
        setCursor(next)
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to load quotes')
      } finally {
        setLoading(false)
        setLoadingMore(false)
      }
    },
    [postUri]
  )

  useEffect(() => {
    if (postUri) {
      setItems([])
      setCursor(undefined)
      load()
    }
  }, [postUri, load])

  useEffect(() => {
    if (!cursor || loadingMore || !postUri) return
    const el = loadMoreSentinelRef.current
    if (!el) return
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) load(cursor)
      },
      { root: undefined, rootMargin: '200px', threshold: 0 }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [cursor, loadingMore, load, postUri])

  if (!postUri) {
    return <Navigate to="/feed" replace />
  }

  return (
    <Layout title="Quotes" showNav>
      <div className={styles.wrap}>
        {error && <p className={styles.error}>{error}</p>}
        {loading ? (
          <div className={styles.loading}>Loading…</div>
        ) : items.length === 0 ? (
          <div className={styles.empty}>No one has quoted this post yet.</div>
        ) : (
          <>
            <div className={`${profileGridStyles.gridColumns} ${profileGridStyles.gridView1}`}>
              <VirtualizedProfileColumn
                column={items.map((item, i) => ({ item, originalIndex: i }))}
                colIndex={0}
                scrollMargin={0}
                scrollRef={null}
                loadMoreSentinelRef={
                  cursor
                    ? (el) => {
                        ;(loadMoreSentinelRef as unknown as { current: HTMLDivElement | null }).current = el
                      }
                    : undefined
                }
                hasCursor={!!cursor}
                keyboardFocusIndex={0}
                keyboardAddOpen={false}
                actionsMenuOpenForIndex={null}
                nsfwPreference={nsfwPreference}
                unblurredUris={unblurredUris}
                setUnblurred={setUnblurred}
                likeOverrides={likeOverrides}
                setLikeOverrides={setLikeOverrides}
                openPostModal={openPostModal}
                cardRef={() => () => {}}
                onActionsMenuOpenChange={() => {}}
                onMouseEnter={() => {}}
                onAddClose={() => {}}
                constrainMediaHeight
                isSelected={() => false}
              />
            </div>
            {loadingMore && <div className={styles.loadingMore}>Loading more…</div>}
          </>
        )}
      </div>
    </Layout>
  )
}
