/**
 * excel-export.test.ts
 *
 * Regression gate for the XLSX export path.
 *
 * These tests parse the Buffer produced by buildStyledWorkbook() using ExcelJS
 * itself, so they verify the actual OOXML output — not just that the function
 * runs without throwing.  Any change that breaks the workbook structure (missing
 * Cover sheet, wrong sheet count, truncation row absent, etc.) will fail here.
 *
 * Run:  cd server && bun run test
 */

import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { buildStyledWorkbook, type WorkbookOptions } from "../excel-export";
import { MAX_EXPORT_ROWS, enforceRowLimit, type Sheet } from "../export-metadata";

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeSheet(overrides: Partial<Sheet> = {}): Sheet {
  return {
    name:    "Test Sheet",
    headers: ["Date", "Count", "Compliance (%)"],
    keys:    ["date", "count", "compliance_pct"],
    types:   ["date_iso", "integer", "percent"],
    rows: [
      ["2026-04-01", 42, 87],
      ["2026-04-02", 0, null],
    ],
    ...overrides,
  };
}

function makeOpts(overrides: Partial<WorkbookOptions> = {}): WorkbookOptions {
  return {
    title:      "Overview Report",
    section:    "overview",
    dateLabel:  "last_30_days",
    filterDesc: "priority=urgent",
    exportedBy: "Alice",
    exportedAt: "2026-04-21 14:23:00 UTC",
    sheets:     [makeSheet()],
    ...overrides,
  };
}

/** Parse a Buffer produced by buildStyledWorkbook() back into an ExcelJS Workbook. */
async function parseWorkbook(buf: Buffer): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  return wb;
}

// ── Output contract ───────────────────────────────────────────────────────────

describe("buildStyledWorkbook() — output contract", () => {
  it("returns a non-empty Buffer", async () => {
    const buf = await buildStyledWorkbook(makeOpts());
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.length).toBeGreaterThan(0);
  });

  it("produces a parseable XLSX file (valid OOXML)", async () => {
    const buf = await buildStyledWorkbook(makeOpts());
    await expect(parseWorkbook(buf)).resolves.toBeDefined();
  });
});

// ── Cover sheet ───────────────────────────────────────────────────────────────

describe("Cover sheet", () => {
  it("is the first sheet and named 'Cover'", async () => {
    const wb = await parseWorkbook(await buildStyledWorkbook(makeOpts()));
    const first = wb.worksheets[0];
    expect(first?.name).toBe("Cover");
  });

  it("contains the report title in cell A2", async () => {
    const wb = await parseWorkbook(await buildStyledWorkbook(makeOpts({ title: "SLA Compliance Report" })));
    const cover = wb.getWorksheet("Cover")!;
    const titleCell = cover.getCell("A2").value;
    expect(String(titleCell)).toContain("SLA Compliance Report");
  });

  it("contains the period label in cell A3", async () => {
    const wb = await parseWorkbook(await buildStyledWorkbook(makeOpts({ dateLabel: "2026-03-01 to 2026-03-31" })));
    const cover = wb.getWorksheet("Cover")!;
    const periodCell = cover.getCell("A3").value;
    expect(String(periodCell)).toContain("2026-03-01 to 2026-03-31");
  });

  it("contains the filter description in the metadata block", async () => {
    const wb = await parseWorkbook(await buildStyledWorkbook(makeOpts({ filterDesc: "team=Platform; priority=urgent" })));
    const cover = wb.getWorksheet("Cover")!;

    // Scan all cells in the cover sheet for the filter string
    let found = false;
    cover.eachRow((row) => {
      row.eachCell((cell) => {
        if (String(cell.value ?? "").includes("team=Platform")) found = true;
      });
    });
    expect(found).toBe(true);
  });

  it("contains the exported-by name in the metadata block", async () => {
    const wb = await parseWorkbook(await buildStyledWorkbook(makeOpts({ exportedBy: "Bob" })));
    const cover = wb.getWorksheet("Cover")!;

    let found = false;
    cover.eachRow((row) => {
      row.eachCell((cell) => {
        if (String(cell.value ?? "").includes("Bob")) found = true;
      });
    });
    expect(found).toBe(true);
  });

  it("contains an entry for each data sheet in the sheet index", async () => {
    const opts = makeOpts({
      sheets: [
        makeSheet({ name: "KPI Summary" }),
        makeSheet({ name: "Daily Volume" }),
        makeSheet({ name: "By Priority" }),
      ],
    });
    const wb = await parseWorkbook(await buildStyledWorkbook(opts));
    const cover = wb.getWorksheet("Cover")!;

    const allText: string[] = [];
    cover.eachRow((row) => {
      row.eachCell((cell) => allText.push(String(cell.value ?? "")));
    });
    const joined = allText.join(" ");
    expect(joined).toContain("KPI Summary");
    expect(joined).toContain("Daily Volume");
    expect(joined).toContain("By Priority");
  });

  it("shows 'None' when filterDesc is empty or blank", async () => {
    const wb = await parseWorkbook(await buildStyledWorkbook(makeOpts({ filterDesc: "" })));
    const cover = wb.getWorksheet("Cover")!;
    let found = false;
    cover.eachRow((row) => {
      row.eachCell((cell) => {
        if (String(cell.value ?? "") === "None") found = true;
      });
    });
    expect(found).toBe(true);
  });
});

// ── Sheet count and naming ────────────────────────────────────────────────────

describe("Sheet count and naming", () => {
  it("workbook has Cover + one data sheet per sheet in opts.sheets", async () => {
    const opts = makeOpts({ sheets: [makeSheet({ name: "Alpha" }), makeSheet({ name: "Beta" })] });
    const wb = await parseWorkbook(await buildStyledWorkbook(opts));
    expect(wb.worksheets).toHaveLength(3); // Cover + Alpha + Beta
  });

  it("data sheet names match the Sheet.name values (truncated to 31 chars)", async () => {
    const opts = makeOpts({
      sheets: [
        makeSheet({ name: "Agent Performance" }),
        makeSheet({ name: "SLA By Priority" }),
      ],
    });
    const wb   = await parseWorkbook(await buildStyledWorkbook(opts));
    const names = wb.worksheets.map((ws) => ws.name);
    expect(names).toContain("Agent Performance");
    expect(names).toContain("SLA By Priority");
  });
});

// ── Data sheet structure ──────────────────────────────────────────────────────

describe("Data sheet structure", () => {
  it("header row is row 1 — contains correct human-readable column names", async () => {
    const sheet = makeSheet({ headers: ["Date", "Ticket Count", "SLA (%)"] });
    const wb    = await parseWorkbook(await buildStyledWorkbook(makeOpts({ sheets: [sheet] })));
    const ws    = wb.getWorksheet("Test Sheet")!;
    const row1  = ws.getRow(1);
    const cells = [row1.getCell(1).value, row1.getCell(2).value, row1.getCell(3).value];
    expect(cells).toEqual(["Date", "Ticket Count", "SLA (%)"]);
  });

  it("data begins on row 2 — row 2 contains first data row values", async () => {
    const sheet = makeSheet({
      rows: [["2026-04-01", 42, 87], ["2026-04-02", 0, null]],
    });
    const wb  = await parseWorkbook(await buildStyledWorkbook(makeOpts({ sheets: [sheet] })));
    const ws  = wb.getWorksheet("Test Sheet")!;
    const row2 = ws.getRow(2);
    expect(row2.getCell(1).value).toBe("2026-04-01");
    expect(row2.getCell(2).value).toBe(42);
  });

  it("workbook has the correct total row count (header + data rows)", async () => {
    const sheet = makeSheet({
      rows: Array.from({ length: 10 }, (_, i) => [`2026-04-${String(i + 1).padStart(2, "0")}`, i, 80]),
    });
    const wb = await parseWorkbook(await buildStyledWorkbook(makeOpts({ sheets: [sheet] })));
    const ws = wb.getWorksheet("Test Sheet")!;
    // rowCount includes header + all filled rows
    expect(ws.rowCount).toBe(11); // 1 header + 10 data rows
  });

  it("freeze pane is set on row 1 (ySplit = 1)", async () => {
    const wb   = await parseWorkbook(await buildStyledWorkbook(makeOpts()));
    const ws   = wb.getWorksheet("Test Sheet")!;
    const view = ws.views[0];
    expect(view?.state).toBe("frozen");
    expect((view as ExcelJS.WorksheetViewFrozen)?.ySplit).toBe(1);
  });

  it("auto-filter is applied to header row", async () => {
    const wb  = await parseWorkbook(await buildStyledWorkbook(makeOpts()));
    const ws  = wb.getWorksheet("Test Sheet")!;
    // ExcelJS exposes autoFilter as an object or undefined when absent
    expect(ws.autoFilter).toBeDefined();
  });
});

// ── Empty sheet handling ──────────────────────────────────────────────────────

describe("Empty sheet handling", () => {
  it("does not throw when a sheet has zero data rows", async () => {
    const empty = makeSheet({ rows: [] });
    await expect(buildStyledWorkbook(makeOpts({ sheets: [empty] }))).resolves.toBeDefined();
  });

  it("still produces a valid workbook for an empty sheet", async () => {
    const empty = makeSheet({ rows: [] });
    const buf   = await buildStyledWorkbook(makeOpts({ sheets: [empty] }));
    await expect(parseWorkbook(buf)).resolves.toBeDefined();
  });

  it("empty sheet still has a header row (row 1)", async () => {
    const empty = makeSheet({ rows: [], headers: ["Date", "Count", "Compliance (%)"] });
    const wb    = await parseWorkbook(await buildStyledWorkbook(makeOpts({ sheets: [empty] })));
    const ws    = wb.getWorksheet("Test Sheet")!;
    const row1  = ws.getRow(1);
    expect(row1.getCell(1).value).toBe("Date");
  });

  it("empty sheet puts 'No data available' message on row 2", async () => {
    const empty = makeSheet({ rows: [] });
    const wb    = await parseWorkbook(await buildStyledWorkbook(makeOpts({ sheets: [empty] })));
    const ws    = wb.getWorksheet("Test Sheet")!;
    const row2  = ws.getRow(2);
    const text  = String(row2.getCell(1).value ?? "");
    expect(text).toMatch(/no data available/i);
  });
});

// ── Row-limit enforcement ─────────────────────────────────────────────────────

describe("Row-limit enforcement inside buildStyledWorkbook()", () => {
  // Building a 50k-row workbook is an expensive I/O operation — 30s timeout.
  it("truncates oversized sheets and appends a warning row", async () => {
    const bigRows = Array.from({ length: MAX_EXPORT_ROWS + 50 }, (_, i) => [
      `2026-01-${String((i % 28) + 1).padStart(2, "0")}`, i, 80,
    ]);
    const sheet = makeSheet({ rows: bigRows });
    const wb    = await parseWorkbook(await buildStyledWorkbook(makeOpts({ sheets: [sheet] })));
    const ws    = wb.getWorksheet("Test Sheet")!;

    // 1 header + MAX_EXPORT_ROWS data rows + 1 warning row
    expect(ws.rowCount).toBe(MAX_EXPORT_ROWS + 2);

    // Last row must contain the truncation warning
    const lastRow = ws.getRow(ws.rowCount);
    const text    = String(lastRow.getCell(1).value ?? "");
    expect(text).toMatch(/TRUNCATED/);
  }, 30_000);

  it("does not truncate sheets within the row limit", async () => {
    const sheet = makeSheet({
      rows: Array.from({ length: 100 }, () => ["2026-04-01", 1, 80]),
    });
    const wb = await parseWorkbook(await buildStyledWorkbook(makeOpts({ sheets: [sheet] })));
    const ws = wb.getWorksheet("Test Sheet")!;
    expect(ws.rowCount).toBe(101); // 1 header + 100 data
  });

  it("enforceRowLimit() — unit check — truncates and appends warning without building workbook", () => {
    // Fast unit test using the already-imported enforceRowLimit directly,
    // avoiding the expensive XLSX serialisation roundtrip.
    const bigRows = Array.from({ length: MAX_EXPORT_ROWS + 200 }, () => ["2026-04-01", 1, 80] as const);
    const sheet  = makeSheet({ rows: bigRows.map(r => [...r]) });
    const result = enforceRowLimit(sheet);
    expect(result.rows).toHaveLength(MAX_EXPORT_ROWS + 1);
    expect(String(result.rows[result.rows.length - 1]![0])).toMatch(/TRUNCATED/);
  });
});

// ── Multiple sheets ───────────────────────────────────────────────────────────

describe("Multiple sheet workbook", () => {
  it("all sheets are present with correct row counts", async () => {
    const s1 = makeSheet({ name: "Sheet One", rows: [["2026-04-01", 10, 90], ["2026-04-02", 5, 85]] });
    const s2 = makeSheet({ name: "Sheet Two", rows: [["2026-04-01", 3, 95]] });
    const s3 = makeSheet({ name: "Sheet Three", rows: [] });

    const wb = await parseWorkbook(await buildStyledWorkbook(makeOpts({ sheets: [s1, s2, s3] })));

    expect(wb.getWorksheet("Sheet One")!.rowCount).toBe(3);   // header + 2 rows
    expect(wb.getWorksheet("Sheet Two")!.rowCount).toBe(2);   // header + 1 row
    expect(wb.getWorksheet("Sheet Three")!.rowCount).toBe(2); // header + empty-state row
  });
});

// ── Section accent colour ─────────────────────────────────────────────────────

describe("Section accent colour", () => {
  it("workbook builds successfully for every known section key", async () => {
    const sections = [
      "overview","tickets","sla","agents","teams",
      "incidents","requests","problems","approvals",
      "changes","csat","kb","realtime","library",
    ];
    for (const section of sections) {
      const buf = await buildStyledWorkbook(makeOpts({ section }));
      expect(buf.length).toBeGreaterThan(0);
    }
  });

  it("workbook builds for an unknown section key (uses default accent)", async () => {
    const buf = await buildStyledWorkbook(makeOpts({ section: "custom_section_xyz" }));
    expect(buf.length).toBeGreaterThan(0);
  });
});

// ── Filename convention (via export-metadata) ────────────────────────────────

describe("buildFilename() — PDF path coverage", () => {
  // buildFilename is already tested in export-metadata.test.ts for xlsx/csv.
  // This block confirms it also produces the correct format for pdf, since
  // the PDF path (usePrintReport) uses it client-side via the same API contract.
  it("pdf filename follows ITSM_{Slug}_{YYYY-MM-DD}.pdf", async () => {
    // Import lazily to avoid duplication — the source of truth is export-metadata.ts
    const { buildFilename } = await import("../export-metadata");
    expect(buildFilename("Overview Report", "2026-04-21 14:23:00 UTC", "pdf"))
      .toBe("ITSM_Overview_Report_2026-04-21.pdf");
  });
});
