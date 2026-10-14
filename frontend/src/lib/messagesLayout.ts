/** Layout contract for the Messages chat panel (keeps the composer uncovered). */

export const MESSAGES_LAYOUT = {
  scrollTestId: 'messages-scroll',
  composerTestId: 'messages-composer',
  /** Bubble max width relative to the list */
  bubbleMaxWidthPercent: 75,
  /** Composer stacks above the list in paint order */
  composerZIndex: 20,
} as const

/**
 * True when the message list box does not overlap/cover the composer.
 * Call with getBoundingClientRect() results after layout.
 */
export function composerIsUncovered(
  listRect: { top: number; bottom: number },
  composerRect: { top: number; bottom: number },
): boolean {
  // List must sit entirely above the composer (allow 1px subpixel slack)
  return listRect.bottom <= composerRect.top + 1
}
