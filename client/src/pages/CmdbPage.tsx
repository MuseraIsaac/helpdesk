import { useState } from "react";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import {
  CI_TYPE_LABEL, CI_ENVIRONMENT_LABEL, CI_CRITICALITY_LABEL, CI_STATUS_LABEL,
  CI_TYPES, CI_ENVIRONMENTS, CI_CRITICALITIES, CI_STATUSES,
  CI_CRITICALITY_COLOR,
  type CiSummary,
} from "core/constants/cmdb.ts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import ErrorAlert from "@/components/ErrorAlert";
import NewCiDialog from "@/components/NewCiDialog";
import { Server, Search, ChevronLeft, ChevronRight } from "lucide-react";

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  active:         "default",
  maintenance:    "outline",
  planned:        "secondary",
  retired:        "secondary",
  decommissioned: "secondary",
};

const CI_TYPE_ICON: Record<string, string> = {
  server:         "🖥️",
  workstation:    "💻",
  network_device: "🔌",
  application:    "📱",
  service:        "⚙️",
  database:       "🗄️",
  storage:        "💾",
  virtual_machine:"☁️",
  container:      "📦",
  printer:        "🖨️",
  mobile_device:  "📲",
  other:          "🔧",
};

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CmdbPage() {
  const [search, setSearch]           = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [typeFilter, setTypeFilter]   = useState<string>("");
  const [envFilter, setEnvFilter]     = useState<string>("");
  const [critFilter, setCritFilter]   = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("active");
  const [page, setPage]               = useState(1);

  const params: Record<string, string | number> = { page, pageSize: 25 };
  if (search)       params.search      = search;
  if (typeFilter)   params.type        = typeFilter;
  if (envFilter)    params.environment = envFilter;
  if (critFilter)   params.criticality = critFilter;
  if (statusFilter) params.status      = statusFilter;

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["cmdb", params],
    queryFn: async () => {
      const { data } = await axios.get<{
        items: CiSummary[];
        meta: { total: number; page: number; pageSize: number; pages: number };
      }>("/api/cmdb", { params });
      return data;
    },
  });

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  }

  function clearFilters() {
    setSearchInput("");
    setSearch("");
    setTypeFilter("");
    setEnvFilter("");
    setCritFilter("");
    setStatusFilter("active");
    setPage(1);
  }

  const hasFilters = search || typeFilter || envFilter || critFilter || statusFilter !== "active";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Configuration Management Database
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {data?.meta.total ?? "…"} configuration items
          </p>
        </div>
        <NewCiDialog onCreated={() => refetch()} />
      </div>

      {error && <ErrorAlert error={error} fallback="Failed to load CIs" />}

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search by name, number, or tag…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="pl-8 h-8 text-sm w-64"
            />
          </div>
          <Button type="submit" size="sm" variant="secondary" className="h-8">Search</Button>
        </form>

        <Select value={typeFilter || "_all"} onValueChange={(v) => { setTypeFilter(v === "_all" ? "" : v); setPage(1); }}>
          <SelectTrigger className="h-8 text-sm w-40">
            <SelectValue placeholder="All types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">All types</SelectItem>
            {CI_TYPES.map((t) => (
              <SelectItem key={t} value={t}>{CI_TYPE_LABEL[t]}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={envFilter || "_all"} onValueChange={(v) => { setEnvFilter(v === "_all" ? "" : v); setPage(1); }}>
          <SelectTrigger className="h-8 text-sm w-36">
            <SelectValue placeholder="All environments" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">All environments</SelectItem>
            {CI_ENVIRONMENTS.map((e) => (
              <SelectItem key={e} value={e}>{CI_ENVIRONMENT_LABEL[e]}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={critFilter || "_all"} onValueChange={(v) => { setCritFilter(v === "_all" ? "" : v); setPage(1); }}>
          <SelectTrigger className="h-8 text-sm w-36">
            <SelectValue placeholder="All criticalities" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">All criticalities</SelectItem>
            {CI_CRITICALITIES.map((c) => (
              <SelectItem key={c} value={c}>{CI_CRITICALITY_LABEL[c]}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={statusFilter || "_all"} onValueChange={(v) => { setStatusFilter(v === "_all" ? "" : v); setPage(1); }}>
          <SelectTrigger className="h-8 text-sm w-36">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">All statuses</SelectItem>
            {CI_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>{CI_STATUS_LABEL[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {hasFilters && (
          <Button size="sm" variant="ghost" className="h-8 text-muted-foreground" onClick={clearFilters}>
            Clear filters
          </Button>
        )}
      </div>

      {/* Table */}
      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/30">
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs uppercase tracking-wider">CI</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs uppercase tracking-wider">Type</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs uppercase tracking-wider">Env</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs uppercase tracking-wider">Criticality</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs uppercase tracking-wider">Status</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs uppercase tracking-wider">Owner / Team</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground text-xs uppercase tracking-wider">Tags</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading && Array.from({ length: 8 }).map((_, i) => (
              <tr key={i}>
                <td colSpan={7} className="px-4 py-3">
                  <Skeleton className="h-5 w-full" />
                </td>
              </tr>
            ))}
            {!isLoading && data?.items.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-16 text-center">
                  <Server className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground font-medium">No configuration items found</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {hasFilters ? "Try adjusting your filters" : "Create your first CI to get started"}
                  </p>
                </td>
              </tr>
            )}
            {data?.items.map((ci) => (
              <tr key={ci.id} className="hover:bg-muted/30 transition-colors">
                <td className="px-4 py-3">
                  <Link to={`/cmdb/${ci.id}`} className="hover:underline">
                    <p className="font-medium">{ci.name}</p>
                    <p className="text-[11px] font-mono text-muted-foreground">{ci.ciNumber}</p>
                  </Link>
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <span>{CI_TYPE_ICON[ci.type] ?? "🔧"}</span>
                    <span className="text-xs">{CI_TYPE_LABEL[ci.type]}</span>
                  </span>
                </td>
                <td className="px-4 py-3">
                  <Badge variant="outline" className="text-[11px] font-normal">
                    {CI_ENVIRONMENT_LABEL[ci.environment]}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-semibold ${CI_CRITICALITY_COLOR[ci.criticality]}`}>
                    {CI_CRITICALITY_LABEL[ci.criticality]}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <Badge variant={STATUS_VARIANT[ci.status] ?? "secondary"} className="text-[11px]">
                    {CI_STATUS_LABEL[ci.status]}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">
                  {ci.owner?.name ?? ci.team?.name ?? <span className="italic">Unassigned</span>}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {ci.tags.slice(0, 3).map((tag) => (
                      <Badge key={tag} variant="secondary" className="text-[11px] px-1.5 py-0">
                        {tag}
                      </Badge>
                    ))}
                    {ci.tags.length > 3 && (
                      <Badge variant="secondary" className="text-[11px] px-1.5 py-0">
                        +{ci.tags.length - 3}
                      </Badge>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {data && data.meta.pages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <p className="text-muted-foreground text-xs">
            Page {data.meta.page} of {data.meta.pages} ({data.meta.total} items)
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= data.meta.pages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
