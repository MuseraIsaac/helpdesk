import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { hashPassword } from "better-auth/crypto";
import { AI_AGENT_ID } from "core/constants/ai-agent.ts";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;

  if (!email || !password) {
    throw new Error(
      "SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD must be set in .env"
    );
  }

  const now = new Date();

  // ── Seed built-in roles ────────────────────────────────────────────────────
  // The User table now has a foreign key to Role.key, so the role rows must
  // exist before any user can be inserted. Permissions are left empty and
  // hydrated by `loadRoles()` at boot from BUILTIN_ROLE_PERMISSIONS.
  const BUILTIN_ROLES: Array<{
    key: string; name: string; description: string;
    isBuiltin: boolean; isSystem: boolean; color: string | null;
  }> = [
    { key: "admin",      name: "Administrator", description: "Full access to every feature, including settings and user management.", isBuiltin: true,  isSystem: false, color: "#dc2626" },
    { key: "supervisor", name: "Supervisor",    description: "Team lead with broad ticket access and reporting privileges.",            isBuiltin: true,  isSystem: false, color: "#7c3aed" },
    { key: "agent",      name: "Agent",         description: "Standard support agent — handles tickets within their team's scope.",     isBuiltin: true,  isSystem: false, color: "#2563eb" },
    { key: "readonly",   name: "Read-only",     description: "View-only access; cannot modify tickets or settings.",                    isBuiltin: true,  isSystem: false, color: "#64748b" },
    { key: "customer",   name: "Customer",      description: "Portal user — can submit tickets and view their own.",                    isBuiltin: true,  isSystem: true,  color: "#10b981" },
  ];
  for (const r of BUILTIN_ROLES) {
    await prisma.role.upsert({
      where:  { key: r.key },
      create: { ...r, permissions: [], createdAt: now, updatedAt: now },
      update: {}, // never overwrite admin-edited names/permissions
    });
  }
  console.log(`Seeded ${BUILTIN_ROLES.length} built-in roles.`);

  // Seed admin user
  const existingAdmin = await prisma.user.findUnique({ where: { email } });
  if (existingAdmin) {
    console.log(`Admin user ${email} already exists — skipping.`);
  } else {
    const hashedPassword = await hashPassword(password);
    const userId = crypto.randomUUID();

    await prisma.$transaction([
      prisma.user.create({
        data: {
          id: userId,
          name: "Admin",
          email,
          emailVerified: false,
          role: "admin",
          createdAt: now,
          updatedAt: now,
        },
      }),
      prisma.account.create({
        data: {
          id: crypto.randomUUID(),
          accountId: userId,
          providerId: "credential",
          userId,
          password: hashedPassword,
          createdAt: now,
          updatedAt: now,
        },
      }),
    ]);
    console.log(`Admin user ${email} created successfully.`);
  }

  // Seed AI agent user
  const existingAI = await prisma.user.findUnique({
    where: { id: AI_AGENT_ID },
  });
  if (existingAI) {
    console.log("AI agent user already exists — skipping.");
  } else {
    await prisma.user.create({
      data: {
        id: AI_AGENT_ID,
        name: "AI",
        email: "ai@helpdesk.local",
        emailVerified: false,
        role: "agent",
        createdAt: now,
        updatedAt: now,
      },
    });
    console.log("AI agent user created successfully.");
  }

  // ── Seed curated SavedReport records ───────────────────────────────────────
  //
  // These are admin-owned, isCurated=true reports that appear in the Library
  // for all users to browse and clone. They are never modifiable by regular users.

  // Get the admin user created above (or the existing one) for ownership
  const adminUser = await prisma.user.findUnique({ where: { email } });

  if (adminUser) {
    const CURATED: {
      name: string;
      description: string;
      config: object;
    }[] = [
      {
        name: "Service Desk Overview",
        description:
          "Executive snapshot of service desk health — volume, SLA, response and resolution speed, AI deflection, backlog, and the longest-waiting open tickets.",
        config: {
          dateRange: { preset: "last_30_days" },
          layout: "grid",
          widgets: [
            // KPI strip — eight headline metrics
            { id: "w_sdo_k1",  metricId: "tickets.volume",                visualization: "number",         limit: 10, compareWithPrevious: true,  x: 0, y: 0,  w: 3, h: 2 },
            { id: "w_sdo_k2",  metricId: "tickets.sla_compliance",        visualization: "number",         limit: 10, compareWithPrevious: true,  x: 3, y: 0,  w: 3, h: 2 },
            { id: "w_sdo_k3",  metricId: "tickets.fcr",                   visualization: "number",         limit: 10, compareWithPrevious: false, x: 6, y: 0,  w: 3, h: 2 },
            { id: "w_sdo_k4",  metricId: "tickets.ai_resolution_rate",    visualization: "number",         limit: 10, compareWithPrevious: false, x: 9, y: 0,  w: 3, h: 2 },
            { id: "w_sdo_k5",  metricId: "tickets.first_response_time",   visualization: "number",         limit: 10, compareWithPrevious: true,  x: 0, y: 2,  w: 3, h: 2 },
            { id: "w_sdo_k6",  metricId: "tickets.resolution_time",       visualization: "number",         limit: 10, compareWithPrevious: true,  x: 3, y: 2,  w: 3, h: 2 },
            { id: "w_sdo_k7",  metricId: "tickets.overdue",               visualization: "number",         limit: 10, compareWithPrevious: false, x: 6, y: 2,  w: 3, h: 2 },
            { id: "w_sdo_k8",  metricId: "tickets.assigned_not_replied",  visualization: "number",         limit: 10, compareWithPrevious: false, x: 9, y: 2,  w: 3, h: 2 },
            // Trends
            { id: "w_sdo_t1",  metricId: "tickets.volume",                visualization: "line",           limit: 50, compareWithPrevious: false, x: 0, y: 4,  w: 8, h: 3 },
            { id: "w_sdo_d1",  metricId: "tickets.priority_distribution", visualization: "donut",          limit: 10, compareWithPrevious: false, x: 8, y: 4,  w: 4, h: 3 },
            { id: "w_sdo_t2",  metricId: "tickets.backlog",               visualization: "area",           limit: 50, compareWithPrevious: false, x: 0, y: 7,  w: 8, h: 3 },
            { id: "w_sdo_d2",  metricId: "tickets.status_distribution",   visualization: "donut",          limit: 10, compareWithPrevious: false, x: 8, y: 7,  w: 4, h: 3 },
            // Breakdowns
            { id: "w_sdo_b1",  metricId: "tickets.aging",                 visualization: "histogram",      limit: 10, compareWithPrevious: false, x: 0, y: 10, w: 4, h: 4 },
            { id: "w_sdo_b2",  metricId: "tickets.by_team",               visualization: "bar_horizontal", limit: 10, compareWithPrevious: false, x: 4, y: 10, w: 4, h: 4 },
            { id: "w_sdo_b3",  metricId: "tickets.by_agent",              visualization: "bar_horizontal", limit: 10, compareWithPrevious: false, x: 8, y: 10, w: 4, h: 4 },
            // Operational table
            { id: "w_sdo_tbl", metricId: "tickets.top_open",              visualization: "table",          limit: 10, compareWithPrevious: false, x: 0, y: 14, w: 12, h: 4 },
          ],
        },
      },
      {
        name: "Ticket Performance Deep-Dive",
        description:
          "Volume and backlog trends, resolution-time and aging histograms, and category, priority, team and agent breakdowns of ticket flow.",
        config: {
          dateRange: { preset: "last_30_days" },
          layout: "grid",
          widgets: [
            // KPI strip
            { id: "w_tp_k1", metricId: "tickets.volume",                visualization: "number",         limit: 10, compareWithPrevious: true,  x: 0, y: 0,  w: 3, h: 2 },
            { id: "w_tp_k2", metricId: "tickets.fcr",                   visualization: "number",         limit: 10, compareWithPrevious: false, x: 3, y: 0,  w: 3, h: 2 },
            { id: "w_tp_k3", metricId: "tickets.resolution_time",       visualization: "number",         limit: 10, compareWithPrevious: true,  x: 6, y: 0,  w: 3, h: 2 },
            { id: "w_tp_k4", metricId: "tickets.first_response_time",   visualization: "number",         limit: 10, compareWithPrevious: true,  x: 9, y: 0,  w: 3, h: 2 },
            // Trends
            { id: "w_tp_t1", metricId: "tickets.volume",                visualization: "line",           limit: 50, compareWithPrevious: false, x: 0, y: 2,  w: 12, h: 3 },
            { id: "w_tp_t2", metricId: "tickets.backlog",               visualization: "area",           limit: 50, compareWithPrevious: false, x: 0, y: 5,  w: 12, h: 3 },
            // Distributions
            { id: "w_tp_h1", metricId: "tickets.resolution_time",       visualization: "histogram",      limit: 50, compareWithPrevious: false, x: 0, y: 8,  w: 6, h: 4 },
            { id: "w_tp_h2", metricId: "tickets.aging",                 visualization: "histogram",      limit: 50, compareWithPrevious: false, x: 6, y: 8,  w: 6, h: 4 },
            // Breakdowns
            { id: "w_tp_d1", metricId: "tickets.priority_distribution", visualization: "donut",          limit: 10, compareWithPrevious: false, x: 0, y: 12, w: 4, h: 4 },
            { id: "w_tp_d2", metricId: "tickets.status_distribution",   visualization: "donut",          limit: 10, compareWithPrevious: false, x: 4, y: 12, w: 4, h: 4 },
            { id: "w_tp_d3", metricId: "tickets.by_team",               visualization: "bar_horizontal", limit: 10, compareWithPrevious: false, x: 8, y: 12, w: 4, h: 4 },
            { id: "w_tp_d4", metricId: "tickets.by_agent",              visualization: "bar_horizontal", limit: 10, compareWithPrevious: false, x: 0, y: 16, w: 6, h: 4 },
            // Operational
            { id: "w_tp_tbl",metricId: "tickets.top_open",              visualization: "table",          limit: 10, compareWithPrevious: false, x: 6, y: 16, w: 6, h: 4 },
          ],
        },
      },
      {
        name: "SLA Health Report",
        description:
          "SLA compliance across tickets and incidents — overall, by priority, category and team, plus agent leaderboard and currently breached or at-risk tickets.",
        config: {
          dateRange: { preset: "last_30_days" },
          layout: "grid",
          widgets: [
            // KPI strip — SLA + incident SLA + live operational
            { id: "w_sla_k1", metricId: "tickets.sla_compliance",      visualization: "number",         limit: 10, compareWithPrevious: true,  x: 0, y: 0,  w: 3, h: 2 },
            { id: "w_sla_k2", metricId: "incidents.sla_compliance",    visualization: "number",         limit: 10, compareWithPrevious: false, x: 3, y: 0,  w: 3, h: 2 },
            { id: "w_sla_k3", metricId: "tickets.overdue",             visualization: "number",         limit: 10, compareWithPrevious: false, x: 6, y: 0,  w: 3, h: 2 },
            { id: "w_sla_k4", metricId: "tickets.assigned_not_replied",visualization: "number",         limit: 10, compareWithPrevious: false, x: 9, y: 0,  w: 3, h: 2 },
            // Secondary KPIs — speed
            { id: "w_sla_k5", metricId: "tickets.first_response_time", visualization: "number",         limit: 10, compareWithPrevious: true,  x: 0, y: 2,  w: 3, h: 2 },
            { id: "w_sla_k6", metricId: "tickets.resolution_time",     visualization: "number",         limit: 10, compareWithPrevious: true,  x: 3, y: 2,  w: 3, h: 2 },
            { id: "w_sla_k7", metricId: "incidents.mttr",              visualization: "number",         limit: 10, compareWithPrevious: true,  x: 6, y: 2,  w: 3, h: 2 },
            { id: "w_sla_k8", metricId: "tickets.fcr",                 visualization: "number",         limit: 10, compareWithPrevious: false, x: 9, y: 2,  w: 3, h: 2 },
            // SLA breakdowns
            { id: "w_sla_b1", metricId: "tickets.sla_compliance",      visualization: "bar_horizontal", limit: 10, compareWithPrevious: false, x: 0, y: 4,  w: 6, h: 4, groupBy: "priority" },
            { id: "w_sla_b2", metricId: "tickets.sla_compliance",      visualization: "bar_horizontal", limit: 10, compareWithPrevious: false, x: 6, y: 4,  w: 6, h: 4, groupBy: "team" },
            { id: "w_sla_b3", metricId: "tickets.sla_compliance",      visualization: "bar_horizontal", limit: 10, compareWithPrevious: false, x: 0, y: 8,  w: 6, h: 4, groupBy: "category" },
            { id: "w_sla_b4", metricId: "agent.sla_compliance",        visualization: "bar_horizontal", limit: 10, compareWithPrevious: false, x: 6, y: 8,  w: 6, h: 4 },
            // Agent leaderboard + outstanding tickets
            { id: "w_sla_lb", metricId: "agent.sla_compliance",        visualization: "leaderboard",    limit: 10, compareWithPrevious: false, x: 0, y: 12, w: 12, h: 5 },
            { id: "w_sla_tbl",metricId: "tickets.top_open",            visualization: "table",          limit: 10, compareWithPrevious: false, x: 0, y: 17, w: 12, h: 4 },
          ],
        },
      },
      {
        name: "Agent Performance",
        description:
          "Comprehensive agent scorecard — overview, productivity, SLA, workload & backlog, quality, period-over-period trends, and per-agent leaderboards.",
        config: {
          dateRange: { preset: "last_30_days" },
          layout: "grid",
          widgets: [
            // ── 1. Agent Performance Overview ──────────────────────────────
            { id: "w_ag_o1", title: "Total Tickets",      metricId: "tickets.volume",             visualization: "number",      limit: 10, compareWithPrevious: true,  x: 0, y: 0,  w: 3, h: 2 },
            { id: "w_ag_o2", title: "Resolved",           metricId: "tickets.resolved",           visualization: "number",      limit: 10, compareWithPrevious: true,  x: 3, y: 0,  w: 3, h: 2 },
            { id: "w_ag_o3", title: "Open",               metricId: "realtime.open_tickets",      visualization: "number",      limit: 10, compareWithPrevious: false, x: 6, y: 0,  w: 3, h: 2 },
            { id: "w_ag_o4", title: "SLA Compliance",     metricId: "tickets.sla_compliance",     visualization: "number",      limit: 10, compareWithPrevious: true,  x: 9, y: 0,  w: 3, h: 2 },
            { id: "w_ag_o5", title: "Avg First Response", metricId: "tickets.first_response_time",visualization: "number",      limit: 10, compareWithPrevious: true,  x: 0, y: 2,  w: 3, h: 2 },
            { id: "w_ag_o6", title: "Avg Resolution",     metricId: "tickets.resolution_time",    visualization: "number",      limit: 10, compareWithPrevious: true,  x: 3, y: 2,  w: 3, h: 2 },
            { id: "w_ag_o7", title: "CSAT",               metricId: "csat.avg_score",             visualization: "number",      limit: 10, compareWithPrevious: true,  x: 6, y: 2,  w: 3, h: 2 },
            { id: "w_ag_o8", title: "Reopen Rate",        metricId: "tickets.reopen_rate",        visualization: "number",      limit: 10, compareWithPrevious: false, x: 9, y: 2,  w: 3, h: 2 },

            // ── 2. Productivity ────────────────────────────────────────────
            { id: "w_ag_p1", title: "Tickets Assigned",   metricId: "tickets.assigned_count",     visualization: "number",      limit: 10, compareWithPrevious: false, x: 0, y: 4,  w: 3, h: 2 },
            { id: "w_ag_p2", title: "Resolved",           metricId: "tickets.resolved",           visualization: "number",      limit: 10, compareWithPrevious: false, x: 3, y: 4,  w: 3, h: 2 },
            { id: "w_ag_p3", title: "Resolution Rate",    metricId: "tickets.resolution_rate",    visualization: "number",      limit: 10, compareWithPrevious: false, x: 6, y: 4,  w: 3, h: 2 },
            { id: "w_ag_p4", title: "First Contact Resolution", metricId: "tickets.fcr",          visualization: "number",      limit: 10, compareWithPrevious: false, x: 9, y: 4,  w: 3, h: 2 },
            { id: "w_ag_p5", title: "Escalation Rate",    metricId: "tickets.escalation_rate",    visualization: "number",      limit: 10, compareWithPrevious: false, x: 0, y: 6,  w: 3, h: 2 },
            { id: "w_ag_p6", title: "Escalated",          metricId: "tickets.escalated_count",    visualization: "number",      limit: 10, compareWithPrevious: false, x: 3, y: 6,  w: 3, h: 2 },
            { id: "w_ag_p7", title: "AI Auto-Resolved",   metricId: "tickets.ai_resolution_rate", visualization: "number",      limit: 10, compareWithPrevious: false, x: 6, y: 6,  w: 3, h: 2 },
            { id: "w_ag_p8", title: "Reopened",           metricId: "tickets.reopened_count",     visualization: "number",      limit: 10, compareWithPrevious: false, x: 9, y: 6,  w: 3, h: 2 },

            // ── 3. SLA Performance ─────────────────────────────────────────
            { id: "w_ag_s1", title: "SLA Met",            metricId: "tickets.sla_met_count",      visualization: "number",      limit: 10, compareWithPrevious: false, x: 0, y: 8,  w: 3, h: 2 },
            { id: "w_ag_s2", title: "SLA Breached",       metricId: "tickets.sla_breached_count", visualization: "number",      limit: 10, compareWithPrevious: false, x: 3, y: 8,  w: 3, h: 2 },
            { id: "w_ag_s3", title: "At-Risk Tickets",    metricId: "realtime.sla_at_risk",       visualization: "number",      limit: 10, compareWithPrevious: false, x: 6, y: 8,  w: 3, h: 2 },
            { id: "w_ag_s4", title: "SLA Compliance %",   metricId: "tickets.sla_compliance",     visualization: "number",      limit: 10, compareWithPrevious: true,  x: 9, y: 8,  w: 3, h: 2 },

            // ── 4. Workload & Backlog ──────────────────────────────────────
            { id: "w_ag_w1", title: "Open",               metricId: "realtime.open_tickets",      visualization: "number",      limit: 10, compareWithPrevious: false, x: 0, y: 10, w: 3, h: 2 },
            { id: "w_ag_w2", title: "In Progress",        metricId: "tickets.in_progress",        visualization: "number",      limit: 10, compareWithPrevious: false, x: 3, y: 10, w: 3, h: 2 },
            { id: "w_ag_w3", title: "Overdue",            metricId: "tickets.overdue",            visualization: "number",      limit: 10, compareWithPrevious: false, x: 6, y: 10, w: 3, h: 2 },
            { id: "w_ag_w4", title: "Oldest Ticket",      metricId: "tickets.oldest_open",        visualization: "number",      limit: 10, compareWithPrevious: false, x: 9, y: 10, w: 3, h: 2 },
            { id: "w_ag_w5", title: "Aging Backlog",      metricId: "tickets.aging",              visualization: "histogram",   limit: 10, compareWithPrevious: false, x: 0, y: 12, w: 12, h: 4 },

            // ── 5. Quality ─────────────────────────────────────────────────
            { id: "w_ag_q1", title: "CSAT",               metricId: "csat.avg_score",             visualization: "number",      limit: 10, compareWithPrevious: true,  x: 0, y: 16, w: 3, h: 2 },
            { id: "w_ag_q2", title: "Ratings Count",      metricId: "csat.ratings_count",         visualization: "number",      limit: 10, compareWithPrevious: false, x: 3, y: 16, w: 3, h: 2 },
            { id: "w_ag_q3", title: "Reopened Tickets",   metricId: "tickets.reopened_count",     visualization: "number",      limit: 10, compareWithPrevious: false, x: 6, y: 16, w: 3, h: 2 },
            { id: "w_ag_q4", title: "QA Score",           metricId: "qa.score",                   visualization: "number",      limit: 10, compareWithPrevious: false, x: 9, y: 16, w: 3, h: 2 },

            // ── 6. Trends — period-over-period & time-series ───────────────
            { id: "w_ag_tr1", title: "Resolved Trend",        metricId: "tickets.resolved_trend",     visualization: "line", limit: 50, compareWithPrevious: false, x: 0, y: 18, w: 6, h: 4 },
            { id: "w_ag_tr2", title: "SLA Trend",             metricId: "tickets.sla_trend",          visualization: "line", limit: 50, compareWithPrevious: false, x: 6, y: 18, w: 6, h: 4 },
            { id: "w_ag_tr3", title: "CSAT Trend",            metricId: "csat.trend",                 visualization: "line", limit: 50, compareWithPrevious: false, x: 0, y: 22, w: 6, h: 4 },
            { id: "w_ag_tr4", title: "Agent Volume Trend",    metricId: "agent.volume_trend",         visualization: "line", limit: 50, compareWithPrevious: false, x: 6, y: 22, w: 6, h: 4 },
            // Period-vs-previous comparison strip
            { id: "w_ag_tr5", title: "Volume vs Previous",    metricId: "tickets.volume",             visualization: "number",limit: 10, compareWithPrevious: true,  x: 0, y: 26, w: 3, h: 2 },
            { id: "w_ag_tr6", title: "Resolved vs Previous",  metricId: "tickets.resolved",           visualization: "number",limit: 10, compareWithPrevious: true,  x: 3, y: 26, w: 3, h: 2 },
            { id: "w_ag_tr7", title: "SLA vs Previous",       metricId: "tickets.sla_compliance",     visualization: "number",limit: 10, compareWithPrevious: true,  x: 6, y: 26, w: 3, h: 2 },
            { id: "w_ag_tr8", title: "CSAT vs Previous",      metricId: "csat.avg_score",             visualization: "number",limit: 10, compareWithPrevious: true,  x: 9, y: 26, w: 3, h: 2 },

            // ── Per-agent leaderboards ─────────────────────────────────────
            { id: "w_ag_l1", metricId: "agent.tickets_resolved",    visualization: "leaderboard", limit: 10, compareWithPrevious: false, x: 0, y: 28, w: 6, h: 5 },
            { id: "w_ag_l2", metricId: "agent.workload",            visualization: "leaderboard", limit: 10, compareWithPrevious: false, x: 6, y: 28, w: 6, h: 5 },
            { id: "w_ag_l3", metricId: "agent.avg_resolution_time", visualization: "leaderboard", limit: 10, compareWithPrevious: false, x: 0, y: 33, w: 6, h: 5 },
            { id: "w_ag_l4", metricId: "agent.first_response_time", visualization: "leaderboard", limit: 10, compareWithPrevious: false, x: 6, y: 33, w: 6, h: 5 },
            { id: "w_ag_l5", metricId: "agent.csat_score",          visualization: "leaderboard", limit: 10, compareWithPrevious: false, x: 0, y: 38, w: 6, h: 5 },
            { id: "w_ag_l6", metricId: "agent.sla_compliance",      visualization: "leaderboard", limit: 10, compareWithPrevious: false, x: 6, y: 38, w: 6, h: 5 },
            { id: "w_ag_l7", metricId: "agent.fcr_rate",            visualization: "leaderboard", limit: 10, compareWithPrevious: false, x: 0, y: 43, w: 6, h: 5 },
            { id: "w_ag_l8", metricId: "team.tickets_resolved",     visualization: "leaderboard", limit: 10, compareWithPrevious: false, x: 6, y: 43, w: 6, h: 5 },
            { id: "w_ag_l9", metricId: "team.csat_score",           visualization: "leaderboard", limit: 10, compareWithPrevious: false, x: 0, y: 48, w: 12, h: 5 },
          ],
        },
      },
      {
        name: "CSAT & Quality",
        description:
          "Customer satisfaction trend and rating distribution, FCR and resolution speed, plus per-agent and per-team CSAT leaderboards.",
        config: {
          dateRange: { preset: "last_30_days" },
          layout: "grid",
          widgets: [
            // KPI strip
            { id: "w_cs_k1", metricId: "csat.avg_score",              visualization: "number",      limit: 10, compareWithPrevious: true,  x: 0, y: 0,  w: 3, h: 2 },
            { id: "w_cs_k2", metricId: "tickets.fcr",                 visualization: "number",      limit: 10, compareWithPrevious: false, x: 3, y: 0,  w: 3, h: 2 },
            { id: "w_cs_k3", metricId: "tickets.resolution_time",     visualization: "number",      limit: 10, compareWithPrevious: true,  x: 6, y: 0,  w: 3, h: 2 },
            { id: "w_cs_k4", metricId: "tickets.first_response_time", visualization: "number",      limit: 10, compareWithPrevious: true,  x: 9, y: 0,  w: 3, h: 2 },
            // Trend + distribution
            { id: "w_cs_t1", metricId: "csat.trend",                  visualization: "line",        limit: 50, compareWithPrevious: false, x: 0, y: 2,  w: 8, h: 3 },
            { id: "w_cs_d1", metricId: "csat.distribution",           visualization: "histogram",   limit: 10, compareWithPrevious: false, x: 8, y: 2,  w: 4, h: 3 },
            // Quality cross-checks
            { id: "w_cs_d2", metricId: "tickets.priority_distribution", visualization: "donut",     limit: 10, compareWithPrevious: false, x: 0, y: 5,  w: 4, h: 4 },
            { id: "w_cs_d3", metricId: "tickets.status_distribution",   visualization: "donut",     limit: 10, compareWithPrevious: false, x: 4, y: 5,  w: 4, h: 4 },
            { id: "w_cs_h1", metricId: "tickets.resolution_time",     visualization: "histogram",   limit: 50, compareWithPrevious: false, x: 8, y: 5,  w: 4, h: 4 },
            // Leaderboards
            { id: "w_cs_l1", metricId: "agent.csat_score",            visualization: "leaderboard", limit: 10, compareWithPrevious: false, x: 0, y: 9,  w: 6, h: 5 },
            { id: "w_cs_l2", metricId: "team.csat_score",             visualization: "leaderboard", limit: 10, compareWithPrevious: false, x: 6, y: 9,  w: 6, h: 5 },
            { id: "w_cs_l3", metricId: "agent.fcr_rate",              visualization: "leaderboard", limit: 10, compareWithPrevious: false, x: 0, y: 14, w: 12, h: 5 },
          ],
        },
      },
      {
        name: "ITSM Operations",
        description:
          "End-to-end ITIL operations view — incident MTTA/MTTR, change success and risk profile, problem recurrence, approval turnaround, and request fulfillment.",
        config: {
          dateRange: { preset: "last_30_days" },
          layout: "grid",
          widgets: [
            // Top KPIs — incidents + changes
            { id: "w_it_k1", metricId: "incidents.mtta",            visualization: "number",         limit: 10, compareWithPrevious: true,  x: 0, y: 0,  w: 3, h: 2 },
            { id: "w_it_k2", metricId: "incidents.mttr",            visualization: "number",         limit: 10, compareWithPrevious: true,  x: 3, y: 0,  w: 3, h: 2 },
            { id: "w_it_k3", metricId: "incidents.major_count",     visualization: "number",         limit: 10, compareWithPrevious: false, x: 6, y: 0,  w: 3, h: 2 },
            { id: "w_it_k4", metricId: "incidents.sla_compliance",  visualization: "number",         limit: 10, compareWithPrevious: false, x: 9, y: 0,  w: 3, h: 2 },
            // Bottom KPIs — changes / problems / approvals / requests
            { id: "w_it_k5", metricId: "changes.success_rate",      visualization: "number",         limit: 10, compareWithPrevious: false, x: 0, y: 2,  w: 3, h: 2 },
            { id: "w_it_k6", metricId: "changes.approval_time",     visualization: "number",         limit: 10, compareWithPrevious: false, x: 3, y: 2,  w: 3, h: 2 },
            { id: "w_it_k7", metricId: "approvals.turnaround_time", visualization: "number",         limit: 10, compareWithPrevious: false, x: 6, y: 2,  w: 3, h: 2 },
            { id: "w_it_k8", metricId: "requests.fulfillment_time", visualization: "number",         limit: 10, compareWithPrevious: false, x: 9, y: 2,  w: 3, h: 2 },
            // Problem KPIs
            { id: "w_it_k9", metricId: "problems.volume",           visualization: "number",         limit: 10, compareWithPrevious: false, x: 0, y: 4,  w: 3, h: 2 },
            { id: "w_it_kA", metricId: "problems.recurring",        visualization: "number",         limit: 10, compareWithPrevious: false, x: 3, y: 4,  w: 3, h: 2 },
            { id: "w_it_kB", metricId: "problems.known_errors",     visualization: "number",         limit: 10, compareWithPrevious: false, x: 6, y: 4,  w: 3, h: 2 },
            { id: "w_it_kC", metricId: "requests.sla_compliance",   visualization: "number",         limit: 10, compareWithPrevious: false, x: 9, y: 4,  w: 3, h: 2 },
            // Volume trends
            { id: "w_it_t1", metricId: "incidents.volume",          visualization: "area",           limit: 50, compareWithPrevious: false, x: 0, y: 6,  w: 6, h: 3 },
            { id: "w_it_t2", metricId: "changes.volume",            visualization: "bar",            limit: 50, compareWithPrevious: false, x: 6, y: 6,  w: 6, h: 3 },
            { id: "w_it_t3", metricId: "requests.volume",           visualization: "line",           limit: 50, compareWithPrevious: false, x: 0, y: 9,  w: 6, h: 3 },
            { id: "w_it_t4", metricId: "approvals.volume",          visualization: "bar",            limit: 50, compareWithPrevious: false, x: 6, y: 9,  w: 6, h: 3 },
            // Distributions + queues
            { id: "w_it_d1", metricId: "changes.by_risk",           visualization: "donut",          limit: 10, compareWithPrevious: false, x: 0, y: 12, w: 4, h: 4 },
            { id: "w_it_d2", metricId: "changes.by_type",           visualization: "donut",          limit: 10, compareWithPrevious: false, x: 4, y: 12, w: 4, h: 4 },
            { id: "w_it_d3", metricId: "requests.top_items",        visualization: "leaderboard",    limit: 10, compareWithPrevious: false, x: 8, y: 12, w: 4, h: 4 },
            { id: "w_it_q1", metricId: "approvals.pending_queue",   visualization: "table",          limit: 10, compareWithPrevious: false, x: 0, y: 16, w: 12, h: 4 },
          ],
        },
      },
      {
        name: "Knowledge Base Performance",
        description:
          "Article inventory, view trends, helpfulness, publishing cadence, top viewed and most helpful articles, with FCR as a self-service success proxy.",
        config: {
          dateRange: { preset: "last_30_days" },
          layout: "grid",
          widgets: [
            // KPI strip
            { id: "w_kb_k1", metricId: "kb.article_count",  visualization: "number",      limit: 10, compareWithPrevious: false, x: 0, y: 0,  w: 3, h: 2 },
            { id: "w_kb_k2", metricId: "kb.view_count",     visualization: "number",      limit: 10, compareWithPrevious: false, x: 3, y: 0,  w: 3, h: 2 },
            { id: "w_kb_k3", metricId: "kb.helpful_ratio",  visualization: "number",      limit: 10, compareWithPrevious: false, x: 6, y: 0,  w: 3, h: 2 },
            { id: "w_kb_k4", metricId: "tickets.fcr",       visualization: "number",      limit: 10, compareWithPrevious: false, x: 9, y: 0,  w: 3, h: 2 },
            // Inventory mix + trends
            { id: "w_kb_d1", metricId: "kb.article_count",  visualization: "donut",       limit: 10, compareWithPrevious: false, x: 0, y: 2,  w: 4, h: 4 },
            { id: "w_kb_t1", metricId: "kb.feedback_trend", visualization: "line",        limit: 50, compareWithPrevious: false, x: 4, y: 2,  w: 8, h: 4 },
            { id: "w_kb_t2", metricId: "kb.published_trend",visualization: "bar",         limit: 50, compareWithPrevious: false, x: 0, y: 6,  w: 12, h: 3 },
            // Leaderboards
            { id: "w_kb_l1", metricId: "kb.top_articles",   visualization: "leaderboard", limit: 10, compareWithPrevious: false, x: 0, y: 9,  w: 6, h: 5 },
            { id: "w_kb_l2", metricId: "kb.most_helpful",   visualization: "leaderboard", limit: 10, compareWithPrevious: false, x: 6, y: 9,  w: 6, h: 5 },
            { id: "w_kb_l3", metricId: "kb.top_articles",   visualization: "table",       limit: 10, compareWithPrevious: false, x: 0, y: 14, w: 12, h: 5 },
          ],
        },
      },
    ];

    for (const r of CURATED) {
      const existing = await prisma.savedReport.findFirst({
        where: { isCurated: true, name: r.name },
      });
      if (existing) {
        await prisma.savedReport.update({
          where: { id: existing.id },
          data: {
            description: r.description,
            config:      r.config,
          },
        });
        console.log(`Curated report "${r.name}" updated.`);
        continue;
      }
      await prisma.savedReport.create({
        data: {
          name:        r.name,
          description: r.description,
          config:      r.config,
          visibility:  "org",
          ownerId:     adminUser.id,
          isCurated:   true,
        },
      });
      console.log(`Curated report "${r.name}" created.`);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
