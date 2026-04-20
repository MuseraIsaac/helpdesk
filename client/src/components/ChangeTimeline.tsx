/**
 * ChangeTimeline — readable audit trail for a change request.
 *
 * Maps every ChangeEvent action to a human-readable label, icon, and
 * optional detail line so operations teams can follow the change lifecycle
 * at a glance. Events are grouped by calendar day.
 *
 * Supported actions (logged by /api/changes/:id PATCH + CI link endpoints):
 *   change.created              — initial record created
 *   change.<state>              — state transition (draft, submitted, …, closed)
 *   change.assigned             — assignee added/changed/removed
 *   change.coordinator_changed  — coordinator group changed
 *   change.schedule_updated     — planned start/end modified
 *   change.risk_updated         — risk level changed
 *   change.type_updated         — change type changed
 *   change.title_updated        — title edited
 *   change.fields_updated       — one or more planning doc sections saved
 *   change.ci_linked            — additional CI linked
 *   change.ci_unlinked          — CI link removed
 *   change.approval_requested   — CAB approval submitted
 *   change.approval_approved    — CAB approval granted
 *   change.approval_rejected    — CAB approval rejected
 *   change.approval_expired     — approval request expired
 *   change.approval_cancelled   — approval request cancelled
 */

import { Link } from "react-router";
import {
  GitMerge,
  CheckCircle2,
  XCircle,
  Clock,
  User,
  Users,
  Calendar,
  AlertTriangle,
  FileText,
  Database,
  ShieldCheck,
  ShieldX,
  ShieldAlert,
  Shield,
  Plus,
  Pencil,
  ArrowRight,
  Layers,
  Ban,
  ClipboardCheck,
  Paperclip,
  Trash2,
} from "lucide-react";
import type { ChangeEvent } from "core/constants/change.ts";
import {
  changeStateLabel, changeRiskLabel, changeTypeLabel,
  implementationOutcomeLabel,
} from "core/constants/change.ts";
import type { ChangeState, ChangeRisk, ChangeType, ImplementationOutcome } from "core/constants/change.ts";

// ── State colours (mirrors ChangesPage) ──────────────────────────────────────

const STATE_DOT: Record<string, string> = {
  draft:      "bg-muted-foreground",
  submitted:  "bg-blue-500",
  assess:     "bg-purple-500",
  authorize:  "bg-amber-500",
  scheduled:  "bg-cyan-500",
  implement:  "bg-orange-500",
  review:     "bg-violet-500",
  closed:     "bg-green-500",
  cancelled:  "bg-muted-foreground",
  failed:     "bg-destructive",
};

// ── Event descriptor ──────────────────────────────────────────────────────────

interface EventDescriptor {
  icon: React.ReactNode;
  label: (meta: Record<string, unknown>) => string;
  detail?: (meta: Record<string, unknown>) => React.ReactNode;
}

type Meta = Record<string, unknown>;

function stateLabel(s: unknown): string {
  return changeStateLabel[s as ChangeState] ?? String(s);
}

function riskLabel(r: unknown): string {
  return changeRiskLabel[r as ChangeRisk] ?? String(r);
}

function typeLabel(t: unknown): string {
  return changeTypeLabel[t as ChangeType] ?? String(t);
}

function nameOf(obj: unknown): string {
  if (obj && typeof obj === "object" && "name" in obj) return String((obj as { name: string }).name);
  return String(obj ?? "Unknown");
}

const ICON_CLS = "h-3.5 w-3.5 shrink-0";

const EVENT_MAP: Record<string, EventDescriptor> = {
  // ── Lifecycle ────────────────────────────────────────────────────────────────
  "change.created": {
    icon:  <Plus className={`${ICON_CLS} text-green-600`} />,
    label: () => "Change request created",
  },

  // State transitions — each state has its own action key
  "change.draft": {
    icon:  <Layers className={`${ICON_CLS} text-muted-foreground`} />,
    label: () => "Returned to Draft",
  },
  "change.submitted": {
    icon:  <ArrowRight className={`${ICON_CLS} text-blue-500`} />,
    label: () => "Submitted for review",
    detail: (m) => m.previousState
      ? <span>From <strong>{stateLabel(m.previousState)}</strong></span>
      : null,
  },
  "change.assess": {
    icon:  <FileText className={`${ICON_CLS} text-purple-500`} />,
    label: () => "Moved to Assessment",
  },
  "change.authorize": {
    icon:  <Shield className={`${ICON_CLS} text-amber-500`} />,
    label: () => "Moved to Authorization",
    detail: (m) => m.triggeredByApprovalRequest
      ? <span>Approval request #{String(m.triggeredByApprovalRequest)} created</span>
      : null,
  },
  "change.scheduled": {
    icon:  <Calendar className={`${ICON_CLS} text-cyan-500`} />,
    label: () => "Change scheduled",
  },
  "change.implement": {
    icon:  <GitMerge className={`${ICON_CLS} text-orange-500`} />,
    label: () => "Implementation started",
  },
  "change.review": {
    icon:  <CheckCircle2 className={`${ICON_CLS} text-violet-500`} />,
    label: () => "Moved to Post-Implementation Review",
  },
  "change.closed": {
    icon:  <CheckCircle2 className={`${ICON_CLS} text-green-600`} />,
    label: () => "Change closed",
  },
  "change.cancelled": {
    icon:  <Ban className={`${ICON_CLS} text-muted-foreground`} />,
    label: () => "Change cancelled",
  },
  "change.failed": {
    icon:  <XCircle className={`${ICON_CLS} text-destructive`} />,
    label: () => "Change marked as failed",
  },

  // ── Assignment / team ─────────────────────────────────────────────────────
  "change.assigned": {
    icon:  <User className={`${ICON_CLS} text-blue-500`} />,
    label: (m) => m.to ? `Assigned to ${nameOf(m.to)}` : "Assignee removed",
    detail: (m) => m.from && m.to
      ? <span>From <strong>{nameOf(m.from)}</strong></span>
      : null,
  },
  "change.coordinator_changed": {
    icon:  <Users className={`${ICON_CLS} text-blue-500`} />,
    label: (m) => m.to ? `Coordinator group changed to ${nameOf(m.to)}` : "Coordinator group removed",
    detail: (m) => m.from
      ? <span>From <strong>{nameOf(m.from)}</strong></span>
      : null,
  },

  // ── Schedule ──────────────────────────────────────────────────────────────
  "change.schedule_updated": {
    icon:  <Calendar className={`${ICON_CLS} text-cyan-600`} />,
    label: () => "Planned schedule updated",
    detail: (m) => {
      const to = m.to as { start: string | null; end: string | null } | undefined;
      if (!to) return null;
      const fmt = (iso: string | null) =>
        iso ? new Date(iso).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" }) : "—";
      return <span>{fmt(to.start)} → {fmt(to.end)}</span>;
    },
  },

  // ── Risk / type / title ───────────────────────────────────────────────────
  "change.risk_updated": {
    icon:  <AlertTriangle className={`${ICON_CLS} text-amber-500`} />,
    label: (m) => `Risk updated to ${riskLabel(m.to)}`,
    detail: (m) => m.from
      ? <span>Was <strong>{riskLabel(m.from)}</strong></span>
      : null,
  },
  "change.type_updated": {
    icon:  <Layers className={`${ICON_CLS} text-muted-foreground`} />,
    label: (m) => `Change type updated to ${typeLabel(m.to)}`,
    detail: (m) => m.from
      ? <span>Was <strong>{typeLabel(m.from)}</strong></span>
      : null,
  },
  "change.title_updated": {
    icon:  <Pencil className={`${ICON_CLS} text-muted-foreground`} />,
    label: () => "Title updated",
    detail: (m) => m.to
      ? <span className="italic">"{String(m.to)}"</span>
      : null,
  },
  "change.fields_updated": {
    icon:  <FileText className={`${ICON_CLS} text-muted-foreground`} />,
    label: () => "Planning documents updated",
    detail: (m) => {
      const fields = m.fields as string[] | undefined;
      return fields && fields.length > 0
        ? <span>{fields.join(", ")}</span>
        : null;
    },
  },

  // ── CI links ──────────────────────────────────────────────────────────────
  "change.ci_linked": {
    icon:  <Database className={`${ICON_CLS} text-blue-500`} />,
    label: (m) => `CI linked: ${String(m.ciNumber ?? m.ciName ?? "unknown")}`,
    detail: (m) => m.ciId
      ? <Link to={`/cmdb/${String(m.ciId)}`} className="underline hover:no-underline" onClick={(e) => e.stopPropagation()}>{String(m.ciName ?? "")}</Link>
      : null,
  },
  "change.ci_unlinked": {
    icon:  <Database className={`${ICON_CLS} text-muted-foreground`} />,
    label: (m) => `CI removed: ${String(m.ciNumber ?? m.ciName ?? "unknown")}`,
  },

  // ── Approval ──────────────────────────────────────────────────────────────
  "change.approval_requested": {
    icon:  <ShieldAlert className={`${ICON_CLS} text-amber-500`} />,
    label: (m) => {
      const count = m.approverCount as number | undefined;
      return count ? `CAB approval requested — ${count} approver${count !== 1 ? "s" : ""}` : "CAB approval requested";
    },
    detail: (m) => {
      const mode = m.approvalMode as string | undefined;
      return mode ? <span>Mode: <strong>{mode === "all" ? "All must approve" : "Any one approval"}</strong></span> : null;
    },
  },
  "change.approval_approved": {
    icon:  <ShieldCheck className={`${ICON_CLS} text-green-600`} />,
    label: () => "CAB approval granted — all approvers signed off",
  },
  "change.approval_rejected": {
    icon:  <ShieldX className={`${ICON_CLS} text-destructive`} />,
    label: () => "CAB approval rejected",
  },
  "change.approval_expired": {
    icon:  <Clock className={`${ICON_CLS} text-muted-foreground`} />,
    label: () => "Approval request expired",
  },
  "change.approval_cancelled": {
    icon:  <Ban className={`${ICON_CLS} text-muted-foreground`} />,
    label: () => "Approval request cancelled (superseded by new request)",
  },
  "change.step_approved": {
    icon:  <CheckCircle2 className={`${ICON_CLS} text-green-600`} />,
    label: (m) => `Approved by ${String(m.approverName ?? "CAB member")}`,
    detail: (m) => m.comment
      ? <span className="italic">"{String(m.comment)}"</span>
      : null,
  },
  "change.step_rejected": {
    icon:  <XCircle className={`${ICON_CLS} text-destructive`} />,
    label: (m) => `Rejected by ${String(m.approverName ?? "CAB member")}`,
    detail: (m) => m.comment
      ? <span className="italic">"{String(m.comment)}"</span>
      : null,
  },

  // ── Attachments ───────────────────────────────────────────────────────────
  "change.attachment_added": {
    icon:  <Paperclip className={`${ICON_CLS} text-blue-500`} />,
    label: (m) => `Attachment added: ${String(m.filename ?? "file")}`,
    detail: (m) => m.size
      ? <span>{(Number(m.size) / 1024).toFixed(1)} KB</span>
      : null,
  },
  "change.attachment_removed": {
    icon:  <Trash2 className={`${ICON_CLS} text-muted-foreground`} />,
    label: (m) => `Attachment removed: ${String(m.filename ?? "file")}`,
  },

  // ── Closure & PIR ─────────────────────────────────────────────────────────
  "change.closure_updated": {
    icon:  <ClipboardCheck className={`${ICON_CLS} text-violet-500`} />,
    label: (m) => {
      const outcome = m.outcome as ImplementationOutcome | null | undefined;
      return outcome
        ? `Closure recorded — ${implementationOutcomeLabel[outcome] ?? outcome}`
        : "Closure information updated";
    },
    detail: (m) => {
      const parts: string[] = [];
      if (m.rollbackUsed === true)  parts.push("Rollback was used");
      if (m.rollbackUsed === false) parts.push("No rollback");
      const fields = m.fields as string[] | undefined;
      if (fields && fields.length > 0) parts.push(fields.join(", "));
      return parts.length > 0 ? <span>{parts.join(" · ")}</span> : null;
    },
  },
};

// ── Fallback for unknown actions ──────────────────────────────────────────────

function fallback(action: string): EventDescriptor {
  return {
    icon:  <Clock className={`${ICON_CLS} text-muted-foreground`} />,
    label: () => action.replace(/^change\./, "").replace(/_/g, " "),
  };
}

// ── Date helpers ──────────────────────────────────────────────────────────────

function dayKey(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

function timeStr(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

// ── ChangeTimeline ────────────────────────────────────────────────────────────

interface ChangeTimelineProps {
  events: ChangeEvent[];
}

export default function ChangeTimeline({ events }: ChangeTimelineProps) {
  if (events.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-2">No events recorded yet.</p>
    );
  }

  // Group events by day (ascending order — events are stored oldest-first)
  const days: Array<{ label: string; events: ChangeEvent[] }> = [];
  for (const event of events) {
    const dk = dayKey(event.createdAt);
    const existing = days.find((d) => d.label === dk);
    if (existing) {
      existing.events.push(event);
    } else {
      days.push({ label: dk, events: [event] });
    }
  }

  return (
    <div className="space-y-6">
      {days.map((day) => (
        <div key={day.label}>
          {/* Day header */}
          <div className="flex items-center gap-3 mb-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider px-1">
              {day.label}
            </span>
            <div className="h-px flex-1 bg-border" />
          </div>

          {/* Events for this day */}
          <div className="relative">
            {/* Vertical connector line */}
            <div className="absolute left-[11px] top-2 bottom-2 w-px bg-border" />

            <div className="space-y-4">
              {day.events.map((event) => {
                const meta = (event.meta ?? {}) as Meta;
                const descriptor = EVENT_MAP[event.action] ?? fallback(event.action);

                // Detect state-transition events so we can show the state dot
                const isStateEvent = event.action.match(
                  /^change\.(draft|submitted|assess|authorize|scheduled|implement|review|closed|cancelled|failed)$/
                );
                const state = isStateEvent ? event.action.replace("change.", "") : null;

                return (
                  <div key={event.id} className="relative flex items-start gap-3 pl-1">
                    {/* Icon bubble */}
                    <div className="relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border bg-background">
                      {descriptor.icon}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0 pt-0.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          {state && (
                            <span
                              className={`inline-block h-2 w-2 rounded-full shrink-0 ${STATE_DOT[state] ?? "bg-muted-foreground"}`}
                            />
                          )}
                          <span className="text-sm font-medium leading-snug">
                            {descriptor.label(meta)}
                          </span>
                        </div>
                        <span className="text-[11px] text-muted-foreground shrink-0">
                          {timeStr(event.createdAt)}
                        </span>
                      </div>

                      {/* Detail line */}
                      {descriptor.detail && (
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          {descriptor.detail(meta)}
                        </div>
                      )}

                      {/* Actor */}
                      {event.actor && (
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          by <span className="text-foreground">{event.actor.name}</span>
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
