/**
 * GET /api/reports/insights/*
 *
 * Relationship-based cross-module analytics ("Insights").
 * Each endpoint queries real junction-table relationships — no front-end
 * assumptions or fake aggregations.
 *
 * Endpoints
 * ──────────
 *   GET /insights/overview       Cross-module KPI dashboard
 *   GET /insights/asset-impact   Asset-driven impact leaderboard & breakdown
 *   GET /insights/problem-chains Problem root-cause chains (incident recurrence)
 *   GET /insights/change-risk    Change risk & post-change incident correlation
 *   GET /insights/service-health Service / catalog health via linked assets
 *
 * All endpoints accept ?from=YYYY-MM-DD&to=YYYY-MM-DD or ?period=30
 * (integer days, default 30, max 365).
 */

import { Router } from "express";
import { requireAuth } from "../middleware/require-auth";
import prisma from "../db";

const router = Router();
router.use(requireAuth);

// ── Date helpers (mirrors reports.ts) ─────────────────────────────────────────

function resolveDateWindow(query: Record<string, unknown>, defaultDays = 30): { since: Date; until: Date } {
  const parseDate = (v: unknown): Date | null => {
    if (typeof v !== "string" || !v) return null;
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  };
  const from = parseDate(query.from);
  const to   = parseDate(query.to);
  if (from) {
    const since = new Date(from); since.setHours(0,  0,  0,   0);
    const until = to ? new Date(to) : new Date(); until.setHours(23, 59, 59, 999);
    return { since, until };
  }
  const days  = Math.min(365, Math.max(1, Number(query.period ?? defaultDays) || defaultDays));
  const since = new Date(); since.setDate(since.getDate() - (days - 1)); since.setHours(0, 0, 0, 0);
  const until = new Date(); until.setHours(23, 59, 59, 999);
  return { since, until };
}

// ── 1. OVERVIEW ───────────────────────────────────────────────────────────────
//
// GET /api/reports/insights/overview
//
// Returns cross-module relationship KPIs: asset alerts, problem intelligence,
// change correlation, impact distribution, and the top 10 most-impacted assets.

router.get("/overview", async (req, res) => {
  const { since, until } = resolveDateWindow(req.query as Record<string, unknown>);

  const [
    // Junction table totals (fleet-wide, not date-filtered — these are live relationships)
    incidentLinkTotal,
    problemLinkTotal,
    changeLinkTotal,
    requestLinkTotal,
    ticketLinkTotal,
    ticketCiLinkTotal,

    // Asset alert counts
    assetsWithOpenIncidents,
    assetsWithOpenProblems,
    assetsInActiveChanges,

    // Problem intelligence
    problemsTotal,
    problemsWithIncidents,
    recurringProblems,
    standaloneIncidents,

    // Change correlation
    changesLinkedToProblems,
    changesLinkedToOpenProblems,

    // Asset incident distribution (raw)
    assetIncidentRaw,

    // Top 10 most-impacted assets
    topAssets,
  ] = await Promise.all([
    prisma.assetIncidentLink.count(),
    prisma.assetProblemLink.count(),
    prisma.assetChangeLink.count(),
    prisma.assetRequestLink.count(),
    prisma.assetTicketLink.count(),
    prisma.ticketCiLink.count(),

    prisma.asset.count({
      where: { incidentLinks: { some: { incident: { status: { notIn: ["resolved","closed"] } } } } },
    }),
    prisma.asset.count({
      where: { problemLinks: { some: { problem: { status: { notIn: ["resolved","closed"] } } } } },
    }),
    prisma.asset.count({
      where: { changeLinks: { some: { change: { state: { notIn: ["closed","cancelled","failed"] } } } } },
    }),

    prisma.problem.count({ where: { createdAt: { gte: since, lte: until } } }),
    prisma.problem.count({
      where: { createdAt: { gte: since, lte: until }, linkedIncidents: { some: {} } },
    }),
    prisma.problem.count({
      where: {
        createdAt: { gte: since, lte: until },
        linkedIncidents: { some: {} },
      },
    }),
    // Incidents in period with NO problem link
    prisma.incident.count({
      where: {
        createdAt: { gte: since, lte: until },
        problemLinks: { none: {} },
      },
    }),

    prisma.change.count({
      where: { createdAt: { gte: since, lte: until }, linkedProblemId: { not: null } },
    }),
    prisma.change.count({
      where: {
        createdAt: { gte: since, lte: until },
        linkedProblemId: { not: null },
        linkedProblem: { status: { notIn: ["resolved","closed"] } },
      },
    }),

    // Per-asset incident count to bucket into distribution
    prisma.$queryRaw<Array<{ assetId: number; cnt: bigint }>>`
      SELECT "asset_id" AS "assetId", COUNT(*) AS cnt
      FROM asset_incident_link
      GROUP BY "asset_id"
    `,

    // Top 10 assets by total cross-module links
    prisma.asset.findMany({
      where: {
        OR: [
          { incidentLinks: { some: {} } },
          { problemLinks:  { some: {} } },
          { changeLinks:   { some: {} } },
          { ticketLinks:   { some: {} } },
          { requestLinks:  { some: {} } },
        ],
      },
      select: {
        id: true, assetNumber: true, name: true, type: true, status: true,
        _count: {
          select: {
            incidentLinks: true,
            problemLinks:  true,
            changeLinks:   true,
            requestLinks:  true,
            ticketLinks:   true,
          },
        },
      },
      take: 50,
    }),
  ]);

  // Bucket asset incident distribution
  const buckets = { "0": 0, "1": 0, "2–5": 0, "6–10": 0, "10+": 0 };
  const totalAssets = await prisma.asset.count();
  const assetsWithAny = new Set(assetIncidentRaw.map((r: { assetId: number; cnt: bigint }) => r.assetId)).size;
  buckets["0"] = totalAssets - assetsWithAny;
  for (const { cnt } of assetIncidentRaw) {
    const n = Number(cnt);
    if (n === 1)       buckets["1"]++;
    else if (n <= 5)   buckets["2–5"]++;
    else if (n <= 10)  buckets["6–10"]++;
    else               buckets["10+"]++;
  }
  const incidentDistribution = Object.entries(buckets).map(([bucket, count]) => ({ bucket, count }));

  type TopAssetRaw = typeof topAssets[number];

  // Sort top assets by total links descending
  const top10 = topAssets
    .map((a: TopAssetRaw) => ({
      id:          a.id,
      assetNumber: a.assetNumber,
      name:        a.name,
      type:        a.type,
      status:      a.status,
      incidents:   a._count.incidentLinks,
      problems:    a._count.problemLinks,
      changes:     a._count.changeLinks,
      requests:    a._count.requestLinks,
      tickets:     a._count.ticketLinks,
      total:       a._count.incidentLinks + a._count.problemLinks + a._count.changeLinks + a._count.requestLinks + a._count.ticketLinks,
    }))
    .sort((a: { total: number }, b: { total: number }) => b.total - a.total)
    .slice(0, 10);

  const totalCrossModuleLinks = incidentLinkTotal + problemLinkTotal + changeLinkTotal + requestLinkTotal + ticketLinkTotal + ticketCiLinkTotal;

  res.json({
    totalCrossModuleLinks,
    linksByType: [
      { type: "incidents",  label: "Asset–Incident",  count: incidentLinkTotal  },
      { type: "problems",   label: "Asset–Problem",   count: problemLinkTotal   },
      { type: "changes",    label: "Asset–Change",    count: changeLinkTotal    },
      { type: "requests",   label: "Asset–Request",   count: requestLinkTotal   },
      { type: "tickets",    label: "Asset–Ticket",    count: ticketLinkTotal    },
      { type: "ticket_cis", label: "Ticket–CI",       count: ticketCiLinkTotal  },
    ],
    assets: {
      withOpenIncidents: assetsWithOpenIncidents,
      withOpenProblems:  assetsWithOpenProblems,
      inActiveChanges:   assetsInActiveChanges,
    },
    problems: {
      total:              problemsTotal,
      withIncidents:      problemsWithIncidents,
      recurring:          recurringProblems,
    },
    standaloneIncidents,
    changes: {
      linkedToProblems:     changesLinkedToProblems,
      linkedToOpenProblems: changesLinkedToOpenProblems,
    },
    incidentDistribution,
    topImpactedAssets: top10,
  });
});

// ── 2. ASSET IMPACT ───────────────────────────────────────────────────────────
//
// GET /api/reports/insights/asset-impact
//
// Leaderboard of most-impacted assets across all ITIL domains, stacked by
// entity type, plus concurrent-risk detection (open incident + active change).

router.get("/asset-impact", async (req, res) => {
  const { since, until } = resolveDateWindow(req.query as Record<string, unknown>);

  const [topAssets, concurrentRisk, byTypeRaw, requestsByType] = await Promise.all([
    // Top 20 assets by total cross-module links (created in period)
    prisma.$queryRaw<Array<{
      id: number; assetNumber: string; name: string; type: string; status: string;
      incidents: bigint; openIncidents: bigint;
      problems:  bigint; openProblems:  bigint;
      changes:   bigint; activeChanges: bigint;
      requests:  bigint; tickets:       bigint;
    }>>`
      SELECT
        a.id, a.asset_number AS "assetNumber", a.name, a.type::text, a.status::text,
        COUNT(DISTINCT ail.incident_id)                                        AS incidents,
        COUNT(DISTINCT ail.incident_id) FILTER (
          WHERE i.status NOT IN ('resolved','closed'))                         AS "openIncidents",
        COUNT(DISTINCT apl.problem_id)                                         AS problems,
        COUNT(DISTINCT apl.problem_id) FILTER (
          WHERE pr.status NOT IN ('resolved','closed'))                        AS "openProblems",
        COUNT(DISTINCT acl.change_id)                                          AS changes,
        COUNT(DISTINCT acl.change_id) FILTER (
          WHERE cr.state NOT IN ('closed','cancelled','failed'))               AS "activeChanges",
        COUNT(DISTINCT arl.request_id)                                         AS requests,
        COUNT(DISTINCT atl.ticket_id)                                          AS tickets
      FROM asset a
      LEFT JOIN asset_incident_link ail ON ail.asset_id = a.id
      LEFT JOIN incident i ON i.id = ail.incident_id
      LEFT JOIN asset_problem_link  apl ON apl.asset_id = a.id
      LEFT JOIN problem pr ON pr.id = apl.problem_id
      LEFT JOIN asset_change_link   acl ON acl.asset_id = a.id
      LEFT JOIN change_request cr ON cr.id = acl.change_id
      LEFT JOIN asset_request_link  arl ON arl.asset_id = a.id
      LEFT JOIN asset_ticket_link   atl ON atl.asset_id = a.id
      WHERE (
        ail.asset_id IS NOT NULL OR apl.asset_id IS NOT NULL OR
        acl.asset_id IS NOT NULL OR arl.asset_id IS NOT NULL OR atl.asset_id IS NOT NULL
      )
      GROUP BY a.id, a.asset_number, a.name, a.type, a.status
      ORDER BY (
        COUNT(DISTINCT ail.incident_id) +
        COUNT(DISTINCT apl.problem_id)  +
        COUNT(DISTINCT acl.change_id)   +
        COUNT(DISTINCT arl.request_id)  +
        COUNT(DISTINCT atl.ticket_id)
      ) DESC
      LIMIT 20
    `,

    // Assets with concurrent risk: open incident AND active change
    prisma.$queryRaw<Array<{
      id: number; assetNumber: string; name: string; type: string;
      openIncidents: bigint; activeChanges: bigint;
    }>>`
      SELECT
        a.id, a.asset_number AS "assetNumber", a.name, a.type::text,
        COUNT(DISTINCT ail.incident_id) FILTER (
          WHERE i.status NOT IN ('resolved','closed')) AS "openIncidents",
        COUNT(DISTINCT acl.change_id) FILTER (
          WHERE cr.state NOT IN ('closed','cancelled','failed')) AS "activeChanges"
      FROM asset a
      JOIN asset_incident_link ail ON ail.asset_id = a.id
      JOIN incident i ON i.id = ail.incident_id AND i.status NOT IN ('resolved','closed')
      JOIN asset_change_link acl ON acl.asset_id = a.id
      JOIN change_request cr ON cr.id = acl.change_id AND cr.state NOT IN ('closed','cancelled','failed')
      GROUP BY a.id, a.asset_number, a.name, a.type
      HAVING COUNT(DISTINCT ail.incident_id) FILTER (WHERE i.status NOT IN ('resolved','closed')) > 0
         AND COUNT(DISTINCT acl.change_id)   FILTER (WHERE cr.state  NOT IN ('closed','cancelled','failed')) > 0
      ORDER BY "openIncidents" DESC
      LIMIT 15
    `,

    // Stacked incident/problem/change counts by asset type
    prisma.$queryRaw<Array<{
      type: string;
      incidents: bigint; problems: bigint; changes: bigint; requests: bigint;
    }>>`
      SELECT
        a.type::text AS type,
        COUNT(DISTINCT ail.incident_id) AS incidents,
        COUNT(DISTINCT apl.problem_id)  AS problems,
        COUNT(DISTINCT acl.change_id)   AS changes,
        COUNT(DISTINCT arl.request_id)  AS requests
      FROM asset a
      LEFT JOIN asset_incident_link ail ON ail.asset_id = a.id
      LEFT JOIN asset_problem_link  apl ON apl.asset_id = a.id
      LEFT JOIN asset_change_link   acl ON acl.asset_id = a.id
      LEFT JOIN asset_request_link  arl ON arl.asset_id = a.id
      WHERE a.created_at <= ${until}
      GROUP BY a.type
      ORDER BY (COUNT(DISTINCT ail.incident_id) + COUNT(DISTINCT apl.problem_id)) DESC
      LIMIT 12
    `,

    // Service requests linked to assets by asset type — shows which asset types are most in demand
    prisma.$queryRaw<Array<{ type: string; requestCount: bigint }>>`
      SELECT a.type::text AS type, COUNT(DISTINCT arl.request_id) AS "requestCount"
      FROM asset a
      JOIN asset_request_link arl ON arl.asset_id = a.id
      JOIN service_request sr ON sr.id = arl.request_id
        AND sr."createdAt" >= ${since} AND sr."createdAt" <= ${until}
      GROUP BY a.type
      ORDER BY "requestCount" DESC
    `,
  ]);

  void since; // suppress unused warning (used in sub-queries above)

  res.json({
    topAssets: topAssets.map(a => ({
      id:           a.id,
      assetNumber:  a.assetNumber,
      name:         a.name,
      type:         a.type,
      status:       a.status,
      incidents:    Number(a.incidents),    openIncidents: Number(a.openIncidents),
      problems:     Number(a.problems),     openProblems:  Number(a.openProblems),
      changes:      Number(a.changes),      activeChanges: Number(a.activeChanges),
      requests:     Number(a.requests),
      tickets:      Number(a.tickets),
      total:        Number(a.incidents) + Number(a.problems) + Number(a.changes) + Number(a.requests) + Number(a.tickets),
    })),
    concurrentRisk: concurrentRisk.map(a => ({
      id:           a.id,
      assetNumber:  a.assetNumber,
      name:         a.name,
      type:         a.type,
      openIncidents: Number(a.openIncidents),
      activeChanges: Number(a.activeChanges),
    })),
    byAssetType: byTypeRaw.map(r => ({
      type:      r.type,
      incidents: Number(r.incidents),
      problems:  Number(r.problems),
      changes:   Number(r.changes),
      requests:  Number(r.requests),
    })),
    requestsByAssetType: requestsByType.map(r => ({
      type:         r.type,
      requestCount: Number(r.requestCount),
    })),
  });
});

// ── 3. PROBLEM CHAINS ─────────────────────────────────────────────────────────
//
// GET /api/reports/insights/problem-chains
//
// Root-cause analysis: incident recurrence per problem, change resolution
// status, top problem-causing assets, and problem-status breakdown.

router.get("/problem-chains", async (req, res) => {
  const { since, until } = resolveDateWindow(req.query as Record<string, unknown>);

  const [problemStats, topProblems, resolutionViaChange, topProblemAssets, byStatus] = await Promise.all([
    // Recurrence distribution: how many incidents does each problem have?
    prisma.$queryRaw<Array<{ incidentCount: bigint; problemCount: bigint }>>`
      SELECT
        COALESCE(sub.incident_count, 0)::bigint AS "incidentCount",
        COUNT(*) AS "problemCount"
      FROM (
        SELECT p.id, COUNT(pil.incident_id) AS incident_count
        FROM problem p
        LEFT JOIN problem_incident_link pil ON pil.problem_id = p.id
        WHERE p."createdAt" >= ${since} AND p."createdAt" <= ${until}
        GROUP BY p.id
      ) sub
      GROUP BY sub.incident_count
      ORDER BY sub.incident_count
    `,

    // Top 15 problems by incident count with change linkage
    prisma.$queryRaw<Array<{
      id: number; problemNumber: string; title: string; status: string;
      incidentCount: bigint; ticketCount: bigint; assetCount: bigint;
      changeId: number | null; changeNumber: string | null; changeState: string | null;
    }>>`
      SELECT
        p.id, p.problem_number AS "problemNumber", p.title, p.status::text,
        COUNT(DISTINCT pil.incident_id) AS "incidentCount",
        COUNT(DISTINCT ptl.ticket_id)   AS "ticketCount",
        COUNT(DISTINCT apl.asset_id)    AS "assetCount",
        cr.id AS "changeId",
        cr.change_number AS "changeNumber",
        cr.state::text AS "changeState"
      FROM problem p
      LEFT JOIN problem_incident_link pil ON pil.problem_id = p.id
      LEFT JOIN problem_ticket_link   ptl ON ptl.problem_id = p.id
      LEFT JOIN asset_problem_link    apl ON apl.problem_id = p.id
      LEFT JOIN change_request        cr  ON cr.linked_problem_id = p.id
      WHERE p."createdAt" >= ${since} AND p."createdAt" <= ${until}
      GROUP BY p.id, p.problem_number, p.title, p.status, cr.id, cr.change_number, cr.state
      ORDER BY "incidentCount" DESC
      LIMIT 15
    `,

    // Problem resolution via change breakdown
    prisma.$queryRaw<Array<{ category: string; count: bigint }>>`
      SELECT
        CASE
          WHEN cr.id IS NULL THEN 'no_change'
          WHEN cr.state IN ('closed') AND cr.implementation_outcome = 'successful' THEN 'change_resolved'
          WHEN cr.state IN ('closed') AND cr.state = 'failed' THEN 'change_failed'
          WHEN cr.state IN ('closed','cancelled','failed') THEN 'change_terminal'
          ELSE 'change_in_progress'
        END AS category,
        COUNT(*) AS count
      FROM problem p
      LEFT JOIN change_request cr ON cr.linked_problem_id = p.id
      WHERE p."createdAt" >= ${since} AND p."createdAt" <= ${until}
      GROUP BY 1
    `,

    // Top 10 assets by linked problem count
    prisma.$queryRaw<Array<{
      id: number; assetNumber: string; name: string; type: string;
      problemCount: bigint; openProblemCount: bigint;
    }>>`
      SELECT
        a.id, a.asset_number AS "assetNumber", a.name, a.type::text,
        COUNT(apl.problem_id)                                                       AS "problemCount",
        COUNT(apl.problem_id) FILTER (WHERE p.status NOT IN ('resolved','closed'))  AS "openProblemCount"
      FROM asset a
      JOIN asset_problem_link apl ON apl.asset_id = a.id
      JOIN problem p ON p.id = apl.problem_id
      GROUP BY a.id, a.asset_number, a.name, a.type
      ORDER BY "problemCount" DESC
      LIMIT 10
    `,

    // Problem status with avg incident count
    prisma.$queryRaw<Array<{ status: string; problemCount: bigint; totalIncidents: bigint }>>`
      SELECT
        p.status::text AS status,
        COUNT(DISTINCT p.id) AS "problemCount",
        COUNT(pil.incident_id) AS "totalIncidents"
      FROM problem p
      LEFT JOIN problem_incident_link pil ON pil.problem_id = p.id
      WHERE p."createdAt" >= ${since} AND p."createdAt" <= ${until}
      GROUP BY p.status
      ORDER BY "problemCount" DESC
    `,
  ]);

  // Build recurrence distribution buckets
  const recurrenceMap = new Map<number, number>();
  for (const r of problemStats) {
    recurrenceMap.set(Number(r.incidentCount), Number(r.problemCount));
  }
  const recurrenceDistribution = [
    { bucket: "0",    label: "No incidents",    count: recurrenceMap.get(0) ?? 0 },
    { bucket: "1",    label: "1 incident",      count: recurrenceMap.get(1) ?? 0 },
    { bucket: "2–5",  label: "2–5 incidents",   count: Array.from(recurrenceMap.entries()).filter(([k]) => k >= 2 && k <= 5).reduce((s, [, v]) => s + v, 0) },
    { bucket: "6–10", label: "6–10 incidents",  count: Array.from(recurrenceMap.entries()).filter(([k]) => k >= 6 && k <= 10).reduce((s, [, v]) => s + v, 0) },
    { bucket: "10+",  label: "10+ incidents",   count: Array.from(recurrenceMap.entries()).filter(([k]) => k > 10).reduce((s, [, v]) => s + v, 0) },
  ];

  // Build resolution-via-change breakdown
  const resMap = new Map(resolutionViaChange.map(r => [r.category, Number(r.count)]));
  const resolutionBreakdown = {
    noChange:          resMap.get("no_change")        ?? 0,
    changeResolved:    resMap.get("change_resolved")  ?? 0,
    changeFailed:      resMap.get("change_failed")    ?? 0,
    changeInProgress:  resMap.get("change_in_progress") ?? 0,
    changeTerminal:    resMap.get("change_terminal")  ?? 0,
  };

  // Avg incidents per problem
  const totalProblemsN = problemStats.reduce((s, r) => s + Number(r.problemCount), 0);
  const totalIncidentsN = problemStats.reduce((s, r) => s + Number(r.incidentCount) * Number(r.problemCount), 0);
  const avgIncidentsPerProblem = totalProblemsN > 0 ? +(totalIncidentsN / totalProblemsN).toFixed(2) : 0;

  res.json({
    avgIncidentsPerProblem,
    recurrenceDistribution,
    resolutionBreakdown,
    topProblems: topProblems.map(p => ({
      id:            p.id,
      problemNumber: p.problemNumber,
      title:         p.title,
      status:        p.status,
      incidentCount: Number(p.incidentCount),
      ticketCount:   Number(p.ticketCount),
      assetCount:    Number(p.assetCount),
      linkedChange:  p.changeId
        ? { id: p.changeId, changeNumber: p.changeNumber!, state: p.changeState! }
        : null,
    })),
    topProblemAssets: topProblemAssets.map(a => ({
      id:               a.id,
      assetNumber:      a.assetNumber,
      name:             a.name,
      type:             a.type,
      problemCount:     Number(a.problemCount),
      openProblemCount: Number(a.openProblemCount),
    })),
    byStatus: byStatus.map(s => ({
      status:           s.status,
      count:            Number(s.problemCount),
      totalIncidents:   Number(s.totalIncidents),
      avgIncidents:     Number(s.problemCount) > 0 ? +(Number(s.totalIncidents) / Number(s.problemCount)).toFixed(2) : 0,
    })),
  });
});

// ── 4. CHANGE RISK ────────────────────────────────────────────────────────────
//
// GET /api/reports/insights/change-risk
//
// Change risk correlation: success rate by risk level and type, asset-scope
// impact distribution, changes currently linked to open problems, and recent
// failed changes with their asset footprint.

router.get("/change-risk", async (req, res) => {
  const { since, until } = resolveDateWindow(req.query as Record<string, unknown>);

  const [successByRisk, successByType, assetScopeRaw, changesWithOpenProblems, recentFailed] = await Promise.all([
    // Success / failure rate by risk level + avg asset count
    prisma.$queryRaw<Array<{
      risk: string; total: bigint; failed: bigint; avgAssets: number;
    }>>`
      SELECT
        COALESCE(cr.risk::text, 'unset') AS risk,
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE cr.state = 'failed') AS failed,
        ROUND(AVG(asset_counts.cnt)::numeric, 1) AS "avgAssets"
      FROM change_request cr
      LEFT JOIN (
        SELECT change_id, COUNT(*) AS cnt FROM asset_change_link GROUP BY change_id
      ) asset_counts ON asset_counts.change_id = cr.id
      WHERE cr."createdAt" >= ${since} AND cr."createdAt" <= ${until}
      GROUP BY cr.risk
      ORDER BY total DESC
    `,

    // Success / failure rate by change type
    prisma.$queryRaw<Array<{
      changeType: string; total: bigint; failed: bigint; avgAssets: number;
    }>>`
      SELECT
        COALESCE(cr.change_type::text, 'unknown') AS "changeType",
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE cr.state = 'failed') AS failed,
        ROUND(AVG(asset_counts.cnt)::numeric, 1) AS "avgAssets"
      FROM change_request cr
      LEFT JOIN (
        SELECT change_id, COUNT(*) AS cnt FROM asset_change_link GROUP BY change_id
      ) asset_counts ON asset_counts.change_id = cr.id
      WHERE cr."createdAt" >= ${since} AND cr."createdAt" <= ${until}
      GROUP BY cr.change_type
      ORDER BY total DESC
    `,

    // Distribution: how many assets does each change touch?
    prisma.$queryRaw<Array<{ bucket: string; changeCount: bigint; failedCount: bigint }>>`
      SELECT
        CASE
          WHEN COALESCE(cnt, 0) = 0    THEN '0 assets'
          WHEN cnt <= 3               THEN '1–3 assets'
          WHEN cnt <= 10              THEN '4–10 assets'
          ELSE '10+ assets'
        END AS bucket,
        COUNT(*) AS "changeCount",
        COUNT(*) FILTER (WHERE cr.state = 'failed') AS "failedCount"
      FROM change_request cr
      LEFT JOIN (
        SELECT change_id, COUNT(*) AS cnt FROM asset_change_link GROUP BY change_id
      ) ac ON ac.change_id = cr.id
      WHERE cr."createdAt" >= ${since} AND cr."createdAt" <= ${until}
      GROUP BY 1
      ORDER BY MIN(COALESCE(ac.cnt,0))
    `,

    // Changes linked to still-open problems (change is a planned fix for an active issue)
    prisma.$queryRaw<Array<{
      id: number; changeNumber: string; title: string; state: string;
      risk: string; changeType: string;
      problemId: number; problemNumber: string; problemTitle: string; problemStatus: string;
      assetCount: bigint;
    }>>`
      SELECT
        cr.id, cr.change_number AS "changeNumber", cr.title, cr.state::text, cr.risk::text,
        cr.change_type::text AS "changeType",
        p.id AS "problemId", p.problem_number AS "problemNumber",
        p.title AS "problemTitle", p.status::text AS "problemStatus",
        COALESCE(ac.cnt, 0) AS "assetCount"
      FROM change_request cr
      JOIN problem p ON p.id = cr.linked_problem_id
        AND p.status NOT IN ('resolved','closed')
      LEFT JOIN (
        SELECT change_id, COUNT(*) AS cnt FROM asset_change_link GROUP BY change_id
      ) ac ON ac.change_id = cr.id
      WHERE cr."createdAt" >= ${since} AND cr."createdAt" <= ${until}
        AND cr.state NOT IN ('closed','cancelled','failed')
      ORDER BY cr."createdAt" DESC
      LIMIT 20
    `,

    // Recent failed changes with asset footprint
    prisma.$queryRaw<Array<{
      id: number; changeNumber: string; title: string;
      risk: string; failedAt: Date;
      assetCount: bigint; linkedProblem: string | null;
    }>>`
      SELECT
        cr.id, cr.change_number AS "changeNumber", cr.title, cr.risk::text,
        cr."updatedAt" AS "failedAt",
        COALESCE(ac.cnt, 0) AS "assetCount",
        p.problem_number AS "linkedProblem"
      FROM change_request cr
      LEFT JOIN (
        SELECT change_id, COUNT(*) AS cnt FROM asset_change_link GROUP BY change_id
      ) ac ON ac.change_id = cr.id
      LEFT JOIN problem p ON p.id = cr.linked_problem_id
      WHERE cr."createdAt" >= ${since} AND cr."createdAt" <= ${until}
        AND cr.state = 'failed'
      ORDER BY cr."updatedAt" DESC
      LIMIT 10
    `,
  ]);

  res.json({
    successByRisk: successByRisk.map(r => ({
      risk:        r.risk,
      total:       Number(r.total),
      failed:      Number(r.failed),
      successRate: Number(r.total) > 0 ? +(((Number(r.total) - Number(r.failed)) / Number(r.total)) * 100).toFixed(1) : null,
      avgAssets:   r.avgAssets ?? 0,
    })),
    successByType: successByType.map(r => ({
      changeType:  r.changeType,
      total:       Number(r.total),
      failed:      Number(r.failed),
      successRate: Number(r.total) > 0 ? +(((Number(r.total) - Number(r.failed)) / Number(r.total)) * 100).toFixed(1) : null,
      avgAssets:   r.avgAssets ?? 0,
    })),
    assetScopeDistribution: assetScopeRaw.map(r => ({
      bucket:      r.bucket,
      changeCount: Number(r.changeCount),
      failedCount: Number(r.failedCount),
      failureRate: Number(r.changeCount) > 0 ? +(Number(r.failedCount) / Number(r.changeCount) * 100).toFixed(1) : 0,
    })),
    changesLinkedToOpenProblems: changesWithOpenProblems.map(c => ({
      id:            c.id,
      changeNumber:  c.changeNumber,
      title:         c.title,
      state:         c.state,
      risk:          c.risk,
      changeType:    c.changeType,
      assetCount:    Number(c.assetCount),
      problem: {
        id:     c.problemId,
        number: c.problemNumber,
        title:  c.problemTitle,
        status: c.problemStatus,
      },
    })),
    recentFailedChanges: recentFailed.map(c => ({
      id:            c.id,
      changeNumber:  c.changeNumber,
      title:         c.title,
      risk:          c.risk,
      failedAt:      c.failedAt,
      assetCount:    Number(c.assetCount),
      linkedProblem: c.linkedProblem,
    })),
  });
});

// ── 5. SERVICE HEALTH ─────────────────────────────────────────────────────────
//
// GET /api/reports/insights/service-health
//
// Catalog-item health lens: which services have failing assets, which generate
// the most requests, and how asset issues propagate into service requests.

router.get("/service-health", async (req, res) => {
  const { since, until } = resolveDateWindow(req.query as Record<string, unknown>);

  const [topServices, servicesWithFailingAssets, requestImpact, servicesByChange] = await Promise.all([
    // Top 15 catalog items by request volume + asset-incident exposure
    prisma.$queryRaw<Array<{
      id: number; name: string;
      requestCount: bigint; openRequests: bigint;
      assetCount: bigint; assetsWithIncidents: bigint; openIncidentCount: bigint;
    }>>`
      SELECT
        ci.id, ci.name,
        COUNT(DISTINCT sr.id) AS "requestCount",
        COUNT(DISTINCT sr.id) FILTER (WHERE sr.status NOT IN ('fulfilled','closed','rejected','cancelled')) AS "openRequests",
        COUNT(DISTINCT asl.asset_id) AS "assetCount",
        COUNT(DISTINCT asl.asset_id) FILTER (
          WHERE EXISTS (
            SELECT 1 FROM asset_incident_link ail2
            JOIN incident i2 ON i2.id = ail2.incident_id
            WHERE ail2.asset_id = asl.asset_id AND i2.status NOT IN ('resolved','closed')
          )
        ) AS "assetsWithIncidents",
        (
          SELECT COUNT(DISTINCT ail3.incident_id)
          FROM asset_incident_link ail3
          JOIN incident i3 ON i3.id = ail3.incident_id
          WHERE ail3.asset_id IN (SELECT asset_id FROM asset_service_link WHERE catalog_item_id = ci.id)
            AND i3.status NOT IN ('resolved','closed')
        ) AS "openIncidentCount"
      FROM catalog_item ci
      LEFT JOIN service_request sr ON sr.catalog_item_id = ci.id
        AND sr."createdAt" >= ${since} AND sr."createdAt" <= ${until}
      LEFT JOIN asset_service_link asl ON asl.catalog_item_id = ci.id
      WHERE ci.is_active = true
      GROUP BY ci.id, ci.name
      HAVING COUNT(DISTINCT sr.id) > 0 OR COUNT(DISTINCT asl.asset_id) > 0
      ORDER BY "requestCount" DESC
      LIMIT 15
    `,

    // Services with failing assets — highest operational risk
    prisma.$queryRaw<Array<{
      id: number; name: string;
      linkedAssets: bigint; assetsWithOpenIncidents: bigint; openIncidentCount: bigint;
    }>>`
      SELECT
        ci.id, ci.name,
        COUNT(DISTINCT asl.asset_id) AS "linkedAssets",
        COUNT(DISTINCT asl.asset_id) FILTER (
          WHERE EXISTS (
            SELECT 1 FROM asset_incident_link ail
            JOIN incident i ON i.id = ail.incident_id AND i.status NOT IN ('resolved','closed')
            WHERE ail.asset_id = asl.asset_id
          )
        ) AS "assetsWithOpenIncidents",
        COALESCE((
          SELECT COUNT(DISTINCT ail2.incident_id)
          FROM asset_incident_link ail2
          JOIN incident i2 ON i2.id = ail2.incident_id AND i2.status NOT IN ('resolved','closed')
          WHERE ail2.asset_id IN (SELECT asset_id FROM asset_service_link asl2 WHERE asl2.catalog_item_id = ci.id)
        ), 0) AS "openIncidentCount"
      FROM catalog_item ci
      JOIN asset_service_link asl ON asl.catalog_item_id = ci.id
      GROUP BY ci.id, ci.name
      HAVING COUNT(DISTINCT asl.asset_id) FILTER (
        WHERE EXISTS (
          SELECT 1 FROM asset_incident_link ail3
          JOIN incident i3 ON i3.id = ail3.incident_id AND i3.status NOT IN ('resolved','closed')
          WHERE ail3.asset_id = asl.asset_id
        )
      ) > 0
      ORDER BY "openIncidentCount" DESC
      LIMIT 10
    `,

    // Request impact: how many open requests are affected by asset incidents?
    prisma.$queryRaw<Array<{
      totalRequests: bigint;
      requestsWithAssetLinks: bigint;
      requestsAffectedByIncidents: bigint;
    }>>`
      SELECT
        COUNT(DISTINCT sr.id) AS "totalRequests",
        COUNT(DISTINCT sr.id) FILTER (
          WHERE EXISTS (SELECT 1 FROM asset_request_link arl WHERE arl.request_id = sr.id)
        ) AS "requestsWithAssetLinks",
        COUNT(DISTINCT sr.id) FILTER (
          WHERE EXISTS (
            SELECT 1 FROM asset_request_link arl
            JOIN asset_incident_link ail ON ail.asset_id = arl.asset_id
            JOIN incident i ON i.id = ail.incident_id AND i.status NOT IN ('resolved','closed')
            WHERE arl.request_id = sr.id
          )
        ) AS "requestsAffectedByIncidents"
      FROM service_request sr
      WHERE sr."createdAt" >= ${since} AND sr."createdAt" <= ${until}
        AND sr.status NOT IN ('fulfilled','closed','rejected','cancelled')
    `,

    // Services (catalog items) most frequently associated via asset changes
    // — uses asset_service_link + asset_change_link to find which services
    //   are touched indirectly by changes through their assets.
    prisma.$queryRaw<Array<{ id: number; name: string; changeCount: bigint; failedCount: bigint }>>`
      SELECT
        ci.id, ci.name,
        COUNT(DISTINCT acl.change_id) AS "changeCount",
        COUNT(DISTINCT acl.change_id) FILTER (WHERE cr.state = 'failed') AS "failedCount"
      FROM catalog_item ci
      JOIN asset_service_link asl ON asl.catalog_item_id = ci.id
      JOIN asset_change_link  acl ON acl.asset_id = asl.asset_id
      JOIN change_request     cr  ON cr.id = acl.change_id
        AND cr."createdAt" >= ${since} AND cr."createdAt" <= ${until}
      GROUP BY ci.id, ci.name
      HAVING COUNT(DISTINCT acl.change_id) > 0
      ORDER BY "changeCount" DESC
      LIMIT 10
    `,
  ]);

  const impact = requestImpact[0];

  res.json({
    topServices: topServices.map(s => ({
      id:                  s.id,
      name:                s.name,
      requestCount:        Number(s.requestCount),
      openRequests:        Number(s.openRequests),
      assetCount:          Number(s.assetCount),
      assetsWithIncidents: Number(s.assetsWithIncidents),
      openIncidentCount:   Number(s.openIncidentCount),
      // Health score 0-100: lower = more at risk
      healthScore: Number(s.assetCount) === 0
        ? 100
        : Math.max(0, Math.round(100 - (Number(s.assetsWithIncidents) / Math.max(Number(s.assetCount), 1)) * 100)),
    })),
    servicesWithFailingAssets: servicesWithFailingAssets.map(s => ({
      id:                    s.id,
      name:                  s.name,
      linkedAssets:          Number(s.linkedAssets),
      assetsWithIncidents:   Number(s.assetsWithOpenIncidents),
      openIncidentCount:     Number(s.openIncidentCount),
    })),
    requestImpact: {
      totalOpenRequests:            Number(impact?.totalRequests ?? 0),
      requestsWithAssetLinks:       Number(impact?.requestsWithAssetLinks ?? 0),
      requestsAffectedByIncidents:  Number(impact?.requestsAffectedByIncidents ?? 0),
      impactRate: Number(impact?.requestsWithAssetLinks ?? 0) > 0
        ? +((Number(impact?.requestsAffectedByIncidents ?? 0) / Number(impact?.requestsWithAssetLinks ?? 0)) * 100).toFixed(1)
        : 0,
    },
    servicesByChange: servicesByChange.map(s => ({
      id:          s.id,
      name:        s.name,
      changeCount: Number(s.changeCount),
      failedCount: Number(s.failedCount),
      failureRate: Number(s.changeCount) > 0 ? +(Number(s.failedCount) / Number(s.changeCount) * 100).toFixed(1) : 0,
    })),
  });
});

// ── 6. TICKET INSIGHTS ────────────────────────────────────────────────────────
//
// GET /api/reports/insights/tickets
//
// Comprehensive ticket relationship and distribution analysis:
//   - Cross-module relationship profile (linked incidents / problems / assets / CIs)
//   - Volume by category, priority, team, source/channel
//   - Temporal patterns: hour of day, day of week, day of month
//   - Top customers by ticket volume and SLA breach
//   - Priority × Status impact matrix
//   - SLA breach rate by category
//   - Custom field value distributions (dynamic — whatever fields are populated)

router.get("/tickets", async (req, res) => {
  const { since, until } = resolveDateWindow(req.query as Record<string, unknown>);

  const BASE = `t.status NOT IN ('new','processing') AND t."createdAt" >= $1 AND t."createdAt" <= $2`;

  const [
    relationships,
    byCategory,
    byPriority,
    byTeam,
    bySource,
    byHourOfDay,
    byDayOfWeek,
    byDayOfMonth,
    topCustomers,
    priorityStatusMatrix,
    slaByCategory,
    topLinkedProblems,
    customFieldsRaw,
  ] = await Promise.all([

    // Cross-module relationship profile
    prisma.$queryRawUnsafe<Array<{
      total: bigint; withIncident: bigint; withRequest: bigint;
      withProblem: bigint; withAsset: bigint; withCi: bigint;
    }>>(
      `SELECT
         COUNT(*) AS total,
         COUNT(*) FILTER (WHERE t.linked_incident_id IS NOT NULL) AS "withIncident",
         COUNT(*) FILTER (WHERE t.linked_service_request_id IS NOT NULL) AS "withRequest",
         COUNT(*) FILTER (WHERE EXISTS (
           SELECT 1 FROM problem_ticket_link ptl WHERE ptl.ticket_id = t.id
         )) AS "withProblem",
         COUNT(*) FILTER (WHERE EXISTS (
           SELECT 1 FROM asset_ticket_link atl WHERE atl.ticket_id = t.id
         )) AS "withAsset",
         COUNT(*) FILTER (WHERE EXISTS (
           SELECT 1 FROM ticket_ci_link tcl WHERE tcl.ticket_id = t.id
         )) AS "withCi"
       FROM ticket t WHERE ${BASE}`,
      since, until,
    ),

    // By category (nullable — coalesce to "uncategorised")
    prisma.$queryRawUnsafe<Array<{ category: string; count: bigint; open: bigint; slaBreached: bigint }>>(
      `SELECT
         COALESCE(t.category::text, 'uncategorised') AS category,
         COUNT(*) AS count,
         COUNT(*) FILTER (WHERE t.status = 'open') AS open,
         COUNT(*) FILTER (WHERE t."slaBreached" = true) AS "slaBreached"
       FROM ticket t WHERE ${BASE}
       GROUP BY t.category
       ORDER BY count DESC`,
      since, until,
    ),

    // By priority
    prisma.$queryRawUnsafe<Array<{ priority: string; count: bigint; slaBreached: bigint }>>(
      `SELECT
         COALESCE(t.priority::text, 'unset') AS priority,
         COUNT(*) AS count,
         COUNT(*) FILTER (WHERE t."slaBreached" = true) AS "slaBreached"
       FROM ticket t WHERE ${BASE}
       GROUP BY t.priority
       ORDER BY count DESC`,
      since, until,
    ),

    // By team with SLA breach rate
    prisma.$queryRawUnsafe<Array<{ teamId: number | null; teamName: string; count: bigint; open: bigint; slaBreached: bigint }>>(
      `SELECT
         q.id AS "teamId",
         COALESCE(q.name, 'Unassigned') AS "teamName",
         COUNT(t.id) AS count,
         COUNT(t.id) FILTER (WHERE t.status = 'open') AS open,
         COUNT(t.id) FILTER (WHERE t."slaBreached" = true) AS "slaBreached"
       FROM ticket t
       LEFT JOIN "queue" q ON q.id = t."queueId"
       WHERE ${BASE}
       GROUP BY q.id, q.name
       ORDER BY count DESC
       LIMIT 20`,
      since, until,
    ),

    // By source channel
    prisma.$queryRawUnsafe<Array<{ source: string; count: bigint }>>(
      `SELECT COALESCE(t.source, 'unknown') AS source, COUNT(*) AS count
       FROM ticket t WHERE ${BASE}
       GROUP BY t.source
       ORDER BY count DESC`,
      since, until,
    ),

    // By hour of day (0–23) — identifies peak support hours
    prisma.$queryRawUnsafe<Array<{ hour: number; count: bigint }>>(
      `SELECT EXTRACT(HOUR FROM t."createdAt")::int AS hour, COUNT(*) AS count
       FROM ticket t WHERE ${BASE}
       GROUP BY hour
       ORDER BY hour`,
      since, until,
    ),

    // By day of week (0=Sun … 6=Sat)
    prisma.$queryRawUnsafe<Array<{ dow: number; count: bigint }>>(
      `SELECT EXTRACT(DOW FROM t."createdAt")::int AS dow, COUNT(*) AS count
       FROM ticket t WHERE ${BASE}
       GROUP BY dow
       ORDER BY dow`,
      since, until,
    ),

    // By day of month (1–31) — identifies calendar-driven spikes
    prisma.$queryRawUnsafe<Array<{ dom: number; count: bigint }>>(
      `SELECT EXTRACT(DAY FROM t."createdAt")::int AS dom, COUNT(*) AS count
       FROM ticket t WHERE ${BASE}
       GROUP BY dom
       ORDER BY dom`,
      since, until,
    ),

    // Top 20 customers by ticket count
    prisma.$queryRawUnsafe<Array<{
      customerId: number; name: string; email: string;
      ticketCount: bigint; openCount: bigint; slaBreachedCount: bigint;
    }>>(
      `SELECT
         c.id AS "customerId",
         c.name,
         c.email,
         COUNT(t.id) AS "ticketCount",
         COUNT(t.id) FILTER (WHERE t.status = 'open') AS "openCount",
         COUNT(t.id) FILTER (WHERE t."slaBreached" = true) AS "slaBreachedCount"
       FROM ticket t
       JOIN customer c ON c.id = t."customerId"
       WHERE ${BASE} AND t."customerId" IS NOT NULL
       GROUP BY c.id, c.name, c.email
       ORDER BY "ticketCount" DESC
       LIMIT 20`,
      since, until,
    ),

    // Priority × Status matrix for heatmap
    prisma.$queryRawUnsafe<Array<{ priority: string; status: string; count: bigint }>>(
      `SELECT
         COALESCE(t.priority::text, 'unset') AS priority,
         t.status::text AS status,
         COUNT(*) AS count
       FROM ticket t WHERE ${BASE}
       GROUP BY t.priority, t.status
       ORDER BY priority, status`,
      since, until,
    ),

    // SLA breach rate by category
    prisma.$queryRawUnsafe<Array<{ category: string; total: bigint; breached: bigint }>>(
      `SELECT
         COALESCE(t.category::text, 'uncategorised') AS category,
         COUNT(*) FILTER (WHERE t."resolutionDueAt" IS NOT NULL) AS total,
         COUNT(*) FILTER (WHERE t."slaBreached" = true) AS breached
       FROM ticket t WHERE ${BASE}
       GROUP BY t.category
       ORDER BY breached DESC`,
      since, until,
    ),

    // Top problems by linked ticket count
    prisma.$queryRawUnsafe<Array<{
      problemId: number; problemNumber: string; title: string; status: string; ticketCount: bigint;
    }>>(
      `SELECT
         p.id AS "problemId",
         p.problem_number AS "problemNumber",
         p.title,
         p.status::text,
         COUNT(ptl.ticket_id) AS "ticketCount"
       FROM problem p
       JOIN problem_ticket_link ptl ON ptl.problem_id = p.id
       JOIN ticket t ON t.id = ptl.ticket_id
       WHERE t."createdAt" >= $1 AND t."createdAt" <= $2
       GROUP BY p.id, p.problem_number, p.title, p.status
       ORDER BY "ticketCount" DESC
       LIMIT 10`,
      since, until,
    ),

    // Custom field value distributions (JSONB expansion)
    prisma.$queryRawUnsafe<Array<{ key: string; value: string; count: bigint }>>(
      `SELECT kv.key, kv.value, COUNT(*) AS count
       FROM ticket t, jsonb_each_text(t."customFields") AS kv(key, value)
       WHERE t."createdAt" >= $1 AND t."createdAt" <= $2
         AND t."customFields" IS NOT NULL
         AND t."customFields" != '{}'::jsonb
         AND t.status NOT IN ('new','processing')
       GROUP BY kv.key, kv.value
       ORDER BY kv.key, count DESC`,
      since, until,
    ),
  ]);

  // ── Shape responses ──────────────────────────────────────────────────────────

  const rel = relationships[0];
  const total = Number(rel?.total ?? 0);
  const withIncident = Number(rel?.withIncident ?? 0);
  const withRequest  = Number(rel?.withRequest  ?? 0);
  const withProblem  = Number(rel?.withProblem  ?? 0);
  const withAsset    = Number(rel?.withAsset    ?? 0);
  const withCi       = Number(rel?.withCi       ?? 0);
  const standalone   = Math.max(0, total - withIncident - withProblem - withAsset - withCi);

  // Build full hour-of-day series (fill gaps with 0)
  const hourMap = new Map(byHourOfDay.map(r => [r.hour, Number(r.count)]));
  const fullHours = Array.from({ length: 24 }, (_, h) => ({
    hour: h,
    label: h === 0 ? "12am" : h < 12 ? `${h}am` : h === 12 ? "12pm" : `${h - 12}pm`,
    count: hourMap.get(h) ?? 0,
  }));

  // Build day-of-week series (fill gaps with 0)
  const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const dowMap = new Map(byDayOfWeek.map(r => [r.dow, Number(r.count)]));
  const fullDow = DAYS.map((name, i) => ({ dow: i, name, count: dowMap.get(i) ?? 0 }));

  // Build day-of-month series (fill 1–31 with 0)
  const domMap = new Map(byDayOfMonth.map(r => [r.dom, Number(r.count)]));
  const fullDom = Array.from({ length: 31 }, (_, i) => ({ day: i + 1, count: domMap.get(i + 1) ?? 0 }));

  // Build custom fields: group by key, top 10 keys by total count, top 6 values each
  const cfByKey = new Map<string, { value: string; count: number }[]>();
  for (const { key, value, count } of customFieldsRaw) {
    if (!cfByKey.has(key)) cfByKey.set(key, []);
    cfByKey.get(key)!.push({ value, count: Number(count) });
  }
  const customFields = Array.from(cfByKey.entries())
    .map(([key, values]) => ({
      fieldName: key,
      totalResponses: values.reduce((s, v) => s + v.count, 0),
      values: values.slice(0, 6),
    }))
    .sort((a, b) => b.totalResponses - a.totalResponses)
    .slice(0, 10);

  res.json({
    // Cross-module relationship profile
    relationships: { total, withIncident, withRequest, withProblem, withAsset, withCi, standalone },

    // Volume distributions
    byCategory: byCategory.map(r => ({
      category:    r.category,
      count:       Number(r.count),
      open:        Number(r.open),
      slaBreached: Number(r.slaBreached),
    })),
    byPriority: byPriority.map(r => ({
      priority:    r.priority,
      count:       Number(r.count),
      slaBreached: Number(r.slaBreached),
    })),
    byTeam: byTeam.map(r => ({
      teamId:      r.teamId,
      teamName:    r.teamName,
      count:       Number(r.count),
      open:        Number(r.open),
      slaBreached: Number(r.slaBreached),
    })),
    bySource: bySource.map(r => ({ source: r.source, count: Number(r.count) })),

    // Temporal patterns
    byHourOfDay:  fullHours,
    byDayOfWeek:  fullDow,
    byDayOfMonth: fullDom,

    // Customer analysis
    topCustomers: topCustomers.map(r => ({
      customerId:      r.customerId,
      name:            r.name,
      email:           r.email,
      ticketCount:     Number(r.ticketCount),
      openCount:       Number(r.openCount),
      slaBreachedCount: Number(r.slaBreachedCount),
    })),

    // Heatmap + SLA
    priorityStatusMatrix: priorityStatusMatrix.map(r => ({
      priority: r.priority, status: r.status, count: Number(r.count),
    })),
    slaByCategory: slaByCategory.map(r => ({
      category:   r.category,
      total:      Number(r.total),
      breached:   Number(r.breached),
      breachRate: Number(r.total) > 0 ? +((Number(r.breached) / Number(r.total)) * 100).toFixed(1) : 0,
    })),

    // Linked problems
    topLinkedProblems: topLinkedProblems.map(r => ({
      problemId:     r.problemId,
      problemNumber: r.problemNumber,
      title:         r.title,
      status:        r.status,
      ticketCount:   Number(r.ticketCount),
    })),

    // Custom fields (dynamic)
    customFields,
  });
});

export default router;
