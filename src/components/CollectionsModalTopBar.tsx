import { createPortal } from 'react-dom'
import { useViewMode, VIEW_LABELS } from '../context/ViewModeContext'
import { useArtOnly } from '../context/ArtOnlyContext'
import { useModeration } from '../context/ModerationContext'
import { useModalTopBarSlot } from '../context/ModalTopBarSlotContext'
import styles from './Layout.module.css'

/** Eye icon: closed = SFW, half = Blurred, open = NSFW */
function NsfwEyeIcon({ mode }: { mode: 'open' | 'half' | 'closed' }) {
  const eyePath = 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z'
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={eyePath} />
      {mode === 'open' && (
        <>
          <circle cx="12" cy="12" r="3" />
          <line x1="6" y1="5" x2="5" y2="3" />
          <line x1="12" y1="4" x2="12" y2="2" />
          <line x1="18" y1="5" x2="19" y2="3" />
        </>
      )}
      {mode === 'half' && (
        <>
          <path d="M4 12 Q12 16 20 12" />
          <line x1="6" y1="13" x2="5" y2="15" />
          <line x1="12" y1="14.5" x2="12" y2="17" />
          <line x1="18" y1="13" x2="19" y2="15" />
        </>
      )}
      {mode === 'closed' && (
        <>
          <path d="M5 19 Q12 21 19 19" />
          <line x1="7" y1="19" x2="6" y2="22" />
          <line x1="12" y1="19" x2="12" y2="23" />
          <line x1="17" y1="19" x2="18" y2="22" />
        </>
      )}
    </svg>
  )
}

function CardModeIcon({ mode }: { mode: 'default' | 'minimalist' | 'artOnly' }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {mode === 'default' && (
        <>
          <rect x="4" y="3" width="16" height="18" rx="2" />
          <rect x="6" y="5" width="12" height="8" rx="1" />
          <line x1="6" y1="16" x2="10" y2="16" />
          <line x1="6" y1="19" x2="14" y2="19" />
        </>
      )}
      {mode === 'minimalist' && (
        <>
          <rect x="4" y="3" width="16" height="18" rx="2" />
          <rect x="6" y="5" width="12" height="8" rx="1" />
        </>
      )}
      {mode === 'artOnly' && (
        <rect x="4" y="3" width="16" height="18" rx="2" />
      )}
    </svg>
  )
}

const NSFW_CYCLE = ['sfw', 'blurred', 'nsfw'] as const

function Column1Icon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="7" y="3" width="10" height="18" rx="1" />
    </svg>
  )
}
function Column2Icon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="3" width="8" height="18" rx="1" />
      <rect x="13" y="3" width="8" height="18" rx="1" />
    </svg>
  )
}
function Column3Icon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="2" y="3" width="5" height="18" rx="1" />
      <rect x="9.5" y="3" width="5" height="18" rx="1" />
      <rect x="17" y="3" width="5" height="18" rx="1" />
    </svg>
  )
}

/** Renders NSFW eye + column + card mode buttons into the modal top bar right slot (for Collections modal). */
export default function CollectionsModalTopBar() {
  const slots = useModalTopBarSlot()
  const { viewMode, cycleViewMode } = useViewMode()
  const { cardViewMode, cycleCardView } = useArtOnly()
  const { nsfwPreference, setNsfwPreference } = useModeration()

  const rightSlot = slots?.rightSlot ?? null
  if (!rightSlot) return null

  return createPortal(
    <>
      <button
        type="button"
        className={`${styles.headerBtn} ${nsfwPreference !== 'sfw' ? styles.headerBtnActive : ''}`}
        onClick={() => {
          const i = NSFW_CYCLE.indexOf(nsfwPreference)
          setNsfwPreference(NSFW_CYCLE[(i + 1) % NSFW_CYCLE.length])
        }}
        title={`${nsfwPreference}. Click to cycle: SFW → Blurred → NSFW`}
        aria-label={`NSFW filter: ${nsfwPreference}`}
      >
        <NsfwEyeIcon mode={nsfwPreference === 'sfw' ? 'closed' : nsfwPreference === 'blurred' ? 'half' : 'open'} />
      </button>
      <button
        type="button"
        className={styles.headerBtn}
        onClick={cycleViewMode}
        title={`${VIEW_LABELS[viewMode]}. Click to cycle.`}
        aria-label={`${VIEW_LABELS[viewMode]}. Click to cycle.`}
      >
        {viewMode === '1' && <Column1Icon />}
        {viewMode === '2' && <Column2Icon />}
        {viewMode === '3' && <Column3Icon />}
      </button>
      <button
        type="button"
        className={`${styles.headerBtn} ${cardViewMode !== 'default' ? styles.headerBtnActive : ''}`}
        onClick={cycleCardView}
        aria-label={cardViewMode === 'default' ? 'Show all' : cardViewMode === 'minimalist' ? 'Minimalist' : 'Art only'}
        title={cardViewMode === 'default' ? 'Show all' : cardViewMode === 'minimalist' ? 'Minimalist' : 'Art only'}
      >
        <CardModeIcon mode={cardViewMode === 'default' ? 'default' : cardViewMode === 'minimalist' ? 'minimalist' : 'artOnly'} />
      </button>
    </>,
    rightSlot
  )
}
