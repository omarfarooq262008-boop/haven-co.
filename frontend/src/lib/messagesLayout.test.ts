import { describe, expect, it } from 'vitest'
import { composerIsUncovered, MESSAGES_LAYOUT } from './messagesLayout'

describe('messages layout — input must stay uncovered', () => {
  it('exports the chat panel layout contract', () => {
    expect(MESSAGES_LAYOUT.scrollTestId).toBe('messages-scroll')
    expect(MESSAGES_LAYOUT.composerTestId).toBe('messages-composer')
    expect(MESSAGES_LAYOUT.bubbleMaxWidthPercent).toBe(75)
    expect(MESSAGES_LAYOUT.composerZIndex).toBe(20)
  })

  it('detects when the message list covers the composer', () => {
    const list = { top: 80, bottom: 500 }
    const composer = { top: 520, bottom: 600 }
    expect(composerIsUncovered(list, composer)).toBe(true)

    // Overflow bug: list paints over the input
    const covering = { top: 80, bottom: 580 }
    expect(composerIsUncovered(covering, composer)).toBe(false)
  })
})
