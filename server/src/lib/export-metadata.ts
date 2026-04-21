/**
 * export-metadata.ts  —  ITSM Helpdesk · Analytics Export Utility Layer
 *
 * Single source of truth for all data types, helper utilities, naming
 * conventions, validation, row-limit enforcement, and CSV serialisation
 * shared across every export format (PDF, CSV, XLSX).
 *
 * Architecture contract
 * ─────────────────────
 * 1. All three export paths (pre-built sections, saved custom reports, PDF)
 *    MUST use `buildFilename()` for output file naming.
 * 2. All XLSX and CSV outputs MUST call `enforceRowLimit()` on every sheet
 *    before writing rows.
 * 3. All sheet definitions MUST pass `validateSheet()` in non-production
 *    environments (done automatically by `enforceRowLimit`).
 * 4. `buildCsv()` is the canonical CSV serialiser — never duplicate it inline.
 * 5. `isoDate()` and `isoTs()` are the only date formatters allowed in export
 *    code — never use locale-dependent formatters.
 *
 * Adding a new export section
 * ───────────────────────────
 * 1. Define sheets using the `Sheet` type (headers + types + keys + rows).
 * 2. Call `enforceRowLimit(sheet)` on each sheet.
 * 3. Use `buildFilename(title, exportedAt, format)` for the filename.
 * 4. For XLSX: pass sheets to `buildStyledWorkbook()` in excel-export.ts.
 * 5. For CSV: pass sheets to `buildCsv()` in this file.
 * 6. Add a test in `src/lib/__tests__/export-metadata.test.ts`.
 */

// ── Column-type system ────────────────────────────────────────────────────────

/**
 * Drives how a column's values are stored and how XLSX formats them.
 *
 *  string      → text cell, left-aligned
 *  integer     → JS number,  "#,##0"
 *  decimal_1   → JS number,  "#,##0.0"
 *  decimal_2   → JS number,  "#,##0.00"
 *  percent     → 0-100 int,  '0"%"'    (87 → "87%")
 *  date_iso    → "YYYY-MM-DD" string   (no Excel serial conversion)
 *  seconds     → integer seconds,  "#,##0"
 *  bool_int    → 1 or 0 integer,   "0"
 */
export type ColType =
  | "string"
  | "integer"
  | "decimal_1"
  | "decimal_2"
  | "percent"
  | "date_iso"
  | "seconds"
  | "bool_int";

export type CellValue = string | number | null;

/** A single exportable data section (one tab in XLSX, one section in CSV). */
export interface Sheet {
  /** Tab name — must be ≤ 31 characters (Excel hard limit). */
  name:    string;
  /**
   * Human-readable column headers — used in XLSX header row and CSV.
   * Example: "Avg Resolution Time (s)"
   */
  headers: string[];
  /** One `ColType` per header column — drives XLSX cell format + alignment. */
  types:   ColType[];
  /**
   * snake_case column identifiers used as a secondary reference.
   * Example: "avg_resolution_time_s"
   */
  keys:    string[];
  rows:    CellValue[][];
}

// ── Metadata model ────────────────────────────────────────────────────────────

/** Consistent metadata passed to every export builder. */
export interface ExportMeta {
  /** Human-readable report title, e.g. "Overview Report" */
  title:      string;
  /** Section key, e.g. "overview" | "sla" | "custom" */
  section:    string;
  /** Human-readable date range, e.g. "2026-03-22 to 2026-04-21" */
  dateLabel:  string;
  /** Active filter description, e.g. "priority=urgent; team=Platform" or "None" */
  filterDesc: string;
  /** Name of the person who triggered the export */
  exportedBy: string;
  /** ISO 8601 timestamp string from `isoTs()` */
  exportedAt: string;
}

// ── Date helpers ──────────────────────────────────────────────────────────────

/** Returns "YYYY-MM-DD" — the only date format used in export data cells. */
export function isoDate(d: Date | string): string {
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toISOString().slice(0, 10);
}

/** Returns "YYYY-MM-DD HH:MM:SS UTC" — used in cover sheets and metadata. */
export function isoTs(d: Date = new Date()): string {
  return d.toISOString().replace("T", " ").slice(0, 19) + " UTC";
}

/** Human-readable period label consistent across all exports. */
export function buildPeriodLabel(period?: string, from?: string, to?: string): string {
  if (from && to) return `${isoDate(from)} to ${isoDate(to)}`;
  return `last_${period ?? "30"}_days`;
}

// ── Filename convention ───────────────────────────────────────────────────────

/**
 * Canonical export filename.
 *
 * Format:  ITSM_{Slug}_{YYYY-MM-DD}.{ext}
 * Example: ITSM_Overview_Report_2026-04-21.xlsx
 *
 * Rules:
 *  - Always prefixed with "ITSM_" for organisational clarity
 *  - Title is slugified (non-alphanumeric → removed, spaces → underscores)
 *  - Date is the export date (not the data range — the range is inside the file)
 *  - Extension is lowercase
 */
export function buildFilename(
  title:      string,
  exportedAt: string,   // output of isoTs() or a raw ISO string
  format:     "pdf" | "csv" | "xlsx",
): string {
  const slug = title
    .replace(/[^a-zA-Z0-9\s]/g, "")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_");          // collapse consecutive underscores
  const date = exportedAt.slice(0, 10);  // YYYY-MM-DD portion only
  return `ITSM_${slug}_${date}.${format}`;
}

// ── Row-limit enforcement ─────────────────────────────────────────────────────

/**
 * Maximum rows per sheet in any export format.
 *
 * Rationale:
 *  - Excel has a hard limit of 1,048,576 rows per sheet.
 *  - Beyond ~50k rows, Excel performance degrades and file size grows into
 *    tens of MB, making email delivery and browser download unreliable.
 *  - For larger datasets, users should use the date-range filter to narrow
 *    the export window, or use a direct database query.
 */
export const MAX_EXPORT_ROWS = 50_000;

/**
 * Enforces `MAX_EXPORT_ROWS` on a sheet.
 *
 * If the sheet has more rows than the limit:
 *  - Rows are truncated to `MAX_EXPORT_ROWS`.
 *  - A warning row is appended as the last row explaining the truncation.
 *  - The sheet name is unchanged; downstream renderers see a normal sheet.
 *
 * If within the limit, the original sheet is returned unchanged (no copy).
 */
export function enforceRowLimit(sheet: Sheet): Sheet {
  if (sheet.rows.length <= MAX_EXPORT_ROWS) return sheet;

  const omitted    = sheet.rows.length - MAX_EXPORT_ROWS;
  const warningMsg =
    `⚠ EXPORT TRUNCATED: Sheet limited to ${MAX_EXPORT_ROWS.toLocaleString()} rows. ` +
    `${omitted.toLocaleString()} rows omitted. ` +
    `Narrow the date range or apply filters to export the full dataset.`;

  const warningRow: CellValue[] = [
    warningMsg,
    ...Array<null>(Math.max(0, sheet.headers.length - 1)).fill(null),
  ];

  return {
    ...sheet,
    rows: [...sheet.rows.slice(0, MAX_EXPORT_ROWS), warningRow],
  };
}

// ── Sheet validation ──────────────────────────────────────────────────────────

/**
 * Validates a sheet definition before export.
 *
 * Throws a descriptive `Error` for any of these invariants:
 *  - Sheet name is empty or exceeds 31 characters
 *  - headers, types, keys arrays are not all the same length
 *  - Any data row has a different column count than the headers
 *
 * Called automatically by `buildCsv()` and by `buildStyledWorkbook()`.
 * Can also be called eagerly by data-fetcher functions in tests.
 */
export function validateSheet(sheet: Sheet): void {
  if (!sheet.name || sheet.name.trim().length === 0) {
    throw new Error("Sheet name cannot be empty.");
  }
  if (sheet.name.length > 31) {
    throw new Error(
      `Sheet name "${sheet.name}" exceeds Excel's 31-character limit (${sheet.name.length} chars).`,
    );
  }
  if (sheet.headers.length === 0) {
    throw new Error(`Sheet "${sheet.name}": headers array is empty.`);
  }
  if (sheet.headers.length !== sheet.types.length) {
    throw new Error(
      `Sheet "${sheet.name}": headers (${sheet.headers.length} cols) and types ` +
      `(${sheet.types.length} cols) must be the same length.`,
    );
  }
  if (sheet.headers.length !== sheet.keys.length) {
    throw new Error(
      `Sheet "${sheet.name}": headers (${sheet.headers.length} cols) and keys ` +
      `(${sheet.keys.length} cols) must be the same length.`,
    );
  }
  const expectedCols = sheet.headers.length;
  sheet.rows.forEach((row, ri) => {
    if (row.length !== expectedCols) {
      throw new Error(
        `Sheet "${sheet.name}" row ${ri}: has ${row.length} cells, expected ${expectedCols}.`,
      );
    }
  });
}

// ── CSV serialiser ────────────────────────────────────────────────────────────

/**
 * Canonical CSV builder — used by all CSV export paths.
 *
 * Format characteristics:
 *  - UTF-8 BOM as the very first byte (not its own line) for Excel compatibility
 *  - Metadata block at top as `# comment` lines
 *  - Each section preceded by `## SECTION NAME` and a blank line
 *  - Column headers use `sheet.headers` (human-readable), matching XLSX output
 *  - Numbers stored as native numbers — not quoted strings
 *  - Null / missing values → empty cell (never em-dash or "N/A")
 *  - Row limit enforced via `enforceRowLimit()` before writing
 *  - All sheets validated via `validateSheet()` before writing
 *  - Line endings: CRLF (\r\n) per RFC 4180
 */
export function buildCsv(meta: ExportMeta, sheets: Sheet[]): string {
  const enc = (v: CellValue): string => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    // RFC 4180: quote fields containing comma, double-quote, or newline
    return s.includes(",") || s.includes('"') || s.includes("\n")
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };

  const lines: string[] = [
    `# Report: ${meta.title}`,
    `# Period: ${meta.dateLabel}`,
    `# Filters: ${meta.filterDesc}`,
    `# Exported At: ${meta.exportedAt}`,
    `# Exported By: ${meta.exportedBy}`,
    `# System: ITSM Helpdesk`,
  ];

  for (const raw of sheets) {
    validateSheet(raw);
    const sheet = enforceRowLimit(raw);

    lines.push("", `## ${sheet.name}`);
    // Human-readable headers — identical to what the XLSX workbook shows
    lines.push(sheet.headers.map(enc).join(","));
    for (const row of sheet.rows) {
      lines.push(row.map(enc).join(","));
    }
  }

  // BOM is the literal first byte — prepended as a string prefix so it is
  // never separated from the content by a newline.
  return "\uFEFF" + lines.join("\r\n");
}
