import { Router } from "express";
import { requireAuth } from "../middleware/require-auth";
import { validate } from "../lib/validate";
import { parseId } from "../lib/parse-id";
import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import { createReplySchema, polishReplySchema } from "core/schemas/replies.ts";
import { htmlToText } from "../lib/html-to-text";
import prisma from "../db";
import { sendEmailJob } from "../lib/send-email";
import { logAudit } from "../lib/audit";

const router = Router({ mergeParams: true });

// ── List replies ──────────────────────────────────────────────────────────────

router.get("/", requireAuth, async (req, res) => {
  const ticketId = parseId(req.params.ticketId);
  if (!ticketId) {
    res.status(400).json({ error: "Invalid ticket ID" });
    return;
  }

  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) {
    res.status(404).json({ error: "Ticket not found" });
    return;
  }

  const replies = await prisma.reply.findMany({
    where: { ticketId },
    orderBy: { createdAt: "asc" },
    include: {
      user: { select: { id: true, name: true } },
      attachments: {
        select: { id: true, filename: true, size: true, mimeType: true },
      },
    },
  });

  res.json({ replies });
});

// ── Create reply ──────────────────────────────────────────────────────────────

router.post("/", requireAuth, async (req, res) => {
  const ticketId = parseId(req.params.ticketId);
  if (!ticketId) {
    res.status(400).json({ error: "Invalid ticket ID" });
    return;
  }

  const data = validate(createReplySchema, req.body, res);
  if (!data) return;

  // Fetch ticket + prior message IDs for threading before creating the reply
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    include: {
      replies: {
        select: { emailMessageId: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!ticket) {
    res.status(404).json({ error: "Ticket not found" });
    return;
  }

  // Validate that any provided attachmentIds belong to this ticket and are unlinked
  if (data.attachmentIds?.length) {
    const count = await prisma.attachment.count({
      where: {
        id: { in: data.attachmentIds },
        ticketId,
        replyId: null,         // must still be staged (not already linked)
        uploadedById: req.user.id, // must have been uploaded by this agent
      },
    });
    if (count !== data.attachmentIds.length) {
      res.status(400).json({ error: "One or more attachment IDs are invalid" });
      return;
    }
  }

  // If HTML body provided, derive plain-text for storage + email fallback
  const plainBody = data.bodyHtml ? htmlToText(data.bodyHtml) : data.body;
  const htmlBody = data.bodyHtml ?? null;

  const reply = await prisma.reply.create({
    data: {
      body: plainBody,
      bodyHtml: htmlBody,
      senderType: "agent",
      ticketId,
      userId: req.user.id,
    },
    include: {
      user: { select: { id: true, name: true } },
      attachments: { select: { id: true, filename: true, size: true, mimeType: true } },
    },
  });

  // Link the staged attachments to this reply
  if (data.attachmentIds?.length) {
    await prisma.attachment.updateMany({
      where: { id: { in: data.attachmentIds }, ticketId, replyId: null },
      data: { replyId: reply.id },
    });
  }

  // Stamp firstRespondedAt on the first agent reply
  if (!ticket.firstRespondedAt) {
    const now = reply.createdAt;
    const breachedFirstResponse =
      ticket.firstResponseDueAt != null && now > ticket.firstResponseDueAt;
    await prisma.ticket.update({
      where: { id: ticketId },
      data: {
        firstRespondedAt: now,
        ...(breachedFirstResponse && { slaBreached: true }),
      },
    });
  }

  await logAudit(ticketId, req.user.id, "reply.created", {
    replyId: reply.id,
    senderType: "agent",
  });

  // Build email threading headers from the ticket's message history.
  // In-Reply-To references the last message; References lists all prior IDs.
  // This lets email clients (Gmail, Outlook, etc.) group messages in a thread.
  const allPriorIds = [
    ticket.emailMessageId,
    ...ticket.replies.map((r) => r.emailMessageId),
  ].filter((id): id is string => Boolean(id));

  const lastId = allPriorIds.at(-1);
  const inReplyTo = lastId ? `<${lastId}>` : undefined;
  const references = allPriorIds.length
    ? allPriorIds.map((id) => `<${id}>`).join(" ")
    : undefined;

  await sendEmailJob({
    to: ticket.senderEmail,
    subject: `Re: ${ticket.subject}`,
    body: plainBody,
    ...(htmlBody && { bodyHtml: htmlBody }),
    ...(inReplyTo && { inReplyTo }),
    ...(references && { references }),
    ...(data.attachmentIds?.length && { attachmentIds: data.attachmentIds }),
  });

  res.status(201).json(reply);
});

// ── Summarise conversation ────────────────────────────────────────────────────

router.post("/summarize", requireAuth, async (req, res) => {
  const ticketId = parseId(req.params.ticketId);
  if (!ticketId) {
    res.status(400).json({ error: "Invalid ticket ID" });
    return;
  }

  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) {
    res.status(404).json({ error: "Ticket not found" });
    return;
  }

  const replies = await prisma.reply.findMany({
    where: { ticketId },
    orderBy: { createdAt: "asc" },
    include: { user: { select: { name: true } } },
  });

  const conversation = replies
    .map((r) => {
      const sender =
        r.senderType === "agent" ? (r.user?.name ?? "Agent") : ticket.senderName;
      return `${sender}: ${r.body}`;
    })
    .join("\n\n");

  const { text } = await generateText({
    model: openai("gpt-5-nano"),
    system:
      "You are a helpful assistant that summarizes support ticket conversations. " +
      "Provide a clear, concise summary that captures the customer's issue, any actions taken, and the current status. " +
      "Keep the summary to 2-4 sentences. Return only the summary with no preamble.",
    prompt:
      `Subject: ${ticket.subject}\n\n` +
      `Customer message:\n${ticket.body}\n\n` +
      (conversation ? `Conversation:\n${conversation}` : "No replies yet."),
  });

  res.json({ summary: text });
});

// ── Polish draft ──────────────────────────────────────────────────────────────

router.post("/polish", requireAuth, async (req, res) => {
  const ticketId = parseId(req.params.ticketId);
  if (!ticketId) {
    res.status(400).json({ error: "Invalid ticket ID" });
    return;
  }

  const data = validate(polishReplySchema, req.body, res);
  if (!data) return;

  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) {
    res.status(404).json({ error: "Ticket not found" });
    return;
  }

  const agentName = req.user.name;
  const customerName = ticket.senderName.split(" ")[0];

  const { text } = await generateText({
    model: openai("gpt-5-nano"),
    system:
      "You are a helpful writing assistant for a customer support team. " +
      "Improve the given reply for clarity, professional tone, and grammar. " +
      "Preserve the original meaning and keep the response concise. " +
      "Return only the improved text with no preamble or explanation. " +
      `Address the customer by their name: ${customerName}. ` +
      `End the reply with a sign-off using the agent's name: ${agentName}, and include the link https://codewithmosh.com on its own line after the sign-off.`,
    prompt: data.body,
  });

  res.json({ body: text });
});

export default router;
