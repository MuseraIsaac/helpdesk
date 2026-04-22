/**
 * TicketViewsDropdown
 *
 * A searchable popover that surfaces every ticket view in one place:
 *   System  →  All Tickets
 *   Quick   →  Escalated · Overdue · At Risk · Unassigned Urgent
 *   My Views       →  personal saved views (with Edit / Default / Delete actions)
 *   Shared Views   →  admin-created views (read-only)
 *   Footer         →  "Create new view" shortcut
 *
 * The trigger button shows the currently active view name so users always
 * know which view is loaded without reading the chips strip.
 *
 * Keyboard: type-to-filter, ArrowUp/Down to navigate, Enter to apply, Escape to close.
 */

import { useRef, useState, useEffect, useMemo, useCallback } from "react";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Badge }  from "@/components/ui/badge";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertTriangle, Clock, ShieldAlert, UserX, Zap,
  Check, Search, Plus, Star, Users, Pencil, Trash2,
  MoreHorizontal, X, ChevronDown, LayoutList,
} from "lucide-react";
import type { StoredView } from "@/hooks/useTicketViews";

// ── Types ─────────────────────────────────────────────────────────────────────

type QuickViewId = "all" | "escalated" | "overdue" | "at_risk" | "unassigned_urgent";

interface FlatEntry {
  kind:        "system" | "quick" | "personal" | "shared";
  id:          string;                       // unique key
  label:       string;
  description: string;
  emoji?:      string | null;
  icon?:       React.ReactNode;
  iconColor?:  string;
  isDefault?:  boolean;
  view?:       StoredView;                   // set for personal/shared
}

interface Props {
  activeLabel:    string;         // label of the currently active view
  activeEmoji?:   string | null;
  activeIcon?:    React.ReactNode;
  personal:       StoredView[];
  shared:         StoredView[];
  activeVid:      string | null;
  activeQuickId:  QuickViewId | null;
  onApplyQuick:   (id: QuickViewId | null) => void;
  onApplyView:    (v: StoredView) => void;
  onCreateView:   () => void;
  onEditView:     (v: StoredView) => void;
  onSetDefault:   (id: number) => void;
  onClearDefault: () => void;
  onDeleteView:   (id: number) => void;
}

// ── Static quick-view metadata ────────────────────────────────────────────────

const QUICK_META: { id: QuickViewId; label: string; description: string; icon: React.ReactNode; iconColor: string }[] = [
  { id: "escalated",         label: "Escalated",        description: "Tickets that have been escalated",         icon: <AlertTriangle className="h-3.5 w-3.5" />, iconColor: "text-red-500"    },
  { id: "overdue",           label: "Overdue",           description: "Tickets past their SLA deadline",          icon: <Clock         className="h-3.5 w-3.5" />, iconColor: "text-red-500"    },
  { id: "at_risk",           label: "At Risk",           description: "Approaching SLA breach within 2 hours",    icon: <ShieldAlert   className="h-3.5 w-3.5" />, iconColor: "text-amber-500"  },
  { id: "unassigned_urgent", label: "Unassigned Urgent", description: "Urgent open tickets with no assigned agent",icon: <UserX         className="h-3.5 w-3.5" />, iconColor: "text-orange-500" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function highlight(text: string, query: string): React.ReactNode {
  if (!query) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-primary/20 text-primary rounded-sm font-medium not-italic">
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}

function matches(entry: FlatEntry, q: string): boolean {
  if (!q) return true;
  const lower = q.toLowerCase();
  return (
    entry.label.toLowerCase().includes(lower) ||
    entry.description.toLowerCase().includes(lower)
  );
}

// ── Row component ─────────────────────────────────────────────────────────────

function ViewRow({
  entry,
  isActive,
  isFocused,
  query,
  onActivate,
  onEdit,
  onSetDefault,
  onClearDefault,
  onDelete,
  rowRef,
}: {
  entry:          FlatEntry;
  isActive:       boolean;
  isFocused:      boolean;
  query:          string;
  onActivate:     () => void;
  onEdit?:        () => void;
  onSetDefault?:  () => void;
  onClearDefault?:() => void;
  onDelete?:      () => void;
  rowRef?:        React.Ref<HTMLDivElement>;
}) {
  const hasActions = !!(onEdit || onSetDefault || onClearDefault || onDelete);

  return (
    <div
      ref={rowRef}
      role="option"
      aria-selected={isActive}
      className={[
        "group flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors select-none",
        isFocused  ? "bg-accent"       : "",
        !isFocused ? "hover:bg-muted/60" : "",
      ].join(" ")}
      onClick={onActivate}
    >
      {/* Icon / emoji */}
      <div className={[
        "h-7 w-7 rounded-md flex items-center justify-center shrink-0 text-sm",
        entry.kind === "personal" ? "bg-primary/10" :
        entry.kind === "shared"   ? "bg-violet-100 dark:bg-violet-900/30" :
        "bg-muted",
      ].join(" ")}>
        {entry.emoji
          ? <span className="leading-none">{entry.emoji}</span>
          : <span className={entry.iconColor ?? "text-muted-foreground"}>{entry.icon}</span>}
      </div>

      {/* Text */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-sm font-medium truncate">
            {highlight(entry.label, query)}
          </span>
          {entry.isDefault && (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
              <Star className="h-2.5 w-2.5 fill-current" />default
            </span>
          )}
          {entry.kind === "shared" && (
            <Badge variant="secondary" className="text-[9px] px-1 py-0 h-4 gap-0.5">
              <Users className="h-2.5 w-2.5" />shared
            </Badge>
          )}
        </div>
        {entry.description && (
          <p className="text-[11px] text-muted-foreground truncate leading-tight mt-0.5">
            {highlight(entry.description, query)}
          </p>
        )}
      </div>

      {/* Active check */}
      <div className="flex items-center gap-1 shrink-0">
        {isActive && <Check className="h-3.5 w-3.5 text-primary" />}

        {/* Context menu for personal views */}
        {hasActions && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="opacity-0 group-hover:opacity-100 focus:opacity-100 h-6 w-6 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-background transition-all"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44" onClick={(e) => e.stopPropagation()}>
              {onEdit && (
                <DropdownMenuItem onClick={onEdit} className="gap-2">
                  <Pencil className="h-3.5 w-3.5 text-muted-foreground" />Edit view
                </DropdownMenuItem>
              )}
              {onSetDefault && !entry.isDefault && (
                <DropdownMenuItem onClick={onSetDefault} className="gap-2">
                  <Star className="h-3.5 w-3.5 text-muted-foreground" />Set as default
                </DropdownMenuItem>
              )}
              {onClearDefault && entry.isDefault && (
                <DropdownMenuItem onClick={onClearDefault} className="gap-2">
                  <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />Remove as default
                </DropdownMenuItem>
              )}
              {onDelete && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={onDelete} className="gap-2 text-destructive focus:text-destructive">
                    <Trash2 className="h-3.5 w-3.5" />Delete view
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  );
}

// ── Section header ─────────────────────────────────────────────────────────────

function SectionLabel({ label, action }: { label: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-3 pt-2 pb-1">
      <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
        {label}
      </span>
      {action}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function TicketViewsDropdown({
  activeLabel,
  activeEmoji,
  activeIcon,
  personal,
  shared,
  activeVid,
  activeQuickId,
  onApplyQuick,
  onApplyView,
  onCreateView,
  onEditView,
  onSetDefault,
  onClearDefault,
  onDeleteView,
}: Props) {
  const [open,         setOpen]         = useState(false);
  const [query,        setQuery]        = useState("");
  const [focusedIdx,   setFocusedIdx]   = useState(0);
  const searchRef  = useRef<HTMLInputElement>(null);
  const listRef    = useRef<HTMLDivElement>(null);
  const rowRefs    = useRef<(HTMLDivElement | null)[]>([]);

  // Reset on open
  useEffect(() => {
    if (open) {
      setQuery("");
      setFocusedIdx(0);
      setTimeout(() => searchRef.current?.focus(), 50);
    }
  }, [open]);

  // ── Build flat entry list from all sources ─────────────────────────────────
  const allEntries = useMemo<FlatEntry[]>(() => {
    const entries: FlatEntry[] = [];

    // System
    entries.push({
      kind: "system", id: "all",
      label: "All Tickets",
      description: "Show every ticket you have access to",
      icon: <Zap className="h-3.5 w-3.5" />,
      iconColor: "text-primary",
    });

    // Quick views
    for (const q of QUICK_META) {
      entries.push({
        kind: "quick", id: q.id,
        label: q.label,
        description: q.description,
        icon: q.icon,
        iconColor: q.iconColor,
      });
    }

    // Personal saved views
    for (const v of personal) {
      entries.push({
        kind: "personal", id: `personal_${v.id}`,
        label: v.name,
        description: [
          v.config.filters?.assignedToMe ? "Assigned to me" : null,
          v.config.filters?.status        ? `Status: ${v.config.filters.status}` : null,
          v.config.filters?.priority      ? `Priority: ${v.config.filters.priority}` : null,
          v.config.filters?.teamId !== undefined ? "Team filtered" : null,
        ].filter(Boolean).join(" · ") || "No filter preset",
        emoji:     v.emoji,
        isDefault: v.isDefault,
        view:      v,
      });
    }

    // Shared views
    for (const v of shared) {
      entries.push({
        kind: "shared", id: `shared_${v.id}`,
        label: v.name,
        description: [
          v.config.filters?.assignedToMe ? "Assigned to me" : null,
          v.config.filters?.status        ? `Status: ${v.config.filters.status}` : null,
          v.config.filters?.priority      ? `Priority: ${v.config.filters.priority}` : null,
        ].filter(Boolean).join(" · ") || "Shared view",
        emoji: v.emoji,
        view:  v,
      });
    }

    return entries;
  }, [personal, shared]);

  // ── Filtered entries ───────────────────────────────────────────────────────
  const filtered = useMemo(
    () => allEntries.filter((e) => matches(e, query)),
    [allEntries, query],
  );

  // Reset focused index when query changes
  useEffect(() => { setFocusedIdx(0); }, [query]);

  // Scroll focused row into view
  useEffect(() => {
    rowRefs.current[focusedIdx]?.scrollIntoView({ block: "nearest" });
  }, [focusedIdx]);

  // ── Active-entry id helper ─────────────────────────────────────────────────
  function isEntryActive(e: FlatEntry): boolean {
    if (e.id === "all")        return !activeVid && activeQuickId === null;
    if (e.kind === "quick")    return activeQuickId === e.id;
    if (e.view)                return activeVid === String(e.view.id);
    return false;
  }

  // ── Activate an entry ──────────────────────────────────────────────────────
  function activate(e: FlatEntry) {
    if (e.id === "all") {
      onApplyQuick(null);
    } else if (e.kind === "quick") {
      onApplyQuick(e.id as QuickViewId);
    } else if (e.view) {
      onApplyView(e.view);
    }
    setOpen(false);
  }

  // ── Keyboard handler ───────────────────────────────────────────────────────
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setFocusedIdx((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setFocusedIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const entry = filtered[focusedIdx];
      if (entry) activate(entry);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  // ── Group filtered entries by kind for sectioned rendering ─────────────────
  const grouped = useMemo(() => {
    const system   = filtered.filter((e) => e.kind === "system");
    const quick    = filtered.filter((e) => e.kind === "quick");
    const myViews  = filtered.filter((e) => e.kind === "personal");
    const sharedVs = filtered.filter((e) => e.kind === "shared");
    return { system, quick, myViews, sharedVs };
  }, [filtered]);

  const isSearching = query.trim().length > 0;

  // ── Build row index map for focus tracking ─────────────────────────────────
  // Maps flat filtered index → entry
  rowRefs.current = new Array(filtered.length).fill(null);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={[
            "group inline-flex items-center gap-2 h-8 pl-3 pr-2 rounded-lg border text-sm font-medium transition-all",
            "hover:bg-muted/60 hover:border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            open
              ? "bg-muted/60 border-border shadow-sm"
              : "border-border/50 bg-background",
          ].join(" ")}
        >
          {/* Active view icon/emoji */}
          <span className="flex items-center gap-1.5 min-w-0">
            {activeEmoji
              ? <span className="text-base leading-none shrink-0">{activeEmoji}</span>
              : activeIcon
              ? <span className="text-muted-foreground shrink-0">{activeIcon}</span>
              : <LayoutList className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
            <span className="truncate max-w-[160px]">{activeLabel}</span>
          </span>
          <ChevronDown className={[
            "h-3.5 w-3.5 text-muted-foreground transition-transform shrink-0",
            open ? "rotate-180" : "",
          ].join(" ")} />
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        side="bottom"
        className="w-[340px] p-0 shadow-lg"
        sideOffset={6}
        onKeyDown={handleKeyDown}
      >
        {/* ── Search input ── */}
        <div className="flex items-center gap-2 px-3 py-2.5 border-b">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search views…"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* ── Results ── */}
        <div ref={listRef} className="overflow-y-auto max-h-[380px] p-1.5">
          {filtered.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No views match <em>"{query}"</em>
            </div>
          ) : isSearching ? (
            /* Flat list when searching */
            <div>
              <SectionLabel label={`${filtered.length} result${filtered.length !== 1 ? "s" : ""}`} />
              {filtered.map((entry, idx) => (
                <ViewRow
                  key={entry.id}
                  entry={entry}
                  isActive={isEntryActive(entry)}
                  isFocused={focusedIdx === idx}
                  query={query}
                  rowRef={(el) => { rowRefs.current[idx] = el; }}
                  onActivate={() => activate(entry)}
                  onEdit={entry.view && !entry.view.isShared ? () => onEditView(entry.view!) : undefined}
                  onSetDefault={entry.view && !entry.view.isShared ? () => onSetDefault(entry.view!.id) : undefined}
                  onClearDefault={entry.view?.isDefault ? onClearDefault : undefined}
                  onDelete={entry.view && !entry.view.isShared ? () => onDeleteView(entry.view!.id) : undefined}
                />
              ))}
            </div>
          ) : (
            /* Grouped sections when not searching */
            <>
              {/* System */}
              <SectionLabel label="System" />
              {grouped.system.map((entry) => {
                const idx = filtered.indexOf(entry);
                return (
                  <ViewRow
                    key={entry.id}
                    entry={entry}
                    isActive={isEntryActive(entry)}
                    isFocused={focusedIdx === idx}
                    query=""
                    rowRef={(el) => { rowRefs.current[idx] = el; }}
                    onActivate={() => activate(entry)}
                  />
                );
              })}

              {/* Quick views */}
              {grouped.quick.length > 0 && (
                <>
                  <SectionLabel label="Quick views" />
                  {grouped.quick.map((entry) => {
                    const idx = filtered.indexOf(entry);
                    return (
                      <ViewRow
                        key={entry.id}
                        entry={entry}
                        isActive={isEntryActive(entry)}
                        isFocused={focusedIdx === idx}
                        query=""
                        rowRef={(el) => { rowRefs.current[idx] = el; }}
                        onActivate={() => activate(entry)}
                      />
                    );
                  })}
                </>
              )}

              {/* Personal saved views */}
              {grouped.myViews.length > 0 && (
                <>
                  <SectionLabel
                    label="My views"
                    action={
                      <button
                        type="button"
                        onClick={() => { setOpen(false); onCreateView(); }}
                        className="text-[10px] text-primary hover:text-primary/80 font-semibold flex items-center gap-0.5 transition-colors"
                      >
                        <Plus className="h-3 w-3" />New
                      </button>
                    }
                  />
                  {grouped.myViews.map((entry) => {
                    const idx = filtered.indexOf(entry);
                    return (
                      <ViewRow
                        key={entry.id}
                        entry={entry}
                        isActive={isEntryActive(entry)}
                        isFocused={focusedIdx === idx}
                        query=""
                        rowRef={(el) => { rowRefs.current[idx] = el; }}
                        onActivate={() => activate(entry)}
                        onEdit={() => { setOpen(false); onEditView(entry.view!); }}
                        onSetDefault={() => { onSetDefault(entry.view!.id); }}
                        onClearDefault={entry.isDefault ? onClearDefault : undefined}
                        onDelete={() => { onDeleteView(entry.view!.id); }}
                      />
                    );
                  })}
                </>
              )}

              {/* Shared views */}
              {grouped.sharedVs.length > 0 && (
                <>
                  <SectionLabel label="Shared views" />
                  {grouped.sharedVs.map((entry) => {
                    const idx = filtered.indexOf(entry);
                    return (
                      <ViewRow
                        key={entry.id}
                        entry={entry}
                        isActive={isEntryActive(entry)}
                        isFocused={focusedIdx === idx}
                        query=""
                        rowRef={(el) => { rowRefs.current[idx] = el; }}
                        onActivate={() => activate(entry)}
                      />
                    );
                  })}
                </>
              )}

              {/* No custom views yet — encourage creation */}
              {grouped.myViews.length === 0 && grouped.sharedVs.length === 0 && (
                <div className="px-3 py-3 mt-1 rounded-lg bg-muted/30 border border-dashed border-border/50 mx-1">
                  <p className="text-xs font-medium text-muted-foreground">No custom views yet</p>
                  <p className="text-[11px] text-muted-foreground/60 mt-0.5 mb-2">
                    Save your filters as a named view for one-click access.
                  </p>
                  <button
                    type="button"
                    onClick={() => { setOpen(false); onCreateView(); }}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:text-primary/80 transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" />Create your first view
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="border-t px-3 py-2 flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground/50">
            {allEntries.length} view{allEntries.length !== 1 ? "s" : ""}
          </span>
          <button
            type="button"
            onClick={() => { setOpen(false); onCreateView(); }}
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />Create view
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
