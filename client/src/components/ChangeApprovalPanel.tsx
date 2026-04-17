/**
 * ChangeApprovalPanel — shows the current CAB approval status for a change
 * and lets authorised users request or cancel approval.
 *
 * Embeddable in the change detail sidebar. Queries
 * GET /api/changes/:changeId/approval and mutates via
 * POST /api/changes/:changeId/request-approval.
 *
 * Fully self-contained — no props other than changeId and state.
 * Does not depend on changes being the only consumer of approvals.
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
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Agent {
  id: string;
  name: string;
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

// ── Sub-components ────────────────────────────────────────────────────────────

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
  const [mode, setMode]               = useState<"all" | "any">("all");
  const [submitError, setSubmitError] = useState<string | null>(null);

  const { data: agentsData } = useQuery({
    queryKey: ["agents-list"],
    queryFn: async () => {
      const { data } = await axios.get<{ agents: Agent[] }>("/api/agents");
      return data;
    },
    enabled: open,
  });

  const agents = agentsData?.agents ?? [];
  const unselected = agents.filter((a) => !selectedIds.includes(a.id));

  const mutation = useMutation({
    mutationFn: async () => {
      await axios.post(`/api/changes/${changeId}/request-approval`, {
        approverIds: selectedIds,
        approvalMode: mode,
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

  const addApprover = (id: string) => {
    if (!selectedIds.includes(id)) setSelectedIds((s) => [...s, id]);
  };

  const removeApprover = (id: string) => {
    setSelectedIds((s) => s.filter((x) => x !== id));
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Request CAB Approval</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Approver picker */}
          <div className="space-y-2">
            <Label>Approvers</Label>
            {unselected.length > 0 && (
              <Select onValueChange={addApprover}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Add approver…" />
                </SelectTrigger>
                <SelectContent>
                  {unselected.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {selectedIds.length === 0 ? (
              <p className="text-xs text-muted-foreground">No approvers selected.</p>
            ) : (
              <ul className="space-y-1">
                {selectedIds.map((id) => {
                  const agent = agents.find((a) => a.id === id);
                  return (
                    <li key={id} className="flex items-center justify-between rounded-md border px-2.5 py-1.5 text-sm">
                      <span>{agent?.name ?? id}</span>
                      <button
                        type="button"
                        onClick={() => removeApprover(id)}
                        className="text-muted-foreground hover:text-destructive ml-2"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Approval mode */}
          <div className="space-y-1.5">
            <Label>Mode</Label>
            <Select value={mode} onValueChange={(v) => setMode(v as "all" | "any")}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All must approve (sequential)</SelectItem>
                <SelectItem value="any">Any one approval is sufficient</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              {mode === "all"
                ? "Each approver must sign off in order. Any rejection blocks the change."
                : "The change is approved as soon as one approver accepts."}
            </p>
          </div>

          {submitError && (
            <p className="text-sm text-destructive">{submitError}</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button
            size="sm"
            disabled={selectedIds.length === 0 || mutation.isPending}
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

// ── ChangeApprovalPanel ───────────────────────────────────────────────────────

interface ChangeApprovalPanelProps {
  changeId: number;
  /** Current state of the change — used to decide what actions are available */
  changeState: string;
}

export default function ChangeApprovalPanel({ changeId, changeState }: ChangeApprovalPanelProps) {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["change-approval", changeId],
    queryFn: async () => {
      const { data } = await axios.get<{ approval: ChangeApproval | null }>(
        `/api/changes/${changeId}/approval`
      );
      return data.approval;
    },
  });

  const approval = data ?? null;

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["change-approval", changeId] });
    void queryClient.invalidateQueries({ queryKey: ["change", String(changeId)] });
    void queryClient.invalidateQueries({ queryKey: ["approvals"] });
  };

  // States where requesting a new (or fresh) approval makes sense
  const canRequestApproval =
    ["submitted", "assess", "authorize"].includes(changeState) &&
    (approval === null || approval.status !== "pending");

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-[13px] font-medium text-muted-foreground flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5" />
            CAB Approval
          </span>
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
            {/* Status row */}
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

            {/* Requested by */}
            {approval.requestedBy && (
              <p className="text-[11px] text-muted-foreground">
                Requested by <span className="text-foreground">{approval.requestedBy.name}</span>
              </p>
            )}

            {/* Steps */}
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
                        {d.comment && (
                          <span className="italic"> — "{d.comment}"</span>
                        )}
                      </p>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Resolved timestamp */}
            {approval.resolvedAt && (
              <p className="text-[11px] text-muted-foreground">
                Resolved {formatDate(approval.resolvedAt)}
              </p>
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
    </Card>
  );
}
