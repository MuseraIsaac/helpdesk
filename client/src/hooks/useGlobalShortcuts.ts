/**
 * useGlobalShortcuts
 *
 * Wires up the application-wide keyboard shortcuts declared in
 * `client/src/lib/keyboard-shortcuts.ts`. Mounted once from the top-level
 * Layout so the bindings stay alive across route changes.
 *
 * Behaviour notes:
 *   - All bindings are no-ops while the user is typing in an `<input>`,
 *     `<textarea>`, contenteditable element, or any element with the
 *     `data-no-shortcut` attribute. Without this guard, hitting `n` to type
 *     a name into the subject field would create a brand-new ticket.
 *   - Chord shortcuts (e.g. `g` then `t`) are recognised via a 1.2-second
 *     buffer. The buffer is cleared on any non-matching key.
 *   - The `?` cheat-sheet overlay is opened by dispatching a custom event
 *     so the overlay can live anywhere in the tree.
 */

import { useEffect, useState } from "react";
import { useNavigate } from "react-router";

const CHORD_TIMEOUT_MS = 1200;

export const SHORTCUT_HELP_EVENT = "zentra:shortcut-help";

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  if (target.closest("[data-no-shortcut]")) return true;
  return false;
}

interface UseGlobalShortcutsResult {
  /** Whether the cheat-sheet overlay is open. */
  helpOpen: boolean;
  setHelpOpen: (open: boolean) => void;
}

export function useGlobalShortcuts(): UseGlobalShortcutsResult {
  const navigate = useNavigate();
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    let chordPrefix: string | null = null;
    let chordTimer: ReturnType<typeof setTimeout> | null = null;

    function clearChord() {
      chordPrefix = null;
      if (chordTimer) {
        clearTimeout(chordTimer);
        chordTimer = null;
      }
    }

    function dispatchHelp() {
      // Custom event so any component can register an overlay listener.
      // Locally we also flip the hook-managed state so callers that prefer
      // a `helpOpen` boolean can use it directly.
      document.dispatchEvent(new CustomEvent(SHORTCUT_HELP_EVENT));
      setHelpOpen(true);
    }

    function dispatchSearch() {
      // Re-use the existing global-search trigger: the GlobalSearch component
      // listens for ⌘/Ctrl+K, so synthesising one is the simplest hand-off.
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true }),
      );
    }

    function onKeyDown(e: KeyboardEvent) {
      // Fast-path: ignore keys that can never trigger any of our shortcuts.
      // This keeps the per-keystroke cost essentially zero while the user is
      // typing prose into reply forms, search boxes, etc.
      if (e.metaKey || e.altKey) return;
      const k = e.key;
      if (k.length > 1 && k !== "Escape" && k !== "?") return;
      const interesting =
        k === "?" || k === "/" || k === "n" || k === "g" || k === "Escape" ||
        chordPrefix !== null;
      if (!interesting) return;

      // Always allow ESC to close the help overlay even from inputs.
      if (k === "Escape" && helpOpen) {
        setHelpOpen(false);
        return;
      }

      if (isTypingTarget(e.target)) return;

      // ── Single-key shortcuts ─────────────────────────────────────────────
      if (!e.metaKey && !e.ctrlKey && !e.altKey) {
        // `?` (Shift+/ on US layouts) — cheat sheet
        if (e.key === "?") {
          e.preventDefault();
          dispatchHelp();
          clearChord();
          return;
        }

        // `/` — focus global search
        if (e.key === "/") {
          e.preventDefault();
          dispatchSearch();
          clearChord();
          return;
        }

        // `n` — new ticket
        if (e.key === "n" && !chordPrefix) {
          e.preventDefault();
          navigate("/tickets/new");
          clearChord();
          return;
        }

        // ── Chord prefix `g` ───────────────────────────────────────────────
        if (e.key === "g" && !chordPrefix) {
          e.preventDefault();
          chordPrefix = "g";
          chordTimer = setTimeout(clearChord, CHORD_TIMEOUT_MS);
          return;
        }

        // ── Chord completions ──────────────────────────────────────────────
        if (chordPrefix === "g") {
          const targets: Record<string, string> = {
            d: "/dashboard",
            t: "/tickets",
            i: "/incidents",
            c: "/changes",
            p: "/problems",
            r: "/requests",
            a: "/approvals",
            k: "/kb",
            m: "/cmdb",
            u: "/profile",
          };
          const dest = targets[e.key.toLowerCase()];
          if (dest) {
            e.preventDefault();
            clearChord();
            navigate(dest);
            return;
          }
          // Any other key cancels the chord without acting.
          clearChord();
        }
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      clearChord();
    };
  }, [navigate, helpOpen]);

  return { helpOpen, setHelpOpen };
}
