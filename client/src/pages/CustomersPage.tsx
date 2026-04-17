import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import axios from "axios";
import { createCustomerSchema, type CreateCustomerInput } from "core/schemas/customers.ts";
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
import { Contact, Crown, Building2, ChevronRight, Search, Plus } from "lucide-react";

interface CustomerRow {
  id: number;
  email: string;
  name: string;
  phone: string | null;
  jobTitle: string | null;
  isVip: boolean;
  supportTier: string;
  preferredChannel: string | null;
  avatarUrl: string | null;
  createdAt: string;
  organization: { id: number; name: string } | null;
  _count: { tickets: number };
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export default function CustomersPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const role = session?.user?.role ?? "";
  // Admins, supervisors, and agents can create/edit customers
  const canManage = role === "admin" || role === "supervisor" || role === "agent";

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
    queryKey: ["customers", debouncedSearch],
    queryFn: async () => {
      const params: Record<string, string> = { limit: "100" };
      if (debouncedSearch) params.search = debouncedSearch;
      const { data } = await axios.get<{ customers: CustomerRow[]; total: number }>(
        "/api/customers",
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
  } = useForm<CreateCustomerInput>({
    resolver: zodResolver(createCustomerSchema),
    defaultValues: { supportTier: "standard", isVip: false },
  });

  const createMutation = useMutation({
    mutationFn: async (data: CreateCustomerInput) => {
      const res = await axios.post<{ customer: CustomerRow }>("/api/customers", data);
      return res.data.customer;
    },
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      setShowDialog(false);
      reset();
      navigate(`/customers/${created.id}`);
    },
  });

  const openDialog = () => {
    reset({ supportTier: "standard", isVip: false });
    setShowDialog(true);
  };

  const customers = query.data?.customers ?? [];
  const total = query.data?.total ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Contact className="h-6 w-6 text-muted-foreground" />
            Customers
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {total} contact{total !== 1 ? "s" : ""}
          </p>
        </div>
        {canManage && (
          <Button size="sm" onClick={openDialog}>
            <Plus className="h-4 w-4 mr-1.5" />
            New Customer
          </Button>
        )}
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          placeholder="Search by name or email…"
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {query.isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      )}

      {query.error && <ErrorAlert error={query.error} fallback="Failed to load customers" />}

      {!query.isLoading && !query.error && (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Organization</TableHead>
                <TableHead>Tier</TableHead>
                <TableHead className="text-right">Tickets</TableHead>
                <TableHead className="text-right">Since</TableHead>
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {customers.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-10">
                    No customers found.
                  </TableCell>
                </TableRow>
              )}
              {customers.map((c) => (
                <TableRow key={c.id} className="hover:bg-muted/50 cursor-pointer" onClick={() => navigate(`/customers/${c.id}`)}>
                  <TableCell>
                    <div className="flex items-center gap-2 font-medium">
                      {c.isVip && (
                        <Crown className="h-3.5 w-3.5 text-amber-500 shrink-0" title="VIP" />
                      )}
                      {c.name}
                      {c.jobTitle && (
                        <span className="text-xs text-muted-foreground font-normal">
                          · {c.jobTitle}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">{c.email}</TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    {c.organization ? (
                      <Link
                        to={`/organizations/${c.organization.id}`}
                        className="flex items-center gap-1 text-sm hover:underline text-foreground"
                      >
                        <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                        {c.organization.name}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground text-sm">—</span>
                    )}
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
                  <TableCell className="text-right text-sm text-muted-foreground">
                    {formatDate(c.createdAt)}
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

      {/* New Customer dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>New Customer</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={handleSubmit((data) => createMutation.mutate(data))}
            className="space-y-4 mt-2"
          >
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1 col-span-2">
                <Label>Full Name *</Label>
                <Input {...register("name")} placeholder="Jane Smith" autoFocus />
                {errors.name && <ErrorMessage message={errors.name.message} />}
              </div>
              <div className="space-y-1 col-span-2">
                <Label>Email Address *</Label>
                <Input {...register("email")} type="email" placeholder="jane@example.com" />
                {errors.email && <ErrorMessage message={errors.email.message} />}
              </div>
              <div className="space-y-1">
                <Label>Phone</Label>
                <Input {...register("phone")} placeholder="+1 555 000 0000" />
              </div>
              <div className="space-y-1">
                <Label>Job Title</Label>
                <Input {...register("jobTitle")} placeholder="IT Manager" />
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
              <div className="space-y-1 flex items-end pb-0.5">
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
            </div>

            {createMutation.error && (
              <ErrorAlert error={createMutation.error} fallback="Failed to create customer" />
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={() => setShowDialog(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                Create Customer
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
