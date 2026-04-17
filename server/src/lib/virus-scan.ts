/**
 * Virus-scan hook.
 *
 * Every uploaded file passes through scanBuffer() before the Attachment row
 * is committed. The result is stored as `virusScanStatus` on the Attachment.
 *
 * ── Current behaviour ──────────────────────────────────────────────────────
 *   Returns "skipped" immediately — no scanner is configured.
 *   Files are still served; add policy logic in the download route if you
 *   want to block serving until a scan completes.
 *
 * ── Integrating a real scanner ─────────────────────────────────────────────
 *   Option A — ClamAV (self-hosted, open source):
 *     bun add clamscan
 *     const NodeClam = require("clamscan");
 *     const clam = await new NodeClam().init({ clamdscan: { active: true } });
 *     const { isInfected } = await clam.scanBuffer(buffer);
 *     return isInfected ? "infected" : "clean";
 *
 *   Option B — VirusTotal API (cloud):
 *     POST https://www.virustotal.com/api/v3/files with the buffer.
 *     Poll GET /analyses/{id} until status is "completed".
 *     Map stats.malicious > 0 → "infected", else → "clean".
 *     Store VIRUSTOTAL_API_KEY in env.
 *
 *   Option C — AWS / Azure / GCP cloud AV:
 *     Upload to object storage first (S3StorageProvider), then trigger
 *     an event-driven scan via S3 EventBridge + Lambda (AWS Malware Protection),
 *     Azure Defender for Storage, or GCP Security Command Center.
 *     The scan result is delivered asynchronously; update `virusScanStatus`
 *     via a webhook endpoint (POST /api/webhooks/scan-result).
 *     In this model, scanBuffer() returns "pending" synchronously.
 *
 * ── Blocking infected uploads ───────────────────────────────────────────────
 *   If the scanner is synchronous (Options A/B), check the result before
 *   calling prisma.attachment.create() and return 422 if "infected".
 *   If asynchronous (Option C), accept the upload, mark status "pending",
 *   and block downloads via:
 *     if (attachment.virusScanStatus === "pending") res.status(202).json(...)
 *     if (attachment.virusScanStatus === "infected") res.status(451).json(...)
 */

export type ScanResult = "clean" | "infected" | "skipped" | "pending";

/**
 * Scan a file buffer before it is persisted.
 *
 * @param buffer    Raw file bytes from multer memory storage.
 * @param filename  Original filename (for logging / scanner metadata).
 * @returns         ScanResult — persisted as `virusScanStatus` on the Attachment.
 */
export async function scanBuffer(
  _buffer: Buffer,
  _filename: string
): Promise<ScanResult> {
  // TODO: replace with a real scanner implementation (see options above).
  // When VIRUS_SCAN_ENABLED=true is set, this function should call the scanner
  // and return "clean" or "infected". Returning "skipped" means no scan ran.
  if (process.env.VIRUS_SCAN_ENABLED === "true") {
    console.warn("[virus-scan] VIRUS_SCAN_ENABLED=true but no scanner is configured — returning skipped");
  }
  return "skipped";
}
