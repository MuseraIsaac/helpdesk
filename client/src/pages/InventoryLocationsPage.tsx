import { useState } from "react";
import { useNavigate } from "react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import axios from "axios";
import {
  LOCATION_TYPE_LABEL, INVENTORY_LOCATION_TYPES,
  type InventoryLocationSummary, type InventoryLocationType,
} from "core/constants/inventory.ts";
import {
  createLocationSchema, updateLocationSchema,
  type CreateLocationInput, type UpdateLocationInput,
} from "core/schemas/inventory.ts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import ErrorAlert from "@/components/ErrorAlert";
import ErrorMessage from "@/components/ErrorMessage";
import {
  Warehouse, Plus, Pencil, Package, CheckCircle2,
  Wrench, ArrowRight, ToggleLeft,
} from "lucide-react";

// ── Location type badge ───────────────────────────────────────────────────────

const TYPE_COLORS: Record<InventoryLocationType, string> = {
  stockroom:       "bg-sky-50    text-sky-700    border-sky-200    dark:bg-sky-900/30    dark:text-sky-300",
  repair_facility: "bg-amber-50  text-amber-700  border-amber-200  dark:bg-amber-900/30  dark:text-amber-300",
  transit:         "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-900/30 dark:text-violet-300",
  deployed_site:   "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300",
};

const TYPE_ICON: Record<InventoryLocationType, React.ReactNode> = {
  stockroom:       <Warehouse  className="h-3.5 w-3.5" />,
  repair_facility: <Wrench     className="h-3.5 w-3.5" />,
  transit:         <ArrowRight className="h-3.5 w-3.5" />,
  deployed_site:   <Package    className="h-3.5 w-3.5" />,
};

// ── Location form ─────────────────────────────────────────────────────────────

function LocationForm({
  defaultValues,
  onSubmit,
  isPending,
  error,
  onCancel,
  submitLabel,
}: {
  defaultValues?: Partial<CreateLocationInput & { isActive?: boolean }>;
  onSubmit: (d: CreateLocationInput) => void;
  isPending: boolean;
  error?: unknown;
  onCancel: () => void;
  submitLabel: string;
}) {
  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<CreateLocationInput>({
    resolver: zodResolver(createLocationSchema),
    defaultValues: {
      locationType: "stockroom",
      ...defaultValues,
    },
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-2">
      {error && <ErrorAlert error={error as Error} fallback="Operation failed" />}

      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 space-y-1">
          <Label>Name <span className="text-destructive">*</span></Label>
          <Input {...register("name")} placeholder="IT Stockroom — Head Office" />
          {errors.name && <ErrorMessage message={errors.name.message} />}
        </div>

        <div className="space-y-1">
          <Label>Code <span className="text-muted-foreground font-normal">(optional)</span></Label>
          <Input {...register("code")} placeholder="HQ-IT-01" className="font-mono" />
          {errors.code && <ErrorMessage message={errors.code.message} />}
        </div>

        <div className="space-y-1">
          <Label>Type</Label>
          <Select
            value={watch("locationType") ?? "stockroom"}
            onValueChange={v => setValue("locationType", v as InventoryLocationType)}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {INVENTORY_LOCATION_TYPES.map(t => (
                <SelectItem key={t} value={t}>{LOCATION_TYPE_LABEL[t]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label>Site</Label>
          <Input {...register("site")} placeholder="London HQ" />
        </div>
        <div className="space-y-1">
          <Label>Building</Label>
          <Input {...register("building")} placeholder="Building A" />
        </div>
        <div className="space-y-1">
          <Label>Room</Label>
          <Input {...register("room")} placeholder="IT Storeroom 2B" />
        </div>
      </div>

      <div className="space-y-1">
        <Label>Description</Label>
        <Textarea {...register("description")} placeholder="What's kept here, who has access…" rows={2} />
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving…" : submitLabel}
        </Button>
      </DialogFooter>
    </form>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function InventoryLocationsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();

  const [createOpen, setCreateOpen]   = useState(false);
  const [editTarget, setEditTarget]   = useState<InventoryLocationSummary | null>(null);
  const [showInactive, setShowInactive] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["inventory-locations", { showInactive }],
    queryFn: async () => {
      const { data } = await axios.get<{ locations: InventoryLocationSummary[] }>(
        "/api/inventory-locations",
        { params: { showInactive } }
      );
      return data.locations;
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["inventory-locations"] });

  const createMut = useMutation({
    mutationFn: (d: CreateLocationInput) => axios.post("/api/inventory-locations", d),
    onSuccess: () => { setCreateOpen(false); invalidate(); },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, ...d }: UpdateLocationInput & { id: number }) =>
      axios.put(`/api/inventory-locations/${id}`, d),
    onSuccess: () => { setEditTarget(null); invalidate(); },
  });

  const deactivateMut = useMutation({
    mutationFn: (id: number) => axios.delete(`/api/inventory-locations/${id}`),
    onSuccess: invalidate,
  });

  const locations = data ?? [];
  const totalAssets = locations.reduce((s, l) => s + l._counts.total, 0);

  return (
    <div className="space-y-0">
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4 pb-5">
        <div>
          <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2">
            <Warehouse className="h-5 w-5 text-muted-foreground shrink-0" />
            Inventory Locations
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Stockrooms, repair benches, and transit bays · {locations.length} locations · {totalAssets.toLocaleString()} assets
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground"
            onClick={() => setShowInactive(v => !v)}
          >
            <ToggleLeft className="h-3.5 w-3.5 mr-1.5" />
            {showInactive ? "Hide inactive" : "Show inactive"}
          </Button>
          <Button size="sm" className="h-8" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" />
            Add Location
          </Button>
        </div>
      </div>

      {error && <ErrorAlert error={error} fallback="Failed to load locations" />}

      {/* ── Location grid ── */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-36 rounded-lg" />
          ))}
        </div>
      ) : locations.length === 0 ? (
        <div className="flex flex-col items-center gap-4 py-20 text-center">
          <Warehouse className="h-12 w-12 text-muted-foreground/20" />
          <p className="text-sm font-medium text-muted-foreground">No inventory locations yet</p>
          <p className="text-xs text-muted-foreground max-w-sm">
            Create stockrooms, repair facilities, and transit bays to track where your assets physically are.
          </p>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" />
            Add First Location
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {locations.map(loc => (
            <div
              key={loc.id}
              className={`rounded-lg border border-border/60 bg-card p-4 flex flex-col gap-3 transition-shadow hover:shadow-sm ${!loc.isActive ? "opacity-50" : ""}`}
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-semibold ${TYPE_COLORS[loc.locationType as InventoryLocationType]}`}>
                      {TYPE_ICON[loc.locationType as InventoryLocationType]}
                      {LOCATION_TYPE_LABEL[loc.locationType as InventoryLocationType]}
                    </span>
                    {!loc.isActive && (
                      <span className="text-[10px] text-muted-foreground bg-muted rounded px-1.5 py-0.5">Inactive</span>
                    )}
                  </div>
                  <p className="font-semibold text-sm mt-1 leading-tight">{loc.name}</p>
                  {loc.code && (
                    <p className="font-mono text-[11px] text-muted-foreground mt-0.5">{loc.code}</p>
                  )}
                  {(loc.site || loc.building || loc.room) && (
                    <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                      {[loc.site, loc.building, loc.room].filter(Boolean).join(" · ")}
                    </p>
                  )}
                </div>
                <div className="flex gap-1 shrink-0">
                  <button
                    onClick={() => setEditTarget(loc)}
                    className="h-6 w-6 rounded flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                    title="Edit"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                </div>
              </div>

              {/* Asset counts */}
              <div className="grid grid-cols-3 gap-0 border-t border-border/40 pt-3">
                <button
                  className="flex flex-col items-center gap-0.5 hover:bg-muted/30 rounded py-1 transition-colors"
                  onClick={() => navigate(`/assets?statuses=in_stock&inventoryLocationId=${loc.id}`)}
                  title="View in-stock assets"
                >
                  <span className="text-lg font-bold tabular-nums text-sky-600 dark:text-sky-400 leading-none">
                    {loc._counts.in_stock}
                  </span>
                  <span className="text-[9px] text-muted-foreground uppercase tracking-wide">In Stock</span>
                </button>
                <button
                  className="flex flex-col items-center gap-0.5 hover:bg-muted/30 rounded py-1 transition-colors"
                  onClick={() => navigate(`/assets?statuses=deployed,in_use&inventoryLocationId=${loc.id}`)}
                  title="View active assets"
                >
                  <span className="text-lg font-bold tabular-nums text-emerald-600 dark:text-emerald-400 leading-none">
                    {loc._counts.active}
                  </span>
                  <span className="text-[9px] text-muted-foreground uppercase tracking-wide">Active</span>
                </button>
                <button
                  className="flex flex-col items-center gap-0.5 hover:bg-muted/30 rounded py-1 transition-colors"
                  onClick={() => navigate(`/assets?statuses=under_maintenance,in_repair&inventoryLocationId=${loc.id}`)}
                  title="View assets under maintenance"
                >
                  <span className="text-lg font-bold tabular-nums text-amber-600 dark:text-amber-400 leading-none">
                    {loc._counts.under_maintenance}
                  </span>
                  <span className="text-[9px] text-muted-foreground uppercase tracking-wide">Repair</span>
                </button>
              </div>

              {/* View all link */}
              {loc._counts.total > 0 && (
                <button
                  className="text-[11px] text-primary hover:underline text-left mt-auto"
                  onClick={() => navigate(`/assets?inventoryLocationId=${loc.id}`)}
                >
                  View all {loc._counts.total} asset{loc._counts.total !== 1 ? "s" : ""} →
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Create dialog ── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              New Inventory Location
            </DialogTitle>
          </DialogHeader>
          <LocationForm
            onSubmit={d => createMut.mutate(d)}
            isPending={createMut.isPending}
            error={createMut.error}
            onCancel={() => setCreateOpen(false)}
            submitLabel="Create Location"
          />
        </DialogContent>
      </Dialog>

      {/* ── Edit dialog ── */}
      {editTarget && (
        <Dialog open onOpenChange={() => setEditTarget(null)}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Pencil className="h-4 w-4" />
                Edit — {editTarget.name}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <LocationForm
                defaultValues={editTarget}
                onSubmit={d => updateMut.mutate({ id: editTarget.id, ...d })}
                isPending={updateMut.isPending}
                error={updateMut.error}
                onCancel={() => setEditTarget(null)}
                submitLabel="Save Changes"
              />
              {editTarget.isActive && editTarget._counts.total === 0 && (
                <div className="border-t border-border/40 pt-4">
                  <Button
                    variant="ghost" size="sm"
                    className="text-muted-foreground hover:text-destructive text-xs"
                    onClick={() => { deactivateMut.mutate(editTarget.id); setEditTarget(null); }}
                    disabled={deactivateMut.isPending}
                  >
                    Deactivate this location
                  </Button>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
