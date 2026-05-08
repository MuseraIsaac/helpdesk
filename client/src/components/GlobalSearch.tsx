/**
 * Command Palette — Cmd/Ctrl+K everywhere.
 *
 * A unified launcher that combines:
 *   • Curated **actions** — navigate to any module, jump into any admin tab,
 *     create a new ticket / incident / problem / change / request, switch
 *     theme, or sign out — filtered by the current user's role and
 *     permissions so you never see a command you can't run.
 *   • Server-side **entity search** — tickets, incidents, problems, requests,
 *     CIs, KB articles via GET /api/search — kicks in once two characters are
 *     typed.
 *   • **Recents** — the last few items you opened from the palette,
 *     persisted to localStorage so a second hit of ⌘K lands you right back
 *     where you were.
 *
 * Synchronizes with the existing `useTheme` provider (light/dark/system),
 * the navigation manifest in `lib/nav-config`, the admin tab manifest in
 * `lib/admin-tabs`, the permission helper in `core/constants/permission`,
 * and the Better-Auth `signOut` client.
 */

import {
  useState, useEffect, useRef, useCallback, useMemo,
} from "react";
import { useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import {
  Ticket, Siren, GitBranch, Inbox, Database, BookOpen, Search, Loader2,
  X, ArrowRight, CornerDownLeft, Sun, Moon, Monitor, LogOut, Plus,
  Sparkles, Compass, ShieldCheck, Settings, History, Command,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { SEARCH_TYPES, type SearchType } from "core/schemas/search.ts";
import { NAV_SECTIONS, isNavItemVisible } from "@/lib/nav-config";
import { ADMIN_TABS } from "@/lib/admin-tabs";
import { useTheme, type Theme } from "@/lib/theme";
import { signOut, useSession } from "@/lib/auth-client";
import { useMe } from "@/hooks/useMe";
import { can } from "core/constants/permission.ts";

// ── Search response types ─────────────────────────────────────────────────────

interface SearchHit {
  id: number | string;
  title: string;
  number?: string;
  status?: string;
  href: string;
  meta?: string;
}

interface SearchResponse {
  query: string;
  results: Partial<Record<SearchType, SearchHit[]>>;
  totals:  Partial<Record<SearchType, number>>;
}

// ── Per-type config ───────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<
  SearchType,
  { label: string; icon: LucideIcon; color: string }
> = {
  tickets:   { label: "Tickets",   icon: Ticket,   color: "text-blue-500" },
  incidents: { label: "Incidents", icon: Siren,    color: "text-red-500" },
  problems:  { label: "Problems",  icon: GitBranch, color: "text-orange-500" },
  requests:  { label: "Requests",  icon: Inbox,    color: "text-emerald-500" },
  cmdb:      { label: "CMDB",      icon: Database, color: "text-purple-500" },
  kb:        { label: "Articles",  icon: BookOpen, color: "text-sky-500" },
};

// ── Action model ──────────────────────────────────────────────────────────────
//
// Every command in the palette — navigate, create, settings, account — is
// represented as one of these. Defining commands as data (rather than as
// special-cased JSX branches) lets us filter, search, sort, and rank them
// uniformly with entity hits.

type ActionGroup = "Jump to" | "Create" | "Administration" | "Preferences" | "Account";

interface CommandAction {
  id:           string;
  label:        string;
  group:        ActionGroup;
  icon:         LucideIcon;
  /** Extra text included in the fuzzy-match haystack, never displayed. */
  keywords?:    string;
  /** Single-line caption rendered to the right of the label. */
  hint?:        string;
  /** Tinted icon colour — purely cosmetic, helps groups skim faster. */
  iconColor?:   string;
  /** What happens when this action is invoked. */
  perform:      () => void;
}

// ── Recents ───────────────────────────────────────────────────────────────────
//
// Persist the last 6 opened items (mix of actions + entity hits) so the
// palette opens with something useful even before the user types.

const RECENTS_KEY = "helpdesk-cmdk-recents";
const RECENTS_MAX = 6;

interface RecentEntry {
  id:        string;
  title:     string;
  href:      string;
  meta?:     string;
  /** Used to pick an icon when re-rendering. */
  type:      "action" | SearchType;
}

function loadRecents(): RecentEntry[] {
  try {
    const raw = localStorage.getItem(RECENTS_KEY);
    return raw ? (JSON.parse(raw) as RecentEntry[]) : [];
  } catch {
    return [];
  }
}

function saveRecent(entry: RecentEntry) {
  try {
    const list = loadRecents().filter((r) => r.id !== entry.id);
    list.unshift(entry);
    localStorage.setItem(RECENTS_KEY, JSON.stringify(list.slice(0, RECENTS_MAX)));
  } catch { /* private mode — silently noop */ }
}

// ── Debounce ──────────────────────────────────────────────────────────────────

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

// ── Fuzzy match ───────────────────────────────────────────────────────────────
//
// Tiny scorer — exact prefix scores higher than substring; word-boundary
// hits beat mid-word. Good enough for ~50 actions; saves bringing in a fuse.js.

function scoreMatch(haystack: string, needle: string): number {
  if (!needle) return 1;
  const h = haystack.toLowerCase();
  const n = needle.toLowerCase();
  if (h === n)           return 1000;
  if (h.startsWith(n))   return 500;
  const wb = new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(h);
  if (wb)                return 250;
  if (h.includes(n))     return 100;
  // Initials match — "tt" → "Ticket Types"
  if (n.length >= 2) {
    const initials = h.split(/\s+/).map((w) => w[0] ?? "").join("");
    if (initials.includes(n)) return 50;
  }
  return 0;
}

// ── Result row ────────────────────────────────────────────────────────────────

function ResultRow({
  icon: Icon, iconColor, title, hint, badge, status, isSelected,
  onMouseEnter, onClick,
}: {
  icon:        LucideIcon;
  iconColor?:  string;
  title:       string;
  hint?:       string;
  badge?:      string;
  status?:     string;
  isSelected:  boolean;
  onMouseEnter: () => void;
  onClick:     () => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isSelected) ref.current?.scrollIntoView({ block: "nearest" });
  }, [isSelected]);

  return (
    <button
      ref={ref}
      onMouseEnter={onMouseEnter}
      onClick={onClick}
      className={[
        "w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors",
        isSelected ? "bg-accent" : "hover:bg-accent/50",
      ].join(" ")}
    >
      <div
        className={[
          "h-7 w-7 rounded-md flex items-center justify-center shrink-0 border",
          isSelected ? "bg-background border-border" : "bg-muted/40 border-transparent",
        ].join(" ")}
      >
        <Icon className={`h-3.5 w-3.5 ${iconColor ?? "text-muted-foreground"}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-medium truncate leading-none">{title}</p>
        {hint && (
          <p className="text-[11px] text-muted-foreground truncate mt-0.5">{hint}</p>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {badge && (
          <span className="text-[11px] text-muted-foreground font-mono">{badge}</span>
        )}
        {status && (
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 capitalize">
            {status.replace(/_/g, " ")}
          </Badge>
        )}
        {isSelected && (
          <CornerDownLeft className="h-3.5 w-3.5 text-muted-foreground/70" />
        )}
        {!isSelected && (
          <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/30" />
        )}
      </div>
    </button>
  );
}

// ── Group header ──────────────────────────────────────────────────────────────

function GroupHeader({ icon: Icon, label, count }: {
  icon:  LucideIcon;
  label: string;
  count?: number;
}) {
  return (
    <div className="flex items-center gap-2 px-4 py-1.5 border-b bg-muted/30">
      <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      {count != null && (
        <span className="ml-auto text-[10px] text-muted-foreground/60 tabular-nums">
          {count}
        </span>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function GlobalSearch() {
  const [open, setOpen]                 = useState(false);
  const [query, setQuery]               = useState("");
  const debouncedQuery                  = useDebounce(query, 200);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [recents, setRecents]           = useState<RecentEntry[]>(() => loadRecents());

  const navigate     = useNavigate();
  const inputRef     = useRef<HTMLInputElement>(null);
  const { theme, setTheme, toggleTheme } = useTheme();
  const session      = useSession();
  const { data: meData } = useMe();
  const role         = meData?.user.role ?? "agent";

  // ── Keyboard shortcut to open ────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  // ── Reset state when opened ──────────────────────────────────────────────
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 0);
      setQuery("");
      setSelectedIndex(0);
      setRecents(loadRecents()); // pick up any new recents written elsewhere
    }
  }, [open]);

  const close = useCallback(() => setOpen(false), []);

  // Wraps navigate() to remember the destination for next time the palette opens.
  const go = useCallback(
    (entry: RecentEntry) => {
      saveRecent(entry);
      close();
      navigate(entry.href);
    },
    [close, navigate],
  );

  // ── Build the action catalogue (memoised on role + theme) ────────────────
  //
  // Permission-correct: nav items are passed through `isNavItemVisible`,
  // admin tabs are gated on role === "admin", and the create-* actions
  // check the same `*.create` permissions used by the routes themselves.

  const actions = useMemo<CommandAction[]>(() => {
    const acc: CommandAction[] = [];

    // — Navigation (top-level pages) —
    for (const section of NAV_SECTIONS) {
      // Section-level visibility was already vetted to render the sidebar,
      // but we still per-item-check here in case a section header passes
      // while an individual item doesn't.
      for (const item of section.items) {
        if (!isNavItemVisible(item, role)) continue;
        acc.push({
          id:        `nav:${item.id}`,
          label:     item.label,
          group:     "Jump to",
          icon:      item.icon,
          hint:      section.label,
          keywords:  `${section.label} navigate go open`,
          perform:   () => go({
            id: `nav:${item.id}`, title: item.label, href: item.to, meta: section.label, type: "action",
          }),
        });
      }
    }

    // — Admin tabs (only for admins) —
    if (role === "admin") {
      for (const tab of ADMIN_TABS) {
        acc.push({
          id:        `admin:${tab.id}`,
          label:     tab.label,
          group:     "Administration",
          icon:      tab.icon,
          hint:      tab.description,
          iconColor: "text-amber-500",
          keywords:  `admin ${tab.group} configure settings`,
          perform:   () => go({
            id: `admin:${tab.id}`, title: tab.label, href: tab.to, meta: "Administration", type: "action",
          }),
        });
      }
    }

    // — Quick create —
    const creates: Array<{ key: string; label: string; href: string; perm: string; icon?: LucideIcon }> = [
      { key: "ticket",   label: "New Ticket",          href: "/tickets/new",   perm: "tickets.create",   icon: Ticket    },
      { key: "incident", label: "New Incident",        href: "/incidents/new", perm: "incidents.manage", icon: Siren     },
      { key: "problem",  label: "New Problem",         href: "/problems/new",  perm: "problems.manage",  icon: GitBranch },
      { key: "change",   label: "New Change Request",  href: "/changes/new",   perm: "changes.create",   icon: ArrowRight },
      { key: "request",  label: "New Service Request", href: "/requests/new",  perm: "requests.manage",  icon: Inbox     },
    ];
    for (const c of creates) {
      if (!can(role, c.perm as never)) continue;
      acc.push({
        id:        `create:${c.key}`,
        label:     c.label,
        group:     "Create",
        icon:      c.icon ?? Plus,
        hint:      "Open the new-item form",
        iconColor: "text-emerald-500",
        keywords:  `create new add ${c.key}`,
        perform:   () => go({
          id: `create:${c.key}`, title: c.label, href: c.href, meta: "Create", type: "action",
        }),
      });
    }

    // — Preferences (theme) —
    const themeOptions: Array<{ value: Theme; label: string; icon: LucideIcon }> = [
      { value: "light",  label: "Switch to Light theme",  icon: Sun     },
      { value: "dark",   label: "Switch to Dark theme",   icon: Moon    },
      { value: "system", label: "Match system theme",     icon: Monitor },
    ];
    for (const opt of themeOptions) {
      if (theme === opt.value) continue;
      acc.push({
        id:        `theme:${opt.value}`,
        label:     opt.label,
        group:     "Preferences",
        icon:      opt.icon,
        iconColor: "text-violet-500",
        hint:      `Currently ${theme}`,
        keywords:  "theme appearance dark light mode color",
        perform:   () => { setTheme(opt.value); close(); },
      });
    }
    acc.push({
      id:        "theme:toggle",
      label:     "Toggle theme",
      group:     "Preferences",
      icon:      Sun,
      iconColor: "text-violet-500",
      keywords:  "theme dark light",
      perform:   () => { toggleTheme(); close(); },
    });
    acc.push({
      id:        "nav:profile",
      label:     "Open Profile & Preferences",
      group:     "Preferences",
      icon:      Settings,
      iconColor: "text-violet-500",
      keywords:  "profile preferences me settings account",
      perform:   () => go({
        id: "nav:profile", title: "Profile", href: "/profile", meta: "Preferences", type: "action",
      }),
    });

    // — Account —
    if (session.data) {
      acc.push({
        id:        "account:signout",
        label:     "Sign out",
        group:     "Account",
        icon:      LogOut,
        iconColor: "text-rose-500",
        hint:      session.data.user.email,
        keywords:  "logout exit sign-off",
        perform:   () => {
          close();
          void signOut({ fetchOptions: { onSuccess: () => navigate("/login") } });
        },
      });
    }

    return acc;
  }, [role, theme, session.data, setTheme, toggleTheme, go, close, navigate]);

  // ── Rank actions against the current query ────────────────────────────────

  const rankedActions = useMemo(() => {
    const q = debouncedQuery.trim();
    const scored = actions.map((a) => {
      const haystack = `${a.label} ${a.group} ${a.hint ?? ""} ${a.keywords ?? ""}`;
      return { action: a, score: scoreMatch(haystack, q) };
    });
    if (q) {
      return scored
        .filter((s) => s.score > 0)
        .sort((a, b) => b.score - a.score)
        .map((s) => s.action);
    }
    return scored.map((s) => s.action);
  }, [actions, debouncedQuery]);

  // ── Server-side entity search ────────────────────────────────────────────

  const { data: searchData, isFetching: searchFetching } = useQuery<SearchResponse>({
    queryKey:  ["global-search", debouncedQuery],
    queryFn:   async () => {
      const { data } = await axios.get<SearchResponse>("/api/search", {
        params: { q: debouncedQuery, limit: 5 },
      });
      return data;
    },
    enabled:   debouncedQuery.length >= 2,
    staleTime: 30_000,
  });

  // ── Build the rendered groups ────────────────────────────────────────────
  //
  // When a query is present:   entity hits → matching actions (top ~10).
  // When the query is empty:    Recents → grouped action catalogue.
  //
  // We also build a flat ordered list `flatRows` for keyboard nav, where
  // each entry knows how to perform itself when ↵ is pressed.

  type Row =
    | { kind: "action"; action: CommandAction }
    | { kind: "hit";    type: SearchType; hit: SearchHit }
    | { kind: "recent"; entry: RecentEntry };

  type Group = { key: string; header: { icon: LucideIcon; label: string; count?: number }; rows: Row[] };

  const groups: Group[] = [];
  const hasQuery = debouncedQuery.length >= 2;

  if (!hasQuery && recents.length > 0) {
    groups.push({
      key:    "recents",
      header: { icon: History, label: "Recent" },
      rows:   recents.map((entry) => ({ kind: "recent", entry })),
    });
  }

  if (hasQuery && searchData) {
    for (const type of SEARCH_TYPES) {
      const hits = searchData.results[type];
      if (hits && hits.length > 0) {
        const cfg = TYPE_CONFIG[type];
        groups.push({
          key:    type,
          header: { icon: cfg.icon, label: cfg.label, count: searchData.totals[type] },
          rows:   hits.map((hit) => ({ kind: "hit", type, hit })),
        });
      }
    }
  }

  // Group ranked actions by their declared `group`, preserving group order.
  const ACTION_GROUP_ORDER: ActionGroup[] = ["Jump to", "Create", "Administration", "Preferences", "Account"];
  const ACTION_GROUP_ICONS: Record<ActionGroup, LucideIcon> = {
    "Jump to":        Compass,
    "Create":         Sparkles,
    "Administration": ShieldCheck,
    "Preferences":    Settings,
    "Account":        LogOut,
  };

  // When the user is searching, cap action results aggressively — entity
  // hits are usually what they want; actions are a secondary surface.
  const maxActionsWhenSearching = 8;
  const visibleActions = hasQuery
    ? rankedActions.slice(0, maxActionsWhenSearching)
    : rankedActions;

  const byGroup = new Map<ActionGroup, CommandAction[]>();
  for (const a of visibleActions) {
    const list = byGroup.get(a.group) ?? [];
    list.push(a);
    byGroup.set(a.group, list);
  }
  for (const g of ACTION_GROUP_ORDER) {
    const items = byGroup.get(g);
    if (!items || items.length === 0) continue;
    groups.push({
      key:    `actions:${g}`,
      header: { icon: ACTION_GROUP_ICONS[g], label: g },
      rows:   items.map((action) => ({ kind: "action", action })),
    });
  }

  // Flatten to a single list for ↑↓ traversal.
  const flatRows: Row[] = groups.flatMap((g) => g.rows);

  // ── Keyboard navigation ──────────────────────────────────────────────────

  const performRow = useCallback((row: Row) => {
    if (row.kind === "action") {
      row.action.perform();
      return;
    }
    if (row.kind === "hit") {
      go({
        id:    `${row.type}:${row.hit.id}`,
        title: row.hit.title,
        href:  row.hit.href,
        meta:  TYPE_CONFIG[row.type].label + (row.hit.number ? ` · ${row.hit.number}` : ""),
        type:  row.type,
      });
      return;
    }
    if (row.kind === "recent") {
      go(row.entry);
    }
  }, [go]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      close();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, flatRows.length - 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
      return;
    }
    if (e.key === "Enter") {
      const row = flatRows[selectedIndex];
      if (row) performRow(row);
    }
  };

  // Reset highlight whenever the search results shift under us.
  useEffect(() => setSelectedIndex(0), [debouncedQuery]);

  if (!open) return null;

  // ── Render ───────────────────────────────────────────────────────────────

  const showEmpty =
    hasQuery && !searchFetching && flatRows.length === 0;

  let cursor = 0; // running index across all groups for keyboard mapping

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center pt-[10vh] backdrop-blur-sm animate-in fade-in duration-150"
      onClick={close}
      onKeyDown={handleKeyDown}
    >
      <div
        className="w-full max-w-xl bg-background rounded-xl border shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 slide-in-from-top-4 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 border-b h-14">
          {searchFetching ? (
            <Loader2 className="h-4 w-4 text-muted-foreground animate-spin shrink-0" />
          ) : (
            <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          )}
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search or run a command…"
            className="flex-1 bg-transparent outline-none text-[14px] placeholder:text-muted-foreground"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Clear"
            >
              <X className="h-4 w-4" />
            </button>
          )}
          <kbd className="hidden sm:inline-flex items-center gap-1 text-[10px] text-muted-foreground border rounded px-1.5 py-0.5">
            Esc
          </kbd>
        </div>

        {/* Results */}
        <div className="overflow-y-auto max-h-[60vh]">
          {/* Pre-typing nudge: only when there are no recents to show */}
          {!hasQuery && recents.length === 0 && (
            <div className="flex flex-col items-center justify-center py-10 text-muted-foreground gap-2">
              <Command className="h-7 w-7 opacity-30" />
              <p className="text-sm">Type to search or run a command</p>
              <p className="text-[11px] opacity-60">
                Tickets · Incidents · KB · Admin · Theme · Sign out
              </p>
            </div>
          )}

          {/* Empty state when actively searching with no results */}
          {showEmpty && (
            <div className="flex flex-col items-center justify-center py-10 text-muted-foreground gap-2">
              <p className="text-sm">No results for &ldquo;{debouncedQuery}&rdquo;</p>
              <p className="text-[11px] opacity-60">Try a different keyword or jump to a section.</p>
            </div>
          )}

          {/* Groups */}
          {groups.map((g) => (
            <div key={g.key}>
              <GroupHeader icon={g.header.icon} label={g.header.label} count={g.header.count} />
              {g.rows.map((row) => {
                const idx = cursor++;
                if (row.kind === "action") {
                  const a = row.action;
                  return (
                    <ResultRow
                      key={`a:${a.id}`}
                      icon={a.icon}
                      iconColor={a.iconColor}
                      title={a.label}
                      hint={a.hint}
                      isSelected={selectedIndex === idx}
                      onMouseEnter={() => setSelectedIndex(idx)}
                      onClick={() => performRow(row)}
                    />
                  );
                }
                if (row.kind === "hit") {
                  const cfg = TYPE_CONFIG[row.type];
                  return (
                    <ResultRow
                      key={`h:${row.type}:${row.hit.id}`}
                      icon={cfg.icon}
                      iconColor={cfg.color}
                      title={row.hit.title}
                      hint={row.hit.meta}
                      badge={row.hit.number}
                      status={row.hit.status}
                      isSelected={selectedIndex === idx}
                      onMouseEnter={() => setSelectedIndex(idx)}
                      onClick={() => performRow(row)}
                    />
                  );
                }
                // recent
                const meta = row.entry.meta ?? "Recent";
                const Icon =
                  row.entry.type !== "action" && row.entry.type in TYPE_CONFIG
                    ? TYPE_CONFIG[row.entry.type as SearchType].icon
                    : History;
                return (
                  <ResultRow
                    key={`r:${row.entry.id}`}
                    icon={Icon}
                    title={row.entry.title}
                    hint={meta}
                    isSelected={selectedIndex === idx}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    onClick={() => performRow(row)}
                  />
                );
              })}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="border-t px-4 py-2 flex items-center gap-4 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <kbd className="border rounded px-1 py-0.5">↑↓</kbd> navigate
          </span>
          <span className="flex items-center gap-1">
            <kbd className="border rounded px-1 py-0.5">↵</kbd> open
          </span>
          <span className="flex items-center gap-1">
            <kbd className="border rounded px-1 py-0.5">Esc</kbd> close
          </span>
          <span className="ml-auto flex items-center gap-1 opacity-70">
            <kbd className="border rounded px-1 py-0.5">⌘ K</kbd> anywhere
          </span>
        </div>
      </div>
    </div>
  );
}
