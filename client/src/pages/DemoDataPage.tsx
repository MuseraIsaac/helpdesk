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

import { useState, useCallback, useRef, type ChangeEvent, type DragEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router";
import axios from "axios";
import {
  Database, Sparkles, Trash2, Download, RefreshCw,
  CheckCircle2, AlertTriangle, Loader2, Clock,
  ChevronDown, ChevronRight, ShieldAlert, Lock, Settings,
  Users, Ticket, Server, BookOpen, Wrench,
  ShoppingBag, Inbox, AlertCircle, ArrowUpDown, Circle,
  BarChart2, Skull, Info, Upload, FileSpreadsheet,
  XCircle, ChevronUp, FileUp, Activity, Layers,
  TrendingUp, PackageOpen, FlaskConical,
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
import { Card, CardContent } from "@/components/ui/card";
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

interface ImportValidationError {
  sheet:    string;
  row:      number;
  field?:   string;
  message:  string;
  severity: "error" | "warning";
}

interface ImportSheetSummary {
  sheet:      string;
  label:      string;
  totalRows:  number;
  validRows:  number;
  errorRows:  number;
  willCreate: number;
  willSkip:   number;
}

interface ImportValidationResult {
  isValid:    boolean;
  canImport:  boolean;
  errors:     ImportValidationError[];
  warnings:   ImportValidationError[];
  summary:    ImportSheetSummary[];
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
  validateImport: async (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return axios.post<{ result: ImportValidationResult }>("/api/demo-data/import/validate", form, {
      headers: { "Content-Type": "multipart/form-data" },
    }).then((r) => r.data.result);
  },
  runImport: async (file: File, label: string) => {
    const form = new FormData();
    form.append("file", file);
    form.append("label", label);
    return axios.post<{ batch: DemoBatch }>("/api/demo-data/import", form, {
      headers: { "Content-Type": "multipart/form-data" },
    }).then((r) => r.data.batch);
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

const MODULE_LABEL_SHORT: Partial<Record<ModuleKey, string>> = {
  foundation: "Users",
  knowledge:  "KB",
  macros:     "Macros",
  catalog:    "Catalog",
  tickets:    "Tickets",
  incidents:  "Incidents",
  requests:   "Requests",
  problems:   "Problems",
  changes:    "Changes",
  assets:     "Assets",
  cmdb:       "CMDB",
};

function BatchCard({ batch, onDelete }: { batch: DemoBatch; onDelete: (id: number) => void }) {
  const [open, setOpen] = useState(false);
  const total    = totalRecordCounts(batch.recordCounts);
  const isImport = batch.label.startsWith("Excel Import");

  return (
    <div className={[
      "rounded-xl border bg-card overflow-hidden transition-opacity",
      batch.status === "deleting" ? "opacity-50" : "",
    ].join(" ")}>
      {/* Card header */}
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-start gap-3">
          {/* Leading icon */}
          <div className={[
            "h-8 w-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5",
            isImport ? "bg-violet-100 dark:bg-violet-900/30" : "bg-primary/10",
          ].join(" ")}>
            {isImport
              ? <FileSpreadsheet className="h-4 w-4 text-violet-600 dark:text-violet-400" />
              : <Sparkles className="h-4 w-4 text-primary" />}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-semibold truncate">{batch.label}</p>
              <BatchStatusPill status={batch.status} />
              {isImport && (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300">
                  <FileSpreadsheet className="h-2.5 w-2.5" />Excel Import
                </span>
              )}
              {!isImport && batch.size && (
                <span className="text-[10px] border rounded-full px-1.5 py-0.5 text-muted-foreground capitalize">{batch.size}</span>
              )}
            </div>

            <p className="text-xs text-muted-foreground mt-0.5">
              {isImport ? "Imported" : "Generated"} {fmtDate(batch.createdAt)} by{" "}
              <span className="font-medium text-foreground/70">{batch.generatedByName || "Admin"}</span>
              {batch.completedAt && <> · <span className="text-foreground/60">completed {fmtDate(batch.completedAt)}</span></>}
            </p>

            {batch.status === "deleted" && batch.deletedAt && (
              <p className="text-xs text-muted-foreground mt-0.5">
                <Clock className="h-3 w-3 inline mr-1 opacity-50" />
                Deleted {fmtDate(batch.deletedAt)}
                {batch.deletedByName && <> by <span className="font-medium text-foreground/60">{batch.deletedByName}</span></>}
              </p>
            )}
          </div>

          {/* Actions */}
          {batch.status === "deleting" && (
            <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 shrink-0">
              <Loader2 className="h-3 w-3 animate-spin" />
              Deleting…
            </div>
          )}
          {(batch.status === "ready" || batch.status === "error") && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost" size="sm"
                    className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0 h-8"
                    onClick={() => onDelete(batch.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1" />
                    {batch.status === "error" ? "Force Delete" : "Delete"}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="left" className="max-w-60 text-xs">
                  {batch.status === "error"
                    ? "This batch errored during generation. Delete will remove any records created before the failure."
                    : `Permanently remove all ${total.toLocaleString()} records. You'll see a live count before confirming.`}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </div>

      {/* Error message */}
      {batch.errorMessage && (
        <div className="mx-4 mb-3 text-xs bg-destructive/5 border border-destructive/20 text-destructive rounded-lg px-3 py-2 font-mono leading-relaxed">
          {batch.errorMessage}
        </div>
      )}

      {/* Module pills */}
      {!isImport && batch.modules && batch.modules.length > 0 && (
        <div className="px-4 pb-3 flex flex-wrap gap-1">
          {(batch.modules as ModuleKey[]).map((m) => (
            <span key={m} className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground font-medium">
              <ModuleIcon name={ICON_MAP[m] ? m : "Database"} className="h-2.5 w-2.5" />
              {MODULE_LABEL_SHORT[m] ?? m}
            </span>
          ))}
        </div>
      )}

      {/* Record count footer */}
      {total > 0 && (
        <Collapsible open={open} onOpenChange={setOpen}>
          <CollapsibleTrigger className={[
            "w-full flex items-center justify-between px-4 py-2.5 border-t text-xs transition-colors",
            "text-muted-foreground hover:text-foreground hover:bg-muted/20",
          ].join(" ")}>
            <div className="flex items-center gap-2">
              {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              <Database className="h-3 w-3" />
              <span className="font-medium">{total.toLocaleString()} records</span>
            </div>
            <span className="text-muted-foreground/60">{open ? "Hide breakdown" : "Show breakdown"}</span>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="px-4 pb-4 pt-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
              {ENTITY_GROUPS.map((group) => {
                const rows = group.entries.map(({ key, label }) => ({
                  label,
                  count: batch.recordCounts[key + "s"] ?? batch.recordCounts[key] ?? 0,
                })).filter((r) => r.count > 0);
                if (!rows.length) return null;
                const Icon = group.icon;
                return (
                  <div key={group.label} className="rounded-lg border bg-muted/20 p-2.5">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <Icon className="h-3 w-3 text-muted-foreground" />
                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{group.label}</p>
                    </div>
                    {rows.map((r) => (
                      <div key={r.label} className="flex justify-between text-xs py-0.5">
                        <span className="text-muted-foreground truncate mr-2">{r.label}</span>
                        <span className="font-semibold tabular-nums shrink-0">{r.count}</span>
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

// ── Import dialog ─────────────────────────────────────────────────────────────

type ImportStep = "upload" | "preview" | "confirm";

function ImportDialog({
  open,
  onClose,
  onImported,
}: {
  open:       boolean;
  onClose:    () => void;
  onImported: (batch: DemoBatch) => void;
}) {
  const [step,       setStep]       = useState<ImportStep>("upload");
  const [file,       setFile]       = useState<File | null>(null);
  const [dragOver,   setDragOver]   = useState(false);
  const [validation, setValidation] = useState<ImportValidationResult | null>(null);
  const [label,      setLabel]      = useState(`Excel Import — ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`);
  const [errorsOpen, setErrorsOpen] = useState(true);
  const [warnOpen,   setWarnOpen]   = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const validateMutation = useMutation({
    mutationFn: (f: File) => api.validateImport(f),
    onSuccess:  (result)  => { setValidation(result); setStep("preview"); },
  });

  const importMutation = useMutation({
    mutationFn: ({ f, lbl }: { f: File; lbl: string }) => api.runImport(f, lbl),
    onSuccess:  (batch) => { handleClose(); onImported(batch); },
  });

  function handleClose() {
    setStep("upload");
    setFile(null);
    setValidation(null);
    setLabel(`Excel Import — ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`);
    setErrorsOpen(true);
    setWarnOpen(false);
    onClose();
  }

  function handleFileSelect(f: File) {
    if (!f.name.endsWith(".xlsx")) return;
    setFile(f);
    validateMutation.mutate(f);
    setStep("upload");
  }

  function onFileInput(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) handleFileSelect(f);
    e.target.value = "";
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFileSelect(f);
  }

  const totalErrors   = validation?.errors.length   ?? 0;
  const totalWarnings = validation?.warnings.length  ?? 0;
  const totalCreate   = validation?.summary.reduce((s, x) => s + x.willCreate, 0) ?? 0;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4 text-primary" />
            Import from Excel
          </DialogTitle>
          <DialogDescription>
            Upload your filled-in ITSM demo data workbook. We'll validate every row before importing.
          </DialogDescription>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {(["upload","preview","confirm"] as ImportStep[]).map((s, i) => {
            const labels: Record<ImportStep, string> = { upload: "Upload", preview: "Preview", confirm: "Confirm" };
            const active  = step === s;
            const done    = (step === "preview" && s === "upload") || (step === "confirm" && s !== "confirm");
            return (
              <span key={s} className="flex items-center gap-1.5">
                {i > 0 && <span className="text-border">›</span>}
                <span className={[
                  "font-medium",
                  active ? "text-primary" : done ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground/50",
                ].join(" ")}>
                  {done && <CheckCircle2 className="h-3 w-3 inline mr-0.5 mb-0.5" />}{labels[s]}
                </span>
              </span>
            );
          })}
        </div>

        <div className="flex-1 overflow-y-auto min-h-0 space-y-4 py-1">

          {/* ── Upload zone ── */}
          {step === "upload" && (
            <div
              className={[
                "relative rounded-xl border-2 border-dashed transition-colors cursor-pointer",
                dragOver
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/40 hover:bg-muted/20",
              ].join(" ")}
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
            >
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="sr-only"
                onChange={onFileInput}
              />
              <div className="flex flex-col items-center gap-3 py-12 px-6 text-center">
                {validateMutation.isPending ? (
                  <>
                    <Loader2 className="h-8 w-8 text-primary animate-spin" />
                    <p className="text-sm font-medium">Validating "{file?.name}"…</p>
                    <p className="text-xs text-muted-foreground">Parsing all sheets and checking for errors</p>
                  </>
                ) : validateMutation.isError ? (
                  <>
                    <XCircle className="h-8 w-8 text-destructive" />
                    <p className="text-sm font-medium text-destructive">Validation failed</p>
                    <p className="text-xs text-muted-foreground">
                      {(validateMutation.error as Error)?.message ?? "Could not parse the file. Make sure it is a valid .xlsx workbook."}
                    </p>
                    <p className="text-xs text-primary">Click or drop to try again</p>
                  </>
                ) : (
                  <>
                    <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center">
                      <FileUp className="h-7 w-7 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold">Drop your .xlsx workbook here</p>
                      <p className="text-xs text-muted-foreground mt-1">or click to browse</p>
                    </div>
                    <p className="text-[11px] text-muted-foreground/70">
                      Use the Excel Template button to download the pre-filled template first.
                    </p>
                  </>
                )}
              </div>
            </div>
          )}

          {/* ── Preview (validation result) ── */}
          {step === "preview" && validation && (
            <div className="space-y-4">
              {/* Summary bar */}
              <div className={[
                "rounded-xl border p-4 flex items-center gap-4",
                validation.canImport && totalErrors === 0
                  ? "border-emerald-200 dark:border-emerald-800/40 bg-emerald-50 dark:bg-emerald-950/20"
                  : validation.canImport
                  ? "border-amber-200 dark:border-amber-800/40 bg-amber-50 dark:bg-amber-950/20"
                  : "border-destructive/30 bg-destructive/5",
              ].join(" ")}>
                {validation.canImport ? (
                  <CheckCircle2 className={`h-5 w-5 shrink-0 ${totalErrors === 0 ? "text-emerald-600" : "text-amber-600"}`} />
                ) : (
                  <XCircle className="h-5 w-5 shrink-0 text-destructive" />
                )}
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold ${validation.canImport ? "" : "text-destructive"}`}>
                    {validation.canImport
                      ? `${totalCreate} records ready to import`
                      : "No valid rows found — fix errors before importing"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {totalErrors > 0   && <span className="text-destructive mr-2">{totalErrors} error{totalErrors !== 1 ? "s" : ""}</span>}
                    {totalWarnings > 0 && <span className="text-amber-600 mr-2">{totalWarnings} warning{totalWarnings !== 1 ? "s" : ""}</span>}
                    {totalErrors === 0 && totalWarnings === 0 && <span className="text-emerald-600">No issues found</span>}
                  </p>
                </div>
                <button
                  type="button"
                  className="text-xs text-primary hover:underline shrink-0"
                  onClick={() => { setStep("upload"); validateMutation.reset(); }}
                >
                  Change file
                </button>
              </div>

              {/* Sheet summary table */}
              <div className="rounded-lg border overflow-hidden text-xs">
                <div className="grid grid-cols-[1fr_auto_auto_auto_auto] bg-muted/60 px-3 py-2 gap-x-4 font-semibold text-muted-foreground text-[10px] uppercase tracking-wider">
                  <span>Sheet</span>
                  <span className="text-right">Rows</span>
                  <span className="text-right text-emerald-700 dark:text-emerald-400">Create</span>
                  <span className="text-right text-amber-700 dark:text-amber-400">Skip</span>
                  <span className="text-right text-destructive">Errors</span>
                </div>
                {validation.summary.filter((s) => s.totalRows > 0).map((s) => (
                  <div
                    key={s.sheet}
                    className="grid grid-cols-[1fr_auto_auto_auto_auto] px-3 py-2 gap-x-4 border-t even:bg-muted/10 items-center"
                  >
                    <span className="font-medium truncate">{s.label}</span>
                    <span className="text-right text-muted-foreground tabular-nums">{s.totalRows}</span>
                    <span className={`text-right tabular-nums font-semibold ${s.willCreate > 0 ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground"}`}>{s.willCreate}</span>
                    <span className={`text-right tabular-nums ${s.willSkip > 0 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`}>{s.willSkip}</span>
                    <span className={`text-right tabular-nums ${s.errorRows > 0 ? "text-destructive font-semibold" : "text-muted-foreground"}`}>{s.errorRows}</span>
                  </div>
                ))}
                {validation.summary.every((s) => s.totalRows === 0) && (
                  <div className="px-3 py-4 text-center text-muted-foreground">
                    No data rows found. Fill in the sheets and try again.
                  </div>
                )}
              </div>

              {/* Errors */}
              {totalErrors > 0 && (
                <Collapsible open={errorsOpen} onOpenChange={setErrorsOpen}>
                  <CollapsibleTrigger className="flex items-center gap-2 text-xs font-semibold text-destructive w-full">
                    {errorsOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                    <XCircle className="h-3 w-3" />
                    {totalErrors} validation error{totalErrors !== 1 ? "s" : ""}
                    <span className="text-muted-foreground font-normal">(rows with errors will be skipped)</span>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="mt-2 rounded-lg border border-destructive/20 divide-y divide-destructive/10 max-h-40 overflow-y-auto text-xs">
                      {validation.errors.map((e, i) => (
                        <div key={i} className="px-3 py-1.5 flex gap-2">
                          <span className="text-muted-foreground shrink-0 tabular-nums w-24 truncate">{e.sheet} row {e.row}</span>
                          {e.field && <span className="text-primary/70 shrink-0 w-20 truncate">{e.field}</span>}
                          <span className="text-destructive/80 flex-1">{e.message}</span>
                        </div>
                      ))}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              )}

              {/* Warnings */}
              {totalWarnings > 0 && (
                <Collapsible open={warnOpen} onOpenChange={setWarnOpen}>
                  <CollapsibleTrigger className="flex items-center gap-2 text-xs font-semibold text-amber-600 dark:text-amber-400 w-full">
                    {warnOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                    <AlertTriangle className="h-3 w-3" />
                    {totalWarnings} warning{totalWarnings !== 1 ? "s" : ""}
                    <span className="text-muted-foreground font-normal">(import will proceed)</span>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="mt-2 rounded-lg border border-amber-200 dark:border-amber-800/30 divide-y divide-amber-100 dark:divide-amber-900/20 max-h-36 overflow-y-auto text-xs">
                      {validation.warnings.map((w, i) => (
                        <div key={i} className="px-3 py-1.5 flex gap-2">
                          <span className="text-muted-foreground shrink-0 tabular-nums w-24 truncate">{w.sheet} row {w.row}</span>
                          {w.field && <span className="text-primary/70 shrink-0 w-20 truncate">{w.field}</span>}
                          <span className="text-amber-700 dark:text-amber-300 flex-1">{w.message}</span>
                        </div>
                      ))}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              )}

              {validation.canImport && (
                <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground space-y-1">
                  <p className="font-semibold text-foreground">Ready to import</p>
                  <p>All imported records will be tracked as a demo batch and can be safely deleted at any time from the Batches panel.</p>
                </div>
              )}
            </div>
          )}

          {/* ── Confirm step ── */}
          {step === "confirm" && (
            <div className="space-y-4">
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 flex gap-3 items-start">
                <FileSpreadsheet className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold">{file?.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {totalCreate} record{totalCreate !== 1 ? "s" : ""} across{" "}
                    {validation?.summary.filter((s) => s.willCreate > 0).length ?? 0} sheets
                  </p>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="import-label" className="text-sm">Batch label</Label>
                <Input
                  id="import-label"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="e.g. Acme Corp Demo Import"
                />
                <p className="text-[11px] text-muted-foreground">This label appears in the Batches panel for easy identification.</p>
              </div>

              <div className="rounded-xl border border-amber-200 dark:border-amber-800/40 bg-amber-50 dark:bg-amber-950/20 p-3 flex gap-2">
                <ShieldAlert className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-800 dark:text-amber-300">
                  Imported users will have password <code className="bg-amber-100 dark:bg-amber-900/40 px-1 rounded font-mono">Demo@Pass1</code>.
                  Delete this batch before going live.
                </p>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="pt-2 border-t gap-2">
          <Button variant="outline" onClick={handleClose} disabled={importMutation.isPending}>Cancel</Button>

          {step === "upload" && (
            <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={validateMutation.isPending}>
              <Upload className="h-3.5 w-3.5 mr-1.5" />
              Browse…
            </Button>
          )}

          {step === "preview" && validation?.canImport && (
            <Button onClick={() => setStep("confirm")}>
              Continue to Confirm
              <ChevronRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          )}

          {step === "confirm" && (
            <Button
              onClick={() => { if (file) importMutation.mutate({ f: file, lbl: label }); }}
              disabled={importMutation.isPending || !label.trim()}
            >
              {importMutation.isPending
                ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Importing…</>
                : <><FileUp className="h-3.5 w-3.5 mr-1.5" />Import {totalCreate} records</>}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Section header ────────────────────────────────────────────────────────────

function SectionHeader({
  icon: Icon,
  title,
  count,
  children,
}: {
  icon:      React.ElementType;
  title:     string;
  count?:    number;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {count !== undefined && count > 0 && (
          <span className="text-xs font-medium tabular-nums text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
            {count}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

// ── Feature disabled ──────────────────────────────────────────────────────────

function FeatureDisabled() {
  return (
    <div className="flex flex-col items-center justify-center py-28 text-center gap-6 max-w-sm mx-auto">
      <div className="h-16 w-16 rounded-2xl bg-muted border flex items-center justify-center">
        <Lock className="h-8 w-8 text-muted-foreground" />
      </div>
      <div className="space-y-2">
        <h2 className="text-base font-semibold">Demo Data Tools are disabled</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          A Super Admin must enable Demo Data Tools in Settings before this page can be used.
        </p>
      </div>
      <Button asChild variant="outline">
        <Link to="/settings/demo_data">
          <Settings className="h-3.5 w-3.5 mr-1.5" />
          Go to Settings → Demo Data
        </Link>
      </Button>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function DemoDataPage() {
  const qc = useQueryClient();
  const [generateOpen,    setGenerateOpen]    = useState(false);
  const [importOpen,      setImportOpen]      = useState(false);
  const [deleteTargetId,  setDeleteTargetId]  = useState<number | null>(null);
  const [deleteAllOpen,   setDeleteAllOpen]   = useState(false);
  const [templateLoading, setTemplateLoading] = useState(false);

  // Settings check
  const { data: settings, isLoading: settingsLoading } = useQuery({
    queryKey:  ["settings", "demo_data"],
    queryFn:   api.getSettings,
    staleTime: 60_000,
  });
  const isEnabled = settings?.enableDemoDataTools ?? false;

  // Module metadata
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

  const generateMutation = useMutation({
    mutationFn: (p: { label: string; size: GeneratorSize; modules: ModuleKey[] }) => api.generate(p),
    onSuccess: () => { setGenerateOpen(false); qc.invalidateQueries({ queryKey: ["demo-batches"] }); },
  });

  const deleteMutation = useMutation({
    mutationFn: ({ id, force }: { id: number; force: boolean }) => api.deleteBatch(id, force),
    onSuccess:  () => { setDeleteTargetId(null); qc.invalidateQueries({ queryKey: ["demo-batches"] }); },
  });

  const deleteAllMutation = useMutation({
    mutationFn: api.deleteAll,
    onSuccess:  () => { setDeleteAllOpen(false); qc.invalidateQueries({ queryKey: ["demo-batches"] }); },
  });

  const handleDownload = useCallback(async () => {
    setTemplateLoading(true);
    try { await api.downloadTemplate(); } finally { setTemplateLoading(false); }
  }, []);

  // ── Loading guard ──────────────────────────────────────────────────────────
  if (settingsLoading) {
    return (
      <div className="space-y-6 max-w-4xl">
        <Skeleton className="h-24 w-full rounded-xl" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          {[...Array(2)].map((_, i) => <Skeleton key={i} className="h-48 rounded-xl" />)}
        </div>
      </div>
    );
  }
  if (!isEnabled) return <FeatureDisabled />;

  // ── Derived state ──────────────────────────────────────────────────────────
  const generating    = batches.filter((b) => b.status === "generating");
  const active        = batches.filter((b) => b.status !== "deleted" && b.status !== "generating");
  const deleted       = batches.filter((b) => b.status === "deleted");
  const deletable     = active.filter((b) => b.status === "ready" || b.status === "error");
  const hasDeleting   = active.some((b) => b.status === "deleting");
  const totalRecords  = active.reduce((s, b) => s + totalRecordCounts(b.recordCounts), 0);
  const lastBatch     = [...batches]
    .filter((b) => b.completedAt)
    .sort((a, b) => new Date(b.completedAt!).getTime() - new Date(a.completedAt!).getTime())[0];

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-8 max-w-4xl">

      {/* ── Page header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 mb-1.5">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <FlaskConical className="h-5 w-5 text-primary" />
            </div>
            <h1 className="text-xl font-bold tracking-tight">Demo Data</h1>
            <Badge variant="secondary" className="text-[10px] font-bold uppercase tracking-widest px-2">
              Super Admin
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground max-w-2xl leading-relaxed">
            Populate this system with realistic synthetic ITSM data for sales demos, testing, and training.
            All records are tracked by database ID — cleanup never touches real production data.
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={() => refetch()} className="shrink-0 mt-1" title="Refresh">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {batchesError && <ErrorAlert error={batchesError as Error} fallback="Failed to load demo batches" />}

      {/* ── Overview stats ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          {
            icon:  Layers,
            label: "Active Batches",
            value: batchesLoading ? "—" : active.length.toString(),
            sub:   active.length === 1 ? "1 batch ready" : active.length > 1 ? `${active.length} batches` : "No batches yet",
            color: "text-primary",
            bg:    "bg-primary/10",
          },
          {
            icon:  Database,
            label: "Demo Records",
            value: batchesLoading ? "—" : totalRecords > 0 ? totalRecords.toLocaleString() : "0",
            sub:   totalRecords > 0 ? "Across all active batches" : "Generate data to begin",
            color: "text-violet-600 dark:text-violet-400",
            bg:    "bg-violet-50 dark:bg-violet-950/30",
          },
          {
            icon:  PackageOpen,
            label: "Available Modules",
            value: modules.length > 0 ? modules.length.toString() : "11",
            sub:   "Tickets, Incidents, Assets…",
            color: "text-sky-600 dark:text-sky-400",
            bg:    "bg-sky-50 dark:bg-sky-950/30",
          },
          {
            icon:  Activity,
            label: "Last Generated",
            value: lastBatch ? new Date(lastBatch.completedAt!).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—",
            sub:   lastBatch ? `by ${lastBatch.generatedByName}` : "No batches yet",
            color: "text-emerald-600 dark:text-emerald-400",
            bg:    "bg-emerald-50 dark:bg-emerald-950/30",
          },
        ].map(({ icon: Icon, label, value, sub, color, bg }) => (
          <Card key={label} className="border bg-card">
            <CardContent className="p-4">
              <div className={`h-7 w-7 rounded-lg ${bg} flex items-center justify-center mb-3`}>
                <Icon className={`h-3.5 w-3.5 ${color}`} />
              </div>
              <p className="text-2xl font-bold tabular-nums tracking-tight">{value}</p>
              <p className="text-[11px] font-medium text-muted-foreground mt-0.5">{label}</p>
              <p className="text-[10px] text-muted-foreground/60 mt-0.5 truncate">{sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Safety notice ── */}
      <div className="rounded-xl border border-amber-200 dark:border-amber-700/50 bg-amber-50/80 dark:bg-amber-950/20 px-4 py-3 flex gap-3 items-start">
        <ShieldAlert className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-amber-800 dark:text-amber-200">Pre-production warning</p>
          <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5 leading-relaxed">
            All demo users are created with password{" "}
            <code className="bg-amber-100 dark:bg-amber-900/50 px-1.5 py-0.5 rounded font-mono text-[11px]">Demo@Pass1</code>.{" "}
            Delete all batches and{" "}
            <Link to="/settings/demo_data" className="font-medium underline underline-offset-2 hover:opacity-80">
              disable Demo Data Tools
            </Link>{" "}
            before opening this system to real users.
          </p>
        </div>
      </div>

      {/* ── Action cards ── */}
      <div className="grid sm:grid-cols-2 gap-4">

        {/* Generate card */}
        <Card className="border bg-card flex flex-col">
          <CardContent className="p-5 flex flex-col flex-1">
            <div className="flex items-start gap-3 mb-4">
              <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <Sparkles className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="text-sm font-semibold">Generate Demo Data</h3>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                  Instantly generate realistic ITSM data across up to 11 modules. Choose Small (~80 records), Medium (~170), or Large (~340).
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-1 mb-4">
              {["Users", "Tickets", "Incidents", "Assets", "KB Articles", "Changes", "+ more"].map((m) => (
                <span key={m} className="text-[10px] px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground font-medium">{m}</span>
              ))}
            </div>

            <div className="mt-auto">
              <Button className="w-full" onClick={() => setGenerateOpen(true)}>
                <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                Generate Demo Data
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Import card */}
        <Card className="border bg-card flex flex-col">
          <CardContent className="p-5 flex flex-col flex-1">
            <div className="flex items-start gap-3 mb-4">
              <div className="h-9 w-9 rounded-xl bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center shrink-0">
                <FileSpreadsheet className="h-5 w-5 text-violet-600 dark:text-violet-400" />
              </div>
              <div>
                <h3 className="text-sm font-semibold">Import from Excel</h3>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                  Download the pre-filled template, customise it with your data, and import back. Perfect for scenario-specific or client-tailored demos.
                </p>
              </div>
            </div>

            <div className="rounded-lg border bg-muted/30 p-3 mb-4 text-xs space-y-1.5">
              <div className="flex items-center gap-2 text-muted-foreground">
                <span className="h-4 w-4 rounded-full bg-muted flex items-center justify-center text-[9px] font-bold shrink-0">1</span>
                Download the Excel template below
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <span className="h-4 w-4 rounded-full bg-muted flex items-center justify-center text-[9px] font-bold shrink-0">2</span>
                Fill in the sheets with your custom data
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <span className="h-4 w-4 rounded-full bg-muted flex items-center justify-center text-[9px] font-bold shrink-0">3</span>
                Upload and validate before importing
              </div>
            </div>

            <div className="mt-auto flex gap-2">
              <Button className="flex-1" variant="outline" onClick={handleDownload} disabled={templateLoading}>
                {templateLoading
                  ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  : <Download className="h-3.5 w-3.5 mr-1.5" />}
                Template
              </Button>
              <Button className="flex-1" onClick={() => setImportOpen(true)}>
                <FileUp className="h-3.5 w-3.5 mr-1.5" />
                Import
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Active generation progress ── */}
      {generating.length > 0 && (
        <section className="space-y-3">
          <SectionHeader icon={TrendingUp} title="In Progress" count={generating.length} />
          {generating.map((batch) => (
            <GeneratingPanel key={batch.id} batch={batch} modules={modules} />
          ))}
        </section>
      )}

      <Separator />

      {/* ── Active batches ── */}
      <section className="space-y-4">
        <SectionHeader icon={Database} title="Demo Data Batches" count={active.length}>
          {hasDeleting && (
            <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
              <Loader2 className="h-3 w-3 animate-spin" />
              Deletion in progress…
            </div>
          )}
        </SectionHeader>

        {batchesLoading && (
          <div className="space-y-3">
            {[...Array(2)].map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
          </div>
        )}

        {!batchesLoading && active.length === 0 && generating.length === 0 && (
          <div className="rounded-xl border border-dashed bg-muted/10 py-16 flex flex-col items-center gap-4 text-center">
            <div className="h-14 w-14 rounded-2xl bg-muted/60 flex items-center justify-center">
              <Database className="h-7 w-7 text-muted-foreground/40" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-semibold text-muted-foreground">No demo batches yet</p>
              <p className="text-xs text-muted-foreground/60 max-w-64">
                Use Generate to create a full dataset, or import your own data from Excel.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={() => setGenerateOpen(true)}>
                <Sparkles className="h-3.5 w-3.5 mr-1.5" />Generate
              </Button>
              <Button size="sm" variant="outline" onClick={() => setImportOpen(true)}>
                <FileUp className="h-3.5 w-3.5 mr-1.5" />Import
              </Button>
            </div>
          </div>
        )}

        {active.map((batch) => (
          <BatchCard key={batch.id} batch={batch} onDelete={setDeleteTargetId} />
        ))}
      </section>

      {/* ── Deleted batches audit ── */}
      {deleted.length > 0 && (
        <section>
          <Collapsible>
            <CollapsibleTrigger className="group flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors py-1">
              <ChevronRight className="h-3 w-3 transition-transform group-data-[state=open]:rotate-90" />
              <Clock className="h-3 w-3" />
              <span className="font-medium">{deleted.length} deleted batch{deleted.length !== 1 ? "es" : ""}</span>
              <span className="text-muted-foreground/50">— audit history</span>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-3 rounded-xl border overflow-hidden divide-y text-xs">
                {deleted.map((b) => (
                  <div key={b.id} className="flex items-center gap-3 px-4 py-3 odd:bg-muted/10">
                    <div className="h-6 w-6 rounded-md bg-muted flex items-center justify-center shrink-0">
                      <Clock className="h-3 w-3 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground/60 truncate">{b.label}</p>
                      <p className="text-muted-foreground text-[10px] mt-0.5">
                        Generated {fmtDate(b.createdAt)} by {b.generatedByName || "Admin"}
                        {b.deletedAt && (
                          <> · Deleted {fmtDate(b.deletedAt)}{b.deletedByName ? ` by ${b.deletedByName}` : ""}</>
                        )}
                      </p>
                    </div>
                    <div className="shrink-0 flex items-center gap-2">
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

      {/* ── Danger zone ── */}
      {deletable.length > 1 && (
        <section className="rounded-xl border border-destructive/30 bg-destructive/5 p-5 space-y-4">
          <div className="flex items-start gap-3">
            <Skull className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-semibold text-destructive">Danger Zone</h3>
              <p className="text-xs text-destructive/70 mt-0.5 leading-relaxed">
                The following action will permanently delete all {deletable.length} active demo batches and their{" "}
                {deletable.reduce((s, b) => s + totalRecordCounts(b.recordCounts), 0).toLocaleString()} records.
                This cannot be undone.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setDeleteAllOpen(true)}
              disabled={hasDeleting}
            >
              <Trash2 className="h-3.5 w-3.5 mr-1.5" />
              Delete All {deletable.length} Batches
            </Button>
            <p className="text-xs text-destructive/60">
              Only demo-tagged records are affected. No real data can be deleted.
            </p>
          </div>
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

      <ImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={() => { setImportOpen(false); qc.invalidateQueries({ queryKey: ["demo-batches"] }); }}
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
