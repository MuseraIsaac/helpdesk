/**
 * Disk-based file storage.
 *
 * Storage assumptions:
 *   - Files live in UPLOAD_DIR (env var). Default: ./uploads relative to the
 *     server's working directory. Set an absolute path in production.
 *   - Every file is stored under a UUID-derived key, never the original filename.
 *     This prevents path traversal and name collisions entirely.
 *   - To switch to object storage (S3, R2, GCS), replace only this module —
 *     callers only see saveFile / loadFile / removeFile.
 *
 * Sizing guidance:
 *   - Max 10 MB per file (MAX_FILE_SIZE).
 *   - Max 5 files per upload request (MAX_FILES_PER_UPLOAD).
 *   - Monitor UPLOAD_DIR disk usage. Migrate to object storage when the volume
 *     justifies it — the interface here stays the same.
 */

import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import { join, resolve, extname } from "node:path";
import { randomUUID } from "node:crypto";

export const UPLOAD_DIR = resolve(process.env.UPLOAD_DIR ?? "./uploads");

export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
export const MAX_FILES_PER_UPLOAD = 5;

/**
 * MIME-type allowlist.
 * Executable types (exe, sh, js, etc.) are permanently excluded.
 * Extend this list as needed.
 */
export const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "application/pdf",
  "text/plain",
  "text/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/zip",
  "application/x-zip-compressed",
]);

/** Write a buffer to disk. Returns the storage key to persist in the database. */
export async function saveFile(buffer: Buffer, originalname: string): Promise<string> {
  await mkdir(UPLOAD_DIR, { recursive: true });
  // Sanitise: keep only [a-z0-9.] chars and cap at 10 chars to avoid FS issues
  const ext = extname(originalname)
    .toLowerCase()
    .replace(/[^a-z0-9.]/g, "")
    .slice(0, 10);
  const key = `${randomUUID()}${ext}`;
  await writeFile(join(UPLOAD_DIR, key), buffer);
  return key;
}

/** Read a file from disk by its storage key. Throws if the file does not exist. */
export async function loadFile(key: string): Promise<Buffer> {
  // Guard: storage keys are UUID-based and must not contain path separators
  if (!key || key.includes("/") || key.includes("\\") || key.startsWith(".")) {
    throw new Error(`Invalid storage key: ${key}`);
  }
  return readFile(join(UPLOAD_DIR, key));
}

/** Delete a file from disk. Silently ignores missing files. */
export async function removeFile(key: string): Promise<void> {
  try {
    await unlink(join(UPLOAD_DIR, key));
  } catch {
    // Already gone — no action needed
  }
}
