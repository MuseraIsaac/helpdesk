import type { MetricDefinition } from "../types";

const approvalsVolume: MetricDefinition = {
  id: "approvals.volume", label: "Approval Volume",
  description: "Number of approval requests created in the period.",
  domain: "approvals", unit: "count",
  supportedVisualizations: ["number", "bar"],
  defaultVisualization:    "number",

  computeFor: {
    async stat(ctx) {
      interface Row { count: bigint }
      const [row] = await ctx.db.$queryRaw<Row[]>`
        SELECT COUNT(*) AS count FROM approval_request
        WHERE "createdAt" >= ${ctx.dateRange.since} AND "createdAt" <= ${ctx.dateRange.until}
      `;
      return { type: "stat", value: Number(row?.count ?? 0), label: "Approval Requests", unit: "count" };
    },

    async grouped_count(ctx) {
      interface Row { key: string | null; count: bigint }
      const rows = await ctx.db.$queryRaw<Row[]>`
        SELECT COALESCE(status::text,'unknown') AS key, COUNT(*) AS count
        FROM approval_request
        WHERE "createdAt" >= ${ctx.dateRange.since} AND "createdAt" <= ${ctx.dateRange.until}
        GROUP BY status ORDER BY count DESC
      `;
      const items = rows.map(r => ({ key: r.key ?? "unknown", label: r.key ?? "Unknown", value: Number(r.count) }));
      return { type: "grouped_count", items, total: items.reduce((s, i) => s + i.value, 0) };
    },
  },
};

const approvalsTurnaround: MetricDefinition = {
  id: "approvals.turnaround_time", label: "Avg Approval Turnaround",
  description: "Average seconds from approval request creation to resolution.",
  domain: "approvals", unit: "seconds",
  supportedVisualizations: ["number"],
  defaultVisualization:    "number",

  computeFor: {
    async stat(ctx) {
      // Decision time falls back to the latest approval_decision."decidedAt"
      // when approval_request."resolvedAt" is null. This handles two real
      // cases: (a) seed/demo rows created with status='approved' but no
      // resolvedAt stamp, and (b) older approvals from before resolvedAt
      // was added. Without the fallback, decided rows missing the stamp
      // are filtered out and the average reads "—" even though the data
      // is recoverable from the decision audit trail.
      interface Row { avg_seconds: number | null }
      const [row] = await ctx.db.$queryRaw<Row[]>`
        WITH last_decision AS (
          SELECT s.approval_request_id     AS request_id,
                 MAX(d."decidedAt")        AS decided_at
          FROM approval_decision d
          JOIN approval_step s ON s.id = d.step_id
          GROUP BY s.approval_request_id
        )
        SELECT ROUND(AVG(EXTRACT(EPOCH FROM
                 (COALESCE(r."resolvedAt", ld.decided_at) - r."createdAt")))
               FILTER (WHERE COALESCE(r."resolvedAt", ld.decided_at) IS NOT NULL
                         AND r.status IN ('approved','rejected')
                         -- Guard against bad data where the decision was
                         -- stamped earlier than the request itself (legacy
                         -- seed bug). Negative durations would skew the
                         -- average toward absurd values; skip them so the
                         -- metric reflects only sane data points.
                         AND COALESCE(r."resolvedAt", ld.decided_at) >= r."createdAt"))::int
               AS avg_seconds
        FROM approval_request r
        LEFT JOIN last_decision ld ON ld.request_id = r.id
        WHERE r."createdAt" >= ${ctx.dateRange.since}
          AND r."createdAt" <= ${ctx.dateRange.until}
      `;
      return { type: "stat", value: row?.avg_seconds ?? null, label: "Avg Approval Turnaround", unit: "seconds" };
    },
  },
};

const approvalsPendingQueue: MetricDefinition = {
  id: "approvals.pending_queue", label: "Pending Approvals",
  description: "Oldest currently-pending approval requests (live snapshot).",
  domain: "approvals",
  supportedVisualizations: ["table"],
  defaultVisualization:    "table",

  computeFor: {
    async table(ctx) {
      const limit = ctx.limit ?? 10;
      const rows = await ctx.db.approvalRequest.findMany({
        where: { status: "pending" },
        orderBy: { createdAt: "asc" },
        take: limit,
        select: { id: true, title: true, subjectType: true, createdAt: true },
      });
      const now = Date.now();
      return {
        type: "table",
        rows: rows.map(r => ({
          id:          r.id,
          title:       r.title,
          subjectType: r.subjectType,
          createdAt:   r.createdAt.toISOString(),
          daysOpen:    Math.floor((now - r.createdAt.getTime()) / 86_400_000),
        })),
        columnDefs: [
          { key: "title",       label: "Title",        sortable: false },
          { key: "subjectType", label: "Subject Type", sortable: false },
          { key: "daysOpen",    label: "Days Pending", sortable: true  },
        ],
        total: rows.length,
      };
    },
  },
};

export const APPROVAL_METRICS: MetricDefinition[] = [
  approvalsVolume, approvalsTurnaround, approvalsPendingQueue,
];
