import { Router } from "express";
import multer from "multer";
import { hashPassword, verifyPassword } from "better-auth/crypto";
import { requireCustomer } from "../middleware/require-customer";
import { validate } from "../lib/validate";
import { parseId } from "../lib/parse-id";
import { upsertCustomer } from "../lib/upsert-customer";
import { sendClassifyJob } from "../lib/classify-ticket";
import { sendAutoResolveJob } from "../lib/auto-resolve-ticket";
import { computeSlaDeadlines } from "../lib/sla";
import { logAudit } from "../lib/audit";
import { generateTicketNumber } from "../lib/ticket-number";
import { htmlToText } from "../lib/html-to-text";
import { AI_AGENT_ID } from "core/constants/ai-agent.ts";
import {
  loadFile, saveFile, ALLOWED_MIME_TYPES, getMaxFileSizeBytes,
} from "../lib/storage";
import { scanBuffer } from "../lib/virus-scan";
import prisma from "../db";
import {
  portalRegisterSchema,
  portalCreateTicketSchema,
  portalReplySchema,
} from "core/schemas/portal.ts";
import { submitCsatSchema } from "core/schemas/csat.ts";
import { portalCreateRequestSchema } from "core/schemas/requests.ts";
import { submitCatalogRequestSchema } from "core/schemas/catalog.ts";
import { generateTicketNumber as generateRequestNumber } from "../lib/ticket-number";
import { computeRequestSlaDueAt } from "../lib/request-sla";
import { logRequestEvent } from "../lib/request-events";
import { createApproval } from "../lib/approval-engine";
import type { Prisma as PrismaTypes } from "../generated/prisma/client";

const router = Router();

// ─── Registration (public — no session required) ───────────────────────────

router.post("/register", async (req, res) => {
  const data = validate(portalRegisterSchema, req.body, res);
  if (!data) return;

  const existing = await prisma.user.findUnique({
    where: { email: data.email },
  });
  if (existing) {
    res.status(409).json({ error: "An account with this email already exists" });
    return;
  }

  const hashedPwd = await hashPassword(data.password);
  const userId = crypto.randomUUID();
  const now = new Date();

  await prisma.$transaction([
    prisma.user.create({
      data: {
        id: userId,
        email: data.email,
        name: data.name,
        emailVerified: false,
        role: "customer",
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
        password: hashedPwd,
        createdAt: now,
        updatedAt: now,
      },
    }),
  ]);

  // Create/link the CRM Customer record so agents see customer history
  await upsertCustomer(data.email, data.name);

  res.status(201).json({ message: "Account created. You can now sign in." });
});

// ─── My Account ────────────────────────────────────────────────────────────

router.get("/me", requireCustomer, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: {
      id: true, name: true, email: true, createdAt: true,
      preference: { select: { jobTitle: true, phone: true, timezone: true } },
    },
  });
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  // Also fetch the linked CRM customer record (has org info)
  const customer = await prisma.customer.findUnique({
    where: { email: req.user.email },
    select: {
      id: true, jobTitle: true, phone: true,
      organization: { select: { id: true, name: true } },
    },
  });

  res.json({ user, customer });
});

router.patch("/me", requireCustomer, async (req, res) => {
  const { name, jobTitle, phone } = req.body as {
    name?: string;
    jobTitle?: string;
    phone?: string;
  };

  if (name !== undefined && (typeof name !== "string" || name.trim().length === 0)) {
    res.status(400).json({ error: "Name must be a non-empty string" });
    return;
  }

  // Update auth user record
  if (name !== undefined) {
    await prisma.user.update({
      where: { id: req.user.id },
      data: { name: name.trim(), updatedAt: new Date() },
    });
  }

  // Update or create preference row
  if (jobTitle !== undefined || phone !== undefined) {
    await prisma.userPreference.upsert({
      where: { userId: req.user.id },
      create: {
        userId: req.user.id,
        jobTitle: jobTitle ?? null,
        phone: phone ?? null,
        updatedAt: new Date(),
      },
      update: {
        ...(jobTitle !== undefined && { jobTitle: jobTitle || null }),
        ...(phone    !== undefined && { phone:    phone    || null }),
        updatedAt: new Date(),
      },
    });
  }

  // Keep CRM customer record in sync
  if (name !== undefined || jobTitle !== undefined || phone !== undefined) {
    await prisma.customer.updateMany({
      where: { email: req.user.email },
      data: {
        ...(name     !== undefined && { name: name.trim() }),
        ...(jobTitle !== undefined && { jobTitle: jobTitle || null }),
        ...(phone    !== undefined && { phone:    phone    || null }),
      },
    });
  }

  res.json({ ok: true });
});

// ─── Change password ────────────────────────────────────────────────────────

router.post("/me/password", requireCustomer, async (req, res) => {
  const { currentPassword, newPassword } = req.body as {
    currentPassword?: string;
    newPassword?: string;
  };

  if (!currentPassword || !newPassword) {
    res.status(400).json({ error: "currentPassword and newPassword are required" });
    return;
  }
  if (typeof newPassword !== "string" || newPassword.length < 8) {
    res.status(400).json({ error: "New password must be at least 8 characters" });
    return;
  }

  const account = await prisma.account.findFirst({
    where: { userId: req.user.id, providerId: "credential" },
    select: { id: true, password: true },
  });
  if (!account?.password) {
    res.status(400).json({ error: "No password set on this account" });
    return;
  }

  const valid = await verifyPassword({ hash: account.password, password: currentPassword });
  if (!valid) {
    res.status(401).json({ error: "Current password is incorrect" });
    return;
  }

  const hashed = await hashPassword(newPassword);
  await prisma.account.update({
    where: { id: account.id },
    data: { password: hashed, updatedAt: new Date() },
  });

  res.json({ ok: true });
});

// ─── My Tickets ────────────────────────────────────────────────────────────

router.get("/tickets", requireCustomer, async (req, res) => {
  const tickets = await prisma.ticket.findMany({
    where: { senderEmail: req.user.email },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      ticketNumber: true,
      subject: true,
      status: true,
      category: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  res.json({ tickets });
});

// ─── Submit New Ticket ─────────────────────────────────────────────────────

router.post("/tickets", requireCustomer, async (req, res) => {
  const data = validate(portalCreateTicketSchema, req.body, res);
  if (!data) return;

  const now = new Date();
  const slaDeadlines = computeSlaDeadlines(null, now);
  const customerId = await upsertCustomer(req.user.email, req.user.name);
  const ticketNumber = await generateTicketNumber(null, now);

  const plainBody = data.bodyHtml ? htmlToText(data.bodyHtml) : data.body;

  const ticket = await prisma.ticket.create({
    data: {
      ticketNumber,
      subject: data.subject,
      body: plainBody,
      bodyHtml: data.bodyHtml ?? null,
      senderName: req.user.name,
      senderEmail: req.user.email,
      customerId,
      assignedToId: AI_AGENT_ID,
      source: "portal",
      firstResponseDueAt: slaDeadlines.firstResponseDueAt,
      resolutionDueAt: slaDeadlines.resolutionDueAt,
    },
    select: {
      id: true,
      ticketNumber: true,
      subject: true,
      body: true,
      senderName: true,
      senderEmail: true,
      status: true,
      category: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  res.status(201).json({
    ticket: {
      id: ticket.id,
      ticketNumber: ticket.ticketNumber,
      subject: ticket.subject,
      status: ticket.status,
      category: ticket.category,
      createdAt: ticket.createdAt,
      updatedAt: ticket.updatedAt,
    },
  });

  void logAudit(ticket.id, req.user.id, "ticket.created", { via: "portal" });

  sendClassifyJob(ticket).catch((error) =>
    console.error(`Failed to enqueue classify job for ticket ${ticket.id}:`, error)
  );

  sendAutoResolveJob(ticket).catch((error) =>
    console.error(`Failed to enqueue auto-resolve job for ticket ${ticket.id}:`, error)
  );
});

// ─── Ticket Detail ─────────────────────────────────────────────────────────

router.get("/tickets/:id", requireCustomer, async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) {
    res.status(400).json({ error: "Invalid ticket ID" });
    return;
  }

  const ticket = await prisma.ticket.findUnique({
    where: { id },
    select: {
      id: true,
      subject: true,
      body: true,
      bodyHtml: true,
      status: true,
      category: true,
      createdAt: true,
      updatedAt: true,
      senderEmail: true,
      // Include only agent/customer replies — Notes are a separate model and
      // are never included here. The Reply model contains no internal data.
      replies: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          body: true,
          bodyHtml: true,
          senderType: true,
          createdAt: true,
          attachments: {
            select: { id: true, filename: true, size: true, mimeType: true },
          },
        },
      },
      // Ticket-level attachments (from the original inbound email body)
      attachments: {
        where: { replyId: null },
        select: { id: true, filename: true, size: true, mimeType: true },
      },
      csatRating: {
        select: { rating: true, comment: true, submittedAt: true },
      },
    },
  });

  if (!ticket) {
    res.status(404).json({ error: "Ticket not found" });
    return;
  }

  // Ownership check — respond 404 (not 403) to avoid confirming ticket existence
  if (ticket.senderEmail !== req.user.email) {
    res.status(404).json({ error: "Ticket not found" });
    return;
  }

  const { senderEmail: _email, ...safeTicket } = ticket;
  res.json({ ticket: safeTicket });
});

// ─── Add Reply ─────────────────────────────────────────────────────────────

router.post("/tickets/:id/replies", requireCustomer, async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) {
    res.status(400).json({ error: "Invalid ticket ID" });
    return;
  }

  const data = validate(portalReplySchema, req.body, res);
  if (!data) return;

  const ticket = await prisma.ticket.findUnique({
    where: { id },
    select: { senderEmail: true, status: true },
  });

  if (!ticket) {
    res.status(404).json({ error: "Ticket not found" });
    return;
  }

  if (ticket.senderEmail !== req.user.email) {
    res.status(404).json({ error: "Ticket not found" });
    return;
  }

  if (ticket.status === "closed") {
    res.status(422).json({ error: "Cannot reply to a closed ticket" });
    return;
  }

  const replyPlainBody = data.bodyHtml ? htmlToText(data.bodyHtml) : data.body;

  const reply = await prisma.reply.create({
    data: {
      body: replyPlainBody,
      bodyHtml: data.bodyHtml ?? null,
      senderType: "customer",
      ticketId: id,
      userId: null,
      channel: "portal",
      channelMeta: { userId: req.user.id, via: "portal" },
    },
    select: {
      id: true,
      body: true,
      senderType: true,
      createdAt: true,
    },
  });

  // Re-open resolved tickets when the customer follows up
  if (ticket.status === "resolved") {
    await prisma.ticket.update({
      where: { id },
      data: { status: "open" },
    });
  }

  res.status(201).json({ reply });
});

// ─── Submit CSAT Rating ─────────────────────────────────────────────────────

router.post("/tickets/:id/csat", requireCustomer, async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) {
    res.status(400).json({ error: "Invalid ticket ID" });
    return;
  }

  const data = validate(submitCsatSchema, req.body, res);
  if (!data) return;

  const ticket = await prisma.ticket.findUnique({
    where: { id },
    select: { senderEmail: true, status: true, csatRating: { select: { id: true } } },
  });

  if (!ticket || ticket.senderEmail !== req.user.email) {
    res.status(404).json({ error: "Ticket not found" });
    return;
  }

  if (ticket.status !== "resolved" && ticket.status !== "closed") {
    res.status(422).json({ error: "CSAT rating can only be submitted for resolved or closed tickets" });
    return;
  }

  if (ticket.csatRating) {
    res.status(409).json({ error: "A rating has already been submitted for this ticket" });
    return;
  }

  const rating = await prisma.csatRating.create({
    data: { ticketId: id, rating: data.rating, comment: data.comment ?? null },
    select: { id: true, rating: true, comment: true, submittedAt: true },
  });

  res.status(201).json({ rating });
});

// ─── Attachment Download ────────────────────────────────────────────────────
//
// GET /api/portal/attachments/:id/download
//
// Customers can download attachments for their own tickets only.
// Responds 404 (not 403) for any ID that is not owned by the session user
// to avoid confirming the existence of other customers' files.

router.get("/attachments/:id/download", requireCustomer, async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) {
    res.status(400).json({ error: "Invalid attachment ID" });
    return;
  }

  const attachment = await prisma.attachment.findUnique({
    where: { id },
    include: { ticket: { select: { senderEmail: true } } },
  });

  // Respond 404 (not 403) to avoid confirming the existence of other customers' files
  if (!attachment || attachment.ticket.senderEmail !== req.user.email) {
    res.status(404).json({ error: "Attachment not found" });
    return;
  }

  // Block infected files
  if (attachment.virusScanStatus === "infected") {
    res.status(451).json({ error: "This file was flagged by the virus scanner and cannot be downloaded." });
    return;
  }

  const buffer = await loadFile(attachment.storageKey);

  // RFC 5987 / RFC 6266 filename encoding — handles non-ASCII filenames
  const ascii = attachment.filename.replace(/[^\x20-\x7e]/g, "_");
  const encoded = encodeURIComponent(attachment.filename);

  res.setHeader("Content-Type", attachment.mimeType);
  res.setHeader("Content-Disposition", `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`);
  res.setHeader("Content-Length", buffer.length);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.send(buffer);
});

// ─── Portal Attachment Upload ─────────────────────────────────────────────────
//
// POST /api/portal/tickets/:id/attachments
//
// Customers can upload files to their own tickets only.
// Returns the created Attachment record (id, filename, size, mimeType).

router.post("/tickets/:id/attachments", requireCustomer, async (req, res, next) => {
  const ticketId = parseId(req.params.id);
  if (!ticketId) { res.status(400).json({ error: "Invalid ticket ID" }); return; }

  // Verify ownership
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: { senderEmail: true },
  });
  if (!ticket || ticket.senderEmail !== req.user.email) {
    res.status(404).json({ error: "Ticket not found" });
    return;
  }

  // Multer upload (single file)
  const maxSize = await getMaxFileSizeBytes();
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxSize, files: 1 },
    fileFilter: (_req, file, cb) => {
      if (ALLOWED_MIME_TYPES.has(file.mimetype)) cb(null, true);
      else cb(Object.assign(new Error(`File type not allowed: ${file.mimetype}`), { status: 415 }));
    },
  }).single("file");

  upload(req, res, async (err) => {
    if (err) { next(err); return; }
    if (!req.file) { res.status(400).json({ error: "No file uploaded" }); return; }

    const { originalname, mimetype, buffer } = req.file;
    const virusScanStatus = await scanBuffer(buffer, originalname);
    const { key: storageKey, checksum, provider: storageProvider } = await saveFile(buffer, originalname);

    const attachment = await prisma.attachment.create({
      data: {
        filename: originalname,
        mimeType: mimetype,
        size: buffer.length,
        storageKey,
        storageProvider,
        checksum,
        virusScanStatus,
        ticketId,
        uploadedById: req.user.id,
      },
      select: { id: true, filename: true, size: true, mimeType: true, virusScanStatus: true },
    });

    res.status(201).json({ attachment });
  });
});

// ── Portal: Service Requests ───────────────────────────────────────────────────

const PORTAL_REQUEST_SELECT = {
  id: true,
  requestNumber: true,
  title: true,
  description: true,
  status: true,
  priority: true,
  approvalStatus: true,
  catalogItemName: true,
  requesterName: true,
  requesterEmail: true,
  dueDate: true,
  slaDueAt: true,
  resolvedAt: true,
  closedAt: true,
  cancelledAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

const PORTAL_REQUEST_DETAIL_SELECT = {
  ...PORTAL_REQUEST_SELECT,
  formData: true,
  assignedTo: { select: { id: true, name: true } },
  team: { select: { id: true, name: true, color: true } },
  items: {
    orderBy: { createdAt: "asc" as const },
    select: {
      id: true,
      name: true,
      description: true,
      quantity: true,
      unit: true,
      status: true,
      fulfilledAt: true,
    },
  },
  tasks: {
    orderBy: { position: "asc" as const },
    select: {
      id: true,
      title: true,
      description: true,
      status: true,
      position: true,
      dueAt: true,
      completedAt: true,
    },
  },
  events: {
    orderBy: { createdAt: "asc" as const },
    select: {
      id: true,
      action: true,
      meta: true,
      createdAt: true,
      // actor is intentionally omitted — customers should not see agent names in audit trail
    },
  },
} as const;

/** GET /api/portal/requests — list the authenticated customer's own requests */
router.get("/requests", requireCustomer, async (req, res) => {
  const requests = await prisma.serviceRequest.findMany({
    where: { requesterEmail: req.user.email },
    orderBy: { createdAt: "desc" },
    select: PORTAL_REQUEST_SELECT,
  });

  res.json({ requests });
});

/** GET /api/portal/requests/:id — get a single request the customer owns */
router.get("/requests/:id", requireCustomer, async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid ID" }); return; }

  const request = await prisma.serviceRequest.findUnique({
    where: { id },
    select: { ...PORTAL_REQUEST_DETAIL_SELECT, requesterEmail: true },
  });

  if (!request || request.requesterEmail !== req.user.email) {
    res.status(404).json({ error: "Request not found" });
    return;
  }

  const { requesterEmail: _email, ...safeRequest } = request;
  res.json({ request: safeRequest });
});

/** POST /api/portal/requests — submit a new service request */
router.post("/requests", requireCustomer, async (req, res) => {
  const data = validate(portalCreateRequestSchema, req.body, res);
  if (!data) return;

  const now = new Date();
  const requestNumber = await generateRequestNumber("service_request", now);
  const customerId = await upsertCustomer(req.user.email, req.user.name);
  const slaDueAt = computeRequestSlaDueAt("medium", now); // portal requests default medium priority

  const request = await prisma.serviceRequest.create({
    data: {
      requestNumber,
      title: data.title,
      description: data.description ?? null,
      priority: "medium",
      status: "submitted",
      approvalStatus: "not_required",
      requesterCustomerId: customerId,
      requesterName: req.user.name,
      requesterEmail: req.user.email,
      catalogItemId: data.catalogItemId ?? null,
      catalogItemName: data.catalogItemName ?? null,
      formData: data.formData as PrismaTypes.InputJsonValue,
      slaDueAt,
      items: data.items.length > 0
        ? {
            create: data.items.map((item) => ({
              name: item.name,
              description: item.description ?? null,
              quantity: item.quantity,
              unit: item.unit ?? null,
              catalogItemId: item.catalogItemId ?? null,
              formData: item.formData as PrismaTypes.InputJsonValue,
            })),
          }
        : undefined,
    },
    select: PORTAL_REQUEST_SELECT,
  });

  void logRequestEvent(request.id, null, "request.created", {
    via: "portal",
    requesterEmail: req.user.email,
  });

  res.status(201).json({ request });
});

// ─── Portal: Service Catalog ───────────────────────────────────────────────

const PORTAL_CATALOG_CATEGORY_SELECT = {
  id: true,
  name: true,
  slug: true,
  description: true,
  position: true,
} as const;

const PORTAL_CATALOG_ITEM_SELECT = {
  id: true,
  name: true,
  shortDescription: true,
  icon: true,
  requiresApproval: true,
  position: true,
  category: { select: PORTAL_CATALOG_CATEGORY_SELECT },
} as const;

const PORTAL_CATALOG_ITEM_DETAIL_SELECT = {
  ...PORTAL_CATALOG_ITEM_SELECT,
  description: true,
  requestorInstructions: true,
  formSchema: true,
  approvalMode: true,
  fulfillmentTeam: { select: { id: true, name: true, color: true } },
} as const;

/** GET /api/portal/catalog — list active catalog items grouped by category */
router.get("/catalog", requireCustomer, async (_req, res) => {
  const [categories, items] = await Promise.all([
    prisma.catalogCategory.findMany({
      where: { isActive: true },
      orderBy: { position: "asc" },
      select: PORTAL_CATALOG_CATEGORY_SELECT,
    }),
    prisma.catalogItem.findMany({
      where: { isActive: true },
      orderBy: [{ categoryId: "asc" }, { position: "asc" }],
      select: PORTAL_CATALOG_ITEM_SELECT,
    }),
  ]);

  // Group items under their categories; uncategorized items go under null
  const grouped = categories.map((cat) => ({
    category: cat,
    items: items.filter((i) => i.category?.id === cat.id),
  }));

  const uncategorized = items.filter((i) => !i.category);
  if (uncategorized.length > 0) {
    grouped.push({ category: null as any, items: uncategorized });
  }

  res.json({ catalog: grouped });
});

/** GET /api/portal/catalog/:id — active catalog item detail */
router.get("/catalog/:id", requireCustomer, async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid ID" }); return; }

  const item = await prisma.catalogItem.findUnique({
    where: { id, isActive: true },
    select: PORTAL_CATALOG_ITEM_DETAIL_SELECT,
  });

  if (!item) { res.status(404).json({ error: "Catalog item not found" }); return; }

  res.json({ item });
});

/** POST /api/portal/catalog/:id/request — submit a request from a catalog item */
router.post("/catalog/:id/request", requireCustomer, async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid ID" }); return; }

  const data = validate(submitCatalogRequestSchema, req.body, res);
  if (!data) return;

  const item = await prisma.catalogItem.findUnique({
    where: { id, isActive: true },
    select: {
      id: true,
      name: true,
      requiresApproval: true,
      approvalMode: true,
      approverIds: true,
      fulfillmentTeamId: true,
      formSchema: true,
    },
  });

  if (!item) { res.status(404).json({ error: "Catalog item not found" }); return; }

  // Validate required form fields
  const schema = Array.isArray(item.formSchema) ? item.formSchema as Array<{ id: string; required: boolean; label: string }> : [];
  const missing = schema
    .filter((f) => f.required)
    .filter((f) => {
      const val = (data.formData as Record<string, unknown>)[f.id];
      return val === undefined || val === null || val === "";
    })
    .map((f) => f.label);

  if (missing.length > 0) {
    res.status(422).json({ error: `Missing required fields: ${missing.join(", ")}` });
    return;
  }

  const now = new Date();
  const requestNumber = await generateRequestNumber("service_request", now);
  const customerId = await upsertCustomer(req.user.email, req.user.name);
  const slaDueAt = computeRequestSlaDueAt(data.priority, now);
  const requiresApproval = item.requiresApproval && item.approverIds.length > 0;
  const initialStatus = requiresApproval ? "pending_approval" : "submitted";
  const approvalStatus = requiresApproval ? "pending" : "not_required";

  const request = await prisma.serviceRequest.create({
    data: {
      requestNumber,
      title: item.name,
      description: data.description ?? null,
      priority: data.priority,
      status: initialStatus,
      approvalStatus,
      requesterCustomerId: customerId,
      requesterName: req.user.name,
      requesterEmail: req.user.email,
      catalogItemId: item.id,
      catalogItemName: item.name,
      formData: data.formData as PrismaTypes.InputJsonValue,
      teamId: item.fulfillmentTeamId ?? null,
      slaDueAt,
    },
    select: { id: true, requestNumber: true, title: true, status: true, approvalStatus: true, createdAt: true },
  });

  void logRequestEvent(request.id, null, "request.created", {
    via: "portal",
    catalogItemId: item.id,
    catalogItemName: item.name,
  });

  if (requiresApproval) {
    try {
      const { approvalRequest } = await createApproval(
        {
          subjectType: "service_request",
          subjectId: String(request.id),
          title: `Approval for: ${item.name}`,
          approvalMode: item.approvalMode as "all" | "any",
          requiredCount: 1,
          approverIds: item.approverIds,
        },
        req.user.id
      );
      await prisma.serviceRequest.update({
        where: { id: request.id },
        data: { approvalRequestId: approvalRequest.id },
      });
    } catch (err) {
      console.error("Failed to create approval for catalog request:", err);
    }
  }

  res.status(201).json({ request });
});

export default router;
