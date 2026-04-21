import { useState } from "react";
import { useParams, Link } from "react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import {
  SOFTWARE_LICENSE_TYPE_LABEL, SOFTWARE_LICENSE_STATUS_LABEL,
  SOFTWARE_LICENSE_STATUS_COLOR, SOFTWARE_PLATFORM_LABEL,
  type SoftwareLicenseDetail, type LicenseAssignmentRecord,
} from "core/constants/software.ts";
import { assignLicenseSeatSchema, type AssignLicenseSeatInput } from "core/schemas/software.ts";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Form, FormField, FormItem, FormLabel, FormControl, FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import ErrorAlert from "@/components/ErrorAlert";
import {
  Key, ChevronLeft, Eye, EyeOff, User, Monitor, UserMinus, UserPlus,
  Calendar, DollarSign, Tag, Package, AlertTriangle, Copy,
} from "lucide-react";
import { toast } from "sonner";

// ── Masked key display ────────────────────────────────────────────────────────

function LicenseKeyField({ licenseKey }: { licenseKey: string | null }) {
  const [visible, setVisible] = useState(false);
  if (!licenseKey) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-sm break-all">
        {visible ? licenseKey : "•".repeat(Math.min(licenseKey.length, 20))}
      </span>
      <button onClick={() => setVisible(v => !v)} className="text-muted-foreground hover:text-foreground shrink-0">
        {visible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
      <button
        onClick={() => { navigator.clipboard.writeText(licenseKey); toast.success("Copied to clipboard"); }}
        className="text-muted-foreground hover:text-foreground shrink-0"
      >
        <Copy className="w-4 h-4" />
      </button>
    </div>
  );
}

// ── Assign seat dialog ────────────────────────────────────────────────────────

function AssignSeatDialog({ licenseId, onAssigned }: { licenseId: number; onAssigned: () => void }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"user" | "device">("user");
  const form = useForm<AssignLicenseSeatInput>({
    resolver: zodResolver(assignLicenseSeatSchema),
    defaultValues: {},
  });

  const mutation = useMutation({
    mutationFn: (data: AssignLicenseSeatInput) =>
      axios.post(`/api/software-licenses/${licenseId}/assignments`, data).then(r => r.data),
    onSuccess: () => {
      onAssigned();
      setOpen(false);
      form.reset();
    },
  });

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <UserPlus className="w-4 h-4 mr-1.5" />Assign Seat
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Assign License Seat</DialogTitle>
          </DialogHeader>
          <div className="flex gap-2 mb-2">
            <button
              onClick={() => { setMode("user"); form.setValue("assignedToAssetId", undefined); }}
              className={`px-3 py-1 rounded-full text-sm border ${mode === "user" ? "bg-primary text-primary-foreground border-primary" : "border-border"}`}
            >
              <User className="w-3 h-3 inline mr-1" />User
            </button>
            <button
              onClick={() => { setMode("device"); form.setValue("assignedToUserId", undefined); }}
              className={`px-3 py-1 rounded-full text-sm border ${mode === "device" ? "bg-primary text-primary-foreground border-primary" : "border-border"}`}
            >
              <Monitor className="w-3 h-3 inline mr-1" />Device
            </button>
          </div>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(d => mutation.mutate(d))} className="space-y-3">
              {mode === "user" ? (
                <FormField control={form.control} name="assignedToUserId" render={({ field }) => (
                  <FormItem>
                    <FormLabel>User ID</FormLabel>
                    <FormControl><Input placeholder="Enter user ID" {...field} value={field.value ?? ""} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              ) : (
                <FormField control={form.control} name="assignedToAssetId" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Asset ID</FormLabel>
                    <FormControl>
                      <Input
                        type="number" placeholder="Enter asset ID"
                        {...field}
                        value={field.value ?? ""}
                        onChange={e => field.onChange(e.target.value ? Number(e.target.value) : undefined)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              )}
              <FormField control={form.control} name="note" render={({ field }) => (
                <FormItem>
                  <FormLabel>Note</FormLabel>
                  <FormControl><Input placeholder="Optional note" {...field} value={field.value ?? ""} /></FormControl>
                </FormItem>
              )} />
              <ErrorAlert error={mutation.error} fallback="Failed to assign seat" />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={mutation.isPending}>
                  {mutation.isPending ? "Assigning…" : "Assign Seat"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── Assignment row ────────────────────────────────────────────────────────────

function AssignmentRow({
  assignment, licenseId, onRevoked,
}: {
  assignment: LicenseAssignmentRecord;
  licenseId: number;
  onRevoked: () => void;
}) {
  const revoke = useMutation({
    mutationFn: () =>
      axios.delete(`/api/software-licenses/${licenseId}/assignments/${assignment.id}`),
    onSuccess: onRevoked,
  });

  const who = assignment.assignedToUser
    ? { label: assignment.assignedToUser.name, sub: assignment.assignedToUser.email, icon: <User className="w-4 h-4" /> }
    : assignment.assignedToAsset
    ? { label: assignment.assignedToAsset.name, sub: assignment.assignedToAsset.assetNumber, icon: <Monitor className="w-4 h-4" /> }
    : { label: "Unknown", sub: "", icon: <Package className="w-4 h-4" /> };

  return (
    <div className="flex items-center justify-between py-3 border-b last:border-0">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-muted-foreground shrink-0">
          {who.icon}
        </div>
        <div>
          <p className="font-medium text-sm">{who.label}</p>
          <p className="text-xs text-muted-foreground">{who.sub}</p>
        </div>
      </div>
      <div className="flex items-center gap-4 text-right">
        <div>
          <p className="text-xs text-muted-foreground">Assigned</p>
          <p className="text-sm">{new Date(assignment.assignedAt).toLocaleDateString()}</p>
        </div>
        <Button
          size="sm" variant="ghost"
          className="text-destructive hover:text-destructive"
          disabled={revoke.isPending}
          onClick={() => revoke.mutate()}
        >
          <UserMinus className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SoftwareLicenseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();

  const { data: license, isLoading, error } = useQuery<SoftwareLicenseDetail>({
    queryKey: ["software-license", id],
    queryFn: () => axios.get(`/api/software-licenses/${id}`).then(r => r.data),
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["software-license", id] });
    queryClient.invalidateQueries({ queryKey: ["software-licenses"] });
  }

  if (isLoading) return (
    <div className="p-6 space-y-4">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-48 w-full" />
    </div>
  );

  if (error || !license) return (
    <div className="p-6">
      <ErrorAlert error={error} fallback="License not found" />
    </div>
  );

  const statusColor = SOFTWARE_LICENSE_STATUS_COLOR[license.status];
  const isOverLimit = license.totalSeats !== null && license.consumedSeats > license.totalSeats;
  const utilizationPct = license.totalSeats
    ? Math.round((license.consumedSeats / license.totalSeats) * 100)
    : null;

  return (
    <div className="p-6 space-y-5 max-w-5xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link to="/software/licenses" className="hover:text-foreground flex items-center gap-1">
          <ChevronLeft className="w-3.5 h-3.5" />Software Licenses
        </Link>
        <span>/</span>
        <span className="text-foreground">{license.licenseNumber}</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
            <Key className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">{license.productName}</h1>
            <p className="text-sm text-muted-foreground">
              {license.vendor && `${license.vendor} · `}
              {license.licenseNumber} · {SOFTWARE_LICENSE_TYPE_LABEL[license.licenseType]}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`px-2.5 py-0.5 rounded-full text-xs border ${statusColor}`}>
            {SOFTWARE_LICENSE_STATUS_LABEL[license.status]}
          </span>
          {isOverLimit && (
            <span className="px-2.5 py-0.5 rounded-full text-xs border bg-destructive/10 text-destructive border-destructive/20 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />Over Limit
            </span>
          )}
        </div>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          {
            label: "Seats Used",
            value: license.totalSeats !== null
              ? `${license.consumedSeats} / ${license.totalSeats}`
              : `${license.consumedSeats} / ∞`,
            color: isOverLimit ? "text-destructive" : "text-foreground",
          },
          {
            label: "Utilization",
            value: utilizationPct !== null ? `${utilizationPct}%` : "N/A",
            color: utilizationPct && utilizationPct > 90 ? "text-amber-600" : "text-foreground",
          },
          {
            label: "Renewal Date",
            value: license.renewalDate ? new Date(license.renewalDate).toLocaleDateString() : "—",
            color: license.daysUntilExpiry !== null && license.daysUntilExpiry <= 30 ? "text-amber-600" : "text-foreground",
          },
          {
            label: "Annual Cost",
            value: license.annualCost ? `${license.currency} ${parseFloat(license.annualCost).toLocaleString()}` : "—",
            color: "text-foreground",
          },
        ].map(s => (
          <div key={s.label} className="rounded-lg border bg-card p-3">
            <p className="text-xs text-muted-foreground">{s.label}</p>
            <p className={`text-lg font-semibold tabular-nums ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="seats">
            Seats ({license.consumedSeats}{license.totalSeats ? `/${license.totalSeats}` : ""})
          </TabsTrigger>
        </TabsList>

        {/* Overview tab */}
        <TabsContent value="overview" className="space-y-4 mt-4">
          <div className="grid md:grid-cols-2 gap-4">
            {/* License info */}
            <div className="rounded-lg border bg-card p-4 space-y-3">
              <h3 className="font-medium flex items-center gap-1.5 text-sm">
                <Tag className="w-4 h-4 text-muted-foreground" />License Details
              </h3>
              {[
                { label: "Platform",    value: SOFTWARE_PLATFORM_LABEL[license.platform] },
                { label: "Edition",     value: license.edition },
                { label: "Version",     value: license.version },
                { label: "Reference",   value: license.licenseReference },
                { label: "Auto-Renews", value: license.autoRenews ? "Yes" : "No" },
                { label: "Source",      value: license.discoverySource },
              ].map(({ label, value }) => value ? (
                <div key={label} className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="font-medium text-right max-w-[60%] break-all">{value}</span>
                </div>
              ) : null)}
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">License Key</span>
                <LicenseKeyField licenseKey={license.licenseKey} />
              </div>
            </div>

            {/* Financial & dates */}
            <div className="rounded-lg border bg-card p-4 space-y-3">
              <h3 className="font-medium flex items-center gap-1.5 text-sm">
                <DollarSign className="w-4 h-4 text-muted-foreground" />Financial & Dates
              </h3>
              {[
                { label: "Purchase Date",  value: license.purchaseDate   ? new Date(license.purchaseDate).toLocaleDateString()  : null },
                { label: "Purchase Price", value: license.purchasePrice  ? `${license.currency} ${parseFloat(license.purchasePrice).toLocaleString()}` : null },
                { label: "Annual Cost",    value: license.annualCost     ? `${license.currency} ${parseFloat(license.annualCost).toLocaleString()}`     : null },
                { label: "Start Date",     value: license.startDate      ? new Date(license.startDate).toLocaleDateString()      : null },
                { label: "Expiry Date",    value: license.expiryDate     ? new Date(license.expiryDate).toLocaleDateString()     : null },
                { label: "Renewal Date",   value: license.renewalDate    ? new Date(license.renewalDate).toLocaleDateString()    : null },
                { label: "PO Number",      value: license.poNumber },
                { label: "Invoice",        value: license.invoiceNumber },
              ].map(({ label, value }) => value ? (
                <div key={label} className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="font-medium">{value}</span>
                </div>
              ) : null)}
            </div>

            {/* Vendor */}
            {(license.vendorContact || license.vendorEmail) && (
              <div className="rounded-lg border bg-card p-4 space-y-3">
                <h3 className="font-medium flex items-center gap-1.5 text-sm">
                  <Calendar className="w-4 h-4 text-muted-foreground" />Vendor Contact
                </h3>
                {[
                  { label: "Contact", value: license.vendorContact },
                  { label: "Email",   value: license.vendorEmail },
                ].map(({ label, value }) => value ? (
                  <div key={label} className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="font-medium">{value}</span>
                  </div>
                ) : null)}
              </div>
            )}

            {/* Notes */}
            {license.notes && (
              <div className="rounded-lg border bg-card p-4">
                <h3 className="font-medium text-sm mb-2">Notes</h3>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{license.notes}</p>
              </div>
            )}
          </div>
        </TabsContent>

        {/* Seats tab */}
        <TabsContent value="seats" className="mt-4">
          <div className="rounded-lg border bg-card">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <div>
                <h3 className="font-medium text-sm">Seat Assignments</h3>
                <p className="text-xs text-muted-foreground">
                  {license.consumedSeats} active assignment{license.consumedSeats !== 1 ? "s" : ""}
                  {license.totalSeats !== null ? ` of ${license.totalSeats} available seats` : ""}
                </p>
              </div>
              <AssignSeatDialog licenseId={Number(id)} onAssigned={invalidate} />
            </div>
            <div className="px-4">
              {license.assignments.length === 0 ? (
                <p className="text-muted-foreground text-sm py-8 text-center">
                  No seats assigned yet. Click "Assign Seat" to allocate.
                </p>
              ) : (
                license.assignments.map(a => (
                  <AssignmentRow key={a.id} assignment={a} licenseId={Number(id)} onRevoked={invalidate} />
                ))
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
