/**
 * DemoDataPage — Super-Admin demo data management.
 *
 * Deletion safety model
 * ──────────────────────
 * 1. Every delete action calls GET /batches/:id/preview first, which queries the
 *    live DB for surviving record counts. The confirmation dialog shows ONLY these
 *    live counts — never a stale cached figure.
 * 2. Confirmation requires the admin to type "DELETE" (single) or "DELETE ALL"
 *    (bulk). The "DELETE ALL" confirm token is also enforced server-side.
 * 3. Deletion is async — the UI polls every 2 s until the batch reaches
 *    "deleted" or "error" state, then updates the batch list.
 * 4. The batch record is never removed from the DB — it moves to "deleted" status
 *    and retains deletedAt + deletedByName for the audit trail.
 */

import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router";
import axios from "axios";
import {
  Database, Sparkles, Trash2, Download, RefreshCw,
  CheckCircle2, AlertTriangle, Loader2, Clock,
  ChevronDown, ChevronRight, ShieldAlert, Lock, Settings,
  Users, Ticket, Server, BookOpen, Wrench,
  ShoppingBag, Inbox, AlertCircle, ArrowUpDown, Circle,
  BarChart2, Skull, Info,
} from "lucide-react";
import { Button }    from "@/components/ui/button";
import { Badge }     from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Checkbox }  from "@/components/ui/checkbox";
import { Label }     from "@/components/ui/label";
import { Input }     from "@/components/ui/input";
import { Skeleton }  from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import ErrorAlert from "@/components/ErrorAlert";

// ── Types ─────────────────────────────────────────────────────────────────────

type ModuleKey =
  | "foundation" | "knowledge" | "macros" | "catalog"
  | "tickets"    | "incidents" | "requests" | "problems"
  | "changes"    | "assets"   | "cmdb";

type GeneratorSize = "small" | "medium" | "large";
type ModuleStatus  = "pending" | "running" | "done" | "error" | "skipped";
type BatchStatus   = "generating" | "ready" | "error" | "deleting" | "deleted";

interface ModuleMeta {
  key:         ModuleKey;
  label:       string;
  description: string;
  icon:        string;
  dependsOn:   ModuleKey[];
}

interface ModuleProgress {
  status:       ModuleStatus;
  count:        number;
  startedAt?:   string;
  completedAt?: string;
  error?:       string;
}

interface DemoBatch {
  id:              number;
  label:           string;
  status:          BatchStatus;
  generatedById:   string;
  generatedByName: string;
  deletedById?:    string | null;
  deletedByName?:  string;
  size:            GeneratorSize;
  modules:         ModuleKey[];
  progress:        Partial<Record<ModuleKey, ModuleProgress>>;
  errorMessage:    string | null;
  completedAt:     string | null;
  deletedAt:       string | null;
  recordCounts:    Record<string, number>;
  createdAt:       string;
}

interface LiveEntityCounts {
  users:           number;
  teams:           number;
  organisations:   number;
  customers:       number;
  kbArticles:      number;
  kbCategories:    number;
  macros:          number;
  cabGroups:       number;
  catalogItems:    number;
  tickets:         number;
  incidents:       number;
  serviceRequests: number;
  problems:        number;
  changes:         number;
  assets:          number;
  configItems:     number;
  notes:           number;
  replies:         number;
  csatRatings:     number;
  incidentUpdates: number;
  approvals:       number;
}

interface BatchPreview {
  batchId:     number;
  batchLabel:  string;
  liveCounts:  LiveEntityCounts;
  totalLive:   number;
  hasStaleIds: boolean;
}

// ── Entity display metadata ───────────────────────────────────────────────────

const ENTITY_GROUPS: {
  label: string;
  icon: React.ElementType;
  entries: { key: keyof LiveEntityCounts; label: string }[];
}[] = [
  {
    label: "People & Teams", icon: Users,
    entries: [
      { key: "users",         label: "Agent / Supervisor accounts" },
      { key: "teams",         label: "Support teams" },
      { key: "organisations", label: "Organisations" },
      { key: "customers",     label: "Customers" },
    ],
  },
  {
    label: "ITSM Records", icon: Ticket,
    entries: [
      { key: "tickets",         label: "Support tickets" },
      { key: "incidents",       label: "Incidents" },
      { key: "serviceRequests", label: "Service requests" },
      { key: "problems",        label: "Problem records" },
      { key: "changes",         label: "Change requests" },
    ],
  },
  {
    label: "Assets & CMDB", icon: Server,
    entries: [
      { key: "assets",      label: "IT assets" },
      { key: "configItems", label: "Config items (CMDB)" },
    ],
  },
  {
    label: "Knowledge & Content", icon: BookOpen,
    entries: [
      { key: "kbArticles",   label: "KB articles" },
      { key: "kbCategories", label: "KB categories" },
      { key: "macros",       label: "Response macros" },
      { key: "catalogItems", label: "Catalog items" },
      { key: "cabGroups",    label: "CAB groups" },
    ],
  },
  {
    label: "Activity Records", icon: BarChart2,
    entries: [
      { key: "notes",           label: "Ticket notes" },
      { key: "replies",         label: "Ticket replies" },
      { key: "csatRatings",     label: "CSAT ratings" },
      { key: "incidentUpdates", label: "Incident timeline updates" },
      { key: "approvals",       label: "Approval requests" },
    ],
  },
];

// ── Size preview ──────────────────────────────────────────────────────────────

const SIZE_PREVIEW: Record<GeneratorSize, { label: string; badge: string; hint: string }> = {
  small:  { label: "Small",  badge: "~80 records",  hint: "6 users · 8 tickets · 6 incidents · 8 assets"    },
  medium: { label: "Medium", badge: "~170 records", hint: "10 users · 15 tickets · 10 incidents · 15 assets" },
  large:  { label: "Large",  badge: "~340 records", hint: "15 users · 30 tickets · 20 incidents · 28 assets" },
};

// ── Icon map ──────────────────────────────────────────────────────────────────

const ICON_MAP: Record<string, React.ElementType> = {
  Users, Ticket, Server, BookOpen, BarChart2, Wrench,
  ShoppingBag, Inbox, AlertCircle, AlertTriangle, ArrowUpDown, Database,
};
function ModuleIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ICON_MAP[name] ?? Database;
  return <Icon className={className} />;
}

// ── API layer ─────────────────────────────────────────────────────────────────

const api = {
  getSettings: () =>
    axios.get<{ data: { enableDemoDataTools: boolean } }>("/api/settings/demo_data").then((r) => r.data.data),
  getModules: () =>
    axios.get<{ modules: ModuleMeta[] }>("/api/demo-data/modules").then((r) => r.data.modules),
  getBatches: () =>
    axios.get<{ batches: DemoBatch[] }>("/api/demo-data/batches").then((r) => r.data.batches),
  previewBatch: (id: number) =>
    axios.get<{ preview: BatchPreview }>(`/api/demo-data/batches/${id}/preview`).then((r) => r.data.preview),
  generate: (p: { label: string; size: GeneratorSize; modules: ModuleKey[] }) =>
    axios.post<{ batch: DemoBatch }>("/api/demo-data/generate", p).then((r) => r.data.batch),
  deleteBatch: (id: number, force = false) =>
    axios.delete(`/api/demo-data/batches/${id}`, { data: { force } }),
  deleteAll: () =>
    axios.delete("/api/demo-data/batches", { data: { confirmToken: "DELETE ALL" } }),
  downloadTemplate: async () => {
    const r   = await axios.get("/api/demo-data/template", { responseType: "blob" });
    const url = URL.createObjectURL(r.data);
    const a   = document.createElement("a");
    a.href = url;
    a.download = `itsm-demo-template-${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
function totalRecordCounts(counts: Record<string, number>): number {
  return Object.values(counts).reduce((s, v) => s + v, 0);
}
function totalLiveCounts(counts: Partial<LiveEntityCounts>): number {
  return Object.values(counts).reduce((s, v) => s + (v ?? 0), 0);
}

// ── Status pill ───────────────────────────────────────────────────────────────

function BatchStatusPill({ status }: { status: BatchStatus }) {
  const MAP: Record<BatchStatus, { cls: string; label: string }> = {
    generating: { cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",             label: "Generating…" },
    ready:      { cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400", label: "Ready"       },
    error:      { cls: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",                label: "Error"       },
    deleting:   { cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",         label: "Deleting…"   },
    deleted:    { cls: "bg-muted text-muted-foreground",                                              label: "Deleted"     },
  };
  const { cls, label } = MAP[status];
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${cls}`}>
      {(status === "generating" || status === "deleting") && <Loader2 className="h-3 w-3 animate-spin" />}
      {status === "ready"   && <CheckCircle2 className="h-3 w-3" />}
      {status === "error"   && <AlertTriangle className="h-3 w-3" />}
      {status === "deleted" && <Clock className="h-3 w-3" />}
      {label}
    </span>
  );
}

// ── Live count table (used inside delete dialogs) ─────────────────────────────

function LiveCountTable({ counts }: { counts: Partial<LiveEntityCounts> }) {
  return (
    <div className="divide-y divide-border/40 rounded-lg border overflow-hidden text-xs">
      {ENTITY_GROUPS.map((group) => {
        const rows = group.entries.filter(({ key }) => (counts[key] ?? 0) > 0);
        if (!rows.length) return null;
        const Icon = group.icon;
        return (
          <div key={group.label}>
            <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/40">
              <Icon className="h-3 w-3 text-muted-foreground" />
              <span className="font-semibold text-[10px] uppercase tracking-wider text-muted-foreground">{group.label}</span>
            </div>
            {rows.map(({ key, label }) => (
              <div key={key} className="flex items-center justify-between px-4 py-1.5 even:bg-muted/10">
                <span className="text-muted-foreground">{label}</span>
                <span className="font-semibold tabular-nums text-foreground">{counts[key]?.toLocaleString()}</span>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

// ── Delete Single Batch dialog ────────────────────────────────────────────────

function DeleteBatchDialog({
  batchId,
  onClose,
  onConfirmed,
}: {
  batchId:     number | null;
  onClose:     () => void;
  onConfirmed: (id: number, force: boolean) => void;
}) {
  const [confirmText, setConfirmText] = useState("");
  const { data: preview, isLoading, isError } = useQuery({
    queryKey:  ["demo-preview", batchId],
    queryFn:   () => api.previewBatch(batchId!),
    enabled:   batchId !== null,
    staleTime: 0,
    gcTime:    0,
  });

  const open  = batchId !== null;
  const ready = confirmText.trim() === "DELETE";
  const isErrorBatch = preview === undefined && !isLoading;

  function handleClose() {
    setConfirmText("");
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <Skull className="h-4 w-4" />
            Delete Demo Data Batch
          </DialogTitle>
          <DialogDescription>
            {preview
              ? <>This will permanently delete <strong>{preview.totalLive.toLocaleString()} records</strong> from "<strong>{preview.batchLabel}</strong>". This action cannot be undone.</>
              : "Loading live record counts from the database…"}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 py-2 min-h-0">
          {isLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" />
              Counting live records…
            </div>
          )}
          {isError && (
            <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
              Failed to load live counts. You can still proceed with deletion — the system will remove all tracked IDs.
            </div>
          )}

          {preview && (
            <>
              {preview.hasStaleIds && (
                <div className="flex gap-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40 p-3">
                  <Info className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    Some records from this batch no longer exist (they may have been cascade-deleted by another action). The live counts below reflect what will actually be removed.
                  </p>
                </div>
              )}

              <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 space-y-1">
                <p className="text-xs font-semibold text-destructive">What will be permanently deleted:</p>
                <p className="text-xs text-destructive/80">
                  The following records were created exclusively by this batch and are tracked by their database IDs. No real production data can be affected.
                </p>
              </div>

              <LiveCountTable counts={preview.liveCounts} />
            </>
          )}

          {/* Typed confirmation */}
          <div className="space-y-2 pt-2">
            <Label htmlFor="del-confirm" className="text-sm">
              Type <code className="bg-muted px-1.5 py-0.5 rounded text-[11px] font-mono font-bold">DELETE</code> to confirm
            </Label>
            <Input
              id="del-confirm"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="DELETE"
              className={ready ? "border-destructive/40 focus-visible:ring-destructive/30" : ""}
              autoComplete="off"
              spellCheck={false}
            />
          </div>
        </div>

        <DialogFooter className="pt-2 border-t">
          <Button variant="outline" onClick={handleClose}>Cancel</Button>
          <Button
            variant="destructive"
            disabled={!ready || isLoading}
            onClick={() => {
              if (batchId !== null) {
                handleClose();
                onConfirmed(batchId, isErrorBatch);
              }
            }}
          >
            <Trash2 className="h-3.5 w-3.5 mr-1.5" />
            Delete {preview ? `${preview.totalLive.toLocaleString()} records` : "batch"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Delete All dialog ─────────────────────────────────────────────────────────

function DeleteAllDialog({
  open,
  batches,
  onClose,
  onConfirmed,
  isPending,
}: {
  open:        boolean;
  batches:     DemoBatch[];
  onClose:     () => void;
  onConfirmed: () => void;
  isPending:   boolean;
}) {
  const [confirmText, setConfirmText] = useState("");
  const targets  = batches.filter((b) => b.status === "ready" || b.status === "error");
  const totalRec = targets.reduce((s, b) => s + totalRecordCounts(b.recordCounts), 0);
  const ready    = confirmText.trim() === "DELETE ALL";

  function handleClose() {
    setConfirmText("");
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <Skull className="h-4 w-4" />
            Delete All Demo Data
          </DialogTitle>
          <DialogDescription>
            This will permanently delete <strong>{targets.length} batch{targets.length !== 1 ? "es" : ""}</strong>{" "}
            containing approximately <strong>{totalRec.toLocaleString()} records</strong>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 space-y-2">
            <p className="text-sm font-semibold text-destructive">⚠ Destructive bulk operation</p>
            <ul className="text-xs text-destructive/80 space-y-1 list-disc list-inside">
              <li>All {targets.length} deletable batch{targets.length !== 1 ? "es" : ""} will be removed simultaneously</li>
              <li>Every user, ticket, incident, asset, and config item in these batches will be permanently deleted</li>
              <li>This cannot be undone</li>
              <li>Only demo-tagged records are removed — real production data is never affected</li>
            </ul>
          </div>

          {targets.length > 0 && (
            <div className="rounded-lg border divide-y text-xs">
              {targets.map((b) => (
                <div key={b.id} className="flex items-center justify-between px-3 py-2">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{b.label}</p>
                    <p className="text-muted-foreground text-[11px]">Created {fmtDate(b.createdAt)}</p>
                  </div>
                  <span className="tabular-nums text-muted-foreground shrink-0 ml-3">{totalRecordCounts(b.recordCounts).toLocaleString()} records</span>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="del-all-confirm" className="text-sm">
              Type <code className="bg-muted px-1.5 py-0.5 rounded text-[11px] font-mono font-bold">DELETE ALL</code> to confirm
            </Label>
            <Input
              id="del-all-confirm"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="DELETE ALL"
              className={ready ? "border-destructive/40 focus-visible:ring-destructive/30" : ""}
              autoComplete="off"
              spellCheck={false}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isPending}>Cancel</Button>
          <Button
            variant="destructive"
            disabled={!ready || isPending || targets.length === 0}
            onClick={() => { handleClose(); onConfirmed(); }}
          >
            {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Trash2 className="h-3.5 w-3.5 mr-1.5" />}
            Delete all {targets.length} batch{targets.length !== 1 ? "es" : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Generate dialog ───────────────────────────────────────────────────────────

function GenerateDialog({
  open, onClose, onGenerate, isPending, modules,
}: {
  open:       boolean;
  onClose:    () => void;
  onGenerate: (label: string, size: GeneratorSize, mods: ModuleKey[]) => void;
  isPending:  boolean;
  modules:    ModuleMeta[];
}) {
  const [size,     setSize]     = useState<GeneratorSize>("medium");
  const [label,    setLabel]    = useState(`Demo Batch — ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`);
  const [selected, setSelected] = useState<Set<ModuleKey>>(new Set(modules.map((m) => m.key)));
  const allSelected = selected.size === modules.length;

  const toggle = (key: ModuleKey) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        const hasDependents = modules.some((m) => next.has(m.key) && m.dependsOn.includes(key));
        if (hasDependents) return prev;
        next.delete(key);
      } else {
        next.add(key);
        modules.find((m) => m.key === key)?.dependsOn.forEach((dep) => next.add(dep));
      }
      return next;
    });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Generate Demo Data
          </DialogTitle>
          <DialogDescription>
            Choose modules and a dataset size. Foundation is always required and enables all other modules.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="gen-label">Batch label</Label>
            <Input id="gen-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Q1 Sales Demo" />
          </div>

          <div className="space-y-2">
            <Label>Dataset size</Label>
            <div className="grid grid-cols-3 gap-2">
              {(["small","medium","large"] as GeneratorSize[]).map((s) => {
                const p = SIZE_PREVIEW[s];
                return (
                  <button key={s} type="button" onClick={() => setSize(s)} className={["rounded-xl border p-3 text-left transition-all", size === s ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:border-primary/40 hover:bg-muted/30"].join(" ")}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-semibold">{p.label}</span>
                      <span className="text-[10px] border rounded-full px-1.5 py-0.5 text-muted-foreground">{p.badge}</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">{p.hint}</p>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Modules</Label>
              <button type="button" onClick={() => setSelected(allSelected ? new Set(["foundation"] as ModuleKey[]) : new Set(modules.map((m) => m.key)))} className="text-xs text-primary hover:underline">
                {allSelected ? "Deselect all" : "Select all"}
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {modules.map((mod) => {
                const checked  = selected.has(mod.key);
                const required = mod.key === "foundation";
                return (
                  <label key={mod.key} className={["flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors", checked ? "border-primary/40 bg-primary/5" : "border-border hover:border-primary/20 hover:bg-muted/20", required ? "opacity-70 cursor-not-allowed" : ""].join(" ")}>
                    <Checkbox checked={checked} disabled={required} onCheckedChange={() => !required && toggle(mod.key)} className="mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <ModuleIcon name={mod.icon} className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-sm font-medium">{mod.label}</span>
                        {required && <Badge variant="secondary" className="text-[9px] px-1.5">required</Badge>}
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{mod.description}</p>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>Cancel</Button>
          <Button onClick={() => onGenerate(label, size, [...selected])} disabled={isPending || !label.trim() || selected.size === 0}>
            {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Sparkles className="h-3.5 w-3.5 mr-1.5" />}
            {isPending ? "Starting…" : `Generate (${SIZE_PREVIEW[size].badge})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Module progress row ───────────────────────────────────────────────────────

function ModuleProgressRow({ mod, progress }: { mod: ModuleMeta; progress?: ModuleProgress }) {
  const status = progress?.status ?? "pending";
  const cls: Record<ModuleStatus, string> = {
    pending: "text-muted-foreground/30",
    running: "text-blue-500",
    done:    "text-emerald-500",
    error:   "text-destructive",
    skipped: "text-muted-foreground/30",
  };
  return (
    <div className="flex items-center gap-3 py-1.5">
      <span className={`shrink-0 ${cls[status]}`}>
        {status === "running" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> :
         status === "done"    ? <CheckCircle2 className="h-3.5 w-3.5" /> :
         status === "error"   ? <AlertTriangle className="h-3.5 w-3.5" /> :
         <Circle className="h-3 w-3" />}
      </span>
      <ModuleIcon name={mod.icon} className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      <span className={`text-sm flex-1 ${status === "pending" ? "text-muted-foreground" : "text-foreground"}`}>{mod.label}</span>
      {status === "done"    && <span className="text-xs text-emerald-600 dark:text-emerald-400 tabular-nums">{progress!.count} records</span>}
      {status === "running" && <span className="text-xs text-blue-500 animate-pulse">Working…</span>}
      {status === "error"   && <span className="text-xs text-destructive truncate max-w-[180px]">{progress!.error}</span>}
    </div>
  );
}

// ── Generating panel ──────────────────────────────────────────────────────────

function GeneratingPanel({ batch, modules }: { batch: DemoBatch; modules: ModuleMeta[] }) {
  const requested = modules.filter((m) => (batch.modules ?? []).includes(m.key));
  const done  = requested.filter((m) => batch.progress[m.key]?.status === "done").length;
  const total = requested.length;
  const pct   = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className="rounded-xl border bg-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          <p className="text-sm font-semibold">Generating "{batch.label}"</p>
        </div>
        <span className="text-xs text-muted-foreground tabular-nums">{done}/{total} modules</span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div className="h-full rounded-full bg-primary transition-all duration-700" style={{ width: `${pct}%` }} />
      </div>
      <div className="divide-y divide-border/40">
        {requested.map((mod) => (
          <ModuleProgressRow key={mod.key} mod={mod} progress={batch.progress[mod.key]} />
        ))}
      </div>
    </div>
  );
}

// ── Batch summary card ────────────────────────────────────────────────────────

function BatchCard({ batch, onDelete }: { batch: DemoBatch; onDelete: (id: number) => void }) {
  const [open, setOpen] = useState(false);
  const total = totalRecordCounts(batch.recordCounts);

  return (
    <div className={["rounded-xl border bg-card p-4 space-y-3 transition-opacity", batch.status === "deleting" ? "opacity-60" : ""].join(" ")}>
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold truncate">{batch.label}</p>
            <BatchStatusPill status={batch.status} />
            {batch.size && (
              <span className="text-[10px] border rounded-full px-1.5 py-0.5 text-muted-foreground capitalize">{batch.size}</span>
            )}
          </div>

          {/* Generation audit */}
          <p className="text-xs text-muted-foreground mt-0.5">
            Generated {fmtDate(batch.createdAt)} by <span className="font-medium text-foreground/70">{batch.generatedByName || "Admin"}</span>
            {batch.completedAt && <> · completed {fmtDate(batch.completedAt)}</>}
          </p>

          {/* Deletion audit — shown on deleted batches */}
          {batch.status === "deleted" && batch.deletedAt && (
            <p className="text-xs text-muted-foreground mt-0.5">
              <Clock className="h-3 w-3 inline mr-1 opacity-60" />
              Deleted {fmtDate(batch.deletedAt)}
              {batch.deletedByName && <> by <span className="font-medium text-foreground/70">{batch.deletedByName}</span></>}
            </p>
          )}
        </div>

        {batch.status === "deleting" && (
          <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 shrink-0">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Deleting…
          </div>
        )}

        {(batch.status === "ready" || batch.status === "error") && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost" size="sm"
                  className="text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0"
                  onClick={() => onDelete(batch.id)}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                  {batch.status === "error" ? "Force Delete" : "Delete"}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left" className="max-w-56 text-xs">
                {batch.status === "error"
                  ? "This batch errored during generation. Deleting will remove whatever records were created before the failure."
                  : `Remove all ${total.toLocaleString()} records in this batch. A live count will be shown before confirmation.`}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>

      {batch.errorMessage && (
        <div className="text-xs bg-destructive/10 border border-destructive/20 text-destructive rounded-lg px-3 py-2 font-mono leading-relaxed">
          {batch.errorMessage}
        </div>
      )}

      {/* Record count summary */}
      {total > 0 && (
        <Collapsible open={open} onOpenChange={setOpen}>
          <CollapsibleTrigger className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors">
            {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            <span className="font-medium">{total.toLocaleString()} records generated</span>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
              {ENTITY_GROUPS.map((group) => {
                const rows = group.entries.map(({ key, label }) => ({
                  label,
                  count: batch.recordCounts[key + "s"] ?? batch.recordCounts[key] ?? 0,
                })).filter((r) => r.count > 0);
                if (!rows.length) return null;
                const Icon = group.icon;
                return (
                  <div key={group.label} className="rounded-lg border bg-muted/30 p-3">
                    <div className="flex items-center gap-1.5 mb-2">
                      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{group.label}</p>
                    </div>
                    {rows.map((r) => (
                      <div key={r.label} className="flex justify-between text-xs py-0.5">
                        <span className="text-muted-foreground">{r.label}</span>
                        <span className="font-semibold tabular-nums">{r.count}</span>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}

// ── Feature disabled ──────────────────────────────────────────────────────────

function FeatureDisabled() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center gap-5 max-w-sm mx-auto">
      <div className="h-14 w-14 rounded-2xl bg-muted flex items-center justify-center">
        <Lock className="h-7 w-7 text-muted-foreground" />
      </div>
      <div className="space-y-1.5">
        <h2 className="text-base font-semibold">Demo Data Tools are disabled</h2>
        <p className="text-sm text-muted-foreground">A Super Admin must enable Demo Data Tools in Settings before this page can be used.</p>
      </div>
      <Button asChild variant="outline" size="sm">
        <Link to="/settings/demo_data">
          <Settings className="h-3.5 w-3.5 mr-1.5" />Go to Settings → Demo Data
        </Link>
      </Button>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function DemoDataPage() {
  const qc = useQueryClient();
  const [generateOpen,   setGenerateOpen]   = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);
  const [deleteAllOpen,  setDeleteAllOpen]  = useState(false);
  const [templateLoading, setTemplateLoading] = useState(false);

  // Settings check
  const { data: settings, isLoading: settingsLoading } = useQuery({
    queryKey:  ["settings", "demo_data"],
    queryFn:   api.getSettings,
    staleTime: 60_000,
  });
  const isEnabled = settings?.enableDemoDataTools ?? false;

  // Module metadata — static, only fetched once
  const { data: modules = [] } = useQuery({
    queryKey:  ["demo-modules"],
    queryFn:   api.getModules,
    enabled:   isEnabled,
    staleTime: Infinity,
  });

  // Batch list — polls when any batch is active
  const {
    data: batches = [],
    isLoading: batchesLoading,
    error: batchesError,
    refetch,
  } = useQuery({
    queryKey: ["demo-batches"],
    queryFn:  api.getBatches,
    enabled:  isEnabled,
    refetchInterval: (q) => {
      const list = q.state.data ?? [];
      return list.some((b) => b.status === "generating" || b.status === "deleting") ? 2000 : false;
    },
  });

  // Generate mutation
  const generateMutation = useMutation({
    mutationFn: (p: { label: string; size: GeneratorSize; modules: ModuleKey[] }) => api.generate(p),
    onSuccess: () => { setGenerateOpen(false); qc.invalidateQueries({ queryKey: ["demo-batches"] }); },
  });

  // Delete single batch
  const deleteMutation = useMutation({
    mutationFn: ({ id, force }: { id: number; force: boolean }) => api.deleteBatch(id, force),
    onSuccess:  () => { setDeleteTargetId(null); qc.invalidateQueries({ queryKey: ["demo-batches"] }); },
  });

  // Delete all batches
  const deleteAllMutation = useMutation({
    mutationFn: api.deleteAll,
    onSuccess:  () => { setDeleteAllOpen(false); qc.invalidateQueries({ queryKey: ["demo-batches"] }); },
  });

  const handleDownload = useCallback(async () => {
    setTemplateLoading(true);
    try { await api.downloadTemplate(); } finally { setTemplateLoading(false); }
  }, []);

  // ── Render guards ──────────────────────────────────────────────────────────
  if (settingsLoading) {
    return (
      <div className="space-y-6 max-w-3xl">
        {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
      </div>
    );
  }
  if (!isEnabled) return <FeatureDisabled />;

  const generating  = batches.filter((b) => b.status === "generating");
  const active      = batches.filter((b) => b.status !== "deleted" && b.status !== "generating");
  const deleted     = batches.filter((b) => b.status === "deleted");
  const deletable   = active.filter((b) => b.status === "ready" || b.status === "error");
  const hasDeleting = active.some((b) => b.status === "deleting");

  return (
    <div className="space-y-8 max-w-3xl">

      {/* ── Header ── */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Database className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-bold tracking-tight">Demo Data</h1>
          <Badge variant="secondary" className="text-[10px] font-bold uppercase tracking-widest">Super Admin</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Generate, manage, and safely delete synthetic ITSM data. All records are tracked by their exact database IDs — deletion never touches real production data.
        </p>
      </div>

      {batchesError && <ErrorAlert error={batchesError as Error} fallback="Failed to load demo batches" />}

      {/* ── Action bar ── */}
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => setGenerateOpen(true)}>
          <Sparkles className="h-3.5 w-3.5 mr-1.5" />
          Generate Demo Data
        </Button>

        <Button variant="outline" onClick={handleDownload} disabled={templateLoading}>
          {templateLoading ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Download className="h-3.5 w-3.5 mr-1.5" />}
          Excel Template
        </Button>

        {deletable.length > 1 && (
          <Button
            variant="outline"
            className="text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
            onClick={() => setDeleteAllOpen(true)}
            disabled={hasDeleting}
          >
            <Skull className="h-3.5 w-3.5 mr-1.5" />
            Delete All ({deletable.length} batches)
          </Button>
        )}

        <Button variant="ghost" size="icon" onClick={() => refetch()} title="Refresh">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* ── Security notice ── */}
      <div className="rounded-xl border border-amber-200 dark:border-amber-800/40 bg-amber-50 dark:bg-amber-950/20 p-4 flex gap-3">
        <ShieldAlert className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
        <div className="text-xs text-amber-800 dark:text-amber-300 space-y-1">
          <p className="font-semibold">Before going live — read this</p>
          <p>Demo accounts use password <code className="bg-amber-100 dark:bg-amber-900/40 px-1 rounded font-mono">Demo@Pass1</code>. Delete all batches and{" "}<Link to="/settings/demo_data" className="underline underline-offset-2 hover:opacity-80">disable Demo Data Tools</Link>{" "}before opening this system to real users.</p>
        </div>
      </div>

      <Separator />

      {/* ── Active generation ── */}
      {generating.map((batch) => (
        <GeneratingPanel key={batch.id} batch={batch} modules={modules} />
      ))}

      {/* ── Active batches ── */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">
            Batches
            {active.length > 0 && <span className="ml-2 text-xs font-normal text-muted-foreground">({active.length})</span>}
          </h2>
          {hasDeleting && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Deletion in progress…
            </div>
          )}
        </div>

        {batchesLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" />Loading batches…
          </div>
        )}

        {!batchesLoading && active.length === 0 && generating.length === 0 && (
          <div className="rounded-xl border border-dashed bg-muted/20 py-14 flex flex-col items-center gap-3 text-center">
            <Database className="h-8 w-8 text-muted-foreground/40" />
            <div>
              <p className="text-sm font-medium text-muted-foreground">No active demo batches</p>
              <p className="text-xs text-muted-foreground/70 mt-1">Click Generate to create your first batch of demo data</p>
            </div>
            <Button size="sm" onClick={() => setGenerateOpen(true)}>
              <Sparkles className="h-3.5 w-3.5 mr-1.5" />Generate Now
            </Button>
          </div>
        )}

        {active.map((batch) => (
          <BatchCard key={batch.id} batch={batch} onDelete={setDeleteTargetId} />
        ))}
      </section>

      {/* ── Deletion audit history ── */}
      {deleted.length > 0 && (
        <section>
          <Collapsible>
            <CollapsibleTrigger className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors">
              <ChevronRight className="h-3 w-3" />
              <Clock className="h-3 w-3" />
              {deleted.length} deleted batch{deleted.length !== 1 ? "es" : ""} — audit history
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-3 rounded-lg border divide-y text-xs">
                {deleted.map((b) => (
                  <div key={b.id} className="flex items-center justify-between px-4 py-3 odd:bg-muted/10">
                    <div className="min-w-0">
                      <p className="font-medium text-foreground/70 truncate">{b.label}</p>
                      <p className="text-muted-foreground text-[11px] mt-0.5">
                        Generated {fmtDate(b.createdAt)} by {b.generatedByName || "Admin"}
                        {b.deletedAt && (
                          <> · <span className="text-foreground/60">Deleted {fmtDate(b.deletedAt)}{b.deletedByName ? ` by ${b.deletedByName}` : ""}</span></>
                        )}
                      </p>
                    </div>
                    <div className="shrink-0 ml-4 flex items-center gap-2">
                      <span className="tabular-nums text-muted-foreground">{totalRecordCounts(b.recordCounts).toLocaleString()} records</span>
                      <BatchStatusPill status="deleted" />
                    </div>
                  </div>
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>
        </section>
      )}

      {/* ── Dialogs ── */}
      <GenerateDialog
        open={generateOpen}
        onClose={() => setGenerateOpen(false)}
        onGenerate={(label, size, mods) => generateMutation.mutate({ label, size, modules: mods })}
        isPending={generateMutation.isPending}
        modules={modules}
      />

      <DeleteBatchDialog
        batchId={deleteTargetId}
        onClose={() => setDeleteTargetId(null)}
        onConfirmed={(id, force) => deleteMutation.mutate({ id, force })}
      />

      <DeleteAllDialog
        open={deleteAllOpen}
        batches={active}
        onClose={() => setDeleteAllOpen(false)}
        onConfirmed={() => deleteAllMutation.mutate()}
        isPending={deleteAllMutation.isPending}
      />
    </div>
  );
}
