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
  description: "Open tickets with SLA deadline within the next 2 hours that have not yet breached.",
  domain: "realtime",
  unit: "count",
  supportedVisualizations: ["number"],
  defaultVisualization: "number",

  computeFor: {
    async stat(ctx) {
      interface Row { count: bigint }
      const [row] = await ctx.db.$queryRaw<Row[]>`
        SELECT COUNT(*) AS count FROM ticket
        WHERE status IN ('open','in_progress')
          AND "slaBreached" = false
          AND "resolutionDueAt" IS NOT NULL
          AND "resolutionDueAt" <= NOW() + INTERVAL '2 hours'
          AND "resolutionDueAt" > NOW()
      `;
      return { type: "stat", value: Number(row?.count ?? 0), label: "At SLA Risk", unit: "count" };
    },
  },
};

// ── realtime.sla_breached_open ────────────────────────────────────────────────

const realtimeSlaBreached: MetricDefinition = {
  id: "realtime.sla_breached_open",
  label: "SLA Breached (Open)",
  description: "Currently open tickets that have already breached their SLA.",
  domain: "realtime",
  unit: "count",
  supportedVisualizations: ["number"],
  defaultVisualization: "number",

  computeFor: {
    async stat(ctx) {
      interface Row { count: bigint }
      const [row] = await ctx.db.$queryRaw<Row[]>`
        SELECT COUNT(*) AS count FROM ticket
        WHERE status IN ('open','in_progress') AND "slaBreached" = true
      `;
      return { type: "stat", value: Number(row?.count ?? 0), label: "SLA Breached", unit: "count" };
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
  supportedVisualizations: ["leaderboard", "bar_horizontal"],
  defaultVisualization: "bar_horizontal",

  computeFor: {
    async leaderboard(ctx) {
      const limit = ctx.limit ?? 10;
      interface Row { agent_id: string; agent_name: string; count: bigint }
      const rows = await ctx.db.$queryRawUnsafe<Row[]>(
        `SELECT u.id AS agent_id, u.name AS agent_name, COUNT(t.id) AS count
         FROM "user" u JOIN ticket t ON t."assignedToId" = u.id
         WHERE t.status IN ('open','in_progress')
           AND u.role IN ('agent','supervisor','admin')
           AND u."deletedAt" IS NULL
         GROUP BY u.id, u.name
         ORDER BY count DESC LIMIT $1`,
        limit,
      );
      return {
        type: "leaderboard",
        entries: rows.map((r, i) => ({
          rank: i + 1,
          key: r.agent_id,
          label: r.agent_name,
          primaryValue: Number(r.count),
          columns: { openTickets: Number(r.count) },
        })),
        columnDefs: [{ key: "openTickets", label: "Open Tickets", unit: "count" }],
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
