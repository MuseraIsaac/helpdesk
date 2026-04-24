/**
 * DutyPlanTeamPage — Plans list for one team + create-plan dialog.
 * Route: /duty-plans/:teamId
 */

import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod/v4";
import axios from "axios";
import {
  CalendarDays, Plus, ArrowLeft, CheckCircle2, FileEdit,
  Archive, ChevronRight, Clock, MoreHorizontal, Loader2,
  Trash2, BookOpen, Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import ErrorAlert from "@/components/ErrorAlert";
import { useSession } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

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
  createdBy: { id: string; name: string };
  team: { id: number; name: string; color: string };
  _count: { assignments: number };
}

interface DutyPlanRole {
  id: number;
  teamId: number;
  roleType: "manager" | "mandated";
  user: { id: string; name: string };
}

interface Team {
  id: number;
  name: string;
  color: string;
  description: string | null;
  members: { id: string; name: string }[];
}

// ── Schema ────────────────────────────────────────────────────────────────────

const createPlanSchema = z.object({
  title:       z.string().min(1, "Title is required").max(200),
  periodStart: z.string().min(1, "Start date required"),
  periodEnd:   z.string().min(1, "End date required"),
  is24x7:      z.boolean(),
  notes:       z.string().max(2000).optional(),
});
type CreatePlanForm = z.infer<typeof createPlanSchema>;

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  draft:     { label: "Draft",     cls: "bg-muted text-muted-foreground" },
  published: { label: "Published", cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" },
  archived:  { label: "Archived",  cls: "bg-slate-500/10 text-slate-500" },
};

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

// ── New Plan Dialog ───────────────────────────────────────────────────────────

function NewPlanDialog({
  teamId,
  onClose,
}: {
  teamId: number;
  onClose: (newId?: number) => void;
}) {
  const qc = useQueryClient();
  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<CreatePlanForm>({
    resolver: zodResolver(createPlanSchema),
    defaultValues: { is24x7: false },
  });
  const is24x7 = watch("is24x7");

  const mutation = useMutation({
    mutationFn: (data: CreatePlanForm) =>
      axios.post<{ plan: DutyPlan }>("/api/duty-plans", {
        teamId,
        title: data.title,
        periodStart: new Date(data.periodStart).toISOString(),
        periodEnd:   new Date(data.periodEnd).toISOString(),
        is24x7: data.is24x7,
        notes: data.notes || undefined,
      }),
    onSuccess: ({ data }) => {
      qc.invalidateQueries({ queryKey: ["duty-plans"] });
      toast.success("Plan created");
      onClose(data.plan.id);
    },
    onError: (e: any) => toast.error(e?.response?.data?.error ?? "Failed to create plan"),
  });

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <CalendarDays className="size-4 text-primary" />
            New Duty Plan
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label className="text-xs">Title</Label>
            <Input
              {...register("title")}
              placeholder="e.g. May 2026 Schedule"
              className="h-9 text-sm"
            />
            {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Period start</Label>
              <Input {...register("periodStart")} type="date" className="h-9 text-sm" />
              {errors.periodStart && <p className="text-xs text-destructive">{errors.periodStart.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Period end</Label>
              <Input {...register("periodEnd")} type="date" className="h-9 text-sm" />
              {errors.periodEnd && <p className="text-xs text-destructive">{errors.periodEnd.message}</p>}
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border px-4 py-3">
            <div>
              <p className="text-sm font-medium">24/7 Coverage</p>
              <p className="text-xs text-muted-foreground">Team operates around the clock</p>
            </div>
            <Switch
              checked={is24x7}
              onCheckedChange={(v) => setValue("is24x7", v)}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Notes <span className="text-muted-foreground">(optional)</span></Label>
            <Textarea
              {...register("notes")}
              placeholder="Any additional context…"
              className="text-sm resize-none"
              rows={2}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onClose()} className="h-9 text-sm">
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending} className="h-9 text-sm gap-1.5">
              {mutation.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
              Create plan
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Plan Row ──────────────────────────────────────────────────────────────────

function PlanRow({
  plan,
  canManage,
  teamId,
}: {
  plan: DutyPlan;
  canManage: boolean;
  teamId: number;
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const cfg = STATUS_CONFIG[plan.status];

  const archiveMutation = useMutation({
    mutationFn: () => axios.post(`/api/duty-plans/${plan.id}/archive`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["duty-plans", teamId] }); toast.success("Archived"); },
    onError: (e: any) => toast.error(e?.response?.data?.error ?? "Failed"),
  });

  const deleteMutation = useMutation({
    mutationFn: () => axios.delete(`/api/duty-plans/${plan.id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["duty-plans", teamId] }); toast.success("Plan deleted"); },
    onError: (e: any) => toast.error(e?.response?.data?.error ?? "Failed"),
  });

  return (
    <div
      className="group flex items-center gap-4 rounded-xl border bg-background px-4 py-3.5 hover:shadow-sm transition-shadow cursor-pointer"
      onClick={() => navigate(`/duty-plans/${teamId}/${plan.id}`)}
    >
      {/* Color stripe */}
      <div className={cn(
        "w-1 self-stretch rounded-full shrink-0",
        plan.status === "published" ? "bg-emerald-500" :
        plan.status === "draft" ? "bg-amber-400" : "bg-slate-300"
      )} />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm truncate">{plan.title}</span>
          <Badge className={cn("text-[10px] px-1.5 h-4 border-0 shrink-0", cfg.cls)}>
            {cfg.label}
          </Badge>
          {plan.is24x7 && (
            <Badge variant="outline" className="text-[10px] px-1.5 h-4 shrink-0">24/7</Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          {fmt(plan.periodStart)} – {fmt(plan.periodEnd)}
          <span className="mx-1.5 text-muted-foreground/40">·</span>
          {plan._count.assignments} assignments
          <span className="mx-1.5 text-muted-foreground/40">·</span>
          by {plan.createdBy.name}
        </p>
      </div>

      <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={() => navigate(`/duty-plans/${teamId}/${plan.id}`)}
        >
          <Eye className="size-3" />
          Open
        </Button>

        {canManage && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-7 opacity-0 group-hover:opacity-100">
                <MoreHorizontal className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => navigate(`/duty-plans/${teamId}/${plan.id}`)}>
                <BookOpen className="size-3.5 mr-2" /> Open editor
              </DropdownMenuItem>
              {plan.status === "published" && (
                <DropdownMenuItem onClick={() => archiveMutation.mutate()}>
                  <Archive className="size-3.5 mr-2" /> Archive
                </DropdownMenuItem>
              )}
              {plan.status === "draft" && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => deleteMutation.mutate()}
                  >
                    <Trash2 className="size-3.5 mr-2" /> Delete draft
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DutyPlanTeamPage() {
  const { teamId: teamIdParam } = useParams<{ teamId: string }>();
  const teamId = Number(teamIdParam);
  const navigate = useNavigate();
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "admin" || session?.user?.role === "supervisor";
  const [showNew, setShowNew] = useState(false);

  const teamQuery = useQuery({
    queryKey: ["team", teamId],
    queryFn: async () => {
      const { data } = await axios.get<{ team: Team }>(`/api/teams/${teamId}`);
      return data;
    },
    enabled: !!teamId,
  });

  const plansQuery = useQuery({
    queryKey: ["duty-plans", teamId],
    queryFn: async () => {
      const { data } = await axios.get<{ plans: DutyPlan[] }>(`/api/duty-plans?teamId=${teamId}`);
      return data;
    },
    enabled: !!teamId,
  });

  const rolesQuery = useQuery({
    queryKey: ["duty-plan-roles", teamId],
    queryFn: async () => {
      const { data } = await axios.get<{ roles: DutyPlanRole[] }>(`/api/duty-plans/roles?teamId=${teamId}`);
      return data;
    },
    enabled: !!teamId,
  });

  const team  = teamQuery.data?.team;
  const plans = plansQuery.data?.plans ?? [];
  const roles = rolesQuery.data?.roles ?? [];

  const myRole = roles.find((r) => r.user.id === session?.user?.id)?.roleType;
  const canManage = isAdmin || myRole === "manager" || myRole === "mandated";

  const published = plans.filter((p) => p.status === "published");
  const drafts    = plans.filter((p) => p.status === "draft");
  const archived  = plans.filter((p) => p.status === "archived");

  const hasDraft = drafts.length > 0;

  return (
    <div className="flex flex-col min-h-screen bg-muted/10">
      {showNew && (
        <NewPlanDialog
          teamId={teamId}
          onClose={(newId) => {
            setShowNew(false);
            if (newId) navigate(`/duty-plans/${teamId}/${newId}`);
          }}
        />
      )}

      {/* Top bar */}
      <div className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur-sm">
        <div className="flex items-center gap-3 h-12 px-6 max-w-screen-xl mx-auto">
          <Button variant="ghost" size="icon" className="size-7 -ml-1" asChild>
            <Link to="/duty-plans"><ArrowLeft className="size-4" /></Link>
          </Button>
          {team && (
            <>
              <div className="size-5 rounded flex-shrink-0" style={{ backgroundColor: team.color }} />
              <h1 className="text-sm font-semibold">{team.name}</h1>
            </>
          )}
          <div className="ml-auto flex items-center gap-2">
            {canManage && !hasDraft && (
              <Button size="sm" className="h-8 text-xs gap-1.5" onClick={() => setShowNew(true)}>
                <Plus className="size-3.5" />
                New plan
              </Button>
            )}
            {canManage && hasDraft && (
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs gap-1.5"
                onClick={() => navigate(`/duty-plans/${teamId}/${drafts[0].id}`)}
              >
                <FileEdit className="size-3.5" />
                Continue draft
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-screen-xl mx-auto w-full px-6 py-8 space-y-8">
        {plansQuery.error && <ErrorAlert error={plansQuery.error} fallback="Failed to load plans" />}

        {plansQuery.isLoading ? (
          <div className="space-y-2">{[1,2,3].map((i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
        ) : plans.length === 0 ? (
          <div className="flex flex-col items-center py-20 text-center">
            <CalendarDays className="size-12 text-muted-foreground/20 mb-4" />
            <p className="font-medium text-sm">No duty plans yet</p>
            <p className="text-xs text-muted-foreground mt-1 mb-5">
              Create the first duty plan for this team.
            </p>
            {canManage && (
              <Button size="sm" className="gap-1.5" onClick={() => setShowNew(true)}>
                <Plus className="size-3.5" />
                Create plan
              </Button>
            )}
          </div>
        ) : (
          <>
            {published.length > 0 && (
              <section className="space-y-3">
                <h2 className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  <CheckCircle2 className="size-3.5 text-emerald-500" />
                  Active plans
                </h2>
                {published.map((p) => <PlanRow key={p.id} plan={p} canManage={canManage} teamId={teamId} />)}
              </section>
            )}

            {drafts.length > 0 && (
              <section className="space-y-3">
                <h2 className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  <FileEdit className="size-3.5 text-amber-500" />
                  Drafts
                </h2>
                {drafts.map((p) => <PlanRow key={p.id} plan={p} canManage={canManage} teamId={teamId} />)}
              </section>
            )}

            {archived.length > 0 && (
              <section className="space-y-3">
                <h2 className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  <Archive className="size-3.5 text-slate-400" />
                  Archived
                </h2>
                {archived.map((p) => <PlanRow key={p.id} plan={p} canManage={canManage} teamId={teamId} />)}
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
