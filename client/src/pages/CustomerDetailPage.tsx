import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import axios from "axios";
import { updateCustomerSchema, type UpdateCustomerInput } from "core/schemas/customers.ts";
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
  Contact, Crown, Building2, ArrowLeft, Pencil, X, Check,
  Mail, Phone, Globe, Clock, Ticket, ShoppingBag,
} from "lucide-react";

interface OrgOption {
  id: number;
  name: string;
}

const TICKET_STATUS_STYLES: Record<string, string> = {
  open:       "bg-blue-500/15 text-blue-700 dark:text-blue-400",
  resolved:   "bg-green-500/15 text-green-700 dark:text-green-400",
  closed:     "bg-muted text-muted-foreground",
  new:        "bg-muted text-muted-foreground",
  processing: "bg-violet-500/15 text-violet-700 dark:text-violet-400",
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

interface CustomerDetail {
  id: number;
  email: string;
  name: string;
  phone: string | null;
  jobTitle: string | null;
  timezone: string;
  language: string;
  preferredChannel: string | null;
  isVip: boolean;
  supportTier: string;
  avatarUrl: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  organization: {
    id: number; name: string; domain: string | null; website: string | null;
    industry: string | null; supportTier: string; isActive: boolean;
  } | null;
  tickets: {
    id: number; ticketNumber: string; subject: string; status: string;
    priority: string; category: string | null; slaBreached: boolean;
    isEscalated: boolean; createdAt: string; resolvedAt: string | null;
  }[];
  serviceRequests: {
    id: number; requestNumber: string; title: string; status: string; createdAt: string;
  }[];
}

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const role = session?.user?.role ?? "";
  const canManage = role === "admin" || role === "supervisor" || role === "agent";
  const [editing, setEditing] = useState(false);

  const query = useQuery({
    queryKey: ["customer", id],
    queryFn: async () => {
      const { data } = await axios.get<{ customer: CustomerDetail }>(`/api/customers/${id}`);
      return data.customer;
    },
  });

  const customer = query.data;

  // Fetch organizations for the org selector — only needed while editing
  const orgsQuery = useQuery({
    queryKey: ["organizations-list"],
    queryFn: async () => {
      const { data } = await axios.get<{ organizations: OrgOption[] }>("/api/organizations", {
        params: { limit: "200" },
      });
      return data.organizations;
    },
    enabled: editing,
  });

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    control,
    formState: { errors },
    reset,
  } = useForm<UpdateCustomerInput>({
    resolver: zodResolver(updateCustomerSchema),
  });

  const startEdit = () => {
    if (!customer) return;
    reset({
      name: customer.name,
      phone: customer.phone ?? undefined,
      jobTitle: customer.jobTitle ?? undefined,
      timezone: customer.timezone,
      language: customer.language,
      preferredChannel: customer.preferredChannel ?? undefined,
      isVip: customer.isVip,
      supportTier: customer.supportTier as SupportTier,
      organizationId: customer.organization?.id ?? null,
      notes: customer.notes ?? undefined,
    });
    setEditing(true);
  };

  const updateMutation = useMutation({
    mutationFn: async (data: UpdateCustomerInput) => {
      await axios.patch(`/api/customers/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customer", id] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      setEditing(false);
    },
  });

  if (query.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-60 w-full" />
      </div>
    );
  }

  if (query.error || !customer) {
    return <ErrorAlert error={query.error} fallback="Customer not found" />;
  }

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
              <h1 className="text-2xl font-semibold">{customer.name}</h1>
              {customer.isVip && (
                <span className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-semibold bg-amber-500/15 text-amber-700">
                  <Crown className="h-3 w-3" />
                  VIP
                </span>
              )}
              <Badge
                variant="outline"
                className={`text-[11px] ${SUPPORT_TIER_COLOR[customer.supportTier as SupportTier] ?? ""}`}
              >
                {SUPPORT_TIER_LABEL[customer.supportTier as SupportTier] ?? customer.supportTier}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">{customer.email}</p>
          </div>
        </div>
        {canManage && !editing && (
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
            <CardTitle className="text-base">Edit Customer</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={handleSubmit((data) => updateMutation.mutate(data))}
              className="space-y-4"
            >
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label>Name</Label>
                  <Input {...register("name")} />
                  {errors.name && <ErrorMessage message={errors.name.message} />}
                </div>
                <div className="space-y-1">
                  <Label>Phone</Label>
                  <Input {...register("phone")} placeholder="+1 555 000 0000" />
                </div>
                <div className="space-y-1">
                  <Label>Job Title</Label>
                  <Input {...register("jobTitle")} />
                </div>
                <div className="space-y-1">
                  <Label>Preferred Channel</Label>
                  <Input {...register("preferredChannel")} placeholder="email, portal, phone…" />
                </div>
                <div className="space-y-1">
                  <Label>Timezone</Label>
                  <Input {...register("timezone")} placeholder="UTC" />
                </div>
                <div className="space-y-1">
                  <Label>Language</Label>
                  <Input {...register("language")} placeholder="en" />
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
                <div className="space-y-1 flex items-end gap-3">
                  <label className="flex items-center gap-2 cursor-pointer text-sm">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-border accent-primary cursor-pointer"
                      checked={watch("isVip") ?? false}
                      onChange={(e) => setValue("isVip", e.target.checked)}
                    />
                    Mark as VIP
                  </label>
                </div>
                <div className="space-y-1 col-span-2">
                  <Label>Organization</Label>
                  <Controller
                    name="organizationId"
                    control={control}
                    render={({ field }) => (
                      <Select
                        value={field.value != null ? String(field.value) : "none"}
                        onValueChange={(v) => field.onChange(v === "none" ? null : Number(v))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="No organization" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">
                            <span className="text-muted-foreground">No organization</span>
                          </SelectItem>
                          {orgsQuery.data?.map((org) => (
                            <SelectItem key={org.id} value={String(org.id)}>
                              {org.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                  <p className="text-xs text-muted-foreground">
                    Assign this customer to an organization, or select "No organization" to remove the link.
                  </p>
                </div>
              </div>
              <div className="space-y-1">
                <Label>Notes</Label>
                <Textarea {...register("notes")} rows={3} />
              </div>
              {updateMutation.error && (
                <ErrorAlert error={updateMutation.error} fallback="Failed to update customer" />
              )}
              <div className="flex items-center gap-2">
                <Button type="submit" size="sm" disabled={updateMutation.isPending}>
                  <Check className="h-3.5 w-3.5 mr-1.5" />
                  Save
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditing(false)}
                >
                  <X className="h-3.5 w-3.5 mr-1.5" />
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-3 gap-6">
        {/* Contact info */}
        <div className="col-span-1 space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground uppercase tracking-wide">
                Contact Info
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                <a href={`mailto:${customer.email}`} className="hover:underline truncate">
                  {customer.email}
                </a>
              </div>
              {customer.phone && (
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span>{customer.phone}</span>
                </div>
              )}
              {customer.jobTitle && (
                <div className="flex items-center gap-2">
                  <Contact className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span>{customer.jobTitle}</span>
                </div>
              )}
              {customer.preferredChannel && (
                <div className="flex items-center gap-2">
                  <Globe className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span>Prefers {customer.preferredChannel}</span>
                </div>
              )}
              <div className="flex items-center gap-2 text-muted-foreground">
                <Clock className="h-4 w-4 shrink-0" />
                <span>{customer.timezone} · {customer.language.toUpperCase()}</span>
              </div>
            </CardContent>
          </Card>

          {customer.organization && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground uppercase tracking-wide">
                  Organization
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-2">
                <Link
                  to={`/organizations/${customer.organization.id}`}
                  className="flex items-center gap-1.5 font-medium hover:underline"
                >
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  {customer.organization.name}
                </Link>
                {customer.organization.industry && (
                  <p className="text-muted-foreground">{customer.organization.industry}</p>
                )}
                <Badge
                  variant="outline"
                  className={`text-[11px] ${SUPPORT_TIER_COLOR[customer.organization.supportTier as SupportTier] ?? ""}`}
                >
                  {SUPPORT_TIER_LABEL[customer.organization.supportTier as SupportTier] ?? customer.organization.supportTier}
                </Badge>
              </CardContent>
            </Card>
          )}

          {customer.notes && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground uppercase tracking-wide">
                  Notes
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-wrap">{customer.notes}</p>
              </CardContent>
            </Card>
          )}

          <div className="text-xs text-muted-foreground space-y-1 px-1">
            <p>Customer since {formatDate(customer.createdAt)}</p>
            <p>Updated {formatRelative(customer.updatedAt)}</p>
          </div>
        </div>

        {/* Tabs: tickets + requests */}
        <div className="col-span-2">
          <Tabs defaultValue="tickets">
            <TabsList>
              <TabsTrigger value="tickets" className="flex items-center gap-1.5">
                <Ticket className="h-3.5 w-3.5" />
                Tickets ({customer.tickets.length})
              </TabsTrigger>
              <TabsTrigger value="requests" className="flex items-center gap-1.5">
                <ShoppingBag className="h-3.5 w-3.5" />
                Requests ({customer.serviceRequests.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="tickets" className="mt-4">
              {customer.tickets.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">No tickets.</p>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>#</TableHead>
                        <TableHead>Subject</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Priority</TableHead>
                        <TableHead>Opened</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {customer.tickets.map((t) => (
                        <TableRow key={t.id}>
                          <TableCell className="font-mono text-xs text-muted-foreground">
                            {t.ticketNumber}
                          </TableCell>
                          <TableCell>
                            <Link
                              to={`/tickets/${t.id}`}
                              className="hover:underline font-medium text-sm"
                            >
                              {t.subject}
                            </Link>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={`text-[11px] ${TICKET_STATUS_STYLES[t.status] ?? ""}`}
                            >
                              {t.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm capitalize">{t.priority}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {formatRelative(t.createdAt)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>

            <TabsContent value="requests" className="mt-4">
              {customer.serviceRequests.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">No requests.</p>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>#</TableHead>
                        <TableHead>Title</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Submitted</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {customer.serviceRequests.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="font-mono text-xs text-muted-foreground">
                            {r.requestNumber}
                          </TableCell>
                          <TableCell>
                            <Link
                              to={`/requests/${r.id}`}
                              className="hover:underline font-medium text-sm"
                            >
                              {r.title}
                            </Link>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-[11px]">
                              {r.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {formatRelative(r.createdAt)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
