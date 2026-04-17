import { useState } from "react";
import { Link } from "react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import axios from "axios";
import { createOrganizationSchema, type CreateOrganizationInput } from "core/schemas/organizations.ts";
import { SUPPORT_TIER_COLOR, SUPPORT_TIER_LABEL, SUPPORT_TIERS, type SupportTier } from "core/constants/channel.ts";
import { useSession } from "@/lib/auth-client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import ErrorAlert from "@/components/ErrorAlert";
import ErrorMessage from "@/components/ErrorMessage";
import { ChevronRight, Plus, Search, Users } from "lucide-react";

interface OrgRow {
  id: number;
  name: string;
  domain: string | null;
  website: string | null;
  industry: string | null;
  country: string | null;
  supportTier: string;
  isActive: boolean;
  createdAt: string;
  accountManager: { id: string; name: string } | null;
  _count: { customers: number };
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export default function OrganizationsPage() {
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "admin";

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [showDialog, setShowDialog] = useState(false);

  const handleSearch = (val: string) => {
    setSearch(val);
    clearTimeout((handleSearch as unknown as { timer?: ReturnType<typeof setTimeout> }).timer);
    (handleSearch as unknown as { timer?: ReturnType<typeof setTimeout> }).timer = setTimeout(
      () => setDebouncedSearch(val),
      300
    );
  };

  const query = useQuery({
    queryKey: ["organizations", debouncedSearch],
    queryFn: async () => {
      const params: Record<string, string> = { limit: "100", active: "false" };
      if (debouncedSearch) params.search = debouncedSearch;
      const { data } = await axios.get<{ organizations: OrgRow[]; total: number }>(
        "/api/organizations",
        { params }
      );
      return data;
    },
  });

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
    reset,
  } = useForm<CreateOrganizationInput>({
    resolver: zodResolver(createOrganizationSchema),
    defaultValues: { supportTier: "standard" },
  });

  const createMutation = useMutation({
    mutationFn: async (raw: CreateOrganizationInput) => {
      // Normalise optional fields: empty strings → null, NaN → null
      const payload = {
        ...raw,
        domain:        raw.domain?.trim()   || null,
        website:       raw.website?.trim()  || null,
        industry:      raw.industry?.trim() || null,
        country:       raw.country?.trim()  || null,
        address:       raw.address?.trim()  || null,
        employeeCount: raw.employeeCount != null && !Number.isNaN(raw.employeeCount)
          ? raw.employeeCount
          : null,
      };
      const res = await axios.post("/api/organizations", payload);
      return res.data.organization;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["organizations"] });
      setShowDialog(false);
      reset();
    },
  });

  const organizations = query.data?.organizations ?? [];
  const total = query.data?.total ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Organizations</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {total} organization{total !== 1 ? "s" : ""}
          </p>
        </div>
        {isAdmin && (
          <Button size="sm" onClick={() => setShowDialog(true)}>
            <Plus className="h-4 w-4 mr-1.5" />
            New Organization
          </Button>
        )}
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          placeholder="Search organizations…"
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {query.isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      )}

      {query.error && <ErrorAlert error={query.error} fallback="Failed to load organizations" />}

      {!query.isLoading && !query.error && (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Domain</TableHead>
                <TableHead>Industry</TableHead>
                <TableHead>Tier</TableHead>
                <TableHead>Account Manager</TableHead>
                <TableHead className="text-right">
                  <Users className="h-3.5 w-3.5 inline" />
                </TableHead>
                <TableHead className="text-right">Created</TableHead>
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {organizations.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-10">
                    No organizations found.
                  </TableCell>
                </TableRow>
              )}
              {organizations.map((org) => (
                <TableRow key={org.id} className={`hover:bg-muted/50 ${!org.isActive ? "opacity-60" : ""}`}>
                  <TableCell>
                    <Link
                      to={`/organizations/${org.id}`}
                      className="font-medium hover:underline flex items-center gap-1.5"
                    >
                      {org.name}
                      {!org.isActive && (
                        <Badge variant="outline" className="text-[10px] text-muted-foreground">
                          inactive
                        </Badge>
                      )}
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {org.domain ?? "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {org.industry ?? "—"}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={`text-[11px] ${SUPPORT_TIER_COLOR[org.supportTier as SupportTier] ?? ""}`}
                    >
                      {SUPPORT_TIER_LABEL[org.supportTier as SupportTier] ?? org.supportTier}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {org.accountManager?.name ?? "—"}
                  </TableCell>
                  <TableCell className="text-right text-sm tabular-nums">
                    {org._count.customers}
                  </TableCell>
                  <TableCell className="text-right text-sm text-muted-foreground">
                    {formatDate(org.createdAt)}
                  </TableCell>
                  <TableCell>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>New Organization</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={handleSubmit((data) => createMutation.mutate(data))}
            className="space-y-4 mt-2"
          >
            <div className="space-y-1">
              <Label>Name *</Label>
              <Input {...register("name")} placeholder="Acme Corp" autoFocus />
              {errors.name && <ErrorMessage message={errors.name.message} />}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Domain</Label>
                <Input {...register("domain")} placeholder="acme.com" />
                {errors.domain && <ErrorMessage message={errors.domain.message} />}
              </div>
              <div className="space-y-1">
                <Label>Website</Label>
                <Input {...register("website")} placeholder="https://acme.com" />
                {errors.website && <ErrorMessage message={errors.website.message} />}
              </div>
              <div className="space-y-1">
                <Label>Industry</Label>
                <Input {...register("industry")} placeholder="Technology" />
                {errors.industry && <ErrorMessage message={errors.industry.message} />}
              </div>
              <div className="space-y-1">
                <Label>Country</Label>
                <Input {...register("country")} placeholder="United States" />
                {errors.country && <ErrorMessage message={errors.country.message} />}
              </div>
              <div className="space-y-1">
                <Label>Employee Count</Label>
                <Input
                  type="number"
                  min={1}
                  {...register("employeeCount", { valueAsNumber: true })}
                  placeholder="500"
                />
                {errors.employeeCount && <ErrorMessage message={errors.employeeCount.message} />}
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
                {errors.supportTier && <ErrorMessage message={errors.supportTier.message} />}
              </div>
            </div>
            {createMutation.error && (
              <ErrorAlert error={createMutation.error} fallback="Failed to create organization" />
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={() => setShowDialog(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                Create Organization
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
