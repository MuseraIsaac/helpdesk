import { useState, useMemo } from "react";
import { Link } from "react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import {
  SAAS_CATEGORY_LABEL, SAAS_SUBSCRIPTION_STATUS_LABEL, SAAS_SUBSCRIPTION_STATUS_COLOR,
  SAAS_BILLING_CYCLE_LABEL, SAAS_CATEGORIES,
  type SaaSSubscriptionSummary, type SaaSSubscriptionStatus,
} from "core/constants/software.ts";
import { createSaaSSubscriptionSchema, type CreateSaaSSubscriptionInput } from "core/schemas/software.ts";
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
import ErrorAlert from "@/components/ErrorAlert";
import CustomTagPicker from "@/components/CustomTagPicker";
import {
  Cloud, Search, ChevronLeft, ChevronRight, Plus, AlertTriangle,
  DollarSign, TrendingUp, Clock, Trash2, X,
} from "lucide-react";

interface Stats {
  total: number;
  active: number;
  expiring30: number;
  cancelled: number;
  totalMonthlySpend: string;
  totalAnnualSpend: string;
}

interface PagedResponse {
  items: SaaSSubscriptionSummary[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ── Utilization bar ───────────────────────────────────────────────────────────

function SeatsDisplay({ consumed, total }: { consumed: number; total: number | null }) {
  if (total === null) return <span className="text-muted-foreground text-xs">{consumed} users</span>;
  const pct = total > 0 ? Math.min((consumed / total) * 100, 100) : 0;
  const isOver = consumed > total;
  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className="flex-1 bg-muted rounded-full h-1.5 min-w-[50px]">
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

// ── New Subscription dialog ───────────────────────────────────────────────────

function NewSubscriptionDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const form = useForm<CreateSaaSSubscriptionInput>({
    resolver: zodResolver(createSaaSSubscriptionSchema),
    defaultValues: { category: "other", status: "active", billingCycle: "annual", autoRenews: true, currency: "USD" },
  });
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (data: CreateSaaSSubscriptionInput) =>
      axios.post<SaaSSubscriptionSummary>("/api/saas-subscriptions", data).then(r => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["saas-subscriptions"] });
      queryClient.invalidateQueries({ queryKey: ["saas-stats"] });
      setOpen(false);
      form.reset();
      onCreated();
    },
  });

  return (
    <>
      <Button onClick={() => setOpen(true)} size="sm" className="shadow-sm">
        <Plus className="w-4 h-4 mr-1.5" />New Subscription
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add SaaS Subscription</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(d => mutation.mutate(d))} className="space-y-4">
              <FormField control={form.control} name="appName" render={({ field }) => (
                <FormItem>
                  <FormLabel>App Name *</FormLabel>
                  <FormControl><Input placeholder="e.g. Slack, Notion, GitHub" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <div className="grid grid-cols-2 gap-3">
                <FormField control={form.control} name="vendor" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Vendor</FormLabel>
                    <FormControl><Input placeholder="e.g. Slack Technologies" {...field} value={field.value ?? ""} /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="category" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category</FormLabel>
                    <FormControl>
                      <CustomTagPicker
                        endpoint="/api/saas-categories"
                        queryKey="saas-categories"
                        builtins={SAAS_CATEGORIES.map((c) => ({ value: c, label: SAAS_CATEGORY_LABEL[c] }))}
                        builtinValue={field.value}
                        customId={form.watch("customCategoryId") ?? null}
                        noun="category"
                        onChange={(sel) => {
                          if (sel.kind === "builtin") {
                            field.onChange(sel.value);
                            form.setValue("customCategoryId", null);
                          } else {
                            // Custom selected — keep enum at "other" as fallback,
                            // store the custom id on the row.
                            field.onChange("other");
                            form.setValue("customCategoryId", sel.id);
                          }
                        }}
                      />
                    </FormControl>
                  </FormItem>
                )} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <FormField control={form.control} name="plan" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Plan</FormLabel>
                    <FormControl><Input placeholder="e.g. Business, Pro" {...field} value={field.value ?? ""} /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="totalSeats" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Licensed Seats</FormLabel>
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
              <div className="grid grid-cols-3 gap-3">
                <FormField control={form.control} name="monthlyAmount" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Monthly Cost</FormLabel>
                    <FormControl><Input placeholder="0.00" {...field} value={field.value ?? ""} /></FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="annualAmount" render={({ field }) => (
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
              <FormField control={form.control} name="renewalDate" render={({ field }) => (
                <FormItem>
                  <FormLabel>Renewal Date</FormLabel>
                  <FormControl><Input type="date" {...field} value={field.value ?? ""} /></FormControl>
                </FormItem>
              )} />
              <ErrorAlert error={mutation.error} fallback="Failed to add subscription" />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={mutation.isPending}>
                  {mutation.isPending ? "Adding…" : "Add Subscription"}
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

type FilterChip = { key: string; label: string; status?: SaaSSubscriptionStatus; extra?: Record<string, string> };

const FILTER_CHIPS: FilterChip[] = [
  { key: "all",       label: "All" },
  { key: "active",    label: "Active",        status: "active" },
  { key: "expiring",  label: "Renewing Soon", extra: { renewingDays: "30" } },
  { key: "trial",     label: "Trial",         status: "trial" },
  { key: "cancelled", label: "Cancelled",     status: "cancelled" },
];

export default function SaaSSubscriptionsPage() {
  const [chipKey,      setChipKey]      = useState("all");
  const [search,       setSearch]       = useState("");
  const [catFilter,    setCatFilter]    = useState<string>("");
  const [page,         setPage]         = useState(1);
  const [selected,     setSelected]     = useState<Set<number>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState<{ ids: number[]; label: string } | null>(null);
  const PAGE_SIZE = 25;
  const queryClient = useQueryClient();

  const params: Record<string, string> = {
    page: String(page), pageSize: String(PAGE_SIZE),
  };
  if (search)    params.search   = search;
  if (catFilter) params.category = catFilter;

  const chip = FILTER_CHIPS.find(c => c.key === chipKey);
  if (chip?.status)      params.status      = chip.status;
  if (chip?.extra)       Object.assign(params, chip.extra);

  const { data: stats } = useQuery<Stats>({
    queryKey: ["saas-stats"],
    queryFn: () => axios.get("/api/saas-subscriptions/stats").then(r => r.data),
  });

  const { data, isLoading, error } = useQuery<PagedResponse>({
    queryKey: ["saas-subscriptions", params],
    queryFn:  () => axios.get("/api/saas-subscriptions", { params }).then(r => r.data),
    placeholderData: prev => prev,
  });

  const deleteMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      if (ids.length === 1) {
        await axios.delete(`/api/saas-subscriptions/${ids[0]}`);
      } else {
        await axios.post("/api/saas-subscriptions/bulk-delete", { ids });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["saas-subscriptions"] });
      queryClient.invalidateQueries({ queryKey: ["saas-stats"] });
      setSelected(new Set());
      setConfirmDelete(null);
    },
  });

  function handleChip(key: string) { setChipKey(key); setPage(1); setSelected(new Set()); }

  const fmtCurrency = (v: string | null | undefined, currency = "USD") =>
    v ? `${currency} ${parseFloat(v).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : "—";

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
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-sky-500/15 to-blue-600/15 border border-sky-500/20">
            <Cloud className="w-6 h-6 text-sky-500" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">SaaS Subscriptions</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Manage cloud applications, track users, and control spend.
            </p>
          </div>
        </div>
        <NewSubscriptionDialog onCreated={() => {}} />
      </div>

      {/* Stats bar */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Total Apps",    value: String(stats.total),                  icon: Cloud,       accent: "from-slate-500/10 to-slate-500/5",       iconColor: "text-slate-500" },
            { label: "Active",        value: String(stats.active),                 icon: TrendingUp,  accent: "from-emerald-500/10 to-emerald-500/5",   iconColor: "text-emerald-600" },
            { label: "Monthly Spend", value: fmtCurrency(stats.totalMonthlySpend), icon: DollarSign,  accent: "from-sky-500/10 to-sky-500/5",           iconColor: "text-sky-600" },
            { label: "Renewing <30d", value: String(stats.expiring30),             icon: Clock,       accent: "from-amber-500/10 to-amber-500/5",       iconColor: "text-amber-600" },
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
          {FILTER_CHIPS.map(c => (
            <button
              key={c.key}
              onClick={() => handleChip(c.key)}
              className={`px-3 py-1 rounded-full text-sm border transition-colors ${
                chipKey === c.key
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border hover:bg-muted"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
        <div className="flex-1 flex gap-2 min-w-0">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search app, vendor…"
              className="pl-8 h-8 text-sm"
            />
          </div>
          <Select value={catFilter} onValueChange={v => { setCatFilter(v === "all" ? "" : v); setPage(1); }}>
            <SelectTrigger className="h-8 w-44 text-sm">
              <SelectValue placeholder="All Categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {SAAS_CATEGORIES.map(c => (
                <SelectItem key={c} value={c}>{SAAS_CATEGORY_LABEL[c]}</SelectItem>
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
            onClick={() => setConfirmDelete({ ids: [...selected], label: `${selected.size} subscriptions` })}
          >
            <Trash2 className="w-4 h-4 mr-1.5" /> Delete selected
          </Button>
        </div>
      )}

      {error && <ErrorAlert error={error} fallback="Failed to load subscriptions" />}

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
              {["Sub #", "App", "Category", "Plan / Billing", "Users", "Monthly Cost", "Renewal", "Status"].map(h => (
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
            {!isLoading && data?.items.map(sub => {
              const statusColor = SAAS_SUBSCRIPTION_STATUS_COLOR[sub.status];
              const renewingSoon = sub.daysUntilRenewal !== null && sub.daysUntilRenewal <= 30 && sub.daysUntilRenewal >= 0;
              const isSelected = selected.has(sub.id);
              return (
                <tr
                  key={sub.id}
                  className={`border-b transition-colors group ${isSelected ? "bg-primary/5" : "hover:bg-muted/30"}`}
                >
                  <td className="px-3 py-3">
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggleOne(sub.id)}
                      aria-label={`Select ${sub.appName}`}
                    />
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                    <Link to={`/software/saas/${sub.id}`} className="hover:text-foreground hover:underline">
                      {sub.subscriptionNumber}
                    </Link>
                  </td>
                  <td className="px-4 py-3 font-medium">
                    <Link to={`/software/saas/${sub.id}`} className="hover:underline">{sub.appName}</Link>
                    {sub.vendor && <p className="text-xs text-muted-foreground">{sub.vendor}</p>}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {sub.customCategory ? (
                      <span className="inline-flex items-center gap-1.5">
                        {sub.customCategory.color && (
                          <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: sub.customCategory.color }} />
                        )}
                        {sub.customCategory.name}
                      </span>
                    ) : (
                      SAAS_CATEGORY_LABEL[sub.category]
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    <div>{sub.plan ?? "—"}</div>
                    <div className="text-xs">{SAAS_BILLING_CYCLE_LABEL[sub.billingCycle]}</div>
                  </td>
                  <td className="px-4 py-3 w-32">
                    <SeatsDisplay consumed={sub.consumedSeats} total={sub.totalSeats} />
                  </td>
                  <td className="px-4 py-3 text-muted-foreground tabular-nums">
                    {fmtCurrency(sub.monthlyAmount, sub.currency)}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                    {sub.renewalDate ? (
                      <span className={renewingSoon ? "text-amber-600 font-medium flex items-center gap-1" : ""}>
                        {renewingSoon && <AlertTriangle className="w-3 h-3" />}
                        {new Date(sub.renewalDate).toLocaleDateString()}
                      </span>
                    ) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs border ${statusColor}`}>
                      {SAAS_SUBSCRIPTION_STATUS_LABEL[sub.status]}
                    </span>
                  </td>
                  <td className="px-2 py-3">
                    <button
                      onClick={() => setConfirmDelete({ ids: [sub.id], label: sub.appName })}
                      className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                      aria-label={`Delete ${sub.appName}`}
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
                  No subscriptions match your filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{data.total} subscriptions</span>
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
                ? `${confirmDelete.ids.length} subscriptions will be moved to the trash. `
                : "This subscription will be moved to the trash. "}
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
