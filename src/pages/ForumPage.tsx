import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { searchPostsByDomain, STANDARD_SITE_DOMAIN, type PostView } from '../lib/bsky'
import { formatRelativeTime, formatExactDateTime } from '../lib/date'
import PostText from '../components/PostText'
import Layout from '../components/Layout'
import styles from './ForumPage.module.css'
import postBlockStyles from './PostDetailPage.module.css'

export default function ForumPage() {
  const [posts, setPosts] = useState<PostView[]>([])
  const [cursor, setCursor] = useState<string | undefined>()
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (nextCursor?: string) => {
    try {
      if (nextCursor) setLoadingMore(true)
      else setLoading(true)
      setError(null)
      const { posts: nextPosts, cursor: next } = await searchPostsByDomain(STANDARD_SITE_DOMAIN, nextCursor)
      setPosts((prev) => (nextCursor ? [...prev, ...nextPosts] : nextPosts))
      setCursor(next)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load forum')
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [])

  useEffect(() => {
    setPosts([])
    setCursor(undefined)
    load()
  }, [load])

  return (
    <Layout title="Forum" showNav>
      <div className={styles.wrap}>
        <header className={styles.header}>
          <h2 className={styles.title}>Forum</h2>
          <p className={styles.subtitle}>
            Posts using the <a href="https://standard.site" target="_blank" rel="noopener noreferrer" className={styles.standardLink}>standard.site</a> lexicon
          </p>
        </header>
        {error && <p className={styles.error}>{error}</p>}
        {loading ? (
          <div className={styles.loading}>Loading…</div>
        ) : posts.length === 0 ? (
          <div className={styles.empty}>No forum posts yet.</div>
        ) : (
          <>
            <ul className={styles.list}>
              {posts.map((post) => {
                const handle = post.author?.handle ?? post.author?.did ?? ''
                const text = (post.record as { text?: string })?.text ?? ''
                const createdAt = (post.record as { createdAt?: string })?.createdAt
                return (
                  <li key={post.uri}>
                    <Link to={`/post/${encodeURIComponent(post.uri)}`} className={styles.postLink}>
                      <article className={postBlockStyles.postBlock}>
                        <div className={postBlockStyles.postBlockContent}>
                          <div className={postBlockStyles.postHead}>
                            {post.author?.avatar && (
                              <img src={post.author.avatar} alt="" className={postBlockStyles.avatar} />
                            )}
                            <div className={postBlockStyles.authorRow}>
                              <Link
                                to={`/profile/${encodeURIComponent(handle)}`}
                                className={postBlockStyles.handleLink}
                                onClick={(e) => e.stopPropagation()}
                              >
                                @{handle}
                              </Link>
                              {createdAt && (
                                <span
                                  className={postBlockStyles.postTimestamp}
                                  title={formatExactDateTime(createdAt)}
                                >
                                  {formatRelativeTime(createdAt)}
                                </span>
                              )}
                            </div>
                          </div>
                          {text ? (
                            <p className={postBlockStyles.postText}>
                              <PostText text={text} />
                            </p>
                          ) : null}
                        </div>
                      </article>
                    </Link>
                  </li>
                )
              })}
            </ul>
            {cursor && (
              <button
                type="button"
                className={styles.more}
                onClick={() => load(cursor)}
                disabled={loadingMore}
              >
                {loadingMore ? 'Loading…' : 'Load more'}
              </button>
            )}
          </>
        )}
      </div>
    </Layout>
  )
}
