import { createContext, useContext } from 'react'

export type ModalTopBarSlots = {
  centerSlot: HTMLDivElement | null
  rightSlot: HTMLDivElement | null
  /** On mobile: slot in the bottom action bar (between back and expand) for e.g. profile NSFW toggle */
  mobileBottomBarSlot: HTMLDivElement | null
  isMobile: boolean
}

const ModalTopBarSlotContext = createContext<ModalTopBarSlots | null>(null)

export function useModalTopBarSlot() {
  return useContext(ModalTopBarSlotContext)
}

export { ModalTopBarSlotContext }
