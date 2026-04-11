/**
 * Attachment routes — nested under /api/tickets/:ticketId/attachments
 *
 * POST  /upload        — agent uploads a file (staged, not yet linked to a reply)
 * GET   /:id/download  — agent downloads a file
 * DELETE /:id          — uploader or admin deletes a file and removes it from disk
 *
 * Portal customers use GET /api/portal/attachments/:id/download (in portal.ts)
 * which verifies ticket ownership before serving the file.
 *
 * Internal notes deliberately have no upload endpoint — files must never be
 * inadvertently forwarded when an agent later replies to a customer.
 */

import { Router } from "express";
import multer from "multer";
import { requireAuth } from "../middleware/require-auth";
import { parseId } from "../lib/parse-id";
import {
  saveFile,
  loadFile,
  removeFile,
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE,
  MAX_FILES_PER_UPLOAD,
} from "../lib/storage";
import { Role } from "core/constants/role.ts";
import prisma from "../db";

const router = Router({ mergeParams: true });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE, files: MAX_FILES_PER_UPLOAD },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(Object.assign(new Error(`File type not allowed: ${file.mimetype}`), { status: 415 }));
    }
  },
});

// ── Upload ────────────────────────────────────────────────────────────────────
//
// Stages a single file against the ticket. The attachment gets linked to a
// specific reply when the agent submits their reply (via attachmentIds in the
// reply body). Unlinked attachments are cleaned up after 24 hours (future job).

router.post("/upload", requireAuth, upload.single("file"), async (req, res) => {
  const ticketId = parseId(req.params.ticketId);
  if (!ticketId) { res.status(400).json({ error: "Invalid ticket ID" }); return; }

  const file = req.file;
  if (!file) { res.status(400).json({ error: "No file provided" }); return; }

  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) { res.status(404).json({ error: "Ticket not found" }); return; }

  const storageKey = await saveFile(file.buffer, file.originalname);

  const attachment = await prisma.attachment.create({
    data: {
      filename: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      storageKey,
      ticketId,
      uploadedById: req.user.id,
    },
    select: { id: true, filename: true, size: true, mimeType: true },
  });

  res.status(201).json(attachment);
});

// ── Download ──────────────────────────────────────────────────────────────────

router.get("/:id/download", requireAuth, async (req, res) => {
  const ticketId = parseId(req.params.ticketId);
  const id = parseId(req.params.id);
  if (!ticketId || !id) { res.status(400).json({ error: "Invalid ID" }); return; }

  const attachment = await prisma.attachment.findFirst({ where: { id, ticketId } });
  if (!attachment) { res.status(404).json({ error: "Attachment not found" }); return; }

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

// ── Delete ────────────────────────────────────────────────────────────────────

router.delete("/:id", requireAuth, async (req, res) => {
  const ticketId = parseId(req.params.ticketId);
  const id = parseId(req.params.id);
  if (!ticketId || !id) { res.status(400).json({ error: "Invalid ID" }); return; }

  const attachment = await prisma.attachment.findFirst({ where: { id, ticketId } });
  if (!attachment) { res.status(404).json({ error: "Attachment not found" }); return; }

  const isAdmin = req.user.role === Role.admin;
  const isUploader = attachment.uploadedById === req.user.id;
  if (!isAdmin && !isUploader) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  await prisma.attachment.delete({ where: { id } });
  await removeFile(attachment.storageKey);
  res.status(204).send();
});

export default router;
