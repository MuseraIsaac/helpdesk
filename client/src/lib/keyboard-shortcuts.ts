/**
 * Single source of truth for every keyboard shortcut in the app.
 *
 * The same array is consumed by:
 *   - `useGlobalShortcuts()` to register the live key bindings
 *   - The "Shortcuts" tab in Profile & Preferences (`ProfilePage.tsx`)
 *   - The `?` cheat-sheet overlay
 *
 * Adding a new shortcut: append a row, then handle it in
 * `useGlobalShortcuts()` if it needs runtime behaviour. Display-only entries
 * (e.g. shortcuts inside a third-party editor) can omit the action key —
 * they'll still appear in the documentation.
 */

export type ShortcutScope =
  | "Global"
  | "Navigation"
  | "Tickets"
  | "Search"
  | "Editor";

export interface ShortcutKeys {
  /**
   * The key combination as a list of tokens. Modifier tokens are
   * "mod" (Cmd on macOS, Ctrl elsewhere), "shift", "alt".
   * Plain keys appear as a single character or the special name "?".
   * Chord shortcuts are expressed as `["g", "t"]` — pressed sequentially.
   */
  combo: string[];
  /** True when `combo` is a sequential chord (e.g. `g` then `t`). */
  chord?: boolean;
}

export interface Shortcut {
  id: string;
  scope: ShortcutScope;
  keys: ShortcutKeys;
  /** Short, agent-facing description. */
  label: string;
  /** Optional longer hint. */
  hint?: string;
}

export const SHORTCUTS: Shortcut[] = [
  // ── Global ─────────────────────────────────────────────────────────────────
  {
    id: "global.search",
    scope: "Global",
    keys: { combo: ["mod", "k"] },
    label: "Open the command palette / global search",
    hint: "Jump to anything — tickets, customers, KB articles, settings.",
  },
  {
    id: "global.search-slash",
    scope: "Global",
    keys: { combo: ["/"] },
    label: "Focus the global search input",
  },
  {
    id: "global.help",
    scope: "Global",
    keys: { combo: ["?"] },
    label: "Show the keyboard shortcuts cheat-sheet",
  },

  // ── Navigation ─────────────────────────────────────────────────────────────
  {
    id: "nav.dashboard",
    scope: "Navigation",
    keys: { combo: ["g", "d"], chord: true },
    label: "Go to Dashboard",
  },
  {
    id: "nav.tickets",
    scope: "Navigation",
    keys: { combo: ["g", "t"], chord: true },
    label: "Go to Tickets",
  },
  {
    id: "nav.incidents",
    scope: "Navigation",
    keys: { combo: ["g", "i"], chord: true },
    label: "Go to Incidents",
  },
  {
    id: "nav.changes",
    scope: "Navigation",
    keys: { combo: ["g", "c"], chord: true },
    label: "Go to Changes",
  },
  {
    id: "nav.problems",
    scope: "Navigation",
    keys: { combo: ["g", "p"], chord: true },
    label: "Go to Problems",
  },
  {
    id: "nav.requests",
    scope: "Navigation",
    keys: { combo: ["g", "r"], chord: true },
    label: "Go to Service Requests",
  },
  {
    id: "nav.approvals",
    scope: "Navigation",
    keys: { combo: ["g", "a"], chord: true },
    label: "Go to Approvals",
  },
  {
    id: "nav.knowledge",
    scope: "Navigation",
    keys: { combo: ["g", "k"], chord: true },
    label: "Go to Knowledge Base",
  },
  {
    id: "nav.cmdb",
    scope: "Navigation",
    keys: { combo: ["g", "m"], chord: true },
    label: "Go to CMDB",
  },
  {
    id: "nav.profile",
    scope: "Navigation",
    keys: { combo: ["g", "u"], chord: true },
    label: "Go to your Profile",
  },

  // ── Tickets ────────────────────────────────────────────────────────────────
  {
    id: "ticket.new",
    scope: "Tickets",
    keys: { combo: ["n"] },
    label: "Create a new ticket",
    hint: "Press n from anywhere outside an input.",
  },
  {
    id: "ticket.copilot",
    scope: "Tickets",
    keys: { combo: ["mod", "i"] },
    label: "Toggle the AI Copilot drawer",
    hint: "Only active while viewing a ticket.",
  },

  // ── Search results / command palette ───────────────────────────────────────
  {
    id: "search.next",
    scope: "Search",
    keys: { combo: ["↓"] },
    label: "Next result",
    hint: "Inside the command palette / search.",
  },
  {
    id: "search.prev",
    scope: "Search",
    keys: { combo: ["↑"] },
    label: "Previous result",
    hint: "Inside the command palette / search.",
  },
  {
    id: "search.open",
    scope: "Search",
    keys: { combo: ["Enter"] },
    label: "Open the highlighted result",
  },
  {
    id: "search.close",
    scope: "Search",
    keys: { combo: ["Esc"] },
    label: "Close / dismiss the palette or any open dialog",
  },

  // ── Editor ─────────────────────────────────────────────────────────────────
  {
    id: "editor.bold",
    scope: "Editor",
    keys: { combo: ["mod", "b"] },
    label: "Bold",
  },
  {
    id: "editor.italic",
    scope: "Editor",
    keys: { combo: ["mod", "i"] },
    label: "Italic",
  },
  {
    id: "editor.underline",
    scope: "Editor",
    keys: { combo: ["mod", "u"] },
    label: "Underline",
  },
  {
    id: "editor.link",
    scope: "Editor",
    keys: { combo: ["mod", "k"] },
    label: "Insert link",
  },
  {
    id: "editor.undo",
    scope: "Editor",
    keys: { combo: ["mod", "z"] },
    label: "Undo",
  },
  {
    id: "editor.redo",
    scope: "Editor",
    keys: { combo: ["mod", "shift", "z"] },
    label: "Redo",
  },
];

// ── Helpers ────────────────────────────────────────────────────────────────────

const isMac =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent || "");

/**
 * Convert a single combo token to a display label (e.g. `mod` → `⌘` on macOS,
 * `Ctrl` elsewhere).
 */
export function tokenLabel(token: string): string {
  switch (token) {
    case "mod":   return isMac ? "⌘" : "Ctrl";
    case "shift": return isMac ? "⇧" : "Shift";
    case "alt":   return isMac ? "⌥" : "Alt";
    case "Enter": return "↵";
    case "Esc":   return "Esc";
    case "?":     return "?";
    case "/":     return "/";
    default:      return token.length === 1 ? token.toUpperCase() : token;
  }
}

export function comboLabel(keys: ShortcutKeys): string[] {
  return keys.combo.map(tokenLabel);
}

/**
 * Shortcuts grouped by scope, in the same order they appear in SHORTCUTS.
 */
export function groupShortcutsByScope(): Array<{ scope: ShortcutScope; items: Shortcut[] }> {
  const order: ShortcutScope[] = ["Global", "Navigation", "Tickets", "Search", "Editor"];
  return order.map((scope) => ({
    scope,
    items: SHORTCUTS.filter((s) => s.scope === scope),
  }));
}
