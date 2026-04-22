/**
 * TicketViewBuilderDialog
 *
 * Full-featured dialog for creating or editing a saved ticket view.
 * Covers:
 *   • Identity    — name + emoji
 *   • Filters     — all query-able ticket fields
 *   • Columns     — toggle column visibility
 *   • Settings    — sort, default, sharing
 */

import { useState, useEffect, useMemo } from "react";
import { useQuery }     from "@tanstack/react-query";
import axios            from "axios";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button }   from "@/components/ui/button";
import { Input }    from "@/components/ui/input";
import { Switch }   from "@/components/ui/switch";
import { Label }    from "@/components/ui/label";
import { Badge }    from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Filter, Columns3, Settings2, Loader2,
  Star, Users, ArrowUpDown, SlidersHorizontal,
  CheckCircle2,
} from "lucide-react";
import { agentTicketStatuses, statusLabel }     from "core/constants/ticket-status.ts";
import { ticketTypes, ticketTypeLabel }         from "core/constants/ticket-type.ts";
import { categoryLabel }                         from "core/constants/ticket-category.ts";
import { ticketPriorities, priorityLabel }       from "core/constants/ticket-priority.ts";
import { ticketSeverities, severityShortLabel }  from "core/constants/ticket-severity.ts";
import {
  COLUMN_IDS, COLUMN_META,
  SYSTEM_DEFAULT_VIEW_CONFIG,
  type SavedViewConfig,
  type SavedViewFilters,
} from "core/schemas/ticket-view.ts";
import { type StoredView, useTicketViews }       from "@/hooks/useTicketViews";
import { useMe } from "@/hooks/useMe";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Team { id: number; name: string; color: string; }

interface CustomStatusConfig { id: number; label: string; color: string; isActive: boolean; }

interface CustomTicketTypeConfig { id: number; name: string; isActive: boolean; }

interface Props {
  open:         boolean;
  onOpenChange: (open: boolean) => void;
  viewToEdit?:  StoredView | null;
  onSaved?:     (view: StoredView) => void;
}

// ── Emoji palette ─────────────────────────────────────────────────────────────

const EMOJI_PALETTE = [
  "📋","🎯","🚀","⚡","🔥","❄️","🛡️","📊","📈","🔍",
  "👤","👥","🏆","✅","🔔","💡","📌","🗂️","🖥️","🌐",
  "⚙️","🔧","🛠️","📝","📦","🌟","💬","🎫","📡","🗃️",
  "🔴","🟠","🟡","🟢","🔵","🟣","⚫","⚪","🟤","🔶",
];

// ── Sort columns (from COLUMN_META) ──────────────────────────────────────────

const SORT_OPTIONS = COLUMN_IDS
  .filter((id) => COLUMN_META[id].sortable && COLUMN_META[id].sortKey)
  .map((id) => ({ key: COLUMN_META[id].sortKey!, label: COLUMN_META[id].label }));

// ── Filter preview helper ─────────────────────────────────────────────────────

function filterSummaryParts(
  filters: SavedViewFilters,
  teams: Team[],
  customStatuses: CustomStatusConfig[],
  customTypes: CustomTicketTypeConfig[],
): string[] {
  const parts: string[] = [];
  if (filters.assignedToMe) parts.push("Assigned to me");
  if (filters.escalated)    parts.push("Escalated");
  if (filters.status)       parts.push(`Status: ${statusLabel[filters.status as keyof typeof statusLabel] ?? filters.status}`);
  if (filters.customStatusId) {
    const cs = customStatuses.find((s) => s.id === filters.customStatusId);
    if (cs) parts.push(`Status: ${cs.label}`);
  }
  if (filters.ticketType)   parts.push(`Type: ${ticketTypeLabel[filters.ticketType as keyof typeof ticketTypeLabel] ?? filters.ticketType}`);
  if (filters.customTicketTypeId) {
    const ct = customTypes.find((t) => t.id === filters.customTicketTypeId);
    if (ct) parts.push(`Type: ${ct.name}`);
  }
  if (filters.priority)     parts.push(`Priority: ${priorityLabel[filters.priority as keyof typeof priorityLabel] ?? filters.priority}`);
  if (filters.severity)     parts.push(`Severity: ${severityShortLabel[filters.severity as keyof typeof severityShortLabel] ?? filters.severity}`);
  if (filters.category)     parts.push(`Category: ${categoryLabel[filters.category as keyof typeof categoryLabel] ?? filters.category}`);
  if (filters.teamId !== undefined) {
    if (filters.teamId === "none") parts.push("No team");
    else {
      const team = teams.find((t) => t.id === filters.teamId);
      parts.push(`Team: ${team?.name ?? filters.teamId}`);
    }
  }
  return parts;
}

// ── Main component ────────────────────────────────────────────────────────────

export default function TicketViewBuilderDialog({ open, onOpenChange, viewToEdit, onSaved }: Props) {
  const { data: me } = useMe();
  const isAdmin = me?.role === "admin" || me?.role === "supervisor";
  const isEditing = viewToEdit != null;

  // ── Data fetches ─────────────────────────────────────────────────────────────
  const { data: teamsData } = useQuery({
    queryKey: ["teams"],
    queryFn: () => axios.get<{ teams: Team[] }>("/api/teams").then((r) => r.data.teams),
    staleTime: 60_000,
  });
  const { data: customStatusesRaw } = useQuery({
    queryKey: ["ticket-status-configs"],
    queryFn: () => axios.get<{ configs: CustomStatusConfig[] }>("/api/ticket-status-configs").then((r) => r.data.configs),
    staleTime: 60_000,
  });
  const { data: customTypesRaw } = useQuery({
    queryKey: ["ticket-types"],
    queryFn: () => axios.get<{ ticketTypes: CustomTicketTypeConfig[] }>("/api/ticket-types").then((r) => r.data.ticketTypes),
    staleTime: 60_000,
  });

  const teams          = teamsData ?? [];
  const customStatuses = (customStatusesRaw ?? []).filter((s) => s.isActive);
  const customTypes    = (customTypesRaw ?? []).filter((t) => t.isActive);

  // ── Local state ───────────────────────────────────────────────────────────────
  const [name,         setName]         = useState("");
  const [emoji,        setEmoji]        = useState("");
  const [filters,      setFilters]      = useState<SavedViewFilters>({});
  const [columns,      setColumns]      = useState(SYSTEM_DEFAULT_VIEW_CONFIG.columns);
  const [sortBy,       setSortBy]       = useState("createdAt");
  const [sortOrder,    setSortOrder]    = useState<"asc" | "desc">("desc");
  const [setAsDefault, setSetAsDefault] = useState(false);
  const [isShared,     setIsShared]     = useState(false);
  const [tab,          setTab]          = useState("filters");

  // Reset state when dialog opens/closes or viewToEdit changes
  useEffect(() => {
    if (!open) return;
    if (viewToEdit) {
      setName(viewToEdit.name);
      setEmoji(viewToEdit.emoji ?? "");
      setFilters(viewToEdit.config.filters ?? {});
      setColumns(viewToEdit.config.columns);
      setSortBy(viewToEdit.config.sort.by);
      setSortOrder(viewToEdit.config.sort.order);
      setSetAsDefault(viewToEdit.isDefault);
      setIsShared(viewToEdit.isShared);
    } else {
      setName("");
      setEmoji("");
      setFilters({});
      setColumns(SYSTEM_DEFAULT_VIEW_CONFIG.columns);
      setSortBy("createdAt");
      setSortOrder("desc");
      setSetAsDefault(false);
      setIsShared(false);
    }
    setTab("filters");
  }, [open, viewToEdit]);

  const { saveView, setDefaultView } = useTicketViews();

  // ── Filter preview ────────────────────────────────────────────────────────────
  const summaryParts = useMemo(
    () => filterSummaryParts(filters, teams, customStatuses, customTypes),
    [filters, teams, customStatuses, customTypes],
  );

  // ── Column count ──────────────────────────────────────────────────────────────
  const visibleColCount = columns.filter((c) => c.visible).length;

  // ── Save handler ──────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!name.trim()) return;

    const config: SavedViewConfig = {
      columns,
      sort: { by: sortBy, order: sortOrder },
      filters: Object.keys(filters).length > 0 ? filters : undefined,
    };

    const saved = await saveView.mutateAsync({
      viewId:      isEditing ? viewToEdit!.id : null,
      name:        name.trim(),
      emoji:       emoji || undefined,
      config,
      isShared,
      setAsDefault: !isEditing ? setAsDefault : undefined,
    });

    // Handle default separately for edit (since saveView.put doesn't toggle default)
    if (isEditing && setAsDefault && !viewToEdit!.isDefault) {
      await setDefaultView.mutateAsync(viewToEdit!.id);
    } else if (isEditing && !setAsDefault && viewToEdit!.isDefault) {
      await setDefaultView.mutateAsync(null);
    }

    onSaved?.(saved);
    onOpenChange(false);
  }

  const isPending = saveView.isPending || setDefaultView.isPending;

  // ── Filter setter helpers ─────────────────────────────────────────────────────
  const ALL = "__all__";
  function setFilter<K extends keyof SavedViewFilters>(key: K, val: SavedViewFilters[K] | undefined) {
    setFilters((prev) => {
      const next = { ...prev };
      if (val === undefined) delete next[key];
      else next[key] = val;
      return next;
    });
  }

  function toggleColumn(id: string, visible: boolean) {
    setColumns((prev) =>
      prev.map((c) => (c.id === id ? { ...c, visible } : c)),
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[92vh] flex flex-col p-0 gap-0 overflow-hidden">

        {/* ── Header ── */}
        <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <div className="flex items-start gap-4">
            {/* Emoji display */}
            <div className="h-11 w-11 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-xl shrink-0">
              {emoji || "📋"}
            </div>
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-base font-semibold mb-1">
                {isEditing ? "Edit view" : "Create view"}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                {isEditing
                  ? "Update the filters, columns, and settings for this view."
                  : "Build a custom view with saved filters and column preferences."}
              </DialogDescription>
            </div>
            {isShared && (
              <Badge variant="secondary" className="shrink-0 text-[10px] gap-1">
                <Users className="h-2.5 w-2.5" />Shared
              </Badge>
            )}
            {setAsDefault && (
              <Badge variant="secondary" className="shrink-0 text-[10px] gap-1">
                <Star className="h-2.5 w-2.5" />Default
              </Badge>
            )}
          </div>

          {/* Name + emoji picker inline */}
          <div className="mt-4 space-y-3">
            <div className="flex gap-2">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="View name — e.g. My Open Tickets"
                className="flex-1 font-medium"
                autoFocus
              />
            </div>

            {/* Emoji grid */}
            <div>
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-1.5">Icon</p>
              <div className="flex flex-wrap gap-1">
                {EMOJI_PALETTE.map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => setEmoji(emoji === e ? "" : e)}
                    className={[
                      "h-7 w-7 rounded-md text-sm flex items-center justify-center transition-colors",
                      emoji === e
                        ? "bg-primary/15 ring-1 ring-primary"
                        : "hover:bg-muted",
                    ].join(" ")}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </DialogHeader>

        {/* ── Tabs ── */}
        <Tabs value={tab} onValueChange={setTab} className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <TabsList className="shrink-0 mx-6 mt-4 mb-0 h-9 grid grid-cols-3 w-auto self-start">
            <TabsTrigger value="filters" className="gap-1.5 text-xs">
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Filters
              {summaryParts.length > 0 && (
                <span className="ml-0.5 text-[9px] font-bold bg-primary text-primary-foreground rounded-full px-1.5">{summaryParts.length}</span>
              )}
            </TabsTrigger>
            <TabsTrigger value="columns" className="gap-1.5 text-xs">
              <Columns3 className="h-3.5 w-3.5" />
              Columns
              <span className="ml-0.5 text-[9px] text-muted-foreground">({visibleColCount})</span>
            </TabsTrigger>
            <TabsTrigger value="settings" className="gap-1.5 text-xs">
              <Settings2 className="h-3.5 w-3.5" />
              Settings
            </TabsTrigger>
          </TabsList>

          {/* ── Filters tab ── */}
          <TabsContent value="filters" className="flex-1 overflow-y-auto px-6 py-4 mt-0 space-y-5">

            {/* Preview chips */}
            {summaryParts.length > 0 && (
              <div className="rounded-xl border bg-muted/30 px-3 py-2.5 space-y-1.5">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Active filters</p>
                <div className="flex flex-wrap gap-1.5">
                  {summaryParts.map((p) => (
                    <span key={p} className="inline-flex items-center gap-1 text-[11px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">
                      <Filter className="h-2.5 w-2.5" />{p}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Toggle filters */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className={[
                "flex items-center justify-between rounded-xl border px-4 py-3 cursor-pointer transition-colors",
                filters.assignedToMe ? "border-primary/40 bg-primary/5" : "hover:bg-muted/30",
              ].join(" ")}>
                <div>
                  <p className="text-sm font-medium">Assigned to me</p>
                  <p className="text-xs text-muted-foreground">Only tickets assigned to you</p>
                </div>
                <Switch
                  checked={!!filters.assignedToMe}
                  onCheckedChange={(v) => setFilter("assignedToMe", v || undefined)}
                />
              </label>

              <label className={[
                "flex items-center justify-between rounded-xl border px-4 py-3 cursor-pointer transition-colors",
                filters.escalated ? "border-destructive/40 bg-destructive/5" : "hover:bg-muted/30",
              ].join(" ")}>
                <div>
                  <p className="text-sm font-medium">Escalated only</p>
                  <p className="text-xs text-muted-foreground">Only escalated tickets</p>
                </div>
                <Switch
                  checked={!!filters.escalated}
                  onCheckedChange={(v) => setFilter("escalated", v || undefined)}
                />
              </label>
            </div>

            {/* Dropdown filters */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

              {/* Status */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</Label>
                <Select
                  value={
                    filters.customStatusId != null
                      ? `custom_${filters.customStatusId}`
                      : (filters.status ?? ALL)
                  }
                  onValueChange={(v) => {
                    if (v === ALL) { setFilter("status", undefined); setFilter("customStatusId", undefined); }
                    else if (v.startsWith("custom_")) { setFilter("status", undefined); setFilter("customStatusId", parseInt(v.replace("custom_",""),10) as SavedViewFilters["customStatusId"]); }
                    else { setFilter("status", v as SavedViewFilters["status"]); setFilter("customStatusId", undefined); }
                  }}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Any status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>Any status</SelectItem>
                    {agentTicketStatuses.map((s) => (
                      <SelectItem key={s} value={s}>{statusLabel[s]}</SelectItem>
                    ))}
                    {customStatuses.map((cs) => (
                      <SelectItem key={`custom_${cs.id}`} value={`custom_${cs.id}`}>{cs.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Ticket Type */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Type</Label>
                <Select
                  value={
                    filters.customTicketTypeId != null
                      ? `custom_${filters.customTicketTypeId}`
                      : (filters.ticketType ?? ALL)
                  }
                  onValueChange={(v) => {
                    if (v === ALL) { setFilter("ticketType", undefined); setFilter("customTicketTypeId", undefined); }
                    else if (v.startsWith("custom_")) { setFilter("ticketType", undefined); setFilter("customTicketTypeId", parseInt(v.replace("custom_",""),10) as SavedViewFilters["customTicketTypeId"]); }
                    else { setFilter("ticketType", v as SavedViewFilters["ticketType"]); setFilter("customTicketTypeId", undefined); }
                  }}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Any type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>Any type</SelectItem>
                    {ticketTypes.map((t) => (
                      <SelectItem key={t} value={t}>{ticketTypeLabel[t]}</SelectItem>
                    ))}
                    {customTypes.map((ct) => (
                      <SelectItem key={`custom_${ct.id}`} value={`custom_${ct.id}`}>{ct.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Priority */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Priority</Label>
                <Select
                  value={filters.priority ?? ALL}
                  onValueChange={(v) => setFilter("priority", v === ALL ? undefined : v as SavedViewFilters["priority"])}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Any priority" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>Any priority</SelectItem>
                    {ticketPriorities.map((p) => (
                      <SelectItem key={p} value={p}>{priorityLabel[p]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Severity */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Severity</Label>
                <Select
                  value={filters.severity ?? ALL}
                  onValueChange={(v) => setFilter("severity", v === ALL ? undefined : v as SavedViewFilters["severity"])}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Any severity" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>Any severity</SelectItem>
                    {ticketSeverities.map((s) => (
                      <SelectItem key={s} value={s}>{severityShortLabel[s]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Category */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Category</Label>
                <Select
                  value={filters.category ?? ALL}
                  onValueChange={(v) => setFilter("category", v === ALL ? undefined : v as SavedViewFilters["category"])}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Any category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>Any category</SelectItem>
                    <SelectItem value="general_question">{categoryLabel.general_question}</SelectItem>
                    <SelectItem value="technical_question">{categoryLabel.technical_question}</SelectItem>
                    <SelectItem value="refund_request">{categoryLabel.refund_request}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Team */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Team</Label>
                <Select
                  value={filters.teamId !== undefined ? String(filters.teamId) : ALL}
                  onValueChange={(v) => {
                    if (v === ALL) setFilter("teamId", undefined);
                    else if (v === "none") setFilter("teamId", "none");
                    else setFilter("teamId", Number(v) as SavedViewFilters["teamId"]);
                  }}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Any team" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>Any team</SelectItem>
                    <SelectItem value="none">No team assigned</SelectItem>
                    {teams.map((t) => (
                      <SelectItem key={t.id} value={String(t.id)}>
                        <span className="flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: t.color }} />
                          {t.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {summaryParts.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-4">
                No filters set — this view will show all tickets. Add filters above to narrow results.
              </p>
            )}
          </TabsContent>

          {/* ── Columns tab ── */}
          <TabsContent value="columns" className="flex-1 overflow-y-auto px-6 py-4 mt-0">
            <p className="text-xs text-muted-foreground mb-4">Choose which columns are visible in this view.</p>
            <div className="space-y-1.5">
              {columns.map((col) => {
                const meta = COLUMN_META[col.id as keyof typeof COLUMN_META];
                if (!meta) return null;
                return (
                  <label
                    key={col.id}
                    className={[
                      "flex items-center justify-between rounded-lg border px-4 py-2.5 cursor-pointer transition-colors",
                      col.visible ? "border-primary/30 bg-primary/5" : "hover:bg-muted/20",
                    ].join(" ")}
                  >
                    <div className="flex items-center gap-2.5">
                      {col.visible
                        ? <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                        : <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30 shrink-0" />}
                      <span className="text-sm font-medium">{meta.label}</span>
                      {meta.sortable && (
                        <span className="text-[10px] text-muted-foreground/60 bg-muted px-1 rounded">sortable</span>
                      )}
                    </div>
                    <Switch
                      checked={col.visible}
                      onCheckedChange={(v) => toggleColumn(col.id, v)}
                    />
                  </label>
                );
              })}
            </div>
          </TabsContent>

          {/* ── Settings tab ── */}
          <TabsContent value="settings" className="flex-1 overflow-y-auto px-6 py-4 mt-0 space-y-6">

            {/* Sort */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm font-semibold">Default sort</p>
              </div>
              <div className="flex gap-2">
                <Select value={sortBy} onValueChange={setSortBy}>
                  <SelectTrigger className="flex-1 h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SORT_OPTIONS.map((opt) => (
                      <SelectItem key={opt.key} value={opt.key}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={sortOrder} onValueChange={(v) => setSortOrder(v as "asc" | "desc")}>
                  <SelectTrigger className="w-36 h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="desc">Newest first</SelectItem>
                    <SelectItem value="asc">Oldest first</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="border-t pt-4 space-y-3">
              {/* Default */}
              <label className={[
                "flex items-center justify-between rounded-xl border px-4 py-3 cursor-pointer transition-colors",
                setAsDefault ? "border-amber-300 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-700/40" : "hover:bg-muted/30",
              ].join(" ")}>
                <div className="flex items-center gap-3">
                  <Star className={`h-4 w-4 ${setAsDefault ? "text-amber-500" : "text-muted-foreground"}`} />
                  <div>
                    <p className="text-sm font-medium">Set as default view</p>
                    <p className="text-xs text-muted-foreground">This view loads automatically when you open Tickets</p>
                  </div>
                </div>
                <Switch checked={setAsDefault} onCheckedChange={setSetAsDefault} />
              </label>

              {/* Shared — admin/supervisor only */}
              {isAdmin && (
                <label className={[
                  "flex items-center justify-between rounded-xl border px-4 py-3 cursor-pointer transition-colors",
                  isShared ? "border-primary/40 bg-primary/5" : "hover:bg-muted/30",
                ].join(" ")}>
                  <div className="flex items-center gap-3">
                    <Users className={`h-4 w-4 ${isShared ? "text-primary" : "text-muted-foreground"}`} />
                    <div>
                      <p className="text-sm font-medium">Share with all agents</p>
                      <p className="text-xs text-muted-foreground">All agents can see and use this view (read-only for them)</p>
                    </div>
                  </div>
                  <Switch checked={isShared} onCheckedChange={setIsShared} />
                </label>
              )}
            </div>
          </TabsContent>
        </Tabs>

        {/* ── Footer ── */}
        <DialogFooter className="px-6 py-4 border-t shrink-0 gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isPending || !name.trim()}>
            {isPending
              ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Saving…</>
              : <><CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />{isEditing ? "Save changes" : "Create view"}</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
