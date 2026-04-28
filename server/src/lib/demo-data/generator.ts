/**
 * Demo Data Generator — modular, size-aware, progress-tracking engine.
 *
 * Each module is a standalone async function that reads from the shared
 * GeneratorContext (populated by earlier modules) and mutates it with
 * the IDs of newly created records.
 *
 * Progress is written to the DemoBatch row after each module so the UI
 * can poll for real-time status without SSE.
 *
 * Record numbering uses DEMO- prefixes so records are visually distinct
 * and never collide with real production numbering sequences.
 */

import { hashPassword } from "better-auth/crypto";
import prisma from "../../db";
import {
  type GeneratorConfig,
  type GeneratorContext,
  type ModuleKey,
  type BatchProgress,
  emptyContext,
  SIZE_PARAMS,
  contextToRecordIds,
  computeRecordCounts,
  ALL_MODULE_KEYS,
} from "./types";
import {
  take, pick, daysAgo, hoursAgo, pad, jitter,
  USER_POOL, TEAM_POOL, ORG_POOL, CUSTOMER_POOL,
  KB_CATEGORY_POOL, KB_ARTICLE_POOL,
  MACRO_POOL, CATALOG_ITEM_POOL, CATALOG_CATEGORY_POOL,
  TICKET_POOL, INCIDENT_POOL, REQUEST_POOL,
  PROBLEM_POOL, CHANGE_POOL, ASSET_POOL, CI_POOL,
} from "./data-pools";
import {
  SAAS_SUBSCRIPTION_POOL, SOFTWARE_LICENSE_POOL,
  TICKET_TYPE_POOL, TICKET_STATUS_POOL,
} from "./data-pools-extended";

// ── Progress helpers ──────────────────────────────────────────────────────────

async function markModuleRunning(batchId: number, module: ModuleKey, progress: BatchProgress) {
  progress[module] = { status: "running", count: 0, startedAt: new Date().toISOString() };
  await prisma.demoBatch.update({ where: { id: batchId }, data: { progress: progress as object } });
}

async function markModuleDone(batchId: number, module: ModuleKey, count: number, progress: BatchProgress) {
  progress[module] = {
    status: "done",
    count,
    startedAt: progress[module]?.startedAt,
    completedAt: new Date().toISOString(),
  };
  await prisma.demoBatch.update({ where: { id: batchId }, data: { progress: progress as object } });
}

async function markModuleError(batchId: number, module: ModuleKey, error: string, progress: BatchProgress) {
  progress[module] = {
    status: "error",
    count: progress[module]?.count ?? 0,
    startedAt: progress[module]?.startedAt,
    error,
  };
  await prisma.demoBatch.update({ where: { id: batchId }, data: { progress: progress as object } });
}

// ── Foundation: Users + Teams + Orgs + Customers ─────────────────────────────

const DEMO_PASSWORD = "Demo@Pass1";

async function generateFoundation(ctx: GeneratorContext, batchId: number, progress: BatchProgress): Promise<void> {
  await markModuleRunning(batchId, "foundation", progress);
  const hashedPw = await hashPassword(DEMO_PASSWORD);
  const now = new Date();
  const p = ctx.params;

  // Users
  for (const spec of take(USER_POOL, p.users)) {
    const existing = await prisma.user.findUnique({ where: { email: spec.email } });
    if (existing) { ctx.userIds.push(existing.id); }
    else {
      const id = crypto.randomUUID();
      await prisma.user.create({
        data: {
          id, name: spec.name, email: spec.email, emailVerified: false,
          role: spec.role, createdAt: now, updatedAt: now,
          preference: { create: { jobTitle: spec.title, phone: spec.phone, timezone: "America/New_York", language: "en", theme: "system", updatedAt: now } },
        },
      });
      await prisma.account.create({ data: { id: crypto.randomUUID(), accountId: id, providerId: "credential", userId: id, password: hashedPw, createdAt: now, updatedAt: now } });
      ctx.userIds.push(id);
    }
  }
  ctx.supervisorIds = ctx.userIds.filter((_, i) => USER_POOL[i]?.role === "supervisor");
  ctx.agentIds      = ctx.userIds.filter((_, i) => USER_POOL[i]?.role === "agent");

  // Teams
  for (const spec of take(TEAM_POOL, p.teams)) {
    const team = await prisma.team.create({
      data: {
        name: spec.name, description: spec.description, color: spec.color,
        members: {
          create: spec.memberIdxs
            .map((i) => ctx.userIds[i])
            .filter((id): id is string => id !== undefined)
            .map((userId) => ({ userId })),
        },
      },
    });
    ctx.teamIds.push(team.id);
  }

  // Organisations
  const orgPool = take(ORG_POOL, p.orgs);
  for (const spec of orgPool) {
    const org = await prisma.organization.create({ data: { name: spec.name, domain: spec.domain, industry: spec.industry, supportTier: spec.tier, isActive: true } });
    ctx.orgIds.push(org.id);
  }

  // Customers (clamp to available orgs)
  const custPool = take(CUSTOMER_POOL, p.customers);
  for (const spec of custPool) {
    const orgId = ctx.orgIds[spec.orgIdx % ctx.orgIds.length];
    if (!orgId) continue;
    const existing = await prisma.customer.findUnique({ where: { email: spec.email } });
    if (existing) { ctx.customerIds.push(existing.id); continue; }
    const c = await prisma.customer.create({ data: { name: spec.name, email: spec.email, jobTitle: spec.jobTitle, organizationId: orgId, supportTier: orgPool[spec.orgIdx % orgPool.length]?.tier ?? "standard", isVip: spec.isVip, timezone: "America/New_York", language: "en" } });
    ctx.customerIds.push(c.id);
  }

  const total = ctx.userIds.length + ctx.teamIds.length + ctx.orgIds.length + ctx.customerIds.length;
  await markModuleDone(batchId, "foundation", total, progress);
}

// ── Knowledge Base ────────────────────────────────────────────────────────────

async function generateKnowledge(ctx: GeneratorContext, batchId: number, progress: BatchProgress): Promise<void> {
  await markModuleRunning(batchId, "knowledge", progress);
  const p = ctx.params;
  const authorId = ctx.adminId;

  const cats = take(KB_CATEGORY_POOL, p.kbCats);
  for (let ci = 0; ci < cats.length; ci++) {
    const spec = cats[ci]!;
    const cat = await prisma.kbCategory.create({ data: { name: spec.name, slug: spec.slug, description: spec.description, position: ci } });
    ctx.kbCategoryIds.push(cat.id);
  }

  const artPool = KB_ARTICLE_POOL.filter((a) => a.catIdx < cats.length);
  for (const spec of take(artPool, p.kbArts)) {
    const catId = ctx.kbCategoryIds[spec.catIdx];
    if (!catId) continue;
    const art = await prisma.kbArticle.create({
      data: {
        title: spec.title, slug: spec.slug, summary: spec.summary, body: spec.body,
        tags: spec.tags, status: "published", reviewStatus: "approved", visibility: "public",
        categoryId: catId, authorId, ownerId: authorId, reviewedById: authorId,
        publishedAt: daysAgo(jitter(5, 55)), viewCount: jitter(50, 450), helpfulCount: jitter(10, 70),
      },
    });
    ctx.kbArticleIds.push(art.id);
  }

  await markModuleDone(batchId, "knowledge", ctx.kbCategoryIds.length + ctx.kbArticleIds.length, progress);
}

// ── Macros ────────────────────────────────────────────────────────────────────

async function generateMacros(ctx: GeneratorContext, batchId: number, progress: BatchProgress): Promise<void> {
  await markModuleRunning(batchId, "macros", progress);
  for (const spec of take(MACRO_POOL, ctx.params.macros)) {
    const m = await prisma.macro.create({ data: { title: spec.title, body: spec.body, isActive: true, createdById: ctx.adminId } });
    ctx.macroIds.push(m.id);
  }
  await markModuleDone(batchId, "macros", ctx.macroIds.length, progress);
}

// ── Catalog + CAB Group ───────────────────────────────────────────────────────

async function generateCatalog(ctx: GeneratorContext, batchId: number, progress: BatchProgress): Promise<void> {
  await markModuleRunning(batchId, "catalog", progress);

  // CAB group
  const supervisorMembers = ctx.supervisorIds.slice(0, 2);
  const cab = await prisma.cabGroup.create({
    data: {
      name: "Change Advisory Board", description: "Primary CAB for normal and standard change reviews",
      isActive: true, createdById: ctx.adminId,
      members: { create: [{ userId: ctx.adminId }, ...supervisorMembers.map((id) => ({ userId: id }))] },
    },
  });
  ctx.cabGroupIds.push(cab.id);

  // Pick the catalog items first so we only create the categories that are
  // actually referenced — keeps the demo dataset clean and predictable.
  const itemSpecs = take(CATALOG_ITEM_POOL, ctx.params.catalog);
  const referencedSlugs = new Set(itemSpecs.map((s) => s.categorySlug));

  // Catalog categories (ordered by appearance in the pool so positions are stable)
  const categoryIdBySlug = new Map<string, number>();
  let position = 0;
  for (const cat of CATALOG_CATEGORY_POOL) {
    if (!referencedSlugs.has(cat.slug)) continue;
    const created = await prisma.catalogCategory.create({
      data: {
        name:        cat.name,
        slug:        cat.slug,
        description: cat.description,
        isActive:    true,
        position:    position++,
      },
    });
    ctx.catalogCategoryIds.push(created.id);
    categoryIdBySlug.set(cat.slug, created.id);
  }

  // Catalog items with rich fields: icon, shortDescription, instructions,
  // approval flag, and a dynamic form schema.
  let itemPosition = 0;
  for (const spec of itemSpecs) {
    const teamId   = ctx.teamIds[spec.teamIdx % Math.max(ctx.teamIds.length, 1)];
    const approverIds = spec.requiresApproval && ctx.supervisorIds.length
      ? ctx.supervisorIds.slice(0, 1)
      : [];
    const item = await prisma.catalogItem.create({
      data: {
        name:                  spec.name,
        shortDescription:      spec.shortDescription,
        description:           spec.description,
        requestorInstructions: spec.requestorInstructions,
        icon:                  spec.icon,
        categoryId:            categoryIdBySlug.get(spec.categorySlug) ?? null,
        fulfillmentTeamId:     teamId,
        requiresApproval:      spec.requiresApproval,
        approvalMode:          "all",
        approverIds,
        formSchema:            spec.formSchema as unknown as object,
        position:              itemPosition++,
        isActive:              true,
        createdById:           ctx.adminId,
      },
    });
    ctx.catalogItemIds.push(item.id);
  }

  await markModuleDone(
    batchId,
    "catalog",
    ctx.cabGroupIds.length + ctx.catalogCategoryIds.length + ctx.catalogItemIds.length,
    progress,
  );
}

// ── Tickets ───────────────────────────────────────────────────────────────────

async function generateTickets(ctx: GeneratorContext, batchId: number, progress: BatchProgress): Promise<void> {
  await markModuleRunning(batchId, "tickets", progress);

  let noteCount = 0; let replyCount = 0; let csatCount = 0;
  const specs = take(TICKET_POOL, ctx.params.tickets);

  for (let i = 0; i < specs.length; i++) {
    const spec = specs[i]!;
    const cust = ctx.customerIds[spec.custIdx % ctx.customerIds.length];
    const custRec = cust ? await prisma.customer.findUnique({ where: { id: cust } }) : null;
    const agentId = ctx.userIds[spec.agentIdx % ctx.userIds.length];
    const teamId  = ctx.teamIds[spec.teamIdx  % ctx.teamIds.length];

    const ticket = await prisma.ticket.create({
      data: {
        ticketNumber: `DEMO-TKT-${pad(i + 1, 4)}`,
        subject: spec.subject, body: spec.body,
        status: spec.status, priority: spec.priority,
        senderName: custRec?.name ?? "Demo Customer",
        senderEmail: custRec?.email ?? `demo${i}@demo.local`,
        customerId: cust ?? null,
        assignedToId: agentId ?? null,
        teamId: teamId ?? null,
        source: "portal",
        createdAt: daysAgo(jitter(1, 14)),
        updatedAt: new Date(),
        ...(["resolved", "closed"].includes(spec.status) ? { resolvedAt: daysAgo(jitter(0, 3)) } : {}),
      },
    });
    ctx.ticketIds.push(ticket.id);

    // Add a note for ~60% of tickets
    if (agentId && i % 5 !== 4) {
      const NOTE_BODIES = [
        "Customer confirmed impact — treating as high priority.",
        "Checked logs: issue started after the 14:00 deployment. Rolling back.",
        "Linked to known problem PRB-0002. Applying documented workaround.",
        "Escalated to Tier 2 — awaiting callback from infrastructure team.",
        "Customer unresponsive for 48h. Sending reminder before closing.",
        "Root cause confirmed: misconfigured GPO applied after patch cycle.",
      ];
      await prisma.note.create({ data: { ticketId: ticket.id, body: pick(NOTE_BODIES, i), authorId: agentId } });
      ctx.noteIds.push(ticket.id); noteCount++;
    }

    // Add a reply for ~80% of tickets
    if (agentId && i % 5 !== 0) {
      const REPLY_BODIES = [
        "Thank you for reaching out. I'm looking into this now and will update you shortly.",
        "I've reviewed your request and can confirm we're working on a resolution.",
        "Great news — the issue has been resolved. Please test and confirm.",
        "Could you provide the exact error message you're seeing? A screenshot would help.",
        "I've escalated this to our infrastructure team. Expect an update within 2 hours.",
        "The workaround documented in our KB should resolve this. Please try it and let me know.",
      ];
      const reply = await prisma.reply.create({ data: { ticketId: ticket.id, body: pick(REPLY_BODIES, i + 1), senderType: "agent", userId: agentId, channel: "portal" } });
      ctx.replyIds.push(reply.id); replyCount++;
    }

    // CSAT for resolved tickets
    if (["resolved", "closed"].includes(spec.status)) {
      const r = await prisma.csatRating.create({ data: { ticketId: ticket.id, rating: Math.random() > 0.15 ? 5 : 4, comment: Math.random() > 0.4 ? "Very helpful and fast!" : null, submittedAt: new Date() } });
      ctx.csatRatingIds.push(r.id); csatCount++;
    }
  }

  await markModuleDone(batchId, "tickets", ctx.ticketIds.length + noteCount + replyCount + csatCount, progress);
}

// ── Incidents ─────────────────────────────────────────────────────────────────

async function generateIncidents(ctx: GeneratorContext, batchId: number, progress: BatchProgress): Promise<void> {
  await markModuleRunning(batchId, "incidents", progress);
  let updateCount = 0;

  for (let i = 0; i < take(INCIDENT_POOL, ctx.params.incidents).length; i++) {
    const spec = INCIDENT_POOL[i]!;
    const cmdId    = ctx.userIds[spec.cmdIdx   % ctx.userIds.length];
    const assignId = ctx.userIds[spec.assignIdx % ctx.userIds.length];
    const teamId   = ctx.teamIds[spec.teamIdx  % ctx.teamIds.length];

    const inc = await prisma.incident.create({
      data: {
        incidentNumber: `DEMO-INC-${pad(i + 1, 4)}`,
        title: spec.title, description: spec.description,
        status: spec.status, priority: spec.priority,
        isMajor: spec.isMajor, affectedSystem: spec.affectedSystem,
        affectedUserCount: spec.affectedUsers,
        commanderId: cmdId ?? null, assignedToId: assignId ?? null,
        teamId: teamId ?? null, createdById: cmdId ?? null,
        createdAt: daysAgo(jitter(1, 20)),
        ...(["resolved", "closed"].includes(spec.status) ? { resolvedAt: daysAgo(jitter(0, 2)), acknowledgedAt: daysAgo(jitter(1, 3)) } : {}),
      },
    });
    ctx.incidentIds.push(inc.id);

    for (let u = 0; u < spec.updates.length; u++) {
      const upd = await prisma.incidentUpdate.create({ data: { incidentId: inc.id, updateType: u === spec.updates.length - 1 && ["resolved","closed"].includes(spec.status) ? "resolution" : "update", body: spec.updates[u]!, authorId: assignId ?? ctx.adminId } });
      ctx.incidentUpdateIds.push(upd.id); updateCount++;
    }
  }

  await markModuleDone(batchId, "incidents", ctx.incidentIds.length + updateCount, progress);
}

// ── Service Requests ──────────────────────────────────────────────────────────

async function generateRequests(ctx: GeneratorContext, batchId: number, progress: BatchProgress): Promise<void> {
  await markModuleRunning(batchId, "requests", progress);

  for (let i = 0; i < take(REQUEST_POOL, ctx.params.requests).length; i++) {
    const spec      = REQUEST_POOL[i]!;
    const requester = ctx.userIds[spec.requesterIdx % ctx.userIds.length];
    const requesterRec = requester ? await prisma.user.findUnique({ where: { id: requester } }) : null;
    const catalogId = ctx.catalogItemIds[spec.catalogIdx % Math.max(ctx.catalogItemIds.length, 1)];
    const catalogRec = catalogId ? await prisma.catalogItem.findUnique({ where: { id: catalogId } }) : null;
    const teamId = ctx.teamIds[CATALOG_ITEM_POOL[spec.catalogIdx % CATALOG_ITEM_POOL.length]?.teamIdx ?? 0];

    const req = await prisma.serviceRequest.create({
      data: {
        requestNumber: `DEMO-SRQ-${pad(i + 1, 4)}`,
        title: spec.title, description: spec.description,
        status: spec.status, priority: spec.priority,
        requesterId: requester ?? null,
        requesterName: requesterRec?.name ?? "Demo User",
        requesterEmail: requesterRec?.email ?? "demo@demo.local",
        teamId: ctx.teamIds[spec.catalogIdx % ctx.teamIds.length] ?? teamId ?? null,
        catalogItemId: catalogId ?? null, catalogItemName: catalogRec?.name ?? null,
        approvalStatus: spec.status === "pending_approval" ? "pending" : "not_required",
        createdById: requester ?? null,
        createdAt: daysAgo(jitter(1, 10)),
        ...(spec.status === "fulfilled" ? { resolvedAt: daysAgo(jitter(0, 3)) } : {}),
      },
    });
    ctx.requestIds.push(req.id);
  }

  await markModuleDone(batchId, "requests", ctx.requestIds.length, progress);
}

// ── Problems ──────────────────────────────────────────────────────────────────

async function generateProblems(ctx: GeneratorContext, batchId: number, progress: BatchProgress): Promise<void> {
  await markModuleRunning(batchId, "problems", progress);

  for (let i = 0; i < take(PROBLEM_POOL, ctx.params.problems).length; i++) {
    const spec   = PROBLEM_POOL[i]!;
    const ownerId   = ctx.supervisorIds[i % Math.max(ctx.supervisorIds.length, 1)] ?? ctx.adminId;
    const assigneeId = ctx.agentIds[i % Math.max(ctx.agentIds.length, 1)] ?? ctx.adminId;
    const teamId    = ctx.teamIds[i % ctx.teamIds.length];

    const prob = await prisma.problem.create({
      data: {
        problemNumber: `DEMO-PRB-${pad(i + 1, 4)}`,
        title: spec.title,
        status: spec.status, priority: spec.priority,
        isKnownError: spec.isKnownError, rootCause: spec.rootCause ?? null, workaround: spec.workaround,
        affectedService: spec.affectedService,
        ownerId, assignedToId: assigneeId, teamId,
        createdAt: daysAgo(jitter(5, 30)),
      },
    });
    ctx.problemIds.push(prob.id);

    // Link to incidents
    for (const incIdx of spec.incidentIdxs) {
      const incId = ctx.incidentIds[incIdx];
      if (incId) {
        await prisma.problemIncidentLink.create({ data: { problemId: prob.id, incidentId: incId, linkedById: ownerId } });
      }
    }

    // Add a problem note
    await prisma.problemNote.create({ data: { problemId: prob.id, body: `Initial investigation note: ${spec.workaround?.split("\n")[0] ?? "Under investigation."}`, authorId: assigneeId } });
  }

  await markModuleDone(batchId, "problems", ctx.problemIds.length, progress);
}

// ── Changes ───────────────────────────────────────────────────────────────────

async function generateChanges(ctx: GeneratorContext, batchId: number, progress: BatchProgress): Promise<void> {
  await markModuleRunning(batchId, "changes", progress);
  let approvalCount = 0;

  for (let i = 0; i < take(CHANGE_POOL, ctx.params.changes).length; i++) {
    const spec    = CHANGE_POOL[i]!;
    const assigneeId = ctx.userIds[spec.assignIdx % ctx.userIds.length];
    const teamId     = ctx.teamIds[spec.teamIdx   % ctx.teamIds.length];

    const change = await prisma.change.create({
      data: {
        changeNumber: `DEMO-CRQ-${pad(i + 1, 4)}`,
        title: spec.title,
        changeType: spec.changeType, state: spec.state,
        risk: spec.risk, priority: spec.priority, impact: spec.impact, urgency: "medium",
        assignedToId: assigneeId ?? null, coordinatorGroupId: teamId ?? null,
        createdById: assigneeId ?? null, justification: spec.justification, rollbackPlan: spec.rollbackPlan,
        plannedStart: daysAgo(jitter(-7, 15)), plannedEnd: daysAgo(jitter(-5, 12)),
        createdAt: daysAgo(jitter(1, 15)),
        ...(["closed"].includes(spec.state) ? { closedAt: daysAgo(jitter(0, 2)), submittedAt: daysAgo(jitter(5, 10)) } : {}),
        ...(spec.problemIdx >= 0 && ctx.problemIds[spec.problemIdx] ? { linkedProblemId: ctx.problemIds[spec.problemIdx] } : {}),
      },
    });
    ctx.changeIds.push(change.id);

    // CAB approval for changes in authorize/scheduled/implement state
    if (["authorize", "scheduled", "implement"].includes(spec.state)) {
      const approvalReq = await prisma.approvalRequest.create({
        data: {
          subjectType: "change_request", subjectId: String(change.id),
          title: `CAB Approval — ${spec.title}`,
          approvalMode: "all", status: spec.state === "authorize" ? "pending" : "approved",
          requestedById: assigneeId ?? ctx.adminId,
          expiresAt: new Date(Date.now() + 7 * 24 * 3_600_000),
        },
      });
      ctx.approvalRequestIds.push(approvalReq.id); approvalCount++;

      const step = await prisma.approvalStep.create({
        data: {
          approvalRequestId: approvalReq.id, stepOrder: 1,
          approverId: ctx.adminId,
          status: spec.state === "authorize" ? "pending" : "approved",
        },
      });

      if (spec.state !== "authorize") {
        await prisma.approvalDecision.create({
          data: {
            stepId:      step.id,
            decidedById: ctx.adminId,
            decision:    "approved",
            comment:     "Approved. Risk is acceptable and rollback plan is documented.",
            decidedAt:   daysAgo(jitter(0, 2)),
          },
        });
      }
    }
  }

  await markModuleDone(batchId, "changes", ctx.changeIds.length + approvalCount, progress);
}

// ── Assets ────────────────────────────────────────────────────────────────────

async function generateAssets(ctx: GeneratorContext, batchId: number, progress: BatchProgress): Promise<void> {
  await markModuleRunning(batchId, "assets", progress);

  for (let i = 0; i < take(ASSET_POOL, ctx.params.assets).length; i++) {
    const spec = ASSET_POOL[i]!;
    const assigneeId = spec.assigneeIdx >= 0 ? (ctx.userIds[spec.assigneeIdx % ctx.userIds.length] ?? null) : null;
    const teamId     = ctx.teamIds[spec.teamIdx % ctx.teamIds.length] ?? null;
    const purchaseDate = daysAgo(jitter(60, 400));

    const asset = await prisma.asset.create({
      data: {
        assetNumber: `DEMO-AST-${pad(i + 1, 4)}`,
        name: spec.name, type: spec.type, status: spec.status, condition: "good",
        manufacturer: spec.mfr, model: spec.model, serialNumber: spec.serial, assetTag: spec.assetTag,
        purchaseDate, purchasePrice: spec.price, currency: "USD", vendor: spec.mfr,
        warrantyExpiry: spec.warDays > 0 ? daysAgo(-spec.warDays) : null,
        warrantyType: spec.warDays > 0 ? "Standard Warranty" : null,
        assignedToId: assigneeId, assignedAt: assigneeId ? daysAgo(jitter(1, 60)) : null,
        teamId, location: "Head Office", site: "HQ",
        depreciationMethod: "straight_line", usefulLifeYears: 3,
        createdById: ctx.adminId,
      },
    });
    ctx.assetIds.push(asset.id);

    // Link assets to incidents (servers/network gear → first incident)
    if (["hardware","network_equipment"].includes(spec.type) && ctx.incidentIds.length > 0) {
      const incId = ctx.incidentIds[i % ctx.incidentIds.length];
      if (incId) {
        await prisma.assetIncidentLink.create({ data: { assetId: asset.id, incidentId: incId } }).catch(() => {});
      }
    }

    // Link assets to changes (alternate every 2)
    if (i % 2 === 0 && ctx.changeIds.length > 0) {
      const chgId = ctx.changeIds[Math.floor(i / 2) % ctx.changeIds.length];
      if (chgId) {
        await prisma.assetChangeLink.create({ data: { assetId: asset.id, changeId: chgId } }).catch(() => {});
      }
    }
  }

  await markModuleDone(batchId, "assets", ctx.assetIds.length, progress);
}

// ── CMDB ──────────────────────────────────────────────────────────────────────

async function generateCmdb(ctx: GeneratorContext, batchId: number, progress: BatchProgress): Promise<void> {
  await markModuleRunning(batchId, "cmdb", progress);

  const specs = take(CI_POOL, ctx.params.ci);
  for (let i = 0; i < specs.length; i++) {
    const spec = specs[i]!;
    const ownerId = ctx.userIds[i % ctx.userIds.length];
    const teamId  = ctx.teamIds[i % ctx.teamIds.length];

    const ci = await prisma.configItem.create({
      data: {
        ciNumber: `DEMO-CI-${pad(i + 1, 4)}`,
        name: spec.name, type: spec.type, environment: spec.env,
        criticality: spec.criticality, status: "active",
        description: spec.description, tags: spec.tags,
        ownerId, teamId, createdById: ctx.adminId,
      },
    });
    ctx.ciIds.push(ci.id);

    // Link CI to an incident
    if (ctx.incidentIds.length > 0) {
      const incId = ctx.incidentIds[i % ctx.incidentIds.length];
      if (incId) {
        await prisma.incidentCiLink.create({ data: { incidentId: incId, ciId: ci.id } }).catch(() => {});
      }
    }

    // Link CI to a change
    if (ctx.changeIds.length > 0) {
      const chgId = ctx.changeIds[i % ctx.changeIds.length];
      if (chgId) {
        await prisma.changeCiLink.create({ data: { changeId: chgId, ciId: ci.id, linkedById: ctx.adminId } }).catch(() => {});
      }
    }

    // Link asset to CI (same index if available)
    if (ctx.assetIds[i]) {
      await prisma.asset.update({ where: { id: ctx.assetIds[i] }, data: { ciId: ci.id } }).catch(() => {});
    }
  }

  // Add CI relationships (first two CIs: server depends_on database)
  if (ctx.ciIds.length >= 2) {
    await prisma.ciRelationship.create({ data: { fromCiId: ctx.ciIds[0]!, toCiId: ctx.ciIds[1]!, type: "depends_on" } }).catch(() => {});
  }
  if (ctx.ciIds.length >= 4) {
    await prisma.ciRelationship.create({ data: { fromCiId: ctx.ciIds[2]!, toCiId: ctx.ciIds[3]!, type: "connects_to" } }).catch(() => {});
  }

  await markModuleDone(batchId, "cmdb", ctx.ciIds.length, progress);
}

// ── Software & SaaS ───────────────────────────────────────────────────────────

async function generateSoftware(ctx: GeneratorContext, batchId: number, progress: BatchProgress): Promise<void> {
  await markModuleRunning(batchId, "software", progress);
  const p = ctx.params;
  const now = new Date();

  let saasNum = 1;
  for (const spec of take(SAAS_SUBSCRIPTION_POOL, p.saas)) {
    const renewalDate = spec.renewalMonths > 0
      ? new Date(now.getFullYear(), now.getMonth() + spec.renewalMonths, 1)
      : null;
    const startDate = daysAgo(jitter(90, 600));

    const sub = await prisma.saaSSubscription.create({
      data: {
        subscriptionNumber: `SAAS-${pad(saasNum++, 4)}`,
        appName:      spec.appName,
        vendor:       spec.vendor,
        category:     spec.category,
        status:       spec.status,
        plan:         spec.plan,
        billingCycle: spec.billingCycle,
        totalSeats:   spec.seats,
        monthlyAmount: spec.monthly ?? null,
        annualAmount:  spec.annual  ?? null,
        currency:      "USD",
        startDate:     startDate,
        renewalDate:   renewalDate,
        autoRenews:    spec.status === "active",
        ownerId:       ctx.userIds[saasNum % ctx.userIds.length] ?? null,
        createdById:   ctx.adminId,
      },
    });
    ctx.saasIds.push(sub.id);
  }

  let licNum = 1;
  for (const spec of take(SOFTWARE_LICENSE_POOL, p.licenses)) {
    const purchaseDate = daysAgo(jitter(180, 900));
    const expiryDate   = spec.expiryYears != null && spec.expiryYears > 0
      ? new Date(purchaseDate.getFullYear() + spec.expiryYears, purchaseDate.getMonth(), purchaseDate.getDate())
      : null;
    const renewalDate  = expiryDate ? new Date(expiryDate.getTime() - 30 * 86_400_000) : null;

    const lic = await prisma.softwareLicense.create({
      data: {
        licenseNumber: `LIC-${pad(licNum++, 4)}`,
        productName:   spec.product,
        vendor:        spec.vendor,
        edition:       spec.edition,
        platform:      spec.platform,
        licenseType:   spec.type,
        status:        spec.status,
        totalSeats:    spec.seats,
        purchaseDate:  purchaseDate,
        purchasePrice: spec.purchase ?? null,
        annualCost:    spec.annual   ?? null,
        currency:      "USD",
        startDate:     purchaseDate,
        expiryDate:    expiryDate,
        renewalDate:   renewalDate,
        autoRenews:    spec.type === "subscription",
        ownerId:       ctx.userIds[licNum % ctx.userIds.length] ?? null,
        createdById:   ctx.adminId,
      },
    });
    ctx.licenseIds.push(lic.id);
  }

  await markModuleDone(batchId, "software", ctx.saasIds.length + ctx.licenseIds.length, progress);
}

// ── Duty Plans ────────────────────────────────────────────────────────────────

const SHIFT_PRESETS = [
  { name: "Morning",   startTime: "06:00", endTime: "14:00", color: "#f59e0b", order: 0 },
  { name: "Afternoon", startTime: "14:00", endTime: "22:00", color: "#3b82f6", order: 1 },
  { name: "Night",     startTime: "22:00", endTime: "06:00", color: "#6366f1", order: 2 },
];

async function generateDutyPlans(ctx: GeneratorContext, batchId: number, progress: BatchProgress): Promise<void> {
  await markModuleRunning(batchId, "duty_plans", progress);

  const now      = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  for (let ti = 0; ti < ctx.teamIds.length; ti++) {
    const teamId = ctx.teamIds[ti]!;

    // Get team members from DB
    const members = await prisma.teamMember.findMany({
      where: { teamId },
      select: { userId: true },
    });
    if (members.length === 0) continue;
    const memberIds = members.map((m) => m.userId);

    // Grant manager role to first agent of this team (as admin)
    const managerId = memberIds[0]!;
    await prisma.dutyPlanRole.upsert({
      where:  { teamId_userId: { teamId, userId: managerId } },
      create: { teamId, userId: managerId, roleType: "manager", grantedById: ctx.adminId },
      update: { roleType: "manager" },
    });

    // Create plan
    const monthName = monthStart.toLocaleString("en-US", { month: "long", year: "numeric" });
    const plan = await prisma.dutyPlan.create({
      data: {
        teamId,
        title:       `${monthName} Duty Schedule`,
        periodStart: monthStart,
        periodEnd:   monthEnd,
        is24x7:      true,
        status:      "published",
        createdById: ctx.adminId,
        notes:       "Auto-generated demo schedule. All agents rotate across morning, afternoon, and night shifts.",
      },
    });
    ctx.dutyPlanIds.push(plan.id);

    // Create the 3 standard shifts
    const shifts: { id: number; order: number }[] = [];
    for (const preset of SHIFT_PRESETS) {
      const shift = await prisma.dutyShift.create({
        data: { planId: plan.id, ...preset },
      });
      shifts.push({ id: shift.id, order: preset.order });
    }

    // Assign agents to shifts for every day in the month
    const msPerDay = 86_400_000;
    let dayOffset = 0;
    const current = new Date(monthStart);

    while (current <= monthEnd) {
      const dateUTC = new Date(Date.UTC(current.getFullYear(), current.getMonth(), current.getDate()));

      for (let si = 0; si < shifts.length; si++) {
        const shift = shifts[si]!;
        // Round-robin assign one agent per shift per day
        const agentId = memberIds[(dayOffset + si) % memberIds.length]!;
        const isLeader = si === 0 && dayOffset % 3 === 0; // every 3rd day mark morning as shift leader

        await prisma.dutyAssignment.upsert({
          where: { shiftId_agentId_date: { shiftId: shift.id, agentId, date: dateUTC } },
          create: { planId: plan.id, shiftId: shift.id, agentId, date: dateUTC, isShiftLeader: isLeader },
          update: { isShiftLeader: isLeader },
        });
      }

      current.setDate(current.getDate() + 1);
      dayOffset++;
    }
  }

  await markModuleDone(batchId, "duty_plans", ctx.dutyPlanIds.length, progress);
}

// ── Ticket Configuration ──────────────────────────────────────────────────────

async function generateTicketConfig(ctx: GeneratorContext, batchId: number, progress: BatchProgress): Promise<void> {
  await markModuleRunning(batchId, "ticket_config", progress);
  const p = ctx.params;

  for (const spec of take(TICKET_TYPE_POOL, p.ticketTypes)) {
    const existing = await prisma.ticketTypeConfig.findUnique({ where: { slug: spec.slug } });
    if (existing) { ctx.ticketTypeIds.push(existing.id); continue; }

    const tt = await prisma.ticketTypeConfig.create({
      data: {
        name:        spec.name,
        slug:        spec.slug,
        description: spec.description,
        color:       spec.color,
        isActive:    true,
        createdById: ctx.adminId,
      },
    });
    ctx.ticketTypeIds.push(tt.id);
  }

  for (const spec of take(TICKET_STATUS_POOL, p.ticketStatuses)) {
    const existing = await prisma.ticketStatusConfig.findFirst({ where: { label: spec.label } });
    if (existing) { ctx.ticketStatusIds.push(existing.id); continue; }

    const ts = await prisma.ticketStatusConfig.create({
      data: {
        label:         spec.label,
        color:         spec.color,
        workflowState: spec.workflowState,
        slaBehavior:   spec.slaBehavior,
        position:      spec.position,
        isActive:      true,
        createdById:   ctx.adminId,
      },
    });
    ctx.ticketStatusIds.push(ts.id);
  }

  await markModuleDone(batchId, "ticket_config", ctx.ticketTypeIds.length + ctx.ticketStatusIds.length, progress);
}

// ── Orchestrator ──────────────────────────────────────────────────────────────

const MODULE_GENERATORS: Record<ModuleKey, (ctx: GeneratorContext, batchId: number, progress: BatchProgress) => Promise<void>> = {
  foundation:    generateFoundation,
  knowledge:     generateKnowledge,
  macros:        generateMacros,
  catalog:       generateCatalog,
  tickets:       generateTickets,
  incidents:     generateIncidents,
  requests:      generateRequests,
  problems:      generateProblems,
  changes:       generateChanges,
  assets:        generateAssets,
  cmdb:          generateCmdb,
  software:      generateSoftware,
  duty_plans:    generateDutyPlans,
  ticket_config: generateTicketConfig,
};

export async function runGenerator(config: GeneratorConfig): Promise<void> {
  const ctx = emptyContext(config.adminId, config.size);
  ctx.params = SIZE_PARAMS[config.size];

  // Initialise all requested modules as "pending" in progress
  const progress: BatchProgress = {};
  for (const mod of config.modules) {
    progress[mod] = { status: "pending", count: 0 };
  }
  await prisma.demoBatch.update({ where: { id: config.batchId }, data: { progress: progress as object } });

  // Always run foundation first if included
  const orderedModules = ALL_MODULE_KEYS.filter((m) => config.modules.includes(m));

  for (const module of orderedModules) {
    const generator = MODULE_GENERATORS[module];
    try {
      await generator(ctx, config.batchId, progress);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[demo-gen] Module "${module}" failed:`, err);
      await markModuleError(config.batchId, module, msg, progress);
      // Continue with remaining modules rather than aborting
    }
  }

  // Final update — persist all collected IDs and counts
  const ids    = contextToRecordIds(ctx);
  const counts = computeRecordCounts(ids);
  await prisma.demoBatch.update({
    where: { id: config.batchId },
    data: {
      status:       "ready",
      completedAt:  new Date(),
      recordIds:    ids as object,
      recordCounts: counts as object,
      progress:     progress as object,
    },
  });
}
