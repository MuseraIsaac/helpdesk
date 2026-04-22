import { Link } from "react-router";
import { type AuditEvent, type AuditAction } from "core/constants/audit-event.ts";
import { statusLabel } from "core/constants/ticket-status.ts";
import { priorityLabel } from "core/constants/ticket-priority.ts";
import { severityLabel } from "core/constants/ticket-severity.ts";
import { categoryLabel } from "core/constants/ticket-category.ts";
import { escalationReasonLabel } from "core/constants/escalation-reason.ts";
import {
  SquarePlus,
  RefreshCw,
  BarChart2,
  Tag,
  UserCheck,
  AlertTriangle,
  CheckCircle2,
  Clock,
  MessageSquare,
  Lock,
  Bot,
  Zap,
  GitMerge,
  Scissors,
  ArrowDownToLine,
} from "lucide-react";

interface AuditTimelineProps {
  events: AuditEvent[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function actorName(event: AuditEvent): string {
  if (event.actor) return event.actor.name;
  return "System";
}

function str(val: unknown): string {
  return val == null ? "None" : String(val);
}

/** Mono-spaced ticket number chip used inside event descriptions */
function TicketChip({ number, id }: { number: string; id?: number | null }) {
  const inner = (
    <span className="inline-flex items-center gap-1 font-mono text-[11px] font-bold px-1.5 py-0.5 rounded border border-border/60 bg-muted/60 text-foreground leading-none">
      {number}
    </span>
  );
  if (id) {
    return (
      <Link to={`/tickets/${id}`} className="hover:opacity-80 transition-opacity">
        {inner}
      </Link>
    );
  }
  return inner;
}

function describeEvent(event: AuditEvent): React.ReactNode {
  const actor = actorName(event);
  const meta  = event.meta as Record<string, any>;

  switch (event.action as AuditAction) {

    case "ticket.created":
      if (meta.via === "email") return <>Ticket created via inbound email</>;
      return <>Ticket created by <strong>{actor}</strong></>;

    case "ticket.status_changed": {
      const fromLabel = statusLabel[meta.from as keyof typeof statusLabel] ?? str(meta.from);
      const toLabel   = statusLabel[meta.to   as keyof typeof statusLabel] ?? str(meta.to);
      const who = meta.automated ? "System (AI)" : actor;
      return (
        <>
          Status changed by <strong>{who}</strong>:{" "}
          <span className="text-muted-foreground">{fromLabel}</span>
          {" → "}
          <strong>{toLabel}</strong>
        </>
      );
    }

    case "ticket.priority_changed": {
      const fromLabel = meta.from ? (priorityLabel[meta.from as keyof typeof priorityLabel] ?? str(meta.from)) : "None";
      const toLabel   = meta.to   ? (priorityLabel[meta.to   as keyof typeof priorityLabel] ?? str(meta.to))   : "None";
      return (
        <>
          Priority changed by <strong>{actor}</strong>:{" "}
          <span className="text-muted-foreground">{fromLabel}</span>
          {" → "}
          <strong>{toLabel}</strong>
        </>
      );
    }

    case "ticket.severity_changed": {
      const fromLabel = meta.from ? (severityLabel[meta.from as keyof typeof severityLabel] ?? str(meta.from)) : "None";
      const toLabel   = meta.to   ? (severityLabel[meta.to   as keyof typeof severityLabel] ?? str(meta.to))   : "None";
      return (
        <>
          Severity changed by <strong>{actor}</strong>:{" "}
          <span className="text-muted-foreground">{fromLabel}</span>
          {" → "}
          <strong>{toLabel}</strong>
        </>
      );
    }

    case "ticket.category_changed": {
      const fromLabel = meta.from ? (categoryLabel[meta.from as keyof typeof categoryLabel] ?? str(meta.from)) : "None";
      const toLabel   = meta.to   ? (categoryLabel[meta.to   as keyof typeof categoryLabel] ?? str(meta.to))   : "None";
      return (
        <>
          Category changed by <strong>{actor}</strong>:{" "}
          <span className="text-muted-foreground">{fromLabel}</span>
          {" → "}
          <strong>{toLabel}</strong>
        </>
      );
    }

    case "ticket.assigned": {
      const from = meta.from as { name: string } | null;
      const to   = meta.to   as { name: string } | null;
      if (!to) return <><strong>{actor}</strong> unassigned <span className="text-muted-foreground">{from?.name ?? "unknown"}</span></>;
      if (!from) return <><strong>{actor}</strong> assigned to <strong>{to.name}</strong></>;
      return (
        <>
          <strong>{actor}</strong> reassigned from{" "}
          <span className="text-muted-foreground">{from.name}</span> to <strong>{to.name}</strong>
        </>
      );
    }

    case "ticket.sla_breached": {
      const type = meta.type === "first_response" ? "First response" : "Resolution";
      return <><strong>{type} SLA breached</strong></>;
    }

    case "ticket.escalated": {
      const reason = meta.reason
        ? (escalationReasonLabel[meta.reason as keyof typeof escalationReasonLabel] ?? str(meta.reason))
        : "Unknown reason";
      return <>Ticket escalated by <strong>{actor === "System" ? "System" : actor}</strong> — {reason}</>;
    }

    case "ticket.deescalated":
      return <>Ticket de-escalated by <strong>{actor}</strong></>;

    case "reply.created":
      if (meta.automated) return <>AI auto-reply sent to customer</>;
      return <>Reply sent to sender by <strong>{actor}</strong></>;

    case "note.created":
      return <>Internal note added by <strong>{actor}</strong></>;

    case "rule.applied": {
      const actions = Array.isArray(meta.actions) ? (meta.actions as string[]) : [];
      const labels  = actions.map(a =>
        a === "set_category" ? "set category" :
        a === "set_priority" ? "set priority" :
        a === "assign_to"    ? "assigned ticket" :
        a === "escalate"     ? "escalated ticket" : a
      );
      return (
        <>
          Automation rule <strong>{String(meta.ruleName ?? meta.ruleId)}</strong> applied
          {labels.length > 0 && <> — {labels.join(", ")}</>}
        </>
      );
    }

    // ── Merge ──────────────────────────────────────────────────────────────────

    case "ticket.merged":
      // This ticket was merged into a parent.
      return (
        <MergeEventRow
          label="Merged into parent ticket"
          actor={actor}
          detail={
            meta.targetNumber
              ? <><span className="text-muted-foreground">by</span> <strong>{actor}</strong>{" · "}
                  <span className="text-muted-foreground">into</span>{" "}
                  <TicketChip number={String(meta.targetNumber)} id={meta.mergedIntoId as number | null} /></>
              : <><span className="text-muted-foreground">by</span> <strong>{actor}</strong></>
          }
        />
      );

    case "ticket.received_merge":
      // Another ticket was merged INTO this one.
      return (
        <MergeEventRow
          label="Received merged ticket"
          actor={actor}
          detail={
            meta.fromNumber
              ? <><strong>{actor}</strong> <span className="text-muted-foreground">absorbed</span>{" "}
                  <TicketChip number={String(meta.fromNumber)} id={meta.fromId as number | null} />
                  {" "}<span className="text-muted-foreground">as child</span></>
              : <><strong>{actor}</strong> <span className="text-muted-foreground">merged a ticket into this one</span></>
          }
        />
      );

    case "ticket.unmerged":
      // This child was detached from its parent.
      return (
        <UnmergeEventRow
          label="Unmerged from parent"
          detail={
            meta.parentNumber
              ? <><strong>{actor}</strong>{" "}
                  <span className="text-muted-foreground">detached from</span>{" "}
                  <TicketChip number={String(meta.parentNumber)} id={meta.previousParentId as number | null} />
                  {" "}<span className="text-muted-foreground">and reopened</span></>
              : <><strong>{actor}</strong> <span className="text-muted-foreground">detached from parent and reopened</span></>
          }
        />
      );

    case "ticket.child_unmerged":
      // A child was removed from this parent.
      return (
        <UnmergeEventRow
          label="Child ticket removed"
          detail={
            meta.childNumber
              ? <><strong>{actor}</strong>{" "}
                  <span className="text-muted-foreground">unmerged</span>{" "}
                  <TicketChip number={String(meta.childNumber)} id={meta.childId as number | null} />
                  {" "}<span className="text-muted-foreground">from this ticket</span></>
              : <><strong>{actor}</strong> <span className="text-muted-foreground">removed a child ticket from this merge group</span></>
          }
        />
      );

    default:
      return <>{String(event.action)}</>;
  }
}

// ─── Merge / Unmerge inline sub-components ────────────────────────────────────

function MergeEventRow({ label, detail }: { label: string; actor: string; detail: React.ReactNode }) {
  return (
    <span className="inline-flex flex-col gap-0.5">
      <span className="inline-flex items-center gap-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">
          {label}
        </span>
      </span>
      <span className="text-sm leading-snug">{detail}</span>
    </span>
  );
}

function UnmergeEventRow({ label, detail }: { label: string; detail: React.ReactNode }) {
  return (
    <span className="inline-flex flex-col gap-0.5">
      <span className="inline-flex items-center gap-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-rose-600 dark:text-rose-400">
          {label}
        </span>
      </span>
      <span className="text-sm leading-snug">{detail}</span>
    </span>
  );
}

// ─── Icon + colour per action ─────────────────────────────────────────────────

interface IconConfig {
  icon: React.ElementType;
  bg: string;
  fg: string;
}

const ACTION_ICON: Partial<Record<AuditAction, IconConfig>> = {
  "ticket.created":          { icon: SquarePlus,      bg: "bg-green-500/15",  fg: "text-green-600"           },
  "ticket.status_changed":   { icon: RefreshCw,        bg: "bg-muted",         fg: "text-muted-foreground"    },
  "ticket.priority_changed": { icon: BarChart2,        bg: "bg-orange-500/15", fg: "text-orange-600"          },
  "ticket.severity_changed": { icon: BarChart2,        bg: "bg-orange-500/15", fg: "text-orange-600"          },
  "ticket.category_changed": { icon: Tag,              bg: "bg-muted",         fg: "text-muted-foreground"    },
  "ticket.assigned":         { icon: UserCheck,        bg: "bg-blue-500/15",   fg: "text-blue-600"            },
  "ticket.sla_breached":     { icon: Clock,            bg: "bg-red-500/15",    fg: "text-red-600"             },
  "ticket.escalated":        { icon: AlertTriangle,    bg: "bg-red-500/15",    fg: "text-red-600"             },
  "ticket.deescalated":      { icon: CheckCircle2,     bg: "bg-green-500/15",  fg: "text-green-600"           },
  "ticket.merged":           { icon: GitMerge,         bg: "bg-amber-500/15",  fg: "text-amber-600"           },
  "ticket.received_merge":   { icon: ArrowDownToLine,  bg: "bg-violet-500/15", fg: "text-violet-600"          },
  "ticket.unmerged":         { icon: Scissors,         bg: "bg-rose-500/15",   fg: "text-rose-600"            },
  "ticket.child_unmerged":   { icon: Scissors,         bg: "bg-rose-500/15",   fg: "text-rose-600"            },
  "reply.created":           { icon: MessageSquare,    bg: "bg-primary/15",    fg: "text-primary"             },
  "note.created":            { icon: Lock,             bg: "bg-amber-500/15",  fg: "text-amber-600"           },
  "rule.applied":            { icon: Zap,              bg: "bg-violet-500/15", fg: "text-violet-600"          },
};

function getIconConfig(action: string, isAiReply = false): IconConfig {
  if (isAiReply) return { icon: Bot, bg: "bg-sky-500/15", fg: "text-sky-600" };
  return ACTION_ICON[action as AuditAction] ?? { icon: RefreshCw, bg: "bg-muted", fg: "text-muted-foreground" };
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AuditTimeline({ events }: AuditTimelineProps) {
  if (events.length === 0) {
    return <p className="text-sm text-muted-foreground">No audit events recorded yet.</p>;
  }

  const isMergeAction = (a: string) =>
    a === "ticket.merged" || a === "ticket.received_merge" ||
    a === "ticket.unmerged" || a === "ticket.child_unmerged";

  return (
    <ol className="relative space-y-0">
      {events.map((event, idx) => {
        const isLast   = idx === events.length - 1;
        const isAiReply = event.action === "reply.created" && !!(event.meta as any).automated;
        const isMerge  = isMergeAction(event.action);
        const { icon: Icon, bg, fg } = getIconConfig(event.action, isAiReply);

        return (
          <li key={event.id} className="flex gap-3">
            {/* Vertical connector */}
            <div className="flex flex-col items-center">
              <div className={`h-7 w-7 rounded-full flex items-center justify-center shrink-0 ${bg} ${fg}`}>
                <Icon className="h-3.5 w-3.5" />
              </div>
              {!isLast && <div className="w-px flex-1 bg-border mt-1 mb-1 min-h-[12px]" />}
            </div>

            {/* Event body */}
            <div className={`pb-4 pt-1 min-w-0 flex-1 ${isMerge ? "pt-0.5" : ""}`}>
              {isMerge ? (
                // Merge events get a subtle card treatment
                <div className={`rounded-lg border px-3 py-2 text-sm leading-snug ${
                  event.action === "ticket.merged" || event.action === "ticket.received_merge"
                    ? "border-amber-200/60 bg-amber-50/50 dark:border-amber-800/30 dark:bg-amber-950/15"
                    : "border-rose-200/60 bg-rose-50/50 dark:border-rose-800/30 dark:bg-rose-950/15"
                }`}>
                  {describeEvent(event)}
                  <p className="text-[10px] text-muted-foreground/60 mt-1.5 font-medium">
                    {new Date(event.createdAt).toLocaleString(undefined, {
                      month: "short", day: "numeric", year: "numeric",
                      hour: "2-digit", minute: "2-digit",
                    })}
                  </p>
                </div>
              ) : (
                <>
                  <p className="text-sm leading-snug">{describeEvent(event)}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {new Date(event.createdAt).toLocaleString(undefined, {
                      month: "short", day: "numeric", year: "numeric",
                      hour: "2-digit", minute: "2-digit",
                    })}
                  </p>
                </>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
