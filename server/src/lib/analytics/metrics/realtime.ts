/**
 * Real-time operations metrics — live snapshots that ignore the date range.
 *
 * These metrics reflect the current state of the system and are suitable for
 * NOC / operations dashboards. They skip the date-filter parameters.
 */
import type { MetricDefinition } from "../types";

// ── realtime.open_tickets ─────────────────────────────────────────────────────

const realtimeOpenTickets: MetricDefinition = {
  id: "realtime.open_tickets",
  label: "Open Tickets",
  description: "Current count of tickets in open or in-progress status.",
  domain: "realtime",
  unit: "count",
  supportedVisualizations: ["number"],
  defaultVisualization: "number",

  computeFor: {
    async stat(ctx) {
      interface Row { open: bigint; in_progress: bigint }
      const [row] = await ctx.db.$queryRaw<Row[]>`
        SELECT COUNT(*) FILTER (WHERE status = 'open')        AS open,
               COUNT(*) FILTER (WHERE status = 'in_progress') AS in_progress
        FROM ticket WHERE status IN ('open','in_progress')
      `;
      const total = Number(row?.open ?? 0) + Number(row?.in_progress ?? 0);
      return {
        type: "stat", value: total, label: "Open Tickets", unit: "count",
        sub: `${Number(row?.open ?? 0)} open · ${Number(row?.in_progress ?? 0)} in progress`,
      };
    },
  },
};

// ── realtime.unassigned_tickets ───────────────────────────────────────────────

const realtimeUnassigned: MetricDefinition = {
  id: "realtime.unassigned_tickets",
  label: "Unassigned Open Tickets",
  description: "Open tickets currently without an assigned agent.",
  domain: "realtime",
  unit: "count",
  supportedVisualizations: ["number"],
  defaultVisualization: "number",

  computeFor: {
    async stat(ctx) {
      interface Row { count: bigint }
      const [row] = await ctx.db.$queryRaw<Row[]>`
        SELECT COUNT(*) AS count FROM ticket
        WHERE status IN ('open','in_progress') AND "assignedToId" IS NULL
      `;
      return { type: "stat", value: Number(row?.count ?? 0), label: "Unassigned", unit: "count" };
    },
  },
};

// ── realtime.sla_at_risk ──────────────────────────────────────────────────────

const realtimeSlaAtRisk: MetricDefinition = {
  id: "realtime.sla_at_risk",
  label: "Tickets at SLA Risk",
  description: "Active tickets whose first-response or resolution deadline is within the next 2 hours and has not yet been satisfied.",
  domain: "realtime",
  unit: "count",
  supportedVisualizations: ["number"],
  defaultVisualization: "number",

  computeFor: {
    async stat(ctx) {
      // "At risk" = active ticket with an SLA deadline in the next 2h
      // that is still in-flight. Two windows qualify: first-response (no
      // agent has replied yet) and resolution. We include 'escalated'
      // because escalated tickets are still operationally active. We
      // exclude tickets already flagged as breached — those belong on the
      // OVERDUE metric.
      interface Row { count: bigint }
      const [row] = await ctx.db.$queryRaw<Row[]>`
        SELECT COUNT(*) AS count FROM ticket
        WHERE status IN ('open','in_progress','escalated')
          AND "slaBreached" = false
          AND (
            (
              "firstResponseDueAt" IS NOT NULL
              AND "firstRespondedAt"   IS NULL
              AND "firstResponseDueAt" >  NOW()
              AND "firstResponseDueAt" <= NOW() + INTERVAL '2 hours'
            )
            OR
            (
              "resolutionDueAt" IS NOT NULL
              AND "resolvedAt"   IS NULL
              AND "resolutionDueAt" >  NOW()
              AND "resolutionDueAt" <= NOW() + INTERVAL '2 hours'
            )
          )
      `;
      return { type: "stat", value: Number(row?.count ?? 0), label: "At SLA Risk", unit: "count" };
    },
  },
};

// ── realtime.sla_breached_open ────────────────────────────────────────────────

const realtimeSlaBreached: MetricDefinition = {
  id: "realtime.sla_breached_open",
  label: "SLA Overdue (Open)",
  description: "Currently active tickets that have breached their SLA — either the slaBreached flag is set, or a deadline has passed without first response / resolution.",
  domain: "realtime",
  unit: "count",
  supportedVisualizations: ["number"],
  defaultVisualization: "number",

  computeFor: {
    async stat(ctx) {
      // OVERDUE = active ticket past its SLA deadline. Two paths qualify:
      //   1. The slaBreached flag is true (set by check-sla cron every 5 min)
      //   2. A deadline has actually passed and the corresponding event
      //      hasn't occurred yet (firstResponseDueAt < NOW with no first
      //      response, OR resolutionDueAt < NOW with no resolution). This
      //      catches tickets that the breach-marker cron hasn't yet
      //      flipped — between cron ticks the metric still reflects truth.
      // Status set includes 'escalated' so escalated overdue tickets are
      // visible to operators (escalation doesn't satisfy SLA).
      interface Row { count: bigint }
      const [row] = await ctx.db.$queryRaw<Row[]>`
        SELECT COUNT(*) AS count FROM ticket
        WHERE status IN ('open','in_progress','escalated')
          AND (
            "slaBreached" = true
            OR (
              "firstResponseDueAt" IS NOT NULL
              AND "firstRespondedAt" IS NULL
              AND "firstResponseDueAt" < NOW()
            )
            OR (
              "resolutionDueAt" IS NOT NULL
              AND "resolvedAt" IS NULL
              AND "resolutionDueAt" < NOW()
            )
          )
      `;
      return { type: "stat", value: Number(row?.count ?? 0), label: "SLA Overdue", unit: "count" };
    },
  },
};

// ── realtime.active_incidents ─────────────────────────────────────────────────

const realtimeActiveIncidents: MetricDefinition = {
  id: "realtime.active_incidents",
  label: "Active Incidents",
  description: "Incidents currently open or being investigated.",
  domain: "realtime",
  unit: "count",
  supportedVisualizations: ["number"],
  defaultVisualization: "number",

  computeFor: {
    async stat(ctx) {
      interface Row { total: bigint; major: bigint }
      const [row] = await ctx.db.$queryRaw<Row[]>`
        SELECT COUNT(*) AS total,
               COUNT(*) FILTER (WHERE "is_major" = true) AS major
        FROM incident
        WHERE status NOT IN ('resolved','closed')
      `;
      const total = Number(row?.total ?? 0);
      const major = Number(row?.major ?? 0);
      return {
        type: "stat", value: total, label: "Active Incidents", unit: "count",
        sub: major > 0 ? `${major} major` : undefined,
      };
    },
  },
};

// ── realtime.pending_approvals ────────────────────────────────────────────────

const realtimePendingApprovals: MetricDefinition = {
  id: "realtime.pending_approvals",
  label: "Pending Approvals",
  description: "Approval requests currently awaiting a decision.",
  domain: "realtime",
  unit: "count",
  supportedVisualizations: ["number"],
  defaultVisualization: "number",

  computeFor: {
    async stat(ctx) {
      interface Row { count: bigint }
      const [row] = await ctx.db.$queryRaw<Row[]>`
        SELECT COUNT(*) AS count FROM approval_request WHERE status = 'pending'
      `;
      return { type: "stat", value: Number(row?.count ?? 0), label: "Pending Approvals", unit: "count" };
    },
  },
};

// ── realtime.changes_in_progress ─────────────────────────────────────────────

const realtimeChangesInProgress: MetricDefinition = {
  id: "realtime.changes_in_progress",
  label: "Changes In Progress",
  description: "Change requests currently in the implementation or testing phase.",
  domain: "realtime",
  unit: "count",
  supportedVisualizations: ["number"],
  defaultVisualization: "number",

  computeFor: {
    async stat(ctx) {
      interface Row { count: bigint }
      const [row] = await ctx.db.$queryRaw<Row[]>`
        SELECT COUNT(*) AS count FROM "change" WHERE state = 'implement'
      `;
      return { type: "stat", value: Number(row?.count ?? 0), label: "Changes In Progress", unit: "count" };
    },
  },
};

// ── realtime.open_problems ────────────────────────────────────────────────────

const realtimeOpenProblems: MetricDefinition = {
  id: "realtime.open_problems",
  label: "Open Problems",
  description: "Problems that are currently open or under investigation.",
  domain: "realtime",
  unit: "count",
  supportedVisualizations: ["number"],
  defaultVisualization: "number",

  computeFor: {
    async stat(ctx) {
      interface Row { total: bigint; known_errors: bigint }
      const [row] = await ctx.db.$queryRaw<Row[]>`
        SELECT COUNT(*) AS total,
               COUNT(*) FILTER (WHERE "is_known_error" = true) AS known_errors
        FROM problem WHERE status NOT IN ('resolved','closed')
      `;
      const total = Number(row?.total ?? 0);
      const ke = Number(row?.known_errors ?? 0);
      return {
        type: "stat", value: total, label: "Open Problems", unit: "count",
        sub: ke > 0 ? `${ke} known errors` : undefined,
      };
    },
  },
};

// ── realtime.agent_workload_snapshot ─────────────────────────────────────────

const realtimeAgentWorkloadSnapshot: MetricDefinition = {
  id: "realtime.agent_workload_snapshot",
  label: "Agent Workload (Live)",
  description: "Current open ticket count per agent — top 10 busiest agents.",
  domain: "realtime",
  unit: "count",
  // Only `leaderboard` is implemented in computeFor below — listing
  // `bar_horizontal` made the engine pick it as the default and then throw
  // UNSUPPORTED_VIZ because no handler exists, which the client surfaced as
  // "No workload data" even when agents had open tickets.
  supportedVisualizations: ["leaderboard"],
  defaultVisualization:    "leaderboard",

  computeFor: {
    async leaderboard(ctx) {
      const limit = ctx.limit ?? 10;
      // Split counts by status so the UI can render Open + In-Progress as
      // separate columns. The previous version returned a single
      // `openTickets` total, which left the client's `open` and
      // `inProgress` columns empty (rendered as "—") even when the agent
      // had tickets — that was the "Agent Workload shows _" bug.
      interface Row {
        agent_id: string;
        agent_name: string;
        open_count: bigint;
        in_progress_count: bigint;
        total: bigint;
      }
      // The ticket table maps Prisma's `deletedAt` field to the SQL column
      // `deleted_at` (via @map in schema.prisma); the user table keeps the
      // original camelCase `"deletedAt"`. Mixing those up was the actual
      // cause of the earlier "_" empty workload — the query threw 42703
      // and the analytics runner swallowed the error, returning no rows.
      const rows = await ctx.db.$queryRawUnsafe<Row[]>(
        `SELECT u.id   AS agent_id,
                u.name AS agent_name,
                COUNT(*) FILTER (WHERE t.status = 'open')        AS open_count,
                COUNT(*) FILTER (WHERE t.status = 'in_progress') AS in_progress_count,
                COUNT(*)                                         AS total
         FROM "user" u
         JOIN ticket t ON t."assignedToId" = u.id
         WHERE t.status IN ('open','in_progress')
           AND t.deleted_at IS NULL
           AND u.role <> 'customer'
           AND u."deletedAt" IS NULL
         GROUP BY u.id, u.name
         ORDER BY total DESC LIMIT $1`,
        limit,
      );
      return {
        type: "leaderboard",
        entries: rows.map((r, i) => ({
          rank: i + 1,
          key: r.agent_id,
          label: r.agent_name,
          primaryValue: Number(r.total),
          columns: {
            open:        Number(r.open_count),
            inProgress:  Number(r.in_progress_count),
            // Keep the legacy key around so any pre-existing exports / UIs
            // bound to `openTickets` still resolve to a value (the total).
            openTickets: Number(r.total),
          },
        })),
        columnDefs: [
          { key: "open",        label: "Open",        unit: "count" },
          { key: "inProgress",  label: "In Progress", unit: "count" },
          { key: "openTickets", label: "Total",       unit: "count" },
        ],
      };
    },
  },
};

// ── realtime.open_requests ────────────────────────────────────────────────────

const realtimeOpenRequests: MetricDefinition = {
  id: "realtime.open_requests",
  label: "Open Service Requests",
  description: "Service requests currently pending or in fulfillment.",
  domain: "realtime",
  unit: "count",
  supportedVisualizations: ["number"],
  defaultVisualization: "number",

  computeFor: {
    async stat(ctx) {
      interface Row { count: bigint }
      const [row] = await ctx.db.$queryRaw<Row[]>`
        SELECT COUNT(*) AS count FROM service_request
        WHERE status NOT IN ('fulfilled','closed','cancelled','rejected')
      `;
      return { type: "stat", value: Number(row?.count ?? 0), label: "Open Requests", unit: "count" };
    },
  },
};

// ── realtime.overdue_tickets ──────────────────────────────────────────────────

const realtimeOverdueTickets: MetricDefinition = {
  id: "realtime.overdue_tickets",
  label: "Overdue Open Tickets",
  description: "Open tickets that have breached their SLA and are still unresolved.",
  domain: "realtime",
  unit: "count",
  supportedVisualizations: ["number"],
  defaultVisualization: "number",

  computeFor: {
    async stat(_ctx) {
      interface Row { count: bigint }
      const [row] = await _ctx.db.$queryRaw<Row[]>`
        SELECT COUNT(*) AS count FROM ticket
        WHERE status IN ('open','in_progress') AND "slaBreached" = true
      `;
      return { type: "stat", value: Number(row?.count ?? 0), label: "Overdue", unit: "count" };
    },
  },
};

// ── realtime.assigned_not_replied ─────────────────────────────────────────────

const realtimeAssignedNotReplied: MetricDefinition = {
  id: "realtime.assigned_not_replied",
  label: "Assigned Without Reply",
  description: "Assigned open tickets where no agent has replied yet.",
  domain: "realtime",
  unit: "count",
  supportedVisualizations: ["number"],
  defaultVisualization: "number",

  computeFor: {
    async stat(_ctx) {
      interface Row { count: bigint }
      const [row] = await _ctx.db.$queryRaw<Row[]>`
        SELECT COUNT(*) AS count FROM ticket t
        WHERE t.status IN ('open','in_progress')
          AND t."assignedToId" IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM reply r
            WHERE r."ticketId" = t.id AND r."senderType" = 'agent'
          )
      `;
      return { type: "stat", value: Number(row?.count ?? 0), label: "Assigned Without Reply", unit: "count" };
    },
  },
};

// ── Export ────────────────────────────────────────────────────────────────────

export const REALTIME_METRICS: MetricDefinition[] = [
  realtimeOpenTickets,
  realtimeUnassigned,
  realtimeSlaAtRisk,
  realtimeSlaBreached,
  realtimeOverdueTickets,
  realtimeAssignedNotReplied,
  realtimeActiveIncidents,
  realtimePendingApprovals,
  realtimeChangesInProgress,
  realtimeOpenProblems,
  realtimeAgentWorkloadSnapshot,
  realtimeOpenRequests,
];
