import { useState, useMemo } from "react";
import { Link } from "react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import {
  SOFTWARE_LICENSE_TYPE_LABEL, SOFTWARE_LICENSE_STATUS_LABEL,
  SOFTWARE_LICENSE_STATUS_COLOR, SOFTWARE_PLATFORM_LABEL,
  SOFTWARE_LICENSE_TYPES,
  type SoftwareLicenseSummary, type SoftwareLicenseStatus,
} from "core/constants/software.ts";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Form, FormField, FormItem, FormLabel, FormControl, FormMessage,
} from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createSoftwareLicenseSchema, type CreateSoftwareLicenseInput } from "core/schemas/software.ts";
import ErrorAlert from "@/components/ErrorAlert";
import CustomTagPicker from "@/components/CustomTagPicker";
import {
  Key, Search, ChevronLeft, ChevronRight, Plus, AlertTriangle,
  CheckCircle2, Clock, Ban, Trash2, X,
} from "lucide-react";

interface Stats {
  total: number;
  active: number;
  expiring30: number;
  expiring90: number;
  expired: number;
}

interface PagedResponse {
  items: SoftwareLicenseSummary[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ── Seat utilisation bar ──────────────────────────────────────────────────────

function UtilizationBar({ consumed, total }: { consumed: number; total: number | null }) {
  if (total === null) {
    return <span className="text-muted-foreground text-xs">{consumed} / ∞</span>;
  }
  const pct = total > 0 ? Math.min((consumed / total) * 100, 100) : 0;
  const isOver = consumed > total;
  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className="flex-1 bg-muted rounded-full h-1.5 min-w-[60px]">
        <div
          className={`h-1.5 rounded-full transition-all ${isOver ? "bg-destructive" : pct > 80 ? "bg-amber-500" : "bg-emerald-500"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={`text-xs tabular-nums shrink-0 ${isOver ? "text-destructive font-medium" : "text-muted-foreground"}`}>
        {consumed}/{total}
      </span>
    </div>
  );
}

// ── New License dialog ────────────────────────────────────────────────────────

function NewLicenseDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const form = useForm<CreateSoftwareLicenseInput>({
    resolver: zodResolver(createSoftwareLicenseSchema),
    defaultValues: { licenseType: "perpetual", platform: "cross_platform", status: "active", autoRenews: false, currency: "USD" },
  });
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (data: CreateSoftwareLicenseInput) =>
      axios.post<SoftwareLicenseSummary>("/api/software-licenses", data).then(r => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["software-licenses"] });
      queryClient.invalidateQueries({ queryKey: ["software-licenses-stats"] });
      setOpen(false);
      form.reset();
      onCreated();
    },
  });

  return (
    <>
      <Button onClick={() => setOpen(true)} size="sm" className="shadow-sm">
        <Plus className="w-4 h-4 mr-1.5" />New License
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Register Software License</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(d => mutation.mutate(d))} className="space-y-4">
              <FormField control={form.control} name="productName" render={({ field }) => (
                <FormItem>
                  <FormLabel>Product Name *</FormLabel>
                  <FormControl><Input placeholder="e.g. Adobe Creative Cloud" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <div className="grid grid-cols-2 gap-3">
                <FormField control={form.control} name="vendor" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Vendor</FormLabel>
                    <FormControl><Input placeholder="e.g. Adobe" {...field} value={field.value ?? ""} /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="edition" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Edition</FormLabel>
                    <FormControl><Input placeholder="e.g. Enterprise" {...field} value={field.value ?? ""} /></FormControl>
                  </FormItem>
                )} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <FormField control={form.control} name="licenseType" render={({ field }) => (
                  <FormItem>
                    <FormLabel>License Type</FormLabel>
                    <FormControl>
                      <CustomTagPicker
                        endpoint="/api/license-types"
                        queryKey="license-types"
                        builtins={SOFTWARE_LICENSE_TYPES.map((t) => ({ value: t, label: SOFTWARE_LICENSE_TYPE_LABEL[t] }))}
                        builtinValue={field.value}
                        customId={form.watch("customLicenseTypeId") ?? null}
                        noun="license type"
                        onChange={(sel) => {
                          if (sel.kind === "builtin") {
                            field.onChange(sel.value);
                            form.setValue("customLicenseTypeId", null);
                          } else {
                            field.onChange("other");
                            form.setValue("customLicenseTypeId", sel.id);
                          }
                        }}
                      />
                    </FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="totalSeats" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Total Seats</FormLabel>
                    <FormControl>
                      <Input
                        type="number" min={1} placeholder="Leave blank = unlimited"
                        {...field}
                        value={field.value ?? ""}
                        onChange={e => field.onChange(e.target.value ? Number(e.target.value) : null)}
                      />
                    </FormControl>
                  </FormItem>
                )} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <FormField control={form.control} name="renewalDate" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Renewal Date</FormLabel>
                    <FormControl><Input type="date" {...field} value={field.value ?? ""} /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="expiryDate" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Expiry Date</FormLabel>
                    <FormControl><Input type="date" {...field} value={field.value ?? ""} /></FormControl>
                  </FormItem>
                )} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <FormField control={form.control} name="annualCost" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Annual Cost</FormLabel>
                    <FormControl><Input placeholder="0.00" {...field} value={field.value ?? ""} /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="currency" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Currency</FormLabel>
                    <FormControl><Input placeholder="USD" maxLength={3} {...field} /></FormControl>
                  </FormItem>
                )} />
              </div>
              <ErrorAlert error={mutation.error} fallback="Failed to create license" />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={mutation.isPending}>
                  {mutation.isPending ? "Creating…" : "Create License"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

type FilterChip = { key: string; label: string; statuses: SoftwareLicenseStatus[] | null };

const FILTER_CHIPS: FilterChip[] = [
  { key: "all",          label: "All",          statuses: null },
  { key: "active",       label: "Active",        statuses: ["active"] },
  { key: "expiring",     label: "Expiring Soon", statuses: ["active"] },
  { key: "trial",        label: "Trial",         statuses: ["trial"] },
  { key: "expired",      label: "Expired",       statuses: ["expired"] },
  { key: "over_limit",   label: "Over Limit",    statuses: null },
];

export default function SoftwareLicensesPage() {
  const [chipKey,     setChipKey]     = useState("all");
  const [search,      setSearch]      = useState("");
  const [typeFilter,  setTypeFilter]  = useState<string>("");
  const [page,        setPage]        = useState(1);
  const [selected,    setSelected]    = useState<Set<number>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState<{ ids: number[]; label: string } | null>(null);
  const PAGE_SIZE = 25;
  const queryClient = useQueryClient();

  const params: Record<string, string> = {
    page: String(page), pageSize: String(PAGE_SIZE),
  };
  if (search)     params.search       = search;
  if (typeFilter) params.licenseType  = typeFilter;
  if (chipKey === "expiring")   { params.expiringDays = "90"; }
  if (chipKey === "over_limit") { params.overAllocated = "true"; }
  else {
    const chip = FILTER_CHIPS.find(c => c.key === chipKey);
    if (chip?.statuses?.length === 1) params.status = chip.statuses[0];
  }

  const { data: stats } = useQuery<Stats>({
    queryKey: ["software-licenses-stats"],
    queryFn: () => axios.get("/api/software-licenses/stats").then(r => r.data),
  });

  const { data, isLoading, error } = useQuery<PagedResponse>({
    queryKey: ["software-licenses", params],
    queryFn:  () => axios.get("/api/software-licenses", { params }).then(r => r.data),
    placeholderData: prev => prev,
  });

  const deleteMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      if (ids.length === 1) {
        await axios.delete(`/api/software-licenses/${ids[0]}`);
      } else {
        await axios.post("/api/software-licenses/bulk-delete", { ids });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["software-licenses"] });
      queryClient.invalidateQueries({ queryKey: ["software-licenses-stats"] });
      setSelected(new Set());
      setConfirmDelete(null);
    },
  });

  function handleChip(key: string) {
    setChipKey(key);
    setPage(1);
    setSelected(new Set());
  }

  const pageIds = useMemo(() => data?.items.map(i => i.id) ?? [], [data]);
  const allSelected = pageIds.length > 0 && pageIds.every(id => selected.has(id));
  const someSelected = pageIds.some(id => selected.has(id)) && !allSelected;

  function toggleAll() {
    if (allSelected) {
      const next = new Set(selected);
      for (const id of pageIds) next.delete(id);
      setSelected(next);
    } else {
      setSelected(new Set([...selected, ...pageIds]));
    }
  }

  function toggleOne(id: number) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  }

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-indigo-500/15 to-violet-600/15 border border-indigo-500/20">
            <Key className="w-6 h-6 text-indigo-500" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Software Licenses</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Track software entitlements, seat allocation, and renewals.
            </p>
          </div>
        </div>
        <NewLicenseDialog onCreated={() => {}} />
      </div>

      {/* Stats bar */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Total",         value: stats.total,      icon: Key,          accent: "from-slate-500/10 to-slate-500/5",     iconColor: "text-slate-500" },
            { label: "Active",        value: stats.active,     icon: CheckCircle2, accent: "from-emerald-500/10 to-emerald-500/5", iconColor: "text-emerald-600" },
            { label: "Expiring <30d", value: stats.expiring30, icon: Clock,        accent: "from-amber-500/10 to-amber-500/5",     iconColor: "text-amber-600" },
            { label: "Expired",       value: stats.expired,    icon: Ban,          accent: "from-rose-500/10 to-rose-500/5",       iconColor: "text-destructive" },
          ].map(s => (
            <div key={s.label} className={`relative overflow-hidden rounded-xl border bg-gradient-to-br ${s.accent} p-4 flex items-center gap-3 hover:shadow-md transition-shadow`}>
              <div className="p-2 rounded-lg bg-card border shadow-sm">
                <s.icon className={`w-4 h-4 ${s.iconColor}`} />
              </div>
              <div>
                <p className="text-2xl font-semibold tabular-nums leading-tight">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 flex-wrap">
          {FILTER_CHIPS.map(chip => (
            <button
              key={chip.key}
              onClick={() => handleChip(chip.key)}
              className={`px-3 py-1 rounded-full text-sm border transition-colors ${
                chipKey === chip.key
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border hover:bg-muted"
              }`}
            >
              {chip.label}
            </button>
          ))}
        </div>
        <div className="flex-1 flex gap-2 min-w-0">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search product, vendor…"
              className="pl-8 h-8 text-sm"
            />
          </div>
          <Select value={typeFilter} onValueChange={v => { setTypeFilter(v === "all" ? "" : v); setPage(1); }}>
            <SelectTrigger className="h-8 w-40 text-sm">
              <SelectValue placeholder="All Types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {SOFTWARE_LICENSE_TYPES.map(t => (
                <SelectItem key={t} value={t}>{SOFTWARE_LICENSE_TYPE_LABEL[t]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex items-center justify-between rounded-lg border bg-primary/5 border-primary/30 px-4 py-2.5 shadow-sm">
          <div className="flex items-center gap-2 text-sm">
            <span className="font-medium">{selected.size} selected</span>
            <span className="text-muted-foreground">·</span>
            <button
              onClick={() => setSelected(new Set())}
              className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
            >
              <X className="w-3.5 h-3.5" /> Clear
            </button>
          </div>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => setConfirmDelete({ ids: [...selected], label: `${selected.size} licenses` })}
          >
            <Trash2 className="w-4 h-4 mr-1.5" /> Delete selected
          </Button>
        </div>
      )}

      {/* Error */}
      {error && <ErrorAlert error={error} fallback="Failed to load licenses" />}

      {/* Table */}
      <div className="rounded-xl border bg-card overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40">
              <th className="px-3 py-2.5 w-10">
                <Checkbox
                  checked={allSelected ? true : someSelected ? "indeterminate" : false}
                  onCheckedChange={toggleAll}
                  aria-label="Select all"
                />
              </th>
              {["License #", "Product", "Vendor", "Type", "Platform", "Seats", "Renewal", "Status"].map(h => (
                <th key={h} className="px-4 py-2.5 text-left font-medium text-muted-foreground whitespace-nowrap">{h}</th>
              ))}
              <th className="px-2 py-2.5 w-10"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && Array.from({ length: 8 }).map((_, i) => (
              <tr key={i} className="border-b animate-pulse">
                <td className="px-3 py-3"><div className="h-4 w-4 bg-muted rounded" /></td>
                {Array.from({ length: 8 }).map((_, j) => (
                  <td key={j} className="px-4 py-3"><div className="h-4 bg-muted rounded w-24" /></td>
                ))}
                <td />
              </tr>
            ))}
            {!isLoading && data?.items.map(lic => {
              const statusColor = SOFTWARE_LICENSE_STATUS_COLOR[lic.status];
              const isExpiringSoon = lic.daysUntilExpiry !== null && lic.daysUntilExpiry <= 30 && lic.daysUntilExpiry >= 0;
              const isSelected = selected.has(lic.id);
              return (
                <tr
                  key={lic.id}
                  className={`border-b transition-colors group ${isSelected ? "bg-primary/5" : "hover:bg-muted/30"}`}
                >
                  <td className="px-3 py-3">
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggleOne(lic.id)}
                      aria-label={`Select ${lic.productName}`}
                    />
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                    <Link to={`/software/licenses/${lic.id}`} className="hover:text-foreground hover:underline">
                      {lic.licenseNumber}
                    </Link>
                  </td>
                  <td className="px-4 py-3 font-medium">
                    <Link to={`/software/licenses/${lic.id}`} className="hover:underline">
                      {lic.productName}
                    </Link>
                    {lic.edition && <span className="text-xs text-muted-foreground ml-1">({lic.edition})</span>}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{lic.vendor ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {lic.customLicenseType ? (
                      <span className="inline-flex items-center gap-1.5">
                        {lic.customLicenseType.color && (
                          <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: lic.customLicenseType.color }} />
                        )}
                        {lic.customLicenseType.name}
                      </span>
                    ) : (
                      SOFTWARE_LICENSE_TYPE_LABEL[lic.licenseType]
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{SOFTWARE_PLATFORM_LABEL[lic.platform]}</td>
                  <td className="px-4 py-3 w-36">
                    <UtilizationBar consumed={lic.consumedSeats} total={lic.totalSeats} />
                  </td>
                  <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                    {lic.renewalDate ? (
                      <span className={isExpiringSoon ? "text-amber-600 font-medium flex items-center gap-1" : ""}>
                        {isExpiringSoon && <AlertTriangle className="w-3 h-3" />}
                        {new Date(lic.renewalDate).toLocaleDateString()}
                      </span>
                    ) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs border ${statusColor}`}>
                      {SOFTWARE_LICENSE_STATUS_LABEL[lic.status]}
                    </span>
                  </td>
                  <td className="px-2 py-3">
                    <button
                      onClick={() => setConfirmDelete({ ids: [lic.id], label: lic.productName })}
                      className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                      aria-label={`Delete ${lic.productName}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
            {!isLoading && data?.items.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-12 text-center text-muted-foreground">
                  No licenses match your filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{data.total} licenses</span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span>Page {page} of {data.totalPages}</span>
            <Button variant="outline" size="sm" disabled={page >= data.totalPages} onClick={() => setPage(p => p + 1)}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Confirm delete dialog */}
      <AlertDialog open={!!confirmDelete} onOpenChange={open => !open && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Move {confirmDelete?.label} to trash?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDelete && confirmDelete.ids.length > 1
                ? `${confirmDelete.ids.length} licenses will be moved to the trash. `
                : "This license will be moved to the trash. "}
              You can restore it from Settings → Trash within the configured retention window before it's permanently purged.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteMutation.error && <ErrorAlert error={deleteMutation.error} fallback="Failed to delete" />}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteMutation.isPending}
              onClick={e => {
                e.preventDefault();
                if (confirmDelete) deleteMutation.mutate(confirmDelete.ids);
              }}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? "Moving…" : "Move to trash"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
