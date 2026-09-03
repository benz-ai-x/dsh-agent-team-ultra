/** Bounded coalescing fan-out for complete Studio snapshots. */

export type StudioSnapshotFrame<Snapshot> =
  | { readonly type: 'baseline'; readonly revision: number; readonly value: Snapshot }
  | { readonly type: 'replace'; readonly revision: number; readonly value: Snapshot }

/**
 * Each follower retains only the newest invalidation revision. Snapshot values are built
 * on demand, so bursts never queue stale or partially updated domain projections.
 */
export class StudioSnapshotFeed<Snapshot> {
  private readonly followers = new Set<StudioFollower>()
  private revision = 0
  private closed = false

  /** Testable lifecycle fact; no follower survives feed disposal. */
  get followerCount(): number {
    return this.followers.size
  }

  /** Coalesce a synchronous invalidation burst into one latest-revision wake-up. */
  invalidate(): void {
    if (this.closed) return
    this.revision += 1
    for (const follower of this.followers) follower.invalidate(this.revision)
  }

  /** Close admission and wake every follower without retaining its builder. */
  close(): void {
    if (this.closed) return
    this.closed = true
    for (const follower of this.followers) follower.close()
    this.followers.clear()
  }

  /** Open with one complete baseline, then rebuild only for coalesced invalidations. */
  async *follow(
    build: () => Snapshot,
    signal: AbortSignal,
  ): AsyncIterable<StudioSnapshotFrame<Snapshot>> {
    if (this.closed) return
    signal.throwIfAborted()
    const follower = new StudioFollower()
    this.followers.add(follower)
    try {
      yield Object.freeze({ type: 'baseline' as const, revision: this.revision, value: build() })
      while (!this.closed && !signal.aborted) {
        const revision = await follower.next(signal)
        if (revision === undefined || this.closed || signal.aborted) return
        yield Object.freeze({ type: 'replace' as const, revision, value: build() })
      }
    } finally {
      this.followers.delete(follower)
      follower.close()
    }
  }
}

class StudioFollower {
  private pendingRevision: number | undefined
  private wake: (() => void) | undefined
  private wakeScheduled = false
  private closed = false

  invalidate(revision: number): void {
    if (this.closed) return
    this.pendingRevision = revision
    if (this.wakeScheduled) return
    this.wakeScheduled = true
    queueMicrotask(() => {
      this.wakeScheduled = false
      this.wake?.()
    })
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    this.wake?.()
  }

  async next(signal: AbortSignal): Promise<number | undefined> {
    while (!this.closed && !signal.aborted && this.pendingRevision === undefined) {
      await new Promise<void>((resolve) => {
        const finish = (): void => {
          signal.removeEventListener('abort', finish)
          if (this.wake === finish) this.wake = undefined
          resolve()
        }
        this.wake = finish
        signal.addEventListener('abort', finish, { once: true })
        if (this.closed || signal.aborted || this.pendingRevision !== undefined) finish()
      })
    }
    if (this.closed || signal.aborted) return undefined
    const revision = this.pendingRevision
    this.pendingRevision = undefined
    return revision
  }
}
