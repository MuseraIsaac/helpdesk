/**
 * Server-Sent Events endpoint for real-time operational data.
 *
 * GET /api/sse/realtime
 *   Streams a JSON payload every 30 seconds (or on demand via heartbeat).
 *   Payload: live snapshot of open/unassigned/overdue/at-risk/no-reply counts
 *   plus active incident/problem/request/change/approval counts.
 *
 * The client consumes this via EventSource and uses it to replace the
 * 60-second polling loop in RealtimeReport.tsx.
 */
import { Router } from "express";
import { requireAuth } from "../middleware/require-auth";
import prisma from "../db";

const router = Router();
router.use(requireAuth);

const PUSH_INTERVAL_MS = 30_000; // push every 30 s

async function fetchSnapshot() {
  interface HealthRow {
    open:                 bigint;
    unassigned:           bigint;
    overdue:              bigint;
    at_risk:              bigint;
    assigned_not_replied: bigint;
  }

  const [[health], activeIncidents, pendingApprovals, changesInProgress, openProblems, openRequests] =
    await Promise.all([
      prisma.$queryRaw<HealthRow[]>`
        SELECT
          COUNT(*) FILTER (WHERE status IN ('open','in_progress'))             AS open,
          COUNT(*) FILTER (WHERE status IN ('open','in_progress')
                             AND "assignedToId" IS NULL)                       AS unassigned,
          COUNT(*) FILTER (WHERE status IN ('open','in_progress')
                             AND "slaBreached" = true)                         AS overdue,
          COUNT(*) FILTER (
            WHERE status IN ('open','in_progress')
              AND "slaBreached" = false
              AND "resolutionDueAt" IS NOT NULL
              AND "resolutionDueAt" <= NOW() + INTERVAL '2 hours'
              AND "resolutionDueAt" > NOW()
          )                                                                    AS at_risk,
          (SELECT COUNT(*) FROM ticket t2
           WHERE t2.status IN ('open','in_progress')
             AND t2."assignedToId" IS NOT NULL
             AND NOT EXISTS (
               SELECT 1 FROM reply r
               WHERE r."ticketId" = t2.id AND r."senderType" = 'agent'
             ))                                                                AS assigned_not_replied
        FROM ticket
      `,
      prisma.incident.count({ where: { status: { notIn: ["resolved", "closed"] } } }),
      prisma.approvalRequest.count({ where: { status: "pending" } }),
      prisma.$queryRaw<[{ count: bigint }]>`SELECT COUNT(*) AS count FROM change_request WHERE state = 'implement'`,
      prisma.problem.count({ where: { status: { notIn: ["resolved", "closed"] } } }),
      prisma.serviceRequest.count({ where: { status: { notIn: ["fulfilled", "closed", "cancelled", "rejected"] } } }),
    ]);

  return {
    open:               Number(health?.open               ?? 0),
    unassigned:         Number(health?.unassigned         ?? 0),
    overdue:            Number(health?.overdue            ?? 0),
    atRisk:             Number(health?.at_risk            ?? 0),
    assignedNotReplied: Number(health?.assigned_not_replied ?? 0),
    activeIncidents,
    pendingApprovals,
    changesInProgress:  Number(changesInProgress[0]?.count ?? 0),
    openProblems,
    openRequests,
    timestamp:          new Date().toISOString(),
  };
}

/**
 * GET /api/sse/realtime
 * Establishes an SSE connection and pushes live health data every 30 seconds.
 */
router.get("/realtime", async (req, res) => {
  res.setHeader("Content-Type",  "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection",    "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // disable Nginx buffering if proxied
  res.flushHeaders();

  const sendSnapshot = async () => {
    try {
      const data = await fetchSnapshot();
      res.write(`event: snapshot\ndata: ${JSON.stringify(data)}\n\n`);
    } catch (err) {
      // Log only — do NOT write `event: error` because that string is a reserved
      // SSE event type that fires EventSource.onerror in the browser, closing the
      // client connection. A heartbeat comment keeps the stream alive instead.
      console.error("[SSE] snapshot error:", err);
      try { res.write(": fetch-error\n\n"); } catch { /* stream already closed */ }
    }
  };

  // Push immediately on connect, then on interval
  await sendSnapshot();
  const timer = setInterval(sendSnapshot, PUSH_INTERVAL_MS);

  // Heartbeat every 20 s to prevent proxy timeouts
  const heartbeat = setInterval(() => {
    res.write(": ping\n\n");
  }, 20_000);

  req.on("close", () => {
    clearInterval(timer);
    clearInterval(heartbeat);
    res.end();
  });
});

export default router;
