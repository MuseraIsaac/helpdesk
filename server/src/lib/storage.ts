/**
 * Storage abstraction layer.
 *
 * All file I/O goes through the `StorageProvider` interface so that the
 * storage backend can be swapped without touching any route code.
 *
 * ── Current backend ────────────────────────────────────────────────────────
 *   LocalStorageProvider — files on disk under UPLOAD_DIR.
 *   Selected when STORAGE_PROVIDER=local (the default).
 *
 * ── Swapping to object storage ─────────────────────────────────────────────
 *   Set STORAGE_PROVIDER=s3 (or "gcs", "r2") and fill in the corresponding
 *   env vars documented on the S3StorageProvider class below.
 *   The S3StorageProvider skeleton is ready to uncomment; install
 *   `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` first.
 *
 * ── Public API (backward compatible) ───────────────────────────────────────
 *   saveFile(buffer, originalname) → SaveResult
 *   loadFile(key)                 → Buffer
 *   removeFile(key)               → void
 *   getProvider()                 → StorageProvider  (for advanced use)
 *
 * ── Sizing guidance ─────────────────────────────────────────────────────────
 *   MAX_FILE_SIZE          = 10 MB  (enforce in multer limits)
 *   MAX_FILES_PER_UPLOAD   = 5
 *   Monitor UPLOAD_DIR disk usage; migrate to object storage when volume
 *   or redundancy requirements justify it.
 */

import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import { join, resolve, extname } from "node:path";
import { randomUUID, createHash } from "node:crypto";

// ── Constants ─────────────────────────────────────────────────────────────────

// Resolve relative to this file's directory so the path is correct regardless
// of the process working directory (which changes when bun --watch is invoked
// from the monorepo root instead of from server/).
export const UPLOAD_DIR = resolve(
  process.env.UPLOAD_DIR ?? join(import.meta.dirname, "../../../uploads")
);
/** Hard-coded fallback used before settings are available (e.g. at module load). */
export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB default
export const MAX_FILES_PER_UPLOAD = 5;

// In-process cache so we don't hit the DB on every upload request.
let _fileSizeCache: { bytes: number; expiresAt: number } | null = null;

/**
 * Returns the current max file-size in bytes, reading from
 * Settings → Advanced → "Max attachment size (MB)" with a 30-second cache.
 * Falls back to MAX_FILE_SIZE if the DB is unreachable.
 */
export async function getMaxFileSizeBytes(): Promise<number> {
  const now = Date.now();
  if (_fileSizeCache && now < _fileSizeCache.expiresAt) {
    return _fileSizeCache.bytes;
  }
  try {
    const { getSection } = await import("./settings");
    const advanced = await getSection("advanced");
    const bytes = (advanced.maxAttachmentSizeMb ?? 10) * 1024 * 1024;
    _fileSizeCache = { bytes, expiresAt: now + 30_000 };
    return bytes;
  } catch {
    return MAX_FILE_SIZE;
  }
}

/**
 * MIME-type allowlist.
 * Executable types (exe, sh, js, dll, …) are permanently excluded.
 * Extend this list as needed; keep it conservative.
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

// ── Result type ───────────────────────────────────────────────────────────────

export interface SaveResult {
  /** Opaque key to persist in the DB; passed back to loadFile / removeFile. */
  key: string;
  /** SHA-256 hex digest of the raw file bytes. Used for integrity checks. */
  checksum: string;
  /** The name of the active storage provider, e.g. "local", "s3". */
  provider: string;
}

// ── Provider interface ────────────────────────────────────────────────────────

/**
 * StorageProvider — the contract every backend must satisfy.
 *
 * If you add a new backend (S3, GCS, R2, …), implement this interface and
 * register it in getProvider() below. No route code needs to change.
 */
export interface StorageProvider {
  readonly name: string;

  /**
   * Persist a file buffer. Returns an opaque key that uniquely identifies the
   * stored object. The key is stored in the DB and passed to load / remove.
   *
   * @param buffer      Raw file bytes.
   * @param originalname  The browser-supplied filename (used only for extension extraction).
   */
  save(buffer: Buffer, originalname: string): Promise<string>;

  /**
   * Retrieve a file by its storage key.
   * Throws if the key does not exist.
   */
  load(key: string): Promise<Buffer>;

  /**
   * Delete a file by its storage key.
   * Must be idempotent — silently ignore missing objects.
   */
  remove(key: string): Promise<void>;

  // ── Future: signed URL support ──────────────────────────────────────────
  // When using object storage, replace the load() streaming path with a
  // pre-signed URL redirect so the client downloads directly from the CDN:
  //
  //   getSignedUrl(key: string, expiresInSeconds: number): Promise<string>;
  //
  // The download route would then do:
  //   const url = await provider.getSignedUrl(key, 300);
  //   res.redirect(302, url);
  //
  // For local dev keep returning the buffer; the interface can diverge with
  // an adapter shim if needed.
}

// ── Local (disk) provider ─────────────────────────────────────────────────────

class LocalStorageProvider implements StorageProvider {
  readonly name = "local";

  async save(buffer: Buffer, originalname: string): Promise<string> {
    await mkdir(UPLOAD_DIR, { recursive: true });

    // Sanitise: keep only [a-z0-9.] chars; cap at 10 chars to avoid FS issues.
    const ext = extname(originalname)
      .toLowerCase()
      .replace(/[^a-z0-9.]/g, "")
      .slice(0, 10);

    const key = `${randomUUID()}${ext}`;
    await writeFile(join(UPLOAD_DIR, key), buffer);
    return key;
  }

  async load(key: string): Promise<Buffer> {
    validateKey(key);
    return readFile(join(UPLOAD_DIR, key));
  }

  async remove(key: string): Promise<void> {
    validateKey(key);
    try {
      await unlink(join(UPLOAD_DIR, key));
    } catch {
      // Already gone — idempotent
    }
  }
}

// ── S3-compatible provider skeleton ──────────────────────────────────────────
//
// To activate:
//   1. Set STORAGE_PROVIDER=s3 in your .env
//   2. Set S3_BUCKET, S3_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
//      (or use an IAM role / instance profile instead of explicit key/secret)
//   3. Install: bun add @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
//   4. Uncomment the class and the "s3" branch in getProvider()
//
// Works with any S3-compatible API: AWS S3, Cloudflare R2, MinIO, Backblaze B2.
// For R2: set S3_ENDPOINT=https://<accountid>.r2.cloudflarestorage.com
//
// class S3StorageProvider implements StorageProvider {
//   readonly name = "s3";
//   private client: S3Client;
//   private bucket: string;
//
//   constructor() {
//     const { S3Client } = require("@aws-sdk/client-s3");
//     this.bucket = process.env.S3_BUCKET!;
//     this.client = new S3Client({
//       region: process.env.S3_REGION ?? "us-east-1",
//       endpoint: process.env.S3_ENDPOINT,           // omit for AWS, set for R2/MinIO
//       forcePathStyle: !!process.env.S3_ENDPOINT,   // required for MinIO
//     });
//   }
//
//   async save(buffer: Buffer, originalname: string): Promise<string> {
//     const { PutObjectCommand } = require("@aws-sdk/client-s3");
//     const ext = extname(originalname).toLowerCase().replace(/[^a-z0-9.]/g, "").slice(0, 10);
//     const key = `attachments/${randomUUID()}${ext}`;
//     await this.client.send(new PutObjectCommand({
//       Bucket: this.bucket,
//       Key: key,
//       Body: buffer,
//       // Set ACL to "private" — downloads always go through the signed-URL path
//       ServerSideEncryption: "AES256",
//     }));
//     return key;
//   }
//
//   async load(key: string): Promise<Buffer> {
//     // FUTURE: replace with getSignedUrl() redirect instead of streaming through server
//     const { GetObjectCommand } = require("@aws-sdk/client-s3");
//     const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
//     const cmd = new GetObjectCommand({ Bucket: this.bucket, Key: key });
//     // For signed-URL redirect pattern:
//     //   const url = await getSignedUrl(this.client, cmd, { expiresIn: 300 });
//     //   throw Object.assign(new Error("USE_SIGNED_URL"), { signedUrl: url });
//     // For direct streaming (acceptable for small files, avoid for large ones):
//     const response = await this.client.send(cmd);
//     return Buffer.from(await response.Body!.transformToByteArray());
//   }
//
//   async remove(key: string): Promise<void> {
//     const { DeleteObjectCommand } = require("@aws-sdk/client-s3");
//     try {
//       await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
//     } catch {
//       // Idempotent — S3 delete of a missing key is not an error
//     }
//   }
//
//   async getSignedUrl(key: string, expiresInSeconds = 300): Promise<string> {
//     const { GetObjectCommand } = require("@aws-sdk/client-s3");
//     const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
//     const cmd = new GetObjectCommand({ Bucket: this.bucket, Key: key });
//     return getSignedUrl(this.client, cmd, { expiresIn: expiresInSeconds });
//   }
// }

// ── Provider factory ──────────────────────────────────────────────────────────

let _provider: StorageProvider | null = null;

/**
 * Returns the singleton StorageProvider for the current environment.
 * Selected by STORAGE_PROVIDER env var (default: "local").
 */
export function getProvider(): StorageProvider {
  if (_provider) return _provider;

  const backend = (process.env.STORAGE_PROVIDER ?? "local").toLowerCase();

  switch (backend) {
    case "local":
      _provider = new LocalStorageProvider();
      break;
    // case "s3":
    //   _provider = new S3StorageProvider();
    //   break;
    default:
      console.warn(`Unknown STORAGE_PROVIDER="${backend}", falling back to local`);
      _provider = new LocalStorageProvider();
  }

  console.log(`[storage] provider=${_provider.name}`);
  return _provider;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Validates that a storage key cannot be used to traverse the filesystem.
 * Keys are UUID-based and must not contain path separators or leading dots.
 */
function validateKey(key: string): void {
  if (!key || key.includes("/") || key.includes("\\") || key.startsWith(".")) {
    throw new Error(`Invalid storage key: ${key}`);
  }
}

/** Compute the SHA-256 hex digest of a buffer. Stored as `checksum` in the DB. */
export function computeChecksum(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

// ── Public API (backward-compatible façade) ───────────────────────────────────

/**
 * Save a file buffer. Returns a SaveResult containing the storage key,
 * SHA-256 checksum, and provider name — persist all three in the DB.
 */
export async function saveFile(
  buffer: Buffer,
  originalname: string
): Promise<SaveResult> {
  const provider = getProvider();
  const key = await provider.save(buffer, originalname);
  const checksum = computeChecksum(buffer);
  return { key, checksum, provider: provider.name };
}

/**
 * Load a file buffer by its storage key.
 * Throws if the file does not exist.
 */
export async function loadFile(key: string): Promise<Buffer> {
  return getProvider().load(key);
}

/**
 * Delete a file by its storage key. Idempotent.
 */
export async function removeFile(key: string): Promise<void> {
  return getProvider().remove(key);
}
