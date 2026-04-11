import { Router } from "express";
import { hashPassword } from "better-auth/crypto";
import { requireCustomer } from "../middleware/require-customer";
import { validate } from "../lib/validate";
import { parseId } from "../lib/parse-id";
import { upsertCustomer } from "../lib/upsert-customer";
import prisma from "../db";
import {
  portalRegisterSchema,
  portalCreateTicketSchema,
  portalReplySchema,
} from "core/schemas/portal.ts";

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

  const customerId = await upsertCustomer(req.user.email, req.user.name);

  const ticket = await prisma.ticket.create({
    data: {
      subject: data.subject,
      body: data.body,
      senderName: req.user.name,
      senderEmail: req.user.email,
      customerId,
      status: "new",
    },
    select: {
      id: true,
      subject: true,
      status: true,
      category: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  res.status(201).json({ ticket });
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
        },
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

export default router;
