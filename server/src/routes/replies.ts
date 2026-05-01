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
import { notifyMentions, extractMentionedEmails } from "../lib/mentions";
import { fireTicketEvent } from "../lib/event-bus";
import { getSection } from "../lib/settings";

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
      team: { select: { email: true } },
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

  const { cc, bcc, replyType = "reply_all", forwardTo, to: toOverride, quotedBody, quotedHtml } = data;

  if (replyType === "forward" && !forwardTo) {
    res.status(400).json({ error: "forwardTo is required for forward replies" });
    return;
  }

  // If HTML body provided, derive plain-text for storage + email fallback
  const plainBody = data.bodyHtml ? htmlToText(data.bodyHtml) : data.body;
  const htmlBody = data.bodyHtml ?? null;

  const ccStr  = cc?.join(", ")  || null;
  const bccStr = bcc?.join(", ") || null;

  // Capture the To override (if any) on the reply itself so the conversation
  // timeline can show the *actual* recipient instead of always falling back to
  // ticket.senderEmail. Only stored for non-forward replies; forwards use the
  // existing forwardTo column.
  const toForRow = replyType !== "forward" ? (toOverride?.trim() || null) : null;

  const reply = await prisma.reply.create({
    data: {
      body: plainBody,
      bodyHtml: htmlBody,
      senderType: "agent",
      ticketId,
      userId: req.user.id,
      channel: "email",
      channelMeta: { agentId: req.user.id, via: replyType === "forward" ? "agent_forward" : "agent_reply" },
      replyType,
      to: toForRow,
      cc: ccStr,
      bcc: bccStr,
      forwardTo: replyType === "forward" ? forwardTo ?? null : null,
      quotedBody: quotedBody ?? null,
      quotedHtml: quotedHtml ?? null,
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

  // Stamp firstRespondedAt on the first agent reply + always update lastAgentReplyAt.
  //
  // Auto-assign to first responder (when enabled): the first agent reply on a
  // ticket assigns it to that agent — overriding any prior assignment, and
  // unaffected by later replies. Gated on `tickets.autoAssignFirstResponder`,
  // which defaults to true. Customers replying via this route never trigger
  // the assignment.
  const isFirstAgentReply = !ticket.firstRespondedAt;
  let assignedToFirstResponder = false;
  if (isFirstAgentReply && req.user.role !== "customer") {
    const ticketsCfg = await getSection("tickets");
    if (ticketsCfg.autoAssignFirstResponder !== false) {
      assignedToFirstResponder = ticket.assignedToId !== req.user.id;
    }
  }

  await prisma.ticket.update({
    where: { id: ticketId },
    data: {
      lastAgentReplyAt: reply.createdAt,
      ...(isFirstAgentReply && {
        firstRespondedAt: reply.createdAt,
        ...(ticket.firstResponseDueAt != null &&
          reply.createdAt > ticket.firstResponseDueAt && { slaBreached: true }),
      }),
      ...(assignedToFirstResponder && { assignedToId: req.user.id }),
    },
  });

  if (assignedToFirstResponder) {
    await logAudit(ticketId, req.user.id, "ticket.assigned", {
      from:    ticket.assignedToId ? { id: ticket.assignedToId } : null,
      to:      { id: req.user.id, name: req.user.name },
      reason:  "first_responder",
      replyId: reply.id,
    });
  }

  // Recipient resolution:
  //   forward       → forwardTo (validated above)
  //   reply_all/sender → agent override if provided, else ticket.senderEmail
  const emailTo = replyType === "forward"
    ? forwardTo!
    : (toOverride?.trim() || ticket.senderEmail);
  const recipientWasOverridden =
    replyType !== "forward" &&
    !!toOverride &&
    toOverride.trim().toLowerCase() !== ticket.senderEmail.toLowerCase();

  await logAudit(ticketId, req.user.id, "reply.created", {
    replyId: reply.id,
    senderType: "agent",
    ...(recipientWasOverridden && {
      recipientOverride: { from: ticket.senderEmail, to: emailTo },
    }),
  });

  // Notify @mentioned users (fire-and-forget)
  void notifyMentions(htmlBody, {
    authorId:     req.user.id,
    entityNumber: ticket.ticketNumber,
    entityTitle:  ticket.subject,
    entityUrl:    `/tickets/${ticketId}`,
    entityType:   "ticket_reply",
    entityId:     String(reply.id),
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
  const emailSubject = replyType === "forward"
    ? `Fwd: ${ticket.subject}`
    : `Re: ${ticket.subject}`;

  // Build CC: start from what the agent explicitly added, then append any
  // @mentioned agent emails that aren't already in To/CC/BCC.
  let emailCc: string[] | undefined;
  if (replyType !== "reply_sender") {
    const explicitCc = cc ?? [];
    const mentionedEmails = extractMentionedEmails(htmlBody);
    const alreadyPresent = new Set(
      [emailTo, ...explicitCc, ...(bcc ?? [])].map((e) => e.toLowerCase())
    );
    const newFromMentions = mentionedEmails.filter((e) => !alreadyPresent.has(e));
    const merged = [...explicitCc, ...newFromMentions];
    emailCc = merged.length ? merged : undefined;
  }

  // Append quoted content as an email-standard blockquote so recipients see the trail
  let emailBodyHtml = htmlBody;
  let emailBodyText = plainBody;
  if (quotedHtml) {
    const quoteHeader = replyType === "forward"
      ? `<p style="color:#666;font-size:0.85em;margin:8px 0 4px">---------- Forwarded message ----------</p>`
      : `<p style="color:#666;font-size:0.85em;margin:8px 0 4px">On ${new Date(reply.createdAt).toUTCString()}, ${ticket.senderName} wrote:</p>`;
    emailBodyHtml = (htmlBody ?? `<p>${plainBody}</p>`) +
      `<blockquote style="margin:0 0 0 .8ex;border-left:2px solid #ccc;padding-left:1ex;color:#555;">${quoteHeader}${quotedHtml}</blockquote>`;
  }
  if (quotedBody) {
    const quoteHeader = replyType === "forward"
      ? `\n\n---------- Forwarded message ----------\n`
      : `\n\nOn ${new Date(reply.createdAt).toUTCString()}, ${ticket.senderName} wrote:\n`;
    emailBodyText = plainBody + quoteHeader + quotedBody.split("\n").map(l => `> ${l}`).join("\n");
  }

  // Use the team's email address (if set) so the reply appears to come from
  // the team inbox rather than the generic system from-address.
  // Produces: "Isaac Musera <support@acme.io>"
  const teamEmail = ticket.team?.email ?? null;

  await sendEmailJob({
    to: emailTo,
    subject: emailSubject,
    body: emailBodyText,
    ...(emailCc && { cc: emailCc }),
    ...(bcc?.length && { bcc }),
    ...(emailBodyHtml && { bodyHtml: emailBodyHtml }),
    ...(replyType !== "forward" && inReplyTo && { inReplyTo }),
    ...(replyType !== "forward" && references && { references }),
    ...(data.attachmentIds?.length && { attachmentIds: data.attachmentIds }),
    ...(teamEmail && { from: { email: teamEmail, name: req.user.name } }),
  });

  // Fire ticket.reply_sent for event_workflow rules
  fireTicketEvent("ticket.reply_sent", ticketId, req.user.id);

  res.status(201).json(reply);
});

// ── Summarise conversation ────────────────────────────────────────────────────

router.post("/summarize", requireAuth, async (req, res) => {
  const ticketId = parseId(req.params.ticketId);
  if (!ticketId) {
    res.status(400).json({ error: "Invalid ticket ID" });
    return;
  }

  // Honor the admin's "summarizeEnabled" toggle. The client hides the
  // button when this is off, but enforce server-side too so a custom
  // client / curl can't bypass the policy.
  const ticketsCfg = await getSection("tickets");
  if (ticketsCfg.summarizeEnabled === false) {
    res.status(403).json({ error: "Summarize is disabled by your administrator" });
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
