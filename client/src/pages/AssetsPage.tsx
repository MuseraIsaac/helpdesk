import { useState, useMemo, useCallback, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  useReactTable,
  getCoreRowModel,
  type ColumnDef,
  type RowSelectionState,
} from "@tanstack/react-table";
import axios from "axios";
import {
  ASSET_TYPE_LABEL, ASSET_STATUS_LABEL, ASSET_CONDITION_LABEL,
  ASSET_TYPES, ASSET_CONDITIONS, ASSET_STATUSES,
  type AssetSummary, type AssetStatus,
} from "core/constants/assets.ts";
import {
  ASSET_COLUMN_META, SYSTEM_DEFAULT_ASSET_VIEW_CONFIG,
  type AssetColumnId, type AssetViewConfig,
} from "core/schemas/asset-view.ts";
import { useAssetViews } from "@/hooks/useAssetViews";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import ErrorAlert from "@/components/ErrorAlert";
import NewAssetDialog from "@/components/NewAssetDialog";
import AssetBulkActionsBar from "@/components/AssetBulkActionsBar";
import AssetViewCustomizer from "@/components/AssetViewCustomizer";
import {
  Package, Search, ChevronLeft, ChevronRight, AlertTriangle,
  MoreHorizontal, Copy, ExternalLink, RotateCcw, User, Trash2,
  ChevronDown, Columns3, X, ChevronUp, ChevronsUpDown, Warehouse,
} from "lucide-react";

// ── Status palette ────────────────────────────────────────────────────────────

type PaletteEntry = { pill: string; dot: string };

const STATUS_PALETTE: Record<AssetStatus, PaletteEntry> = {
  ordered:           { dot: "bg-slate-400",          pill: "bg-slate-100   text-slate-600  border-slate-200  dark:bg-slate-800   dark:text-slate-300" },
  in_stock:          { dot: "bg-sky-500",             pill: "bg-sky-50      text-sky-700    border-sky-200    dark:bg-sky-900/40  dark:text-sky-300" },
  deployed:          { dot: "bg-emerald-500",         pill: "bg-emerald-50  text-emerald-700 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300" },
  in_use:            { dot: "bg-blue-500",            pill: "bg-blue-50     text-blue-700   border-blue-200   dark:bg-blue-900/40 dark:text-blue-300" },
  under_maintenance: { dot: "bg-amber-500",           pill: "bg-amber-50    text-amber-700  border-amber-200  dark:bg-amber-900/40 dark:text-amber-300" },
  in_repair:         { dot: "bg-orange-500",          pill: "bg-orange-50   text-orange-700 border-orange-200 dark:bg-orange-900/40 dark:text-orange-300" },
  retired:           { dot: "bg-muted-foreground/50", pill: "bg-muted       text-muted-foreground border-muted-foreground/20" },
  disposed:          { dot: "bg-muted-foreground/30", pill: "bg-muted       text-muted-foreground border-muted-foreground/20" },
  lost_stolen:       { dot: "bg-red-500",             pill: "bg-red-50      text-red-700    border-red-200    dark:bg-red-900/40  dark:text-red-300" },
};

const CONDITION_COLOR: Record<string, string> = {
  new_item: "text-emerald-600 dark:text-emerald-400",
  good:     "text-blue-600   dark:text-blue-400",
  fair:     "text-amber-600  dark:text-amber-400",
  poor:     "text-destructive",
};

// ── Filter chips ──────────────────────────────────────────────────────────────

type ChipStatuses = AssetStatus[] | null;

const FILTER_CHIPS: Array<{ key: string; label: string; statuses: ChipStatuses }> = [
  { key: "all",           label: "All",              statuses: null },
  { key: "active",        label: "Active",           statuses: ["deployed", "in_use"] },
  { key: "in_stock",      label: "In Stock",         statuses: ["in_stock"] },
  { key: "ordered",       label: "Ordered",          statuses: ["ordered"] },
  { key: "maintenance",   label: "Awaiting Repair",  statuses: ["under_maintenance", "in_repair"] },
  { key: "retired",       label: "Retired",          statuses: ["retired", "disposed", "lost_stolen"] },
];

/** Derive the active chip key from the current `statuses` URL param. */
function derivedChip(statusesParam: string): string {
  if (!statusesParam) return "all";
  const sorted = statusesParam.split(",").sort().join(",");
  for (const chip of FILTER_CHIPS) {
    if (!chip.statuses) continue;
    if ([...chip.statuses].sort().join(",") === sorted) return chip.key;
  }
  return "all";
}

// ── Stats bar ─────────────────────────────────────────────────────────────────

interface AssetStats {
  total: number; active: number; inStock: number; ordered: number;
  maintenance: number; retired: number; warrantyExpiring: number;
}

function StatCard({
  label, value, loading, accent, onClick,
}: { label: string; value: number | undefined; loading: boolean; accent?: string; onClick?: () => void }) {
  return (
    <button onClick={onClick} disabled={!onClick}
      className={[
        "flex flex-col gap-0.5 px-4 py-3 border-r border-border/50 last:border-0 text-left transition-colors",
        onClick ? "hover:bg-muted/40 cursor-pointer" : "cursor-default",
      ].join(" ")}
    >
      {loading
        ? <Skeleton className="h-6 w-12" />
        : <span className={`text-xl font-bold tabular-nums leading-none ${accent ?? "text-foreground"}`}>
            {value?.toLocaleString() ?? "—"}
          </span>
      }
      <span className="text-[11px] text-muted-foreground whitespace-nowrap">{label}</span>
    </button>
  );
}

// ── Warranty cell ─────────────────────────────────────────────────────────────

function WarrantyCell({ expiry }: { expiry: string | null }) {
  if (!expiry) return <span className="text-muted-foreground">—</span>;
  const date = new Date(expiry);
  const days = Math.ceil((date.getTime() - Date.now()) / 86_400_000);
  const expired = days < 0;
  const warn    = !expired && days <= 90;
  return (
    <span className={`inline-flex items-center gap-1 ${expired ? "text-destructive" : warn ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}`}>
      {(expired || warn) && <AlertTriangle className="h-3 w-3 shrink-0" />}
      <span className="text-xs">
        {expired ? "Expired" : warn ? `${days}d` : date.toLocaleDateString(undefined, { dateStyle: "medium" })}
      </span>
    </span>
  );
}

// ── Sort icon ─────────────────────────────────────────────────────────────────

function SortIcon({ col, sortBy, sortOrder }: { col: string; sortBy: string; sortOrder: string }) {
  if (sortBy !== col) return <ChevronsUpDown className="h-3 w-3 ml-1 opacity-30" />;
  return sortOrder === "asc"
    ? <ChevronUp   className="h-3 w-3 ml-1 text-primary" />
    : <ChevronDown className="h-3 w-3 ml-1 text-primary" />;
}

// ── Row actions ───────────────────────────────────────────────────────────────

function RowActions({ asset, onClone }: { asset: AssetSummary; onClone: (id: number) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="h-6 w-6 rounded flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
          <MoreHorizontal className="h-3.5 w-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44 text-sm">
        <DropdownMenuItem asChild>
          <Link to={`/assets/${asset.assetNumber}`} className="flex items-center gap-2">
            <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
            Open
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onClone(asset.id)} className="flex items-center gap-2">
          <Copy className="h-3.5 w-3.5 text-muted-foreground" />
          Clone
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to={`/assets/${asset.assetNumber}`} className="flex items-center gap-2 text-muted-foreground">
            <RotateCcw className="h-3.5 w-3.5" />
            Transition status
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to={`/assets/${asset.assetNumber}`} className="flex items-center gap-2 text-muted-foreground">
            <User className="h-3.5 w-3.5" />
            {asset.assignedTo ? "Reassign" : "Assign"}
          </Link>
        </DropdownMenuItem>
        {asset.status !== "deployed" && asset.status !== "in_use" && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive flex items-center gap-2">
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AssetsPage() {
  const navigate = useNavigate();
  const qc       = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  // ── Saved views ────────────────────────────────────────────────────────────
  const { viewList, activeView, activeConfig } = useAssetViews();
  const [customizerOpen, setCustomizerOpen] = useState(false);

  const vid = searchParams.get("vid");

  const resolvedViewConfig: AssetViewConfig = useMemo(() => {
    if (vid) {
      const all = [...(viewList?.personal ?? []), ...(viewList?.shared ?? [])];
      const found = all.find(v => String(v.id) === vid);
      return found?.config ?? activeConfig;
    }
    return activeConfig;
  }, [vid, viewList, activeConfig]);

  // ── URL state ──────────────────────────────────────────────────────────────
  const searchText         = searchParams.get("search")              ?? "";
  const typeFilter         = searchParams.get("type")               ?? "";
  const condFilter         = searchParams.get("condition")          ?? "";
  const statusesParam      = searchParams.get("statuses")           ?? "";
  const locationIdParam    = searchParams.get("inventoryLocationId") ?? "";
  const sortBy             = searchParams.get("sortBy")             ?? resolvedViewConfig.sort.by;
  const sortOrder          = (searchParams.get("sortOrder") ?? resolvedViewConfig.sort.order) as "asc" | "desc";
  const page               = Math.max(1, Number(searchParams.get("page") ?? "1"));

  const [searchInput, setSearchInput] = useState(searchText);

  const chip = derivedChip(statusesParam);

  function setParam(key: string, value: string | null) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value); else next.delete(key);
    next.delete("page");
    setSearchParams(next, { replace: true });
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const next = new URLSearchParams(searchParams);
    if (searchInput) next.set("search", searchInput); else next.delete("search");
    next.delete("page");
    setSearchParams(next, { replace: true });
  }

  function selectChip(key: string) {
    const chipDef = FILTER_CHIPS.find(c => c.key === key);
    const next = new URLSearchParams(searchParams);
    if (chipDef?.statuses && chipDef.statuses.length > 0) {
      next.set("statuses", chipDef.statuses.join(","));
    } else {
      next.delete("statuses");
    }
    next.delete("page");
    setSearchParams(next, { replace: true });
  }

  function handleSortChange(col: string) {
    const next = new URLSearchParams(searchParams);
    if (next.get("sortBy") === col) {
      next.set("sortOrder", next.get("sortOrder") === "asc" ? "desc" : "asc");
    } else {
      next.set("sortBy", col);
      next.set("sortOrder", "asc");
    }
    next.delete("page");
    setSearchParams(next, { replace: true });
  }

  function clearFilters() {
    setSearchInput("");
    setSearchParams({}, { replace: true });
  }

  function applyNamedView(v: { id: number; config: AssetViewConfig }) {
    const record: Record<string, string> = { vid: String(v.id) };
    const f = v.config.filters ?? {};
    if (f.type)      record.type      = f.type;
    if (f.condition) record.condition = f.condition;
    if (f.statuses)  record.statuses  = f.statuses;
    record.sortBy    = v.config.sort.by;
    record.sortOrder = v.config.sort.order;
    setSearchParams(record, { replace: true });
  }

  // ── Data queries ───────────────────────────────────────────────────────────

  const params: Record<string, string | number> = {
    page, pageSize: 25, sortBy, sortOrder,
  };
  if (searchText)     params.search              = searchText;
  if (typeFilter)     params.type               = typeFilter;
  if (condFilter)     params.condition          = condFilter;
  if (statusesParam)  params.statuses           = statusesParam;
  if (locationIdParam) params.inventoryLocationId = Number(locationIdParam);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["assets", params],
    queryFn: async () => {
      const { data } = await axios.get<{
        items: AssetSummary[];
        meta:  { total: number; page: number; pageSize: number; pages: number };
      }>("/api/assets", { params });
      return data;
    },
    keepPreviousData: true,
  });

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["assets-stats"],
    queryFn: async () => (await axios.get<AssetStats>("/api/assets/stats")).data,
    staleTime: 30_000,
  });

  const { data: inventoryLocations } = useQuery({
    queryKey: ["inventory-locations"],
    queryFn: async () =>
      (await axios.get<{ locations: Array<{ id: number; name: string; code: string | null }> }>("/api/inventory-locations")).data.locations,
    staleTime: 60_000,
  });

  const cloneMut = useMutation({
    mutationFn: (id: number) => axios.post<{ id: number }>(`/api/assets/${id}/clone`),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["assets"] });
      qc.invalidateQueries({ queryKey: ["assets-stats"] });
      navigate(`/assets/${res.data.id}`);
    },
  });

  // ── Selection ─────────────────────────────────────────────────────────────
  const [rowSelection,      setRowSelection]      = useState<RowSelectionState>({});
  const [selectionResetKey, setSelectionResetKey] = useState(0);
  const [selectedIds,       setSelectedIds]       = useState<number[]>([]);

  const clearSelection = useCallback(() => {
    setRowSelection({});
    setSelectionResetKey(k => k + 1);
  }, []);

  // Reset selection when filters or page change
  useEffect(() => { setRowSelection({}); }, [searchText, typeFilter, condFilter, statusesParam, page]);
  useEffect(() => { setRowSelection({}); }, [selectionResetKey]);

  // Sync selectedIds when rowSelection changes
  useEffect(() => {
    const ids = Object.keys(rowSelection).filter(k => rowSelection[k]).map(Number);
    setSelectedIds(ids);
  }, [rowSelection]);

  // ── Column defs ────────────────────────────────────────────────────────────

  const COLUMN_DEFS: Record<AssetColumnId, ColumnDef<AssetSummary>> = useMemo(() => ({
    assetNumber: {
      id: "assetNumber",
      header: () => (
        <SortableHeader col="assetNumber" label="#" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSortChange} />
      ),
      cell: ({ row }) => (
        <Link to={`/assets/${row.original.assetNumber}`} className="block hover:text-primary transition-colors">
          <p className="font-medium leading-tight">{row.original.name}</p>
          <p className="font-mono text-[11px] text-muted-foreground mt-0.5">{row.original.assetNumber}</p>
        </Link>
      ),
    },
    name: {
      id: "name",
      header: () => (
        <SortableHeader col="name" label="Name" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSortChange} />
      ),
      cell: ({ row }) => (
        <Link to={`/assets/${row.original.assetNumber}`} className="block hover:text-primary transition-colors">
          <p className="font-medium leading-tight truncate max-w-[200px]">{row.original.name}</p>
        </Link>
      ),
    },
    type: {
      id: "type",
      header: () => (
        <SortableHeader col="type" label="Type" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSortChange} />
      ),
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {ASSET_TYPE_LABEL[row.original.type]}
        </span>
      ),
    },
    status: {
      id: "status",
      header: () => (
        <SortableHeader col="status" label="Status" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSortChange} />
      ),
      cell: ({ row }) => {
        const sp = STATUS_PALETTE[row.original.status];
        return (
          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[11px] font-semibold ${sp.pill}`}>
            <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${sp.dot}`} />
            {ASSET_STATUS_LABEL[row.original.status]}
          </span>
        );
      },
    },
    condition: {
      id: "condition",
      header: () => (
        <SortableHeader col="condition" label="Condition" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSortChange} />
      ),
      cell: ({ row }) => (
        <span className={`text-xs font-medium whitespace-nowrap ${CONDITION_COLOR[row.original.condition] ?? ""}`}>
          {ASSET_CONDITION_LABEL[row.original.condition]}
        </span>
      ),
    },
    manufacturer: {
      id: "manufacturer",
      header: () => <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">Manufacturer</span>,
      cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.manufacturer ?? "—"}</span>,
    },
    model: {
      id: "model",
      header: () => <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">Model</span>,
      cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.model ?? "—"}</span>,
    },
    serialNumber: {
      id: "serialNumber",
      header: () => <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">Serial No.</span>,
      cell: ({ row }) => <span className="font-mono text-xs text-muted-foreground">{row.original.serialNumber ?? "—"}</span>,
    },
    assetTag: {
      id: "assetTag",
      header: () => <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">Asset Tag</span>,
      cell: ({ row }) => <span className="font-mono text-xs text-muted-foreground">{row.original.assetTag ?? "—"}</span>,
    },
    assignedTo: {
      id: "assignedTo",
      header: () => <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">Assigned To</span>,
      cell: ({ row }) => row.original.assignedTo
        ? <span className="text-xs">{row.original.assignedTo.name}</span>
        : <span className="text-xs text-muted-foreground italic">—</span>,
    },
    owner: {
      id: "owner",
      header: () => <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">Owner</span>,
      cell: ({ row }) => row.original.owner
        ? <span className="text-xs">{row.original.owner.name}</span>
        : <span className="text-xs text-muted-foreground italic">—</span>,
    },
    team: {
      id: "team",
      header: () => <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">Team</span>,
      cell: ({ row }) => row.original.team
        ? (
          <span className="inline-flex items-center gap-1.5 text-xs">
            <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: row.original.team.color }} />
            {row.original.team.name}
          </span>
        )
        : <span className="text-xs text-muted-foreground italic">—</span>,
    },
    location: {
      id: "location",
      header: () => <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">Location</span>,
      cell: ({ row }) => {
        const inv = row.original.inventoryLocation;
        const txt = inv?.name ?? row.original.location ?? null;
        return (
          <span className="text-xs text-muted-foreground truncate block max-w-[140px]" title={txt ?? undefined}>
            {inv && <Warehouse className="h-2.5 w-2.5 inline mr-1 opacity-50" />}
            {txt ?? "—"}
          </span>
        );
      },
    },
    warrantyExpiry: {
      id: "warrantyExpiry",
      header: () => (
        <SortableHeader col="warrantyExpiry" label="Warranty" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSortChange} />
      ),
      cell: ({ row }) => <WarrantyCell expiry={row.original.warrantyExpiry} />,
    },
    purchaseDate: {
      id: "purchaseDate",
      header: () => (
        <SortableHeader col="purchaseDate" label="Purchased" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSortChange} />
      ),
      cell: ({ row }) => row.original.purchaseDate
        ? <span className="text-xs text-muted-foreground">{new Date(row.original.purchaseDate).toLocaleDateString(undefined, { dateStyle: "medium" })}</span>
        : <span className="text-xs text-muted-foreground">—</span>,
    },
    purchasePrice: {
      id: "purchasePrice",
      header: () => <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">Price</span>,
      cell: ({ row }) => row.original.purchasePrice
        ? <span className="text-xs tabular-nums">{row.original.currency} {Number(row.original.purchasePrice).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
        : <span className="text-xs text-muted-foreground">—</span>,
    },
    vendor: {
      id: "vendor",
      header: () => <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">Vendor</span>,
      cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.vendor ?? "—"}</span>,
    },
    discoverySource: {
      id: "discoverySource",
      header: () => <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">Source</span>,
      cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.discoverySource ?? "—"}</span>,
    },
    createdAt: {
      id: "createdAt",
      header: () => (
        <SortableHeader col="createdAt" label="Created" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSortChange} />
      ),
      cell: ({ row }) => <span className="text-xs text-muted-foreground">{new Date(row.original.createdAt).toLocaleDateString(undefined, { dateStyle: "medium" })}</span>,
    },
    updatedAt: {
      id: "updatedAt",
      header: () => (
        <SortableHeader col="updatedAt" label="Updated" sortBy={sortBy} sortOrder={sortOrder} onSort={handleSortChange} />
      ),
      cell: ({ row }) => <span className="text-xs text-muted-foreground">{new Date(row.original.updatedAt).toLocaleDateString(undefined, { dateStyle: "medium" })}</span>,
    },
  }), [sortBy, sortOrder]); // eslint-disable-line react-hooks/exhaustive-deps

  // Checkbox column — always first
  const checkboxColumnDef: ColumnDef<AssetSummary> = {
    id: "__select__",
    header: ({ table }) => (
      <input
        type="checkbox"
        className="h-3.5 w-3.5 cursor-pointer rounded border-border"
        checked={table.getIsAllPageRowsSelected()}
        ref={el => { if (el) el.indeterminate = table.getIsSomePageRowsSelected(); }}
        onChange={table.getToggleAllPageRowsSelectedHandler()}
        aria-label="Select all"
      />
    ),
    cell: ({ row }) => (
      <input
        type="checkbox"
        className="h-3.5 w-3.5 cursor-pointer rounded border-border"
        checked={row.getIsSelected()}
        onChange={row.getToggleSelectedHandler()}
        aria-label="Select row"
        onClick={e => e.stopPropagation()}
      />
    ),
  };

  // Actions column — always last
  const actionsColumnDef: ColumnDef<AssetSummary> = {
    id: "__actions__",
    header: () => null,
    cell: ({ row }) => (
      <div className="opacity-0 group-hover:opacity-100 transition-opacity">
        <RowActions asset={row.original} onClone={id => cloneMut.mutate(id)} />
      </div>
    ),
  };

  // Build ordered visible columns from view config
  const visibleColumns = useMemo<ColumnDef<AssetSummary>[]>(() => {
    const cols = resolvedViewConfig.columns
      .filter(c => c.visible)
      .map(c => COLUMN_DEFS[c.id])
      .filter(Boolean);
    return [checkboxColumnDef, ...cols, actionsColumnDef];
  }, [resolvedViewConfig, COLUMN_DEFS]); // eslint-disable-line react-hooks/exhaustive-deps

  const table = useReactTable({
    data:             data?.items ?? [],
    columns:          visibleColumns,
    state:            { rowSelection },
    getRowId:         row => String(row.id),
    onRowSelectionChange: updater => {
      setRowSelection(typeof updater === "function" ? updater(rowSelection) : updater);
    },
    getCoreRowModel:  getCoreRowModel(),
    manualPagination: true,
    manualSorting:    true,
  });

  // ── Derived state ──────────────────────────────────────────────────────────

  const hasFilters    = !!(searchText || typeFilter || condFilter || statusesParam || locationIdParam);
  const allViews      = [...(viewList?.personal ?? []), ...(viewList?.shared ?? [])];
  const activeVidView = vid ? allViews.find(v => String(v.id) === vid) : null;

  const chipCounts: Record<string, number | undefined> = {
    all:         stats?.total,
    active:      stats?.active,
    in_stock:    stats?.inStock,
    ordered:     stats?.ordered,
    maintenance: stats?.maintenance,
    retired:     stats?.retired,
  };

  return (
    <div className="space-y-0">
      {/* ── Page header ── */}
      <div className="flex items-start justify-between gap-4 pb-5">
        <div>
          <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2">
            <Package className="h-5 w-5 text-muted-foreground shrink-0" />
            Assets
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            IT asset inventory · hardware, software licenses, and infrastructure
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" className="h-8 gap-1.5"
            onClick={() => setCustomizerOpen(true)}>
            <Columns3 className="h-4 w-4" />
            {activeView ? activeView.name : "Columns"}
          </Button>
          <NewAssetDialog onCreated={() => { refetch(); qc.invalidateQueries({ queryKey: ["assets-stats"] }); }} />
        </div>
      </div>

      {/* ── Stats bar ── */}
      <div className="rounded-lg border border-border/60 bg-card overflow-hidden mb-4">
        <div className="flex divide-x divide-border/50 overflow-x-auto">
          <StatCard label="Total assets"           value={stats?.total}            loading={statsLoading} />
          <StatCard label="Active (deployed)"       value={stats?.active}           loading={statsLoading}
            accent="text-emerald-600 dark:text-emerald-400" onClick={() => selectChip("active")} />
          <StatCard label="In stock"                value={stats?.inStock}          loading={statsLoading}
            accent="text-sky-600 dark:text-sky-400" onClick={() => selectChip("in_stock")} />
          <StatCard label="Ordered"                 value={stats?.ordered}          loading={statsLoading}
            onClick={() => selectChip("ordered")} />
          <StatCard label="Maintenance"             value={stats?.maintenance}      loading={statsLoading}
            accent="text-amber-600 dark:text-amber-400" onClick={() => selectChip("maintenance")} />
          <StatCard label="Warranty expiring (90d)" value={stats?.warrantyExpiring} loading={statsLoading}
            accent={stats?.warrantyExpiring ? "text-amber-600 dark:text-amber-400" : undefined} />
        </div>
      </div>

      {/* ── Saved views row ── */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <span className="text-xs text-muted-foreground font-medium mr-1">Views:</span>

        {/* Status chips */}
        {FILTER_CHIPS.map(fc => {
          const active = chip === fc.key && !vid;
          const count  = chipCounts[fc.key];
          return (
            <button key={fc.key} onClick={() => { selectChip(fc.key); if (vid) { const n = new URLSearchParams(searchParams); n.delete("vid"); setSearchParams(n, { replace: true }); } }}
              className={[
                "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-xs font-medium transition-all",
                active
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border/60 bg-muted/30 text-muted-foreground hover:border-border hover:text-foreground",
              ].join(" ")}
            >
              {fc.label}
              {count !== undefined && (
                <span className={`text-[10px] tabular-nums ${active ? "text-primary/70" : "text-muted-foreground/70"}`}>
                  {count.toLocaleString()}
                </span>
              )}
            </button>
          );
        })}

        {/* Named views dropdown */}
        {allViews.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant={vid ? "secondary" : "ghost"} size="sm" className="h-7 text-xs gap-1">
                {activeVidView ? (
                  <>{activeVidView.emoji && <span>{activeVidView.emoji}</span>}{activeVidView.name}</>
                ) : "Saved views"}
                <ChevronDown className="h-3 w-3 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-52">
              {(viewList?.personal?.length ?? 0) > 0 && (
                <>
                  <div className="px-2 py-1 text-xs text-muted-foreground font-medium">Personal</div>
                  {viewList!.personal.map(v => (
                    <DropdownMenuItem key={v.id} className="gap-2 cursor-pointer" onClick={() => applyNamedView(v)}>
                      {v.emoji && <span>{v.emoji}</span>}
                      <span className="flex-1">{v.name}</span>
                      {v.isDefault && <span className="text-xs text-muted-foreground">default</span>}
                    </DropdownMenuItem>
                  ))}
                </>
              )}
              {(viewList?.shared?.length ?? 0) > 0 && (
                <>
                  {(viewList?.personal?.length ?? 0) > 0 && <DropdownMenuSeparator />}
                  <div className="px-2 py-1 text-xs text-muted-foreground font-medium">Shared</div>
                  {viewList!.shared.map(v => (
                    <DropdownMenuItem key={v.id} className="gap-2 cursor-pointer" onClick={() => applyNamedView(v)}>
                      {v.emoji && <span>{v.emoji}</span>}
                      <span>{v.name}</span>
                    </DropdownMenuItem>
                  ))}
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* ── Active named-view banner ── */}
      {activeVidView && (
        <div className="flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-2 text-sm mb-3">
          {activeVidView.emoji && <span>{activeVidView.emoji}</span>}
          <span className="font-medium flex-1">View: {activeVidView.name}</span>
          <button type="button" onClick={() => setSearchParams({}, { replace: true })}
            className="ml-1 rounded p-0.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* ── Toolbar ── */}
      <div className="space-y-2 mb-3">
        <div className="flex flex-wrap gap-2 items-center">
          <form onSubmit={handleSearch} className="flex gap-1.5">
            <div className="relative">
              <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Search name, number, serial, tag, vendor…"
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                className="pl-8 h-8 text-sm w-72"
              />
            </div>
            <Button type="submit" size="sm" variant="secondary" className="h-8 px-3">Search</Button>
          </form>

          <Select value={typeFilter || "_all"} onValueChange={v => setParam("type", v === "_all" ? null : v)}>
            <SelectTrigger className="h-8 text-sm w-44"><SelectValue placeholder="All types" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">All types</SelectItem>
              {ASSET_TYPES.map(t => <SelectItem key={t} value={t}>{ASSET_TYPE_LABEL[t]}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={condFilter || "_all"} onValueChange={v => setParam("condition", v === "_all" ? null : v)}>
            <SelectTrigger className="h-8 text-sm w-36"><SelectValue placeholder="All conditions" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">All conditions</SelectItem>
              {ASSET_CONDITIONS.map(c => <SelectItem key={c} value={c}>{ASSET_CONDITION_LABEL[c]}</SelectItem>)}
            </SelectContent>
          </Select>

          {(inventoryLocations?.length ?? 0) > 0 && (
            <Select
              value={locationIdParam || "_all"}
              onValueChange={v => setParam("inventoryLocationId", v === "_all" ? null : v)}
            >
              <SelectTrigger className="h-8 text-sm w-44">
                <Warehouse className="h-3.5 w-3.5 mr-1.5 text-muted-foreground shrink-0" />
                <SelectValue placeholder="All stockrooms" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">All stockrooms</SelectItem>
                {inventoryLocations!.map(l => (
                  <SelectItem key={l.id} value={String(l.id)}>
                    {l.name}{l.code ? ` (${l.code})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {hasFilters && (
            <Button size="sm" variant="ghost" className="h-8 text-xs text-muted-foreground" onClick={clearFilters}>
              Clear
            </Button>
          )}
        </div>
      </div>

      {error && <ErrorAlert error={error} fallback="Failed to load assets" />}
      {cloneMut.error && <ErrorAlert error={cloneMut.error} fallback="Clone failed" />}

      {/* ── Table ── */}
      <div className="rounded-lg border border-border/60 overflow-x-auto">
        <table className="w-full min-w-max text-sm">
          <thead>
            <tr className="border-b border-border/50 bg-muted/20">
              {table.getFlatHeaders().map(header => (
                <th key={header.id}
                  className="text-left px-3 py-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70 whitespace-nowrap">
                  {header.isPlaceholder
                    ? null
                    : typeof header.column.columnDef.header === "function"
                      ? header.column.columnDef.header(header.getContext())
                      : header.column.columnDef.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {isLoading && Array.from({ length: 10 }).map((_, i) => (
              <tr key={i}>
                {table.getFlatHeaders().map((h, j) => (
                  <td key={h.id} className="px-3 py-2.5">
                    <Skeleton className={`h-4 ${j === 0 ? "w-5" : j === table.getFlatHeaders().length - 1 ? "w-6" : "w-20"}`} />
                  </td>
                ))}
              </tr>
            ))}

            {!isLoading && table.getRowModel().rows.length === 0 && (
              <tr>
                <td colSpan={visibleColumns.length} className="px-4 py-16 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <Package className="h-9 w-9 text-muted-foreground/20" />
                    <p className="text-sm font-medium text-muted-foreground">
                      {hasFilters ? "No assets match these filters" : "No assets registered yet"}
                    </p>
                    {hasFilters
                      ? <button className="text-xs text-muted-foreground underline" onClick={clearFilters}>Clear filters</button>
                      : <p className="text-xs text-muted-foreground">Register your first asset to get started</p>
                    }
                  </div>
                </td>
              </tr>
            )}

            {table.getRowModel().rows.map(row => (
              <tr key={row.id} className="hover:bg-muted/20 transition-colors group">
                {row.getVisibleCells().map(cell => (
                  <td key={cell.id} className="px-3 py-2.5 align-middle">
                    {typeof cell.column.columnDef.cell === "function"
                      ? cell.column.columnDef.cell(cell.getContext())
                      : cell.column.columnDef.cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Pagination ── */}
      {data && data.meta.pages > 1 && (
        <div className="flex items-center justify-between pt-3 text-sm">
          <p className="text-xs text-muted-foreground">
            {((data.meta.page - 1) * data.meta.pageSize) + 1}–{Math.min(data.meta.page * data.meta.pageSize, data.meta.total)} of {data.meta.total.toLocaleString()} assets
            {selectedIds.length > 0 && (
              <span className="ml-2 text-primary font-medium">· {selectedIds.length} selected</span>
            )}
          </p>
          <div className="flex gap-1.5">
            <Button variant="outline" size="sm" className="h-7 text-xs"
              disabled={page <= 1}
              onClick={() => setParam("page", String(page - 1))}>
              <ChevronLeft className="h-3.5 w-3.5" /> Prev
            </Button>
            <Button variant="outline" size="sm" className="h-7 text-xs"
              disabled={page >= data.meta.pages}
              onClick={() => setParam("page", String(page + 1))}>
              Next <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      {/* ── Bulk actions ── */}
      <AssetBulkActionsBar selectedIds={selectedIds} onClearSelection={clearSelection} />

      {/* ── View customizer ── */}
      <AssetViewCustomizer open={customizerOpen} onOpenChange={setCustomizerOpen} />
    </div>
  );
}

// ── Sortable header cell ──────────────────────────────────────────────────────

function SortableHeader({
  col, label, sortBy, sortOrder, onSort,
}: { col: string; label: string; sortBy: string; sortOrder: string; onSort: (col: string) => void }) {
  const meta = Object.values(ASSET_COLUMN_META).find(m => m.sortKey === col);
  if (!meta?.sortable) {
    return <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">{label}</span>;
  }
  return (
    <button
      type="button"
      onClick={() => onSort(col)}
      className="inline-flex items-center text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70 hover:text-foreground transition-colors"
    >
      {label}
      <SortIcon col={col} sortBy={sortBy} sortOrder={sortOrder} />
    </button>
  );
}
