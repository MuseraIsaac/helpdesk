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
  CheckCircle2, ChevronsUpDown, Check,
} from "lucide-react";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { agentTicketStatuses, statusLabel }     from "core/constants/ticket-status.ts";
import { ticketTypes, ticketTypeLabel }         from "core/constants/ticket-type.ts";
import { ticketCategories, categoryLabel }       from "core/constants/ticket-category.ts";
import { ticketPriorities, priorityLabel }       from "core/constants/ticket-priority.ts";
import { ticketSeverities, severityShortLabel }  from "core/constants/ticket-severity.ts";
import { ticketImpacts, impactLabel }            from "core/constants/ticket-impact.ts";
import { ticketUrgencies, urgencyLabel }         from "core/constants/ticket-urgency.ts";
import {
  COLUMN_IDS, COLUMN_META,
  SYSTEM_DEFAULT_VIEW_CONFIG,
  type SavedViewConfig,
  type SavedViewFilters,
} from "core/schemas/ticket-view.ts";
import { type StoredView, useTicketViews }       from "@/hooks/useTicketViews";
import { useMe } from "@/hooks/useMe";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Team   { id: number; name: string; color: string; }
interface Agent  { id: string; name: string; }
interface CustomStatusConfig      { id: number; label: string; color: string; isActive: boolean; }
interface CustomTicketTypeConfig  { id: number; name: string; isActive: boolean; }

// ── Multi-select filter component ─────────────────────────────────────────────
// Generic over both the option type T and an arbitrary key K so that callers
// can store entries by id (e.g. team id) while rendering rich row content.

function MultiSelectFilter<T, K extends string | number>({
  label,
  options,
  value,
  onChange,
  renderLabel,
  renderPrefix,
  keyOf,
  searchable,
  searchPlaceholder,
  emptyText,
}: {
  label: string;
  options: readonly T[];
  value: K[];
  onChange: (val: K[]) => void;
  renderLabel: (v: T) => string;
  renderPrefix?: (v: T) => React.ReactNode;
  /** Extracts the persistable key for an option (defaults to using the option as-is). */
  keyOf?: (v: T) => K;
  searchable?: boolean;
  searchPlaceholder?: string;
  emptyText?: string;
}) {
  const [open, setOpen]     = useState(false);
  const [search, setSearch] = useState("");

  const getKey  = keyOf ?? ((v: T) => v as unknown as K);
  const labelOf = (k: K): string => {
    const opt = options.find((o) => getKey(o) === k);
    return opt ? renderLabel(opt) : String(k);
  };

  function toggle(opt: T) {
    const k = getKey(opt);
    onChange(value.includes(k) ? value.filter((v) => v !== k) : [...value, k]);
  }

  const filtered = searchable && search.trim()
    ? options.filter((o) => renderLabel(o).toLowerCase().includes(search.toLowerCase()))
    : options;

  const displayText =
    value.length === 0
      ? `Any ${label.toLowerCase()}`
      : value.length === 1
      ? labelOf(value[0])
      : `${value.length} ${label.toLowerCase()}s`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={[
            "h-9 w-full flex items-center justify-between rounded-md border px-3 py-2 text-sm transition-colors",
            "hover:bg-muted/50 focus:outline-none focus:ring-1 focus:ring-ring",
            value.length > 0 ? "border-primary/40 bg-primary/5" : "border-input bg-background",
          ].join(" ")}
        >
          <span className={value.length === 0 ? "text-muted-foreground" : "font-medium"}>
            {displayText}
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground shrink-0 ml-2" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="p-1 w-60" align="start">
        {searchable && (
          <div className="px-1.5 pt-1 pb-1.5 border-b mb-1">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={searchPlaceholder ?? "Search…"}
              className="h-7 text-xs"
            />
          </div>
        )}
        <div className="max-h-56 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-3 px-2">
              {emptyText ?? "No matches"}
            </p>
          ) : filtered.map((opt) => {
            const k = getKey(opt);
            const selected = value.includes(k);
            return (
              <button
                key={String(k)}
                type="button"
                onClick={() => toggle(opt)}
                className="flex items-center gap-2.5 w-full px-2 py-1.5 text-sm rounded hover:bg-muted text-left"
              >
                <span className={[
                  "h-4 w-4 rounded border-[1.5px] flex items-center justify-center shrink-0 transition-colors",
                  selected ? "bg-primary border-primary" : "border-input",
                ].join(" ")}>
                  {selected && <Check className="h-2.5 w-2.5 text-primary-foreground" strokeWidth={3} />}
                </span>
                {renderPrefix && renderPrefix(opt)}
                <span className="truncate">{renderLabel(opt)}</span>
              </button>
            );
          })}
        </div>
        {value.length > 0 && (
          <div className="border-t mt-1 pt-1">
            <button
              type="button"
              onClick={() => onChange([])}
              className="w-full px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted rounded text-left"
            >
              Clear selection
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

const SOURCE_LABELS: Record<string, string> = {
  email:  "Email",
  portal: "Customer Portal",
  agent:  "Agent (manual)",
};

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
  agents: Agent[],
  customStatuses: CustomStatusConfig[],
  customTypes: CustomTicketTypeConfig[],
): string[] {
  const parts: string[] = [];
  if (filters.assignedToMe) parts.push("Assigned to me");
  if (filters.unassigned)   parts.push("Agent unassigned");
  if (filters.escalated)    parts.push("Escalated only");
  if (filters.slaBreached)  parts.push("SLA breached");

  // Status: built-in + custom combined for display
  const statusLabels = [
    ...(filters.status ?? []).map((s) => statusLabel[s as keyof typeof statusLabel] ?? s),
    ...(filters.customStatusId ?? []).map((id) => customStatuses.find((cs) => cs.id === id)?.label ?? `#${id}`),
  ];
  if (statusLabels.length) {
    parts.push(statusLabels.length === 1 ? `Status: ${statusLabels[0]}` : `Status: ${statusLabels.length} values`);
  }

  // Type: built-in + custom combined
  const typeLabels = [
    ...(filters.ticketType ?? []).map((t) => ticketTypeLabel[t as keyof typeof ticketTypeLabel] ?? t),
    ...(filters.customTicketTypeId ?? []).map((id) => customTypes.find((ct) => ct.id === id)?.name ?? `#${id}`),
  ];
  if (typeLabels.length) {
    parts.push(typeLabels.length === 1 ? `Type: ${typeLabels[0]}` : `Type: ${typeLabels.length} values`);
  }

  if (filters.priority?.length)  parts.push(filters.priority.length === 1 ? `Priority: ${priorityLabel[filters.priority[0] as keyof typeof priorityLabel] ?? filters.priority[0]}` : `Priority: ${filters.priority.length} values`);
  if (filters.severity?.length)  parts.push(filters.severity.length === 1 ? `Severity: ${severityShortLabel[filters.severity[0] as keyof typeof severityShortLabel] ?? filters.severity[0]}` : `Severity: ${filters.severity.length} values`);
  if (filters.impact?.length)    parts.push(filters.impact.length   === 1 ? `Impact: ${impactLabel[filters.impact[0] as keyof typeof impactLabel] ?? filters.impact[0]}`       : `Impact: ${filters.impact.length} values`);
  if (filters.urgency?.length)   parts.push(filters.urgency.length  === 1 ? `Urgency: ${urgencyLabel[filters.urgency[0] as keyof typeof urgencyLabel] ?? filters.urgency[0]}`  : `Urgency: ${filters.urgency.length} values`);
  if (filters.source?.length)    parts.push(filters.source.length   === 1 ? `Source: ${SOURCE_LABELS[filters.source[0]] ?? filters.source[0]}`                                  : `Source: ${filters.source.length} values`);
  if (filters.category?.length)  parts.push(filters.category.length === 1 ? `Category: ${categoryLabel[filters.category[0] as keyof typeof categoryLabel] ?? filters.category[0]}` : `Category: ${filters.category.length} values`);

  if (filters.assignedToId?.length) {
    if (filters.assignedToId.length === 1) {
      const agent = agents.find((a) => a.id === filters.assignedToId![0]);
      parts.push(`Assignee: ${agent?.name ?? "Agent"}`);
    } else {
      parts.push(`Assignee: ${filters.assignedToId.length} agents`);
    }
  }

  if (filters.teamId?.length) {
    if (filters.teamId.length === 1) {
      const t = filters.teamId[0];
      if (t === "none") parts.push("Team: No team");
      else parts.push(`Team: ${teams.find((x) => x.id === t)?.name ?? t}`);
    } else {
      parts.push(`Team: ${filters.teamId.length} values`);
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
  const { data: agentsRaw } = useQuery({
    queryKey: ["agents-list"],
    queryFn: () => axios.get<{ users: Agent[] }>("/api/users").then((r) => r.data.users),
    staleTime: 60_000,
    enabled: open,
  });

  const teams          = teamsData ?? [];
  const agents         = agentsRaw ?? [];
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
    () => filterSummaryParts(filters, teams, agents, customStatuses, customTypes),
    [filters, teams, agents, customStatuses, customTypes],
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

            {/* ── Toggle filters ── */}
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Quick toggles</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {[
                  { key: "assignedToMe" as const, label: "Assigned to me",    desc: "Only tickets assigned to you",          active: !!filters.assignedToMe, color: "border-primary/40 bg-primary/5" },
                  { key: "unassigned"   as const, label: "Agent unassigned",   desc: "Tickets with no assigned agent",        active: !!filters.unassigned,   color: "border-amber-400/40 bg-amber-50 dark:bg-amber-950/20" },
                  { key: "escalated"    as const, label: "Escalated only",     desc: "Only escalated tickets",               active: !!filters.escalated,    color: "border-destructive/40 bg-destructive/5" },
                  { key: "slaBreached"  as const, label: "SLA breached",       desc: "Tickets past their SLA deadline",       active: !!filters.slaBreached,  color: "border-red-400/40 bg-red-50 dark:bg-red-950/20" },
                ].map(({ key, label, desc, active, color }) => (
                  <label key={key} className={[
                    "flex items-center justify-between rounded-xl border px-4 py-2.5 cursor-pointer transition-colors",
                    active ? color : "hover:bg-muted/30",
                  ].join(" ")}>
                    <div>
                      <p className="text-sm font-medium">{label}</p>
                      <p className="text-xs text-muted-foreground">{desc}</p>
                    </div>
                    <Switch
                      checked={active}
                      onCheckedChange={(v) => {
                        setFilter(key, v || undefined);
                        // mutual exclusion: assignedToMe ↔ unassigned
                        if (key === "assignedToMe" && v) setFilter("unassigned", undefined);
                        if (key === "unassigned"   && v) { setFilter("assignedToMe", undefined); setFilter("assignedToId", undefined); }
                      }}
                    />
                  </label>
                ))}
              </div>
            </div>

            {/* ── Dropdown filters ── */}
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Field filters</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

                {/* Status — multi-select combining built-in + custom statuses */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">Status</Label>
                  <MultiSelectFilter<{ key: string; label: string; isCustom: boolean }, string>
                    label="Status"
                    options={[
                      ...agentTicketStatuses.map((s) => ({ key: s, label: statusLabel[s], isCustom: false })),
                      ...customStatuses.map((cs) => ({ key: `custom_${cs.id}`, label: cs.label, isCustom: true })),
                    ]}
                    value={[
                      ...((filters.status ?? []) as string[]),
                      ...((filters.customStatusId ?? []).map((id) => `custom_${id}`)),
                    ]}
                    keyOf={(o) => o.key}
                    renderLabel={(o) => o.label}
                    onChange={(keys) => {
                      const builtIns = keys.filter((k) => !k.startsWith("custom_"));
                      const customs  = keys.filter((k) => k.startsWith("custom_")).map((k) => Number(k.replace("custom_", "")));
                      setFilter("status", builtIns.length ? (builtIns as SavedViewFilters["status"]) : undefined);
                      setFilter("customStatusId", customs.length ? customs : undefined);
                    }}
                  />
                </div>

                {/* Ticket Type — multi-select combining built-in + custom types */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">Type</Label>
                  <MultiSelectFilter<{ key: string; label: string; isCustom: boolean }, string>
                    label="Type"
                    options={[
                      ...ticketTypes.map((t) => ({ key: t, label: ticketTypeLabel[t], isCustom: false })),
                      ...customTypes.map((ct) => ({ key: `custom_${ct.id}`, label: ct.name, isCustom: true })),
                    ]}
                    value={[
                      ...((filters.ticketType ?? []) as string[]),
                      ...((filters.customTicketTypeId ?? []).map((id) => `custom_${id}`)),
                    ]}
                    keyOf={(o) => o.key}
                    renderLabel={(o) => o.label}
                    onChange={(keys) => {
                      const builtIns = keys.filter((k) => !k.startsWith("custom_"));
                      const customs  = keys.filter((k) => k.startsWith("custom_")).map((k) => Number(k.replace("custom_", "")));
                      setFilter("ticketType", builtIns.length ? (builtIns as SavedViewFilters["ticketType"]) : undefined);
                      setFilter("customTicketTypeId", customs.length ? customs : undefined);
                    }}
                  />
                </div>

                {/* Priority */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">Priority</Label>
                  <MultiSelectFilter
                    label="Priority"
                    options={ticketPriorities}
                    value={filters.priority ?? []}
                    onChange={(v) => setFilter("priority", v.length ? v : undefined)}
                    renderLabel={(p) => priorityLabel[p] ?? p}
                  />
                </div>

                {/* Severity */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">Severity</Label>
                  <MultiSelectFilter
                    label="Severity"
                    options={ticketSeverities}
                    value={filters.severity ?? []}
                    onChange={(v) => setFilter("severity", v.length ? v : undefined)}
                    renderLabel={(s) => severityShortLabel[s] ?? s}
                  />
                </div>

                {/* Impact */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">Impact</Label>
                  <MultiSelectFilter
                    label="Impact"
                    options={ticketImpacts}
                    value={filters.impact ?? []}
                    onChange={(v) => setFilter("impact", v.length ? v : undefined)}
                    renderLabel={(i) => impactLabel[i] ?? i}
                  />
                </div>

                {/* Urgency */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">Urgency</Label>
                  <MultiSelectFilter
                    label="Urgency"
                    options={ticketUrgencies}
                    value={filters.urgency ?? []}
                    onChange={(v) => setFilter("urgency", v.length ? v : undefined)}
                    renderLabel={(u) => urgencyLabel[u] ?? u}
                  />
                </div>

                {/* Category */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">Category</Label>
                  <MultiSelectFilter
                    label="Category"
                    options={ticketCategories}
                    value={filters.category ?? []}
                    onChange={(v) => setFilter("category", v.length ? v : undefined)}
                    renderLabel={(c) => categoryLabel[c] ?? c}
                  />
                </div>

                {/* Source / Channel */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">Source / Channel</Label>
                  <MultiSelectFilter
                    label="Source"
                    options={Object.keys(SOURCE_LABELS) as ("email" | "portal" | "agent")[]}
                    value={filters.source ?? []}
                    onChange={(v) => setFilter("source", v.length ? v : undefined)}
                    renderLabel={(s) => SOURCE_LABELS[s] ?? s}
                  />
                </div>

                {/* Team — multi-select including a "No team" sentinel */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">Team</Label>
                  <MultiSelectFilter<{ id: number | "none"; name: string; color: string }, string>
                    label="Team"
                    options={[
                      { id: "none" as const, name: "No team assigned", color: "#94a3b8" },
                      ...teams.map((t) => ({ id: t.id, name: t.name, color: t.color || "#64748b" })),
                    ]}
                    value={(filters.teamId ?? []).map((v) => String(v))}
                    keyOf={(o) => String(o.id)}
                    renderLabel={(o) => o.name}
                    renderPrefix={(o) => (
                      <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: o.color }} />
                    )}
                    onChange={(keys) => {
                      const next: (number | "none")[] = keys.map((k) => (k === "none" ? "none" : Number(k)));
                      setFilter("teamId", next.length ? next : undefined);
                    }}
                  />
                </div>

                {/* Assignee — multi-select agent picker */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">Assignee</Label>
                  <MultiSelectFilter<Agent, string>
                    label="Assignee"
                    options={agents}
                    value={filters.assignedToId ?? []}
                    keyOf={(a) => a.id}
                    renderLabel={(a) => a.name}
                    searchable
                    searchPlaceholder="Search agents…"
                    emptyText="No agents match"
                    onChange={(ids) => {
                      setFilter("assignedToId", ids.length ? ids : undefined);
                      if (ids.length) {
                        setFilter("unassigned", undefined);
                        setFilter("assignedToMe", undefined);
                      }
                    }}
                  />
                  {(filters.unassigned || filters.assignedToMe) && (filters.assignedToId ?? []).length === 0 && (
                    <p className="text-[11px] text-muted-foreground">Hidden by the toggle above — clear it to pick specific agents.</p>
                  )}
                </div>
              </div>
            </div>

            {summaryParts.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-4">
                No filters set — this view will show all tickets matching your access. Add filters above to narrow results.
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
