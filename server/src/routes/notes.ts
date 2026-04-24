import { Router } from "express";
import { requireAuth } from "../middleware/require-auth";
import { validate } from "../lib/validate";
import { parseId } from "../lib/parse-id";
import { createNoteSchema, updateNoteSchema } from "core/schemas/notes.ts";
import { htmlToText } from "../lib/html-to-text";
import { can } from "core/constants/permission.ts";
import prisma from "../db";
import { logAudit } from "../lib/audit";
import { notifyMentions } from "../lib/mentions";
import { fireTicketEvent } from "../lib/event-bus";

const router = Router({ mergeParams: true });

// List all internal notes for a ticket — agents/admins only.
// Notes are NEVER exposed through the replies endpoint; they live on a
// separate, auth-gated route so they can never leak to customers.
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

  const notes = await prisma.note.findMany({
    where: { ticketId },
    orderBy: [
      { isPinned: "desc" },   // pinned notes float to the top
      { createdAt: "asc" },
    ],
    include: {
      author: { select: { id: true, name: true } },
    },
  });

  res.json({ notes });
});

// Create an internal note on a ticket.
router.post("/", requireAuth, async (req, res) => {
  const ticketId = parseId(req.params.ticketId);
  if (!ticketId) {
    res.status(400).json({ error: "Invalid ticket ID" });
    return;
  }

  const data = validate(createNoteSchema, req.body, res);
  if (!data) return;

  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) {
    res.status(404).json({ error: "Ticket not found" });
    return;
  }

  const plainBody = data.bodyHtml ? htmlToText(data.bodyHtml) : data.body;

  const note = await prisma.note.create({
    data: {
      body: plainBody,
      bodyHtml: data.bodyHtml ?? null,
      ticketId,
      authorId: req.user.id,
      mentionedUserIds: data.mentionedUserIds ?? [],
    },
    include: {
      author: { select: { id: true, name: true } },
    },
  });

  await logAudit(ticketId, req.user.id, "note.created", { noteId: note.id });

  // Fire ticket.note_added event for event_workflow rules
  fireTicketEvent("ticket.note_added", ticketId, req.user.id);

  // Notify @mentioned users from the HTML content (fire-and-forget)
  void notifyMentions(data.bodyHtml, {
    authorId:     req.user.id,
    entityNumber: ticket.ticketNumber,
    entityTitle:  ticket.subject,
    entityUrl:    `/tickets/${ticketId}`,
    entityType:   "ticket_note",
    entityId:     String(note.id),
  });

  res.status(201).json(note);
});

// Update a note — toggle pin or edit body.
// Any authenticated agent can pin/unpin; only the author or an admin can edit the body.
router.patch("/:noteId", requireAuth, async (req, res) => {
  const ticketId = parseId(req.params.ticketId);
  const noteId = parseId(req.params.noteId);
  if (!ticketId || !noteId) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const data = validate(updateNoteSchema, req.body, res);
  if (!data) return;

  const note = await prisma.note.findFirst({ where: { id: noteId, ticketId } });
  if (!note) {
    res.status(404).json({ error: "Note not found" });
    return;
  }

  // Editing body is restricted to the author or an admin
  if (data.body !== undefined) {
    const isAuthor = note.authorId === req.user.id;
    const isAdmin = can(req.user.role, "notes.manage_any");
    if (!isAuthor && !isAdmin) {
      res.status(403).json({ error: "Only the author or an admin can edit this note" });
      return;
    }
  }

  const updated = await prisma.note.update({
    where: { id: noteId },
    data: {
      ...(data.isPinned !== undefined && { isPinned: data.isPinned }),
      ...(data.body !== undefined && { body: data.body }),
    },
    include: {
      author: { select: { id: true, name: true } },
    },
  });

  res.json(updated);
});

// Delete a note — only the author or an admin.
router.delete("/:noteId", requireAuth, async (req, res) => {
  const ticketId = parseId(req.params.ticketId);
  const noteId = parseId(req.params.noteId);
  if (!ticketId || !noteId) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const note = await prisma.note.findFirst({ where: { id: noteId, ticketId } });
  if (!note) {
    res.status(404).json({ error: "Note not found" });
    return;
  }

  const isAuthor = note.authorId === req.user.id;
  const isAdmin = can(req.user.role, "notes.manage_any");
  if (!isAuthor && !isAdmin) {
    res.status(403).json({ error: "Only the author or an admin can delete this note" });
    return;
  }

  await prisma.note.delete({ where: { id: noteId } });

  res.status(204).send();
});

export default router;
