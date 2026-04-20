/**
 * Change attachment routes — nested under /api/changes/:changeId/attachments
 *
 * POST /upload        — upload one file, return ChangeAttachment record
 * GET  /              — list all attachments for this change
 * GET  /:id/download  — download a file (session auth OR signed token)
 * DELETE /:id         — delete (uploader or admin only)
 *
 * Reuses the same storage layer, virus-scan hook, and multer config as ticket
 * attachments. Download tokens use the same signing key / verifier.
 */

import { Router } from "express";
import multer from "multer";
import { requireAuth } from "../middleware/require-auth";
import { requirePermission } from "../middleware/require-permission";
import { parseId } from "../lib/parse-id";
import {
  saveFile,
  loadFile,
  removeFile,
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE,
  MAX_FILES_PER_UPLOAD,
} from "../lib/storage";
import { scanBuffer } from "../lib/virus-scan";
import { createDownloadToken, verifyDownloadToken } from "../lib/download-token";
import { can } from "core/constants/permission.ts";
import { changeDocumentTypes } from "core/constants/change.ts";
import type { ChangeDocumentType } from "core/constants/change.ts";
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

function contentDisposition(filename: string): string {
  const ascii   = filename.replace(/[^\x20-\x7e]/g, "_");
  const encoded = encodeURIComponent(filename);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

function scanBlockReason(status: string): string | null {
  if (status === "infected") return "This file was flagged by the virus scanner and cannot be downloaded.";
  if (status === "pending" && process.env.VIRUS_SCAN_BLOCK_PENDING === "true")
    return "This file is pending a virus scan and is temporarily unavailable.";
  return null;
}

const ATTACHMENT_SELECT = {
  id: true,
  filename: true,
  mimeType: true,
  size: true,
  documentType: true,
  virusScanStatus: true,
  checksum: true,
  createdAt: true,
  uploadedBy: { select: { id: true, name: true } },
} as const;

// ── LIST ──────────────────────────────────────────────────────────────────────

router.get(
  "/",
  requireAuth,
  requirePermission("changes.view"),
  async (req, res) => {
    const changeId = parseId((req.params as Record<string, string>)["changeId"]);
    if (!changeId) { res.status(400).json({ error: "Invalid change ID" }); return; }

    const change = await prisma.change.findUnique({ where: { id: changeId }, select: { id: true } });
    if (!change) { res.status(404).json({ error: "Change not found" }); return; }

    const attachments = await prisma.changeAttachment.findMany({
      where: { changeId },
      orderBy: { createdAt: "desc" },
      select: ATTACHMENT_SELECT,
    });

    res.json({ attachments });
  }
);

// ── UPLOAD ────────────────────────────────────────────────────────────────────

router.post(
  "/upload",
  requireAuth,
  requirePermission("changes.update"),
  upload.single("file"),
  async (req, res) => {
    const changeId = parseId((req.params as Record<string, string>)["changeId"]);
    if (!changeId) { res.status(400).json({ error: "Invalid change ID" }); return; }

    const file = req.file;
    if (!file) { res.status(400).json({ error: "No file provided" }); return; }

    const change = await prisma.change.findUnique({ where: { id: changeId }, select: { id: true, state: true } });
    if (!change) { res.status(404).json({ error: "Change not found" }); return; }

    const scanResult = await scanBuffer(file.buffer, file.originalname);
    if (scanResult === "infected") {
      res.status(422).json({ error: "File rejected: virus detected by scanner." });
      return;
    }

    const { key: storageKey, checksum, provider: storageProvider } = await saveFile(
      file.buffer,
      file.originalname
    );

    // documentType may be sent as a multipart form field alongside the file
    const rawDocType = req.body?.documentType as string | undefined;
    const documentType: ChangeDocumentType | null =
      rawDocType && (changeDocumentTypes as readonly string[]).includes(rawDocType)
        ? (rawDocType as ChangeDocumentType)
        : null;

    const attachment = await prisma.changeAttachment.create({
      data: {
        filename:        file.originalname,
        mimeType:        file.mimetype,
        size:            file.size,
        storageKey,
        storageProvider,
        checksum,
        virusScanStatus: scanResult,
        documentType:    documentType ?? undefined,
        changeId,
        uploadedById:    req.user.id,
      },
      select: ATTACHMENT_SELECT,
    });

    // Audit event
    await prisma.changeEvent.create({
      data: {
        changeId,
        actorId: req.user.id,
        action:  "change.attachment_added",
        meta:    { filename: file.originalname, size: file.size, attachmentId: attachment.id },
      },
    });

    res.status(201).json(attachment);
  }
);

// ── DOWNLOAD ──────────────────────────────────────────────────────────────────

router.get("/:id/download", async (req, res) => {
  const changeId = parseId((req.params as Record<string, string>)["changeId"]);
  const id       = parseId(req.params.id);
  if (!changeId || !id) { res.status(400).json({ error: "Invalid ID" }); return; }

  const tokenParam   = req.query.token as string | undefined;
  const tokenPayload = verifyDownloadToken(tokenParam, id);
  const sessionUser  = (req as { user?: { id: string } }).user;

  if (!tokenPayload && !sessionUser) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const attachment = await prisma.changeAttachment.findFirst({ where: { id, changeId } });
  if (!attachment) { res.status(404).json({ error: "Attachment not found" }); return; }

  const blocked = scanBlockReason(attachment.virusScanStatus);
  if (blocked) { res.status(451).json({ error: blocked }); return; }

  const buffer = await loadFile(attachment.storageKey);

  res.setHeader("Content-Type", attachment.mimeType);
  res.setHeader("Content-Disposition", contentDisposition(attachment.filename));
  res.setHeader("Content-Length", buffer.length);
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (tokenParam) res.setHeader("Cache-Control", "no-store");
  res.send(buffer);
});

// ── TOKEN ─────────────────────────────────────────────────────────────────────

router.get("/:id/token", requireAuth, async (req, res) => {
  const changeId = parseId((req.params as Record<string, string>)["changeId"]);
  const id       = parseId(req.params.id);
  if (!changeId || !id) { res.status(400).json({ error: "Invalid ID" }); return; }

  const attachment = await prisma.changeAttachment.findFirst({ where: { id, changeId } });
  if (!attachment) { res.status(404).json({ error: "Attachment not found" }); return; }

  const token = createDownloadToken(id, { userId: req.user.id });
  res.json({
    token,
    url: `/api/changes/${changeId}/attachments/${id}/download?token=${token}`,
    expiresIn: 900,
  });
});

// ── DELETE ────────────────────────────────────────────────────────────────────

router.delete("/:id", requireAuth, requirePermission("changes.update"), async (req, res) => {
  const changeId = parseId((req.params as Record<string, string>)["changeId"]);
  const id       = parseId(req.params.id);
  if (!changeId || !id) { res.status(400).json({ error: "Invalid ID" }); return; }

  const attachment = await prisma.changeAttachment.findFirst({ where: { id, changeId } });
  if (!attachment) { res.status(404).json({ error: "Attachment not found" }); return; }

  const isAdmin    = can(req.user.role, "attachments.delete_any");
  const isUploader = attachment.uploadedById === req.user.id;
  if (!isAdmin && !isUploader) { res.status(403).json({ error: "Forbidden" }); return; }

  await prisma.changeAttachment.delete({ where: { id } });
  await removeFile(attachment.storageKey);

  await prisma.changeEvent.create({
    data: {
      changeId,
      actorId: req.user.id,
      action:  "change.attachment_removed",
      meta:    { filename: attachment.filename, attachmentId: id },
    },
  });

  res.status(204).send();
});

export default router;
