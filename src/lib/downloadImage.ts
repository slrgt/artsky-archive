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

/** Trigger download of a video URL; filename is derived from postUri. */
export function downloadVideoWithPostUri(videoUrl: string, postUri: string): void {
  const match = videoUrl.match(/\.(mp4|webm|mov|m4v)(\?|$)/i)
  const ext = match ? match[1].toLowerCase() : 'mp4'
  const filename = filenameFromPostUri(postUri, ext)
  const a = document.createElement('a')
  a.href = videoUrl
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}
