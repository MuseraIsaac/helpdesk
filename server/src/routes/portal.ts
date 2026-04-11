import { Router } from "express";
import { hashPassword } from "better-auth/crypto";
import { requireCustomer } from "../middleware/require-customer";
import { validate } from "../lib/validate";
import { parseId } from "../lib/parse-id";
import { upsertCustomer } from "../lib/upsert-customer";
import { sendClassifyJob } from "../lib/classify-ticket";
import { sendAutoResolveJob } from "../lib/auto-resolve-ticket";
import { computeSlaDeadlines } from "../lib/sla";
import { logAudit } from "../lib/audit";
import { AI_AGENT_ID } from "core/constants/ai-agent.ts";
import { loadFile } from "../lib/storage";
import prisma from "../db";
import {
  portalRegisterSchema,
  portalCreateTicketSchema,
  portalReplySchema,
} from "core/schemas/portal.ts";
import { submitCsatSchema } from "core/schemas/csat.ts";

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

// ─── My Tickets ────────────────────────────────────────────────────────────

router.get("/tickets", requireCustomer, async (req, res) => {
  const tickets = await prisma.ticket.findMany({
    where: { senderEmail: req.user.email },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
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

  const ticket = await prisma.ticket.create({
    data: {
      subject: data.subject,
      body: data.body,
      senderName: req.user.name,
      senderEmail: req.user.email,
      customerId,
      assignedToId: AI_AGENT_ID,
      firstResponseDueAt: slaDeadlines.firstResponseDueAt,
      resolutionDueAt: slaDeadlines.resolutionDueAt,
    },
    select: {
      id: true,
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

  const reply = await prisma.reply.create({
    data: {
      body: data.body,
      senderType: "customer",
      ticketId: id,
      userId: null,
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

  if (!attachment || attachment.ticket.senderEmail !== req.user.email) {
    res.status(404).json({ error: "Attachment not found" });
    return;
  }

  const buffer = await loadFile(attachment.storageKey);

  res.setHeader("Content-Type", attachment.mimeType);
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${encodeURIComponent(attachment.filename)}"`
  );
  res.setHeader("Content-Length", buffer.length);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.send(buffer);
});

export default router;
