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
import SearchableSelect, { type SelectOption } from "@/components/SearchableSelect";
import {
  Key, ChevronLeft, Eye, EyeOff, User, Monitor, UserMinus, UserPlus,
  Calendar, DollarSign, Tag, Package, AlertTriangle, Copy, Mail, Users,
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

interface AgentLite { id: string; name: string; email: string }
interface AssetLite {
  id: number;
  assetNumber: string | null;
  name: string;
  type: string;
  status: string;
  manufacturer: string | null;
  model: string | null;
  assignedTo?: { id: string; name: string } | null;
}

const AVATAR_TONES = [
  "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  "bg-teal-500/15 text-teal-700 dark:text-teal-300",
  "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300",
  "bg-purple-500/15 text-purple-700 dark:text-purple-300",
  "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
];

function avatarTone(name: string): string {
  return AVATAR_TONES[(name.charCodeAt(0) || 0) % AVATAR_TONES.length]!;
}

function AssignSeatDialog({ licenseId, onAssigned }: { licenseId: number; onAssigned: () => void }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"user" | "device">("user");
  const form = useForm<AssignLicenseSeatInput>({
    resolver: zodResolver(assignLicenseSeatSchema),
    defaultValues: {},
  });

  const { data: agents = [], isLoading: loadingAgents } = useQuery<AgentLite[]>({
    queryKey: ["agents"],
    queryFn: () => axios.get<{ agents: AgentLite[] }>("/api/agents").then(r => r.data.agents),
    staleTime: 60_000,
    enabled: open && mode === "user",
  });

  const userOptions: SelectOption[] = agents.map((a) => ({
    value: a.id,
    label: a.name,
    hint: a.email,
    prefix: (
      <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold shrink-0 ${avatarTone(a.name)}`}>
        {a.name.charAt(0).toUpperCase()}
      </span>
    ),
  }));

  // Asset roster — only fetched when the user switches to "device" mode.
  // pageSize is capped server-side at 100 (see listAssetsQuerySchema). We
  // intentionally do NOT pass a `statuses` filter so every non-deleted asset
  // appears in the picker; license-eligibility is a workflow decision the
  // admin can make per-asset rather than a hard server filter.
  const { data: assets = [], isLoading: loadingAssets } = useQuery<AssetLite[]>({
    queryKey: ["assets-for-license-pick"],
    queryFn: () =>
      axios
        .get<{ items: AssetLite[] }>(
          "/api/assets?pageSize=100&sortBy=name&sortOrder=asc",
        )
        .then((r) => r.data.items),
    staleTime: 60_000,
    enabled: open && mode === "device",
  });

  // Format the asset type for the hint (e.g. "end_user_device" → "End-user device")
  const formatAssetType = (t: string) =>
    t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  const assetOptions: SelectOption[] = assets.map((a) => ({
    value: String(a.id),
    label: a.name,
    hint: [a.assetNumber, formatAssetType(a.type)].filter(Boolean).join(" · "),
    prefix: (
      <span className="flex h-6 w-6 items-center justify-center rounded-md bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 shrink-0">
        <Monitor className="h-3 w-3" />
      </span>
    ),
  }));

  const mutation = useMutation({
    mutationFn: (data: AssignLicenseSeatInput) =>
      axios.post(`/api/software-licenses/${licenseId}/assignments`, data).then(r => r.data),
    onSuccess: () => {
      onAssigned();
      setOpen(false);
      form.reset();
      mutation.reset();
    },
  });

  const selectedUserId = form.watch("assignedToUserId");
  const selectedAssetId = form.watch("assignedToAssetId");
  const selectedAgent = agents.find((a) => a.id === selectedUserId);
  const canSubmit =
    mode === "user"
      ? !!selectedUserId && !mutation.isPending
      : !!selectedAssetId && !mutation.isPending;

  function handleClose() {
    setOpen(false);
    form.reset();
    mutation.reset();
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)} className="gap-1.5 shadow-sm">
        <UserPlus className="h-4 w-4" />Assign Seat
      </Button>
      <Dialog
        open={open}
        onOpenChange={(v) => { if (!v) handleClose(); else setOpen(true); }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader className="space-y-2">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-violet-500/30 bg-violet-500/10 shrink-0">
                <UserPlus className="h-4 w-4 text-violet-600 dark:text-violet-400" />
              </span>
              <DialogTitle className="text-base">Assign License Seat</DialogTitle>
            </div>
          </DialogHeader>

          {/* Mode toggle */}
          <div className="flex gap-1 p-1 rounded-lg border bg-muted/40">
            <button
              type="button"
              onClick={() => { setMode("user"); form.setValue("assignedToAssetId", undefined); }}
              className={`flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                mode === "user"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <User className="h-3.5 w-3.5" />
              Assign to user
            </button>
            <button
              type="button"
              onClick={() => { setMode("device"); form.setValue("assignedToUserId", undefined); }}
              className={`flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                mode === "device"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Monitor className="h-3.5 w-3.5" />
              Assign to device
            </button>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(d => mutation.mutate(d))} className="space-y-4">
              {mode === "user" ? (
                <FormField control={form.control} name="assignedToUserId" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-1.5">
                      <Users className="h-3.5 w-3.5 text-muted-foreground" />
                      User
                      <span className="text-destructive">*</span>
                    </FormLabel>
                    <FormControl>
                      <SearchableSelect
                        options={userOptions}
                        value={field.value ?? ""}
                        onChange={field.onChange}
                        placeholder={loadingAgents ? "Loading users…" : "Select a user…"}
                        searchPlaceholder="Search by name or email…"
                        disabled={loadingAgents}
                        className="w-full"
                      />
                    </FormControl>
                    {selectedAgent && (
                      <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-1">
                        <Mail className="h-3 w-3" />
                        {selectedAgent.email}
                      </p>
                    )}
                    <FormMessage />
                  </FormItem>
                )} />
              ) : (
                <FormField control={form.control} name="assignedToAssetId" render={({ field }) => {
                  const selectedAsset = assets.find((a) => a.id === field.value);
                  return (
                    <FormItem>
                      <FormLabel className="flex items-center gap-1.5">
                        <Monitor className="h-3.5 w-3.5 text-muted-foreground" />
                        Asset
                        <span className="text-destructive">*</span>
                      </FormLabel>
                      <FormControl>
                        <SearchableSelect
                          options={assetOptions}
                          value={field.value != null ? String(field.value) : ""}
                          onChange={(v) => field.onChange(v ? Number(v) : undefined)}
                          placeholder={loadingAssets ? "Loading assets…" : "Select an asset…"}
                          searchPlaceholder="Search by name, number, model…"
                          disabled={loadingAssets}
                          className="w-full"
                        />
                      </FormControl>
                      {selectedAsset && (
                        <p className="text-[11px] text-muted-foreground flex items-center gap-1.5 mt-1 flex-wrap">
                          <span className="font-mono tabular-nums">{selectedAsset.assetNumber}</span>
                          {selectedAsset.manufacturer && selectedAsset.model && (
                            <>
                              <span className="text-muted-foreground/40">·</span>
                              <span>{selectedAsset.manufacturer} {selectedAsset.model}</span>
                            </>
                          )}
                          {selectedAsset.assignedTo && (
                            <>
                              <span className="text-muted-foreground/40">·</span>
                              <span className="inline-flex items-center gap-1">
                                <User className="h-3 w-3" />
                                {selectedAsset.assignedTo.name}
                              </span>
                            </>
                          )}
                        </p>
                      )}
                      <FormMessage />
                    </FormItem>
                  );
                }} />
              )}

              <FormField control={form.control} name="note" render={({ field }) => (
                <FormItem>
                  <FormLabel className="flex items-center gap-1.5">
                    Note
                    <span className="text-[10px] font-normal text-muted-foreground/70 ml-auto">optional</span>
                  </FormLabel>
                  <FormControl>
                    <Input placeholder="Optional note" {...field} value={field.value ?? ""} />
                  </FormControl>
                </FormItem>
              )} />

              {mutation.error && (
                <ErrorAlert error={mutation.error} fallback="Failed to assign seat" />
              )}

              <DialogFooter className="gap-2">
                <Button type="button" variant="outline" onClick={handleClose}>Cancel</Button>
                <Button type="submit" disabled={!canSubmit} className="gap-1.5">
                  {mutation.isPending
                    ? <>
                        <span className="h-3.5 w-3.5 rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground animate-spin" />
                        Assigning…
                      </>
                    : <>
                        <UserPlus className="h-3.5 w-3.5" />
                        Assign Seat
                      </>
                  }
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
              {license.licenseNumber} · {license.customLicenseType?.name ?? SOFTWARE_LICENSE_TYPE_LABEL[license.licenseType]}
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
