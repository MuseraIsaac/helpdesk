/**
 * DashboardCustomizer
 *
 * Redesigned settings dialog for the dashboard:
 *  – Fetches the real team list from /api/teams (fixes the "share to team" bug
 *    where only teams that already had a shared dashboard appeared)
 *  – Searchable team picker (SearchableSelect)
 *  – Polished, grouped widget list with category badges
 *  – Cleaner visual hierarchy throughout
 */
import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import SearchableSelect from "@/components/SearchableSelect";
import ErrorAlert from "@/components/ErrorAlert";
import {
  ArrowUp, ArrowDown, Trash2, Check, Star,
  RotateCcw, Globe, Copy, Users, User, Loader2,
  LayoutGrid, Eye, EyeOff, Lock, CircleDot,
} from "lucide-react";
import {
  WIDGET_IDS,
  WIDGET_META,
  WIDGET_CATEGORIES,
  WIDGET_PRESENTATION,
  SYSTEM_DEFAULT_CONFIG,
  type DashboardConfigData,
  type WidgetId,
} from "core/schemas/dashboard.ts";
import type { StoredDashboard, DashboardsResponse } from "@/hooks/useDashboardConfig";
import { useSession } from "@/lib/auth-client";

// ── Types ─────────────────────────────────────────────────────────────────────

interface DashboardCustomizerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeConfig: DashboardConfigData;
  activeDashboard: StoredDashboard | null;
  dashboardList: DashboardsResponse | null;
  onSave: (config: DashboardConfigData, name: string, opts: SaveOpts) => void;
  onSetDefault: (dashboardId: number | null) => void;
  onDelete: (dashboardId: number) => void;
  onClone: (dashboardId: number) => void;
  isSaving?: boolean;
  isCloning?: boolean;
  saveError?: Error | null;
}

export interface SaveOpts {
  description?: string | null;
  isShared?: boolean;
  visibilityTeamId?: number | null;
}

type Period = 7 | 30 | 90;

interface TeamOption { id: number; name: string; color: string | null }

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalizeConfig(config: DashboardConfigData): DashboardConfigData {
  const existing = new Map(config.widgets.map(w => [w.id, w]));
  const maxOrder = config.widgets.reduce((m, w) => Math.max(m, w.order), -1);
  let nextOrder = maxOrder + 1;

  const widgets = WIDGET_IDS.map(id => {
    if (existing.has(id)) return existing.get(id)!;
    return { id, visible: true, order: nextOrder++ };
  });

  return { ...config, widgets };
}

// Category label → accent color mapping for widget badges
const CATEGORY_COLORS: Record<string, string> = {
  "Service Desk":      "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  "Volume Tiles":      "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300",
  "Performance Tiles": "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300",
  "Breakdown Charts":  "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300",
  "Quality & SLA":     "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  "CSAT Tiles & Cards":"bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300",
  "Teams & Agents":    "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300",
  "ITSM Modules":      "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
  "Change Management": "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  "Assets & CMDB":     "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300",
  "Knowledge Base":    "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300",
};

function widgetCategory(id: WidgetId): string {
  return WIDGET_CATEGORIES.find(c => c.ids.includes(id))?.label ?? "Other";
}

// ── Widget list item ──────────────────────────────────────────────────────────

type WidgetActionPhase =
  | "adding"   | "added"
  | "removing" | "removed"
  | "moving"   | "moved"
  | "deleting" | "deleted";

function WidgetRow({
  id, visible, isFirst, isLast, onToggle, onMoveUp, onMoveDown, onRemove,
  recentAction,
}: {
  id: WidgetId; visible: boolean; isFirst: boolean; isLast: boolean;
  onToggle: () => void; onMoveUp: () => void; onMoveDown: () => void;
  /** Permanently remove this widget from the dashboard config. */
  onRemove: () => void;
  /** Two-phase action label: in-progress ("Adding…") then completed ("Added"). */
  recentAction: WidgetActionPhase | null;
}) {
  const meta     = WIDGET_META[id];
  const category = widgetCategory(id);
  const catColor = CATEGORY_COLORS[category] ?? "bg-muted text-muted-foreground";
  const pres     = WIDGET_PRESENTATION[id];

  // Map phase → ring tint (covers both in-progress and completed states)
  const ringClass =
    recentAction === "adding"   || recentAction === "added"   ? "ring-2 ring-emerald-500/40 bg-emerald-500/5" :
    recentAction === "removing" || recentAction === "removed" ? "ring-2 ring-amber-500/40  bg-amber-500/5"   :
    recentAction === "deleting" || recentAction === "deleted" ? "ring-2 ring-red-500/50    bg-red-500/5"     :
    recentAction === "moving"   || recentAction === "moved"   ? "ring-2 ring-primary/40    bg-primary/5"     : "";

  // Make the entire row a button (except the move arrows) so the click
  // target is the full strip and not just the small On/Off pill at the
  // right edge — the most common report was "I clicked but nothing happened".
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onToggle}
      onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); onToggle(); } }}
      aria-pressed={visible}
      aria-label={`${visible ? "Hide" : "Show"} ${meta.label}`}
      className={[
        "relative flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer select-none transition-all duration-300",
        "hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
        visible ? "bg-background" : "bg-muted/20",
        ringClass,
      ].filter(Boolean).join(" ")}>
      {/* Move arrows — own click handlers; stop propagation so they don't toggle the row */}
      <div className="flex flex-col gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
        <button type="button" onClick={onMoveUp} disabled={isFirst}
          className="rounded p-0.5 text-muted-foreground/50 hover:text-foreground hover:bg-muted disabled:opacity-0 transition-colors"
          aria-label={`Move ${meta.label} up`}>
          <ArrowUp className="h-3 w-3" />
        </button>
        <button type="button" onClick={onMoveDown} disabled={isLast}
          className="rounded p-0.5 text-muted-foreground/50 hover:text-foreground hover:bg-muted disabled:opacity-0 transition-colors"
          aria-label={`Move ${meta.label} down`}>
          <ArrowDown className="h-3 w-3" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className={`text-sm font-medium leading-none ${!visible ? "text-muted-foreground" : ""}`}>
            {meta.label}
          </p>
          <span className={`inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded-full ${catColor}`}>
            {category}
          </span>
          <span className="text-[10px] text-muted-foreground/60 hidden sm:inline">{pres}</span>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed line-clamp-1">
          {meta.description}
        </p>
      </div>

      {/* On/Off pill — still its own button (and still toggles via onClick),
          but visually it's now an indicator since the whole row is clickable. */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onToggle(); }}
        className={[
          "shrink-0 flex items-center gap-1 text-xs font-medium rounded-full px-2.5 py-1 transition-all border",
          visible
            ? "bg-primary/10 text-primary border-primary/20 hover:bg-primary/20"
            : "bg-muted/60 text-muted-foreground border-border/60 hover:bg-muted",
        ].join(" ")}
        aria-label={`${visible ? "Hide" : "Show"} ${meta.label}`}
      >
        {visible
          ? <><Eye className="h-3 w-3" />On</>
          : <><EyeOff className="h-3 w-3" />Off</>
        }
      </button>

      {/* Remove (trash) — permanently filters this widget out of the dashboard
          config. Different from On/Off (which just toggles visibility). */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
        className="shrink-0 flex items-center justify-center h-7 w-7 rounded-full text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 transition-colors border border-transparent hover:border-destructive/20"
        title={`Remove ${meta.label} from this dashboard`}
        aria-label={`Remove ${meta.label}`}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>

      {/* Two-phase transient chip: spinner + "Adding…" first, then a check
          + "Added" once the local mutation has settled. Same pattern for
          remove and move. pointer-events-none so it never eats clicks. */}
      {recentAction && (
        <span
          className={[
            "pointer-events-none absolute right-2 -top-2 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider border shadow-sm animate-in fade-in slide-in-from-top-1",
            (recentAction === "adding" || recentAction === "added")     && "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
            (recentAction === "removing" || recentAction === "removed") && "bg-amber-500/15   text-amber-700  dark:text-amber-300  border-amber-500/30",
            (recentAction === "deleting" || recentAction === "deleted") && "bg-red-500/15     text-red-700    dark:text-red-300    border-red-500/30",
            (recentAction === "moving" || recentAction === "moved")     && "bg-primary/15     text-primary                            border-primary/30",
          ].filter(Boolean).join(" ")}
        >
          {recentAction === "adding"   && <><Loader2 className="h-2.5 w-2.5 animate-spin" />Adding…</>}
          {recentAction === "added"    && <><Check    className="h-2.5 w-2.5" />Added</>}
          {recentAction === "removing" && <><Loader2 className="h-2.5 w-2.5 animate-spin" />Removing…</>}
          {recentAction === "removed"  && <><Check    className="h-2.5 w-2.5" />Removed</>}
          {recentAction === "deleting" && <><Loader2 className="h-2.5 w-2.5 animate-spin" />Deleting…</>}
          {recentAction === "deleted"  && <><Check    className="h-2.5 w-2.5" />Deleted</>}
          {recentAction === "moving"   && <><Loader2 className="h-2.5 w-2.5 animate-spin" />Moving…</>}
          {recentAction === "moved"    && <><Check    className="h-2.5 w-2.5" />Moved</>}
        </span>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function DashboardCustomizer({
  open,
  onOpenChange,
  activeConfig,
  activeDashboard,
  dashboardList,
  onSave,
  onSetDefault,
  onDelete,
  onClone,
  isSaving,
  isCloning,
  saveError,
}: DashboardCustomizerProps) {
  const { data: session } = useSession();
  const isElevated = session?.user?.role === "admin" || session?.user?.role === "supervisor";

  // ── Fetch real team list from API ──────────────────────────────────────────
  // Previously only teams with existing team-visible dashboards were shown,
  // which meant the dropdown was empty if no dashboard had been shared yet.
  // Shares ["dict","teams"] with TicketsPage / TicketsFilterSidebar.
  const { data: teamsData } = useQuery<{ teams: TeamOption[] }>({
    queryKey: ["dict", "teams"],
    queryFn:  () => axios.get<{ teams: TeamOption[] }>("/api/teams").then(r => r.data),
    staleTime: 5 * 60_000,
    gcTime:    30 * 60_000,
    enabled: open,
  });

  const [tab, setTab] = useState<"customize" | "dashboards">("customize");
  const [name, setName] = useState(() => activeDashboard?.name ?? "My Dashboard");
  const [description, setDescription] = useState(() => activeDashboard?.description ?? "");
  const [isShared, setIsShared] = useState(() => activeDashboard?.isShared ?? false);
  const [visibilityTeamId, setVisibilityTeamId] = useState<number | null>(
    () => activeDashboard?.visibilityTeamId ?? null
  );

  const [draft, setDraft] = useState<DashboardConfigData>(() =>
    normalizeConfig(activeConfig),
  );

  const sortedWidgets = [...draft.widgets].sort((a, b) => a.order - b.order);

  // Build team options for the searchable select
  const teamOptions = useMemo(() => {
    const raw = teamsData?.teams ?? [];
    return [
      { value: "none", label: "Only me" },
      ...raw.map(t => ({
        value: String(t.id),
        label: t.name,
        prefix: t.color
          ? <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: t.color }} />
          : <Users className="h-3 w-3 text-muted-foreground" />,
      })),
    ];
  }, [teamsData]);

  // Visible / hidden counts
  const visibleCount = sortedWidgets.filter(w => w.visible).length;

  // ── Widget mutation helpers ────────────────────────────────────────────────

  // Per-widget two-phase action chip:
  //   "Adding…"   (spinner) ~350ms → "Added"   (check) ~1100ms → cleared
  //   "Removing…" (spinner) ~350ms → "Removed" (check) ~1100ms → cleared
  //   "Moving…"   (spinner) ~250ms → "Moved"   (check) ~900ms  → cleared
  // The spinner phase is a UX cue — the local state mutation itself is
  // synchronous, but the brief "in-flight" feel makes clicks feel real and
  // confirms the action registered before the visible row state changes.
  const [recentAction, setRecentAction] = useState<Record<string, WidgetActionPhase>>({});
  const recentTimers = useRef<Record<string, ReturnType<typeof setTimeout>[]>>({});

  const flagRecent = useCallback((id: string, kind: "add" | "remove" | "move" | "delete") => {
    // Cancel any in-flight phase chain for this widget
    (recentTimers.current[id] ?? []).forEach(clearTimeout);
    recentTimers.current[id] = [];

    const startPhase: WidgetActionPhase  =
      kind === "add"    ? "adding"   :
      kind === "remove" ? "removing" :
      kind === "delete" ? "deleting" : "moving";
    const finishPhase: WidgetActionPhase =
      kind === "add"    ? "added"    :
      kind === "remove" ? "removed"  :
      kind === "delete" ? "deleted"  : "moved";
    const startMs = kind === "move" ? 250 : 350;
    const totalMs = kind === "move" ? 1150 : 1450;

    setRecentAction(prev => ({ ...prev, [id]: startPhase }));

    recentTimers.current[id]!.push(setTimeout(() => {
      setRecentAction(prev => ({ ...prev, [id]: finishPhase }));
    }, startMs));

    recentTimers.current[id]!.push(setTimeout(() => {
      setRecentAction(prev => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }, totalMs));
  }, []);

  // Cleanup pending timers on unmount
  useEffect(() => () => {
    Object.values(recentTimers.current).flat().forEach(clearTimeout);
  }, []);

  const updateWidgets = useCallback(
    (fn: (widgets: typeof sortedWidgets) => typeof sortedWidgets) => {
      setDraft(d => {
        const sorted = [...d.widgets].sort((a, b) => a.order - b.order);
        const updated = fn(sorted);
        return { ...d, widgets: updated.map((w, i) => ({ ...w, order: i })) };
      });
    },
    [],
  );

  function toggleWidget(id: WidgetId) {
    const current = sortedWidgets.find(w => w.id === id);
    flagRecent(id, current?.visible ? "remove" : "add");
    updateWidgets(ws => ws.map(w => w.id === id ? { ...w, visible: !w.visible } : w));
  }

  function moveWidget(idx: number, direction: -1 | 1) {
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= sortedWidgets.length) return;
    const movedId = sortedWidgets[idx]?.id;
    if (movedId) flagRecent(movedId, "move");
    updateWidgets(ws => {
      const next = [...ws];
      [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
      return next;
    });
  }

  /**
   * Permanently remove a widget from the dashboard config — different from the
   * On/Off toggle, which only sets `visible: false`. The widget can always be
   * re-added later via the widget picker (or by resetting to defaults).
   */
  function removeWidget(id: WidgetId) {
    flagRecent(id, "delete");
    // Wait for the "Deleting…" → "Deleted" animation before actually removing
    // the row from the list — gives the user visual confirmation.
    setTimeout(() => {
      setDraft(d => ({
        ...d,
        widgets: d.widgets
          .filter(w => w.id !== id)
          .map((w, i) => ({ ...w, order: i })),
      }));
    }, 700);
  }

  // ── Dirty detection ────────────────────────────────────────────────────────
  // Compare draft against the saved baseline so we can show an "Unsaved
  // changes" pill — the toggle/move actions only mutate local state, so
  // without this signal the user has no idea that pressing Save is needed.
  const baselineKey = useMemo(
    () => JSON.stringify({
      widgets: [...activeConfig.widgets]
        .sort((a, b) => a.order - b.order)
        .map(w => ({ id: w.id, visible: w.visible, order: w.order })),
      compact: (activeConfig as { compact?: boolean }).compact,
    }),
    [activeConfig],
  );
  const draftKey = useMemo(
    () => JSON.stringify({
      widgets: [...draft.widgets]
        .sort((a, b) => a.order - b.order)
        .map(w => ({ id: w.id, visible: w.visible, order: w.order })),
      compact: (draft as { compact?: boolean }).compact,
    }),
    [draft],
  );
  const isDirty =
    baselineKey !== draftKey ||
    name !== (activeDashboard?.name ?? "My Dashboard") ||
    description !== (activeDashboard?.description ?? "") ||
    isShared !== (activeDashboard?.isShared ?? false) ||
    visibilityTeamId !== (activeDashboard?.visibilityTeamId ?? null);

  function resetToDefault() {
    setDraft(normalizeConfig(SYSTEM_DEFAULT_CONFIG));
    setName("My Dashboard");
    setDescription("");
    setIsShared(false);
    setVisibilityTeamId(null);
  }

  function handleSave() {
    onSave(draft, name.trim() || "My Dashboard", {
      description: description.trim() || null,
      isShared,
      visibilityTeamId,
    });
  }

  const isOnSystemDefault = activeDashboard === null;
  const defaultId = dashboardList?.defaultDashboardId ?? null;

  function visibilityBadge(d: StoredDashboard) {
    if (d.isShared)         return <Badge variant="secondary" className="text-[10px] h-4 gap-0.5"><Globe className="h-2.5 w-2.5" />Shared</Badge>;
    if (d.visibilityTeamId) return <Badge variant="outline"   className="text-[10px] h-4 gap-0.5"><Users className="h-2.5 w-2.5" />{d.visibilityTeam?.name ?? "Team"}</Badge>;
    return <Badge variant="outline" className="text-[10px] h-4 gap-0.5"><User className="h-2.5 w-2.5" />Personal</Badge>;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col gap-0 p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-3 shrink-0 border-b bg-muted/30">
          <div className="flex items-center gap-2.5">
            <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <LayoutGrid className="h-4 w-4 text-primary" />
            </div>
            <DialogTitle className="text-base font-semibold">Dashboard Settings</DialogTitle>
          </div>
        </DialogHeader>

        <Tabs value={tab} onValueChange={v => setTab(v as typeof tab)} className="flex-1 flex flex-col min-h-0">
          <TabsList className="mx-6 mt-3 mb-1 shrink-0 w-auto self-start h-8">
            <TabsTrigger value="customize" className="text-xs h-7">Customize</TabsTrigger>
            <TabsTrigger value="dashboards" className="text-xs h-7">My Dashboards</TabsTrigger>
          </TabsList>

          {/* ── Customize tab ─────────────────────────────────────────────── */}
          <TabsContent value="customize" className="flex-1 overflow-y-auto px-6 space-y-5 mt-2 pb-2">

            {/* Name + description */}
            <div className="space-y-3 rounded-xl border bg-card p-4">
              <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Identity</p>
              <div className="space-y-1.5">
                <Label htmlFor="dashboard-name" className="text-xs font-medium">Dashboard name</Label>
                <Input
                  id="dashboard-name"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="My Dashboard"
                  maxLength={100}
                  className="h-8 text-sm"
                />
                {isOnSystemDefault && (
                  <p className="text-[11px] text-muted-foreground">Saving will create a new personal dashboard.</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dashboard-desc" className="text-xs font-medium">
                  Description <span className="font-normal text-muted-foreground/60">(optional)</span>
                </Label>
                <Textarea
                  id="dashboard-desc"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="What is this dashboard for?"
                  className="text-sm min-h-[52px] resize-none"
                  maxLength={500}
                />
              </div>
            </div>

            {/* Visibility */}
            <div className="space-y-3 rounded-xl border bg-card p-4">
              <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Visibility</p>

              {/* Team scope */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5 text-muted-foreground" />
                  Share with a team
                </Label>
                <SearchableSelect
                  options={teamOptions}
                  value={visibilityTeamId ? String(visibilityTeamId) : "none"}
                  onChange={v => setVisibilityTeamId(v === "none" ? null : Number(v))}
                  placeholder="Only me"
                  searchPlaceholder="Search teams…"
                  className="h-8 text-sm"
                  disabled={isShared}
                />
                {visibilityTeamId && (
                  <p className="text-[11px] text-muted-foreground">
                    All members of this team can view and use this dashboard.
                  </p>
                )}
              </div>

              {/* Org-wide sharing (elevated only) */}
              {isElevated ? (
                <div className={[
                  "flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 transition-colors",
                  isShared ? "border-primary/30 bg-primary/5" : "border-border",
                ].join(" ")}>
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Globe className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div>
                      <p className="text-sm font-medium leading-none">Share with everyone</p>
                      <p className="text-xs text-muted-foreground mt-0.5">All users in the organisation can see this.</p>
                    </div>
                  </div>
                  <Switch
                    checked={isShared}
                    onCheckedChange={v => { setIsShared(v); if (v) setVisibilityTeamId(null); }}
                  />
                </div>
              ) : (
                <div className="flex items-center gap-2.5 rounded-lg border border-border/60 px-3 py-2.5 opacity-60">
                  <Lock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <p className="text-xs text-muted-foreground">Org-wide sharing requires admin or supervisor role.</p>
                </div>
              )}
            </div>

            {/* Time range + density */}
            <div className="space-y-3 rounded-xl border bg-card p-4">
              <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Defaults</p>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Default time range</Label>
                <div className="flex gap-1.5">
                  {([7, 30, 90] as Period[]).map(p => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setDraft(d => ({ ...d, period: p }))}
                      className={`flex-1 rounded-lg border px-3 py-1.5 text-sm font-medium transition-all ${
                        draft.period === p
                          ? "bg-primary text-primary-foreground border-primary shadow-sm"
                          : "bg-background text-muted-foreground hover:text-foreground hover:bg-muted border-border"
                      }`}
                    >
                      {p}d
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Layout density</Label>
                <div className="flex gap-1.5">
                  {(["comfortable", "compact"] as const).map(d => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setDraft(prev => ({ ...prev, density: d }))}
                      className={`flex-1 rounded-lg border px-3 py-1.5 text-sm font-medium capitalize transition-all ${
                        draft.density === d
                          ? "bg-primary text-primary-foreground border-primary shadow-sm"
                          : "bg-background text-muted-foreground hover:text-foreground hover:bg-muted border-border"
                      }`}
                    >
                      {d}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Compact reduces row height and spacing between widgets.
                </p>
              </div>
            </div>

            {/* Widget list */}
            <div className="space-y-2 rounded-xl border bg-card p-4">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Widgets</p>
                <div className="flex items-center gap-2">
                  {/* Unsaved-changes pill — pulses while saving, steady while dirty */}
                  {isSaving ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider">
                      <Loader2 className="h-2.5 w-2.5 animate-spin" />
                      Saving…
                    </span>
                  ) : isDirty ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/30 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider">
                      <CircleDot className="h-2.5 w-2.5 animate-pulse" />
                      Unsaved changes
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider">
                      <Check className="h-2.5 w-2.5" />
                      Saved
                    </span>
                  )}
                  <span className="text-[11px] text-muted-foreground tabular-nums">
                    {visibleCount} of {sortedWidgets.length} visible
                  </span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Toggle visibility and reorder using the arrows. Changes are queued — click <span className="font-medium text-foreground">Save Changes</span> to apply.
              </p>
              <div className="space-y-0.5 mt-1">
                {sortedWidgets.map((w, idx) => (
                  <WidgetRow
                    key={w.id}
                    id={w.id}
                    visible={w.visible}
                    isFirst={idx === 0}
                    isLast={idx === sortedWidgets.length - 1}
                    onToggle={() => toggleWidget(w.id)}
                    onMoveUp={() => moveWidget(idx, -1)}
                    onMoveDown={() => moveWidget(idx, 1)}
                    onRemove={() => removeWidget(w.id)}
                    recentAction={recentAction[w.id] ?? null}
                  />
                ))}
              </div>
            </div>

            <div className="pb-2">
              <button type="button" onClick={resetToDefault}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
                <RotateCcw className="h-3 w-3" />
                Reset everything to system defaults
              </button>
            </div>
          </TabsContent>

          {/* ── Dashboards tab ─────────────────────────────────────────────── */}
          <TabsContent value="dashboards" className="flex-1 overflow-y-auto px-6 mt-2 pb-2 space-y-4">

            {/* System default */}
            <div className="space-y-1.5">
              <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">System Default</p>
              <DashboardRow
                name="Overview (Default)"
                isActive={isOnSystemDefault}
                isDefault={isOnSystemDefault}
                subtitle="Built-in layout — always available, cannot be deleted"
                icon={<Globe className="h-3.5 w-3.5 text-muted-foreground" />}
                onSetDefault={() => onSetDefault(null)}
              />
            </div>

            {dashboardList && dashboardList.personal.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">My Dashboards</p>
                <div className="space-y-1">
                  {dashboardList.personal.map(d => (
                    <DashboardRow
                      key={d.id}
                      name={d.name}
                      isActive={defaultId === d.id}
                      isDefault={defaultId === d.id}
                      subtitle={d.description ?? `Updated ${new Date(d.updatedAt).toLocaleDateString()}`}
                      badge={visibilityBadge(d)}
                      onSetDefault={() => onSetDefault(d.id)}
                      onDelete={() => onDelete(d.id)}
                      onClone={() => onClone(d.id)}
                      isCloning={isCloning}
                    />
                  ))}
                </div>
              </div>
            )}

            {dashboardList && dashboardList.teamVisible.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Team Dashboards</p>
                <div className="space-y-1">
                  {dashboardList.teamVisible.map(d => (
                    <DashboardRow
                      key={d.id}
                      name={d.name}
                      isActive={defaultId === d.id}
                      isDefault={defaultId === d.id}
                      subtitle={d.description ?? d.visibilityTeam?.name}
                      badge={visibilityBadge(d)}
                      icon={
                        d.visibilityTeam ? (
                          <span
                            className="h-3.5 w-3.5 rounded-full shrink-0 inline-block border border-border/50"
                            style={{ backgroundColor: d.visibilityTeam.color }}
                          />
                        ) : <Users className="h-3.5 w-3.5 text-muted-foreground" />
                      }
                      onSetDefault={() => onSetDefault(d.id)}
                      onClone={() => onClone(d.id)}
                      isCloning={isCloning}
                    />
                  ))}
                </div>
              </div>
            )}

            {dashboardList && dashboardList.shared.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Shared by Admins</p>
                <div className="space-y-1">
                  {dashboardList.shared.map(d => (
                    <DashboardRow
                      key={d.id}
                      name={d.name}
                      isActive={defaultId === d.id}
                      isDefault={defaultId === d.id}
                      subtitle={d.description ?? "Shared across the organisation"}
                      badge={visibilityBadge(d)}
                      icon={<Globe className="h-3.5 w-3.5 text-muted-foreground" />}
                      onSetDefault={() => onSetDefault(d.id)}
                      onClone={() => onClone(d.id)}
                      onDelete={isElevated && d.userId !== null ? () => onDelete(d.id) : undefined}
                      isCloning={isCloning}
                    />
                  ))}
                </div>
              </div>
            )}

            {dashboardList?.personal.length === 0 && dashboardList?.shared.length === 0 && dashboardList?.teamVisible.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-muted flex items-center justify-center">
                  <LayoutGrid className="h-5 w-5 text-muted-foreground/50" />
                </div>
                <p className="text-sm font-medium text-muted-foreground">No saved dashboards yet</p>
                <p className="text-xs text-muted-foreground/70 max-w-[220px]">
                  Use the Customize tab to name and save your current layout.
                </p>
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* ── Footer ──────────────────────────────────────────────────────── */}
        <div className="shrink-0 px-6 pb-5 pt-4 border-t bg-muted/20 space-y-3">
          {saveError && <ErrorAlert error={saveError} fallback="Failed to save dashboard" />}
          {tab === "customize" && (
            <div className="flex justify-between gap-2">
              <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={isSaving}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleSave} disabled={isSaving} className="gap-1.5 min-w-[100px]">
                {isSaving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {isSaving ? "Saving…" : activeDashboard ? "Save Changes" : "Save & Apply"}
              </Button>
            </div>
          )}
          {tab === "dashboards" && (
            <Button variant="outline" size="sm" className="w-full" onClick={() => onOpenChange(false)}>
              Done
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Dashboard row (Dashboards tab) ────────────────────────────────────────────

function DashboardRow({
  name, subtitle, isActive, isDefault, icon, badge,
  onSetDefault, onDelete, onClone, isCloning,
}: {
  name: string;
  subtitle?: string;
  isActive: boolean;
  isDefault: boolean;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  onSetDefault: () => void;
  onDelete?: () => void;
  onClone?: () => void;
  isCloning?: boolean;
}) {
  return (
    <div className={[
      "flex items-center gap-3 rounded-lg px-3 py-2.5 border transition-all",
      isActive
        ? "bg-primary/5 border-primary/20 shadow-sm"
        : "border-transparent hover:bg-muted/40 hover:border-border/60",
    ].join(" ")}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          {icon}
          <span className={`text-sm font-medium truncate ${isActive ? "text-primary" : ""}`}>{name}</span>
          {isDefault && <Star className="h-3 w-3 fill-yellow-400 text-yellow-400 shrink-0" />}
          {badge}
        </div>
        {subtitle && (
          <p className="text-xs text-muted-foreground mt-0.5 truncate">{subtitle}</p>
        )}
      </div>

      <div className="flex items-center gap-1 shrink-0">
        {!isActive ? (
          <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 px-2" onClick={onSetDefault}>
            <Check className="h-3 w-3" />
            Use
          </Button>
        ) : (
          <span className="text-[11px] font-medium text-primary/70 px-1.5">Active</span>
        )}
        {onClone && (
          <Button
            variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground"
            onClick={onClone} disabled={isCloning} title="Clone dashboard"
          >
            {isCloning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Copy className="h-3.5 w-3.5" />}
          </Button>
        )}
        {onDelete && (
          <Button
            variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive"
            onClick={onDelete} aria-label={`Delete ${name}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}
