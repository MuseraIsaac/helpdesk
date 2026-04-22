/**
 * Trash — Recycle Bin
 *
 * Unified view of all soft-deleted ITSM records. Admins can:
 *   • Browse, filter, and search deleted items
 *   • Restore individual items or a selection
 *   • Permanently delete individual items, a selection, or empty the entire trash
 *
 * Items are automatically purged after the configured retention period (trash settings).
 */

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import {
  Trash2, RotateCcw, AlertTriangle, Loader2,
  Ticket, Server, BookOpen, AlertCircle, ArrowUpDown,
  Inbox, CheckCircle2, Search, Filter, Clock, Shield,
  ChevronDown, RefreshCw, PackageOpen, CalendarClock,
  XCircle, Info, Settings,
} from "lucide-react";
import { Link } from "react-router";
import { Button }     from "@/components/ui/button";
import { Badge }      from "@/components/ui/badge";
import { Input }      from "@/components/ui/input";
import { Skeleton }   from "@/components/ui/skeleton";
import { Checkbox }   from "@/components/ui/checkbox";
import { Separator }  from "@/components/ui/separator";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { Card, CardContent } from "@/components/ui/card";
import ErrorAlert from "@/components/ErrorAlert";

// ── Types ─────────────────────────────────────────────────────────────────────

type EntityType = "ticket" | "incident" | "request" | "problem" | "change" | "asset" | "kb_article";

interface TrashItem {
  type:          EntityType;
  id:            number;
  entityNumber:  string;
  title:         string;
  meta:          string;
  assignedTo:    string | null;
  deletedAt:     string;
  deletedByName: string | null;
  daysLeft:      number;
}

interface TrashSummary {
  counts: {
    tickets:    number;
    incidents:  number;
    requests:   number;
    problems:   number;
    changes:    number;
    assets:     number;
    kbArticles: number;
  };
  total:          number;
  retentionDays:  number;
  enabled:        boolean;
}

// ── Entity metadata ───────────────────────────────────────────────────────────

const ENTITY_META: Record<EntityType, { label: string; plural: string; icon: React.ElementType; color: string; bg: string }> = {
  ticket:     { label: "Ticket",          plural: "Tickets",          icon: Ticket,       color: "text-blue-600 dark:text-blue-400",   bg: "bg-blue-100 dark:bg-blue-900/30"   },
  incident:   { label: "Incident",        plural: "Incidents",        icon: AlertTriangle,color: "text-red-600 dark:text-red-400",     bg: "bg-red-100 dark:bg-red-900/30"     },
  request:    { label: "Service Request", plural: "Service Requests", icon: Inbox,        color: "text-violet-600 dark:text-violet-400",bg: "bg-violet-100 dark:bg-violet-900/30"},
  problem:    { label: "Problem",         plural: "Problems",         icon: AlertCircle,  color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-100 dark:bg-amber-900/30" },
  change:     { label: "Change",          plural: "Changes",          icon: ArrowUpDown,  color: "text-emerald-600 dark:text-emerald-400",bg:"bg-emerald-100 dark:bg-emerald-900/30"},
  asset:      { label: "Asset",           plural: "Assets",           icon: Server,       color: "text-sky-600 dark:text-sky-400",     bg: "bg-sky-100 dark:bg-sky-900/30"     },
  kb_article: { label: "KB Article",      plural: "KB Articles",      icon: BookOpen,     color: "text-pink-600 dark:text-pink-400",   bg: "bg-pink-100 dark:bg-pink-900/30"   },
};

// ── API ───────────────────────────────────────────────────────────────────────

const api = {
  getSummary: () =>
    axios.get<TrashSummary>("/api/trash/summary").then((r) => r.data),
  getItems: (type?: EntityType, offset = 0) =>
    axios.get<{ items: TrashItem[]; retentionDays: number; total: number }>(
      "/api/trash",
      { params: { ...(type ? { type } : {}), offset, limit: 100 } },
    ).then((r) => r.data),
  restore: (items: { type: EntityType; id: number }[]) =>
    axios.post<{ restored: number }>("/api/trash/restore", { items }).then((r) => r.data),
  permanentDelete: (items: { type: EntityType; id: number }[]) =>
    axios.delete<{ deleted: number }>("/api/trash", { data: { items } }).then((r) => r.data),
  emptyTrash: () =>
    axios.delete<{ deleted: number }>("/api/trash", { data: { emptyAll: true } }).then((r) => r.data),
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function fmtRelative(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return `${days}d ago`;
}

// ── Days-left pill ────────────────────────────────────────────────────────────

function DaysLeftPill({ days }: { days: number }) {
  if (days <= 0) return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-destructive/10 text-destructive">
      <XCircle className="h-2.5 w-2.5" />Expiring
    </span>
  );
  if (days <= 3) return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
      <Clock className="h-2.5 w-2.5" />{days}d left
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
      <CalendarClock className="h-2.5 w-2.5" />{days}d left
    </span>
  );
}

// ── Empty Trash confirmation dialog ──────────────────────────────────────────

function EmptyTrashDialog({
  open, total, onClose, onConfirm, isPending,
}: {
  open:      boolean;
  total:     number;
  onClose:   () => void;
  onConfirm: () => void;
  isPending: boolean;
}) {
  const [confirmText, setConfirmText] = useState("");
  const ready = confirmText.trim() === "EMPTY TRASH";
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <Trash2 className="h-4 w-4" />Empty Trash
          </DialogTitle>
          <DialogDescription>
            This will permanently delete all <strong>{total.toLocaleString()} items</strong> in the trash. This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive/80 space-y-1">
            <p className="font-semibold text-destructive">Permanent deletion</p>
            <p>All {total.toLocaleString()} records will be removed from the database with no recovery path. Consider restoring items you may need first.</p>
          </div>
          <div className="space-y-1.5">
            <p className="text-sm">Type <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono font-bold">EMPTY TRASH</code> to confirm</p>
            <Input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="EMPTY TRASH"
              className={ready ? "border-destructive/40" : ""}
              autoComplete="off"
              spellCheck={false}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>Cancel</Button>
          <Button variant="destructive" disabled={!ready || isPending} onClick={() => { onClose(); onConfirm(); }}>
            {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Trash2 className="h-3.5 w-3.5 mr-1.5" />}
            Empty trash
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Trash item row ────────────────────────────────────────────────────────────

function TrashItemRow({
  item,
  selected,
  onSelect,
  onRestore,
  onDelete,
}: {
  item:      TrashItem;
  selected:  boolean;
  onSelect:  (checked: boolean) => void;
  onRestore: () => void;
  onDelete:  () => void;
}) {
  const meta = ENTITY_META[item.type];
  const Icon = meta.icon;

  return (
    <div className={[
      "flex items-center gap-3 px-4 py-3 group border-b last:border-b-0 transition-colors",
      selected ? "bg-primary/5" : "hover:bg-muted/30",
    ].join(" ")}>
      <Checkbox
        checked={selected}
        onCheckedChange={onSelect}
        className="shrink-0"
      />

      {/* Type icon */}
      <div className={`h-7 w-7 rounded-lg flex items-center justify-center shrink-0 ${meta.bg}`}>
        <Icon className={`h-3.5 w-3.5 ${meta.color}`} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-mono text-muted-foreground shrink-0">{item.entityNumber}</span>
          <p className="text-sm font-medium truncate">{item.title}</p>
          <span className={`hidden sm:inline text-[10px] px-1.5 py-0.5 rounded-md font-medium ${meta.bg} ${meta.color}`}>
            {meta.label}
          </span>
        </div>
        <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground flex-wrap">
          <span className="capitalize">{item.meta}</span>
          {item.assignedTo && <span>· {item.assignedTo}</span>}
          <span>·</span>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="flex items-center gap-1 cursor-default">
                  <Clock className="h-3 w-3" />
                  Deleted {fmtRelative(item.deletedAt)}
                  {item.deletedByName && ` by ${item.deletedByName}`}
                </span>
              </TooltipTrigger>
              <TooltipContent className="text-xs">{fmtDate(item.deletedAt)}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {/* Days left + actions */}
      <div className="flex items-center gap-2 shrink-0">
        <DaysLeftPill days={item.daysLeft} />
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 px-2 text-muted-foreground hover:text-foreground" onClick={onRestore}>
                  <RotateCcw className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent className="text-xs">Restore</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 px-2 text-muted-foreground hover:text-destructive" onClick={onDelete}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent className="text-xs">Delete permanently</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function TrashPage() {
  const qc = useQueryClient();
  const [typeFilter,    setTypeFilter]    = useState<EntityType | undefined>();
  const [search,        setSearch]        = useState("");
  const [selected,      setSelected]      = useState<Set<string>>(new Set());
  const [emptyOpen,     setEmptyOpen]     = useState(false);

  // Data
  const { data: summary, isLoading: summaryLoading, error: summaryError } = useQuery({
    queryKey: ["trash-summary"],
    queryFn:  api.getSummary,
    refetchInterval: 30_000,
  });

  const { data: itemsData, isLoading: itemsLoading, refetch } = useQuery({
    queryKey: ["trash-items", typeFilter],
    queryFn:  () => api.getItems(typeFilter),
    staleTime: 30_000,
  });

  const items = itemsData?.items ?? [];

  // Filtered by search
  const filtered = useMemo(() => {
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter((i) =>
      i.title.toLowerCase().includes(q) ||
      i.entityNumber.toLowerCase().includes(q) ||
      i.meta.toLowerCase().includes(q) ||
      (i.assignedTo?.toLowerCase().includes(q) ?? false),
    );
  }, [items, search]);

  // Mutations
  const restoreMutation = useMutation({
    mutationFn: (items: { type: EntityType; id: number }[]) => api.restore(items),
    onSuccess: () => {
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["trash-summary"] });
      qc.invalidateQueries({ queryKey: ["trash-items"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (items: { type: EntityType; id: number }[]) => api.permanentDelete(items),
    onSuccess: () => {
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["trash-summary"] });
      qc.invalidateQueries({ queryKey: ["trash-items"] });
    },
  });

  const emptyMutation = useMutation({
    mutationFn: api.emptyTrash,
    onSuccess: () => {
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["trash-summary"] });
      qc.invalidateQueries({ queryKey: ["trash-items"] });
    },
  });

  const isPending = restoreMutation.isPending || deleteMutation.isPending || emptyMutation.isPending;

  // Selection helpers
  function itemKey(item: TrashItem) { return `${item.type}:${item.id}`; }
  function toggleItem(item: TrashItem, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      checked ? next.add(itemKey(item)) : next.delete(itemKey(item));
      return next;
    });
  }
  function toggleAll(checked: boolean) {
    setSelected(checked ? new Set(filtered.map(itemKey)) : new Set());
  }
  const allSelected  = filtered.length > 0 && selected.size === filtered.length;
  const someSelected = selected.size > 0;

  function selectedItems(): { type: EntityType; id: number }[] {
    return [...selected].map((k) => {
      const [type, id] = k.split(":");
      return { type: type as EntityType, id: Number(id) };
    });
  }

  const total = summary?.total ?? 0;

  return (
    <div className="space-y-6 max-w-5xl">

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 mb-1.5">
            <div className="h-8 w-8 rounded-lg bg-destructive/10 flex items-center justify-center">
              <Trash2 className="h-4 w-4 text-destructive" />
            </div>
            <h1 className="text-xl font-bold tracking-tight">Trash</h1>
            {total > 0 && (
              <span className="text-xs font-semibold tabular-nums text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                {total.toLocaleString()}
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground max-w-xl leading-relaxed">
            Deleted records are kept here for{" "}
            <strong>{summary?.retentionDays ?? 30} days</strong> before automatic purge.
            You can restore any item or permanently delete it now.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="ghost" size="icon" onClick={() => refetch()} title="Refresh">
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link to="/settings/trash">
              <Settings className="h-3.5 w-3.5 mr-1.5" />
              Settings
            </Link>
          </Button>
        </div>
      </div>

      {(summaryError) && <ErrorAlert error={summaryError as Error} fallback="Failed to load trash" />}

      {/* ── Stats row ── */}
      {summaryLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
        </div>
      ) : summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Tickets",     count: summary.counts.tickets,    type: "ticket"     as EntityType },
            { label: "Incidents",   count: summary.counts.incidents,  type: "incident"   as EntityType },
            { label: "Requests",    count: summary.counts.requests,   type: "request"    as EntityType },
            { label: "Problems",    count: summary.counts.problems,   type: "problem"    as EntityType },
            { label: "Changes",     count: summary.counts.changes,    type: "change"     as EntityType },
            { label: "Assets",      count: summary.counts.assets,     type: "asset"      as EntityType },
            { label: "KB Articles", count: summary.counts.kbArticles, type: "kb_article" as EntityType },
            { label: "Total",       count: summary.total,             type: undefined                  },
          ].filter((s) => s.count > 0 || s.type === undefined).slice(0, 4).map(({ label, count, type }) => {
            const meta   = type ? ENTITY_META[type] : null;
            const Icon   = meta?.icon ?? PackageOpen;
            const active = typeFilter === type;
            return (
              <Card
                key={label}
                className={[
                  "border cursor-pointer transition-all hover:shadow-sm",
                  active ? "border-primary ring-1 ring-primary bg-primary/5" : "bg-card hover:border-primary/30",
                ].join(" ")}
                onClick={() => setTypeFilter(active ? undefined : type)}
              >
                <CardContent className="p-3 flex items-center gap-3">
                  <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${meta?.bg ?? "bg-muted"}`}>
                    <Icon className={`h-4 w-4 ${meta?.color ?? "text-muted-foreground"}`} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-lg font-bold tabular-nums">{count.toLocaleString()}</p>
                    <p className="text-[10px] font-medium text-muted-foreground truncate">{label}</p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* ── Retention notice ── */}
      {summary && summary.retentionDays <= 7 && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-700/40 bg-amber-50 dark:bg-amber-950/20 px-4 py-3 flex gap-3 items-start text-xs text-amber-800 dark:text-amber-300">
          <Info className="h-4 w-4 shrink-0 mt-0.5 text-amber-600" />
          <p>Retention is set to <strong>{summary.retentionDays} days</strong> — items deleted more than {summary.retentionDays} day{summary.retentionDays !== 1 ? "s" : ""} ago will be purged automatically. <Link to="/settings/trash" className="underline underline-offset-2">Adjust in Settings</Link>.</p>
        </div>
      )}

      <Separator />

      {/* ── Toolbar ── */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-48 max-w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search trash…"
            className="pl-8 h-8 text-sm"
          />
        </div>

        {/* Type filter dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 gap-1.5">
              <Filter className="h-3.5 w-3.5" />
              {typeFilter ? ENTITY_META[typeFilter].label : "All types"}
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-44">
            <DropdownMenuItem onClick={() => setTypeFilter(undefined)}>
              <PackageOpen className="h-3.5 w-3.5 mr-2 text-muted-foreground" />All types
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {(Object.keys(ENTITY_META) as EntityType[]).map((t) => {
              const m = ENTITY_META[t];
              const Icon = m.icon;
              return (
                <DropdownMenuItem key={t} onClick={() => setTypeFilter(t)}>
                  <Icon className={`h-3.5 w-3.5 mr-2 ${m.color}`} />
                  {m.plural}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="flex-1" />

        {/* Bulk actions — only shown when items are selected */}
        {someSelected && (
          <div className="flex items-center gap-2 animate-in fade-in slide-in-from-top-1">
            <span className="text-xs text-muted-foreground tabular-nums">{selected.size} selected</span>
            <Button
              variant="outline" size="sm" className="h-8 gap-1.5"
              onClick={() => restoreMutation.mutate(selectedItems())}
              disabled={isPending}
            >
              <RotateCcw className="h-3.5 w-3.5" />Restore
            </Button>
            <Button
              variant="outline" size="sm"
              className="h-8 gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
              onClick={() => deleteMutation.mutate(selectedItems())}
              disabled={isPending}
            >
              <Trash2 className="h-3.5 w-3.5" />Delete permanently
            </Button>
          </div>
        )}

        {/* Empty trash */}
        {total > 0 && !someSelected && (
          <Button
            variant="outline" size="sm"
            className="h-8 text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
            onClick={() => setEmptyOpen(true)}
            disabled={isPending}
          >
            <Trash2 className="h-3.5 w-3.5 mr-1.5" />Empty trash
          </Button>
        )}
      </div>

      {/* ── Item list ── */}
      {itemsLoading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-muted/10 py-20 flex flex-col items-center gap-4 text-center">
          <div className="h-16 w-16 rounded-2xl bg-muted/60 flex items-center justify-center">
            {search || typeFilter
              ? <Search className="h-8 w-8 text-muted-foreground/40" />
              : <CheckCircle2 className="h-8 w-8 text-muted-foreground/40" />}
          </div>
          <div className="space-y-1 max-w-64">
            <p className="text-sm font-semibold">
              {search || typeFilter ? "No matching items" : "Trash is empty"}
            </p>
            <p className="text-xs text-muted-foreground/70 leading-relaxed">
              {search || typeFilter
                ? "Try a different search term or clear the filter."
                : "Deleted records will appear here and be kept for the configured retention period before auto-purge."}
            </p>
          </div>
          {(search || typeFilter) && (
            <Button size="sm" variant="ghost" onClick={() => { setSearch(""); setTypeFilter(undefined); }}>
              Clear filters
            </Button>
          )}
        </div>
      ) : (
        <div className="rounded-xl border overflow-hidden">
          {/* List header with select-all */}
          <div className="flex items-center gap-3 px-4 py-2 bg-muted/40 border-b">
            <Checkbox
              checked={allSelected}
              onCheckedChange={toggleAll}
              className="shrink-0"
            />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex-1">
              {filtered.length.toLocaleString()} item{filtered.length !== 1 ? "s" : ""}
              {search && " matching search"}
            </span>
            <span className="text-[10px] text-muted-foreground hidden sm:block">Expiry</span>
            <span className="text-[10px] text-muted-foreground hidden sm:block w-16 text-right">Actions</span>
          </div>

          {/* Items */}
          {filtered.map((item) => (
            <TrashItemRow
              key={itemKey(item)}
              item={item}
              selected={selected.has(itemKey(item))}
              onSelect={(checked) => toggleItem(item, checked as boolean)}
              onRestore={() => restoreMutation.mutate([{ type: item.type, id: item.id }])}
              onDelete={() => deleteMutation.mutate([{ type: item.type, id: item.id }])}
            />
          ))}
        </div>
      )}

      {/* ── Safety notice ── */}
      {total > 0 && (
        <div className="flex items-start gap-3 rounded-xl border bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
          <Shield className="h-4 w-4 shrink-0 mt-0.5 text-muted-foreground/60" />
          <p>
            Items in trash are hidden from all standard views and are not accessible by agents or customers.
            They are automatically purged after <strong>{summary?.retentionDays ?? 30} days</strong>.
            Restoring an item makes it immediately visible in its original module.
          </p>
        </div>
      )}

      {/* ── Dialogs ── */}
      <EmptyTrashDialog
        open={emptyOpen}
        total={total}
        onClose={() => setEmptyOpen(false)}
        onConfirm={() => emptyMutation.mutate()}
        isPending={emptyMutation.isPending}
      />
    </div>
  );
}
