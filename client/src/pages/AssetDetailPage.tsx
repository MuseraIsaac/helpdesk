import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import axios from "axios";
import {
  ASSET_TYPE_LABEL, ASSET_STATUS_LABEL, ASSET_CONDITION_LABEL,
  DEPRECIATION_METHOD_LABEL, ASSET_RELATIONSHIP_LABEL,
  ASSET_TYPES, ASSET_CONDITIONS, DEPRECIATION_METHODS,
  LIFECYCLE_TRANSITIONS, ASSET_RELATIONSHIP_TYPES,
  type AssetDetail, type AssetStatus, type AssetRelationshipType,
  type AssetMovementRecord,
} from "core/constants/assets.ts";
import {
  MOVEMENT_TYPE_LABEL, MOVEMENT_TYPE_COLOR,
  type AssetMovementType,
} from "core/constants/inventory.ts";
import {
  receiveAssetSchema, transferAssetSchema, issueAssetSchema,
  returnAssetSchema, sendRepairSchema, completeRepairSchema,
  type ReceiveAssetInput, type TransferAssetInput, type IssueAssetInput,
  type ReturnAssetInput, type SendRepairInput, type CompleteRepairInput,
} from "core/schemas/inventory.ts";
import {
  updateAssetSchema, assignAssetSchema, lifecycleTransitionSchema,
  addAssetRelationshipSchema,
  type UpdateAssetInput, type AssignAssetInput,
  type LifecycleTransitionInput, type AddAssetRelationshipInput,
} from "core/schemas/assets.ts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import BackLink from "@/components/BackLink";
import ErrorAlert from "@/components/ErrorAlert";
import ErrorMessage from "@/components/ErrorMessage";
import {
  Pencil, Save, X, Activity, User, Users, Link as LinkIcon, Unlink,
  AlertTriangle, Package, ArrowRight, ArrowLeft, ChevronRight, Plus,
  Trash2, RotateCcw, MapPin, DollarSign, ShieldCheck, GitMerge,
  Layers, Clock, ExternalLink, Circle, ChevronDown, Server,
  FileText, Zap, Wrench, AlertCircle, CheckCircle2, CalendarClock,
  Database, Truck, Warehouse, UserCheck, CornerDownLeft, TrendingDown,
  Ticket, MoreHorizontal,
} from "lucide-react";
import {
  CONTRACT_TYPE_LABEL, CONTRACT_STATUS_LABEL, CONTRACT_STATUS_COLOR, CONTRACT_TYPE_COLOR,
  type AssetContractSummary, type DepreciationResult,
} from "core/constants/contracts.ts";

// ── Palette ───────────────────────────────────────────────────────────────────

const STATUS_PALETTE: Record<AssetStatus, { pill: string; dot: string; bar: string }> = {
  ordered:           { pill: "bg-slate-100   text-slate-600  border-slate-200   dark:bg-slate-800    dark:text-slate-300",  dot: "bg-slate-400",            bar: "bg-slate-400"            },
  in_stock:          { pill: "bg-sky-50      text-sky-700    border-sky-200     dark:bg-sky-900/40   dark:text-sky-300",    dot: "bg-sky-500",              bar: "bg-sky-500"              },
  deployed:          { pill: "bg-emerald-50  text-emerald-700 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300", dot: "bg-emerald-500",       bar: "bg-emerald-500"          },
  in_use:            { pill: "bg-blue-50     text-blue-700   border-blue-200    dark:bg-blue-900/40  dark:text-blue-300",   dot: "bg-blue-500",             bar: "bg-blue-500"             },
  under_maintenance: { pill: "bg-amber-50    text-amber-700  border-amber-200   dark:bg-amber-900/40 dark:text-amber-300",  dot: "bg-amber-500",            bar: "bg-amber-500"            },
  in_repair:         { pill: "bg-orange-50   text-orange-700 border-orange-200  dark:bg-orange-900/40 dark:text-orange-300", dot: "bg-orange-500",          bar: "bg-orange-500"           },
  retired:           { pill: "bg-muted       text-muted-foreground border-muted-foreground/20",                              dot: "bg-muted-foreground/50", bar: "bg-muted-foreground/40"  },
  disposed:          { pill: "bg-muted       text-muted-foreground border-muted-foreground/20",                              dot: "bg-muted-foreground/30", bar: "bg-muted-foreground/25"  },
  lost_stolen:       { pill: "bg-red-50      text-red-700    border-red-200     dark:bg-red-900/40   dark:text-red-300",    dot: "bg-red-500",              bar: "bg-red-500"              },
};

const CONDITION_PALETTE: Record<string, string> = {
  new_item: "text-emerald-600 dark:text-emerald-400",
  good:     "text-blue-600   dark:text-blue-400",
  fair:     "text-amber-600  dark:text-amber-400",
  poor:     "text-destructive",
};

// States shown in the lifecycle stepper (happy path)
const STEPPER_STATES: AssetStatus[] = ["ordered", "in_stock", "deployed", "in_use", "under_maintenance", "retired", "disposed"];

const EVENT_ICON: Record<string, React.ReactNode> = {
  "asset.created":              <Circle   className="h-3 w-3 text-emerald-500 shrink-0 mt-0.5 fill-emerald-500" />,
  "asset.updated":              <Pencil   className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5" />,
  "asset.lifecycle_transition": <Zap      className="h-3 w-3 text-primary shrink-0 mt-0.5" />,
  "asset.assigned":             <User     className="h-3 w-3 text-blue-500 shrink-0 mt-0.5" />,
  "asset.unassigned":           <User     className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5" />,
  "asset.received":             <Truck    className="h-3 w-3 text-emerald-500 shrink-0 mt-0.5" />,
  "asset.transferred":          <Truck    className="h-3 w-3 text-blue-500 shrink-0 mt-0.5" />,
  "asset.issued":               <UserCheck className="h-3 w-3 text-violet-500 shrink-0 mt-0.5" />,
  "asset.returned":             <CornerDownLeft className="h-3 w-3 text-sky-500 shrink-0 mt-0.5" />,
  "asset.sent_to_repair":       <Wrench   className="h-3 w-3 text-amber-500 shrink-0 mt-0.5" />,
  "asset.repair_complete":      <CheckCircle2 className="h-3 w-3 text-teal-500 shrink-0 mt-0.5" />,
  "asset.ci_linked":            <Database className="h-3 w-3 text-purple-500 shrink-0 mt-0.5" />,
  "asset.ci_unlinked":          <Database className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5" />,
  "asset.relationship_added":   <GitMerge className="h-3 w-3 text-indigo-500 shrink-0 mt-0.5" />,
  "asset.relationship_removed": <GitMerge className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5" />,
  "asset.linked_to_incident":   <AlertTriangle className="h-3 w-3 text-destructive shrink-0 mt-0.5" />,
  "asset.linked_to_problem":    <AlertCircle   className="h-3 w-3 text-orange-500 shrink-0 mt-0.5" />,
  "asset.linked_to_change":     <Wrench        className="h-3 w-3 text-amber-500 shrink-0 mt-0.5" />,
  "asset.linked_to_request":    <Layers        className="h-3 w-3 text-sky-500 shrink-0 mt-0.5" />,
  "asset.linked_to_ticket":     <Ticket        className="h-3 w-3 text-violet-500 shrink-0 mt-0.5" />,
  "asset.unlinked_from_ticket": <Ticket        className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5" />,
  "asset.discovery_sync":       <RotateCcw     className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5" />,
  "asset.discovered":           <Server        className="h-3 w-3 text-emerald-500 shrink-0 mt-0.5" />,
};

const EVENT_LABEL: Record<string, (m: Record<string, unknown>) => string> = {
  "asset.created":              (m) => `Registered as ${ASSET_TYPE_LABEL[m.type as string] ?? m.type}`,
  "asset.updated":              (m) => `Updated ${(m.fields as string[] | undefined)?.join(", ") ?? "fields"}`,
  "asset.lifecycle_transition": (m) => `Status: ${ASSET_STATUS_LABEL[m.from as AssetStatus] ?? m.from} → ${ASSET_STATUS_LABEL[m.to as AssetStatus] ?? m.to}${m.reason ? ` — ${m.reason}` : ""}`,
  "asset.assigned":             (m) => `Assigned to ${m.name ?? m.to}${m.note ? ` — "${m.note}"` : ""}`,
  "asset.unassigned":           ()  => "Returned / unassigned",
  "asset.ci_linked":            (m) => `Linked to CI ${m.ciNumber} (${m.ciName})`,
  "asset.ci_unlinked":          ()  => "Unlinked from CI",
  "asset.relationship_added":   (m) => `Relationship added: ${m.label ?? m.type} → ${m.toAssetName}`,
  "asset.relationship_removed": ()  => "Relationship removed",
  "asset.linked_to_incident":   (m) => `Linked to incident — ${m.title ?? `#${m.incidentId}`}`,
  "asset.linked_to_problem":    (m) => `Linked to problem — ${m.title ?? `#${m.problemId}`}`,
  "asset.linked_to_change":     (m) => `Linked to change — ${m.title ?? `#${m.changeId}`}`,
  "asset.linked_to_request":    (m) => `Linked to request — ${m.title ?? `#${m.requestId}`}`,
  "asset.linked_to_ticket":     (m) => `Linked to ticket ${m.ticketNumber ?? `#${m.ticketId}`} — ${m.title ?? ""}`,
  "asset.unlinked_from_ticket": (m) => `Unlinked from ticket #${m.ticketId}`,
  "asset.discovery_sync":       (m) => `Discovery sync from ${m.source} (${m.policy})`,
  "asset.discovered":           (m) => `Discovered via ${m.source}`,
  "asset.received":             (m) => `Received into ${m.toLocation}${m.reference ? ` — ref ${m.reference}` : ""}`,
  "asset.transferred":          (m) => `Moved from ${m.from} to ${m.to}`,
  "asset.issued":               (m) => `Issued to ${m.name}`,
  "asset.returned":             (m) => `Returned${m.from ? ` by ${m.from}` : ""} to ${m.toLocation}`,
  "asset.sent_to_repair":       (m) => `Sent to repair${m.to ? ` — ${m.to}` : ""}${m.reference ? ` (ref ${m.reference})` : ""}`,
  "asset.repair_complete":      (m) => `Repair complete — back in ${m.toLocation}`,
};

// ── Layout primitives ─────────────────────────────────────────────────────────

function Section({
  icon: Icon, title, action, children, className = "",
}: {
  icon?: React.ElementType; title: string; action?: React.ReactNode;
  children: React.ReactNode; className?: string;
}) {
  return (
    <div className={`rounded-lg border border-border/60 bg-card overflow-hidden ${className}`}>
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-border/40 bg-muted/20">
        <div className="flex items-center gap-2">
          {Icon && <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
          <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70 select-none">
            {title}
          </span>
        </div>
        {action && <div className="flex items-center gap-1.5 shrink-0">{action}</div>}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function InfoRow({ label, children, mono = false }: {
  label: string; children: React.ReactNode; mono?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5 border-b border-border/30 last:border-0">
      <span className="text-[11px] text-muted-foreground shrink-0 min-w-[7.5rem] pt-0.5">{label}</span>
      <span className={`text-sm text-right leading-snug ${mono ? "font-mono text-xs" : "font-medium"}`}>
        {children}
      </span>
    </div>
  );
}

function Dash() { return <span className="text-muted-foreground">—</span>; }

function StatusPill({ status }: { status: AssetStatus }) {
  const p = STATUS_PALETTE[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[11px] font-semibold ${p.pill}`}>
      <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${p.dot}`} />
      {ASSET_STATUS_LABEL[status]}
    </span>
  );
}

// ── Inline editable field ─────────────────────────────────────────────────────

function EditField({
  label, value, placeholder, onSave, multiline = false, type = "text",
}: {
  label: string; value: string | null | undefined; placeholder?: string;
  onSave: (val: string | null) => void; multiline?: boolean; type?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState(value ?? "");

  function handleSave() { onSave(draft.trim() || null); setEditing(false); }

  if (editing) {
    return (
      <div className="space-y-1.5">
        {multiline
          ? <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={3}
              className="text-sm" placeholder={placeholder} autoFocus />
          : <Input type={type} value={draft} onChange={(e) => setDraft(e.target.value)}
              className="h-7 text-sm" placeholder={placeholder} autoFocus
              onKeyDown={(e) => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") setEditing(false); }} />
        }
        <div className="flex gap-1.5">
          <Button size="sm" className="h-6 text-xs px-2" onClick={handleSave}>
            <Save className="h-3 w-3 mr-1" />Save
          </Button>
          <Button size="sm" variant="ghost" className="h-6 text-xs px-2"
            onClick={() => { setEditing(false); setDraft(value ?? ""); }}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="group flex items-start justify-between gap-4 py-1.5 border-b border-border/30 last:border-0">
      <span className="text-[11px] text-muted-foreground shrink-0 min-w-[7.5rem] pt-0.5">{label}</span>
      <div className="flex items-start gap-1.5 min-w-0 flex-1 justify-end">
        <span className={`text-sm text-right leading-snug break-all ${!value ? "text-muted-foreground italic font-normal" : "font-medium"}`}>
          {value ?? "—"}
        </span>
        <button onClick={() => { setDraft(value ?? ""); setEditing(true); }}
          className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-opacity shrink-0 mt-0.5">
          <Pencil className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

// ── Lifecycle stepper ─────────────────────────────────────────────────────────

function LifecycleStepper({ status }: { status: AssetStatus }) {
  const isOffPath  = status === "lost_stolen" || status === "in_repair";
  const currentIdx = STEPPER_STATES.indexOf(status);
  const palette    = STATUS_PALETTE[status];

  if (isOffPath) {
    return (
      <div className="flex items-center gap-2 px-4 py-2 text-xs">
        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[11px] font-semibold ${palette.pill}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${palette.dot}`} />
          {ASSET_STATUS_LABEL[status]}
        </span>
        <span className="text-muted-foreground">— off lifecycle path</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-0 px-4 py-2 overflow-x-auto">
      {STEPPER_STATES.map((s, i) => {
        const p       = STATUS_PALETTE[s];
        const done    = i < currentIdx;
        const current = i === currentIdx;
        const future  = i > currentIdx;

        return (
          <div key={s} className="flex items-center">
            <div className="flex flex-col items-center gap-0.5 min-w-[60px]">
              <div className={[
                "h-2 w-2 rounded-full border-2 transition-all",
                current ? `${p.dot} border-transparent scale-125` : "",
                done    ? `${p.dot} border-transparent opacity-60` : "",
                future  ? "bg-background border-border/40" : "",
              ].join(" ")} />
              <span className={[
                "text-[9px] font-semibold text-center leading-none whitespace-nowrap mt-0.5",
                current ? `text-foreground` : "text-muted-foreground/50",
              ].join(" ")}>
                {ASSET_STATUS_LABEL[s]}
              </span>
            </div>
            {i < STEPPER_STATES.length - 1 && (
              <div className={[
                "h-px w-6 shrink-0 -mt-3",
                i < currentIdx ? `${p.bar} opacity-50` : "bg-border/30",
              ].join(" ")} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Warranty indicator ────────────────────────────────────────────────────────

function WarrantyBadge({ expiry }: { expiry: string | null | undefined }) {
  if (!expiry) return null;
  const days = Math.ceil((new Date(expiry).getTime() - Date.now()) / 86_400_000);
  if (days < 0)   return <span className="inline-flex items-center gap-1 text-[11px] text-destructive font-medium"><AlertTriangle className="h-3 w-3" />Expired</span>;
  if (days <= 90) return <span className="inline-flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400 font-medium"><AlertTriangle className="h-3 w-3" />Expires {days}d</span>;
  return null;
}

// ── Linked entity row ─────────────────────────────────────────────────────────

const STATUS_DOT: Record<string, string> = {
  open: "bg-rose-500", in_progress: "bg-blue-500", resolved: "bg-emerald-500",
  closed: "bg-muted-foreground/40", pending: "bg-amber-500", cancelled: "bg-muted-foreground/40",
  draft: "bg-slate-400", submitted: "bg-sky-500", authorize: "bg-violet-500",
  scheduled: "bg-indigo-500", implement: "bg-blue-600", review: "bg-teal-500",
  failed: "bg-destructive", new: "bg-sky-400", investigating: "bg-orange-500",
  identified: "bg-amber-500", known_error: "bg-destructive/70",
};

function EntityRow({
  number, title, status, href, linkedAt, onUnlink, isPending,
}: {
  number: string; title: string; status: string; href: string;
  linkedAt?: string; onUnlink?: () => void; isPending?: boolean;
}) {
  return (
    <div className="flex items-center gap-2.5 py-2 border-b border-border/30 last:border-0 group">
      <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${STATUS_DOT[status] ?? "bg-muted-foreground/40"}`} />
      <Link to={href} className="flex items-center gap-2 flex-1 min-w-0 hover:text-primary transition-colors">
        <span className="font-mono text-[11px] text-muted-foreground/70 shrink-0 tabular-nums">{number}</span>
        <span className="text-sm font-medium truncate">{title}</span>
      </Link>
      <span className="text-[11px] text-muted-foreground/60 shrink-0 capitalize hidden sm:block">
        {status.replace(/_/g, " ")}
      </span>
      {linkedAt && (
        <span className="text-[10px] text-muted-foreground/40 shrink-0 hidden lg:block tabular-nums">
          {new Date(linkedAt).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" })}
        </span>
      )}
      {onUnlink && (
        <button
          onClick={onUnlink}
          disabled={isPending}
          title="Remove link"
          className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all shrink-0 disabled:opacity-30"
        >
          <Unlink className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

// ── Link entity dialog ────────────────────────────────────────────────────────

type LinkTarget = "incidents" | "requests" | "problems" | "changes" | "services" | "cis" | "tickets";

interface SearchResult {
  id: number;
  number: string;
  title:  string;
  status: string;
}

interface LinkEntityConfig {
  label:      string;
  icon:       React.ElementType;
  iconColor:  string;
  search:     (q: string) => Promise<SearchResult[]>;
  linkPath:   (assetId: number, entityId: number) => { url: string; method: "post" | "put"; body?: object };
  alreadyLinked: (asset: AssetDetail) => number[];
}

function buildConfig(asset: AssetDetail): Record<LinkTarget, LinkEntityConfig> {
  return {
    incidents: {
      label: "Incident", icon: AlertTriangle, iconColor: "text-rose-500",
      search: async (q) => {
        const { data } = await axios.get<{ incidents: { id: number; incidentNumber: string; title: string; status: string }[] }>(
          "/api/incidents", { params: { search: q, pageSize: 15, status: "" } },
        );
        return data.incidents.map(i => ({ id: i.id, number: i.incidentNumber, title: i.title, status: i.status }));
      },
      linkPath: (assetId, entityId) => ({ url: `/api/assets/${assetId}/links/incidents/${entityId}`, method: "post" }),
      alreadyLinked: (a) => (a.incidents ?? []).map(i => i.id),
    },
    requests: {
      label: "Request", icon: Layers, iconColor: "text-sky-500",
      search: async (q) => {
        const { data } = await axios.get<{ requests: { id: number; requestNumber: string; title: string; status: string }[] }>(
          "/api/requests", { params: { search: q, pageSize: 15, status: "" } },
        );
        return data.requests.map(r => ({ id: r.id, number: r.requestNumber, title: r.title, status: r.status }));
      },
      linkPath: (assetId, entityId) => ({ url: `/api/assets/${assetId}/links/requests/${entityId}`, method: "post" }),
      alreadyLinked: (a) => (a.requests  ?? []).map(r => r.id),
    },
    problems: {
      label: "Problem", icon: AlertCircle, iconColor: "text-orange-500",
      search: async (q) => {
        const { data } = await axios.get<{ problems: { id: number; problemNumber: string; title: string; status: string }[] }>(
          "/api/problems", { params: { search: q, pageSize: 15, status: "" } },
        );
        return data.problems.map(p => ({ id: p.id, number: p.problemNumber, title: p.title, status: p.status }));
      },
      linkPath: (assetId, entityId) => ({ url: `/api/assets/${assetId}/links/problems/${entityId}`, method: "post" }),
      alreadyLinked: (a) => (a.problems ?? []).map(p => p.id),
    },
    changes: {
      label: "Change", icon: Wrench, iconColor: "text-amber-500",
      search: async (q) => {
        const { data } = await axios.get<{ changes: { id: number; changeNumber: string; title: string; state: string }[] }>(
          "/api/changes", { params: { search: q, pageSize: 15, state: "" } },
        );
        return data.changes.map(c => ({ id: c.id, number: c.changeNumber, title: c.title, status: c.state }));
      },
      linkPath: (assetId, entityId) => ({ url: `/api/assets/${assetId}/links/changes/${entityId}`, method: "post" }),
      alreadyLinked: (a) => (a.changes ?? []).map(c => c.id),
    },
    services: {
      label: "Service", icon: CheckCircle2, iconColor: "text-teal-500",
      search: async (q) => {
        const { data } = await axios.get<{ items: { id: number; name: string }[] }>(
          "/api/catalog", { params: { search: q, pageSize: 15 } },
        );
        return data.items.map(s => ({ id: s.id, number: `CAT-${s.id}`, title: s.name, status: "active" }));
      },
      linkPath: (assetId, entityId) => ({ url: `/api/assets/${assetId}/links/services/${entityId}`, method: "post" }),
      alreadyLinked: (a) => (a.services ?? []).map(s => s.id),
    },
    cis: {
      label: "Config Item", icon: Database, iconColor: "text-purple-500",
      search: async (q) => {
        const { data } = await axios.get<{ items: { id: number; ciNumber: string; name: string; status: string }[] }>(
          "/api/cmdb", { params: { search: q, pageSize: 10, status: "" } },
        );
        return data.items.map(c => ({ id: c.id, number: c.ciNumber, title: c.name, status: c.status }));
      },
      linkPath: (assetId, entityId) => ({
        url: `/api/assets/${assetId}/ci-link`,
        method: "put",
        body: { ciId: entityId },
      }),
      alreadyLinked: (a) => (a.ci ? [a.ci.id] : []),
    },
    tickets: {
      label: "Ticket", icon: Ticket, iconColor: "text-violet-500",
      search: async (q) => {
        const { data } = await axios.get<{ tickets: { id: number; ticketNumber: string; subject: string; status: string }[] }>(
          "/api/tickets", { params: { search: q, pageSize: 15 } },
        );
        return data.tickets.map(t => ({ id: t.id, number: t.ticketNumber, title: t.subject, status: t.status }));
      },
      linkPath: (assetId, entityId) => ({ url: `/api/assets/${assetId}/links/tickets/${entityId}`, method: "post" }),
      alreadyLinked: (a) => (a.tickets ?? []).map(t => t.id),
    },
  };
}

function LinkEntityDialog({
  asset, target, onDone, onClose,
}: {
  asset: AssetDetail; target: LinkTarget; onDone: () => void; onClose: () => void;
}) {
  const [query,   setQuery]   = useState("");
  const [linked,  setLinked]  = useState<Set<number>>(new Set());
  const [linking, setLinking] = useState<number | null>(null);

  const config       = buildConfig(asset)[target];
  const alreadyLinkedIds = new Set([...config.alreadyLinked(asset), ...linked]);

  const { data: results = [], isFetching } = useQuery<SearchResult[]>({
    queryKey: ["link-search", target, query],
    queryFn:  () => config.search(query),
    staleTime: 10_000,
  });

  async function handleLink(entityId: number) {
    setLinking(entityId);
    try {
      const { url, method, body } = config.linkPath(asset.id, entityId);
      if (method === "put") await axios.put(url, body);
      else                  await axios.post(url, body);
      setLinked(prev => new Set(prev).add(entityId));
      onDone();
    } finally {
      setLinking(null);
    }
  }

  const Icon = config.icon;

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon className={`h-4 w-4 ${config.iconColor}`} />
            Link {config.label} to {asset.name}
          </DialogTitle>
        </DialogHeader>

        {/* Search */}
        <div className="relative">
          <input
            autoFocus
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={`Search ${config.label.toLowerCase()}s…`}
            className="w-full h-9 rounded-md border border-input bg-background px-3 pr-8 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          {isFetching && (
            <span className="absolute right-2.5 top-2.5 h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          )}
        </div>

        {/* Results */}
        <div className="max-h-72 overflow-y-auto divide-y divide-border/40 rounded-md border border-border/60 bg-muted/10">
          {results.length === 0 && !isFetching && (
            <div className="py-8 text-center text-sm text-muted-foreground">
              {query ? `No ${config.label.toLowerCase()}s found for "${query}"` : `Type to search ${config.label.toLowerCase()}s`}
            </div>
          )}
          {results.map(item => {
            const isLinked  = alreadyLinkedIds.has(item.id);
            const isPending = linking === item.id;
            return (
              <div key={item.id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/40 transition-colors">
                <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${STATUS_DOT[item.status] ?? "bg-muted-foreground/40"}`} />
                <span className="font-mono text-[11px] text-muted-foreground/70 shrink-0">{item.number}</span>
                <span className="flex-1 min-w-0 text-sm font-medium truncate">{item.title}</span>
                <span className="text-[11px] text-muted-foreground/60 shrink-0 capitalize hidden sm:block">
                  {item.status.replace(/_/g, " ")}
                </span>
                {isLinked ? (
                  <span className="flex items-center gap-1 text-[11px] text-emerald-600 font-medium shrink-0">
                    <CheckCircle2 className="h-3 w-3" /> Linked
                  </span>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 px-2 text-[11px] shrink-0"
                    disabled={isPending}
                    onClick={() => handleLink(item.id)}
                  >
                    {isPending ? <span className="h-3 w-3 animate-spin rounded-full border border-primary border-t-transparent" /> : <><Plus className="h-3 w-3 mr-1" />Link</>}
                  </Button>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex justify-between items-center text-xs text-muted-foreground">
          <span>{linked.size > 0 ? `${linked.size} link${linked.size > 1 ? "s" : ""} added this session` : "Select items above to link them"}</span>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onClose}>Done</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Assign dialog ─────────────────────────────────────────────────────────────

function AssignDialog({ assetId, onDone, onClose }: { assetId: number; onDone: () => void; onClose: () => void }) {
  const { data } = useQuery({
    queryKey: ["agents"],
    queryFn: async () => {
      const { data } = await axios.get<{ agents: Array<{ id: string; name: string }> }>("/api/agents");
      return data;
    },
  });
  const { register, handleSubmit, control, formState: { errors } } = useForm<AssignAssetInput>({
    resolver: zodResolver(assignAssetSchema),
  });
  const mut = useMutation({
    mutationFn: (d: AssignAssetInput) => axios.post(`/api/assets/${assetId}/assign`, d),
    onSuccess: () => { onDone(); onClose(); },
  });
  return (
    <form onSubmit={handleSubmit((d) => mut.mutate(d))} className="space-y-4 py-2">
      {mut.error && <ErrorAlert error={mut.error} fallback="Failed to assign" />}
      <div className="space-y-1.5">
        <Label>Assign to <span className="text-destructive">*</span></Label>
        <Controller name="userId" control={control} render={({ field }) => (
          <Select value={field.value ?? ""} onValueChange={field.onChange}>
            <SelectTrigger><SelectValue placeholder="Select user…" /></SelectTrigger>
            <SelectContent>{data?.agents.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
          </Select>
        )} />
        {errors.userId && <ErrorMessage message={errors.userId.message} />}
      </div>
      <div className="space-y-1.5">
        <Label>Note <span className="text-muted-foreground font-normal">(optional)</span></Label>
        <Input {...register("note")} placeholder="Reason for assignment…" />
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={mut.isPending}>{mut.isPending ? "Assigning…" : "Assign"}</Button>
      </DialogFooter>
    </form>
  );
}

// ── Lifecycle transition dialog ───────────────────────────────────────────────

function TransitionDialog({
  assetId, currentStatus, onDone, onClose,
}: { assetId: number; currentStatus: AssetStatus; onDone: () => void; onClose: () => void }) {
  const validNext = LIFECYCLE_TRANSITIONS[currentStatus] ?? [];
  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<LifecycleTransitionInput>({
    resolver: zodResolver(lifecycleTransitionSchema),
    defaultValues: { status: validNext[0] },
  });
  const mut = useMutation({
    mutationFn: (d: LifecycleTransitionInput) => axios.post(`/api/assets/${assetId}/lifecycle`, d),
    onSuccess: () => { onDone(); onClose(); },
  });
  const selected = watch("status");
  return (
    <form onSubmit={handleSubmit((d) => mut.mutate(d))} className="space-y-4 py-2">
      {mut.error && <ErrorAlert error={mut.error} fallback="Failed to transition" />}
      <div className="space-y-2">
        <Label>New status <span className="text-destructive">*</span></Label>
        <div className="grid grid-cols-2 gap-2">
          {validNext.map((s) => {
            const p = STATUS_PALETTE[s as AssetStatus];
            const active = selected === s;
            return (
              <button key={s} type="button" onClick={() => setValue("status", s as AssetStatus)}
                className={[
                  "flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-all",
                  active ? "border-primary bg-primary/5 font-medium" : "border-border/60 hover:border-border",
                ].join(" ")}>
                <span className={`h-2 w-2 rounded-full shrink-0 ${p.dot}`} />
                {ASSET_STATUS_LABEL[s as AssetStatus]}
              </button>
            );
          })}
        </div>
        {errors.status && <ErrorMessage message={errors.status.message} />}
      </div>
      <div className="space-y-1.5">
        <Label>Reason <span className="text-muted-foreground font-normal">(optional)</span></Label>
        <Input {...register("reason")} placeholder="Why is this asset changing status?" />
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={mut.isPending || !selected}>
          {mut.isPending ? "Transitioning…" : "Apply"}
        </Button>
      </DialogFooter>
    </form>
  );
}

// ── Add relationship dialog ───────────────────────────────────────────────────

function AddRelationshipDialog({
  assetId, onDone, onClose,
}: { assetId: number; onDone: () => void; onClose: () => void }) {
  const [search, setSearch] = useState("");
  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<AddAssetRelationshipInput>({
    resolver: zodResolver(addAssetRelationshipSchema),
    defaultValues: { type: "depends_on" as AssetRelationshipType },
  });
  const { data: results } = useQuery({
    queryKey: ["asset-search", search],
    queryFn: async () => {
      const { data } = await axios.get<{ items: Array<{ id: number; assetNumber: string; name: string; type: string }> }>(
        "/api/assets", { params: { search, pageSize: 8 } }
      );
      return data.items.filter((a) => a.id !== assetId);
    },
    enabled: search.length >= 1,
  });
  const mut = useMutation({
    mutationFn: (d: AddAssetRelationshipInput) => axios.post(`/api/assets/${assetId}/relationships`, d),
    onSuccess: () => { onDone(); onClose(); },
  });
  const selectedId = watch("toAssetId");
  return (
    <form onSubmit={handleSubmit((d) => mut.mutate(d))} className="space-y-4 py-2">
      {mut.error && <ErrorAlert error={mut.error} fallback="Failed to add relationship" />}
      <div className="space-y-1.5">
        <Label>Relationship type <span className="text-destructive">*</span></Label>
        <Select defaultValue="depends_on" onValueChange={(v) => setValue("type", v as AssetRelationshipType)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {ASSET_RELATIONSHIP_TYPES.map((t) => <SelectItem key={t} value={t}>{ASSET_RELATIONSHIP_LABEL[t]}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Target asset <span className="text-destructive">*</span></Label>
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search assets…" />
        {search.length >= 1 && results && (
          <div className="rounded border divide-y max-h-40 overflow-y-auto">
            {results.length === 0
              ? <p className="px-3 py-2 text-xs text-muted-foreground">No assets found</p>
              : results.map((a) => (
                <label key={a.id}
                  className={`flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-muted/50 ${selectedId === a.id ? "bg-muted/60" : ""}`}>
                  <input type="radio" {...register("toAssetId", { valueAsNumber: true })} value={a.id} className="accent-primary" />
                  <span className="font-medium">{a.name}</span>
                  <span className="font-mono text-[10px] text-muted-foreground ml-auto">{a.assetNumber}</span>
                </label>
              ))}
          </div>
        )}
        {errors.toAssetId && <ErrorMessage message={errors.toAssetId.message} />}
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={mut.isPending}>{mut.isPending ? "Adding…" : "Add relationship"}</Button>
      </DialogFooter>
    </form>
  );
}

// ── Link CI dialog ────────────────────────────────────────────────────────────

function LinkCiDialog({ assetId, onDone, onClose }: { assetId: number; onDone: () => void; onClose: () => void }) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<number | null>(null);
  const { data: results } = useQuery({
    queryKey: ["cmdb-search", search],
    queryFn: async () => {
      const { data } = await axios.get<{ items: Array<{ id: number; ciNumber: string; name: string }> }>(
        "/api/cmdb", { params: { search, pageSize: 8, status: "" } }
      );
      return data.items;
    },
    enabled: search.length >= 1,
  });
  const mut = useMutation({
    mutationFn: () => axios.put(`/api/assets/${assetId}/ci-link`, { ciId: selected }),
    onSuccess: () => { onDone(); onClose(); },
  });
  return (
    <div className="space-y-4 py-2">
      {mut.error && <ErrorAlert error={mut.error} fallback="Failed to link CI" />}
      <div className="space-y-1.5">
        <Label>Search configuration items</Label>
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Type to search…" autoFocus />
      </div>
      {search.length >= 1 && results && (
        <div className="rounded border divide-y max-h-44 overflow-y-auto">
          {results.length === 0 ? <p className="px-3 py-2 text-xs text-muted-foreground">No CIs found</p>
            : results.map((ci) => (
              <label key={ci.id}
                className={`flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-muted/50 ${selected === ci.id ? "bg-muted/60" : ""}`}>
                <input type="radio" name="ci" value={ci.id} checked={selected === ci.id} onChange={() => setSelected(ci.id)} className="accent-primary" />
                <span className="font-medium">{ci.name}</span>
                <span className="font-mono text-[10px] text-muted-foreground ml-auto">{ci.ciNumber}</span>
              </label>
            ))}
        </div>
      )}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button disabled={selected === null || mut.isPending} onClick={() => mut.mutate()}>
          {mut.isPending ? "Linking…" : "Link CI"}
        </Button>
      </DialogFooter>
    </div>
  );
}

// ── Movement dialog ───────────────────────────────────────────────────────────

type WorkflowType = "receive" | "transfer" | "issue" | "return" | "send_repair" | "complete_repair";

const WORKFLOW_META: Record<WorkflowType, { label: string; description: string; icon: React.ReactNode }> = {
  receive:         { label: "Receive",          description: "Asset arrives from vendor/supplier",  icon: <Truck          className="h-4 w-4" /> },
  transfer:        { label: "Transfer",         description: "Move between internal locations",      icon: <Truck          className="h-4 w-4" /> },
  issue:           { label: "Issue to User",    description: "Assign and deploy to a user",          icon: <UserCheck      className="h-4 w-4" /> },
  return:          { label: "Return",           description: "User returns asset to stockroom",       icon: <CornerDownLeft className="h-4 w-4" /> },
  send_repair:     { label: "Send to Repair",   description: "Dispatch for maintenance or repair",   icon: <Wrench         className="h-4 w-4" /> },
  complete_repair: { label: "Complete Repair",  description: "Asset back from repair, into stock",   icon: <CheckCircle2   className="h-4 w-4" /> },
};

function MovementDialog({
  assetId,
  assetStatus,
  initialWorkflow,
  onDone,
  onClose,
}: {
  assetId: number;
  assetStatus: AssetStatus;
  initialWorkflow?: WorkflowType;
  onDone: () => void;
  onClose: () => void;
}) {
  const [workflow, setWorkflow] = useState<WorkflowType>(initialWorkflow ?? "receive");

  // Determine which workflows are valid given the current status
  const validWorkflows: WorkflowType[] = (() => {
    const all: WorkflowType[] = ["receive", "transfer", "issue", "return", "send_repair", "complete_repair"];
    return all.filter(w => {
      if (w === "receive")         return ["ordered", "in_stock"].includes(assetStatus);
      if (w === "transfer")        return true; // always useful
      if (w === "issue")           return ["in_stock", "deployed", "in_use"].includes(assetStatus);
      if (w === "return")          return ["deployed", "in_use"].includes(assetStatus);
      if (w === "send_repair")     return !["retired", "disposed", "lost_stolen"].includes(assetStatus);
      if (w === "complete_repair") return ["under_maintenance", "in_repair"].includes(assetStatus);
      return false;
    });
  })();

  const { data: agents } = useQuery({
    queryKey: ["agents"],
    queryFn: async () => (await axios.get<{ agents: Array<{ id: string; name: string }> }>("/api/agents")).data.agents,
  });

  const { data: locs } = useQuery({
    queryKey: ["inventory-locations"],
    queryFn: async () =>
      (await axios.get<{ locations: Array<{ id: number; name: string; code: string | null; locationType: string }> }>("/api/inventory-locations")).data.locations,
  });

  const mut = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const path =
        workflow === "receive"         ? "receive"         :
        workflow === "transfer"        ? "transfer"        :
        workflow === "issue"           ? "issue"           :
        workflow === "return"          ? "return"          :
        workflow === "send_repair"     ? "send-repair"     :
                                        "complete-repair";
      await axios.post(`/api/assets/${assetId}/${path}`, body);
    },
    onSuccess: () => { onDone(); onClose(); },
  });

  return (
    <div className="space-y-4 py-1">
      {/* Workflow selector */}
      <div>
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Action</p>
        <div className="grid grid-cols-2 gap-1.5">
          {validWorkflows.map(w => {
            const meta = WORKFLOW_META[w];
            const active = workflow === w;
            return (
              <button
                key={w} type="button" onClick={() => setWorkflow(w)}
                className={[
                  "flex items-start gap-2 rounded-md border px-3 py-2 text-left text-sm transition-all",
                  active ? "border-primary bg-primary/5 font-medium" : "border-border/60 hover:border-border",
                ].join(" ")}
              >
                <span className={`mt-0.5 shrink-0 ${active ? "text-primary" : "text-muted-foreground"}`}>{meta.icon}</span>
                <div>
                  <p className="text-xs font-semibold leading-tight">{meta.label}</p>
                  <p className="text-[10px] text-muted-foreground leading-snug mt-0.5">{meta.description}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Workflow-specific form */}
      <div className="border-t border-border/40 pt-4">
        {mut.isError && <ErrorAlert error={mut.error} fallback="Operation failed" />}

        {(workflow === "receive") && (
          <ReceiveForm locs={locs ?? []} onSubmit={mut.mutate} isPending={mut.isPending} onCancel={onClose} />
        )}
        {(workflow === "transfer") && (
          <TransferForm locs={locs ?? []} onSubmit={mut.mutate} isPending={mut.isPending} onCancel={onClose} />
        )}
        {(workflow === "issue") && (
          <IssueForm agents={agents ?? []} onSubmit={mut.mutate} isPending={mut.isPending} onCancel={onClose} />
        )}
        {(workflow === "return") && (
          <ReturnForm locs={locs ?? []} onSubmit={mut.mutate} isPending={mut.isPending} onCancel={onClose} />
        )}
        {(workflow === "send_repair") && (
          <SendRepairForm locs={locs ?? []} onSubmit={mut.mutate} isPending={mut.isPending} onCancel={onClose} />
        )}
        {(workflow === "complete_repair") && (
          <TransferForm locs={locs ?? []} onSubmit={d => mut.mutate(d)} isPending={mut.isPending} onCancel={onClose} label="Complete Repair" />
        )}
      </div>
    </div>
  );
}

// ── Workflow sub-forms ────────────────────────────────────────────────────────

type LocOption = { id: number; name: string; code: string | null; locationType: string };
type AgentOption = { id: string; name: string };

function LocationSelect({
  locs, value, onChange, placeholder,
}: { locs: LocOption[]; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-8 text-sm"><SelectValue placeholder={placeholder ?? "Select location…"} /></SelectTrigger>
      <SelectContent>
        {locs.map(l => (
          <SelectItem key={l.id} value={String(l.id)} className="text-sm">
            {l.name}{l.code ? ` (${l.code})` : ""}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function FormFooter({ onCancel, isPending, label }: { onCancel: () => void; isPending: boolean; label?: string }) {
  return (
    <div className="flex justify-end gap-2 pt-2">
      <Button type="button" variant="outline" size="sm" onClick={onCancel}>Cancel</Button>
      <Button type="submit" size="sm" disabled={isPending}>{isPending ? "Saving…" : (label ?? "Apply")}</Button>
    </div>
  );
}

function ReceiveForm({ locs, onSubmit, isPending, onCancel }: { locs: LocOption[]; onSubmit: (d: any) => void; isPending: boolean; onCancel: () => void }) {
  const { register, handleSubmit, setValue, watch } = useForm<ReceiveAssetInput>({ resolver: zodResolver(receiveAssetSchema) });
  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
      <div className="space-y-1"><Label className="text-xs">Receive into stockroom <span className="text-destructive">*</span></Label>
        <LocationSelect locs={locs.filter(l => ["stockroom", "deployed_site"].includes(l.locationType))}
          value={watch("toLocationId") ? String(watch("toLocationId")) : ""}
          onChange={v => setValue("toLocationId", Number(v))} />
      </div>
      <div className="space-y-1"><Label className="text-xs">From (vendor / origin)</Label>
        <Input {...register("fromLabel")} placeholder="e.g. Vendor DHL, Return from HQ" className="h-8 text-sm" />
      </div>
      <div className="space-y-1"><Label className="text-xs">Reference</Label>
        <Input {...register("reference")} placeholder="PO#, delivery reference…" className="h-8 text-sm" />
      </div>
      <div className="space-y-1"><Label className="text-xs">Notes</Label>
        <Input {...register("notes")} placeholder="Optional note…" className="h-8 text-sm" />
      </div>
      <FormFooter onCancel={onCancel} isPending={isPending} label="Receive" />
    </form>
  );
}

function TransferForm({ locs, onSubmit, isPending, onCancel, label }: { locs: LocOption[]; onSubmit: (d: any) => void; isPending: boolean; onCancel: () => void; label?: string }) {
  const { register, handleSubmit, setValue, watch } = useForm<TransferAssetInput>({ resolver: zodResolver(transferAssetSchema) });
  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
      <div className="space-y-1"><Label className="text-xs">Move to <span className="text-destructive">*</span></Label>
        <LocationSelect locs={locs} value={watch("toLocationId") ? String(watch("toLocationId")) : ""}
          onChange={v => setValue("toLocationId", Number(v))} />
      </div>
      <div className="space-y-1"><Label className="text-xs">Notes</Label>
        <Input {...register("notes")} placeholder="Reason for move…" className="h-8 text-sm" />
      </div>
      <FormFooter onCancel={onCancel} isPending={isPending} label={label ?? "Transfer"} />
    </form>
  );
}

function IssueForm({ agents, onSubmit, isPending, onCancel }: { agents: AgentOption[]; onSubmit: (d: any) => void; isPending: boolean; onCancel: () => void }) {
  const { register, handleSubmit, setValue, watch } = useForm<IssueAssetInput>({
    resolver: zodResolver(issueAssetSchema),
    defaultValues: { newStatus: "deployed" },
  });
  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
      <div className="space-y-1"><Label className="text-xs">Issue to <span className="text-destructive">*</span></Label>
        <Select value={watch("userId") ?? ""} onValueChange={v => setValue("userId", v)}>
          <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select user…" /></SelectTrigger>
          <SelectContent>{agents.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="space-y-1"><Label className="text-xs">Deployment status</Label>
        <Select value={watch("newStatus")} onValueChange={v => setValue("newStatus", v as "deployed" | "in_use")}>
          <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="deployed">Deployed (corporate)</SelectItem>
            <SelectItem value="in_use">In Use (personal)</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1"><Label className="text-xs">Reference</Label>
        <Input {...register("reference")} placeholder="Request #, project…" className="h-8 text-sm" />
      </div>
      <div className="space-y-1"><Label className="text-xs">Notes</Label>
        <Input {...register("notes")} placeholder="Optional note…" className="h-8 text-sm" />
      </div>
      <FormFooter onCancel={onCancel} isPending={isPending} label="Issue" />
    </form>
  );
}

function ReturnForm({ locs, onSubmit, isPending, onCancel }: { locs: LocOption[]; onSubmit: (d: any) => void; isPending: boolean; onCancel: () => void }) {
  const { register, handleSubmit, setValue, watch } = useForm<ReturnAssetInput>({ resolver: zodResolver(returnAssetSchema) });
  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
      <div className="space-y-1"><Label className="text-xs">Return to stockroom <span className="text-destructive">*</span></Label>
        <LocationSelect locs={locs.filter(l => ["stockroom", "deployed_site"].includes(l.locationType))}
          value={watch("toLocationId") ? String(watch("toLocationId")) : ""}
          onChange={v => setValue("toLocationId", Number(v))} />
      </div>
      <div className="space-y-1"><Label className="text-xs">Notes</Label>
        <Input {...register("notes")} placeholder="Condition on return, reason…" className="h-8 text-sm" />
      </div>
      <FormFooter onCancel={onCancel} isPending={isPending} label="Record Return" />
    </form>
  );
}

function SendRepairForm({ locs, onSubmit, isPending, onCancel }: { locs: LocOption[]; onSubmit: (d: any) => void; isPending: boolean; onCancel: () => void }) {
  const { register, handleSubmit, setValue, watch } = useForm<SendRepairInput>({ resolver: zodResolver(sendRepairSchema) });
  const repairLocs = locs.filter(l => l.locationType === "repair_facility");
  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
      <div className="space-y-1"><Label className="text-xs">Repair facility {repairLocs.length === 0 ? "(or enter label below)" : ""}</Label>
        {repairLocs.length > 0 && (
          <LocationSelect locs={repairLocs}
            value={watch("toLocationId") ? String(watch("toLocationId")) : ""}
            onChange={v => setValue("toLocationId", Number(v))} placeholder="Select repair facility…" />
        )}
      </div>
      <div className="space-y-1"><Label className="text-xs">External repair vendor</Label>
        <Input {...register("toLabel")} placeholder="e.g. HP Service Center, Local IT shop" className="h-8 text-sm" />
      </div>
      <div className="space-y-1"><Label className="text-xs">Reference (RMA#, repair ticket)</Label>
        <Input {...register("reference")} placeholder="RMA-12345…" className="h-8 text-sm" />
      </div>
      <div className="space-y-1"><Label className="text-xs">Notes</Label>
        <Input {...register("notes")} placeholder="Fault description, urgency…" className="h-8 text-sm" />
      </div>
      <FormFooter onCancel={onCancel} isPending={isPending} label="Send to Repair" />
    </form>
  );
}

// ── Movement timeline row ─────────────────────────────────────────────────────

function MovementRow({ m }: { m: AssetMovementRecord }) {
  const fromText = m.fromLocation?.name ?? m.fromLabel ?? null;
  const toText   = m.toLocation?.name   ?? m.toLabel   ?? null;
  return (
    <div className="flex items-start gap-3 py-2 border-b border-border/25 last:border-0">
      <span className={`inline-flex items-center px-2 py-0.5 rounded border text-[10px] font-semibold whitespace-nowrap shrink-0 mt-0.5 ${MOVEMENT_TYPE_COLOR[m.movementType as AssetMovementType] ?? "bg-muted text-muted-foreground border-muted"}`}>
        {MOVEMENT_TYPE_LABEL[m.movementType as AssetMovementType] ?? m.movementType}
      </span>
      <div className="flex-1 min-w-0 space-y-0.5">
        <div className="flex items-center gap-1.5 flex-wrap text-xs">
          {fromText && <span className="text-muted-foreground">{fromText}</span>}
          {fromText && toText && <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />}
          {toText && <span className="font-medium">{toText}</span>}
          {m.statusBefore && m.statusAfter && m.statusBefore !== m.statusAfter && (
            <span className="text-[10px] text-muted-foreground ml-1">
              ({ASSET_STATUS_LABEL[m.statusBefore as AssetStatus] ?? m.statusBefore} → {ASSET_STATUS_LABEL[m.statusAfter as AssetStatus] ?? m.statusAfter})
            </span>
          )}
        </div>
        {m.reference && <p className="text-[10px] text-muted-foreground font-mono">ref: {m.reference}</p>}
        {m.notes && <p className="text-[10px] text-muted-foreground italic">"{m.notes}"</p>}
        <p className="text-[10px] text-muted-foreground/60">
          {m.performedBy.name} · {new Date(m.createdAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
        </p>
      </div>
    </div>
  );
}

// ── Depreciation panel ───────────────────────────────────────────────────────

function DepreciationPanel({
  dep, asset, onPatch,
}: {
  dep: DepreciationResult | null;
  asset: { depreciationMethod: string; usefulLifeYears: number | null; salvageValue: string | null; currency: string };
  onPatch: (d: any) => void;
}) {
  const fmtMoney = (n: number) =>
    new Intl.NumberFormat(undefined, { style: "currency", currency: asset.currency, minimumFractionDigits: 2 }).format(n);

  if (!dep) {
    return (
      <div className="space-y-0">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 mb-2">Setup</p>
        <div className="space-y-0">
          <Select value={asset.depreciationMethod} onValueChange={v => onPatch({ depreciationMethod: v })}>
            <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {DEPRECIATION_METHODS.map(m => <SelectItem key={m} value={m} className="text-xs">{DEPRECIATION_METHOD_LABEL[m]}</SelectItem>)}
            </SelectContent>
          </Select>
          {asset.depreciationMethod !== "none" && (
            <p className="text-xs text-muted-foreground mt-2 italic">
              Set purchase price, purchase date, and useful life years to see the depreciation schedule.
            </p>
          )}
        </div>
      </div>
    );
  }

  const pct = dep.depreciationPct;
  const barColor = dep.isFullyDepreciated
    ? "bg-red-400"
    : pct >= 75 ? "bg-amber-400"
    : pct >= 50 ? "bg-yellow-400"
    : "bg-emerald-400";

  return (
    <div className="space-y-4">
      {/* Book value gauge */}
      <div>
        <div className="flex items-end justify-between mb-1.5">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">Current Book Value</p>
            <p className={`text-2xl font-bold tabular-nums leading-none mt-0.5 ${dep.isFullyDepreciated ? "text-destructive" : "text-foreground"}`}>
              {fmtMoney(dep.bookValue)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-muted-foreground">Original cost</p>
            <p className="text-sm font-semibold tabular-nums">{fmtMoney(dep.acquisitionCost)}</p>
          </div>
        </div>

        {/* Progress bar: original → current → salvage */}
        <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${barColor}`}
            style={{ width: `${Math.max(1, pct)}%` }}
          />
        </div>
        <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
          <span>{pct.toFixed(1)}% depreciated</span>
          <span>Salvage: {fmtMoney(dep.salvageValue)}</span>
        </div>

        {dep.isFullyDepreciated && (
          <p className="text-[11px] text-destructive font-medium mt-1.5 flex items-center gap-1">
            <AlertTriangle className="h-3 w-3 shrink-0" />
            Fully depreciated — book value at salvage
          </p>
        )}
      </div>

      {/* Key metrics */}
      <div className="grid grid-cols-2 gap-0 border-t border-border/30 pt-3">
        {[
          { label: "Method",        value: DEPRECIATION_METHOD_LABEL[dep.method as any] ?? dep.method },
          { label: "Age",           value: `${dep.ageYears} yr` },
          { label: "Useful life",   value: `${dep.usefulLifeYears} yr` },
          { label: "Annual charge", value: fmtMoney(dep.annualCharge) },
          { label: "Accumulated",   value: fmtMoney(dep.accumulatedDepreciation) },
          { label: "Fully depleted",value: new Date(dep.fullyDepreciatedAt).toLocaleDateString(undefined, { dateStyle: "medium" }) },
        ].map(({ label, value }) => (
          <div key={label} className="py-1.5 border-b border-border/25 last:border-0 pr-2">
            <p className="text-[10px] text-muted-foreground">{label}</p>
            <p className="text-xs font-semibold">{value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Contracts section ─────────────────────────────────────────────────────────

function ContractsSection({
  contracts, assetId, onUnlinked,
}: { contracts: AssetContractSummary[]; assetId: number; onUnlinked: () => void }) {
  const qc = useQueryClient();

  const unlinkMut = useMutation({
    mutationFn: (contractId: number) =>
      axios.delete(`/api/contracts/${contractId}/link-asset/${assetId}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["asset"] }); onUnlinked(); },
  });

  if (contracts.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-4">
        <FileText className="h-7 w-7 text-muted-foreground/20" />
        <p className="text-xs text-muted-foreground">No contracts linked.</p>
      </div>
    );
  }

  return (
    <div className="space-y-0">
      {contracts.map(c => {
        const expired = c.daysUntilExpiry !== null && c.daysUntilExpiry < 0;
        const expiring = c.daysUntilExpiry !== null && c.daysUntilExpiry >= 0 && c.daysUntilExpiry <= 90;
        return (
          <div key={c.id} className="flex items-center gap-3 py-2 border-b border-border/25 last:border-0 group">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className={`inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] font-semibold ${CONTRACT_TYPE_COLOR[c.type]}`}>
                  {CONTRACT_TYPE_LABEL[c.type]}
                </span>
                <span className={`inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] font-semibold ${CONTRACT_STATUS_COLOR[c.status]}`}>
                  {CONTRACT_STATUS_LABEL[c.status]}
                </span>
              </div>
              <p className="text-sm font-medium mt-0.5 leading-tight">{c.title}</p>
              {c.vendor && <p className="text-[11px] text-muted-foreground">{c.vendor}</p>}
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                {c.endDate && (
                  <span className={`text-[11px] ${expired ? "text-destructive font-medium" : expiring ? "text-amber-600 dark:text-amber-400 font-medium" : "text-muted-foreground"}`}>
                    {expired ? "Expired" : "Expires"} {new Date(c.endDate).toLocaleDateString(undefined, { dateStyle: "medium" })}
                    {!expired && c.daysUntilExpiry !== null && c.daysUntilExpiry <= 90 && ` (${c.daysUntilExpiry}d)`}
                  </span>
                )}
                {c.supportLevel && (
                  <span className="text-[11px] text-muted-foreground">· {c.supportLevel}</span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Link to="/contracts" className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-primary transition-all">
                <ExternalLink className="h-3 w-3" />
              </Link>
              <button
                onClick={() => unlinkMut.mutate(c.id)}
                className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all"
                title="Unlink contract"
              >
                <Unlink className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Link contract dialog ──────────────────────────────────────────────────────

function LinkContractDialog({
  assetId, onDone, onClose,
}: { assetId: number; onDone: () => void; onClose: () => void }) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<number | null>(null);

  const { data } = useQuery({
    queryKey: ["contract-search", search],
    queryFn: async () =>
      (await axios.get<{ items: Array<{ id: number; contractNumber: string; title: string; type: string; vendor: string | null }> }>(
        "/api/contracts", { params: { search: search || undefined, pageSize: 10 } }
      )).data.items,
  });

  const mut = useMutation({
    mutationFn: () => axios.post(`/api/contracts/${selected}/link-asset`, { assetId }),
    onSuccess: () => { onDone(); onClose(); },
  });

  return (
    <div className="space-y-4 py-2">
      {mut.isError && <ErrorAlert error={mut.error} fallback="Failed to link contract" />}
      <div className="space-y-1.5">
        <Label>Search contracts</Label>
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Type to search…" autoFocus />
      </div>
      {data && data.length > 0 && (
        <div className="rounded border divide-y max-h-52 overflow-y-auto">
          {data.map(c => (
            <label key={c.id}
              className={`flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-muted/50 ${selected === c.id ? "bg-muted/60" : ""}`}>
              <input type="radio" name="contract" value={c.id} checked={selected === c.id}
                onChange={() => setSelected(c.id)} className="accent-primary" />
              <div className="min-w-0">
                <p className="font-medium truncate">{c.title}</p>
                <p className="text-[10px] text-muted-foreground">{c.contractNumber}{c.vendor ? ` · ${c.vendor}` : ""}</p>
              </div>
            </label>
          ))}
        </div>
      )}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button disabled={selected === null || mut.isPending} onClick={() => mut.mutate()}>
          {mut.isPending ? "Linking…" : "Link Contract"}
        </Button>
      </DialogFooter>
    </div>
  );
}

// ── Skeleton loading ──────────────────────────────────────────────────────────

function PageSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-7 w-64" />
          <Skeleton className="h-4 w-40" />
        </div>
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-8 w-24" />
      </div>
      <Skeleton className="h-10 w-full rounded-lg" />
      <div className="grid grid-cols-[1fr_280px] gap-5">
        <div className="space-y-4">
          <Skeleton className="h-32 w-full rounded-lg" />
          <Skeleton className="h-48 w-full rounded-lg" />
          <Skeleton className="h-40 w-full rounded-lg" />
        </div>
        <div className="space-y-3">
          <Skeleton className="h-40 w-full rounded-lg" />
          <Skeleton className="h-32 w-full rounded-lg" />
        </div>
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(iso: string | null | undefined, time = false) {
  if (!iso) return null;
  return new Date(iso).toLocaleString(undefined, time
    ? { dateStyle: "medium", timeStyle: "short" }
    : { dateStyle: "medium" });
}

function fmtPrice(price: string | null | undefined, currency: string) {
  if (!price) return null;
  const n = parseFloat(price);
  if (isNaN(n)) return price;
  return new Intl.NumberFormat(undefined, { style: "currency", currency, minimumFractionDigits: 2 }).format(n);
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AssetDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [assignOpen,      setAssignOpen]      = useState(false);
  const [transitionOpen,  setTransitionOpen]  = useState(false);
  const [addRelOpen,      setAddRelOpen]       = useState(false);
  const [linkCiOpen,      setLinkCiOpen]       = useState(false);
  const [movementOpen,    setMovementOpen]    = useState(false);
  const [movementWorkflow, setMovementWorkflow] = useState<WorkflowType | undefined>();
  const [linkContractOpen, setLinkContractOpen] = useState(false);
  const [deleteOpen,       setDeleteOpen]       = useState(false);

  const { data: asset, isLoading, error } = useQuery({
    queryKey: ["asset", id],
    queryFn: async () => {
      const { data } = await axios.get<AssetDetail>(`/api/assets/${id}`);
      return data;
    },
  });

  function refresh() { qc.invalidateQueries({ queryKey: ["asset", id] }); }

  const patchMut = useMutation({
    mutationFn: (p: UpdateAssetInput) => axios.patch(`/api/assets/${id}`, p),
    onSuccess: refresh,
  });
  const unassignMut = useMutation({
    mutationFn: () => axios.delete(`/api/assets/${id}/assign`),
    onSuccess: refresh,
  });
  const removeRelMut = useMutation({
    mutationFn: (relId: number) => axios.delete(`/api/assets/${id}/relationships/${relId}`),
    onSuccess: refresh,
  });
  const unlinkCiMut = useMutation({
    mutationFn: () => axios.delete(`/api/assets/${id}/ci-link`),
    onSuccess: refresh,
  });
  const unlinkEntityMut = useMutation({
    mutationFn: ({ entity, entityId }: { entity: string; entityId: number }) =>
      axios.delete(`/api/assets/${id}/links/${entity}/${entityId}`),
    onSuccess: refresh,
  });
  const deleteMut = useMutation({
    mutationFn: () => axios.delete(`/api/assets/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["assets"] });
      qc.invalidateQueries({ queryKey: ["assets-stats"] });
      qc.invalidateQueries({ queryKey: ["trash-summary"] });
      setDeleteOpen(false);
      navigate("/assets");
    },
  });

  const [linkTarget, setLinkTarget] = useState<LinkTarget | null>(null);

  function patch(d: UpdateAssetInput) { patchMut.mutate(d); }

  const totalLinked = asset
    ? (asset._counts.incidents + asset._counts.requests + asset._counts.problems + asset._counts.changes + asset._counts.tickets + (asset.services?.length ?? 0))
    : 0;

  return (
    <div className="space-y-5 pb-8">
      <BackLink to="/assets">Assets</BackLink>

      {isLoading && <PageSkeleton />}

      {error && (
        <ErrorAlert
          message={axios.isAxiosError(error) && error.response?.status === 404
            ? "Asset not found"
            : "Failed to load asset"}
        />
      )}

      {asset && (
        <>
          {/* ── Page header ── */}
          <div className="flex items-start gap-4">
            <div className="flex-1 min-w-0">
              <p className="font-mono text-[11px] font-semibold text-muted-foreground tracking-widest mb-0.5">
                {asset.assetNumber}
              </p>
              <h1 className="text-xl font-semibold tracking-tight leading-tight">
                {asset.name}
              </h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                {ASSET_TYPE_LABEL[asset.type]}
                {(asset.manufacturer || asset.model) && (
                  <> &middot; {[asset.manufacturer, asset.model].filter(Boolean).join(" ")}</>
                )}
                {asset.discoverySource && (
                  <> &middot; <span className="text-xs">via {asset.managedBy ?? asset.discoverySource}</span></>
                )}
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
              <StatusPill status={asset.status} />
              {asset.condition !== "new_item" && (
                <span className={`text-[11px] font-semibold ${CONDITION_PALETTE[asset.condition]}`}>
                  {ASSET_CONDITION_LABEL[asset.condition]}
                </span>
              )}
              <WarrantyBadge expiry={asset.warrantyExpiry} />

              {/* Actions */}
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5"
                onClick={() => setTransitionOpen(true)}>
                <RotateCcw className="h-3 w-3" />
                Transition
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5"
                onClick={() => { setMovementWorkflow(undefined); setMovementOpen(true); }}>
                <Truck className="h-3 w-3" />
                Movement
              </Button>
              <Button size="sm" className="h-7 text-xs gap-1.5"
                onClick={() => setAssignOpen(true)}>
                <User className="h-3 w-3" />
                {asset.assignedTo ? "Reassign" : "Assign"}
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outline" className="h-7 w-7 p-0">
                    <MoreHorizontal className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44 text-sm">
                  <DropdownMenuItem
                    disabled={asset.status === "deployed" || asset.status === "in_use"}
                    onClick={() => setDeleteOpen(true)}
                    className="text-destructive focus:text-destructive flex items-center gap-2"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Move to trash
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* ── Move-to-trash confirmation ── */}
          <AlertDialog open={deleteOpen} onOpenChange={open => { if (!open) { setDeleteOpen(false); deleteMut.reset(); } }}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Move {asset.name} to trash?</AlertDialogTitle>
                <AlertDialogDescription>
                  This asset will be moved to the trash. You can restore it from Settings → Trash within the configured retention window before it's permanently purged.
                </AlertDialogDescription>
              </AlertDialogHeader>
              {deleteMut.error && <ErrorAlert error={deleteMut.error} fallback="Failed to delete asset" />}
              <AlertDialogFooter>
                <AlertDialogCancel disabled={deleteMut.isPending}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  disabled={deleteMut.isPending}
                  onClick={e => { e.preventDefault(); deleteMut.mutate(); }}
                  className="bg-destructive text-white hover:bg-destructive/90"
                >
                  {deleteMut.isPending ? "Moving…" : "Move to trash"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* ── Lifecycle stepper ── */}
          <div className="rounded-lg border border-border/60 bg-card overflow-hidden">
            <LifecycleStepper status={asset.status} />
          </div>

          {patchMut.error && <ErrorAlert error={patchMut.error} fallback="Update failed" />}

          {/* ── Two-column body ── */}
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_272px] gap-5 items-start">

            {/* ── LEFT — main content ── */}
            <div className="space-y-4 min-w-0">

              {/* § Overview */}
              <Section icon={FileText} title="Overview">
                {asset.notes ? (
                  <div className="group flex items-start justify-between gap-2">
                    <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap flex-1">
                      {asset.notes}
                    </p>
                    <button
                      onClick={() => {
                        const next = window.prompt("Edit notes:", asset.notes ?? "");
                        if (next !== null) patch({ notes: next || null });
                      }}
                      className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-opacity shrink-0 mt-0.5">
                      <Pencil className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground italic">
                    No description.{" "}
                    <button className="underline hover:text-foreground transition-colors"
                      onClick={() => {
                        const next = window.prompt("Add notes:");
                        if (next) patch({ notes: next });
                      }}>Add one</button>
                  </p>
                )}
              </Section>

              {/* § Ownership & Assignment */}
              <Section icon={Users} title="Ownership & Assignment"
                action={
                  <div className="flex gap-1.5">
                    {asset.assignedTo && (
                      <Button size="sm" variant="ghost" className="h-6 text-xs text-muted-foreground"
                        disabled={unassignMut.isPending}
                        onClick={() => unassignMut.mutate()}>
                        Return
                      </Button>
                    )}
                    <Button size="sm" variant="outline" className="h-6 text-xs"
                      onClick={() => setAssignOpen(true)}>
                      {asset.assignedTo ? "Reassign" : "Assign"}
                    </Button>
                  </div>
                }>
                <div className="space-y-4">
                  {/* Current assignee */}
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 mb-2">
                      Current Assignment
                    </p>
                    {asset.assignedTo ? (
                      <div className="flex items-center gap-3">
                        <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center text-[11px] font-bold text-primary shrink-0">
                          {asset.assignedTo.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-semibold">{asset.assignedTo.name}</p>
                          {asset.assignedAt && (
                            <p className="text-[11px] text-muted-foreground">Since {fmt(asset.assignedAt)}</p>
                          )}
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground italic">Unassigned</p>
                    )}
                  </div>

                  {/* Owner / Team */}
                  <div className="grid grid-cols-2 gap-0 border-t border-border/30 pt-3">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 mb-1">Owner</p>
                      <p className="text-sm font-medium">{asset.owner?.name ?? <span className="text-muted-foreground italic">—</span>}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 mb-1">Team</p>
                      <p className="text-sm font-medium">{asset.team?.name ?? <span className="text-muted-foreground italic">—</span>}</p>
                    </div>
                  </div>

                  {/* Assignment history */}
                  {asset.assignments.length > 0 && (
                    <div className="border-t border-border/30 pt-3">
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 mb-2">
                        History
                      </p>
                      <div className="space-y-0">
                        {asset.assignments.map((a) => (
                          <div key={a.id}
                            className="flex items-start justify-between gap-3 py-1.5 border-b border-border/25 last:border-0">
                            <div className="min-w-0">
                              <p className="text-sm font-medium">{a.userName}</p>
                              {a.note && <p className="text-xs text-muted-foreground italic mt-0.5">"{a.note}"</p>}
                            </div>
                            <div className="text-right text-[11px] text-muted-foreground shrink-0">
                              <p>{fmt(a.assignedAt)}</p>
                              {a.unassignedAt
                                ? <p>{fmt(a.unassignedAt)}</p>
                                : <p className="text-emerald-600 dark:text-emerald-400 font-semibold">Current</p>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </Section>

              {/* § Lifecycle */}
              <Section icon={Zap} title="Lifecycle"
                action={
                  <Button size="sm" variant="outline" className="h-6 text-xs gap-1.5"
                    onClick={() => setTransitionOpen(true)}
                    disabled={(LIFECYCLE_TRANSITIONS[asset.status] ?? []).length === 0}>
                    <RotateCcw className="h-3 w-3" />
                    Transition
                  </Button>
                }>
                <div className="space-y-0">
                  <EditField label="Received"    value={fmt(asset.receivedAt)}   onSave={(v) => patch({ receivedAt: v })} />
                  <EditField label="Deployed"    value={fmt(asset.deployedAt)}   onSave={(v) => patch({ deployedAt: v })} />
                  <EditField label="End of Life" value={fmt(asset.endOfLifeAt)}  onSave={(v) => patch({ endOfLifeAt: v })} />
                  <EditField label="Retired"     value={fmt(asset.retiredAt)}    onSave={(v) => patch({ retiredAt: v })} />
                  {asset.lastDiscoveredAt && (
                    <InfoRow label="Last Discovered">
                      {fmt(asset.lastDiscoveredAt, true) ?? <Dash />}
                    </InfoRow>
                  )}
                </div>
              </Section>

              {/* § Movement History */}
              <Section
                icon={Truck}
                title="Movement History"
                action={
                  <Button size="sm" variant="outline" className="h-6 text-xs gap-1"
                    onClick={() => { setMovementWorkflow(undefined); setMovementOpen(true); }}>
                    <Plus className="h-3 w-3" />
                    Record
                  </Button>
                }
              >
                {(!asset.movements || asset.movements.length === 0) ? (
                  <div className="flex flex-col items-center gap-2 py-4">
                    <Truck className="h-7 w-7 text-muted-foreground/20" />
                    <p className="text-xs text-muted-foreground">No movements recorded yet.</p>
                    <button className="text-xs text-muted-foreground underline hover:text-foreground transition-colors"
                      onClick={() => { setMovementWorkflow(undefined); setMovementOpen(true); }}>
                      Record first movement
                    </button>
                  </div>
                ) : (
                  <div className="space-y-0">
                    {asset.movements.map(m => (
                      <MovementRow key={m.id} m={m} />
                    ))}
                  </div>
                )}
              </Section>

              {/* § Financial & Procurement */}
              <Section icon={DollarSign} title="Financial & Procurement">
                <div className="space-y-0">
                  {/* Procurement */}
                  <EditField label="Vendor"        value={asset.vendor}        onSave={(v) => patch({ vendor: v })} />
                  <EditField label="Purchase date"
                    value={fmt(asset.purchaseDate)}
                    onSave={(v) => patch({ purchaseDate: v })} />
                  <InfoRow label="Purchase price">
                    {fmtPrice(asset.purchasePrice, asset.currency) ?? <Dash />}
                  </InfoRow>
                  <EditField label="PO number"     value={asset.poNumber}      onSave={(v) => patch({ poNumber: v })} />
                  <EditField label="Invoice"       value={asset.invoiceNumber} onSave={(v) => patch({ invoiceNumber: v })} />
                  <div className="border-t border-border/25 pt-2 mt-1 space-y-0">
                    <EditField label="Warranty type"
                      value={asset.warrantyType}
                      onSave={(v) => patch({ warrantyType: v })} />
                    <div className="flex items-start justify-between gap-4 py-1.5">
                      <span className="text-[11px] text-muted-foreground shrink-0 min-w-[7.5rem] pt-0.5">Warranty expiry</span>
                      <div className="flex items-center gap-2 justify-end">
                        <span className="text-sm font-medium">{fmt(asset.warrantyExpiry) ?? "—"}</span>
                        <WarrantyBadge expiry={asset.warrantyExpiry} />
                      </div>
                    </div>
                  </div>
                </div>
              </Section>

              {/* § Depreciation */}
              {asset.depreciationMethod !== "none" && (
                <Section icon={TrendingDown} title="Depreciation">
                  <DepreciationPanel dep={asset.depreciation} asset={asset} onPatch={patch} />
                </Section>
              )}

              {/* § Contracts */}
              <Section
                icon={FileText}
                title="Contracts"
                action={
                  <Button size="sm" variant="outline" className="h-6 text-xs gap-1"
                    onClick={() => setLinkContractOpen(true)}>
                    <LinkIcon className="h-3 w-3" />
                    Link
                  </Button>
                }
              >
                <ContractsSection
                  contracts={asset.contracts ?? []}
                  assetId={asset.id}
                  onUnlinked={refresh}
                />
              </Section>

              {/* § Relationships & Dependencies */}
              <Section icon={GitMerge} title="Relationships & Dependencies"
                action={
                  <div className="flex gap-1.5">
                    <Button size="sm" variant="outline" className="h-6 text-xs gap-1"
                      onClick={() => setLinkCiOpen(true)}>
                      <Database className="h-3 w-3" />
                      {asset.ci ? "Change CI" : "Link CI"}
                    </Button>
                    <Button size="sm" variant="outline" className="h-6 text-xs gap-1"
                      onClick={() => setAddRelOpen(true)}>
                      <Plus className="h-3 w-3" />
                      Add
                    </Button>
                  </div>
                }>
                <div className="space-y-3">
                  {/* CI link */}
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 mb-1.5">
                      Configuration Item
                    </p>
                    {asset.ci ? (
                      <div className="flex items-center gap-2 rounded-md border border-border/60 px-3 py-2 bg-muted/10 group">
                        <Database className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <Link to={`/cmdb/${asset.ci.id}`}
                          className="flex-1 flex items-center gap-2 hover:text-primary transition-colors min-w-0">
                          <span className="text-sm font-medium truncate">{asset.ci.name}</span>
                          <span className="font-mono text-[10px] text-muted-foreground">{asset.ci.ciNumber}</span>
                          <ExternalLink className="h-3 w-3 text-muted-foreground shrink-0" />
                        </Link>
                        <button onClick={() => unlinkCiMut.mutate()}
                          disabled={unlinkCiMut.isPending}
                          className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all shrink-0">
                          <Unlink className="h-3 w-3" />
                        </button>
                      </div>
                    ) : (
                      <p className="text-[11px] text-muted-foreground italic">
                        Not linked to a CI.{" "}
                        <button className="underline hover:text-foreground transition-colors"
                          onClick={() => setLinkCiOpen(true)}>Link one</button>
                      </p>
                    )}
                  </div>

                  {/* Asset relationships */}
                  {asset.relationships && asset.relationships.length > 0 && (
                    <div className="border-t border-border/30 pt-3">
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 mb-2">
                        Asset Graph ({asset.relationships.length})
                      </p>
                      <div className="space-y-0">
                        {asset.relationships.map((r) => {
                          const p = STATUS_PALETTE[r.asset.status as AssetStatus];
                          return (
                            <div key={r.id}
                              className="flex items-center gap-2 py-1.5 border-b border-border/25 last:border-0 group">
                              {r.direction === "outbound"
                                ? <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                : <ArrowLeft  className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                              <span className="text-[10px] text-muted-foreground w-28 shrink-0">
                                {ASSET_RELATIONSHIP_LABEL[r.type as AssetRelationshipType]}
                              </span>
                              <Link to={`/assets/${r.asset.id}`}
                                className="flex-1 text-sm font-medium hover:underline truncate min-w-0">
                                {r.asset.name}
                              </Link>
                              <span className="font-mono text-[10px] text-muted-foreground shrink-0">
                                {r.asset.assetNumber}
                              </span>
                              <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-[10px] font-semibold shrink-0 ${p.pill}`}>
                                <span className={`h-1 w-1 rounded-full ${p.dot}`} />
                                {ASSET_STATUS_LABEL[r.asset.status as AssetStatus]}
                              </span>
                              <button
                                onClick={() => removeRelMut.mutate(r.id)}
                                disabled={removeRelMut.isPending}
                                className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all shrink-0">
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {!asset.ci && (!asset.relationships || asset.relationships.length === 0) && (
                    <div className="flex flex-col items-center gap-1 py-4">
                      <GitMerge className="h-7 w-7 text-muted-foreground/20" />
                      <p className="text-xs text-muted-foreground">No relationships defined</p>
                    </div>
                  )}
                </div>
              </Section>

              {/* § Linked Records */}
              {(() => {
                const openIncidents   = (asset.incidents ?? []).filter(i => !["resolved","closed"].includes(i.status)).length;
                const activeChanges   = (asset.changes   ?? []).filter(c => !["closed","cancelled","failed"].includes(c.status)).length;
                const openProblems    = (asset.problems  ?? []).filter(p => !["resolved","closed"].includes(p.status)).length;
                const pendingRequests = (asset.requests  ?? []).filter(r => !["fulfilled","closed","rejected","cancelled"].includes(r.status)).length;
                const openTickets     = (asset.tickets   ?? []).filter(t => !["resolved","closed"].includes(t.status)).length;

                const TABS: Array<{
                  key: LinkTarget; label: string; entity: string;
                  items: typeof asset.incidents; icon: React.ElementType; iconColor: string;
                  href: (id: number) => string;
                }> = [
                  { key: "incidents", label: "Incidents", entity: "incidents", icon: AlertTriangle, iconColor: "text-rose-500",   items: asset.incidents ?? [], href: (i) => `/incidents/${i}` },
                  { key: "requests",  label: "Requests",  entity: "requests",  icon: Layers,        iconColor: "text-sky-500",    items: asset.requests  ?? [], href: (i) => `/requests/${i}`  },
                  { key: "problems",  label: "Problems",  entity: "problems",  icon: AlertCircle,   iconColor: "text-orange-500", items: asset.problems  ?? [], href: (i) => `/problems/${i}`  },
                  { key: "changes",   label: "Changes",   entity: "changes",   icon: Wrench,        iconColor: "text-amber-500",  items: asset.changes   ?? [], href: (i) => `/changes/${i}`   },
                  { key: "services",  label: "Services",  entity: "services",  icon: CheckCircle2,  iconColor: "text-teal-500",   items: asset.services  ?? [], href: (i) => `/catalog/${i}`   },
                  { key: "cis",       label: "Config Item",entity: "cis",      icon: Database,      iconColor: "text-purple-500", items: asset.ci ? [{ id: asset.ci.id, number: asset.ci.ciNumber ?? "CI", title: asset.ci.name, status: asset.ci.status ?? "active", linkedAt: "" }] : [], href: (i) => `/cmdb/${i}` },
                  { key: "tickets",   label: "Tickets",   entity: "tickets",   icon: Ticket,        iconColor: "text-violet-500", items: asset.tickets  ?? [], href: (i) => `/tickets/${i}` },
                ];

                const hasAlerts = openIncidents > 0 || activeChanges > 0 || openProblems > 0 || openTickets > 0;

                return (
                  <Section
                    icon={Layers}
                    title="Linked Records"
                    action={
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="sm" variant="outline" className="h-6 px-2 text-[11px] gap-1">
                            <Plus className="h-3 w-3" />Link
                            <ChevronDown className="h-3 w-3 opacity-60" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                          {TABS.map(({ key, label, icon: Icon, iconColor }) => (
                            <DropdownMenuItem key={key} className="text-xs gap-2" onClick={() => setLinkTarget(key)}>
                              <Icon className={`h-3.5 w-3.5 ${iconColor}`} />{label}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    }
                  >
                    {/* Impact overview strip */}
                    {(totalLinked > 0 || asset.ci) && (
                      <div className="mb-3 -mt-1">
                        {/* Link count pills */}
                        <div className="flex flex-wrap gap-1.5 mb-2">
                          {TABS.filter(t => t.items.length > 0).map(({ key, label, items, icon: Icon, iconColor }) => (
                            <span key={key} className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-muted/60 text-muted-foreground">
                              <Icon className={`h-3 w-3 ${iconColor}`} />
                              {items.length} {label.replace("Config Item", "CI")}
                            </span>
                          ))}
                        </div>
                        {/* Active alert banner */}
                        {hasAlerts && (
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] rounded-md bg-rose-50 dark:bg-rose-950/20 border border-rose-200/60 dark:border-rose-800/40 px-3 py-1.5">
                            <AlertTriangle className="h-3 w-3 text-rose-500 shrink-0" />
                            {openIncidents   > 0 && <span className="text-rose-700 dark:text-rose-400 font-medium">{openIncidents} open incident{openIncidents > 1 ? "s" : ""}</span>}
                            {activeChanges   > 0 && <span className="text-amber-700 dark:text-amber-400 font-medium">{activeChanges} active change{activeChanges > 1 ? "s" : ""}</span>}
                            {openProblems    > 0 && <span className="text-orange-700 dark:text-orange-400 font-medium">{openProblems} open problem{openProblems > 1 ? "s" : ""}</span>}
                            {pendingRequests > 0 && <span className="text-sky-700 dark:text-sky-400 font-medium">{pendingRequests} pending request{pendingRequests > 1 ? "s" : ""}</span>}
                            {openTickets     > 0 && <span className="text-violet-700 dark:text-violet-400 font-medium">{openTickets} open ticket{openTickets > 1 ? "s" : ""}</span>}
                          </div>
                        )}
                      </div>
                    )}

                    <Tabs defaultValue="incidents">
                      <TabsList className="h-7 text-xs mb-3 w-full justify-start overflow-x-auto">
                        {TABS.map(({ key, label, items, icon: Icon, iconColor }) => (
                          <TabsTrigger key={key} value={key} className="text-xs h-6 px-2.5 gap-1.5 shrink-0">
                            <Icon className={`h-3 w-3 ${items.length > 0 ? iconColor : "text-muted-foreground/40"}`} />
                            {label.replace("Config Item", "CI")}
                            {items.length > 0 && (
                              <span className="text-[10px] font-bold bg-muted px-1.5 py-0 rounded-full">
                                {items.length}
                              </span>
                            )}
                          </TabsTrigger>
                        ))}
                      </TabsList>

                      {TABS.map(({ key, items, entity, icon: Icon, iconColor, href }) => (
                        <TabsContent key={key} value={key} className="mt-0">
                          {items.length === 0 ? (
                            <div className="flex flex-col items-center gap-2 py-6 text-center">
                              <div className="h-8 w-8 rounded-full bg-muted/60 flex items-center justify-center">
                                <Icon className={`h-4 w-4 ${iconColor} opacity-40`} />
                              </div>
                              <p className="text-xs text-muted-foreground">No {key === "cis" ? "config items" : key} linked</p>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-6 px-3 text-[11px] gap-1 mt-1"
                                onClick={() => setLinkTarget(key as LinkTarget)}
                              >
                                <Plus className="h-3 w-3" />
                                Link {key === "cis" ? "Config Item" : key.slice(0, -1)}
                              </Button>
                            </div>
                          ) : (
                            <div>
                              {/* Column header */}
                              <div className="flex items-center gap-2.5 pb-1 border-b border-border/30 mb-1">
                                <span className="w-1.5 shrink-0" />
                                <span className="font-mono text-[10px] text-muted-foreground/50 shrink-0 w-20">Number</span>
                                <span className="flex-1 text-[10px] text-muted-foreground/50">Title</span>
                                <span className="text-[10px] text-muted-foreground/50 hidden sm:block w-20">Status</span>
                                <span className="text-[10px] text-muted-foreground/50 hidden lg:block w-24">Linked</span>
                                <span className="w-4 shrink-0" />
                              </div>
                              {items.map((item) => (
                                <EntityRow
                                  key={item.id}
                                  number={item.number}
                                  title={item.title}
                                  status={item.status}
                                  href={href(item.id)}
                                  linkedAt={item.linkedAt}
                                  isPending={unlinkEntityMut.isPending}
                                  onUnlink={key === "cis"
                                    ? () => unlinkCiMut.mutate()
                                    : () => unlinkEntityMut.mutate({ entity, entityId: item.id })
                                  }
                                />
                              ))}
                              <div className="pt-2 flex justify-end">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 px-2 text-[11px] gap-1 text-muted-foreground hover:text-foreground"
                                  onClick={() => setLinkTarget(key as LinkTarget)}
                                >
                                  <Plus className="h-3 w-3" />Link another
                                </Button>
                              </div>
                            </div>
                          )}
                        </TabsContent>
                      ))}
                    </Tabs>
                  </Section>
                );
              })()}

              {/* Link entity dialog */}
              {linkTarget && asset && (
                <LinkEntityDialog
                  asset={asset}
                  target={linkTarget}
                  onDone={refresh}
                  onClose={() => setLinkTarget(null)}
                />
              )}

              {/* § Activity Timeline */}
              <Section icon={Activity} title="Activity">
                {asset.events.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">No activity recorded.</p>
                ) : (
                  <div className="relative pl-4">
                    {/* vertical timeline rail */}
                    <div className="absolute left-1 top-0 bottom-0 w-px bg-border/40" />
                    <div className="space-y-0">
                      {asset.events.map((ev) => {
                        const labelFn = EVENT_LABEL[ev.action];
                        const label = labelFn ? labelFn(ev.meta as Record<string, unknown>) : ev.action.replace("asset.", "");
                        const icon  = EVENT_ICON[ev.action] ?? <Circle className="h-3 w-3 text-muted-foreground/30 shrink-0 mt-0.5" />;
                        return (
                          <div key={ev.id} className="relative flex items-start gap-3 py-1.5">
                            <div className="absolute -left-1.5 top-2 z-10 bg-card rounded-full">{icon}</div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-baseline gap-2 flex-wrap">
                                <span className="text-xs font-semibold shrink-0">
                                  {ev.actor?.name ?? "System"}
                                </span>
                                <span className="text-xs text-muted-foreground leading-snug">{label}</span>
                              </div>
                              <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                                {fmt(ev.createdAt, true)}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </Section>
            </div>

            {/* ── RIGHT — properties sidebar ── */}
            <div className="space-y-3">

              {/* Classification */}
              <Section icon={ShieldCheck} title="Classification">
                <div className="space-y-2.5">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 mb-1">Type</p>
                    <Select value={asset.type} onValueChange={(v) => patch({ type: v as any })}>
                      <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ASSET_TYPES.map((t) => <SelectItem key={t} value={t} className="text-xs">{ASSET_TYPE_LABEL[t]}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 mb-1">Condition</p>
                    <Select value={asset.condition} onValueChange={(v) => patch({ condition: v as any })}>
                      <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ASSET_CONDITIONS.map((c) => <SelectItem key={c} value={c} className="text-xs">{ASSET_CONDITION_LABEL[c]}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 mb-1">Status</p>
                    <div className="flex items-center justify-between">
                      <StatusPill status={asset.status} />
                      <button className="text-[10px] text-muted-foreground hover:text-foreground underline transition-colors"
                        onClick={() => setTransitionOpen(true)}>
                        Change
                      </button>
                    </div>
                  </div>
                </div>
              </Section>

              {/* Identification */}
              <Section icon={Package} title="Identification">
                <div className="space-y-0">
                  <EditField label="Manufacturer" value={asset.manufacturer} onSave={(v) => patch({ manufacturer: v })} />
                  <EditField label="Model"        value={asset.model}        onSave={(v) => patch({ model: v })} />
                  <EditField label="Serial no."   value={asset.serialNumber} onSave={(v) => patch({ serialNumber: v })} mono />
                  <EditField label="Asset tag"    value={asset.assetTag}     onSave={(v) => patch({ assetTag: v })} mono />
                </div>
              </Section>

              {/* Location */}
              <Section icon={MapPin} title="Location">
                <div className="space-y-0">
                  {asset.inventoryLocation && (
                    <div className="flex items-start justify-between gap-4 py-1.5 border-b border-border/30">
                      <span className="text-[11px] text-muted-foreground shrink-0 min-w-[7.5rem] pt-0.5">Stockroom</span>
                      <div className="flex items-center gap-1.5 justify-end flex-wrap">
                        <Warehouse className="h-3 w-3 text-muted-foreground shrink-0" />
                        <span className="text-sm font-medium text-right">{asset.inventoryLocation.name}</span>
                        {asset.inventoryLocation.code && (
                          <span className="font-mono text-[10px] text-muted-foreground">{asset.inventoryLocation.code}</span>
                        )}
                      </div>
                    </div>
                  )}
                  <EditField label="Location" value={asset.location} onSave={(v) => patch({ location: v })} />
                  <EditField label="Site"     value={asset.site}     onSave={(v) => patch({ site: v })} />
                  <EditField label="Building" value={asset.building} onSave={(v) => patch({ building: v })} />
                  <EditField label="Room"     value={asset.room}     onSave={(v) => patch({ room: v })} />
                </div>
              </Section>

              {/* Integration */}
              {(asset.discoverySource || asset.externalId || asset.managedBy) && (
                <Section icon={Server} title="System / Integration">
                  <div className="space-y-0">
                    {asset.discoverySource && (
                      <InfoRow label="Source" mono>{asset.discoverySource}</InfoRow>
                    )}
                    {asset.managedBy && (
                      <InfoRow label="Managed by">{asset.managedBy}</InfoRow>
                    )}
                    {asset.externalId && (
                      <InfoRow label="External ID" mono>{asset.externalId}</InfoRow>
                    )}
                    {asset.lastDiscoveredAt && (
                      <InfoRow label="Last seen">{fmt(asset.lastDiscoveredAt, true) ?? "—"}</InfoRow>
                    )}
                  </div>
                </Section>
              )}

              {/* Depreciation setup (sidebar — method + inputs) */}
              <Section icon={TrendingDown} title="Depreciation Setup">
                <div className="space-y-2">
                  <Select value={asset.depreciationMethod}
                    onValueChange={(v) => patch({ depreciationMethod: v as any })}>
                    <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {DEPRECIATION_METHODS.map((m) => (
                        <SelectItem key={m} value={m} className="text-xs">{DEPRECIATION_METHOD_LABEL[m]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {asset.depreciationMethod !== "none" && (
                    <div className="space-y-0 mt-1">
                      <EditField label="Useful life"
                        value={asset.usefulLifeYears != null ? `${asset.usefulLifeYears} yr` : null}
                        placeholder="e.g. 5"
                        onSave={(v) => patch({ usefulLifeYears: v ? parseInt(v, 10) || null : null })} />
                      <EditField label="Salvage value"
                        value={asset.salvageValue != null ? fmtPrice(asset.salvageValue, asset.currency) : null}
                        placeholder="0.00"
                        onSave={(v) => patch({ salvageValue: v?.replace(/[^0-9.]/g, "") || null })} />
                    </div>
                  )}
                </div>
              </Section>

              {/* Meta */}
              <div className="px-1 pt-1 space-y-0.5 text-[11px] text-muted-foreground/60">
                <p>Created {fmt(asset.createdAt, true)}</p>
                <p>Updated {fmt(asset.updatedAt, true)}</p>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Dialogs ── */}
      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Assign Asset</DialogTitle></DialogHeader>
          {assignOpen && asset && (
            <AssignDialog assetId={asset.id} onDone={refresh} onClose={() => setAssignOpen(false)} />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={transitionOpen} onOpenChange={setTransitionOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Lifecycle Transition</DialogTitle></DialogHeader>
          {transitionOpen && asset && (
            <TransitionDialog assetId={asset.id} currentStatus={asset.status as AssetStatus}
              onDone={refresh} onClose={() => setTransitionOpen(false)} />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={addRelOpen} onOpenChange={setAddRelOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Add Relationship</DialogTitle></DialogHeader>
          {addRelOpen && asset && (
            <AddRelationshipDialog assetId={asset.id} onDone={refresh} onClose={() => setAddRelOpen(false)} />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={linkCiOpen} onOpenChange={setLinkCiOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Link Configuration Item</DialogTitle></DialogHeader>
          {linkCiOpen && asset && (
            <LinkCiDialog assetId={asset.id} onDone={refresh} onClose={() => setLinkCiOpen(false)} />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={linkContractOpen} onOpenChange={setLinkContractOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><LinkIcon className="h-4 w-4" />Link Contract</DialogTitle></DialogHeader>
          {linkContractOpen && asset && (
            <LinkContractDialog assetId={asset.id} onDone={refresh} onClose={() => setLinkContractOpen(false)} />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={movementOpen} onOpenChange={setMovementOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Truck className="h-4 w-4" />
              Record Movement
            </DialogTitle>
          </DialogHeader>
          {movementOpen && asset && (
            <MovementDialog
              assetId={asset.id}
              assetStatus={asset.status as AssetStatus}
              initialWorkflow={movementWorkflow}
              onDone={refresh}
              onClose={() => setMovementOpen(false)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
