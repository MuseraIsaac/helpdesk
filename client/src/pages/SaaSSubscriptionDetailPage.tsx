import { useState } from "react";
import { useParams, Link } from "react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import {
  SAAS_CATEGORY_LABEL, SAAS_SUBSCRIPTION_STATUS_LABEL, SAAS_SUBSCRIPTION_STATUS_COLOR,
  SAAS_BILLING_CYCLE_LABEL,
  type SaaSSubscriptionDetail, type SaaSUserAssignmentRecord,
} from "core/constants/software.ts";
import { assignSaaSUserSchema, type AssignSaaSUserInput } from "core/schemas/software.ts";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Form, FormField, FormItem, FormLabel, FormControl, FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import ErrorAlert from "@/components/ErrorAlert";
import {
  Cloud, ChevronLeft, ExternalLink, UserPlus, UserMinus,
  DollarSign, Calendar, Shield, Users, AlertTriangle,
} from "lucide-react";

// ── Provision user dialog ─────────────────────────────────────────────────────

function ProvisionUserDialog({ subscriptionId, onProvisioned }: { subscriptionId: number; onProvisioned: () => void }) {
  const [open, setOpen] = useState(false);
  const form = useForm<AssignSaaSUserInput>({
    resolver: zodResolver(assignSaaSUserSchema),
    defaultValues: {},
  });

  const mutation = useMutation({
    mutationFn: (data: AssignSaaSUserInput) =>
      axios.post(`/api/saas-subscriptions/${subscriptionId}/users`, data).then(r => r.data),
    onSuccess: () => { onProvisioned(); setOpen(false); form.reset(); },
  });

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <UserPlus className="w-4 h-4 mr-1.5" />Provision User
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Provision User</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(d => mutation.mutate(d))} className="space-y-3">
              <FormField control={form.control} name="userId" render={({ field }) => (
                <FormItem>
                  <FormLabel>User ID *</FormLabel>
                  <FormControl><Input placeholder="Enter user ID" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="role" render={({ field }) => (
                <FormItem>
                  <FormLabel>Role in App</FormLabel>
                  <FormControl><Input placeholder="e.g. admin, editor, viewer" {...field} value={field.value ?? ""} /></FormControl>
                </FormItem>
              )} />
              <FormField control={form.control} name="note" render={({ field }) => (
                <FormItem>
                  <FormLabel>Note</FormLabel>
                  <FormControl><Input placeholder="Optional note" {...field} value={field.value ?? ""} /></FormControl>
                </FormItem>
              )} />
              <ErrorAlert error={mutation.error} fallback="Failed to provision user" />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={mutation.isPending}>
                  {mutation.isPending ? "Provisioning…" : "Provision"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── User assignment row ───────────────────────────────────────────────────────

function UserAssignmentRow({
  assignment, subscriptionId, onRemoved,
}: {
  assignment: SaaSUserAssignmentRecord;
  subscriptionId: number;
  onRemoved: () => void;
}) {
  const remove = useMutation({
    mutationFn: () =>
      axios.delete(`/api/saas-subscriptions/${subscriptionId}/users/${assignment.id}`),
    onSuccess: onRemoved,
  });

  const daysSinceActive = assignment.lastActiveAt
    ? Math.floor((Date.now() - new Date(assignment.lastActiveAt).getTime()) / 86_400_000)
    : null;

  const isDormant = daysSinceActive !== null && daysSinceActive > 90;

  return (
    <div className="flex items-center justify-between py-3 border-b last:border-0">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-sm font-medium text-muted-foreground shrink-0">
          {assignment.user.name.charAt(0).toUpperCase()}
        </div>
        <div>
          <p className="font-medium text-sm">{assignment.user.name}</p>
          <p className="text-xs text-muted-foreground">{assignment.user.email}</p>
        </div>
      </div>
      <div className="flex items-center gap-4 text-right">
        {assignment.role && (
          <span className="px-2 py-0.5 rounded-md bg-muted text-xs text-muted-foreground">{assignment.role}</span>
        )}
        {isDormant && (
          <span className="text-xs text-amber-600 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />Dormant {daysSinceActive}d
          </span>
        )}
        <div className="text-xs text-muted-foreground">
          {assignment.lastActiveAt
            ? `Active ${new Date(assignment.lastActiveAt).toLocaleDateString()}`
            : `Since ${new Date(assignment.assignedAt).toLocaleDateString()}`}
        </div>
        <Button
          size="sm" variant="ghost"
          className="text-destructive hover:text-destructive"
          disabled={remove.isPending}
          onClick={() => remove.mutate()}
        >
          <UserMinus className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SaaSSubscriptionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();

  const { data: sub, isLoading, error } = useQuery<SaaSSubscriptionDetail>({
    queryKey: ["saas-subscription", id],
    queryFn: () => axios.get(`/api/saas-subscriptions/${id}`).then(r => r.data),
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["saas-subscription", id] });
    queryClient.invalidateQueries({ queryKey: ["saas-subscriptions"] });
  }

  if (isLoading) return (
    <div className="p-6 space-y-4">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-48 w-full" />
    </div>
  );

  if (error || !sub) return (
    <div className="p-6">
      <ErrorAlert error={error} fallback="Subscription not found" />
    </div>
  );

  const statusColor = SAAS_SUBSCRIPTION_STATUS_COLOR[sub.status];
  const isOverLimit = sub.totalSeats !== null && sub.consumedSeats > sub.totalSeats;
  const utilizationPct = sub.totalSeats ? Math.round((sub.consumedSeats / sub.totalSeats) * 100) : null;
  const fmtMoney = (v: string | null) => v ? `${sub.currency} ${parseFloat(v).toLocaleString()}` : "—";

  const dormantUsers = sub.userAssignments.filter(a => {
    if (!a.lastActiveAt) return false;
    return (Date.now() - new Date(a.lastActiveAt).getTime()) / 86_400_000 > 90;
  });

  return (
    <div className="p-6 space-y-5 max-w-5xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link to="/software/saas" className="hover:text-foreground flex items-center gap-1">
          <ChevronLeft className="w-3.5 h-3.5" />SaaS Subscriptions
        </Link>
        <span>/</span>
        <span className="text-foreground">{sub.subscriptionNumber}</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-sky-100 dark:bg-sky-900/30 flex items-center justify-center">
            <Cloud className="w-5 h-5 text-sky-600 dark:text-sky-400" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">{sub.appName}</h1>
            <p className="text-sm text-muted-foreground">
              {sub.vendor && `${sub.vendor} · `}
              {sub.subscriptionNumber} · {SAAS_CATEGORY_LABEL[sub.category]}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {sub.url && (
            <a href={sub.url} target="_blank" rel="noreferrer">
              <Button variant="outline" size="sm">
                <ExternalLink className="w-4 h-4 mr-1.5" />Open App
              </Button>
            </a>
          )}
          <span className={`px-2.5 py-0.5 rounded-full text-xs border ${statusColor}`}>
            {SAAS_SUBSCRIPTION_STATUS_LABEL[sub.status]}
          </span>
        </div>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          {
            label: "Users Provisioned",
            value: sub.totalSeats !== null ? `${sub.consumedSeats}/${sub.totalSeats}` : String(sub.consumedSeats),
            color: isOverLimit ? "text-destructive" : "text-foreground",
            icon: Users,
          },
          {
            label: "Utilization",
            value: utilizationPct !== null ? `${utilizationPct}%` : "Unlimited",
            color: utilizationPct && utilizationPct > 90 ? "text-amber-600" : "text-foreground",
            icon: AlertTriangle,
          },
          {
            label: "Monthly Spend",
            value: fmtMoney(sub.monthlyAmount),
            color: "text-foreground",
            icon: DollarSign,
          },
          {
            label: "Renewal",
            value: sub.renewalDate ? new Date(sub.renewalDate).toLocaleDateString() : "—",
            color: sub.daysUntilRenewal !== null && sub.daysUntilRenewal <= 30 ? "text-amber-600" : "text-foreground",
            icon: Calendar,
          },
        ].map(s => (
          <div key={s.label} className="rounded-lg border bg-card p-3 flex items-center gap-2">
            <s.icon className={`w-4 h-4 shrink-0 ${s.color}`} />
            <div>
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className={`text-lg font-semibold tabular-nums ${s.color}`}>{s.value}</p>
            </div>
          </div>
        ))}
      </div>

      {dormantUsers.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800 p-3 flex items-start gap-2 text-sm">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <span className="text-amber-800 dark:text-amber-300">
            <strong>{dormantUsers.length}</strong> user{dormantUsers.length !== 1 ? "s have" : " has"} been inactive for 90+ days.
            Consider deprovisioning to recover seats.
          </span>
        </div>
      )}

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="users">
            Users ({sub.consumedSeats}{sub.totalSeats ? `/${sub.totalSeats}` : ""})
          </TabsTrigger>
        </TabsList>

        {/* Overview tab */}
        <TabsContent value="overview" className="space-y-4 mt-4">
          <div className="grid md:grid-cols-2 gap-4">
            {/* Plan & billing */}
            <div className="rounded-lg border bg-card p-4 space-y-3">
              <h3 className="font-medium text-sm flex items-center gap-1.5">
                <Shield className="w-4 h-4 text-muted-foreground" />Plan & Billing
              </h3>
              {[
                { label: "Plan",         value: sub.plan },
                { label: "Billing",      value: SAAS_BILLING_CYCLE_LABEL[sub.billingCycle] },
                { label: "Auto-Renews",  value: sub.autoRenews ? "Yes" : "No" },
                { label: "Admin Email",  value: sub.adminEmail },
                { label: "Spend Category", value: sub.spendCategory },
                { label: "Discovery Source", value: sub.discoverySource },
              ].map(({ label, value }) => value ? (
                <div key={label} className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="font-medium">{value}</span>
                </div>
              ) : null)}
            </div>

            {/* Financial */}
            <div className="rounded-lg border bg-card p-4 space-y-3">
              <h3 className="font-medium text-sm flex items-center gap-1.5">
                <DollarSign className="w-4 h-4 text-muted-foreground" />Financial
              </h3>
              {[
                { label: "Monthly Amount", value: fmtMoney(sub.monthlyAmount) },
                { label: "Annual Amount",  value: fmtMoney(sub.annualAmount) },
                { label: "Start Date",     value: sub.startDate    ? new Date(sub.startDate).toLocaleDateString()    : null },
                { label: "Renewal Date",   value: sub.renewalDate  ? new Date(sub.renewalDate).toLocaleDateString()  : null },
                { label: "Trial Ends",     value: sub.trialEndDate ? new Date(sub.trialEndDate).toLocaleDateString() : null },
              ].map(({ label, value }) => value && value !== "—" ? (
                <div key={label} className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="font-medium">{value}</span>
                </div>
              ) : null)}
            </div>

            {sub.notes && (
              <div className="rounded-lg border bg-card p-4 md:col-span-2">
                <h3 className="font-medium text-sm mb-2">Notes</h3>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{sub.notes}</p>
              </div>
            )}
          </div>
        </TabsContent>

        {/* Users tab */}
        <TabsContent value="users" className="mt-4">
          <div className="rounded-lg border bg-card">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <div>
                <h3 className="font-medium text-sm">Provisioned Users</h3>
                <p className="text-xs text-muted-foreground">
                  {sub.consumedSeats} active user{sub.consumedSeats !== 1 ? "s" : ""}
                  {sub.totalSeats !== null ? ` of ${sub.totalSeats} licensed seats` : ""}
                </p>
              </div>
              <ProvisionUserDialog subscriptionId={Number(id)} onProvisioned={invalidate} />
            </div>
            <div className="px-4">
              {sub.userAssignments.length === 0 ? (
                <p className="text-muted-foreground text-sm py-8 text-center">
                  No users provisioned yet. Click "Provision User" to add access.
                </p>
              ) : (
                sub.userAssignments.map(a => (
                  <UserAssignmentRow
                    key={a.id}
                    assignment={a}
                    subscriptionId={Number(id)}
                    onRemoved={invalidate}
                  />
                ))
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
