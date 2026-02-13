import { createContext, useContext } from 'react'

export type ModalTopBarSlots = {
  centerSlot: HTMLDivElement | null
  rightSlot: HTMLDivElement | null
  isMobile: boolean
}

const ModalTopBarSlotContext = createContext<ModalTopBarSlots | null>(null)

export function useModalTopBarSlot() {
  return useContext(ModalTopBarSlotContext)
}

export { ModalTopBarSlotContext }
