/**
 * Monorepo-root entry point used exclusively by `bun --watch` in development.
 *
 * Why this file exists:
 *   Bun determines its file-watcher "project root" by walking upward from the
 *   entry-point's directory until it finds the nearest tsconfig.json or
 *   package.json.  When the entry is server/src/index.ts, Bun stops at
 *   server/ and treats it as the boundary — so core/ files (one level up) fall
 *   outside the watch scope and trigger "will not be watched" warnings.
 *
 *   By using *this* file (at the monorepo root, helpdesk/) as the entry point,
 *   Bun walks up from helpdesk/ and finds helpdesk/package.json first.  The
 *   project root becomes helpdesk/, which contains both server/src/ and core/,
 *   so all imported files are watched and trigger automatic restarts.
 *
 * Module resolution still works correctly: each server source file continues to
 * use server/tsconfig.json (its nearest tsconfig) for path-alias resolution.
 *
 * Do NOT use this file in production — the server is started directly via
 * `node server/src/index.js` (or the compiled output).
 */
await import("./server/src/index.ts");
