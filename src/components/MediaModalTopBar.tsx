import { createPortal } from 'react-dom'
import type { ReactNode } from 'react'
import { useViewMode, VIEW_LABELS } from '../context/ViewModeContext'
import { useArtOnly } from '../context/ArtOnlyContext'
import { useModeration } from '../context/ModerationContext'
import { useModalTopBarSlot } from '../context/ModalTopBarSlotContext'
import styles from './Layout.module.css'

function ArtOnlyEyeIcon({ mode }: { mode: 'open' | 'half' | 'closed' }) {
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

const NSFW_CYCLE = ['sfw', 'blurred', 'nsfw'] as const

/** Renders optional center content + SFW, eye, and column toggles into modal top bar slots. Use inside AppModal. */
export default function MediaModalTopBar({ centerContent }: { centerContent?: ReactNode }) {
  const slots = useModalTopBarSlot()
  const { viewMode, cycleViewMode } = useViewMode()
  const { cardViewMode, cycleCardView } = useArtOnly()
  const { nsfwPreference, setNsfwPreference } = useModeration()

  const centerSlot = slots?.centerSlot ?? null
  const rightSlot = slots?.rightSlot ?? null

  return (
    <>
      {centerSlot && centerContent != null
        ? createPortal(centerContent, centerSlot)
        : null}
      {rightSlot
        ? createPortal(
            <>
              <button
                type="button"
                className={`${styles.headerBtn} ${cardViewMode !== 'default' ? styles.headerBtnActive : ''}`}
                onClick={cycleCardView}
                aria-label={cardViewMode === 'default' ? 'Minimalist' : cardViewMode === 'minimalist' ? 'Art only' : 'Show all'}
                title={cardViewMode === 'default' ? 'Minimalist' : cardViewMode === 'minimalist' ? 'Art only' : 'Show all'}
              >
                <ArtOnlyEyeIcon mode={cardViewMode === 'default' ? 'open' : cardViewMode === 'minimalist' ? 'half' : 'closed'} />
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
                className={`${styles.headerBtn} ${nsfwPreference !== 'sfw' ? styles.headerBtnActive : ''}`}
                onClick={() => {
                  const i = NSFW_CYCLE.indexOf(nsfwPreference)
                  setNsfwPreference(NSFW_CYCLE[(i + 1) % NSFW_CYCLE.length])
                }}
                title={`${nsfwPreference}. Click to cycle: SFW → Blurred → NSFW`}
                aria-label={`NSFW filter: ${nsfwPreference}`}
              >
                {nsfwPreference === 'sfw' ? 'SFW' : nsfwPreference === 'blurred' ? 'Blurred' : 'NSFW'}
              </button>
            </>,
            rightSlot
          )
        : null}
    </>
  )
}
