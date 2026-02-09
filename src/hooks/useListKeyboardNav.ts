import { useEffect, useRef } from 'react'

export type ListKeyboardNavOptions = {
  /** When false, the handler does nothing. Use when the popup/list is active. */
  enabled: boolean
  /** Number of focusable items. */
  itemCount: number
  /** Current focused index (0-based). */
  focusedIndex: number
  /** Set focused index (e.g. from useState). */
  setFocusedIndex: (next: number | ((prev: number) => number)) => void
  /** Called when user presses Enter or E (activate current item). */
  onActivate: (index: number) => void
  /** Number of columns for grid nav. When 1 or undefined, linear (W/S/arrows = prev/next). When 2+, grid (arrows = up/down/left/right). */
  columns?: number
  /** Use capture phase so this runs before feed/page handlers. Default true for popups. */
  useCapture?: boolean
}

/**
 * Shared keyboard nav for list/grid content in modals and full pages.
 * Handles W/S/A/D and Arrow keys for movement, Enter/E for activate.
 * Use in Forum list, Collections list, Collection detail grid, Forum post detail, etc.
 */
export function useListKeyboardNav({
  enabled,
  itemCount,
  focusedIndex,
  setFocusedIndex,
  onActivate,
  columns = 1,
  useCapture = true,
}: ListKeyboardNavOptions): void {
  const focusedIndexRef = useRef(focusedIndex)
  focusedIndexRef.current = focusedIndex
  const onActivateRef = useRef(onActivate)
  onActivateRef.current = onActivate

  useEffect(() => {
    if (!enabled || itemCount <= 0) return

    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable) {
        if (e.key === 'Escape') {
          e.preventDefault()
          target.blur()
        }
        return
      }
      if (e.ctrlKey || e.metaKey) return

      const key = e.key.toLowerCase()
      const isNav = key === 'w' || key === 's' || key === 'a' || key === 'd' || key === 'enter' || key === 'e' ||
        e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight'
      if (!isNav) return

      e.preventDefault()
      e.stopPropagation()

      const i = focusedIndexRef.current
      const count = itemCount
      const cols = Math.max(1, columns)

      if (key === 'enter' || key === 'e') {
        onActivateRef.current(i)
        return
      }

      if (cols <= 1) {
        if (key === 'w' || key === 'a' || e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
          setFocusedIndex((prev) => Math.max(0, prev - 1))
        } else {
          setFocusedIndex((prev) => Math.min(count - 1, prev + 1))
        }
        return
      }

      const row = Math.floor(i / cols)
      const col = i % cols
      if (key === 'w' || e.key === 'ArrowUp') {
        const nextRow = Math.max(0, row - 1)
        setFocusedIndex(nextRow * cols + col)
      } else if (key === 's' || e.key === 'ArrowDown') {
        const nextRow = Math.min(Math.floor((count - 1) / cols), row + 1)
        const next = nextRow * cols + col
        setFocusedIndex(Math.min(next, count - 1))
      } else if (key === 'a' || e.key === 'ArrowLeft') {
        if (col > 0) setFocusedIndex(i - 1)
      } else {
        if (col < cols - 1 && i + 1 < count) setFocusedIndex(i + 1)
      }
    }

    window.addEventListener('keydown', onKeyDown, useCapture)
    return () => window.removeEventListener('keydown', onKeyDown, useCapture)
  }, [enabled, itemCount, columns, setFocusedIndex, useCapture])
}
