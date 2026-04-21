import { useState } from "react";
import { Link } from "react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import {
  SAAS_CATEGORY_LABEL, SAAS_SUBSCRIPTION_STATUS_LABEL, SAAS_SUBSCRIPTION_STATUS_COLOR,
  SAAS_BILLING_CYCLE_LABEL, SAAS_CATEGORIES, SAAS_SUBSCRIPTION_STATUSES,
  type SaaSSubscriptionSummary, type SaaSSubscriptionStatus,
} from "core/constants/software.ts";
import { createSaaSSubscriptionSchema, type CreateSaaSSubscriptionInput } from "core/schemas/software.ts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Form, FormField, FormItem, FormLabel, FormControl, FormMessage,
} from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import ErrorAlert from "@/components/ErrorAlert";
import {
  Cloud, Search, ChevronLeft, ChevronRight, Plus, AlertTriangle,
  DollarSign, Users, TrendingUp, Clock,
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
          className={`h-1.5 rounded-full ${isOver ? "bg-destructive" : pct > 80 ? "bg-amber-500" : "bg-emerald-500"}`}
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
      setOpen(false);
      form.reset();
      onCreated();
    },
  });

  return (
    <>
      <Button onClick={() => setOpen(true)} size="sm">
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
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        {SAAS_CATEGORIES.map(c => (
                          <SelectItem key={c} value={c}>{SAAS_CATEGORY_LABEL[c]}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
  const PAGE_SIZE = 25;

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

  function handleChip(key: string) { setChipKey(key); setPage(1); }

  const fmtCurrency = (v: string | null | undefined, currency = "USD") =>
    v ? `${currency} ${parseFloat(v).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : "—";

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Cloud className="w-6 h-6 text-sky-500" />
            SaaS Subscriptions
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage cloud applications, track users, and control spend.
          </p>
        </div>
        <NewSubscriptionDialog onCreated={() => {}} />
      </div>

      {/* Stats bar */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Total Apps",    value: String(stats.total),   icon: Cloud,       color: "text-muted-foreground" },
            { label: "Active",        value: String(stats.active),  icon: TrendingUp,  color: "text-emerald-600" },
            { label: "Monthly Spend", value: fmtCurrency(stats.totalMonthlySpend), icon: DollarSign, color: "text-sky-600" },
            { label: "Renewing <30d", value: String(stats.expiring30), icon: Clock,    color: "text-amber-600" },
          ].map(s => (
            <div key={s.label} className="rounded-lg border bg-card p-4 flex items-center gap-3">
              <s.icon className={`w-5 h-5 shrink-0 ${s.color}`} />
              <div>
                <p className="text-2xl font-semibold tabular-nums">{s.value}</p>
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

      {error && <ErrorAlert error={error} fallback="Failed to load subscriptions" />}

      {/* Table */}
      <div className="rounded-lg border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40">
              {["Sub #", "App", "Category", "Plan / Billing", "Users", "Monthly Cost", "Renewal", "Status"].map(h => (
                <th key={h} className="px-4 py-2.5 text-left font-medium text-muted-foreground whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading && Array.from({ length: 8 }).map((_, i) => (
              <tr key={i} className="border-b animate-pulse">
                {Array.from({ length: 8 }).map((_, j) => (
                  <td key={j} className="px-4 py-3"><div className="h-4 bg-muted rounded w-24" /></td>
                ))}
              </tr>
            ))}
            {!isLoading && data?.items.map(sub => {
              const statusColor = SAAS_SUBSCRIPTION_STATUS_COLOR[sub.status];
              const renewingSoon = sub.daysUntilRenewal !== null && sub.daysUntilRenewal <= 30 && sub.daysUntilRenewal >= 0;
              return (
                <tr key={sub.id} className="border-b hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                    <Link to={`/software/saas/${sub.id}`} className="hover:text-foreground hover:underline">
                      {sub.subscriptionNumber}
                    </Link>
                  </td>
                  <td className="px-4 py-3 font-medium">
                    <Link to={`/software/saas/${sub.id}`} className="hover:underline">{sub.appName}</Link>
                    {sub.vendor && <p className="text-xs text-muted-foreground">{sub.vendor}</p>}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{SAAS_CATEGORY_LABEL[sub.category]}</td>
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
                </tr>
              );
            })}
            {!isLoading && data?.items.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">
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
    </div>
  );
}
