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

function describeEvent(event: AuditEvent): React.ReactNode {
  const actor = actorName(event);
  const meta = event.meta as Record<string, any>;

  switch (event.action as AuditAction) {
    case "ticket.created":
      if (meta.via === "email") {
        return <>Ticket created via inbound email</>;
      }
      return (
        <>
          Ticket created by <strong>{actor}</strong>
        </>
      );

    case "ticket.status_changed": {
      const fromLabel = statusLabel[meta.from as keyof typeof statusLabel] ?? str(meta.from);
      const toLabel = statusLabel[meta.to as keyof typeof statusLabel] ?? str(meta.to);
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
      const toLabel = meta.to ? (priorityLabel[meta.to as keyof typeof priorityLabel] ?? str(meta.to)) : "None";
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
      const toLabel = meta.to ? (severityLabel[meta.to as keyof typeof severityLabel] ?? str(meta.to)) : "None";
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
      const toLabel = meta.to ? (categoryLabel[meta.to as keyof typeof categoryLabel] ?? str(meta.to)) : "None";
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
      const to = meta.to as { name: string } | null;
      if (!to) {
        return (
          <>
            <strong>{actor}</strong> unassigned{" "}
            <span className="text-muted-foreground">{from?.name ?? "unknown"}</span>
          </>
        );
      }
      if (!from) {
        return (
          <>
            <strong>{actor}</strong> assigned to <strong>{to.name}</strong>
          </>
        );
      }
      return (
        <>
          <strong>{actor}</strong> reassigned from{" "}
          <span className="text-muted-foreground">{from.name}</span> to{" "}
          <strong>{to.name}</strong>
        </>
      );
    }

    case "ticket.sla_breached": {
      const type = meta.type === "first_response" ? "First response" : "Resolution";
      return (
        <>
          <strong>{type} SLA breached</strong>
        </>
      );
    }

    case "ticket.escalated": {
      const reason = meta.reason
        ? (escalationReasonLabel[meta.reason as keyof typeof escalationReasonLabel] ?? str(meta.reason))
        : "Unknown reason";
      const who = actor === "System" ? "System" : actor;
      return (
        <>
          Ticket escalated by <strong>{who}</strong> — {reason}
        </>
      );
    }

    case "ticket.deescalated":
      return (
        <>
          Ticket de-escalated by <strong>{actor}</strong>
        </>
      );

    case "reply.created":
      if (meta.automated) {
        return <>AI auto-reply sent to customer</>;
      }
      return (
        <>
          Reply sent to sender by <strong>{actor}</strong>
        </>
      );

    case "note.created":
      return (
        <>
          Internal note added by <strong>{actor}</strong>
        </>
      );

    case "rule.applied": {
      const actions = Array.isArray(meta.actions) ? (meta.actions as string[]) : [];
      const actionLabels = actions.map((a) => {
        if (a === "set_category") return "set category";
        if (a === "set_priority") return "set priority";
        if (a === "assign_to") return "assigned ticket";
        if (a === "escalate") return "escalated ticket";
        return a;
      });
      return (
        <>
          Automation rule <strong>{String(meta.ruleName ?? meta.ruleId)}</strong> applied
          {actionLabels.length > 0 && (
            <> — {actionLabels.join(", ")}</>
          )}
        </>
      );
    }

    default:
      return <>{String(event.action)}</>;
  }
}

// ─── Icon + colour per action ─────────────────────────────────────────────────

interface IconConfig {
  icon: React.ElementType;
  bg: string;
  fg: string;
}

const ACTION_ICON: Record<AuditAction, IconConfig> = {
  "ticket.created":        { icon: SquarePlus,   bg: "bg-green-500/15",  fg: "text-green-600"  },
  "ticket.status_changed": { icon: RefreshCw,     bg: "bg-muted",         fg: "text-muted-foreground" },
  "ticket.priority_changed": { icon: BarChart2,   bg: "bg-orange-500/15", fg: "text-orange-600" },
  "ticket.severity_changed": { icon: BarChart2,   bg: "bg-orange-500/15", fg: "text-orange-600" },
  "ticket.category_changed": { icon: Tag,         bg: "bg-muted",         fg: "text-muted-foreground" },
  "ticket.assigned":       { icon: UserCheck,     bg: "bg-blue-500/15",   fg: "text-blue-600"   },
  "ticket.sla_breached":   { icon: Clock,         bg: "bg-red-500/15",    fg: "text-red-600"    },
  "ticket.escalated":      { icon: AlertTriangle, bg: "bg-red-500/15",    fg: "text-red-600"    },
  "ticket.deescalated":    { icon: CheckCircle2,  bg: "bg-green-500/15",  fg: "text-green-600"  },
  "reply.created":         { icon: MessageSquare, bg: "bg-primary/15",    fg: "text-primary"    },
  "note.created":          { icon: Lock,          bg: "bg-amber-500/15",  fg: "text-amber-600"  },
  "rule.applied":          { icon: Zap,           bg: "bg-violet-500/15", fg: "text-violet-600" },
};

function getIconConfig(action: string): IconConfig {
  // Special-case automated replies use Bot icon
  return ACTION_ICON[action as AuditAction] ?? {
    icon: RefreshCw,
    bg: "bg-muted",
    fg: "text-muted-foreground",
  };
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AuditTimeline({ events }: AuditTimelineProps) {
  if (events.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No audit events recorded yet.</p>
    );
  }

  return (
    <ol className="relative space-y-0">
      {events.map((event, idx) => {
        const isLast = idx === events.length - 1;
        const { icon: Icon, bg, fg } = getIconConfig(
          event.action === "reply.created" && (event.meta as any).automated
            ? "__ai_reply__"
            : event.action
        );
        // Override icon for AI reply
        const DisplayIcon =
          event.action === "reply.created" && (event.meta as any).automated ? Bot : Icon;

        return (
          <li key={event.id} className="flex gap-3">
            {/* Vertical connector line */}
            <div className="flex flex-col items-center">
              <div
                className={`h-7 w-7 rounded-full flex items-center justify-center shrink-0 ${bg} ${fg}`}
              >
                <DisplayIcon className="h-3.5 w-3.5" />
              </div>
              {!isLast && <div className="w-px flex-1 bg-border mt-1 mb-1 min-h-[12px]" />}
            </div>

            {/* Event body */}
            <div className={`pb-4 pt-1 min-w-0 flex-1 ${isLast ? "" : ""}`}>
              <p className="text-sm leading-snug">{describeEvent(event)}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {new Date(event.createdAt).toLocaleString()}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
