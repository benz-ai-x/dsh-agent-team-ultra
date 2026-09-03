import { describe, expect, it } from 'vitest'
import { StudioSnapshotFeed } from '../src/studio-feed.ts'

describe('Studio snapshot feed', () => {
  it('opens with a complete snapshot and coalesces pending invalidations into one replacement', async () => {
    const feed = new StudioSnapshotFeed<{ readonly value: number }>()
    const controller = new AbortController()
    let value = 1
    const iterator = feed.follow(() => Object.freeze({ value }), controller.signal)[Symbol.asyncIterator]()

    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: { type: 'baseline', revision: 0, value: { value: 1 } },
    })

    value = 2
    feed.invalidate()
    feed.invalidate()
    feed.invalidate()
    await expect(iterator.next()).resolves.toEqual({
      done: false,
      value: { type: 'replace', revision: 3, value: { value: 2 } },
    })

    const pending = iterator.next()
    await new Promise(resolve => setTimeout(resolve, 0))
    controller.abort(new Error('test complete'))
    await expect(pending).resolves.toEqual({ done: true, value: undefined })
    expect(feed.followerCount).toBe(0)
  })

  it('closes every active follower without publishing after disposal', async () => {
    const feed = new StudioSnapshotFeed<{ readonly value: number }>()
    const iterator = feed.follow(() => ({ value: 1 }), new AbortController().signal)[Symbol.asyncIterator]()
    await iterator.next()
    const pending = iterator.next()

    feed.close()

    expect(feed.followerCount).toBe(0)
    await expect(pending).resolves.toEqual({ done: true, value: undefined })
    expect(() => feed.invalidate()).not.toThrow()
    await expect(feed.follow(() => ({ value: 2 }), new AbortController().signal)
      [Symbol.asyncIterator]().next()).resolves.toEqual({ done: true, value: undefined })
  })
})
