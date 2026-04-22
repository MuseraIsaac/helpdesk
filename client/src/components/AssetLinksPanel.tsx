/**
 * AssetLinksPanel — reusable panel to view, add, and remove asset links on
 * any ITSM entity (Incident, Request, Problem, Change, CI/CMDB).
 *
 * Usage:
 *   <AssetLinksPanel entityType="incidents" entityId={42} readonly={false} />
 *
 * Self-managed: fetches its own linked-asset list; accepts no pre-loaded data.
 */
import { useState, useRef, useEffect, useCallback } from "react";
import { Link } from "react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import {
  ASSET_TYPE_LABEL,
  ASSET_STATUS_LABEL,
  type AssetStatus,
} from "core/constants/assets.ts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import ErrorAlert from "@/components/ErrorAlert";
import {
  Server, Monitor, Cpu, Wifi, Smartphone, Cloud, Package, Key, Boxes,
  Link2, Unlink2, Search, Plus, AlertTriangle, ExternalLink, Loader2,
  ShieldAlert,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

export type AssetLinkEntityType = "incidents" | "requests" | "problems" | "changes" | "ci";

export interface LinkedAsset {
  id:            number;
  assetNumber:   string;
  name:          string;
  type:          string;
  status:        string;
  manufacturer:  string | null;
  model:         string | null;
  serialNumber:  string | null;
  assetTag:      string | null;
  warrantyExpiry: string | null;
  location:      string | null;
  site:          string | null;
  assignedTo:    { id: string; name: string } | null;
  team:          { id: number; name: string; color: string } | null;
  linkedAt:      string | null;
}

interface AssetSearchResult {
  items: LinkedAsset[];
}

interface Props {
  entityType: AssetLinkEntityType;
  entityId:   number;
  readonly?:  boolean;
  /** Called after any successful link/unlink so parent can optionally refetch. */
  onChanged?: () => void;
}

// ── Colour / icon maps ────────────────────────────────────────────────────────

const TYPE_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  hardware:          Monitor,
  end_user_device:   Cpu,
  network_equipment: Wifi,
  mobile_device:     Smartphone,
  cloud_resource:    Cloud,
  software_license:  Key,
  iot_device:        Boxes,
  peripheral:        Package,
};

const TYPE_COLOR: Record<string, string> = {
  hardware:          "bg-slate-100  text-slate-600  dark:bg-slate-800  dark:text-slate-300",
  end_user_device:   "bg-blue-100   text-blue-600   dark:bg-blue-900/40 dark:text-blue-300",
  network_equipment: "bg-violet-100 text-violet-600 dark:bg-violet-900/40 dark:text-violet-300",
  mobile_device:     "bg-sky-100    text-sky-600    dark:bg-sky-900/40 dark:text-sky-300",
  cloud_resource:    "bg-cyan-100   text-cyan-600   dark:bg-cyan-900/40 dark:text-cyan-300",
  software_license:  "bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-300",
  peripheral:        "bg-orange-100 text-orange-600 dark:bg-orange-900/40 dark:text-orange-300",
};

const STATUS_DOT: Record<AssetStatus, string> = {
  ordered:           "bg-slate-400",
  in_stock:          "bg-sky-500",
  deployed:          "bg-emerald-500",
  in_use:            "bg-blue-500",
  under_maintenance: "bg-amber-500",
  in_repair:         "bg-orange-500",
  retired:           "bg-muted-foreground/50",
  disposed:          "bg-muted-foreground/30",
  lost_stolen:       "bg-red-500",
};

const STATUS_TEXT: Record<AssetStatus, string> = {
  ordered:           "text-slate-600 dark:text-slate-400",
  in_stock:          "text-sky-700   dark:text-sky-400",
  deployed:          "text-emerald-700 dark:text-emerald-400",
  in_use:            "text-blue-700  dark:text-blue-400",
  under_maintenance: "text-amber-700 dark:text-amber-400",
  in_repair:         "text-orange-700 dark:text-orange-400",
  retired:           "text-muted-foreground",
  disposed:          "text-muted-foreground",
  lost_stolen:       "text-destructive",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function assetApiBase(entityType: AssetLinkEntityType, entityId: number): string {
  const segment = entityType === "ci" ? "cmdb" : entityType;
  return `/api/${segment}/${entityId}/assets`;
}

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

function useDebounce<T>(value: T, ms = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

// ── Linked asset card ─────────────────────────────────────────────────────────

function LinkedAssetCard({
  asset,
  onUnlink,
  unlinking,
  readonly,
}: {
  asset:     LinkedAsset;
  onUnlink:  () => void;
  unlinking: boolean;
  readonly:  boolean;
}) {
  const TypeIcon = TYPE_ICON[asset.type] ?? Server;
  const typeColor = TYPE_COLOR[asset.type] ?? "bg-muted text-muted-foreground";
  const dotColor  = STATUS_DOT[asset.status as AssetStatus] ?? "bg-muted-foreground/40";
  const txtColor  = STATUS_TEXT[asset.status as AssetStatus] ?? "text-muted-foreground";
  const days      = daysUntil(asset.warrantyExpiry);
  const warrantyWarn = days !== null && days >= 0 && days <= 30;
  const warrantyExp  = days !== null && days < 0;

  return (
    <div className="group flex items-start gap-3 rounded-lg border border-border/60 bg-card px-3 py-2.5 transition-all hover:border-border hover:shadow-sm">
      {/* Type icon */}
      <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${typeColor}`}>
        <TypeIcon className="h-3.5 w-3.5" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            to={`/assets/${asset.id}`}
            className="text-sm font-semibold hover:underline leading-tight truncate max-w-[180px]"
          >
            {asset.name}
          </Link>
          <span className="font-mono text-[10px] text-muted-foreground tracking-tight">{asset.assetNumber}</span>
        </div>

        <div className="flex items-center gap-2 mt-1 flex-wrap">
          {/* Status */}
          <span className={`flex items-center gap-1 text-[11px] font-medium ${txtColor}`}>
            <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${dotColor}`} />
            {ASSET_STATUS_LABEL[asset.status as AssetStatus] ?? asset.status}
          </span>

          {/* Type */}
          <span className="text-[11px] text-muted-foreground">
            {ASSET_TYPE_LABEL[asset.type as keyof typeof ASSET_TYPE_LABEL] ?? asset.type}
          </span>

          {/* Model */}
          {(asset.manufacturer || asset.model) && (
            <span className="text-[11px] text-muted-foreground truncate">
              {[asset.manufacturer, asset.model].filter(Boolean).join(" ")}
            </span>
          )}
        </div>

        <div className="flex items-center gap-3 mt-1 flex-wrap">
          {/* Assignment */}
          {asset.assignedTo && (
            <span className="text-[11px] text-muted-foreground">
              → {asset.assignedTo.name}
            </span>
          )}

          {/* Location */}
          {(asset.site || asset.location) && (
            <span className="text-[11px] text-muted-foreground truncate">
              📍 {asset.site || asset.location}
            </span>
          )}

          {/* Warranty warning */}
          {warrantyWarn && (
            <span className="flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
              <AlertTriangle className="h-2.5 w-2.5" />
              Warranty {days === 0 ? "today" : `in ${days}d`}
            </span>
          )}
          {warrantyExp && (
            <span className="flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-destructive/10 text-destructive">
              <ShieldAlert className="h-2.5 w-2.5" />
              Warranty expired
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0">
        <Link
          to={`/assets/${asset.id}`}
          className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
          title="Open asset"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </Link>
        {!readonly && (
          <button
            onClick={onUnlink}
            disabled={unlinking}
            title="Unlink asset"
            className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive disabled:opacity-30"
          >
            {unlinking
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <Unlink2 className="h-3.5 w-3.5" />
            }
          </button>
        )}
      </div>
    </div>
  );
}

// ── Search result row in the popover ─────────────────────────────────────────

function SearchResultRow({
  asset,
  linked,
  loading,
  onLink,
}: {
  asset:   LinkedAsset;
  linked:  boolean;
  loading: boolean;
  onLink:  () => void;
}) {
  const TypeIcon = TYPE_ICON[asset.type] ?? Server;
  const typeColor = TYPE_COLOR[asset.type] ?? "bg-muted text-muted-foreground";
  const dotColor  = STATUS_DOT[asset.status as AssetStatus] ?? "bg-muted-foreground/40";

  return (
    <button
      disabled={linked || loading}
      onClick={onLink}
      className={`w-full text-left flex items-center gap-2.5 px-3 py-2.5 transition-colors
        ${linked
          ? "opacity-50 cursor-not-allowed bg-muted/40"
          : "hover:bg-accent active:bg-accent/80 cursor-pointer"
        }`}
    >
      {/* Type pill */}
      <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded ${typeColor}`}>
        <TypeIcon className="h-3 w-3" />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium leading-tight truncate">{asset.name}</span>
          <span className="font-mono text-[9px] text-muted-foreground shrink-0">{asset.assetNumber}</span>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${dotColor}`} />
          <span className="text-[11px] text-muted-foreground">
            {ASSET_STATUS_LABEL[asset.status as AssetStatus] ?? asset.status}
          </span>
          <span className="text-[11px] text-muted-foreground truncate">
            {ASSET_TYPE_LABEL[asset.type as keyof typeof ASSET_TYPE_LABEL] ?? asset.type}
          </span>
          {asset.team && (
            <span
              className="text-[10px] font-medium px-1 py-0.5 rounded"
              style={{ background: `${asset.team.color}22`, color: asset.team.color }}
            >
              {asset.team.name}
            </span>
          )}
        </div>
      </div>

      {linked && (
        <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">Linked</Badge>
      )}
      {!linked && loading && (
        <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground shrink-0" />
      )}
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AssetLinksPanel({ entityType, entityId, readonly = false, onChanged }: Props) {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [search,      setSearch]      = useState("");
  const [linkingId,   setLinkingId]   = useState<number | null>(null);
  const [unlinkingId, setUnlinkingId] = useState<number | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const debouncedSearch = useDebounce(search, 280);
  const qc = useQueryClient();

  const base = assetApiBase(entityType, entityId);
  const linkedKey = ["entity-assets", entityType, entityId];

  // Linked assets for this entity
  const { data: linked = [], isLoading: loadingLinked } = useQuery<LinkedAsset[]>({
    queryKey: linkedKey,
    queryFn:  () => axios.get<LinkedAsset[]>(base).then(r => r.data),
    staleTime: 30_000,
  });

  // Asset search results
  const { data: searchData, isFetching: searching } = useQuery<AssetSearchResult>({
    queryKey: ["asset-search-for-link", debouncedSearch],
    queryFn:  () =>
      axios.get<AssetSearchResult>("/api/assets", {
        params: { search: debouncedSearch, pageSize: 15, sortBy: "name", sortOrder: "asc" },
      }).then(r => r.data),
    enabled:   popoverOpen,
    staleTime: 20_000,
    placeholderData: prev => prev,
  });

  const linkedIds = new Set(linked.map(a => a.id));

  const linkMutation = useMutation({
    mutationFn: (assetId: number) =>
      axios.post<LinkedAsset[]>(base, { assetId }).then(r => r.data),
    onMutate:  (assetId) => setLinkingId(assetId),
    onSuccess: (data) => {
      qc.setQueryData(linkedKey, data);
      setLinkingId(null);
      setSearch("");
      setPopoverOpen(false);
      onChanged?.();
    },
    onError: () => setLinkingId(null),
  });

  const unlinkMutation = useMutation({
    mutationFn: (assetId: number) => axios.delete(`${base}/${assetId}`),
    onMutate:  (assetId) => setUnlinkingId(assetId),
    onSuccess: (_data, assetId) => {
      qc.setQueryData(linkedKey, (prev: LinkedAsset[] = []) =>
        prev.filter(a => a.id !== assetId)
      );
      setUnlinkingId(null);
      onChanged?.();
    },
    onError: () => setUnlinkingId(null),
  });

  function handlePopoverOpenChange(v: boolean) {
    setPopoverOpen(v);
    if (v)  setTimeout(() => searchRef.current?.focus(), 50);
    else    setSearch("");
  }

  const searchResults = searchData?.items ?? [];
  const showEmpty = !searching && searchResults.length === 0;

  return (
    <div className="space-y-2">
      {/* Errors */}
      {(linkMutation.error || unlinkMutation.error) && (
        <ErrorAlert
          error={linkMutation.error ?? unlinkMutation.error}
          fallback="Asset link operation failed"
        />
      )}

      {/* Linked list */}
      {loadingLinked ? (
        <div className="space-y-1.5">
          {[1, 2].map(i => (
            <div key={i} className="h-14 rounded-lg border bg-muted/30 animate-pulse" />
          ))}
        </div>
      ) : linked.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border/60 py-5 text-center">
          <Link2 className="h-5 w-5 text-muted-foreground/40" />
          <p className="text-xs text-muted-foreground">No assets linked</p>
          {!readonly && (
            <p className="text-[11px] text-muted-foreground/60">
              Link an asset to track its involvement in this record.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-1.5">
          {linked.map(asset => (
            <LinkedAssetCard
              key={asset.id}
              asset={asset}
              readonly={readonly}
              onUnlink={() => unlinkMutation.mutate(asset.id)}
              unlinking={unlinkingId === asset.id}
            />
          ))}
        </div>
      )}

      {/* Link button + popover */}
      {!readonly && (
        <Popover open={popoverOpen} onOpenChange={handlePopoverOpenChange}>
          <PopoverTrigger asChild>
            <Button
              size="sm" variant="outline"
              className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              <Plus className="h-3 w-3" />
              Link an Asset
            </Button>
          </PopoverTrigger>

          <PopoverContent
            align="start"
            sideOffset={6}
            className="p-0 w-[340px] shadow-lg"
          >
            {/* Header */}
            <div className="flex items-center gap-2 border-b px-3 py-1.5 bg-muted/30">
              <Server className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Link Asset
              </span>
            </div>

            {/* Search input */}
            <div className="flex items-center gap-2 border-b px-3 py-1.5">
              {searching
                ? <Loader2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground animate-spin" />
                : <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              }
              <input
                ref={searchRef}
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search by name, asset #, serial…"
                className="flex h-8 w-full bg-transparent py-1 text-sm outline-none placeholder:text-muted-foreground"
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="text-muted-foreground hover:text-foreground shrink-0"
                >
                  <span className="text-[10px]">✕</span>
                </button>
              )}
            </div>

            {/* Results */}
            <div className="max-h-64 overflow-y-auto">
              {showEmpty && !searching && (
                <div className="py-6 text-center">
                  <Package className="h-6 w-6 mx-auto mb-2 text-muted-foreground/40" />
                  <p className="text-xs text-muted-foreground">
                    {search ? "No assets match your search." : "No assets found."}
                  </p>
                </div>
              )}

              {searchResults.map(asset => (
                <SearchResultRow
                  key={asset.id}
                  asset={asset}
                  linked={linkedIds.has(asset.id)}
                  loading={linkingId === asset.id}
                  onLink={() => {
                    if (!linkedIds.has(asset.id)) linkMutation.mutate(asset.id);
                  }}
                />
              ))}
            </div>

            {/* Footer hint */}
            <div className="border-t px-3 py-2 bg-muted/20">
              <p className="text-[10px] text-muted-foreground">
                {linked.length} asset{linked.length !== 1 ? "s" : ""} linked · Type to filter all assets
              </p>
            </div>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
