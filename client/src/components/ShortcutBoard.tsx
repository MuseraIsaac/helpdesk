/**
 * ShortcutBoard
 *
 * The canonical "list of every keyboard shortcut" component, used by both
 * the Profile → Shortcuts tab AND the `?` cheat-sheet overlay. Reads
 * straight from `lib/keyboard-shortcuts.ts` so the docs can never drift
 * from the live bindings.
 *
 * UX features:
 *   - Search-as-you-type filter across labels and tokens.
 *   - Grouped by scope with sticky scope chips.
 *   - Pretty `<kbd>` tiles with platform-aware mod keys (⌘ on macOS, Ctrl
 *     elsewhere).
 *   - "+" connectors for combos, "then" connectors for chord shortcuts.
 */

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Search, Sparkles, Navigation, Ticket, Pencil, Globe } from "lucide-react";
import {
  SHORTCUTS,
  groupShortcutsByScope,
  comboLabel,
  type Shortcut,
  type ShortcutScope,
} from "@/lib/keyboard-shortcuts";

const SCOPE_ICON: Record<ShortcutScope, React.ElementType> = {
  Global:     Globe,
  Navigation: Navigation,
  Tickets:    Ticket,
  Search:     Sparkles,
  Editor:     Pencil,
};

const SCOPE_TONE: Record<ShortcutScope, string> = {
  Global:     "from-violet-500/15 to-violet-500/5 border-violet-500/20 text-violet-700 dark:text-violet-300",
  Navigation: "from-sky-500/15 to-sky-500/5 border-sky-500/20 text-sky-700 dark:text-sky-300",
  Tickets:    "from-emerald-500/15 to-emerald-500/5 border-emerald-500/20 text-emerald-700 dark:text-emerald-300",
  Search:     "from-amber-500/15 to-amber-500/5 border-amber-500/20 text-amber-700 dark:text-amber-300",
  Editor:     "from-rose-500/15 to-rose-500/5 border-rose-500/20 text-rose-700 dark:text-rose-300",
};

export function ShortcutBoard({ compact = false }: { compact?: boolean }) {
  const [query, setQuery] = useState("");

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return groupShortcutsByScope();
    return groupShortcutsByScope()
      .map((g) => ({
        scope: g.scope,
        items: g.items.filter((s) => matches(s, q)),
      }))
      .filter((g) => g.items.length > 0);
  }, [query]);

  const totalVisible = groups.reduce((n, g) => n + g.items.length, 0);

  return (
    <div className="space-y-4">
      {/* Stats banner — only shown on the full page, not in the modal */}
      {!compact && (
        <div className="relative overflow-hidden rounded-xl border border-primary/20 bg-gradient-to-br from-primary/5 via-primary/0 to-primary/5">
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.12] [background-image:linear-gradient(currentColor_1px,transparent_1px),linear-gradient(90deg,currentColor_1px,transparent_1px)] [background-size:18px_18px]"
            aria-hidden="true"
          />
          <div className="relative flex items-center justify-between gap-4 px-5 py-4">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 border border-primary/20 text-primary">
                <Sparkles className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-semibold tracking-tight">Move at the speed of thought</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {SHORTCUTS.length} shortcuts across {Object.keys(SCOPE_ICON).length} contexts.
                  Press <Kbd>?</Kbd> from anywhere to surface this list.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search shortcuts…"
          className="pl-8 h-9 text-sm"
          data-no-shortcut="true"
        />
        {query && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground tabular-nums font-mono">
            {totalVisible} match{totalVisible === 1 ? "" : "es"}
          </span>
        )}
      </div>

      {/* Groups */}
      {groups.length === 0 ? (
        <p className="text-sm text-muted-foreground italic text-center py-8">
          No shortcuts match "{query}".
        </p>
      ) : (
        groups.map((g) => (
          <ScopeBlock key={g.scope} scope={g.scope} items={g.items} compact={compact} />
        ))
      )}

      {/* Footer hint */}
      {!compact && (
        <p className="text-[11px] text-muted-foreground italic pt-2 text-center">
          Tip: chord shortcuts (e.g. <Kbd>G</Kbd> <span className="mx-0.5">then</span> <Kbd>T</Kbd>) work
          like Gmail's — press the first key, then the second within 1.2 seconds.
        </p>
      )}
    </div>
  );
}

function ScopeBlock({
  scope,
  items,
  compact,
}: {
  scope: ShortcutScope;
  items: Shortcut[];
  compact: boolean;
}) {
  const Icon = SCOPE_ICON[scope];
  const tone = SCOPE_TONE[scope];

  return (
    <section className="rounded-xl border border-border/60 bg-card overflow-hidden">
      <div
        className={`flex items-center gap-2 px-4 py-2.5 border-b border-border/50 bg-gradient-to-r ${tone}`}
      >
        <Icon className="h-3.5 w-3.5" />
        <span className="text-[11px] font-semibold uppercase tracking-[0.16em] font-mono">{scope}</span>
        <span className="ml-auto text-[10px] text-muted-foreground/70 font-mono tabular-nums">
          {items.length}
        </span>
      </div>
      <ul className="divide-y divide-border/30">
        {items.map((s) => (
          <li
            key={s.id}
            className={`flex items-center justify-between gap-4 px-4 ${compact ? "py-2" : "py-2.5"} hover:bg-muted/30 transition-colors`}
          >
            <div className="min-w-0">
              <p className="text-sm text-foreground">{s.label}</p>
              {s.hint && !compact && (
                <p className="text-[11px] text-muted-foreground mt-0.5">{s.hint}</p>
              )}
            </div>
            <ComboTiles shortcut={s} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function ComboTiles({ shortcut }: { shortcut: Shortcut }) {
  const tokens = comboLabel(shortcut.keys);
  const isChord = shortcut.keys.chord;

  return (
    <div className="flex items-center gap-1 shrink-0">
      {tokens.map((t, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && (
            <span className="text-[10px] text-muted-foreground/60 px-0.5">
              {isChord ? "then" : "+"}
            </span>
          )}
          <Kbd>{t}</Kbd>
        </span>
      ))}
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[26px] h-6 px-1.5 rounded-md border border-border bg-muted text-foreground text-[11px] font-mono font-medium shadow-[inset_0_-1px_0_rgba(0,0,0,0.06)] dark:shadow-[inset_0_-1px_0_rgba(255,255,255,0.04)]">
      {children}
    </kbd>
  );
}

function matches(s: Shortcut, q: string): boolean {
  if (s.label.toLowerCase().includes(q)) return true;
  if (s.hint?.toLowerCase().includes(q)) return true;
  if (s.scope.toLowerCase().includes(q)) return true;
  if (s.keys.combo.some((c) => c.toLowerCase().includes(q))) return true;
  return false;
}
