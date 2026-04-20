import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { Role } from "../src/generated/prisma/client";
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
          role: Role.admin,
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
        role: Role.agent,
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
          "Core ticket health: volume, SLA compliance, first response, resolution times, and escalation stats.",
        config: {
          dateRange: { preset: "last_30_days" },
          layout: "grid",
          widgets: [
            { id: "w_curated_1",  metricId: "tickets.volume",             visualization: "line",         limit: 50, compareWithPrevious: false, x: 0,  y: 0,  w: 8, h: 3 },
            { id: "w_curated_2",  metricId: "tickets.sla_compliance",     visualization: "number",       limit: 10, compareWithPrevious: true,  x: 8,  y: 0,  w: 4, h: 3 },
            { id: "w_curated_3",  metricId: "tickets.first_response_time",visualization: "number",       limit: 10, compareWithPrevious: true,  x: 0,  y: 3,  w: 3, h: 2 },
            { id: "w_curated_4",  metricId: "tickets.resolution_time",    visualization: "number",       limit: 10, compareWithPrevious: true,  x: 3,  y: 3,  w: 3, h: 2 },
            { id: "w_curated_5",  metricId: "tickets.fcr",                visualization: "number",       limit: 10, compareWithPrevious: false, x: 6,  y: 3,  w: 3, h: 2 },
            { id: "w_curated_6",  metricId: "tickets.ai_resolution_rate", visualization: "number",       limit: 10, compareWithPrevious: false, x: 9,  y: 3,  w: 3, h: 2 },
            { id: "w_curated_7",  metricId: "tickets.status_distribution",visualization: "donut",        limit: 10, compareWithPrevious: false, x: 0,  y: 5,  w: 4, h: 4 },
            { id: "w_curated_8",  metricId: "tickets.priority_distribution",visualization: "donut",      limit: 10, compareWithPrevious: false, x: 4,  y: 5,  w: 4, h: 4 },
            { id: "w_curated_9",  metricId: "tickets.aging",              visualization: "histogram",    limit: 10, compareWithPrevious: false, x: 8,  y: 5,  w: 4, h: 4 },
            { id: "w_curated_10", metricId: "tickets.top_open",           visualization: "table",        limit: 10, compareWithPrevious: false, x: 0,  y: 9,  w: 12, h: 4 },
          ],
        },
      },
      {
        name: "Ticket Performance Deep-Dive",
        description:
          "Volume trend, backlog growth, category and priority breakdowns, and resolution distribution histogram.",
        config: {
          dateRange: { preset: "last_30_days" },
          layout: "grid",
          widgets: [
            { id: "w_tp_1", metricId: "tickets.backlog",            visualization: "line",      limit: 50, compareWithPrevious: false, x: 0, y: 0, w: 12, h: 3 },
            { id: "w_tp_2", metricId: "tickets.volume",             visualization: "bar",       limit: 50, compareWithPrevious: false, x: 0, y: 3, w: 8,  h: 3 },
            { id: "w_tp_3", metricId: "tickets.by_team",            visualization: "bar_horizontal", limit: 10, compareWithPrevious: false, x: 8, y: 3, w: 4, h: 3 },
            { id: "w_tp_4", metricId: "tickets.resolution_time",    visualization: "histogram", limit: 50, compareWithPrevious: false, x: 0, y: 6, w: 6,  h: 4 },
            { id: "w_tp_5", metricId: "tickets.by_agent",           visualization: "bar_horizontal", limit: 10, compareWithPrevious: false, x: 6, y: 6, w: 6, h: 4 },
          ],
        },
      },
      {
        name: "SLA Health Report",
        description:
          "SLA compliance rates by priority, category, and team. Agent leaderboard with breach counts.",
        config: {
          dateRange: { preset: "last_30_days" },
          layout: "grid",
          widgets: [
            { id: "w_sla_1", metricId: "tickets.sla_compliance",     visualization: "number",       limit: 10, compareWithPrevious: true,  x: 0, y: 0, w: 4,  h: 2 },
            { id: "w_sla_2", metricId: "tickets.overdue",            visualization: "number",       limit: 10, compareWithPrevious: false, x: 4, y: 0, w: 4,  h: 2 },
            { id: "w_sla_3", metricId: "tickets.assigned_not_replied",visualization: "number",       limit: 10, compareWithPrevious: false, x: 8, y: 0, w: 4,  h: 2 },
            { id: "w_sla_4", metricId: "tickets.sla_compliance",     visualization: "bar_horizontal",limit: 10, compareWithPrevious: false, x: 0, y: 2, w: 6,  h: 4, groupBy: "priority" },
            { id: "w_sla_5", metricId: "tickets.sla_compliance",     visualization: "bar_horizontal",limit: 10, compareWithPrevious: false, x: 6, y: 2, w: 6,  h: 4, groupBy: "team" },
            { id: "w_sla_6", metricId: "agent.sla_compliance",       visualization: "leaderboard",  limit: 10, compareWithPrevious: false, x: 0, y: 6, w: 12, h: 5 },
          ],
        },
      },
      {
        name: "Agent Performance",
        description:
          "Per-agent tickets resolved, first response speed, CSAT scores, and FCR rates.",
        config: {
          dateRange: { preset: "last_30_days" },
          layout: "grid",
          widgets: [
            { id: "w_ag_1", metricId: "agent.tickets_resolved",      visualization: "leaderboard", limit: 10, compareWithPrevious: false, x: 0, y: 0, w: 6, h: 5 },
            { id: "w_ag_2", metricId: "agent.workload",              visualization: "leaderboard", limit: 10, compareWithPrevious: false, x: 6, y: 0, w: 6, h: 5 },
            { id: "w_ag_3", metricId: "agent.avg_resolution_time",   visualization: "leaderboard", limit: 10, compareWithPrevious: false, x: 0, y: 5, w: 4, h: 5 },
            { id: "w_ag_4", metricId: "agent.first_response_time",   visualization: "leaderboard", limit: 10, compareWithPrevious: false, x: 4, y: 5, w: 4, h: 5 },
            { id: "w_ag_5", metricId: "agent.csat_score",            visualization: "leaderboard", limit: 10, compareWithPrevious: false, x: 8, y: 5, w: 4, h: 5 },
          ],
        },
      },
      {
        name: "CSAT & Quality",
        description: "Customer satisfaction trend, rating distribution, and agent CSAT leaderboard.",
        config: {
          dateRange: { preset: "last_30_days" },
          layout: "grid",
          widgets: [
            { id: "w_cs_1", metricId: "csat.avg_score",   visualization: "number",     limit: 10, compareWithPrevious: true,  x: 0, y: 0, w: 4,  h: 2 },
            { id: "w_cs_2", metricId: "tickets.fcr",      visualization: "number",     limit: 10, compareWithPrevious: true,  x: 4, y: 0, w: 4,  h: 2 },
            { id: "w_cs_3", metricId: "csat.trend",       visualization: "line",       limit: 50, compareWithPrevious: false, x: 0, y: 2, w: 8,  h: 3 },
            { id: "w_cs_4", metricId: "csat.distribution",visualization: "histogram",  limit: 10, compareWithPrevious: false, x: 8, y: 2, w: 4,  h: 3 },
            { id: "w_cs_5", metricId: "agent.csat_score", visualization: "leaderboard",limit: 10, compareWithPrevious: false, x: 0, y: 5, w: 12, h: 5 },
          ],
        },
      },
      {
        name: "ITSM Operations",
        description: "Incidents (MTTA/MTTR), change success rate, approval turnaround, problem recurrence.",
        config: {
          dateRange: { preset: "last_30_days" },
          layout: "grid",
          widgets: [
            { id: "w_it_1", metricId: "incidents.mtta",          visualization: "number", limit: 10, compareWithPrevious: true,  x: 0, y: 0, w: 3, h: 2 },
            { id: "w_it_2", metricId: "incidents.mttr",          visualization: "number", limit: 10, compareWithPrevious: true,  x: 3, y: 0, w: 3, h: 2 },
            { id: "w_it_3", metricId: "changes.success_rate",    visualization: "number", limit: 10, compareWithPrevious: false, x: 6, y: 0, w: 3, h: 2 },
            { id: "w_it_4", metricId: "changes.approval_time",   visualization: "number", limit: 10, compareWithPrevious: false, x: 9, y: 0, w: 3, h: 2 },
            { id: "w_it_5", metricId: "incidents.volume",        visualization: "area",   limit: 50, compareWithPrevious: false, x: 0, y: 2, w: 6, h: 3 },
            { id: "w_it_6", metricId: "changes.volume",          visualization: "bar",    limit: 50, compareWithPrevious: false, x: 6, y: 2, w: 6, h: 3 },
          ],
        },
      },
      {
        name: "Knowledge Base Performance",
        description: "Published article count, view trends, helpful vote ratio, and top articles.",
        config: {
          dateRange: { preset: "last_30_days" },
          layout: "grid",
          widgets: [
            { id: "w_kb_1", metricId: "kb.article_count",    visualization: "number",     limit: 10, compareWithPrevious: false, x: 0, y: 0, w: 3,  h: 2 },
            { id: "w_kb_2", metricId: "kb.view_count",       visualization: "number",     limit: 10, compareWithPrevious: false, x: 3, y: 0, w: 3,  h: 2 },
            { id: "w_kb_3", metricId: "kb.helpful_ratio",    visualization: "number",     limit: 10, compareWithPrevious: false, x: 6, y: 0, w: 3,  h: 2 },
            { id: "w_kb_4", metricId: "kb.feedback_trend",   visualization: "line",       limit: 50, compareWithPrevious: false, x: 0, y: 2, w: 8,  h: 3 },
            { id: "w_kb_5", metricId: "kb.top_articles",     visualization: "leaderboard",limit: 10, compareWithPrevious: false, x: 0, y: 5, w: 12, h: 5 },
          ],
        },
      },
    ];

    for (const r of CURATED) {
      const existing = await prisma.savedReport.findFirst({
        where: { isCurated: true, name: r.name },
      });
      if (existing) {
        console.log(`Curated report "${r.name}" already exists — skipping.`);
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
