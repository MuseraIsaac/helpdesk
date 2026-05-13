/**
 * Stale lazy-chunk recovery.
 *
 * After a deploy / dev-server restart, every browser tab still has the
 * previous build's `index.html` in memory — including the chunk
 * filename map that React.lazy uses to fetch route code. When the user
 * navigates to a route they hadn't visited yet, the dynamic import()
 * resolves to a chunk filename that no longer exists on the server.
 * The server responds with `index.html` (the SPA fallback), so the
 * browser sees `Content-Type: text/html` for what was supposed to be
 * a `.js` module and throws:
 *
 *   "Failed to fetch dynamically imported module"
 *   "Expected a JavaScript-or-Wasm module script but the server
 *    responded with a MIME type of text/html"
 *
 * The fix is just to reload the page so the browser pulls the new
 * `index.html` with current chunk hashes. We do that automatically the
 * first time we see one of these errors, then set a sessionStorage
 * flag so we don't reload-loop if the deploy is actually broken.
 */

const SENTINEL_KEY = "chunk-reload-attempted";

function isChunkLoadError(err: unknown): boolean {
  if (!err) return false;
  const msg = err instanceof Error ? err.message : String(err);
  // Cover Chrome, Firefox, and Safari variants of the same failure.
  return (
    msg.includes("Failed to fetch dynamically imported module") ||
    msg.includes("error loading dynamically imported module") ||
    msg.includes("Importing a module script failed") ||
    msg.includes("Loading chunk") ||
    /Expected a JavaScript[-\s]or[-\s]Wasm module script/i.test(msg)
  );
}

function attemptReload(): void {
  try {
    if (sessionStorage.getItem(SENTINEL_KEY) === "1") {
      // We already tried once — don't loop. The user can refresh
      // manually; meanwhile leave the error visible so it surfaces to
      // monitoring.
      return;
    }
    sessionStorage.setItem(SENTINEL_KEY, "1");
  } catch {
    // sessionStorage unavailable (private mode, very old browsers).
    // Better to risk one extra reload than to never recover.
  }
  // Hard navigation — bypasses the bfcache and any service-worker
  // cache, guaranteeing a fresh index.html.
  window.location.reload();
}

/** Clear the "tried already" flag after a clean navigation. */
function clearSentinel(): void {
  try { sessionStorage.removeItem(SENTINEL_KEY); } catch { /* noop */ }
}

export function installChunkReloadHandler(): void {
  // Plain JS errors (route-level lazy(), Sentry.ErrorBoundary catches).
  window.addEventListener("error", (event) => {
    if (isChunkLoadError(event.error ?? event.message)) {
      event.preventDefault();
      attemptReload();
    }
  });

  // Unhandled promise rejections (most route-load failures land here).
  window.addEventListener("unhandledrejection", (event) => {
    if (isChunkLoadError(event.reason)) {
      event.preventDefault();
      attemptReload();
    }
  });

  // If the page loaded cleanly, the previous reload (if any) succeeded —
  // clear the sentinel so we're armed for the next deploy.
  if (document.readyState === "complete") {
    clearSentinel();
  } else {
    window.addEventListener("load", clearSentinel, { once: true });
  }
}
