/**
 * Build a safe download filename from a post URI (e.g. at://did:plc:.../app.bsky.feed.post/3k...).
 * Sanitizes for filesystem and truncates; appends timestamp for uniqueness.
 * If imageIndex is provided, inserts -0, -1, etc. before the extension for multi-image posts.
 */
function filenameFromPostUri(postUri: string, extension: string, imageIndex?: number): string {
  const sanitized = postUri.replace(/[^a-zA-Z0-9_.-]/g, '_').replace(/_+/g, '_').slice(0, 120)
  const suffix = imageIndex != null ? `-${imageIndex}` : ''
  return `artsky-${sanitized || 'post'}-${Date.now()}${suffix}.${extension}`
}

/**
 * Download an image with "@handle" overlaid in a corner (small text).
 * Prefers drawing on canvas so we can add the handle; if CORS blocks, falls back to direct download.
 * If postUri is provided, the file is named from the post URI; otherwise from handle + timestamp.
 * imageIndex is optional; when set (e.g. 0, 1 for multi-image posts), the filename gets a -0, -1 suffix for uniqueness.
 */
export function downloadImageWithHandle(
  imageUrl: string,
  handle: string,
  postUri?: string,
  imageIndex?: number
): Promise<void> {
  const label = `@${handle}`
  const filename =
    postUri != null
      ? filenameFromPostUri(postUri, 'png', imageIndex)
      : `artsky-${handle.replace(/[^a-zA-Z0-9_-]/g, '_')}-${Date.now()}${imageIndex != null ? `-${imageIndex}` : ''}.png`

  return new Promise((resolve, _reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'

    img.onerror = () => {
      // CORS or load failed: fallback to direct download (no handle on image)
      const a = document.createElement('a')
      a.href = imageUrl
      a.download = filename
      a.rel = 'noopener'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      resolve()
    }

    img.onload = () => {
      try {
        const w = img.naturalWidth
        const h = img.naturalHeight
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          img.onerror?.(new Event('error'))
          return
        }
        ctx.drawImage(img, 0, 0)
        // Small text in bottom-right with padding; scale font with image size
        const padding = Math.max(8, Math.min(w, h) * 0.02)
        const fontSize = Math.max(10, Math.min(24, Math.min(w, h) * 0.04))
        ctx.font = `${fontSize}px system-ui, -apple-system, sans-serif`
        const textWidth = ctx.measureText(label).width
        const x = w - textWidth - padding
        const y = h - padding
        // Outline (black) then fill (white) for visibility on any background
        ctx.strokeStyle = '#000'
        ctx.lineWidth = Math.max(1, fontSize / 8)
        ctx.lineJoin = 'round'
        ctx.strokeText(label, x, y)
        ctx.fillStyle = '#fff'
        ctx.fillText(label, x, y)
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              img.onerror?.(new Event('error'))
              return
            }
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = filename
            a.rel = 'noopener'
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
            URL.revokeObjectURL(url)
            resolve()
          },
          'image/png',
          0.95
        )
      } catch {
        img.onerror?.(new Event('error'))
      }
    }

    img.src = imageUrl
  })
}

function isM3u8Url(url: string): boolean {
  return /\.m3u8(\?|$)/i.test(url) || url.includes('m3u8')
}

/** Try to get an mp4 URL from the same path as an m3u8 (some CDNs serve both). */
async function tryMp4Url(m3u8Url: string): Promise<string | null> {
  try {
    const withoutQuery = m3u8Url.split('?')[0]
    const mp4Url = withoutQuery.replace(/\.m3u8$/i, '.mp4') + (m3u8Url.includes('?') ? '?' + m3u8Url.split('?')[1] : '')
    const res = await fetch(mp4Url, { method: 'HEAD' })
    if (res.ok) {
      const ct = res.headers.get('content-type') || ''
      if (ct.includes('video/mp4') || ct.includes('video/')) return mp4Url
    }
  } catch {
    // ignore
  }
  return null
}

function isVideoBlob(blob: Blob): boolean {
  const t = (blob.type || '').toLowerCase()
  return t.startsWith('video/') && !t.includes('mpegurl') && !t.includes('x-mpegurl')
}

/** Trigger download of a video URL; filename is derived from postUri. Always downloads as video (mp4 etc), never m3u8. */
export async function downloadVideoWithPostUri(videoUrl: string, postUri: string): Promise<void> {
  let downloadUrl = videoUrl
  let ext = 'mp4'
  const match = videoUrl.match(/\.(mp4|webm|mov|m4v)(\?|$)/i)
  if (match) {
    ext = match[1].toLowerCase()
  } else if (isM3u8Url(videoUrl)) {
    const mp4Url = await tryMp4Url(videoUrl)
    if (mp4Url) downloadUrl = mp4Url
  }
  const filename = filenameFromPostUri(postUri, ext)
  try {
    const res = await fetch(downloadUrl, { mode: 'cors', headers: { Accept: 'video/mp4,video/*' } })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const blob = await res.blob()
    if (isM3u8Url(videoUrl) && !isVideoBlob(blob)) {
      const mp4Url = await tryMp4Url(videoUrl)
      if (mp4Url) {
        const res2 = await fetch(mp4Url, { mode: 'cors' })
        if (res2.ok) {
          const blob2 = await res2.blob()
          if (isVideoBlob(blob2)) {
            const url = URL.createObjectURL(blob2)
            const a = document.createElement('a')
            a.href = url
            a.download = filename
            a.rel = 'noopener'
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
            URL.revokeObjectURL(url)
            return
          }
        }
      }
      throw new Error('Video format not available')
    }
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  } catch {
    const a = document.createElement('a')
    a.href = downloadUrl
    a.download = filename
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }
}
