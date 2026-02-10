import { createPortal } from 'react-dom'
import { useViewMode, VIEW_LABELS } from '../context/ViewModeContext'
import { useArtOnly } from '../context/ArtOnlyContext'
import { useModeration } from '../context/ModerationContext'
import { useModalTopBarSlot } from '../context/ModalTopBarSlotContext'
import { CardDefaultIcon, CardMinimalistIcon, CardArtOnlyIcon, EyeOpenIcon, EyeHalfIcon, EyeClosedIcon } from './Icons'
import styles from './Layout.module.css'

/** Eye icon: closed = SFW, half = Blurred, open = NSFW. Inline SVG matching public/icons/eye-*.svg */
function NsfwEyeIcon({ mode }: { mode: 'open' | 'half' | 'closed' }) {
  if (mode === 'open') return <EyeOpenIcon size={24} />
  if (mode === 'half') return <EyeHalfIcon size={24} />
  return <EyeClosedIcon size={24} />
}

/** Card mode icons. Inline SVG matching public/icons/card-*.svg */
function CardModeIcon({ mode }: { mode: 'default' | 'minimalist' | 'artOnly' }) {
  if (mode === 'default') return <CardDefaultIcon size={20} />
  if (mode === 'minimalist') return <CardMinimalistIcon size={20} />
  return <CardArtOnlyIcon size={20} />
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
