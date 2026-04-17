/**
 * change-number.ts — Concurrency-safe change request number generation.
 *
 * Delegates entirely to the shared ticket-number infrastructure, which uses
 * a PostgreSQL atomic upsert (INSERT … ON CONFLICT DO UPDATE … RETURNING) to
 * serialise concurrent increments without gaps or duplicates.
 *
 * Number format
 * ─────────────
 * Controlled by the `ticket_numbering.change_request` section in system settings.
 * Defaults:  prefix="CRQ"  paddingLength=7  startAt=1  resetPeriod="never"
 * Yields:    CRQ0000001, CRQ0000002, … CRQ9999999 (then overflow to 8 digits)
 *
 * Configurable alternatives (via Settings → Ticket Numbering):
 *   prefix="CHG" paddingLength=4  → CHG0001
 *   prefix="RFC" paddingLength=8  → RFC00000001
 *   prefix="CHG" includeDateSegment="year_month" paddingLength=5 → CHG20240400042
 *
 * Immutability guarantee
 * ──────────────────────
 * Numbers are assigned once at creation and stored on the Change record.
 * The counter in ticket_counter is append-only — it only ever increments.
 * Callers MUST NOT call generateChangeNumber() on update paths.
 *
 * Usage
 * ─────
 *   import { generateChangeNumber, previewNextChangeNumber } from "../lib/change-number";
 *
 *   // In POST /api/changes — create path only:
 *   const changeNumber = await generateChangeNumber();
 *
 *   // In the settings UI preview (read-only, no counter mutation):
 *   const preview = await previewNextChangeNumber();
 */

import { generateTicketNumber, previewNextTicketNumber } from "./ticket-number";

/**
 * Returns the next formatted change number (e.g. "CRQ0000042").
 * Atomically increments the ticket_counter row for the "change_request" series.
 * Safe to call from concurrent requests.
 *
 * @param now  Injection point for the current timestamp (defaults to new Date()).
 *             Only relevant when resetPeriod or includeDateSegment is configured.
 */
export async function generateChangeNumber(now = new Date()): Promise<string> {
  // "change_request" is a recognised TicketType in the Prisma schema and maps
  // to the "change_request" series in ticket-number.ts / settings.
  return generateTicketNumber("change_request", now);
}

/**
 * Previews the number that WOULD be issued next without advancing the counter.
 * Safe for use in settings UI live previews. NOT safe for actual record creation.
 *
 * @param now  Injection point for the current timestamp (defaults to new Date()).
 */
export async function previewNextChangeNumber(now = new Date()): Promise<string> {
  return previewNextTicketNumber("change_request", now);
}
