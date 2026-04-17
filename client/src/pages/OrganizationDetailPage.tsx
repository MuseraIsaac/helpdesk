import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import axios from "axios";
import { updateOrganizationSchema, type UpdateOrganizationInput } from "core/schemas/organizations.ts";
import { SUPPORT_TIER_COLOR, SUPPORT_TIER_LABEL, SUPPORT_TIERS, type SupportTier } from "core/constants/channel.ts";
import { useSession } from "@/lib/auth-client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ErrorAlert from "@/components/ErrorAlert";
import ErrorMessage from "@/components/ErrorMessage";
import {
  Building2, ArrowLeft, Pencil, X, Check, Globe, MapPin,
  Users, Crown, Contact, Ticket,
} from "lucide-react";

const TICKET_STATUS_STYLES: Record<string, string> = {
  open:       "bg-blue-500/15 text-blue-700 dark:text-blue-400",
  resolved:   "bg-green-500/15 text-green-700 dark:text-green-400",
  closed:     "bg-muted text-muted-foreground",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function formatRelative(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(diff / 3_600_000);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(diff / 86_400_000);
  if (days < 30) return `${days}d ago`;
  return formatDate(iso);
}

interface OrgDetail {
  id: number;
  name: string;
  domain: string | null;
  website: string | null;
  industry: string | null;
  employeeCount: number | null;
  country: string | null;
  address: string | null;
  supportTier: string;
  isActive: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  accountManager: { id: string; name: string } | null;
  entitlements: {
    id: number; tier: string; maxUsers: number | null; slaPolicy: string | null;
    expiresAt: string | null; isActive: boolean;
  }[];
  customers: {
    id: number; name: string; email: string; phone: string | null; jobTitle: string | null;
    isVip: boolean; supportTier: string; preferredChannel: string | null;
    _count: { tickets: number };
  }[];
}

interface TicketStat {
  status: string;
  _count: { _all: number };
}

export default function OrganizationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "admin";
  const [editing, setEditing] = useState(false);

  const query = useQuery({
    queryKey: ["organization", id],
    queryFn: async () => {
      const { data } = await axios.get<{ organization: OrgDetail; ticketStats: TicketStat[] }>(
        `/api/organizations/${id}`
      );
      return data;
    },
  });

  const org = query.data?.organization;
  const ticketStats = query.data?.ticketStats ?? [];

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
    reset,
  } = useForm<UpdateOrganizationInput>({
    resolver: zodResolver(updateOrganizationSchema),
  });

  const startEdit = () => {
    if (!org) return;
    reset({
      name: org.name,
      domain: org.domain ?? undefined,
      website: org.website ?? undefined,
      industry: org.industry ?? undefined,
      employeeCount: org.employeeCount ?? undefined,
      country: org.country ?? undefined,
      address: org.address ?? undefined,
      supportTier: org.supportTier as SupportTier,
      notes: org.notes ?? undefined,
      isActive: org.isActive,
    });
    setEditing(true);
  };

  const updateMutation = useMutation({
    mutationFn: async (data: UpdateOrganizationInput) => {
      const res = await axios.patch(`/api/organizations/${id}`, data);
      return res.data.organization as OrgDetail;
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(["organization", id], (prev: { organization: OrgDetail; ticketStats: TicketStat[] } | undefined) =>
        prev ? { ...prev, organization: updated } : prev
      );
      queryClient.invalidateQueries({ queryKey: ["organizations"] });
      setEditing(false);
    },
  });

  if (query.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-60 w-full" />
      </div>
    );
  }

  if (query.error || !org) {
    return <ErrorAlert error={query.error} fallback="Organization not found" />;
  }

  const totalTickets = ticketStats.reduce((sum, s) => sum + s._count._all, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="icon" className="mt-0.5 shrink-0" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-semibold">{org.name}</h1>
              {!org.isActive && (
                <Badge variant="outline" className="text-muted-foreground">Inactive</Badge>
              )}
              <Badge
                variant="outline"
                className={`text-[11px] ${SUPPORT_TIER_COLOR[org.supportTier as SupportTier] ?? ""}`}
              >
                {SUPPORT_TIER_LABEL[org.supportTier as SupportTier] ?? org.supportTier}
              </Badge>
            </div>
            {org.domain && (
              <p className="text-sm text-muted-foreground mt-0.5">{org.domain}</p>
            )}
          </div>
        </div>
        {isAdmin && !editing && (
          <Button variant="outline" size="sm" onClick={startEdit}>
            <Pencil className="h-3.5 w-3.5 mr-1.5" />
            Edit
          </Button>
        )}
      </div>

      {/* Edit form */}
      {editing && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Edit Organization</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={handleSubmit((data) => updateMutation.mutate(data))}
              className="space-y-4"
            >
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1 col-span-2">
                  <Label>Name *</Label>
                  <Input {...register("name")} />
                  {errors.name && <ErrorMessage message={errors.name.message} />}
                </div>
                <div className="space-y-1">
                  <Label>Domain</Label>
                  <Input {...register("domain")} placeholder="acme.com" />
                </div>
                <div className="space-y-1">
                  <Label>Website</Label>
                  <Input {...register("website")} placeholder="https://acme.com" />
                </div>
                <div className="space-y-1">
                  <Label>Industry</Label>
                  <Input {...register("industry")} />
                </div>
                <div className="space-y-1">
                  <Label>Country</Label>
                  <Input {...register("country")} />
                </div>
                <div className="space-y-1">
                  <Label>Employee Count</Label>
                  <Input
                    type="number"
                    {...register("employeeCount", { valueAsNumber: true })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Support Tier</Label>
                  <Select
                    value={watch("supportTier") ?? "standard"}
                    onValueChange={(v) => setValue("supportTier", v as SupportTier)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SUPPORT_TIERS.map((t) => (
                        <SelectItem key={t} value={t}>
                          {SUPPORT_TIER_LABEL[t]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1 col-span-2">
                  <Label>Address</Label>
                  <Input {...register("address")} />
                </div>
                <div className="space-y-1 flex items-end gap-2">
                  <label className="flex items-center gap-2 cursor-pointer text-sm">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-border accent-primary cursor-pointer"
                      checked={watch("isActive") ?? true}
                      onChange={(e) => setValue("isActive", e.target.checked)}
                    />
                    Active
                  </label>
                </div>
              </div>
              <div className="space-y-1">
                <Label>Notes</Label>
                <Textarea {...register("notes")} rows={3} />
              </div>
              {updateMutation.error && (
                <ErrorAlert error={updateMutation.error} fallback="Failed to update organization" />
              )}
              <div className="flex items-center gap-2">
                <Button type="submit" size="sm" disabled={updateMutation.isPending}>
                  <Check className="h-3.5 w-3.5 mr-1.5" />
                  Save
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)}>
                  <X className="h-3.5 w-3.5 mr-1.5" />
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-3 gap-6">
        {/* Info sidebar */}
        <div className="col-span-1 space-y-4">
          {/* Stats */}
          <div className="grid grid-cols-2 gap-3">
            <Card className="p-4">
              <p className="text-xs text-muted-foreground">Customers</p>
              <p className="text-2xl font-semibold tabular-nums">{org.customers.length}</p>
            </Card>
            <Card className="p-4">
              <p className="text-xs text-muted-foreground">Tickets</p>
              <p className="text-2xl font-semibold tabular-nums">{totalTickets}</p>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground uppercase tracking-wide">
                Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {org.website && (
                <div className="flex items-center gap-2">
                  <Globe className="h-4 w-4 text-muted-foreground shrink-0" />
                  <a
                    href={org.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:underline truncate"
                  >
                    {org.website}
                  </a>
                </div>
              )}
              {org.country && (
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span>{org.country}</span>
                </div>
              )}
              {org.industry && (
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span>{org.industry}</span>
                </div>
              )}
              {org.employeeCount && (
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span>{org.employeeCount.toLocaleString()} employees</span>
                </div>
              )}
              {org.accountManager && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Contact className="h-4 w-4 shrink-0" />
                  <span>AM: {org.accountManager.name}</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Ticket status breakdown */}
          {ticketStats.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground uppercase tracking-wide">
                  Ticket Breakdown
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {ticketStats.map((s) => (
                  <div key={s.status} className="flex items-center justify-between text-sm">
                    <Badge
                      variant="outline"
                      className={`text-[11px] ${TICKET_STATUS_STYLES[s.status] ?? ""}`}
                    >
                      {s.status}
                    </Badge>
                    <span className="tabular-nums font-medium">{s._count._all}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {org.notes && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground uppercase tracking-wide">
                  Notes
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-wrap">{org.notes}</p>
              </CardContent>
            </Card>
          )}

          <div className="text-xs text-muted-foreground space-y-1 px-1">
            <p>Created {formatDate(org.createdAt)}</p>
            <p>Updated {formatRelative(org.updatedAt)}</p>
          </div>
        </div>

        {/* Customers tab */}
        <div className="col-span-2">
          <Tabs defaultValue="customers">
            <TabsList>
              <TabsTrigger value="customers" className="flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5" />
                Customers ({org.customers.length})
              </TabsTrigger>
              {org.entitlements.length > 0 && (
                <TabsTrigger value="entitlements" className="flex items-center gap-1.5">
                  <Ticket className="h-3.5 w-3.5" />
                  Entitlements ({org.entitlements.length})
                </TabsTrigger>
              )}
            </TabsList>

            <TabsContent value="customers" className="mt-4">
              {org.customers.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">
                  No customers in this organization.
                </p>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Tier</TableHead>
                        <TableHead className="text-right">Tickets</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {org.customers.map((c) => (
                        <TableRow key={c.id}>
                          <TableCell>
                            <Link
                              to={`/customers/${c.id}`}
                              className="flex items-center gap-1.5 font-medium hover:underline text-sm"
                            >
                              {c.isVip && (
                                <Crown className="h-3 w-3 text-amber-500 shrink-0" title="VIP" />
                              )}
                              {c.name}
                            </Link>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">{c.email}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {c.jobTitle ?? "—"}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={`text-[11px] ${SUPPORT_TIER_COLOR[c.supportTier as SupportTier] ?? ""}`}
                            >
                              {SUPPORT_TIER_LABEL[c.supportTier as SupportTier] ?? c.supportTier}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right text-sm tabular-nums">
                            {c._count.tickets}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>

            {org.entitlements.length > 0 && (
              <TabsContent value="entitlements" className="mt-4">
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Tier</TableHead>
                        <TableHead>SLA Policy</TableHead>
                        <TableHead>Max Users</TableHead>
                        <TableHead>Expires</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {org.entitlements.map((e) => (
                        <TableRow key={e.id}>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={`text-[11px] ${SUPPORT_TIER_COLOR[e.tier as SupportTier] ?? ""}`}
                            >
                              {SUPPORT_TIER_LABEL[e.tier as SupportTier] ?? e.tier}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm">{e.slaPolicy ?? "—"}</TableCell>
                          <TableCell className="text-sm">{e.maxUsers ?? "Unlimited"}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {e.expiresAt ? formatDate(e.expiresAt) : "No expiry"}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={`text-[11px] ${e.isActive ? "bg-green-500/15 text-green-700 dark:text-green-400" : "bg-muted text-muted-foreground"}`}
                            >
                              {e.isActive ? "Active" : "Inactive"}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>
            )}
          </Tabs>
        </div>
      </div>
    </div>
  );
}
