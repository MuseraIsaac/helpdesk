import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { useSession } from "@/lib/auth-client";
import { approvalSubjectTypeLabel } from "core/constants/approval.ts";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import ErrorAlert from "@/components/ErrorAlert";
import { CheckCircle2, XCircle, Clock, Ban, AlertCircle, ChevronRight } from "lucide-react";

// ── Types ───────────────────────────────────────────────────────────────────────

interface Approver {
  id: string;
  name: string;
  email: string;
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
  createdAt: string;
  approver: Approver;
  decisions: ApprovalDecision[];
}

interface ApprovalEvent {
  id: number;
  action: string;
  meta: Record<string, unknown>;
  createdAt: string;
  actor: { id: string; name: string } | null;
}

interface ApprovalRequest {
  id: number;
  subjectType: string;
  subjectId: string;
  title: string;
  description: string | null;
  status: "pending" | "approved" | "rejected" | "cancelled" | "expired";
  approvalMode: string;
  requiredCount: number;
  expiresAt: string | null;
  resolvedAt: string | null;
  createdAt: string;
  requestedBy: Approver | null;
  steps: ApprovalStep[];
  events?: ApprovalEvent[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────────

function statusBadge(status: ApprovalRequest["status"]) {
  const map: Record<
    ApprovalRequest["status"],
    { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
  > = {
    pending:   { label: "Pending",   variant: "outline" },
    approved:  { label: "Approved",  variant: "default" },
    rejected:  { label: "Rejected",  variant: "destructive" },
    cancelled: { label: "Cancelled", variant: "secondary" },
    expired:   { label: "Expired",   variant: "secondary" },
  };
  const { label, variant } = map[status] ?? { label: status, variant: "outline" };
  return <Badge variant={variant}>{label}</Badge>;
}

function stepStatusIcon(status: ApprovalStep["status"]) {
  switch (status) {
    case "approved":  return <CheckCircle2 className="h-4 w-4 text-green-600" />;
    case "rejected":  return <XCircle      className="h-4 w-4 text-destructive" />;
    case "skipped":   return <Ban          className="h-4 w-4 text-muted-foreground" />;
    default:          return <Clock        className="h-4 w-4 text-muted-foreground" />;
  }
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatEventAction(action: string) {
  return action
    .replace("approval.", "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Approval Detail Dialog ────────────────────────────────────────────────────

interface ApprovalDetailDialogProps {
  approvalId: number | null;
  onClose: () => void;
  currentUserId: string;
}

function ApprovalDetailDialog({ approvalId, onClose, currentUserId }: ApprovalDetailDialogProps) {
  const queryClient = useQueryClient();
  const [comment, setComment] = useState("");
  const [decisionError, setDecisionError] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["approval", approvalId],
    queryFn: async () => {
      const { data } = await axios.get<{ approvalRequest: ApprovalRequest }>(
        `/api/approvals/${approvalId}`
      );
      return data.approvalRequest;
    },
    enabled: approvalId !== null,
  });

  const decideMutation = useMutation({
    mutationFn: async (decision: "approved" | "rejected") => {
      const { data } = await axios.post(`/api/approvals/${approvalId}/decide`, {
        decision,
        comment: comment.trim() || undefined,
      });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["approval", approvalId] });
      queryClient.invalidateQueries({ queryKey: ["approvals"] });
      setComment("");
      setDecisionError(null);
    },
    onError: (err: unknown) => {
      if (axios.isAxiosError(err)) {
        setDecisionError(err.response?.data?.error ?? "Failed to record decision");
      }
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async () => {
      await axios.post(`/api/approvals/${approvalId}/cancel`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["approval", approvalId] });
      queryClient.invalidateQueries({ queryKey: ["approvals"] });
    },
  });

  const approval = data;
  const myActiveStep = approval?.steps.find(
    (s) => s.approver.id === currentUserId && s.isActive && s.status === "pending"
  );
  const isPending = approval?.status === "pending";

  return (
    <Dialog open={approvalId !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Approval Request</DialogTitle>
        </DialogHeader>

        {isLoading && <Skeleton className="h-64 w-full" />}
        {error && <ErrorAlert error={error} fallback="Failed to load approval" />}

        {approval && (
          <div className="space-y-6">
            {/* Header */}
            <div className="space-y-1">
              <div className="flex items-start justify-between gap-2">
                <h2 className="text-base font-semibold leading-snug">{approval.title}</h2>
                {statusBadge(approval.status)}
              </div>
              {approval.description && (
                <p className="text-sm text-muted-foreground">{approval.description}</p>
              )}
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground pt-1">
                <span>
                  Type:{" "}
                  <span className="text-foreground">
                    {approvalSubjectTypeLabel[approval.subjectType as keyof typeof approvalSubjectTypeLabel] ?? approval.subjectType}
                  </span>
                </span>
                <span>
                  ID: <span className="text-foreground font-mono">{approval.subjectId}</span>
                </span>
                <span>
                  Mode: <span className="text-foreground capitalize">{approval.approvalMode}</span>
                </span>
                {approval.requestedBy && (
                  <span>
                    Requested by:{" "}
                    <span className="text-foreground">{approval.requestedBy.name}</span>
                  </span>
                )}
                <span>Created: {formatDate(approval.createdAt)}</span>
                {approval.expiresAt && (
                  <span>Expires: {formatDate(approval.expiresAt)}</span>
                )}
              </div>
            </div>

            {/* Steps */}
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">
                Approvers
              </p>
              <div className="space-y-2">
                {approval.steps.map((step) => (
                  <div
                    key={step.id}
                    className={[
                      "flex items-start gap-3 rounded-md border px-3 py-2.5 text-sm",
                      step.isActive ? "border-primary/40 bg-primary/5" : "border-border",
                    ].join(" ")}
                  >
                    <div className="mt-0.5">{stepStatusIcon(step.status)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">
                          Step {step.stepOrder} — {step.approver.name}
                        </span>
                        <span className="text-xs text-muted-foreground capitalize">
                          {step.status}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">{step.approver.email}</p>
                      {step.decisions.map((d) => (
                        <div key={d.id} className="mt-1 text-xs text-muted-foreground">
                          {d.decision === "approved" ? "Approved" : "Rejected"} by{" "}
                          <span className="text-foreground">{d.decidedBy.name}</span>{" "}
                          on {formatDate(d.decidedAt)}
                          {d.comment && (
                            <p className="mt-0.5 text-foreground/80 italic">"{d.comment}"</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Action area — only shown when user has an active step */}
            {myActiveStep && isPending && (
              <div className="rounded-md border border-primary/30 bg-primary/5 p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-primary" />
                  <p className="text-sm font-medium">Your decision is required</p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="approval-comment">Comment (optional)</Label>
                  <Textarea
                    id="approval-comment"
                    placeholder="Add a note to explain your decision…"
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    rows={3}
                    className="text-sm"
                  />
                </div>
                {decisionError && (
                  <p className="text-sm text-destructive">{decisionError}</p>
                )}
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => decideMutation.mutate("approved")}
                    disabled={decideMutation.isPending}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                    Approve
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => decideMutation.mutate("rejected")}
                    disabled={decideMutation.isPending}
                  >
                    <XCircle className="h-3.5 w-3.5 mr-1.5" />
                    Reject
                  </Button>
                </div>
              </div>
            )}

            {/* Cancel (requester or admin) */}
            {isPending && (
              <div className="pt-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => cancelMutation.mutate()}
                  disabled={cancelMutation.isPending}
                >
                  Cancel this approval request
                </Button>
              </div>
            )}

            {/* Event timeline */}
            {approval.events && approval.events.length > 0 && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-2">
                  Activity
                </p>
                <ol className="space-y-1.5">
                  {approval.events.map((ev) => (
                    <li key={ev.id} className="flex items-start gap-2 text-xs text-muted-foreground">
                      <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-border shrink-0 mt-1.5" />
                      <span>
                        <span className="text-foreground font-medium">
                          {formatEventAction(ev.action)}
                        </span>
                        {ev.actor && <> by {ev.actor.name}</>}
                        {" · "}
                        {formatDate(ev.createdAt)}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── ApprovalsPage ─────────────────────────────────────────────────────────────

export default function ApprovalsPage() {
  const { data: session } = useSession();
  const currentUserId = session?.user?.id ?? "";

  const [tab, setTab] = useState<"pending" | "all">("pending");
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["approvals", tab],
    queryFn: async () => {
      const params = new URLSearchParams({ scope: "mine", limit: "50" });
      if (tab === "pending") params.set("status", "pending");
      const { data } = await axios.get<{
        approvalRequests: ApprovalRequest[];
        meta: { total: number };
      }>(`/api/approvals?${params}`);
      return data;
    },
  });

  const approvals = data?.approvalRequests ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Approvals</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Requests requiring your review and sign-off.
        </p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList>
          <TabsTrigger value="pending">Pending</TabsTrigger>
          <TabsTrigger value="all">All</TabsTrigger>
        </TabsList>
      </Tabs>

      {error && <ErrorAlert error={error} fallback="Failed to load approvals" />}

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : approvals.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center gap-2">
          <CheckCircle2 className="h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm font-medium text-muted-foreground">
            {tab === "pending" ? "No pending approvals" : "No approvals found"}
          </p>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Requested by</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {approvals.map((a) => {
                const myStep = a.steps.find(
                  (s) => s.approver.id === currentUserId && s.isActive && s.status === "pending"
                );
                return (
                  <TableRow
                    key={a.id}
                    className="cursor-pointer"
                    onClick={() => setSelectedId(a.id)}
                  >
                    <TableCell className="font-medium">
                      <span className="flex items-center gap-2">
                        {myStep && (
                          <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" title="Your action required" />
                        )}
                        {a.title}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {approvalSubjectTypeLabel[a.subjectType as keyof typeof approvalSubjectTypeLabel] ?? a.subjectType}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {a.requestedBy?.name ?? "—"}
                    </TableCell>
                    <TableCell>{statusBadge(a.status)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(a.createdAt)}
                    </TableCell>
                    <TableCell>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <ApprovalDetailDialog
        approvalId={selectedId}
        onClose={() => setSelectedId(null)}
        currentUserId={currentUserId}
      />
    </div>
  );
}
