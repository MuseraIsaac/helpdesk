/**
 * Attachment routes — nested under /api/tickets/:ticketId/attachments
 *
 * POST  /upload         — agent uploads a file (staged, not yet linked to a reply)
 * GET   /:id/download   — agent/admin downloads a file (session auth OR signed token)
 * GET   /:id/token      — generate a time-limited signed download token
 * DELETE /:id           — uploader or admin deletes a file and removes it from storage
 *
 * Portal customers use GET /api/portal/attachments/:id/download (portal.ts)
 * which verifies ticket ownership before serving the file.
 *
 * Internal notes deliberately have no upload endpoint — files must never be
 * inadvertently forwarded when an agent later replies to a customer.
 *
 * ── Upload flow ────────────────────────────────────────────────────────────
 *   1. multer validates MIME type and size limit
 *   2. SHA-256 checksum computed from buffer
 *   3. Virus-scan hook called — result stored on the Attachment row
 *   4. File persisted via the storage provider (local disk or cloud)
 *   5. Attachment record created with full metadata
 *
 * ── Download authorization ─────────────────────────────────────────────────
 *   Agents/admins: session cookie (requireAuth)
 *   Tokenized access: ?token=<signed-token> — usable without a session,
 *     e.g. in email notification links. Tokens expire after 15 minutes.
 *   Portal customers: via /api/portal/attachments/:id/download (not here)
 *
 * ── Virus-scan enforcement ─────────────────────────────────────────────────
 *   Files with status "infected" are always blocked.
 *   Files with status "pending" are served (optimistic); set
 *   VIRUS_SCAN_BLOCK_PENDING=true to hold them until the scan completes.
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
  MAX_FILES_PER_UPLOAD,
  getMaxFileSizeBytes,
} from "../lib/storage";
import { scanBuffer } from "../lib/virus-scan";
import { createDownloadToken, verifyDownloadToken } from "../lib/download-token";
import { can } from "core/constants/permission.ts";
import prisma from "../db";
import type { Request, Response, NextFunction } from "express";

const router = Router({ mergeParams: true });

// Build a multer instance per request so the file-size limit always reflects
// the current "Advanced → Max attachment size" setting without a server restart.
function fileFilter(_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) {
  if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
    cb(null, true);
  } else {
    cb(Object.assign(new Error(`File type not allowed: ${file.mimetype}`), { status: 415 }));
  }
}

async function uploadSingle(req: Request, res: Response, next: NextFunction) {
  const maxSize = await getMaxFileSizeBytes();
  multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxSize, files: 1 },
    fileFilter,
  }).single("file")(req, res, next);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * RFC 5987 / RFC 6266 compliant Content-Disposition header value.
 * Falls back to ASCII filename for clients that do not support the ext-value form.
 */
function contentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_");
  const encoded = encodeURIComponent(filename);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

/**
 * Determine whether an attachment may be served given its virus-scan status.
 * Returns an error message if blocked, or null if allowed.
 */
function scanBlockReason(status: string): string | null {
  if (status === "infected") {
    return "This file was flagged by the virus scanner and cannot be downloaded.";
  }
  if (status === "pending" && process.env.VIRUS_SCAN_BLOCK_PENDING === "true") {
    return "This file is pending a virus scan and is temporarily unavailable.";
  }
  return null;
}

// ── Upload ────────────────────────────────────────────────────────────────────

router.post("/upload", requireAuth, uploadSingle, async (req, res) => {
  const ticketId = parseId(req.params.ticketId);
  if (!ticketId) { res.status(400).json({ error: "Invalid ticket ID" }); return; }

  const file = req.file;
  if (!file) { res.status(400).json({ error: "No file provided" }); return; }

  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) { res.status(404).json({ error: "Ticket not found" }); return; }

  // 1. Virus scan (may be async/skipped depending on configuration)
  const scanResult = await scanBuffer(file.buffer, file.originalname);

  // Synchronous scan: reject infected files immediately
  if (scanResult === "infected") {
    res.status(422).json({ error: "File rejected: virus detected by scanner." });
    return;
  }

  // 2. Persist to storage provider (local disk, S3, R2, …)
  const { key: storageKey, checksum, provider: storageProvider } = await saveFile(
    file.buffer,
    file.originalname
  );

  // 3. Create attachment record with full metadata
  const attachment = await prisma.attachment.create({
    data: {
      filename:        file.originalname,
      mimeType:        file.mimetype,
      size:            file.size,
      storageKey,
      storageProvider,
      checksum,
      virusScanStatus: scanResult,
      ticketId,
      uploadedById:    req.user.id,
    },
    select: {
      id: true,
      filename: true,
      size: true,
      mimeType: true,
      virusScanStatus: true,
      checksum: true,
      createdAt: true,
    },
  });

  res.status(201).json(attachment);
});

// ── Download ──────────────────────────────────────────────────────────────────
//
// Supports two authorization paths:
//   1. Session auth (requireAuth middleware) — standard agent/admin access
//   2. Signed token (?token=…) — time-limited tokenized access without a session
//      Used for email notification links; tokens generated by the /token endpoint.

router.get("/:id/download", async (req, res) => {
  // mergeParams: true provides :ticketId from parent at runtime
  const ticketId = parseId((req.params as Record<string, string>)["ticketId"]);
  const id       = parseId(req.params.id);
  if (!ticketId || !id) { res.status(400).json({ error: "Invalid ID" }); return; }

  // Authorization: session OR valid signed token
  const tokenParam = req.query.token as string | undefined;
  const tokenPayload = verifyDownloadToken(tokenParam, id);
  const sessionUser  = (req as { user?: { id: string } }).user;

  if (!tokenPayload && !sessionUser) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const attachment = await prisma.attachment.findFirst({ where: { id, ticketId } });
  if (!attachment) { res.status(404).json({ error: "Attachment not found" }); return; }

  // Enforce virus-scan policy
  const blocked = scanBlockReason(attachment.virusScanStatus);
  if (blocked) { res.status(451).json({ error: blocked }); return; }

  const buffer = await loadFile(attachment.storageKey);

  res.setHeader("Content-Type", attachment.mimeType);
  res.setHeader("Content-Disposition", contentDisposition(attachment.filename));
  res.setHeader("Content-Length", buffer.length);
  res.setHeader("X-Content-Type-Options", "nosniff");
  // Prevent browsers from caching attachment URLs that carry tokens
  if (tokenParam) res.setHeader("Cache-Control", "no-store");
  res.send(buffer);
});

// ── Token generation ──────────────────────────────────────────────────────────
//
// GET /:id/token  — generates a 15-minute signed download URL for an attachment.
// Useful for embedding attachment links in notification emails or sharing a
// direct download with an external party without giving them a full session.

router.get("/:id/token", requireAuth, async (req, res) => {
  // mergeParams: true merges parent :ticketId at runtime; use indexed access
  // to satisfy TypeScript which only knows about the route's own /:id param.
  const ticketId = parseId((req.params as Record<string, string>)["ticketId"]);
  const id       = parseId(req.params.id);
  if (!ticketId || !id) { res.status(400).json({ error: "Invalid ID" }); return; }

  const attachment = await prisma.attachment.findFirst({ where: { id, ticketId } });
  if (!attachment) { res.status(404).json({ error: "Attachment not found" }); return; }

  const token = createDownloadToken(id, { userId: req.user.id });

  // Return both the token and a ready-to-use relative URL
  res.json({
    token,
    url: `/api/tickets/${ticketId}/attachments/${id}/download?token=${token}`,
    expiresIn: 900, // seconds (15 minutes)
  });
});

// ── Delete ────────────────────────────────────────────────────────────────────

router.delete("/:id", requireAuth, async (req, res) => {
  const ticketId = parseId(req.params.ticketId);
  const id       = parseId(req.params.id);
  if (!ticketId || !id) { res.status(400).json({ error: "Invalid ID" }); return; }

  const attachment = await prisma.attachment.findFirst({ where: { id, ticketId } });
  if (!attachment) { res.status(404).json({ error: "Attachment not found" }); return; }

  const isAdmin    = can(req.user.role, "attachments.delete_any");
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
