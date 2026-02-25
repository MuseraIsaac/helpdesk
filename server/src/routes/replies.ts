import { Router } from "express";
import { requireAuth } from "../middleware/require-auth";
import { validate } from "../lib/validate";
import { parseId } from "../lib/parse-id";
import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import { createReplySchema, polishReplySchema } from "core/schemas/replies.ts";
import prisma from "../db";

const router = Router({ mergeParams: true });

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
    include: { user: { select: { id: true, name: true } } },
  });

  res.json({ replies });
});

router.post("/", requireAuth, async (req, res) => {
  const ticketId = parseId(req.params.ticketId);
  if (!ticketId) {
    res.status(400).json({ error: "Invalid ticket ID" });
    return;
  }

  const data = validate(createReplySchema, req.body, res);
  if (!data) return;

  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) {
    res.status(404).json({ error: "Ticket not found" });
    return;
  }

  const reply = await prisma.reply.create({
    data: {
      body: data.body,
      senderType: "agent",
      ticketId,
      userId: req.user.id,
    },
    include: { user: { select: { id: true, name: true } } },
  });

  res.status(201).json(reply);
});

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
    model: openai("gpt-4o-mini"),
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
