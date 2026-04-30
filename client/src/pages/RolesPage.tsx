/**
 * RolesPage — admin-only page for managing role definitions.
 *
 * Lists every role (built-in and custom) with member count and permission
 * count. Opens a Sheet sidebar editor for creating new roles, renaming
 * existing roles, and toggling individual permissions grouped by domain.
 *
 * Built-in role keys (admin / supervisor / agent / readonly) cannot be
 * deleted; their `key` is locked but their name, description, color, and
 * permission set are all editable. The system-only `customer` role is
 * hidden because it's gated by the portal middleware and not assignable.
 */

import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  createRoleSchema,
  updateRoleSchema,
  type CreateRoleInput,
  type UpdateRoleInput,
} from "core/schemas/roles.ts";
import type { Permission } from "core/constants/permission.ts";
import type {
  PermissionMeta,
  PermissionCategory,
} from "core/constants/permission-catalog.ts";
import BackLink from "@/components/BackLink";
import ErrorAlert from "@/components/ErrorAlert";
import ErrorMessage from "@/components/ErrorMessage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Plus,
  Pencil,
  Trash2,
  ShieldCheck,
  Shield,
  X,
  Lock,
  AlertTriangle,
  Search,
  Copy,
  RotateCcw,
  Sparkles,
  Users as UsersIcon,
  Eye,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

interface RoleSummary {
  key: string;
  name: string;
  description: string | null;
  color: string | null;
  isBuiltin: boolean;
  isSystem: boolean;
  permissions: Permission[];
  memberCount: number;
}

interface CatalogResponse {
  categories: { id: PermissionCategory; label: string; description: string }[];
  permissions: PermissionMeta[];
}

const COLOR_PRESETS = [
  "#ef4444", "#f59e0b", "#10b981", "#06b6d4",
  "#3b82f6", "#8b5cf6", "#ec4899", "#64748b",
];

// ── Permission catalog hook ──────────────────────────────────────────────────

function useCatalog() {
  return useQuery({
    queryKey: ["permissions-catalog"],
    queryFn: async () => {
      const { data } = await axios.get<CatalogResponse>("/api/roles/_catalog");
      return data;
    },
    staleTime: 60 * 60 * 1000,
  });
}

// ── Permission matrix component ──────────────────────────────────────────────

interface PermissionMatrixProps {
  catalog: CatalogResponse;
  selected: Set<Permission>;
  onToggle: (key: Permission, on: boolean) => void;
  onBulkSet: (keys: Permission[], on: boolean) => void;
  search: string;
  disabled?: boolean;
  /** Permissions that cannot be unchecked (e.g. users.manage on admin role). */
  locked?: Set<Permission>;
}

function PermissionMatrix({
  catalog,
  selected,
  onToggle,
  onBulkSet,
  search,
  disabled,
  locked,
}: PermissionMatrixProps) {
  const term = search.trim().toLowerCase();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  function toggleCollapse(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const groups = catalog.categories
    .map((cat) => {
      const perms = catalog.permissions
        .filter((p) => p.category === cat.id)
        .filter((p) => {
          if (!term) return true;
          return (
            p.label.toLowerCase().includes(term) ||
            p.description.toLowerCase().includes(term) ||
            p.key.toLowerCase().includes(term)
          );
        });
      return { ...cat, perms };
    })
    .filter((g) => g.perms.length > 0);

  return (
    <div className="space-y-2">
      {groups.map((g) => {
        const allKeys    = g.perms.map((p) => p.key);
        const onCount    = allKeys.filter((k) => selected.has(k)).length;
        const allOn      = onCount === allKeys.length && allKeys.length > 0;
        const someOn     = onCount > 0 && !allOn;
        const isOpen     = !collapsed.has(g.id);

        return (
          <div key={g.id} className="rounded-lg border bg-card overflow-hidden">
            {/* Group header */}
            <button
              type="button"
              onClick={() => toggleCollapse(g.id)}
              className="flex w-full items-center gap-2 px-3 py-2 bg-muted/40 hover:bg-muted/60 transition-colors"
            >
              {isOpen ? (
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              )}
              <div className="flex-1 min-w-0 text-left">
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-semibold">{g.label}</span>
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    {onCount} / {allKeys.length}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground truncate">{g.description}</p>
              </div>
              {!disabled && (
                <span className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    onClick={() => onBulkSet(allKeys, true)}
                    className="text-[10px] px-2 py-0.5 rounded border bg-background hover:bg-accent transition-colors"
                  >
                    All
                  </button>
                  <button
                    type="button"
                    onClick={() => onBulkSet(allKeys, false)}
                    className="text-[10px] px-2 py-0.5 rounded border bg-background hover:bg-accent transition-colors"
                  >
                    None
                  </button>
                </span>
              )}
            </button>

            {/* Group body */}
            {isOpen && (
              <div className="divide-y">
                {g.perms.map((p) => {
                  const isOn      = selected.has(p.key);
                  const isLocked  = locked?.has(p.key) ?? false;
                  return (
                    <div
                      key={p.key}
                      className={`flex items-start gap-3 px-3 py-2.5 transition-colors ${
                        isOn ? "bg-primary/5" : ""
                      }`}
                    >
                      <Switch
                        checked={isOn}
                        disabled={disabled || isLocked}
                        onCheckedChange={(v) => onToggle(p.key, v)}
                        className="mt-0.5 shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-sm font-medium">{p.label}</span>
                          {p.isDangerous && (
                            <span className="inline-flex items-center gap-0.5 text-[9px] uppercase tracking-wider rounded px-1 py-px bg-rose-500/10 text-rose-600 dark:text-rose-400">
                              <AlertTriangle className="h-2.5 w-2.5" />
                              Sensitive
                            </span>
                          )}
                          {p.isViewOnly && !p.isDangerous && (
                            <span className="text-[9px] uppercase tracking-wider rounded px-1 py-px bg-muted text-muted-foreground">
                              Read
                            </span>
                          )}
                          {isLocked && (
                            <span className="inline-flex items-center gap-0.5 text-[9px] uppercase tracking-wider rounded px-1 py-px bg-amber-500/10 text-amber-600 dark:text-amber-400">
                              <Lock className="h-2.5 w-2.5" />
                              Locked
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{p.description}</p>
                        <code className="text-[10px] text-muted-foreground/60 font-mono">{p.key}</code>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Role editor sheet ────────────────────────────────────────────────────────

interface RoleEditorProps {
  open: boolean;
  onClose: () => void;
  role: RoleSummary | null;
  duplicateFrom?: RoleSummary | null;
}

function RoleEditor({ open, onClose, role, duplicateFrom }: RoleEditorProps) {
  const queryClient = useQueryClient();
  const isEdit = !!role;
  const { data: catalog } = useCatalog();

  const [search, setSearch] = useState("");

  type FormShape = {
    key:         string;
    name:        string;
    description: string;
    color:       string;
    permissions: Permission[];
  };

  const defaults: FormShape = {
    key:         role?.key ?? "",
    name:        role?.name ?? duplicateFrom?.name ?? "",
    description: role?.description ?? duplicateFrom?.description ?? "",
    color:       role?.color ?? duplicateFrom?.color ?? "",
    permissions: role?.permissions ?? duplicateFrom?.permissions ?? [],
  };

  const {
    register,
    control,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormShape>({
    resolver: zodResolver(isEdit ? updateRoleSchema.extend({ key: createRoleSchema.shape.key }) : createRoleSchema),
    defaultValues: defaults,
  });

  // Reset whenever a different role is opened
  useEffect(() => {
    if (open) {
      reset(defaults);
      setSearch("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, role?.key, duplicateFrom?.key]);

  const watchedPerms = watch("permissions") ?? [];
  const watchedColor = watch("color");
  const watchedName  = watch("name");
  const selectedSet = useMemo(() => new Set<Permission>(watchedPerms), [watchedPerms]);

  // Lockout protection — admin role must keep users.manage
  const lockedPerms = useMemo<Set<Permission>>(() => {
    if (role?.key === "admin") return new Set<Permission>(["users.manage"]);
    return new Set<Permission>();
  }, [role?.key]);

  const mutation = useMutation({
    mutationFn: async (data: FormShape) => {
      if (isEdit) {
        const body: UpdateRoleInput = {
          name:        data.name,
          description: data.description || null,
          color:       data.color || null,
          permissions: data.permissions,
        };
        await axios.patch(`/api/roles/${role!.key}`, body);
      } else {
        const body: CreateRoleInput = {
          key:         data.key,
          name:        data.name,
          description: data.description || undefined,
          color:       data.color || undefined,
          permissions: data.permissions,
        };
        await axios.post("/api/roles", body);
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["roles"] });
      void queryClient.invalidateQueries({ queryKey: ["roles-assignable"] });
      void queryClient.invalidateQueries({ queryKey: ["dict", "roles", "assignable"] });
      onClose();
    },
  });

  function setPermissionsBulk(keys: Permission[], on: boolean) {
    const next = new Set<Permission>(watchedPerms);
    for (const k of keys) {
      if (on) next.add(k);
      else if (!lockedPerms.has(k)) next.delete(k);
    }
    setValue("permissions", Array.from(next), { shouldDirty: true });
  }

  function togglePermission(k: Permission, on: boolean) {
    if (lockedPerms.has(k) && !on) return;
    const next = new Set<Permission>(watchedPerms);
    if (on) next.add(k);
    else next.delete(k);
    setValue("permissions", Array.from(next), { shouldDirty: true });
  }

  // Preview counts
  const totalPerms = catalog?.permissions.length ?? 0;
  const onCount    = selectedSet.size;

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="w-full sm:max-w-2xl p-0 gap-0 flex flex-col"
      >
        <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="flex flex-col h-full">
          {/* Gradient header */}
          <SheetHeader className="relative p-0 gap-0 shrink-0">
            <div
              className="relative px-6 py-5 border-b overflow-hidden"
              style={{
                background: `linear-gradient(135deg, ${watchedColor || "#3b82f6"}15 0%, transparent 60%)`,
              }}
            >
              <div className="relative flex items-start gap-3">
                <div
                  className="h-10 w-10 rounded-xl shadow-sm border flex items-center justify-center shrink-0"
                  style={{
                    backgroundColor: watchedColor ? `${watchedColor}20` : "hsl(var(--primary) / 0.1)",
                    borderColor: watchedColor ? `${watchedColor}40` : undefined,
                  }}
                >
                  <ShieldCheck
                    className="h-5 w-5"
                    style={{ color: watchedColor || "hsl(var(--primary))" }}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <SheetTitle className="text-base font-semibold leading-tight">
                    {isEdit ? `Edit Role · ${role!.name}` : duplicateFrom ? `Duplicate Role · ${duplicateFrom.name}` : "New Role"}
                  </SheetTitle>
                  <SheetDescription className="text-xs mt-0.5">
                    {isEdit
                      ? "Rename this role, change its accent color, or adjust its permission set."
                      : "Define a new role and pick the permissions it grants."}
                  </SheetDescription>
                  {watchedName && (
                    <div className="mt-2 inline-flex items-center gap-1.5 rounded-full border bg-background/80 backdrop-blur px-2.5 py-0.5 text-[11px]">
                      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: watchedColor || "hsl(var(--primary))" }} />
                      <span className="font-medium truncate max-w-[200px]">{watchedName}</span>
                      <span className="text-muted-foreground">· {onCount} / {totalPerms} perms</span>
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          </SheetHeader>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
            {/* Identity */}
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-3.5 w-3.5 text-muted-foreground" />
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Identity</h3>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Display name</Label>
                  <Input {...register("name")} placeholder="e.g. Senior Agent" />
                  {errors.name && <ErrorMessage message={errors.name.message} />}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">
                    Key {isEdit && <span className="text-muted-foreground font-normal">· locked</span>}
                  </Label>
                  <Input
                    {...register("key")}
                    placeholder="e.g. senior_agent"
                    disabled={isEdit}
                    className="font-mono"
                  />
                  {errors.key && <ErrorMessage message={errors.key.message} />}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Description <span className="text-muted-foreground font-normal">· optional</span></Label>
                <Textarea
                  {...register("description")}
                  placeholder="What does this role do? Who should have it?"
                  className="min-h-[60px] text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Accent color</Label>
                <Controller
                  control={control}
                  name="color"
                  render={({ field }) => (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {COLOR_PRESETS.map((c) => {
                        const active = field.value?.toLowerCase() === c.toLowerCase();
                        return (
                          <button
                            key={c}
                            type="button"
                            onClick={() => field.onChange(c)}
                            className={`relative h-7 w-7 rounded-full transition-all ${
                              active ? "ring-2 ring-offset-2 ring-offset-background scale-110" : "hover:scale-110"
                            }`}
                            style={{ backgroundColor: c, ...(active ? { ["--tw-ring-color" as any]: c } : {}) }}
                          />
                        );
                      })}
                      <button
                        type="button"
                        onClick={() => field.onChange("")}
                        className={`h-7 w-7 rounded-full border-2 border-dashed flex items-center justify-center text-muted-foreground hover:text-foreground transition ${
                          !field.value ? "border-foreground/40" : "border-muted-foreground/30"
                        }`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                />
              </div>
            </section>

            <div className="border-t" />

            {/* Permissions */}
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground" />
                  <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Permissions</h3>
                  <Badge variant="secondary" className="text-[10px]">{onCount} / {totalPerms}</Badge>
                </div>
              </div>

              <div className="relative">
                <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search permissions…"
                  className="pl-8 h-9 text-sm"
                />
              </div>

              {role?.key === "admin" && (
                <div className="flex items-start gap-2 rounded-md bg-amber-500/5 border border-amber-500/20 p-2.5">
                  <Lock className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
                  <p className="text-[11px] text-muted-foreground">
                    The <strong>users.manage</strong> permission is locked on the admin role to prevent
                    locking yourself out of role and user administration.
                  </p>
                </div>
              )}

              {catalog ? (
                <PermissionMatrix
                  catalog={catalog}
                  selected={selectedSet}
                  onToggle={togglePermission}
                  onBulkSet={setPermissionsBulk}
                  search={search}
                  locked={lockedPerms}
                />
              ) : (
                <div className="text-sm text-muted-foreground">Loading permissions…</div>
              )}
            </section>

            {mutation.isError && (
              <ErrorAlert error={mutation.error} fallback="Failed to save role" />
            )}
          </div>

          {/* Footer */}
          <SheetFooter className="shrink-0 mt-0 px-6 py-3 border-t bg-muted/30 flex-row sm:justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={isSubmitting || mutation.isPending} className="gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {isEdit ? "Save Changes" : "Create Role"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function RolesPage() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<RoleSummary | null>(null);
  const [duplicating, setDuplicating] = useState<RoleSummary | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<RoleSummary | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["roles"],
    queryFn: async () => {
      const { data } = await axios.get<{ roles: RoleSummary[] }>("/api/roles");
      return data.roles;
    },
  });

  const { data: catalog } = useCatalog();
  const totalPerms = catalog?.permissions.length ?? 0;

  const resetMutation = useMutation({
    mutationFn: async (key: string) => {
      await axios.post(`/api/roles/${key}/reset`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["roles"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (key: string) => {
      await axios.delete(`/api/roles/${key}`);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["roles"] });
      setDeleting(null);
    },
  });

  // Hide system roles (customer) from the listing
  const visible = (data ?? []).filter((r) => !r.isSystem);

  const sheetOpen = creating || !!editing || !!duplicating;
  function closeSheet() {
    setCreating(false);
    setEditing(null);
    setDuplicating(null);
  }

  return (
    <div className="space-y-6">
      <BackLink to="/settings">Back to Settings</BackLink>

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-primary" />
            Roles & Permissions
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Define what each role can do across the platform. Built-in roles can be renamed and re-permissioned;
            you can also create custom roles for specialised teams (e.g. a Tier-2 escalation specialist or a CAB
            chair). Changes apply immediately and are written to the audit log.
          </p>
        </div>
        <Button size="sm" className="gap-1.5 shrink-0" onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" />
          New Role
        </Button>
      </div>

      {isLoading && (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className="h-20 rounded-lg border bg-muted/30 animate-pulse" />
          ))}
        </div>
      )}

      {error && <ErrorAlert error={error} fallback="Failed to load roles" />}

      {!isLoading && visible.length > 0 && (
        <div className="grid gap-3">
          {visible.map((role) => (
            <div
              key={role.key}
              className="relative rounded-xl border bg-card overflow-hidden transition-all hover:shadow-sm"
            >
              {/* Color bar */}
              <div
                className="absolute left-0 top-0 bottom-0 w-1"
                style={{ backgroundColor: role.color ?? "hsl(var(--muted-foreground))" }}
              />

              <div className="flex items-start gap-4 p-4 pl-5">
                {/* Icon */}
                <div
                  className="h-10 w-10 rounded-lg border flex items-center justify-center shrink-0"
                  style={{
                    backgroundColor: role.color ? `${role.color}15` : "hsl(var(--muted))",
                    borderColor: role.color ? `${role.color}40` : undefined,
                  }}
                >
                  {role.isBuiltin ? (
                    <ShieldCheck className="h-5 w-5" style={{ color: role.color ?? "hsl(var(--muted-foreground))" }} />
                  ) : (
                    <Shield className="h-5 w-5" style={{ color: role.color ?? "hsl(var(--muted-foreground))" }} />
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm">{role.name}</span>
                    <code className="text-[10px] text-muted-foreground/70 font-mono bg-muted px-1.5 py-0.5 rounded">
                      {role.key}
                    </code>
                    {role.isBuiltin && (
                      <span className="inline-flex items-center gap-0.5 text-[9px] uppercase tracking-wider rounded px-1 py-px bg-primary/10 text-primary">
                        <Lock className="h-2.5 w-2.5" />
                        Built-in
                      </span>
                    )}
                  </div>
                  {role.description && (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2 max-w-2xl">
                      {role.description}
                    </p>
                  )}
                  <div className="mt-2 flex items-center gap-3 text-[11px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <UsersIcon className="h-3 w-3" />
                      {role.memberCount} member{role.memberCount === 1 ? "" : "s"}
                    </span>
                    <span className="text-muted-foreground/40">·</span>
                    <span className="inline-flex items-center gap-1">
                      <ShieldCheck className="h-3 w-3" />
                      {role.permissions.length} / {totalPerms} permission{role.permissions.length === 1 ? "" : "s"}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => setEditing(role)}
                    className="inline-flex items-center gap-1 rounded-md border bg-background px-2 py-1 text-xs hover:bg-accent transition-colors"
                  >
                    <Pencil className="h-3 w-3" />
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => setDuplicating(role)}
                    className="inline-flex items-center gap-1 rounded-md border bg-background px-2 py-1 text-xs hover:bg-accent transition-colors"
                  >
                    <Copy className="h-3 w-3" />
                    Duplicate
                  </button>
                  {role.isBuiltin ? (
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm(`Reset "${role.name}" to its default permission set? Any custom changes will be lost.`)) {
                          resetMutation.mutate(role.key);
                        }
                      }}
                      disabled={resetMutation.isPending}
                      className="inline-flex items-center gap-1 rounded-md border bg-background px-2 py-1 text-xs hover:bg-accent transition-colors text-muted-foreground"
                      title="Reset to defaults"
                    >
                      <RotateCcw className="h-3 w-3" />
                      Reset
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setDeleting(role)}
                      className="inline-flex items-center gap-1 rounded-md border bg-background px-2 py-1 text-xs hover:bg-destructive/10 hover:text-destructive hover:border-destructive/40 transition-colors"
                    >
                      <Trash2 className="h-3 w-3" />
                      Delete
                    </button>
                  )}
                </div>
              </div>

              {/* Permission tag preview */}
              {role.permissions.length > 0 && (
                <div className="px-5 pb-3 -mt-1">
                  <details className="group">
                    <summary className="text-[11px] text-muted-foreground hover:text-foreground cursor-pointer inline-flex items-center gap-1">
                      <Eye className="h-3 w-3" />
                      <span className="group-open:hidden">View permissions</span>
                      <span className="hidden group-open:inline">Hide permissions</span>
                    </summary>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {role.permissions.map((p) => (
                        <code
                          key={p}
                          className="text-[10px] font-mono bg-muted text-muted-foreground rounded px-1.5 py-0.5"
                        >
                          {p}
                        </code>
                      ))}
                    </div>
                  </details>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Editor sheet */}
      <RoleEditor
        open={sheetOpen}
        onClose={closeSheet}
        role={editing}
        duplicateFrom={duplicating}
      />

      {/* Delete confirmation */}
      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete role?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{deleting?.name}</strong> will be permanently deleted. This cannot be undone.
              Any users currently assigned to this role must be reassigned first.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => deleting && deleteMutation.mutate(deleting.key)}
              disabled={deleteMutation.isPending}
            >
              Delete role
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
