import { useCallback, useEffect, useRef, useState } from 'react'
import { getQuotes } from '../lib/bsky'
import type { TimelineItem } from '../lib/bsky'
import VirtualizedProfileColumn from './VirtualizedProfileColumn'
import AppModal from './AppModal'
import { useProfileModal } from '../context/ProfileModalContext'
import { useModeration } from '../context/ModerationContext'
import { useModalScroll } from '../context/ModalScrollContext'
import styles from './QuotesModal.module.css'
import profileGridStyles from '../pages/ProfilePage.module.css'

interface QuotesModalProps {
  postUri: string
  onClose: () => void
  onBack: () => void
  canGoBack: boolean
}

export default function QuotesModal({ postUri, onClose, onBack, canGoBack }: QuotesModalProps) {
  const { openPostModal } = useProfileModal()
  const { nsfwPreference, unblurredUris, setUnblurred } = useModeration()
  const [items, setItems] = useState<TimelineItem[]>([])
  const [cursor, setCursor] = useState<string | undefined>()
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [refreshFn, setRefreshFn] = useState<(() => void | Promise<void>) | null>(null)
  const [likeOverrides, setLikeOverrides] = useState<Record<string, string | null>>({})
  const loadMoreSentinelRef = useRef<HTMLDivElement>(null)
  const modalScrollRef = useModalScroll()

  const load = useCallback(
    async (nextCursor?: string) => {
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
    setItems([])
    setCursor(undefined)
    load()
  }, [postUri, load])

  useEffect(() => {
    setRefreshFn(() => () => load())
  }, [load])

  useEffect(() => {
    if (!cursor || loadingMore) return
    const el = loadMoreSentinelRef.current
    if (!el) return
    const root = el.closest('[data-modal-scroll]') ?? undefined
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) load(cursor)
      },
      { root, rootMargin: '200px', threshold: 0 }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [cursor, loadingMore, load])

  return (
    <AppModal
      ariaLabel="Posts that quote this post"
      onClose={onClose}
      onBack={onBack}
      canGoBack={canGoBack}
      onPullToRefresh={refreshFn ? () => refreshFn() : undefined}
    >
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
                scrollRef={modalScrollRef}
                loadMoreSentinelRef={cursor ? (el) => { (loadMoreSentinelRef as unknown as { current: HTMLDivElement | null }).current = el } : undefined}
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
    </AppModal>
  )
}
