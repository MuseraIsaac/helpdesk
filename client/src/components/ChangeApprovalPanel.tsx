/**
 * ChangeApprovalPanel — shows the current CAB approval status for a change
 * and lets authorised users request or cancel approval.
 *
 * When a default CAB group is configured in Change Settings, the approver
 * picker is restricted to members of that group. If no group is set, all
 * agents are shown with a warning.
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import ErrorAlert from "@/components/ErrorAlert";
import {
  CheckCircle2,
  XCircle,
  Clock,
  Ban,
  ShieldCheck,
  AlertCircle,
  Plus,
  X,
  Users,
  RefreshCw,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface CabMember {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface CabGroup {
  id: number;
  name: string;
  description: string | null;
  isActive: boolean;
  memberCount: number;
  members: CabMember[];
}

interface ApprovalDecision {
  id: number;
  decision: "approved" | "rejected";
  comment: string | null;
  decidedAt: string;
  decidedBy: { id: string; name: string };
}

interface ApprovalStep {
  id: number;
  stepOrder: number;
  status: "pending" | "approved" | "rejected" | "skipped";
  isActive: boolean;
  dueAt: string | null;
  approver: { id: string; name: string; email: string };
  decisions: ApprovalDecision[];
}

interface ChangeApproval {
  id: number;
  status: "pending" | "approved" | "rejected" | "cancelled" | "expired";
  approvalMode: string;
  requiredCount: number;
  expiresAt: string | null;
  resolvedAt: string | null;
  createdAt: string;
  requestedBy: { id: string; name: string } | null;
  steps: ApprovalStep[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_STYLE: Record<ChangeApproval["status"], string> = {
  pending:   "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  approved:  "bg-green-500/15 text-green-700 dark:text-green-400",
  rejected:  "bg-destructive/15 text-destructive",
  cancelled: "bg-muted text-muted-foreground",
  expired:   "bg-muted text-muted-foreground",
};

const STATUS_LABEL: Record<ChangeApproval["status"], string> = {
  pending:   "Pending",
  approved:  "Approved",
  rejected:  "Rejected",
  cancelled: "Cancelled",
  expired:   "Expired",
};

function StepStatusIcon({ status }: { status: ApprovalStep["status"] }) {
  switch (status) {
    case "approved": return <CheckCircle2 className="h-3.5 w-3.5 text-green-600 shrink-0" />;
    case "rejected": return <XCircle      className="h-3.5 w-3.5 text-destructive shrink-0" />;
    case "skipped":  return <Ban          className="h-3.5 w-3.5 text-muted-foreground shrink-0" />;
    default:         return <Clock        className="h-3.5 w-3.5 text-muted-foreground shrink-0" />;
  }
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

// ── Request-approval dialog ───────────────────────────────────────────────────

interface RequestApprovalDialogProps {
  open: boolean;
  onClose: () => void;
  changeId: number;
  onSuccess: () => void;
}

function RequestApprovalDialog({ open, onClose, changeId, onSuccess }: RequestApprovalDialogProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const { data: limitsData } = useQuery({
    queryKey: ["change-resend-counts", changeId],
    queryFn: async () => {
      const { data } = await axios.get<{
        counts: Record<string, number>;
        maxApprovalResends: number;
        minCabApprovers: number;
        cabApprovalSequential: boolean;
      }>(`/api/changes/${changeId}/resend-counts`);
      return data;
    },
    enabled: open,
  });
  const minCabApprovers      = limitsData?.minCabApprovers ?? 1;
  const cabApprovalSequential = limitsData?.cabApprovalSequential ?? false;

  // Load the default CAB group (restricts who can be selected as approver)
  const { data: cabData, isLoading: cabLoading } = useQuery({
    queryKey: ["cab-group-default"],
    queryFn: async () => {
      const { data } = await axios.get<{ group: CabGroup | null }>("/api/cab-groups/default");
      return data.group;
    },
    enabled: open,
  });

  // Fallback: load all agents when no CAB group is configured
  const { data: agentsData } = useQuery({
    queryKey: ["agents-list"],
    queryFn: async () => {
      const { data } = await axios.get<{ agents: CabMember[] }>("/api/agents");
      return data.agents;
    },
    enabled: open && cabData === null,
  });

  const cabGroup  = cabData ?? null;
  const pool: CabMember[] = cabGroup
    ? cabGroup.members
    : (agentsData ?? []);

  const unselected = pool.filter((m) => !selectedIds.includes(m.id));

  const mutation = useMutation({
    mutationFn: async () => {
      await axios.post(`/api/changes/${changeId}/request-approval`, {
        approverIds: selectedIds,
      });
    },
    onSuccess: () => {
      onSuccess();
      onClose();
      setSelectedIds([]);
      setMode("all");
      setSubmitError(null);
    },
    onError: (err: unknown) => {
      if (axios.isAxiosError(err)) {
        setSubmitError(err.response?.data?.error ?? "Failed to request approval");
      }
    },
  });

  function selectAll() {
    setSelectedIds(pool.map((m) => m.id));
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { onClose(); setSubmitError(null); } }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-muted-foreground" />
            Request CAB Approval
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* CAB group context */}
          {cabLoading ? (
            <Skeleton className="h-8 w-full" />
          ) : cabGroup ? (
            <div className="flex items-center gap-2 rounded-md bg-primary/5 border border-primary/20 px-3 py-2 text-xs">
              <Users className="h-3.5 w-3.5 text-primary shrink-0" />
              <span>
                Approvers restricted to <span className="font-semibold">{cabGroup.name}</span>{" "}
                ({cabGroup.memberCount} member{cabGroup.memberCount !== 1 ? "s" : ""})
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-md bg-amber-500/10 border border-amber-500/20 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              No default CAB group configured. Any agent can be selected.
              <span className="ml-auto text-[10px] opacity-70">Configure in Settings → Changes</span>
            </div>
          )}

          {/* Approver picker */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Approvers</Label>
              {unselected.length > 0 && (
                <button
                  type="button"
                  onClick={selectAll}
                  className="text-[11px] text-primary hover:underline"
                >
                  Select all
                </button>
              )}
            </div>

            {pool.length === 0 && !cabLoading ? (
              <p className="text-xs text-muted-foreground italic">
                {cabGroup
                  ? "The default CAB group has no members. Add members in Administration → CAB Groups."
                  : "No agents available."}
              </p>
            ) : (
              <>
                {unselected.length > 0 && (
                  <Select onValueChange={(id) => setSelectedIds((s) => [...s, id])}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Add approver…" />
                    </SelectTrigger>
                    <SelectContent>
                      {unselected.map((m) => (
                        <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {selectedIds.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No approvers selected.</p>
                ) : (
                  <ul className="space-y-1">
                    {selectedIds.map((id) => {
                      const member = pool.find((m) => m.id === id);
                      return (
                        <li key={id} className="flex items-center justify-between rounded-md border px-2.5 py-1.5 text-sm">
                          <div>
                            <span className="font-medium">{member?.name ?? id}</span>
                            {member?.email && (
                              <span className="ml-1.5 text-[11px] text-muted-foreground">{member.email}</span>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => setSelectedIds((s) => s.filter((x) => x !== id))}
                            className="text-muted-foreground hover:text-destructive ml-2"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </>
            )}
          </div>

          {/* Approval mode — controlled by Settings → Changes */}
          <div className="flex items-center gap-2 rounded-md border px-3 py-2 text-xs text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-primary" />
            <span>
              Approval order:{" "}
              <span className="font-medium text-foreground">
                {cabApprovalSequential ? "Sequential (one at a time)" : "Any order (parallel)"}
              </span>
              {" · "}
              <a href="/settings/changes" className="text-primary underline underline-offset-2">
                Change in Settings
              </a>
            </span>
          </div>

          {minCabApprovers > 1 && selectedIds.length > 0 && selectedIds.length < minCabApprovers && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              At least {minCabApprovers} approver{minCabApprovers !== 1 ? "s" : ""} required by your settings.
            </p>
          )}

          {submitError && (
            <div className="rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2 text-xs text-destructive">
              {submitError}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => { onClose(); setSubmitError(null); }}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={selectedIds.length === 0 || selectedIds.length < minCabApprovers || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            <ShieldCheck className="h-3.5 w-3.5 mr-1.5" />
            {mutation.isPending ? "Submitting…" : "Submit for Approval"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Resend-approval dialog ────────────────────────────────────────────────────

interface ResendApprovalDialogProps {
  open: boolean;
  onClose: () => void;
  changeId: number;
  rejectedSteps: ApprovalStep[];
  approvalStatus: ChangeApproval["status"];
  onSuccess: () => void;
}

function ResendApprovalDialog({
  open, onClose, changeId, rejectedSteps, approvalStatus, onSuccess,
}: ResendApprovalDialogProps) {
  const rejectedIds = rejectedSteps.map((s) => s.approver.id);
  const [selectedIds, setSelectedIds] = useState<string[]>(rejectedIds);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Load full CAB pool (same as RequestApprovalDialog)
  const { data: cabData, isLoading: cabLoading } = useQuery({
    queryKey: ["cab-group-default"],
    queryFn: async () => {
      const { data } = await axios.get<{ group: CabGroup | null }>("/api/cab-groups/default");
      return data.group;
    },
    enabled: open,
  });
  const { data: agentsData } = useQuery({
    queryKey: ["agents-list"],
    queryFn: async () => {
      const { data } = await axios.get<{ agents: CabMember[] }>("/api/agents");
      return data.agents;
    },
    enabled: open && cabData === null,
  });
  const pool: CabMember[] = cabData ? cabData.members : (agentsData ?? []);

  // Fetch per-approver send counts + settings limits
  const { data: resendData } = useQuery({
    queryKey: ["change-resend-counts", changeId],
    queryFn: async () => {
      const { data } = await axios.get<{
        counts: Record<string, number>;
        maxApprovalResends: number;
        minCabApprovers: number;
      }>(`/api/changes/${changeId}/resend-counts`);
      return data;
    },
    enabled: open,
  });

  const counts       = resendData?.counts ?? {};
  const maxSends     = resendData?.maxApprovalResends ?? 1;
  const minApprovers = resendData?.minCabApprovers ?? 1;

  const mutation = useMutation({
    mutationFn: async () => {
      await axios.post(`/api/changes/${changeId}/request-approval`, {
        approverIds: selectedIds,
      });
    },
    onSuccess: () => {
      onSuccess();
      onClose();
      setSubmitError(null);
    },
    onError: (err: unknown) => {
      if (axios.isAxiosError(err)) {
        setSubmitError(err.response?.data?.error ?? "Failed to resend approval");
      }
    },
  });

  function toggle(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  const canSubmit =
    selectedIds.length >= 1 &&
    selectedIds.every((id) => (counts[id] ?? 0) < maxSends) &&
    !mutation.isPending;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          onClose();
          setSubmitError(null);
          setSelectedIds(rejectedIds);
        }
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="h-4 w-4 text-muted-foreground" />
            Request New Approval
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Warning when the current approval is still pending */}
          {approvalStatus === "pending" && (
            <div className="flex items-start gap-2 rounded-md bg-amber-500/10 border border-amber-500/20 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
              <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>
                The current pending approval will be <strong>automatically cancelled</strong> before
                the new request is sent to the selected approvers.
              </span>
            </div>
          )}

          {/* Context note */}
          {cabData ? (
            <div className="flex items-center gap-2 rounded-md bg-primary/5 border border-primary/20 px-3 py-2 text-xs">
              <Users className="h-3.5 w-3.5 text-primary shrink-0" />
              <span>
                Restricted to <span className="font-semibold">{cabData.name}</span>{" "}
                ({cabData.memberCount} member{cabData.memberCount !== 1 ? "s" : ""}).
                Rejected approvers are pre-selected.
              </span>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Select approvers to send a new approval request to. Rejected approvers are
              pre-selected. Max Approval Sends per member:{" "}
              <span className="font-medium text-foreground">{maxSends}</span>.
            </p>
          )}

          {/* Member list */}
          {cabLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((n) => (
                <div key={n} className="h-12 rounded-md border bg-muted/30 animate-pulse" />
              ))}
            </div>
          ) : pool.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">No CAB members available.</p>
          ) : (
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {pool.map((member) => {
                const sent        = counts[member.id] ?? 0;
                const remaining   = maxSends - sent;
                const maxed       = remaining <= 0;
                const checked     = selectedIds.includes(member.id);
                const wasRejected = rejectedIds.includes(member.id);
                const rejStep     = rejectedSteps.find((s) => s.approver.id === member.id);
                return (
                  <label
                    key={member.id}
                    className={[
                      "flex items-start gap-3 rounded-md border px-3 py-2.5 text-sm transition-colors",
                      maxed
                        ? "opacity-50 cursor-not-allowed bg-muted/40"
                        : "cursor-pointer hover:bg-muted/40",
                      checked && !maxed ? "bg-primary/5 border-primary/30" : "",
                    ].join(" ")}
                  >
                    <input
                      type="checkbox"
                      checked={checked && !maxed}
                      disabled={maxed}
                      onChange={() => !maxed && toggle(member.id)}
                      className="accent-primary shrink-0 mt-0.5"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium">{member.name}</span>
                        {wasRejected && (
                          <span className="text-[10px] rounded-full px-1.5 py-0.5 bg-destructive/15 text-destructive font-medium">
                            Rejected
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-muted-foreground">{member.email}</span>
                      {wasRejected && rejStep?.decisions[0]?.comment && (
                        <p className="text-[11px] text-muted-foreground italic mt-0.5">
                          "{rejStep.decisions[0].comment}"
                        </p>
                      )}
                    </div>
                    <span
                      className={`text-[10px] shrink-0 mt-0.5 ${maxed ? "text-destructive font-medium" : "text-muted-foreground"}`}
                    >
                      {maxed
                        ? "Limit reached"
                        : `${sent}/${maxSends} sends used`}
                    </span>
                  </label>
                );
              })}
            </div>
          )}

          {submitError && (
            <div className="rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2 text-xs text-destructive">
              {submitError}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              onClose();
              setSubmitError(null);
              setSelectedIds(rejectedIds);
            }}
          >
            Cancel
          </Button>
          <Button size="sm" disabled={!canSubmit} onClick={() => mutation.mutate()}>
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            {mutation.isPending ? "Sending…" : `Send to ${selectedIds.length} approver${selectedIds.length !== 1 ? "s" : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── ChangeApprovalPanel ───────────────────────────────────────────────────────

interface ChangeApprovalPanelProps {
  changeId: number;
  changeState: string;
}

export default function ChangeApprovalPanel({ changeId, changeState }: ChangeApprovalPanelProps) {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen]       = useState(false);
  const [resendDialogOpen, setResendDialogOpen] = useState(false);
  const [showHistory, setShowHistory]     = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["change-approval", changeId],
    queryFn: async () => {
      const { data } = await axios.get<{ approvals: ChangeApproval[] }>(
        `/api/changes/${changeId}/approval`
      );
      return data.approvals;
    },
  });

  const approvals = data ?? [];
  // Latest approval is the "current" one; rest are history
  const approval  = approvals[0] ?? null;
  const history   = approvals.slice(1);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["change-approval", changeId] });
    void queryClient.invalidateQueries({ queryKey: ["change-resend-counts", changeId] });
    void queryClient.invalidateQueries({ queryKey: ["change", String(changeId)] });
    void queryClient.invalidateQueries({ queryKey: ["approvals"] });
  };

  const canRequestApproval =
    ["submitted", "assess", "authorize"].includes(changeState) &&
    (approval === null || approval.status !== "pending");

  // Collect rejected steps regardless of overall approval status.
  // In parallel mode one rejection leaves status "pending" until all decide.
  const rejectedSteps = approval
    ? approval.steps.filter((s) => s.status === "rejected")
    : [];

  // Show "Request New Approval" whenever at least one step has been rejected,
  // as long as the overall request hasn't already been approved or cancelled.
  const canResend =
    ["submitted", "assess", "authorize"].includes(changeState) &&
    approval !== null &&
    approval.status !== "approved" &&
    approval.status !== "cancelled" &&
    rejectedSteps.length > 0;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-[13px] font-medium text-muted-foreground flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5" />
            CAB Approval
          </span>
          <div className="flex items-center gap-1.5">
            {canResend && (
              <Button
                variant="outline"
                size="sm"
                className="h-6 text-[11px] px-2"
                onClick={() => setResendDialogOpen(true)}
              >
                <RefreshCw className="h-3 w-3 mr-1" />
                Resend
              </Button>
            )}
            {canRequestApproval && (
              <Button
                variant="outline"
                size="sm"
                className="h-6 text-[11px] px-2"
                onClick={() => setDialogOpen(true)}
              >
                <Plus className="h-3 w-3 mr-1" />
                Request
              </Button>
            )}
          </div>
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-3 text-sm">
        {isLoading && <Skeleton className="h-12 w-full" />}
        {error && <ErrorAlert error={error} fallback="Failed to load approval" />}

        {!isLoading && !error && approval === null && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground py-1">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            <span>No approval requested yet.</span>
          </div>
        )}

        {approval && (
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <Badge
                variant="outline"
                className={`text-[11px] ${STATUS_STYLE[approval.status]}`}
              >
                {STATUS_LABEL[approval.status]}
              </Badge>
              <span className="text-[11px] text-muted-foreground capitalize">
                {approval.approvalMode} · {formatDate(approval.createdAt)}
              </span>
            </div>

            {approval.requestedBy && (
              <p className="text-[11px] text-muted-foreground">
                Requested by <span className="text-foreground">{approval.requestedBy.name}</span>
              </p>
            )}

            <div className="space-y-1.5">
              {approval.steps.map((step) => (
                <div
                  key={step.id}
                  className={[
                    "flex items-start gap-2 rounded border px-2.5 py-2 text-xs",
                    step.isActive ? "border-primary/30 bg-primary/5" : "border-border",
                  ].join(" ")}
                >
                  <StepStatusIcon status={step.status} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{step.approver.name}</span>
                      <span className="text-muted-foreground capitalize">{step.status}</span>
                    </div>
                    {step.decisions.map((d) => (
                      <p key={d.id} className="mt-0.5 text-muted-foreground">
                        {d.decision === "approved" ? "✓" : "✗"}{" "}
                        {formatDate(d.decidedAt)}
                        {d.comment && <span className="italic"> — "{d.comment}"</span>}
                      </p>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {approval.resolvedAt && (
              <p className="text-[11px] text-muted-foreground">
                Resolved {formatDate(approval.resolvedAt)}
              </p>
            )}
          </div>
        )}

        {/* Previous approval rounds */}
        {history.length > 0 && (
          <div className="mt-3 border-t pt-3">
            <button
              type="button"
              className="text-[11px] text-primary hover:underline"
              onClick={() => setShowHistory((v) => !v)}
            >
              {showHistory ? "Hide" : "Show"} previous rounds ({history.length})
            </button>
            {showHistory && (
              <div className="mt-2 space-y-3">
                {history.map((prev, i) => (
                  <div key={prev.id} className="rounded border border-border/60 p-2.5 space-y-1.5 bg-muted/20">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                        Round {approvals.length - 1 - i}
                      </span>
                      <span className={`text-[10px] rounded-full px-2 py-0.5 font-medium ${STATUS_STYLE[prev.status]}`}>
                        {STATUS_LABEL[prev.status]}
                      </span>
                    </div>
                    <div className="space-y-1">
                      {prev.steps.map((step) => (
                        <div key={step.id} className="flex items-center gap-2 text-xs">
                          <StepStatusIcon status={step.status} />
                          <span className="font-medium">{step.approver.name}</span>
                          <span className="text-muted-foreground capitalize">{step.status}</span>
                          {step.decisions[0]?.comment && (
                            <span className="text-muted-foreground italic">
                              — "{step.decisions[0].comment}"
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                    <p className="text-[10px] text-muted-foreground">{formatDate(prev.createdAt)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>

      <RequestApprovalDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        changeId={changeId}
        onSuccess={invalidate}
      />
      <ResendApprovalDialog
        open={resendDialogOpen}
        onClose={() => setResendDialogOpen(false)}
        changeId={changeId}
        rejectedSteps={rejectedSteps}
        approvalStatus={approval?.status ?? "pending"}
        onSuccess={invalidate}
      />
    </Card>
  );
}
