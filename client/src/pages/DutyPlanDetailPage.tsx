/**
 * DutyPlanDetailPage — Full plan editor: shift definitions + assignment grid.
 * Route: /duty-plans/:teamId/:planId
 */

import { useState, useMemo, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod/v4";
import axios from "axios";
import {
  ArrowLeft, Plus, Pencil, Trash2, Loader2, CheckCircle2,
  Archive, Send, Clock, Star, StarOff, X, ChevronLeft,
  ChevronRight, CalendarDays, Users, AlertCircle, Palette,
  GripVertical, UserPlus, Sun, Moon, Sunset, Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import ErrorAlert from "@/components/ErrorAlert";
import { useSession } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

interface DutyShift {
  id: number;
  planId: number;
  name: string;
  startTime: string;
  endTime: string;
  color: string;
  order: number;
}

interface DutyAssignment {
  id: number;
  planId: number;
  shiftId: number;
  agentId: string;
  date: string;
  isShiftLeader: boolean;
  notes: string | null;
  agent: { id: string; name: string };
  shift: { id: number; name: string; color: string };
}

interface DutyPlan {
  id: number;
  teamId: number;
  title: string;
  periodStart: string;
  periodEnd: string;
  is24x7: boolean;
  status: "draft" | "published" | "archived";
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: { id: string; name: string };
  team: { id: number; name: string; color: string };
  shifts: DutyShift[];
  assignments: DutyAssignment[];
}

interface DutyPlanRole {
  id: number;
  teamId: number;
  roleType: "manager" | "mandated";
  user: { id: string; name: string };
}

interface TeamMember {
  id: string;
  name: string;
  email: string;
}

// ── Schemas ───────────────────────────────────────────────────────────────────

const shiftSchema = z.object({
  name:      z.string().min(1, "Name required").max(100),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, "HH:MM required"),
  endTime:   z.string().regex(/^\d{2}:\d{2}$/, "HH:MM required"),
  color:     z.string().min(1),
  order:     z.number().int().min(0),
});
type ShiftForm = z.infer<typeof shiftSchema>;

// ── Preset colors ─────────────────────────────────────────────────────────────

const SHIFT_COLORS = [
  "#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6",
  "#EC4899", "#06B6D4", "#84CC16", "#F97316", "#6366F1",
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function startOfWeek(d: Date): Date {
  const r = new Date(d);
  const day = r.getDay(); // 0=Sun
  r.setDate(r.getDate() - day);
  r.setHours(0, 0, 0, 0);
  return r;
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

const STATUS_CFG = {
  draft:     { label: "Draft",     cls: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-300/40" },
  published: { label: "Published", cls: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-300/40" },
  archived:  { label: "Archived",  cls: "bg-slate-500/10 text-slate-500 border-slate-300/30" },
};

function shiftIcon(startTime: string) {
  const h = parseInt(startTime.split(":")[0], 10);
  if (h >= 5 && h < 12)  return <Sun className="size-3 text-amber-400" />;
  if (h >= 12 && h < 18) return <Sunset className="size-3 text-orange-400" />;
  return <Moon className="size-3 text-indigo-400" />;
}

// ── Shift Editor Dialog ───────────────────────────────────────────────────────

function ShiftDialog({
  planId,
  existing,
  nextOrder,
  onClose,
}: {
  planId: number;
  existing?: DutyShift;
  nextOrder: number;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<ShiftForm>({
    resolver: zodResolver(shiftSchema),
    defaultValues: {
      name:      existing?.name      ?? "",
      startTime: existing?.startTime ?? "08:00",
      endTime:   existing?.endTime   ?? "16:00",
      color:     existing?.color     ?? SHIFT_COLORS[0],
      order:     existing?.order     ?? nextOrder,
    },
  });
  const color = watch("color");

  const mutation = useMutation({
    mutationFn: (data: ShiftForm) =>
      existing
        ? axios.patch(`/api/duty-plans/${planId}/shifts/${existing.id}`, data)
        : axios.post(`/api/duty-plans/${planId}/shifts`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["duty-plan", planId] });
      toast.success(existing ? "Shift updated" : "Shift added");
      onClose();
    },
    onError: (e: any) => toast.error(e?.response?.data?.error ?? "Failed"),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2">
            <Clock className="size-4 text-primary" />
            {existing ? "Edit shift" : "Add shift"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label className="text-xs">Shift name</Label>
            <Input {...register("name")} placeholder="e.g. Morning, Night…" className="h-9 text-sm" />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Start time</Label>
              <Input {...register("startTime")} type="time" className="h-9 text-sm" />
              {errors.startTime && <p className="text-xs text-destructive">{errors.startTime.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">End time</Label>
              <Input {...register("endTime")} type="time" className="h-9 text-sm" />
              {errors.endTime && <p className="text-xs text-destructive">{errors.endTime.message}</p>}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Color</Label>
            <div className="flex flex-wrap gap-2">
              {SHIFT_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className="size-7 rounded-full ring-offset-background transition-all hover:scale-110"
                  style={{ backgroundColor: c, outline: color === c ? `2px solid ${c}` : "none", outlineOffset: 2 }}
                  onClick={() => setValue("color", c)}
                >
                  {color === c && <Check className="size-3 text-white mx-auto" />}
                </button>
              ))}
              <input
                type="color"
                value={color}
                onChange={(e) => setValue("color", e.target.value)}
                className="size-7 rounded-full cursor-pointer border-0 p-0 bg-transparent"
                title="Custom color"
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} className="h-9 text-sm">Cancel</Button>
            <Button type="submit" disabled={mutation.isPending} className="h-9 text-sm gap-1.5">
              {mutation.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
              {existing ? "Save changes" : "Add shift"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Assignment Cell ───────────────────────────────────────────────────────────

function AssignmentCell({
  planId,
  shift,
  date,
  assignments,
  members,
  canEdit,
}: {
  planId: number;
  shift: DutyShift;
  date: Date;
  assignments: DutyAssignment[];
  members: TeamMember[];
  canEdit: boolean;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const dateStr = isoDate(date);
  const assignedIds = new Set(assignments.map((a) => a.agentId));

  const addMutation = useMutation({
    mutationFn: (agentId: string) =>
      axios.put(`/api/duty-plans/${planId}/assignments`, {
        shiftId: shift.id,
        agentId,
        date: new Date(dateStr).toISOString(),
        isShiftLeader: false,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["duty-plan", planId] });
      setOpen(false);
      setSearch("");
    },
    onError: (e: any) => toast.error(e?.response?.data?.error ?? "Failed to assign"),
  });

  const removeMutation = useMutation({
    mutationFn: (id: number) => axios.delete(`/api/duty-plans/${planId}/assignments/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["duty-plan", planId] }),
    onError: (e: any) => toast.error(e?.response?.data?.error ?? "Failed"),
  });

  const leaderMutation = useMutation({
    mutationFn: ({ agentId, isShiftLeader }: { agentId: string; isShiftLeader: boolean }) =>
      axios.put(`/api/duty-plans/${planId}/assignments`, {
        shiftId: shift.id,
        agentId,
        date: new Date(dateStr).toISOString(),
        isShiftLeader,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["duty-plan", planId] }),
    onError: (e: any) => toast.error(e?.response?.data?.error ?? "Failed"),
  });

  const available = members.filter(
    (m) => !assignedIds.has(m.id) && m.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <TooltipProvider>
      <div className="min-h-[60px] p-1.5 flex flex-col gap-1">
        {assignments.map((a) => (
          <div
            key={a.id}
            className="group/chip flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-white"
            style={{ backgroundColor: shift.color }}
          >
            {a.isShiftLeader && <Star className="size-2.5 fill-current shrink-0" />}
            <span className="truncate flex-1 min-w-0">{a.agent.name}</span>
            {canEdit && (
              <div className="flex items-center gap-0.5 opacity-0 group-hover/chip:opacity-100 transition-opacity">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      className="rounded hover:bg-black/20 p-0.5"
                      onClick={() => leaderMutation.mutate({ agentId: a.agentId, isShiftLeader: !a.isShiftLeader })}
                    >
                      {a.isShiftLeader
                        ? <StarOff className="size-2.5" />
                        : <Star className="size-2.5" />}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">
                    {a.isShiftLeader ? "Remove leader" : "Set shift leader"}
                  </TooltipContent>
                </Tooltip>
                <button
                  className="rounded hover:bg-black/20 p-0.5"
                  onClick={() => removeMutation.mutate(a.id)}
                >
                  <X className="size-2.5" />
                </button>
              </div>
            )}
          </div>
        ))}

        {canEdit && (
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <button
                className={cn(
                  "flex items-center gap-1 rounded-md border border-dashed px-2 py-1 text-[10px] text-muted-foreground",
                  "hover:border-primary/40 hover:text-primary transition-colors",
                  assignments.length === 0 ? "opacity-100" : "opacity-0 group-hover/cell:opacity-100"
                )}
              >
                <UserPlus className="size-2.5" />
                <span>Add</span>
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-52 p-2" side="bottom" align="start">
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search agent…"
                className="h-7 text-xs mb-2"
              />
              <div className="max-h-40 overflow-y-auto space-y-0.5">
                {available.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-3">
                    {assignedIds.size === members.length ? "All agents assigned" : "No results"}
                  </p>
                ) : (
                  available.map((m) => (
                    <button
                      key={m.id}
                      className="w-full text-left rounded px-2 py-1.5 text-xs hover:bg-muted transition-colors flex items-center gap-2"
                      onClick={() => addMutation.mutate(m.id)}
                      disabled={addMutation.isPending}
                    >
                      <div
                        className="size-5 rounded-full flex items-center justify-center text-[9px] text-white font-bold shrink-0"
                        style={{ backgroundColor: shift.color }}
                      >
                        {m.name.slice(0, 1).toUpperCase()}
                      </div>
                      <span className="truncate">{m.name}</span>
                    </button>
                  ))
                )}
              </div>
            </PopoverContent>
          </Popover>
        )}
      </div>
    </TooltipProvider>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DutyPlanDetailPage() {
  const { teamId: teamIdParam, planId: planIdParam } = useParams<{ teamId: string; planId: string }>();
  const planId  = Number(planIdParam);
  const teamId  = Number(teamIdParam);
  const navigate = useNavigate();
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "admin" || session?.user?.role === "supervisor";
  const qc = useQueryClient();

  const [shiftDialog, setShiftDialog] = useState<{ open: boolean; shift?: DutyShift }>({ open: false });
  const [weekOffset, setWeekOffset] = useState(0);
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);

  // ── Data fetching ──────────────────────────────────────────────────────────

  const planQuery = useQuery({
    queryKey: ["duty-plan", planId],
    queryFn: async () => {
      const { data } = await axios.get<{ plan: DutyPlan }>(`/api/duty-plans/${planId}`);
      return data;
    },
    enabled: !!planId,
  });

  const rolesQuery = useQuery({
    queryKey: ["duty-plan-roles", teamId],
    queryFn: async () => {
      const { data } = await axios.get<{ roles: DutyPlanRole[] }>(`/api/duty-plans/roles?teamId=${teamId}`);
      return data;
    },
    enabled: !!teamId,
  });

  const membersQuery = useQuery({
    queryKey: ["team-members", teamId],
    queryFn: async () => {
      const { data } = await axios.get<{ members: TeamMember[] }>(`/api/teams/${teamId}/members`);
      return data;
    },
    enabled: !!teamId,
  });

  const plan    = planQuery.data?.plan;
  const roles   = rolesQuery.data?.roles ?? [];
  const members = membersQuery.data?.members ?? [];

  const myRole = roles.find((r) => r.user.id === session?.user?.id)?.roleType;
  const canEdit = (isAdmin || myRole === "manager" || myRole === "mandated") && plan?.status !== "archived";

  // ── Assignment index ───────────────────────────────────────────────────────

  const assignmentMap = useMemo(() => {
    const m = new Map<string, DutyAssignment[]>();
    for (const a of plan?.assignments ?? []) {
      const key = `${a.shiftId}-${a.date.slice(0, 10)}`;
      m.set(key, [...(m.get(key) ?? []), a]);
    }
    return m;
  }, [plan?.assignments]);

  // ── Week navigation ────────────────────────────────────────────────────────

  const weekDates = useMemo(() => {
    if (!plan) return [];
    const periodStart = new Date(plan.periodStart);
    periodStart.setHours(0, 0, 0, 0);
    const ws = startOfWeek(periodStart);
    const shifted = addDays(ws, weekOffset * 7);
    return Array.from({ length: 7 }, (_, i) => addDays(shifted, i));
  }, [plan, weekOffset]);

  const periodEnd   = plan ? new Date(plan.periodEnd) : null;
  const periodStart = plan ? new Date(plan.periodStart) : null;

  const canGoPrev = useMemo(() => {
    if (!weekDates.length || !periodStart) return false;
    return weekDates[0] > periodStart;
  }, [weekDates, periodStart]);

  const canGoNext = useMemo(() => {
    if (!weekDates.length || !periodEnd) return false;
    return weekDates[weekDates.length - 1] < periodEnd;
  }, [weekDates, periodEnd]);

  // ── Mutations ──────────────────────────────────────────────────────────────

  const publishMutation = useMutation({
    mutationFn: () => axios.post(`/api/duty-plans/${planId}/publish`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["duty-plan", planId] }); toast.success("Plan published"); setConfirmPublish(false); },
    onError: (e: any) => toast.error(e?.response?.data?.error ?? "Failed"),
  });

  const archiveMutation = useMutation({
    mutationFn: () => axios.post(`/api/duty-plans/${planId}/archive`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["duty-plan", planId] });
      qc.invalidateQueries({ queryKey: ["duty-plans", teamId] });
      toast.success("Plan archived");
      setConfirmArchive(false);
    },
    onError: (e: any) => toast.error(e?.response?.data?.error ?? "Failed"),
  });

  const deleteShiftMutation = useMutation({
    mutationFn: (shiftId: number) => axios.delete(`/api/duty-plans/${planId}/shifts/${shiftId}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["duty-plan", planId] }); toast.success("Shift removed"); },
    onError: (e: any) => toast.error(e?.response?.data?.error ?? "Failed"),
  });

  // ── Week header label ──────────────────────────────────────────────────────

  const weekLabel = useMemo(() => {
    if (!weekDates.length) return "";
    const first = weekDates[0];
    const last  = weekDates[6];
    if (first.getMonth() === last.getMonth()) {
      return `${MONTH_NAMES[first.getMonth()]} ${first.getDate()} – ${last.getDate()}, ${first.getFullYear()}`;
    }
    return `${MONTH_NAMES[first.getMonth()]} ${first.getDate()} – ${MONTH_NAMES[last.getMonth()]} ${last.getDate()}, ${last.getFullYear()}`;
  }, [weekDates]);

  // ── Loading / Error ────────────────────────────────────────────────────────

  if (planQuery.isLoading) {
    return (
      <div className="p-8 max-w-screen-xl mx-auto space-y-4">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }

  if (planQuery.error || !plan) {
    return (
      <div className="p-8 max-w-screen-xl mx-auto">
        <ErrorAlert error={planQuery.error} fallback="Failed to load duty plan" />
      </div>
    );
  }

  const statusCfg = STATUS_CFG[plan.status];
  const today = isoDate(new Date());

  return (
    <div className="flex flex-col min-h-screen bg-muted/10">
      {/* Confirm dialogs */}
      <AlertDialog open={confirmPublish} onOpenChange={setConfirmPublish}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Publish this plan?</AlertDialogTitle>
            <AlertDialogDescription>
              The plan will become visible to all team members. You can still edit assignments after publishing.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => publishMutation.mutate()} disabled={publishMutation.isPending}>
              {publishMutation.isPending ? <Loader2 className="size-3.5 animate-spin mr-1.5" /> : null}
              Publish
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmArchive} onOpenChange={setConfirmArchive}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive this plan?</AlertDialogTitle>
            <AlertDialogDescription>
              Archiving will make this plan read-only. It will still be accessible for reference.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => archiveMutation.mutate()} disabled={archiveMutation.isPending}>
              Archive
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {shiftDialog.open && (
        <ShiftDialog
          planId={planId}
          existing={shiftDialog.shift}
          nextOrder={plan.shifts.length}
          onClose={() => setShiftDialog({ open: false })}
        />
      )}

      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur-sm">
        <div className="flex items-center gap-3 h-14 px-6 max-w-screen-xl mx-auto">
          <Button variant="ghost" size="icon" className="size-7 -ml-1 shrink-0" asChild>
            <Link to={`/duty-plans/${teamId}`}><ArrowLeft className="size-4" /></Link>
          </Button>

          <div className="size-4 rounded shrink-0" style={{ backgroundColor: plan.team.color }} />

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="font-semibold text-sm truncate">{plan.title}</h1>
              <Badge className={cn("text-[10px] px-1.5 h-4 border shrink-0", statusCfg.cls)}>
                {statusCfg.label}
              </Badge>
              {plan.is24x7 && (
                <Badge variant="outline" className="text-[10px] px-1.5 h-4 shrink-0">24/7</Badge>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground leading-none mt-0.5">
              {plan.team.name} · {fmt(plan.periodStart)} – {fmt(plan.periodEnd)}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {canEdit && plan.status === "draft" && (
              <Button
                size="sm"
                className="h-8 text-xs gap-1.5"
                disabled={plan.shifts.length === 0}
                onClick={() => setConfirmPublish(true)}
              >
                <Send className="size-3.5" />
                Publish
              </Button>
            )}
            {canEdit && plan.status === "published" && (
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs gap-1.5"
                onClick={() => setConfirmArchive(true)}
              >
                <Archive className="size-3.5" />
                Archive
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* ── Main layout ───────────────────────────────────────────────────── */}
      <div className="max-w-screen-xl mx-auto w-full px-6 py-6 flex gap-6 items-start">

        {/* ── Left: Shift panel ─────────────────────────────────────────── */}
        <aside className="w-64 shrink-0 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
              <Clock className="size-3.5" />
              Shifts
            </h2>
            {canEdit && (
              <Button
                size="sm"
                variant="ghost"
                className="h-6 text-xs gap-1 px-2"
                onClick={() => setShiftDialog({ open: true })}
              >
                <Plus className="size-3" /> Add
              </Button>
            )}
          </div>

          {plan.shifts.length === 0 ? (
            <div className="rounded-xl border border-dashed p-5 text-center">
              <Clock className="size-8 text-muted-foreground/20 mx-auto mb-2" />
              <p className="text-xs text-muted-foreground">No shifts defined</p>
              {canEdit && (
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-3 h-7 text-xs gap-1"
                  onClick={() => setShiftDialog({ open: true })}
                >
                  <Plus className="size-3" /> Add shift
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {plan.shifts.map((shift) => (
                <div
                  key={shift.id}
                  className="group flex items-center gap-2.5 rounded-lg border bg-background px-3 py-2.5"
                >
                  <div className="size-3 rounded-full shrink-0" style={{ backgroundColor: shift.color }} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      {shiftIcon(shift.startTime)}
                      <span className="text-xs font-medium truncate">{shift.name}</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {shift.startTime} – {shift.endTime}
                    </p>
                  </div>
                  {canEdit && (
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <button
                        className="rounded p-1 hover:bg-muted transition-colors"
                        onClick={() => setShiftDialog({ open: true, shift })}
                      >
                        <Pencil className="size-3 text-muted-foreground" />
                      </button>
                      <button
                        className="rounded p-1 hover:bg-destructive/10 transition-colors"
                        onClick={() => deleteShiftMutation.mutate(shift.id)}
                        disabled={deleteShiftMutation.isPending}
                      >
                        <Trash2 className="size-3 text-destructive/70" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Plan notes */}
          {plan.notes && (
            <div className="rounded-lg bg-muted/40 border px-3 py-2.5 mt-4">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Notes</p>
              <p className="text-xs text-foreground leading-relaxed">{plan.notes}</p>
            </div>
          )}

          {/* Legend */}
          {plan.shifts.length > 0 && (
            <div className="mt-4 rounded-lg border bg-background px-3 py-2.5 space-y-1.5">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Legend</p>
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <Star className="size-2.5 text-amber-400 fill-amber-400" />
                <span>Shift leader</span>
              </div>
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <div className="size-2.5 rounded-full bg-primary/50" />
                <span>Today highlighted</span>
              </div>
            </div>
          )}
        </aside>

        {/* ── Right: Assignment grid ─────────────────────────────────────── */}
        <div className="flex-1 min-w-0">
          {plan.shifts.length === 0 ? (
            <div className="rounded-xl border border-dashed flex flex-col items-center py-20 text-center">
              <CalendarDays className="size-12 text-muted-foreground/20 mb-4" />
              <p className="font-medium text-sm">Add shifts to start scheduling</p>
              <p className="text-xs text-muted-foreground mt-1">
                Define your shift windows on the left, then assign agents here.
              </p>
            </div>
          ) : (
            <div className="rounded-xl border bg-background overflow-hidden">
              {/* Week navigation */}
              <div className="flex items-center justify-between border-b px-4 py-2.5 bg-muted/20">
                <div className="flex items-center gap-2">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-7"
                    onClick={() => setWeekOffset((w) => w - 1)}
                    disabled={!canGoPrev}
                  >
                    <ChevronLeft className="size-4" />
                  </Button>
                  <span className="text-xs font-medium tabular-nums min-w-44 text-center">{weekLabel}</span>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-7"
                    onClick={() => setWeekOffset((w) => w + 1)}
                    disabled={!canGoNext}
                  >
                    <ChevronRight className="size-4" />
                  </Button>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => setWeekOffset(0)}
                >
                  Today
                </Button>
              </div>

              {/* Grid */}
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      <th className="w-32 border-b border-r bg-muted/30 px-3 py-2 text-left">
                        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Shift</span>
                      </th>
                      {weekDates.map((d) => {
                        const ds = isoDate(d);
                        const inPeriod = periodStart && periodEnd
                          ? d >= new Date(new Date(plan.periodStart).toDateString()) && d <= new Date(new Date(plan.periodEnd).toDateString())
                          : true;
                        const isToday = ds === today;
                        return (
                          <th
                            key={ds}
                            className={cn(
                              "min-w-[100px] border-b border-r px-2 py-2 text-center",
                              isToday ? "bg-primary/8" : inPeriod ? "bg-muted/10" : "bg-muted/40 opacity-50"
                            )}
                          >
                            <p className={cn(
                              "text-[10px] font-semibold uppercase tracking-wide",
                              isToday ? "text-primary" : "text-muted-foreground"
                            )}>
                              {DAY_NAMES[d.getDay()]}
                            </p>
                            <p className={cn(
                              "text-sm font-bold leading-tight",
                              isToday ? "text-primary" : "text-foreground"
                            )}>
                              {d.getDate()}
                            </p>
                            {isToday && <div className="mx-auto mt-0.5 size-1 rounded-full bg-primary" />}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {plan.shifts.map((shift) => (
                      <tr key={shift.id} className="group/row">
                        {/* Shift label */}
                        <td className="border-b border-r bg-muted/20 px-3 py-2 align-top">
                          <div className="flex items-center gap-2">
                            <div className="w-0.5 rounded-full h-8 shrink-0" style={{ backgroundColor: shift.color }} />
                            <div>
                              <div className="flex items-center gap-1">
                                {shiftIcon(shift.startTime)}
                                <span className="text-xs font-medium">{shift.name}</span>
                              </div>
                              <p className="text-[10px] text-muted-foreground">{shift.startTime}–{shift.endTime}</p>
                            </div>
                          </div>
                        </td>

                        {/* Assignment cells */}
                        {weekDates.map((d) => {
                          const ds = isoDate(d);
                          const inPeriod = periodStart && periodEnd
                            ? d >= new Date(new Date(plan.periodStart).toDateString()) && d <= new Date(new Date(plan.periodEnd).toDateString())
                            : true;
                          const key = `${shift.id}-${ds}`;
                          const cellAssignments = assignmentMap.get(key) ?? [];
                          const isToday = ds === today;

                          return (
                            <td
                              key={ds}
                              className={cn(
                                "group/cell border-b border-r align-top",
                                isToday ? "bg-primary/5" : !inPeriod ? "bg-muted/30" : "bg-background"
                              )}
                            >
                              {inPeriod ? (
                                <AssignmentCell
                                  planId={planId}
                                  shift={shift}
                                  date={d}
                                  assignments={cellAssignments}
                                  members={members}
                                  canEdit={canEdit}
                                />
                              ) : (
                                <div className="min-h-[60px]" />
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Footer summary */}
              <div className="flex items-center justify-between border-t px-4 py-2 bg-muted/10">
                <p className="text-[11px] text-muted-foreground">
                  <span className="font-medium text-foreground">{plan.assignments.length}</span> total assignments ·{" "}
                  <span className="font-medium text-foreground">{plan.shifts.length}</span> shifts ·{" "}
                  <span className="font-medium text-foreground">{members.length}</span> team members
                </p>
                {plan.status === "draft" && canEdit && plan.shifts.length > 0 && (
                  <Button
                    size="sm"
                    className="h-7 text-xs gap-1.5"
                    onClick={() => setConfirmPublish(true)}
                  >
                    <Send className="size-3" />
                    Publish plan
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
