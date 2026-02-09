import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useListKeyboardNav } from '../hooks/useListKeyboardNav'
import { Link } from 'react-router-dom'
import {
  getStandardSiteDocument,
  deleteStandardSiteDocument,
  updateStandardSiteDocument,
  uploadStandardSiteDocumentBlob,
  listStandardSiteRepliesForDocument,
  createStandardSiteComment,
  agent,
  publicAgent,
  type StandardSiteDocumentView,
  type StandardSiteDocumentBlobRef,
  type ForumReplyView,
} from '../lib/bsky'
import { useSession } from '../context/SessionContext'
import { formatRelativeTime, formatRelativeTimeTitle } from '../lib/date'
import PostText from '../components/PostText'
import ProfileLink from '../components/ProfileLink'
import { ReplyAsRow } from './PostDetailPage'
import styles from './ForumPostDetailPage.module.css'
import postBlockStyles from './PostDetailPage.module.css'

function documentUrl(doc: StandardSiteDocumentView): string | null {
  if (!doc.baseUrl) return null
  const base = doc.baseUrl.replace(/\/$/, '')
  const path = (doc.path ?? '').replace(/^\//, '')
  return path ? `${base}/${path}` : base
}

function domainFromBaseUrl(baseUrl: string): string {
  try {
    return new URL(baseUrl).hostname
  } catch {
    return ''
  }
}

type ReplyTreeNode = { reply: ForumReplyView; children: ReplyTreeNode[] }

function buildReplyTree(replies: ForumReplyView[], documentUri: string): ReplyTreeNode[] {
  const byParent = new Map<string, ForumReplyView[]>()
  for (const r of replies) {
    const parent = r.replyTo ?? documentUri
    if (!byParent.has(parent)) byParent.set(parent, [])
    byParent.get(parent)!.push(r)
  }
  const sortByTime = (a: ForumReplyView, b: ForumReplyView) =>
    new Date(a.record?.createdAt ?? 0).getTime() - new Date(b.record?.createdAt ?? 0).getTime()

  function buildNodes(parentKey: string): ReplyTreeNode[] {
    const list = (byParent.get(parentKey) ?? []).slice().sort(sortByTime)
    return list.map((reply) => ({
      reply,
      children: buildNodes(reply.uri),
    }))
  }
  return buildNodes(documentUri)
}

function flattenReplyTree(nodes: ReplyTreeNode[]): { reply: ForumReplyView; depth: number }[] {
  const out: { reply: ForumReplyView; depth: number }[] = []
  function walk(nodes: ReplyTreeNode[], depth: number) {
    for (const n of nodes) {
      out.push({ reply: n.reply, depth })
      walk(n.children, depth + 1)
    }
  }
  walk(nodes, 0)
  return out
}

const REPLY_THREAD_INDENT = 20

export interface ForumPostContentProps {
  documentUri: string
  onClose: () => void
}

export function ForumPostContent({ documentUri, onClose }: ForumPostContentProps) {
  const decodedUri = documentUri
  const [doc, setDoc] = useState<StandardSiteDocumentView | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [replyPosts, setReplyPosts] = useState<ForumReplyView[]>([])
  const [replyLoading, setReplyLoading] = useState(false)
  const [replyText, setReplyText] = useState('')
  const [posting, setPosting] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editBody, setEditBody] = useState('')
  const [editMediaRefs, setEditMediaRefs] = useState<Array<{ image: StandardSiteDocumentBlobRef; mimeType?: string }>>([])
  const [editMediaNewFiles, setEditMediaNewFiles] = useState<File[]>([])
  const [editSaving, setEditSaving] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const replyFormRef = useRef<HTMLFormElement>(null)
  const docSectionRef = useRef<HTMLElement>(null)
  const replyFormWrapRef = useRef<HTMLDivElement>(null)
  const repliesSectionRef = useRef<HTMLUListElement>(null)
  const [keyboardFocusIndex, setKeyboardFocusIndex] = useState(0)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [replyingTo, setReplyingTo] = useState<ForumReplyView | null>(null)
  const [likeLoadingMap, setLikeLoadingMap] = useState<Record<string, boolean>>({})
  const [likeUriOverrideMap, setLikeUriOverrideMap] = useState<Record<string, string>>({})
  const [replyAs, setReplyAs] = useState<{ handle: string; avatar?: string }>({ handle: '' })
  const { session, sessionsList, switchAccount } = useSession()
  const currentDid = session?.did ?? ''
  const inlineReplyTextareaRef = useRef<HTMLTextAreaElement>(null)
  const loadDocRetriedRef = useRef(false)
  const isOwn = session?.did && doc?.did === session.did
  const docUrl = doc ? documentUrl(doc) : null
  const domain = doc?.baseUrl ? domainFromBaseUrl(doc.baseUrl) : ''
  const editNewPreviewUrls = useMemo(
    () => editMediaNewFiles.map((f) => URL.createObjectURL(f)),
    [editMediaNewFiles]
  )
  useEffect(() => {
    return () => editNewPreviewUrls.forEach((u) => URL.revokeObjectURL(u))
  }, [editNewPreviewUrls])

  useEffect(() => {
    if (!session?.did) {
      setReplyAs({ handle: '' })
      return
    }
    let cancelled = false
    publicAgent.getProfile({ actor: session.did }).then((res) => {
      if (cancelled) return
      const data = res.data as { handle?: string; avatar?: string }
      setReplyAs({ handle: data.handle ?? session.did, avatar: data.avatar })
    }).catch(() => {
      if (!cancelled) setReplyAs({ handle: (session as { handle?: string }).handle ?? session.did })
    })
    return () => { cancelled = true }
  }, [session?.did])

  useEffect(() => {
    if (!replyingTo) return
    const id = requestAnimationFrame(() => {
      inlineReplyTextareaRef.current?.focus()
    })
    return () => cancelAnimationFrame(id)
  }, [replyingTo])

  const loadDoc = useCallback(async () => {
    if (!decodedUri) return
    setLoading(true)
    setError(null)
    let skipLoadingFalse = false
    try {
      const d = await getStandardSiteDocument(decodedUri)
      if (d) {
        loadDocRetriedRef.current = false
        setDoc(d)
        setEditTitle(d.title ?? '')
        setEditBody(d.body ?? '')
        setEditMediaRefs(d.mediaRefs ?? [])
        setEditMediaNewFiles([])
      } else if (!loadDocRetriedRef.current && decodedUri.startsWith('at://')) {
        loadDocRetriedRef.current = true
        skipLoadingFalse = true
        setTimeout(() => loadDoc(), 600)
        return
      } else {
        setError('Post not found or not a standard.site document.')
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load post')
    } finally {
      if (!skipLoadingFalse) setLoading(false)
    }
  }, [decodedUri])

  const loadReplies = useCallback(async () => {
    if (!decodedUri || !domain) return
    setReplyLoading(true)
    try {
      const replies = await listStandardSiteRepliesForDocument(decodedUri, domain, docUrl)
      setReplyPosts(replies)
    } catch {
      setReplyPosts([])
    } finally {
      setReplyLoading(false)
    }
  }, [decodedUri, domain, docUrl])

  const replyTreeFlat = useMemo(
    () => (doc ? flattenReplyTree(buildReplyTree(replyPosts, doc.uri)) : []),
    [replyPosts, doc?.uri]
  )

  useEffect(() => {
    loadDocRetriedRef.current = false
    setDoc(null)
    loadDoc()
  }, [loadDoc])

  useEffect(() => {
    if (!decodedUri) return
    const onVisibility = () => {
      if (document.visibilityState === 'visible') loadDoc()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [decodedUri, loadDoc])

  useEffect(() => {
    if (doc) loadReplies()
  }, [doc, loadReplies])

  const forumFocusTotal = 1 + replyTreeFlat.length + (session ? 1 : 0)

  const focusItemAtIndex = useCallback((idx: number) => {
    if (idx === 0) {
      requestAnimationFrame(() => {
        docSectionRef.current?.focus()
        docSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      })
    } else if (idx <= replyTreeFlat.length) {
      const replyIdx = idx - 1
      const replyEl = repliesSectionRef.current?.querySelectorAll<HTMLElement>('[data-forum-reply-index]')?.[replyIdx]
      if (replyEl) {
        requestAnimationFrame(() => {
          replyEl.focus()
          replyEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
        })
      }
    } else {
      requestAnimationFrame(() => {
        replyFormWrapRef.current?.focus()
        replyFormWrapRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      })
    }
  }, [replyTreeFlat.length])

  useEffect(() => {
    if (doc) setKeyboardFocusIndex(0)
  }, [decodedUri])
  useEffect(() => {
    if (forumFocusTotal <= 0) return
    setKeyboardFocusIndex((i) => Math.min(Math.max(0, i), forumFocusTotal - 1))
  }, [forumFocusTotal])

  useEffect(() => {
    if (forumFocusTotal <= 0) return
    focusItemAtIndex(keyboardFocusIndex)
  }, [keyboardFocusIndex, forumFocusTotal, focusItemAtIndex])

  useListKeyboardNav({
    enabled: !!doc && forumFocusTotal > 0,
    itemCount: forumFocusTotal,
    focusedIndex: keyboardFocusIndex,
    setFocusedIndex: setKeyboardFocusIndex,
    onActivate: focusItemAtIndex,
    useCapture: false,
  })

  async function handleReplySubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!session || !doc || !replyText.trim() || posting) return
    setPosting(true)
    try {
      await createStandardSiteComment(doc.uri, replyText.trim(), replyingTo?.uri)
      setReplyText('')
      setReplyingTo(null)
      await loadReplies()
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to post')
    } finally {
      setPosting(false)
    }
  }

  function handleReplyToComment(post: ForumReplyView) {
    setReplyingTo(post)
  }

  async function handleEditSave() {
    if (!doc || !decodedUri || editSaving) return
    setEditSaving(true)
    try {
      let media = [...editMediaRefs]
      if (editMediaNewFiles.length > 0) {
        const uploaded = await Promise.all(
          editMediaNewFiles.map((file) => uploadStandardSiteDocumentBlob(file))
        )
        media = [...media, ...uploaded]
      }
      const updated = await updateStandardSiteDocument(decodedUri, {
        title: editTitle,
        body: editBody.trim(),
        media,
      })
      setDoc(updated)
      setEditMediaRefs(updated.mediaRefs ?? [])
      setEditMediaNewFiles([])
      setEditMode(false)
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setEditSaving(false)
    }
  }

  function handleAddMediaClick() {
    fileInputRef.current?.click()
  }

  function handleMediaFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files?.length) return
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
    const toAdd = Array.from(files).filter((f) => allowed.includes(f.type)).slice(0, 4 - editMediaRefs.length - editMediaNewFiles.length)
    setEditMediaNewFiles((prev) => [...prev, ...toAdd].slice(0, 4 - editMediaRefs.length))
    e.target.value = ''
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    const files = e.dataTransfer.files
    if (!files?.length) return
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
    const toAdd = Array.from(files).filter((f) => allowed.includes(f.type)).slice(0, 4 - editMediaRefs.length - editMediaNewFiles.length)
    setEditMediaNewFiles((prev) => [...prev, ...toAdd].slice(0, 4 - editMediaRefs.length))
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }

  function removeEditMediaRef(index: number) {
    setEditMediaRefs((prev) => prev.filter((_, i) => i !== index))
  }

  function removeEditMediaNewFile(index: number) {
    setEditMediaNewFiles((prev) => prev.filter((_, i) => i !== index))
  }

  async function handleDelete() {
    if (!decodedUri || !deleteConfirm || deleteLoading) return
    setDeleteLoading(true)
    try {
      await deleteStandardSiteDocument(decodedUri)
      onClose()
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to delete')
    } finally {
      setDeleteLoading(false)
    }
  }

  async function handleLikePost(post: ForumReplyView) {
    if (post.isComment) return
    const likedUri = likeUriOverrideMap[post.uri] ?? post.viewer?.like
    const isLiked = !!likedUri
    setLikeLoadingMap((m) => ({ ...m, [post.uri]: true }))
    try {
      if (isLiked) {
        await agent.deleteLike(likedUri)
        setLikeUriOverrideMap((m) => {
          const next = { ...m }
          delete next[post.uri]
          return next
        })
      } else {
        const res = await agent.like(post.uri, post.cid)
        setLikeUriOverrideMap((m) => ({ ...m, [post.uri]: res.uri }))
      }
      await loadReplies()
    } catch {
      // leave state unchanged
    } finally {
      setLikeLoadingMap((m) => ({ ...m, [post.uri]: false }))
    }
  }

  if (!decodedUri) {
    onClose()
    return null
  }

  return (
      <div className={styles.wrap}>
        {loading && <div className={styles.loading}>Loading…</div>}
        {error && <p className={styles.error}>{error}</p>}
        {doc && !loading && (
          <>
            <article
              ref={docSectionRef}
              tabIndex={-1}
              className={`${postBlockStyles.postBlock} ${postBlockStyles.rootPostBlock}`}
              onFocus={() => setKeyboardFocusIndex(0)}
            >
              <div className={postBlockStyles.postBlockContent}>
                <div className={postBlockStyles.postHead}>
                  {doc.authorAvatar ? (
                    <img src={doc.authorAvatar} alt="" className={postBlockStyles.avatar} loading="lazy" />
                  ) : (
                    <span className={styles.avatarPlaceholder} aria-hidden>{(doc.authorHandle ?? doc.did).slice(0, 1).toUpperCase()}</span>
                  )}
                  <div className={postBlockStyles.authorRow}>
                    <ProfileLink handle={doc.authorHandle ?? doc.did} className={postBlockStyles.handleLink}>
                      @{doc.authorHandle ?? doc.did}
                    </ProfileLink>
                    {doc.createdAt && (
                      <span className={postBlockStyles.postTimestamp} title={formatRelativeTimeTitle(doc.createdAt)}>
                        {formatRelativeTime(doc.createdAt)}
                      </span>
                    )}
                  </div>
                </div>
                {!editMode ? (
                  <>
                    <h1 className={styles.docTitle}>{doc.title || 'Untitled'}</h1>
                    {doc.body && (
                      <div className={styles.docBody}>
                        <PostText text={doc.body} />
                      </div>
                    )}
                    {doc.media && doc.media.length > 0 && (
                      <div className={styles.docMedia}>
                        {doc.media.map((m, i) => (
                          <img key={i} src={m.url} alt="" className={styles.docMediaImg} loading="lazy" />
                        ))}
                      </div>
                    )}
                    {docUrl && (
                      <p className={styles.docLink}>
                        <a href={docUrl} target="_blank" rel="noopener noreferrer" className={styles.externalLink}>
                          Open full post →
                        </a>
                      </p>
                    )}
                    {isOwn && (
                      <div className={styles.actions}>
                        <button type="button" className={styles.actionBtn} onClick={() => setEditMode(true)}>
                          Edit
                        </button>
                        {!deleteConfirm ? (
                          <button type="button" className={styles.actionBtnDanger} onClick={() => setDeleteConfirm(true)}>
                            Delete
                          </button>
                        ) : (
                          <>
                            <span className={styles.deleteConfirmText}>Delete this post?</span>
                            <button type="button" className={styles.actionBtn} onClick={() => setDeleteConfirm(false)} disabled={deleteLoading}>
                              Cancel
                            </button>
                            <button type="button" className={styles.actionBtnDanger} onClick={handleDelete} disabled={deleteLoading}>
                              {deleteLoading ? 'Deleting…' : 'Yes, delete'}
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <div
                    className={styles.editForm}
                    onKeyDown={(e) => {
                      if ((e.key === 'Enter' || e.key === 'E') && (e.metaKey || e.ctrlKey)) {
                        e.preventDefault()
                        if (!editSaving) handleEditSave()
                      }
                    }}
                  >
                    <label className={styles.editLabel}>
                      Title
                      <input
                        type="text"
                        className={styles.editInput}
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        placeholder="Title"
                      />
                    </label>
                    <label className={styles.editLabel}>
                      Body
                      <textarea
                        className={styles.editTextarea}
                        value={editBody}
                        onChange={(e) => setEditBody(e.target.value)}
                        placeholder="Write your post…"
                        rows={8}
                      />
                    </label>
                    <div className={styles.editLabel}>
                      Media
                      <div
                        className={styles.mediaDropZone}
                        onDrop={handleDrop}
                        onDragOver={handleDragOver}
                      >
                        <input
                          ref={fileInputRef}
                          id="forum-edit-media-input"
                          type="file"
                          accept="image/jpeg,image/png,image/gif,image/webp"
                          multiple
                          className={styles.mediaInputHidden}
                          onChange={handleMediaFileChange}
                        />
                        <button type="button" className={styles.addMediaBtn} onClick={handleAddMediaClick}>
                          Add image
                        </button>
                        <span className={styles.mediaDropHint}>or drag and drop images here</span>
                        {(editMediaRefs.length + editMediaNewFiles.length) > 0 && (
                          <div className={styles.mediaPreviews}>
                            {doc.media?.slice(0, editMediaRefs.length).map((m, i) => (
                              <div key={`existing-${i}`} className={styles.mediaPreviewWrap}>
                                <img src={m.url} alt="" className={styles.mediaPreviewImg} loading="lazy" />
                                <button type="button" className={styles.mediaPreviewRemove} onClick={() => removeEditMediaRef(i)} aria-label="Remove">×</button>
                              </div>
                            ))}
                            {editMediaNewFiles.map((_, i) => (
                              <div key={`new-${i}`} className={styles.mediaPreviewWrap}>
                                <img src={editNewPreviewUrls[i]} alt="" className={styles.mediaPreviewImg} loading="lazy" />
                                <button type="button" className={styles.mediaPreviewRemove} onClick={() => removeEditMediaNewFile(i)} aria-label="Remove">×</button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className={styles.editActions}>
                      <button type="button" className={styles.actionBtn} onClick={() => setEditMode(false)} disabled={editSaving}>
                        Cancel
                      </button>
                      <button type="button" className={styles.actionBtnPrimary} onClick={handleEditSave} disabled={editSaving}>
                        {editSaving ? 'Saving…' : 'Save'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </article>

            {session && !replyingTo && (
              <section className={styles.replySection}>
                <div
                  ref={replyFormWrapRef}
                  className={styles.replyFormWrap}
                  tabIndex={-1}
                  onFocus={() => setKeyboardFocusIndex(forumFocusTotal - 1)}
                >
                <h2 className={styles.replySectionTitle}>Reply</h2>
                <form ref={replyFormRef} onSubmit={handleReplySubmit} className={styles.replyForm}>
                  <textarea
                    className={styles.replyTextarea}
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    onKeyDown={(e) => {
                      if ((e.key === 'Enter' || e.key === 'E') && (e.metaKey || e.ctrlKey)) {
                        e.preventDefault()
                        if (replyText.trim() && !posting) replyFormRef.current?.requestSubmit()
                      }
                    }}
                    placeholder="Write a reply…"
                    rows={3}
                    disabled={posting}
                  />
                  <button type="submit" className={styles.replySubmit} disabled={posting || !replyText.trim()}>
                    {posting ? 'Posting…' : 'Post reply'}
                  </button>
                </form>
                </div>
              </section>
            )}

            <section className={styles.repliesSection}>
              <h2 className={styles.replySectionTitle}>Replies & discussion</h2>
              {replyLoading ? (
                <p className={styles.muted}>Loading…</p>
              ) : replyTreeFlat.length === 0 ? (
                <p className={styles.muted}>No replies yet. Post a reply above or share this post.</p>
              ) : (
                <ul ref={repliesSectionRef} className={styles.replyList}>
                  {replyTreeFlat.map(({ reply: p, depth }, replyIndex) => {
                    const likedUri = likeUriOverrideMap[p.uri] ?? p.viewer?.like
                    const isLiked = !!likedUri
                    const likeLoading = likeLoadingMap[p.uri]
                    const handle = p.author.handle ?? p.author.did
                    const isComment = p.isComment === true
                    return (
                      <li
                        key={p.uri}
                        className={depth > 0 ? `${styles.replyItem} ${styles.replyItemNested}` : styles.replyItem}
                        data-forum-reply-index={replyIndex}
                        tabIndex={-1}
                        onFocus={() => setKeyboardFocusIndex(1 + replyIndex)}
                        style={{ marginLeft: depth * REPLY_THREAD_INDENT }}
                      >
                        <div className={postBlockStyles.postHead}>
                          {p.author.avatar ? (
                            <img src={p.author.avatar} alt="" className={postBlockStyles.avatar} loading="lazy" />
                          ) : (
                            <span className={styles.avatarPlaceholder} aria-hidden>{handle.slice(0, 1).toUpperCase()}</span>
                          )}
                          <div className={postBlockStyles.authorRow}>
                            <ProfileLink handle={handle} className={postBlockStyles.handleLink}>
                              @{handle}
                            </ProfileLink>
                            {isComment && <span className={styles.commentBadge}>standard.site comment</span>}
                            {p.record?.createdAt && (
                              <span className={postBlockStyles.postTimestamp} title={formatRelativeTimeTitle(p.record.createdAt)}>
                                {formatRelativeTime(p.record.createdAt)}
                              </span>
                            )}
                          </div>
                        </div>
                        {p.record?.text && (
                          <div className={styles.replyText}>
                            <PostText text={p.record.text} facets={!p.isComment ? p.record.facets : undefined} />
                          </div>
                        )}
                        <div className={styles.replyItemActions}>
                          {session && (
                            <button
                              type="button"
                              className={styles.replyToBtn}
                              onClick={() => handleReplyToComment(p)}
                            >
                              Reply
                            </button>
                          )}
                          {!isComment && (
                            <Link to={`/post/${encodeURIComponent(p.uri)}`} className={styles.viewPostLink}>
                              View post
                            </Link>
                          )}
                          {session && !isComment && (
                            <button
                              type="button"
                              className={isLiked ? styles.likeBtnLiked : styles.likeBtn}
                              onClick={() => handleLikePost(p)}
                              disabled={likeLoading}
                              title={isLiked ? 'Remove like' : 'Like'}
                            >
                              ♥ {p.likeCount ?? 0}
                            </button>
                          )}
                        </div>
                        {session && replyingTo?.uri === p.uri && (
                          <div className={postBlockStyles.inlineReplyFormWrap}>
                            <form onSubmit={handleReplySubmit} className={postBlockStyles.inlineReplyForm}>
                              <div className={postBlockStyles.inlineReplyFormHeader}>
                                <button
                                  type="button"
                                  className={postBlockStyles.cancelReply}
                                  onClick={() => setReplyingTo(null)}
                                  aria-label="Cancel reply"
                                >
                                  ×
                                </button>
                                {replyAs.handle && sessionsList?.length && currentDid ? (
                                  <ReplyAsRow
                                    replyAs={replyAs}
                                    sessionsList={sessionsList}
                                    switchAccount={switchAccount}
                                    currentDid={currentDid}
                                  />
                                ) : (
                                  <p className={postBlockStyles.replyAs}>
                                    <span className={postBlockStyles.replyAsLabel}>Replying as</span>
                                    <span className={postBlockStyles.replyAsUserChip}>
                                      {replyAs.avatar ? (
                                        <img src={replyAs.avatar} alt="" className={postBlockStyles.replyAsAvatar} loading="lazy" />
                                      ) : (
                                        <span className={postBlockStyles.replyAsAvatarPlaceholder} aria-hidden>{replyAs.handle.slice(0, 1).toUpperCase()}</span>
                                      )}
                                      <span className={postBlockStyles.replyAsHandle}>@{replyAs.handle}</span>
                                    </span>
                                  </p>
                                )}
                              </div>
                              <textarea
                                ref={inlineReplyTextareaRef}
                                placeholder={`Reply to @${handle}…`}
                                value={replyText}
                                onChange={(e) => setReplyText(e.target.value)}
                                onKeyDown={(e) => {
                                  if ((e.key === 'Enter' || e.key === 'E') && (e.metaKey || e.ctrlKey)) {
                                    e.preventDefault()
                                    if (replyText.trim() && !posting) (e.target as HTMLTextAreaElement).form?.requestSubmit()
                                  }
                                }}
                                className={postBlockStyles.textarea}
                                rows={2}
                                maxLength={300}
                              />
                              <p className={postBlockStyles.hint}>⌘ Enter or ⌘ E to post</p>
                              <button type="submit" className={postBlockStyles.submit} disabled={posting || !replyText.trim()}>
                                {posting ? 'Posting…' : 'Post reply'}
                              </button>
                            </form>
                          </div>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
  )
}
