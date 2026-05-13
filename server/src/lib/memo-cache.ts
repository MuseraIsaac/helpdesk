/**
 * Simple in-process TTL cache for read-only aggregation endpoints.
 *
 * Used by the dashboard report endpoints, which run heavy aggregations
 * over ticket / incident / SLA data. Two users opening the same dashboard
 * within the TTL window get the second response served from memory in
 * <1 ms instead of waiting on Postgres again.
 *
 * Scope and tradeoffs:
 *   - Per-process. A multi-instance deploy gets one cache per pod —
 *     acceptable for these endpoints since stale-within-TTL is fine.
 *   - No size cap. Each cached value is a small JSON blob (a few KB);
 *     keys are bounded by the cartesian of `(endpoint, period)` so
 *     unbounded growth isn't a concern.
 *   - Auto-eviction on expiry to keep the Map tidy.
 *   - Concurrent-safe: in-flight fetches are deduplicated so a
 *     thundering-herd of dashboard mounts only fires the underlying
 *     work once.
 *
 * Usage:
 *   const data = await memoCache.getOrLoad(
 *     `reports:overview:${from}:${to}`,
 *     60_000,
 *     () => computeOverview(from, to),
 *   );
 */

interface CacheEntry<T> {
  value:     T;
  expiresAt: number;
}

const store      = new Map<string, CacheEntry<unknown>>();
const inflight   = new Map<string, Promise<unknown>>();

export const memoCache = {
  /**
   * Returns the cached value if fresh, otherwise calls `loader`, caches
   * the result with TTL, and returns it.
   *
   * If `loader` is already running for this key (another caller fired it
   * milliseconds ago), the existing promise is returned — preventing
   * dashboard mounts from issuing N copies of the same SQL query.
   */
  async getOrLoad<T>(
    key:    string,
    ttlMs:  number,
    loader: () => Promise<T>,
  ): Promise<T> {
    const now = Date.now();
    const hit = store.get(key) as CacheEntry<T> | undefined;
    if (hit && hit.expiresAt > now) return hit.value;

    const pending = inflight.get(key) as Promise<T> | undefined;
    if (pending) return pending;

    const p = (async () => {
      try {
        const value = await loader();
        store.set(key, { value, expiresAt: Date.now() + ttlMs });
        return value;
      } finally {
        inflight.delete(key);
      }
    })();
    inflight.set(key, p);
    return p;
  },

  /** Manually invalidate a single key (after a mutation, for example). */
  invalidate(key: string): void {
    store.delete(key);
  },

  /**
   * Invalidate every key whose name starts with the given prefix. Useful
   * after a mutation that affects multiple cached aggregations — e.g.
   * a ticket status change should drop `reports:*`.
   */
  invalidatePrefix(prefix: string): void {
    for (const key of store.keys()) {
      if (key.startsWith(prefix)) store.delete(key);
    }
  },

  /** Test/debug helper — wipe everything. */
  clear(): void {
    store.clear();
    inflight.clear();
  },
};
