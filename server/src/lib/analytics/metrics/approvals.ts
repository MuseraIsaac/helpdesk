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
      interface Row { avg_seconds: number | null }
      const [row] = await ctx.db.$queryRaw<Row[]>`
        SELECT ROUND(AVG(EXTRACT(EPOCH FROM ("resolvedAt" - "createdAt")))
               FILTER (WHERE "resolvedAt" IS NOT NULL AND status IN ('approved','rejected')))::int
               AS avg_seconds
        FROM approval_request
        WHERE "createdAt" >= ${ctx.dateRange.since} AND "createdAt" <= ${ctx.dateRange.until}
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
