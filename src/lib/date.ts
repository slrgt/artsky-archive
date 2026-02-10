/**
 * Relative time string (e.g. "2h", "3d", "Mar 5").
 */
export function formatRelativeTime(isoDate: string): string {
  const d = new Date(isoDate)
  const now = new Date()
  const sec = (now.getTime() - d.getTime()) / 1000
  if (sec < 60) return 'now'
  if (sec < 3600) return `${Math.floor(sec / 60)}m`
  if (sec < 86400) return `${Math.floor(sec / 3600)}h`
  if (sec < 2592000) return `${Math.floor(sec / 86400)}d`
  if (sec < 31536000) return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

/** Longer relative phrase for tooltips (e.g. "2 hours ago", "Mar 5"). */
export function formatRelativeTimeTitle(isoDate: string): string {
  const d = new Date(isoDate)
  const now = new Date()
  const sec = (now.getTime() - d.getTime()) / 1000
  if (sec < 60) return 'Just now'
  if (sec < 3600) {
    const m = Math.floor(sec / 60)
    return `${m} minute${m === 1 ? '' : 's'} ago`
  }
  if (sec < 86400) {
    const h = Math.floor(sec / 3600)
    return `${h} hour${h === 1 ? '' : 's'} ago`
  }
  if (sec < 2592000) {
    const day = Math.floor(sec / 86400)
    return `${day} day${day === 1 ? '' : 's'} ago`
  }
  if (sec < 31536000) return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export function formatExactDateTime(isoDate: string): string {
  return new Date(isoDate).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

/** Like formatExactDateTime but with full month name (e.g. "January 15, 2024, 3:42 PM"). */
export function formatExactDateTimeLongMonth(isoDate: string): string {
  const d = new Date(isoDate)
  const datePart = d.toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
  const timePart = d.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
  return `${datePart}, ${timePart}`
}
