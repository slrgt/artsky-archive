import { RichText as AtpRichText } from '@atproto/api'
import ProfileLink from './ProfileLink'
import TagLink from './TagLink'
import styles from './PostText.module.css'

/** Bluesky facet from post record (optional). When present, links/mentions/tags render from facets. */
export type PostTextFacet = { index: { byteStart: number; byteEnd: number }; features: Array<{ $type?: string; uri?: string; did?: string; tag?: string }> }

/** Matches: emails (first so domain-only part isn’t linked), explicit URLs, www., bare domains, hashtags, @mentions. */
const LINKIFY_REGEX =
  /([\w.%+-]+@(?:[\w-]+\.)+[a-zA-Z]{2,})|(https?:\/\/[^\s<>"']+)|(www\.[^\s<>"'\],;:)!?]+)|(?<![@\/])((?:[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}(?:\/[^\s<>"']*)?)|(#[\w]+)|(?<![a-zA-Z0-9])(@[\w.-]+)/gi

function linkDisplayText(href: string, value: string, display: 'url' | 'domain'): string {
  if (display !== 'domain') return value
  try {
    const u = new URL(href)
    return u.hostname.replace(/^www\./, '')
  } catch {
    return value
  }
}

export interface PostTextProps {
  text: string
  /** Bluesky facets from record.facets – when provided, links/mentions/tags render as clickable from facets. */
  facets?: PostTextFacet[] | null | unknown[]
  className?: string
  /** Truncate to this many characters (e.g. 80 for cards). No truncation if undefined. */
  maxLength?: number
  /** Stop click propagation (use inside a card that is itself a link). */
  stopPropagation?: boolean
  /** Show link as domain name only (e.g. "example.com"). Default "url" shows full URL. */
  linkDisplay?: 'url' | 'domain'
}

function renderSegment(
  seg: { type: 'text' | 'url' | 'bareUrl' | 'email' | 'hashtag' | 'mention'; value: string; href?: string; tag?: string; did?: string },
  i: number,
  linkDisplay: 'url' | 'domain',
  onClick: ((e: React.MouseEvent) => void) | undefined
) {
  if (seg.type === 'text') {
    return <span key={i}>{seg.value}</span>
  }
  if (seg.type === 'email') {
    const raw = seg.value.replace(/[.,;:)!?]+$/, '')
    return (
      <a key={i} href={`mailto:${raw}`} className={styles.link} onClick={onClick} title={raw}>
        {seg.value}
      </a>
    )
  }
  if (seg.type === 'url' || (seg.type === 'bareUrl' && seg.href)) {
    const href = seg.href ?? seg.value
    const display = linkDisplayText(href, seg.value, linkDisplay)
    return (
      <a key={i} href={href} target="_blank" rel="noopener noreferrer" className={styles.link} onClick={onClick} title={href}>
        {display}
      </a>
    )
  }
  if (seg.type === 'bareUrl') {
    const raw = seg.value.replace(/[.,;:)!?]+$/, '')
    const href = `https://${raw}`
    const display = linkDisplayText(href, seg.value, linkDisplay)
    return (
      <a key={i} href={href} target="_blank" rel="noopener noreferrer" className={styles.link} onClick={onClick} title={href}>
        {display}
      </a>
    )
  }
  if (seg.type === 'hashtag') {
    const tag = (seg.tag ?? seg.value).replace(/^#/, '')
    return (
      <TagLink key={i} tag={tag} className={styles.hashtag} onClick={onClick}>
        {seg.value}
      </TagLink>
    )
  }
  const handle = seg.value.replace(/^@/, '')
  return (
    <ProfileLink key={i} handle={handle} className={styles.mention} onClick={onClick}>
      {seg.value}
    </ProfileLink>
  )
}

export default function PostText({ text, facets, className, maxLength, stopPropagation, linkDisplay = 'url' }: PostTextProps) {
  const onClick = stopPropagation ? (e: React.MouseEvent) => e.stopPropagation() : undefined

  if (facets && Array.isArray(facets) && facets.length > 0) {
    try {
      const rt = new AtpRichText({ text, facets: facets as NonNullable<ConstructorParameters<typeof AtpRichText>[0]>['facets'] })
      const segs: Array<{ type: 'text' | 'url' | 'bareUrl' | 'email' | 'hashtag' | 'mention'; value: string; href?: string; tag?: string; did?: string }> = []
      let len = 0
      for (const seg of rt.segments()) {
        const value = seg.text
        let added = value.length
        if (seg.isLink() && seg.link?.uri) {
          const uri = seg.link.uri
          const looksLikeDomainOnly = /^https?:\/\/[^/]+$/.test(uri) || !/^https?:\/\//i.test(uri)
          const prev = segs[segs.length - 1]
          if (looksLikeDomainOnly && prev?.type === 'text' && /@\s*$/.test(prev.value)) {
            const localPart = prev.value.replace(/\s*@\s*$/, '')
            segs.pop()
            len -= prev.value.length
            const email = localPart ? `${localPart}@${value}` : value
            segs.push({ type: 'email', value: email })
            added = email.length
          } else {
            segs.push({ type: 'url', value, href: uri })
          }
        } else if (seg.isMention() && seg.mention?.did) {
          segs.push({ type: 'mention', value, did: seg.mention.did })
        } else if (seg.isTag() && seg.tag?.tag != null) {
          segs.push({ type: 'hashtag', value, tag: '#' + seg.tag.tag })
        } else {
          segs.push({ type: 'text', value })
        }
        len += added
        if (maxLength != null && len >= maxLength && segs[segs.length - 1].type === 'text') {
          const last = segs[segs.length - 1]
          const take = last.value.length - (len - maxLength)
          if (take < last.value.length) {
            segs[segs.length - 1] = { ...last, value: last.value.slice(0, take) + '…' }
          }
          break
        }
      }
      if (segs.length > 0) {
        return (
          <span className={className ?? undefined}>
            {segs.map((seg, i) => renderSegment(seg, i, linkDisplay, onClick))}
          </span>
        )
      }
    } catch {
      /* fall through to regex linkify */
    }
  }

  const segments: Array<{ type: 'text' | 'url' | 'bareUrl' | 'email' | 'hashtag' | 'mention'; value: string }> = []
  let lastIndex = 0
  let match: RegExpExecArray | null
  const re = new RegExp(LINKIFY_REGEX.source, 'gi')
  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', value: text.slice(lastIndex, match.index) })
    }
    const value = match[1] ?? match[2] ?? match[3] ?? match[4] ?? match[5] ?? match[6]
    if (match[1]) {
      segments.push({ type: 'email', value })
    } else if (match[2]) {
      segments.push({ type: 'url', value })
    } else if (match[3] || match[4]) {
      segments.push({ type: 'bareUrl', value })
    } else if (match[5]) {
      segments.push({ type: 'hashtag', value })
    } else if (match[6]) {
      segments.push({ type: 'mention', value })
    }
    lastIndex = re.lastIndex
  }
  if (lastIndex < text.length) {
    segments.push({ type: 'text', value: text.slice(lastIndex) })
  }

  let displaySegments: typeof segments
  if (maxLength != null) {
    let used = 0
    displaySegments = []
    for (const seg of segments) {
      if (seg.type === 'text') {
        if (used + seg.value.length <= maxLength) {
          displaySegments.push(seg)
          used += seg.value.length
        } else {
          const take = maxLength - used
          if (take > 0) {
            displaySegments.push({ type: 'text', value: seg.value.slice(0, take) + '…' })
          }
          break
        }
      } else {
        displaySegments.push(seg)
      }
    }
  } else {
    displaySegments = segments
  }

  const displayText = segments.length === 0 ? (maxLength != null && text.length > maxLength ? text.slice(0, maxLength) + '…' : text) : ''
  if (displaySegments.length === 0) {
    return <span className={className}>{displayText || text}</span>
  }

  return (
    <span className={className ?? undefined}>
      {displaySegments.map((seg, i) => renderSegment(seg, i, linkDisplay, onClick))}
    </span>
  )
}
