import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import axios from "axios";
import {
  CONTRACT_TYPES, CONTRACT_STATUSES,
  CONTRACT_TYPE_LABEL, CONTRACT_STATUS_LABEL,
  CONTRACT_STATUS_COLOR, CONTRACT_TYPE_COLOR,
  type ContractType, type ContractStatus, type ContractDetail,
} from "core/constants/contracts.ts";
import {
  createContractSchema, type CreateContractInput,
} from "core/schemas/contracts.ts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ErrorAlert from "@/components/ErrorAlert";
import ErrorMessage from "@/components/ErrorMessage";
import {
  FileText, Plus, AlertTriangle, Clock, ChevronDown, Pencil,
  MoreHorizontal, Package, Link as LinkIcon, Trash2, CheckCircle2,
  X, ExternalLink,
} from "lucide-react";
import { Link } from "react-router";

// ── Expiry badge ──────────────────────────────────────────────────────────────

function ExpiryBadge({ days }: { days: number | null }) {
  if (days === null) return null;
  if (days < 0)   return <span className="inline-flex items-center gap-1 text-[10px] text-destructive font-medium"><AlertTriangle className="h-3 w-3" />Expired</span>;
  if (days <= 30) return <span className="inline-flex items-center gap-1 text-[10px] text-red-600 dark:text-red-400 font-medium"><AlertTriangle className="h-3 w-3" />{days}d</span>;
  if (days <= 90) return <span className="inline-flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400 font-medium"><Clock className="h-3 w-3" />{days}d</span>;
  return null;
}

// ── Contract form ─────────────────────────────────────────────────────────────

function ContractForm({
  defaultValues,
  onSubmit,
  isPending,
  error,
  onCancel,
  submitLabel,
}: {
  defaultValues?: Partial<CreateContractInput>;
  onSubmit: (d: CreateContractInput) => void;
  isPending: boolean;
  error?: unknown;
  onCancel: () => void;
  submitLabel: string;
}) {
  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<CreateContractInput>({
    resolver: zodResolver(createContractSchema),
    defaultValues: { type: "support", status: "active", autoRenews: false, currency: "USD", ...defaultValues },
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 py-2">
      {error && <ErrorAlert error={error as Error} fallback="Operation failed" />}

      {/* Core */}
      <div className="space-y-3">
        <div className="space-y-1">
          <Label>Title <span className="text-destructive">*</span></Label>
          <Input {...register("title")} placeholder="HP ProSupport — EMEA Servers" />
          {errors.title && <ErrorMessage message={errors.title.message} />}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Type <span className="text-destructive">*</span></Label>
            <Select value={watch("type")} onValueChange={v => setValue("type", v as ContractType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{CONTRACT_TYPES.map(t => <SelectItem key={t} value={t}>{CONTRACT_TYPE_LABEL[t]}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Status</Label>
            <Select value={watch("status")} onValueChange={v => setValue("status", v as ContractStatus)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{CONTRACT_STATUSES.map(s => <SelectItem key={s} value={s}>{CONTRACT_STATUS_LABEL[s]}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Vendor */}
      <div className="space-y-3 border-t border-border/40 pt-4">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Vendor</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1">
            <Label>Vendor name</Label>
            <Input {...register("vendor")} placeholder="HP Inc., Dell Technologies…" />
          </div>
          <div className="space-y-1">
            <Label>Contact name</Label>
            <Input {...register("vendorContact")} placeholder="Account manager" />
          </div>
          <div className="space-y-1">
            <Label>Contact email</Label>
            <Input {...register("vendorEmail")} type="email" placeholder="support@vendor.com" />
          </div>
          <div className="space-y-1">
            <Label>Phone</Label>
            <Input {...register("vendorPhone")} placeholder="+1 800 000 0000" />
          </div>
        </div>
      </div>

      {/* Dates & value */}
      <div className="space-y-3 border-t border-border/40 pt-4">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Dates & Value</p>
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1">
            <Label>Start date</Label>
            <Input {...register("startDate")} type="date" className="h-8 text-sm" />
          </div>
          <div className="space-y-1">
            <Label>End date</Label>
            <Input {...register("endDate")} type="date" className="h-8 text-sm" />
          </div>
          <div className="space-y-1">
            <Label>Renewal date</Label>
            <Input {...register("renewalDate")} type="date" className="h-8 text-sm" />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2 space-y-1">
            <Label>Contract value</Label>
            <Input {...register("value")} placeholder="25000.00" className="h-8 text-sm" />
          </div>
          <div className="space-y-1">
            <Label>Currency</Label>
            <Input {...register("currency")} placeholder="USD" maxLength={3} className="h-8 text-sm font-mono" />
          </div>
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" {...register("autoRenews")} className="accent-primary h-3.5 w-3.5" />
          <span className="text-sm">Auto-renews</span>
        </label>
      </div>

      {/* SLA / support */}
      <div className="space-y-3 border-t border-border/40 pt-4">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Support Level</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Support tier</Label>
            <Input {...register("supportLevel")} placeholder="ProSupport 4hr, NBD, 24×7…" className="h-8 text-sm" />
          </div>
          <div className="space-y-1">
            <Label>SLA response (hours)</Label>
            <Input {...register("slaResponseHours", { valueAsNumber: true })} type="number" min={1} placeholder="4" className="h-8 text-sm" />
          </div>
        </div>
      </div>

      {/* Notes */}
      <div className="space-y-1 border-t border-border/40 pt-4">
        <Label>Notes</Label>
        <Textarea {...register("notes")} placeholder="Scope, coverage details, renewal terms…" rows={2} />
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={isPending}>{isPending ? "Saving…" : submitLabel}</Button>
      </DialogFooter>
    </form>
  );
}

// ── Contract detail panel ─────────────────────────────────────────────────────

function ContractPanel({
  contract,
  onEdit,
  onClose,
}: { contract: ContractDetail; onEdit: () => void; onClose: () => void }) {
  const qc = useQueryClient();

  const unlinkMut = useMutation({
    mutationFn: (assetId: number) =>
      axios.delete(`/api/contracts/${contract.id}/link-asset/${assetId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["contracts"] }),
  });

  const fmt = (iso: string | Date | null | undefined) => {
    if (!iso) return "—";
    return new Date(iso as string).toLocaleDateString(undefined, { dateStyle: "medium" });
  };

  const fmtMoney = (v: string | null, cur: string) =>
    v ? new Intl.NumberFormat(undefined, { style: "currency", currency: cur, minimumFractionDigits: 2 }).format(Number(v)) : null;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <p className="font-mono text-[11px] text-muted-foreground">{contract.contractNumber}</p>
          <h2 className="text-base font-semibold leading-tight mt-0.5">{contract.title}</h2>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span className={`inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] font-semibold ${CONTRACT_STATUS_COLOR[contract.status]}`}>
              {CONTRACT_STATUS_LABEL[contract.status]}
            </span>
            <span className={`inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] font-semibold ${CONTRACT_TYPE_COLOR[contract.type]}`}>
              {CONTRACT_TYPE_LABEL[contract.type]}
            </span>
            <ExpiryBadge days={contract.daysUntilExpiry} />
          </div>
        </div>
        <div className="flex gap-1 shrink-0">
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={onEdit}>
            <Pencil className="h-3 w-3" />Edit
          </Button>
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={onClose}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Key facts */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-2">
        {[
          { label: "Vendor",       value: contract.vendor },
          { label: "Contact",      value: contract.vendorContact },
          { label: "Email",        value: contract.vendorEmail },
          { label: "Phone",        value: contract.vendorPhone },
          { label: "Start",        value: fmt(contract.startDate) },
          { label: "End",          value: fmt(contract.endDate) },
          { label: "Renewal",      value: fmt(contract.renewalDate) },
          { label: "Auto-renews",  value: contract.autoRenews ? "Yes" : "No" },
          { label: "Value",        value: fmtMoney(contract.value, contract.currency) },
          { label: "Support tier", value: contract.supportLevel },
          { label: "SLA response", value: contract.slaResponseHours ? `${contract.slaResponseHours}h` : null },
        ].filter(r => r.value).map(({ label, value }) => (
          <div key={label} className="flex justify-between gap-2 py-1 border-b border-border/25">
            <span className="text-[11px] text-muted-foreground shrink-0">{label}</span>
            <span className="text-xs font-medium text-right">{value}</span>
          </div>
        ))}
      </div>

      {contract.notes && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/60 mb-1">Notes</p>
          <p className="text-xs text-muted-foreground leading-relaxed">{contract.notes}</p>
        </div>
      )}

      {/* Linked assets */}
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/60 mb-2">
          Linked Assets ({contract.assets.length})
        </p>
        {contract.assets.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">No assets linked yet.</p>
        ) : (
          <div className="space-y-0 max-h-48 overflow-y-auto">
            {contract.assets.map(a => (
              <div key={a.id} className="flex items-center gap-2 py-1.5 border-b border-border/25 last:border-0 group">
                <Link to={`/assets/${a.id}`} className="flex-1 flex items-center gap-2 hover:text-primary transition-colors min-w-0">
                  <span className="font-mono text-[10px] text-muted-foreground shrink-0">{a.assetNumber}</span>
                  <span className="text-xs font-medium truncate">{a.name}</span>
                  <ExternalLink className="h-3 w-3 text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100" />
                </Link>
                <button
                  onClick={() => unlinkMut.mutate(a.id)}
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all shrink-0"
                  title="Unlink asset"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ContractsPage() {
  const qc = useQueryClient();
  const [createOpen,   setCreateOpen]   = useState(false);
  const [selectedId,   setSelectedId]   = useState<number | null>(null);
  const [editingId,    setEditingId]     = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter,   setTypeFilter]   = useState<string>("all");

  const { data: listData, isLoading, error } = useQuery({
    queryKey: ["contracts", { statusFilter, typeFilter }],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (statusFilter !== "all") params.status = statusFilter;
      if (typeFilter !== "all")   params.type   = typeFilter;
      return (await axios.get<{ items: ContractDetail[]; meta: { total: number } }>("/api/contracts", { params })).data;
    },
  });

  const { data: selectedContract, isLoading: detailLoading } = useQuery({
    queryKey: ["contracts", selectedId],
    queryFn: async () =>
      selectedId ? (await axios.get<{ contract: ContractDetail }>(`/api/contracts/${selectedId}`)).data.contract : null,
    enabled: !!selectedId,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["contracts"] });

  const createMut = useMutation({
    mutationFn: (d: CreateContractInput) => axios.post("/api/contracts", d),
    onSuccess: () => { setCreateOpen(false); invalidate(); },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, ...d }: CreateContractInput & { id: number }) => axios.put(`/api/contracts/${id}`, d),
    onSuccess: () => { setEditingId(null); invalidate(); },
  });

  const contracts = listData?.items ?? [];

  // Group: expiring in 30 days, expiring 31-90 days, active, other
  const expiring30 = contracts.filter(c => c.daysUntilExpiry !== null && c.daysUntilExpiry >= 0 && c.daysUntilExpiry <= 30);
  const expiring90 = contracts.filter(c => c.daysUntilExpiry !== null && c.daysUntilExpiry > 30 && c.daysUntilExpiry <= 90);

  return (
    <div className="space-y-0">
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4 pb-5">
        <div>
          <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2">
            <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
            Contracts
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Vendor agreements, support contracts, warranties, and licenses
          </p>
        </div>
        <Button size="sm" className="h-8" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-1.5" />
          New Contract
        </Button>
      </div>

      {/* ── Alert banners ── */}
      {expiring30.length > 0 && (
        <div className="rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-3 py-2 mb-4 flex items-center gap-2">
          <AlertTriangle className="h-3.5 w-3.5 text-red-600 dark:text-red-400 shrink-0" />
          <p className="text-xs text-red-700 dark:text-red-300">
            <span className="font-semibold">{expiring30.length} contract{expiring30.length !== 1 ? "s" : ""}</span>{" "}
            expiring within 30 days — {expiring30.map(c => c.title).slice(0, 3).join(", ")}{expiring30.length > 3 ? ` +${expiring30.length - 3} more` : ""}
          </p>
        </div>
      )}
      {expiring90.length > 0 && (
        <div className="rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-3 py-2 mb-4 flex items-center gap-2">
          <Clock className="h-3.5 w-3.5 text-amber-600 shrink-0" />
          <p className="text-xs text-amber-700 dark:text-amber-300">
            <span className="font-semibold">{expiring90.length} contract{expiring90.length !== 1 ? "s" : ""}</span>{" "}
            expiring in the next 90 days
          </p>
        </div>
      )}

      {/* ── Filters ── */}
      <div className="flex gap-2 mb-4 flex-wrap">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-8 text-sm w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {CONTRACT_STATUSES.map(s => <SelectItem key={s} value={s}>{CONTRACT_STATUS_LABEL[s]}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="h-8 text-sm w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {CONTRACT_TYPES.map(t => <SelectItem key={t} value={t}>{CONTRACT_TYPE_LABEL[t]}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {error && <ErrorAlert error={error} fallback="Failed to load contracts" />}

      {/* ── Two-column layout when a contract is selected ── */}
      <div className={`gap-5 ${selectedId ? "lg:grid lg:grid-cols-[1fr_400px]" : ""}`}>
        {/* List */}
        <div className="rounded-lg border border-border/60 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/50 bg-muted/20">
                {["Contract", "Type", "Status", "End Date", "Assets", "Value", ""].map(h => (
                  <th key={h} className="text-left px-3 py-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70 whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {isLoading && Array.from({ length: 6 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: 7 }).map((__, j) => (
                    <td key={j} className="px-3 py-2.5">
                      <Skeleton className={`h-4 ${j === 0 ? "w-48" : "w-20"}`} />
                    </td>
                  ))}
                </tr>
              ))}
              {!isLoading && contracts.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <FileText className="h-9 w-9 text-muted-foreground/20" />
                      <p className="text-sm font-medium text-muted-foreground">No contracts yet</p>
                      <Button size="sm" onClick={() => setCreateOpen(true)}>
                        <Plus className="h-4 w-4 mr-1.5" />
                        Add First Contract
                      </Button>
                    </div>
                  </td>
                </tr>
              )}
              {contracts.map(c => {
                const active = selectedId === c.id;
                return (
                  <tr key={c.id}
                    onClick={() => setSelectedId(active ? null : c.id)}
                    className={`cursor-pointer transition-colors ${active ? "bg-primary/5" : "hover:bg-muted/20"}`}
                  >
                    <td className="px-3 py-2.5 min-w-[200px]">
                      <p className="font-medium text-sm leading-tight">{c.title}</p>
                      <p className="font-mono text-[10px] text-muted-foreground mt-0.5">{c.contractNumber}</p>
                      {c.vendor && <p className="text-[11px] text-muted-foreground/70 mt-0.5">{c.vendor}</p>}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] font-semibold ${CONTRACT_TYPE_COLOR[c.type]}`}>
                        {CONTRACT_TYPE_LABEL[c.type]}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] font-semibold ${CONTRACT_STATUS_COLOR[c.status]}`}>
                        {CONTRACT_STATUS_LABEL[c.status]}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-muted-foreground">
                          {c.endDate ? new Date(c.endDate).toLocaleDateString(undefined, { dateStyle: "medium" }) : "—"}
                        </span>
                        <ExpiryBadge days={c.daysUntilExpiry} />
                      </div>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span className="text-xs text-muted-foreground">{c._counts.assets}</span>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {c.value ? `${c.currency} ${Number(c.value).toLocaleString()}` : "—"}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 w-8" onClick={e => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="h-6 w-6 rounded flex items-center justify-center text-muted-foreground hover:bg-muted opacity-0 group-hover:opacity-100 transition">
                            <MoreHorizontal className="h-3.5 w-3.5" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-36 text-sm">
                          <DropdownMenuItem onClick={() => setEditingId(c.id)}>
                            <Pencil className="h-3.5 w-3.5 mr-2 text-muted-foreground" />Edit
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Detail panel */}
        {selectedId && (
          <div className="rounded-lg border border-border/60 bg-card p-4 overflow-y-auto max-h-[80vh]">
            {detailLoading
              ? <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-4 w-full" />)}</div>
              : selectedContract
                ? <ContractPanel contract={selectedContract} onEdit={() => setEditingId(selectedId)} onClose={() => setSelectedId(null)} />
                : <p className="text-xs text-muted-foreground">Failed to load contract.</p>
            }
          </div>
        )}
      </div>

      {/* ── Create dialog ── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Plus className="h-4 w-4" />New Contract</DialogTitle></DialogHeader>
          <ContractForm
            onSubmit={d => createMut.mutate(d)}
            isPending={createMut.isPending}
            error={createMut.error}
            onCancel={() => setCreateOpen(false)}
            submitLabel="Create Contract"
          />
        </DialogContent>
      </Dialog>

      {/* ── Edit dialog ── */}
      {editingId && (() => {
        const c = contracts.find(x => x.id === editingId) ?? selectedContract;
        if (!c) return null;
        return (
          <Dialog open onOpenChange={() => setEditingId(null)}>
            <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle className="flex items-center gap-2"><Pencil className="h-4 w-4" />Edit — {c.title}</DialogTitle></DialogHeader>
              <ContractForm
                defaultValues={c}
                onSubmit={d => updateMut.mutate({ id: c.id, ...d })}
                isPending={updateMut.isPending}
                error={updateMut.error}
                onCancel={() => setEditingId(null)}
                submitLabel="Save Changes"
              />
            </DialogContent>
          </Dialog>
        );
      })()}
    </div>
  );
}
