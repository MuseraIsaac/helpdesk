/**
 * Tiny in-process cache for GET responses on a router.
 *
 * Why:
 *   The dashboard fires 15+ parallel report queries on mount. Each
 *   issues its own SQL aggregation. With a 60 s TTL, the second user
 *   opening the same dashboard (or the same user reopening) gets every
 *   widget served from RAM in <1 ms instead of waiting for Postgres to
 *   recompute. Concurrent dashboard mounts also deduplicate via the
 *   underlying memoCache's in-flight tracking.
 *
 * Scoping:
 *   Keys are `{user-or-anon}:{method}:{url}`. Per-user keying prevents
 *   one tenant from seeing another's filtered results when (e.g.) a
 *   future endpoint scopes by team. For genuinely public data, set
 *   `perUser: false` to share one cache entry across all callers.
 *
 * Cache headers:
 *   Sets `Cache-Control: private, max-age=<seconds>, stale-while-
 *   revalidate=<2x>` so the browser also caches the response. Combined
 *   with the server-side memo, two layers protect Postgres.
 */
import type { Request, Response, NextFunction, RequestHandler } from "express";
import { memoCache } from "../lib/memo-cache";

interface CacheGetOptions {
  /** TTL in seconds. */
  ttl:     number;
  /** When false, keys aren't user-scoped (use only for fully public data). */
  perUser?: boolean;
}

export function cacheGet({ ttl, perUser = true }: CacheGetOptions): RequestHandler {
  const ttlMs = ttl * 1000;

  return function cacheGetMiddleware(req: Request, res: Response, next: NextFunction) {
    if (req.method !== "GET") return next();

    const userKey = perUser ? (req.user?.id ?? "anon") : "shared";
    const cacheKey = `${userKey}:${req.method}:${req.originalUrl ?? req.url}`;

    memoCache
      .getOrLoad<{ status: number; body: unknown }>(cacheKey, ttlMs, () =>
        new Promise((resolve, reject) => {
          // Intercept res.json so we capture the payload the handler
          // generates, store it, and pass it through to the client. After
          // intercept, calling resolve() returns the same payload to any
          // concurrent waiter on this cache key.
          const originalJson = res.json.bind(res);
          let settled = false;

          res.json = (body: unknown) => {
            if (!settled) {
              settled = true;
              const status = res.statusCode || 200;
              // Only cache success responses — caching an error would
              // pin the failure for the full TTL even after the
              // underlying problem clears.
              if (status >= 200 && status < 300) {
                resolve({ status, body });
              } else {
                reject(new Error(`Status ${status}`));
              }
            }
            return originalJson(body);
          };

          // If the handler errors out, propagate so the cache doesn't
          // store a poisoned value.
          res.on("close", () => {
            if (!settled) {
              settled = true;
              reject(new Error("Response closed before json()"));
            }
          });

          next();
        }),
      )
      .then((entry) => {
        // First request: we already streamed the response from inside the
        // loader. Subsequent requests hit this branch and we have to
        // emit the cached body ourselves. Detect "first request" by
        // checking if the response is already sent (headersSent).
        if (res.headersSent) return;
        res.setHeader(
          "Cache-Control",
          `private, max-age=${ttl}, stale-while-revalidate=${ttl * 2}`,
        );
        res.status(entry.status).json(entry.body);
      })
      .catch(() => {
        // Loader rejected (handler errored or returned non-2xx). The
        // first request has already had the original error sent via
        // originalJson — only the SECOND concurrent caller needs a
        // fallback here. Don't pretend success; signal failure so the
        // client retries.
        if (!res.headersSent) {
          res.status(503).json({ error: "Upstream temporarily unavailable" });
        }
      });
  };
}
