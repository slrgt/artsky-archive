/**
 * Inline SVG icons matching the assets in public/icons/.
 * Stroke/fill use currentColor so they match the theme.
 */

const svgProps = { fill: 'none' as const, stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }

/** Card mode: full card (default) – matches card-default.svg */
export function CardDefaultIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fillRule="evenodd" clipRule="evenodd" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <g transform="matrix(1,0,0,1.208333,-2,-2.875)">
        <path d="M18,5.828L18,12.172C18,12.629 17.552,13 17,13L7,13C6.448,13 6,12.629 6,12.172L6,5.828C6,5.371 6.448,5 7,5L17,5C17.552,5 18,5.371 18,5.828Z" fill="none" stroke="currentColor" strokeWidth={0.9} strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <g transform="matrix(1,0,0,-1,2.497512,27.667948)">
        <circle cx="7.5" cy="13.5" r="0.5" fill="currentColor" stroke="none" />
      </g>
      <g transform="matrix(0.833333,0,0,0.833333,2.166773,0.332164)">
        <path d="M6,19L12.8,19" fill="none" stroke="currentColor" strokeWidth={0.48} strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <g transform="matrix(0.4048,0,0,0.833333,6.182432,-0.33954)">
        <path d="M6,19L12.8,19" fill="none" stroke="currentColor" strokeWidth={0.5} strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <g transform="matrix(0.833333,0,0,0.833333,0,0)">
        <path d="M20,5.4L20,18.6C20,19.925 18.925,21 17.6,21L6.4,21C5.075,21 4,19.925 4,18.6L4,5.4C4,4.075 5.075,3 6.4,3L17.6,3C18.925,3 20,4.075 20,5.4Z" {...svgProps} />
      </g>
    </svg>
  )
}

/** Card mode: minimalist – matches card-minimalist.svg */
export function CardMinimalistIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fillRule="evenodd" clipRule="evenodd" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <g transform="matrix(0.833333,0,0,0.833333,0,0)">
        <path d="M20,5.4L20,18.6C20,19.925 18.925,21 17.6,21L6.4,21C5.075,21 4,19.925 4,18.6L4,5.4C4,4.075 5.075,3 6.4,3L17.6,3C18.925,3 20,4.075 20,5.4Z" {...svgProps} />
      </g>
      <g transform="matrix(1,0,0,1.208333,-2,-2.875)">
        <path d="M18,5.828L18,12.172C18,12.629 17.552,13 17,13L7,13C6.448,13 6,12.629 6,12.172L6,5.828C6,5.371 6.448,5 7,5L17,5C17.552,5 18,5.371 18,5.828Z" fill="none" stroke="currentColor" strokeWidth={0.9} strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  )
}

/** Card mode: art only – matches card-artOnly.svg */
export function CardArtOnlyIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <rect x="4" y="3" width="16" height="18" rx="2" {...svgProps} />
    </svg>
  )
}

/** NSFW eye: open – matches eye-open.svg */
export function EyeOpenIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" {...svgProps} />
      <circle cx="12" cy="12" r="3" {...svgProps} />
      <line x1="6" y1="5" x2="5" y2="3" {...svgProps} />
      <line x1="12" y1="4" x2="12" y2="2" {...svgProps} />
      <line x1="18" y1="5" x2="19" y2="3" {...svgProps} />
    </svg>
  )
}

/** NSFW eye: half – matches eye-half.svg */
export function EyeHalfIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fillRule="evenodd" clipRule="evenodd" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <path d="M1,12C1,12 5,4 12,4C19,4 23,12 23,12C23,12 19,20 12,20C5,20 1,12 1,12Z" fill="none" fillRule="nonzero" stroke="currentColor" strokeWidth={2} />
      <path d="M2,11C7.333,13.667 16.667,13.667 22,11" fill="none" fillRule="nonzero" stroke="currentColor" strokeWidth={2} />
      <path d="M6,13L5,15" fill="none" fillRule="nonzero" stroke="currentColor" strokeWidth={2} />
      <path d="M12,13.5L12,17" fill="none" fillRule="nonzero" stroke="currentColor" strokeWidth={2} />
      <path d="M18,13L19,15" fill="none" fillRule="nonzero" stroke="currentColor" strokeWidth={2} />
    </svg>
  )
}

/** NSFW eye: closed – matches eye-closed.svg */
export function EyeClosedIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fillRule="evenodd" clipRule="evenodd" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <path d="M1,12C1,12 5,4 12,4C19,4 23,12 23,12C23,12 19,20 12,20C5,20 1,12 1,12Z" fill="none" fillRule="nonzero" stroke="currentColor" strokeWidth={2} />
      <path d="M7,19L6,22" fill="none" fillRule="nonzero" stroke="currentColor" strokeWidth={2} />
      <path d="M12.011,20.266L12,23" fill="none" fillRule="nonzero" stroke="currentColor" strokeWidth={2} />
      <path d="M17,19L18,22" fill="none" fillRule="nonzero" stroke="currentColor" strokeWidth={2} />
    </svg>
  )
}
