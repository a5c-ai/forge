export type SnapshotCacheOptions = {
  /**
   * Maximum number of cached snapshots (main or inbox) to keep.
   * Each entry may contain many parsed events; keep this small.
   */
  maxEntries?: number;
};

type CacheEntry<T> = {
  value: T;
  createdAtMs: number;
};

/**
 * A small LRU cache intended to speed up repeated `loadSnapshot()` calls inside long-lived processes
 * (e.g. the server). It is purely an optimization and must not change determinism.
 */
export class SnapshotCache {
  private readonly maxEntries: number;
  private readonly mainByCommit = new Map<string, CacheEntry<unknown>>();
  private readonly inboxByCommit = new Map<string, CacheEntry<unknown>>();

  constructor(opts: SnapshotCacheOptions = {}) {
    this.maxEntries = Math.max(1, opts.maxEntries ?? 16);
  }

  private touch<T>(m: Map<string, CacheEntry<T>>, key: string): CacheEntry<T> | undefined {
    const v = m.get(key);
    if (!v) return;
    // LRU: delete + re-set to move to the end.
    m.delete(key);
    m.set(key, v);
    return v;
  }

  private setLRU<T>(m: Map<string, CacheEntry<T>>, key: string, value: T) {
    if (m.has(key)) m.delete(key);
    m.set(key, { value, createdAtMs: Date.now() });
    while (m.size > this.maxEntries) {
      const oldest = m.keys().next().value as string | undefined;
      if (!oldest) break;
      m.delete(oldest);
    }
  }

  getMain<T>(commitOid: string): T | undefined {
    return this.touch(this.mainByCommit as any, commitOid)?.value as any;
  }

  setMain<T>(commitOid: string, value: T): void {
    this.setLRU(this.mainByCommit as any, commitOid, value as any);
  }

  getInbox<T>(commitOid: string): T | undefined {
    return this.touch(this.inboxByCommit as any, commitOid)?.value as any;
  }

  setInbox<T>(commitOid: string, value: T): void {
    this.setLRU(this.inboxByCommit as any, commitOid, value as any);
  }
}

export function createSnapshotCache(opts?: SnapshotCacheOptions): SnapshotCache {
  return new SnapshotCache(opts);
}


