/**
 * export-metadata.test.ts
 *
 * Unit tests for the shared export utility layer.
 * These tests are the regression gate for the export subsystem —
 * they must remain green before any export-related PR can merge.
 *
 * Run:  cd server && bun run test
 */

import { describe, it, expect } from "vitest";
import {
  isoDate, isoTs, buildPeriodLabel, buildFilename,
  MAX_EXPORT_ROWS, enforceRowLimit, validateSheet, buildCsv,
  type Sheet, type ExportMeta,
} from "../export-metadata";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSheet(overrides: Partial<Sheet> = {}): Sheet {
  return {
    name:    "Test Sheet",
    headers: ["Date", "Count", "Compliance (%)"],
    keys:    ["date", "count", "compliance_pct"],
    types:   ["date_iso", "integer", "percent"],
    rows:    [
      ["2026-04-01", 42, 87],
      ["2026-04-02", 0,  null],
    ],
    ...overrides,
  };
}

function makeMeta(overrides: Partial<ExportMeta> = {}): ExportMeta {
  return {
    title:      "Overview Report",
    section:    "overview",
    dateLabel:  "last_30_days",
    filterDesc: "None",
    exportedBy: "Test User",
    exportedAt: "2026-04-21 14:23:00 UTC",
    ...overrides,
  };
}

// ── isoDate ───────────────────────────────────────────────────────────────────

describe("isoDate()", () => {
  it("formats a Date object as YYYY-MM-DD", () => {
    expect(isoDate(new Date("2026-04-21T14:00:00Z"))).toBe("2026-04-21");
  });

  it("passes through an already-ISO string", () => {
    expect(isoDate("2026-01-15")).toBe("2026-01-15");
  });

  it("preserves month padding", () => {
    expect(isoDate(new Date("2026-03-05T00:00:00Z"))).toBe("2026-03-05");
  });
});

// ── isoTs ─────────────────────────────────────────────────────────────────────

describe("isoTs()", () => {
  it("returns a string ending with ' UTC'", () => {
    expect(isoTs()).toMatch(/ UTC$/);
  });

  it("formats a specific date correctly", () => {
    expect(isoTs(new Date("2026-04-21T14:23:00Z"))).toBe("2026-04-21 14:23:00 UTC");
  });

  it("is exactly 23 characters long", () => {
    expect(isoTs(new Date("2026-01-01T00:00:00Z")).length).toBe(23);
  });
});

// ── buildPeriodLabel ──────────────────────────────────────────────────────────

describe("buildPeriodLabel()", () => {
  it("returns a date range when from+to are provided", () => {
    expect(buildPeriodLabel("30", "2026-03-01", "2026-03-31")).toBe("2026-03-01 to 2026-03-31");
  });

  it("returns period slug when only period is provided", () => {
    expect(buildPeriodLabel("30")).toBe("last_30_days");
    expect(buildPeriodLabel("7")).toBe("last_7_days");
    expect(buildPeriodLabel("90")).toBe("last_90_days");
  });

  it("falls back to last_30_days when nothing is provided", () => {
    expect(buildPeriodLabel()).toBe("last_30_days");
  });
});

// ── buildFilename ─────────────────────────────────────────────────────────────

describe("buildFilename()", () => {
  const at = "2026-04-21 14:23:00 UTC";

  it("produces the canonical ITSM_Title_YYYY-MM-DD.ext format", () => {
    expect(buildFilename("Overview Report", at, "xlsx")).toBe("ITSM_Overview_Report_2026-04-21.xlsx");
    expect(buildFilename("SLA Report",      at, "csv" )).toBe("ITSM_SLA_Report_2026-04-21.csv");
    expect(buildFilename("My Analysis",     at, "pdf" )).toBe("ITSM_My_Analysis_2026-04-21.pdf");
  });

  it("strips special characters from the title", () => {
    expect(buildFilename("Q1 & Q2 Report!", at, "xlsx")).toBe("ITSM_Q1_Q2_Report_2026-04-21.xlsx");
  });

  it("collapses consecutive spaces/underscores", () => {
    expect(buildFilename("A  B   C", at, "csv")).toBe("ITSM_A_B_C_2026-04-21.csv");
  });

  it("uses the export date (first 10 chars of exportedAt), not the data range", () => {
    const filename = buildFilename("Test", at, "xlsx");
    expect(filename).toContain("2026-04-21");
    expect(filename).not.toContain("2026-03");
  });
});

// ── enforceRowLimit ───────────────────────────────────────────────────────────

describe("enforceRowLimit()", () => {
  it("returns the sheet unchanged when rows <= MAX_EXPORT_ROWS", () => {
    const sheet = makeSheet();
    const result = enforceRowLimit(sheet);
    expect(result).toBe(sheet);           // same reference — no copy made
    expect(result.rows).toHaveLength(2);
  });

  it("truncates rows to MAX_EXPORT_ROWS when exceeded", () => {
    const rows = Array.from({ length: MAX_EXPORT_ROWS + 100 }, (_, i) => [
      `2026-01-${String(i % 28 + 1).padStart(2, "0")}`, i, null,
    ]);
    const sheet = makeSheet({ rows });
    const result = enforceRowLimit(sheet);

    // Exactly MAX_EXPORT_ROWS data rows + 1 warning row
    expect(result.rows).toHaveLength(MAX_EXPORT_ROWS + 1);
  });

  it("appends a warning row as the last row when truncated", () => {
    const rows = Array.from({ length: MAX_EXPORT_ROWS + 1 }, () => ["2026-01-01", 1, 50]);
    const result = enforceRowLimit(makeSheet({ rows }));
    const lastRow = result.rows[result.rows.length - 1]!;
    const warningText = String(lastRow[0]);
    expect(warningText).toMatch(/TRUNCATED/);
    expect(warningText).toMatch(/1.*row.*omitted/i);
  });

  it("warning row has the same column count as the sheet headers", () => {
    const rows = Array.from({ length: MAX_EXPORT_ROWS + 5 }, () => ["2026-01-01", 1, 50]);
    const sheet = makeSheet({ rows });
    const result = enforceRowLimit(sheet);
    const lastRow = result.rows[result.rows.length - 1]!;
    expect(lastRow).toHaveLength(sheet.headers.length);
  });
});

// ── validateSheet ─────────────────────────────────────────────────────────────

describe("validateSheet()", () => {
  it("accepts a valid sheet without throwing", () => {
    expect(() => validateSheet(makeSheet())).not.toThrow();
  });

  it("throws when sheet name is empty", () => {
    expect(() => validateSheet(makeSheet({ name: "" }))).toThrow(/name cannot be empty/i);
  });

  it("throws when sheet name exceeds 31 characters", () => {
    expect(() => validateSheet(makeSheet({ name: "A".repeat(32) }))).toThrow(/31-character/i);
  });

  it("throws when headers array is empty", () => {
    expect(() => validateSheet(makeSheet({ headers: [], types: [], keys: [] }))).toThrow(/empty/i);
  });

  it("throws when headers and types arrays have different lengths", () => {
    expect(() =>
      validateSheet(makeSheet({ types: ["string"] }))  // only 1 type vs 3 headers
    ).toThrow(/headers.*types.*same length/i);
  });

  it("throws when headers and keys arrays have different lengths", () => {
    expect(() =>
      validateSheet(makeSheet({ keys: ["date"] }))  // only 1 key vs 3 headers
    ).toThrow(/headers.*keys.*same length/i);
  });

  it("throws when a data row has wrong column count", () => {
    expect(() =>
      validateSheet(makeSheet({ rows: [["2026-04-01", 5]]  }))  // 2 cols vs 3 expected
    ).toThrow(/row 0/i);
  });
});

// ── buildCsv ──────────────────────────────────────────────────────────────────

describe("buildCsv()", () => {
  it("starts with UTF-8 BOM as the very first character", () => {
    const csv = buildCsv(makeMeta(), [makeSheet()]);
    expect(csv.charCodeAt(0)).toBe(0xFEFF);
  });

  it("BOM is not followed immediately by a newline (not on its own line)", () => {
    const csv = buildCsv(makeMeta(), [makeSheet()]);
    // BOM + '#' — the first comment starts immediately
    expect(csv.slice(0, 2)).toBe("\uFEFF#");
  });

  it("includes metadata block as # comment lines", () => {
    const meta = makeMeta({
      title:      "SLA Report",
      dateLabel:  "last_30_days",
      filterDesc: "priority=urgent",
      exportedBy: "Alice",
      exportedAt: "2026-04-21 14:23:00 UTC",
    });
    const csv = buildCsv(meta, [makeSheet()]);
    expect(csv).toContain("# Report: SLA Report");
    expect(csv).toContain("# Period: last_30_days");
    expect(csv).toContain("# Filters: priority=urgent");
    expect(csv).toContain("# Exported By: Alice");
    expect(csv).toContain("# Exported At: 2026-04-21 14:23:00 UTC");
  });

  it("uses human-readable column headers (sheet.headers, not sheet.keys)", () => {
    const sheet = makeSheet();
    const csv   = buildCsv(makeMeta(), [sheet]);
    // Headers (human-readable)
    expect(csv).toContain("Date,Count,Compliance (%)");
    // Keys (snake_case) should NOT appear as column headers
    expect(csv).not.toMatch(/^date,count,compliance_pct/m);
  });

  it("emits ## section markers before each sheet", () => {
    const sheet = makeSheet({ name: "Daily Volume" });
    const csv   = buildCsv(makeMeta(), [sheet]);
    expect(csv).toContain("## Daily Volume");
  });

  it("serialises null values as empty cells (not em-dash or 'null')", () => {
    const sheet = makeSheet({
      rows: [["2026-04-01", null, null]],
    });
    const csv = buildCsv(makeMeta(), [sheet]);
    // A null cell between two commas → "2026-04-01,,"
    expect(csv).toContain("2026-04-01,,");
    expect(csv).not.toContain("—");
    expect(csv).not.toContain("null");
  });

  it("stores numbers as bare numerals, not quoted strings", () => {
    const sheet = makeSheet({ rows: [["2026-04-01", 42, 87]] });
    const csv   = buildCsv(makeMeta(), [sheet]);
    // Numbers must NOT be wrapped in quotes
    expect(csv).toContain(",42,");
    expect(csv).not.toContain('"42"');
  });

  it("quotes fields that contain commas", () => {
    const sheet = makeSheet({
      headers: ["Name", "Value"],
      keys:    ["name", "value"],
      types:   ["string", "string"],
      rows:    [["Smith, John", "100"]],
    });
    const csv = buildCsv(makeMeta(), [sheet]);
    expect(csv).toContain('"Smith, John"');
  });

  it("uses CRLF line endings (RFC 4180)", () => {
    const csv = buildCsv(makeMeta(), [makeSheet()]);
    expect(csv).toContain("\r\n");
    expect(csv.includes("\n") && !csv.includes("\r\n")).toBe(false);
  });

  it("handles multiple sheets — each with a section marker", () => {
    const s1 = makeSheet({ name: "KPI Summary" });
    const s2 = makeSheet({ name: "Daily Volume" });
    const csv = buildCsv(makeMeta(), [s1, s2]);
    expect(csv).toContain("## KPI Summary");
    expect(csv).toContain("## Daily Volume");
  });

  it("handles an empty sheet gracefully — outputs header row, no data rows", () => {
    const empty = makeSheet({ rows: [] });
    const csv   = buildCsv(makeMeta(), [empty]);
    // Header line must be present
    expect(csv).toContain("Date,Count,Compliance (%)");
    // No crash; valid output
    expect(csv.length).toBeGreaterThan(0);
  });

  it("enforces row limit — truncated sheet produces a warning row", () => {
    const bigRows = Array.from({ length: MAX_EXPORT_ROWS + 10 }, () => [
      "2026-04-01", 1, 50,
    ]);
    const sheet = makeSheet({ rows: bigRows });
    const csv   = buildCsv(makeMeta(), [sheet]);
    expect(csv).toContain("TRUNCATED");
    expect(csv).toContain("10 rows omitted");
  });

  it("throws when a sheet has mismatched headers/types arrays", () => {
    const bad = makeSheet({ types: ["string"] });   // 1 type vs 3 headers
    expect(() => buildCsv(makeMeta(), [bad])).toThrow();
  });
});
