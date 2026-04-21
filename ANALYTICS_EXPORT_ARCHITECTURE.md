# Analytics Export Architecture

This document describes the design, invariants, and extension points of the ITSM Helpdesk analytics export subsystem. It covers all three export formats — **PDF**, **CSV**, and **Excel (XLSX)** — and must be updated whenever the export subsystem changes.

---

## Overview

The export subsystem has three distinct output paths, all built on a shared data model and shared utility layer.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Analytics Report UI                                 │
│                   client/src/pages/reports/*                                │
└──────────────────┬────────────────────────────────────────┬─────────────────┘
                   │ Print button                           │ Download button
                   ▼                                        ▼
     ┌─────────────────────────┐             ┌─────────────────────────┐
     │  usePrintReport (hook)  │             │  POST /api/reports/export│
     │  client/src/hooks/      │             │  server/src/routes/      │
     │  usePrintReport.ts      │             │  reports-export.ts       │
     └────────────┬────────────┘             └──────────┬──────────────┘
                  │                                     │
                  │ PDF (browser print-to-PDF)           │ format: "csv" | "xlsx"
                  ▼                                     ▼
     ┌─────────────────────────┐   ┌──────────────────────────────────────────┐
     │  @media print CSS       │   │  export-metadata.ts  (shared utility)    │
     │  client/src/index.css   │   │  server/src/lib/export-metadata.ts       │
     └─────────────────────────┘   └───────────────┬──────────────────────────┘
                                                    │
                                    ┌───────────────┴──────────────┐
                                    │                              │
                                    ▼                              ▼
                         ┌──────────────────┐           ┌──────────────────┐
                         │  buildCsv()      │           │  buildStyled     │
                         │  export-metadata │           │  Workbook()      │
                         │  .ts             │           │  excel-export.ts │
                         └──────────────────┘           └──────────────────┘
```

---

## Shared Data Model

Every export format is built from the same two types. Both are defined in `server/src/lib/export-metadata.ts` and must be used by any new export path.

### `Sheet`

A single data section — one tab in XLSX, one `## SECTION` block in CSV, one content area in PDF.

```ts
interface Sheet {
  name:    string;       // ≤ 31 chars (Excel hard limit on tab names)
  headers: string[];     // Human-readable column headers
  types:   ColType[];    // One type per header — drives XLSX cell format
  keys:    string[];     // snake_case identifiers (used as secondary ref)
  rows:    CellValue[][]; // null → empty cell in all formats
}
```

### `ExportMeta`

Consistent metadata passed to every export builder.

```ts
interface ExportMeta {
  title:      string;  // e.g. "Overview Report"
  section:    string;  // e.g. "overview" | "sla" | "custom"
  dateLabel:  string;  // e.g. "2026-03-22 to 2026-04-21"
  filterDesc: string;  // e.g. "priority=urgent; team=Platform" or "None"
  exportedBy: string;  // Name of the person who triggered the export
  exportedAt: string;  // Output of isoTs() — "YYYY-MM-DD HH:MM:SS UTC"
}
```

### Column Types (`ColType`)

| Type | Storage | XLSX format | Alignment |
|---|---|---|---|
| `string` | text | — | left |
| `integer` | JS number | `#,##0` | right |
| `decimal_1` | JS number | `#,##0.0` | right |
| `decimal_2` | JS number | `#,##0.00` | right |
| `percent` | 0–100 int | `0"%"` | right |
| `date_iso` | `"YYYY-MM-DD"` | — | left |
| `seconds` | integer seconds | `#,##0` | right |
| `bool_int` | `1` or `0` | `0` | right |

**Rules:**
- Duration columns must store raw integer **seconds** (not formatted strings). Column headers must say `(s)`.
- Percentage columns must store 0–100 integers (not 0.0–1.0 floats). Column headers must say `(%)`.
- Null / missing values must be stored as `null` — never `""`, `"N/A"`, `"—"`, or any other placeholder.
- Dates must use `isoDate()` from `export-metadata.ts` — never locale-dependent formatters.

---

## Export Paths

### 1. PDF Export

**File:** `client/src/hooks/usePrintReport.ts`

PDF export uses the **browser's native print-to-PDF** dialog, not a server-side PDF library. This approach avoids PDF rendering engine dependencies, ensures the exported document matches what the user sees, and works across all browsers.

#### How it works

1. The user clicks "Print / Save as PDF" on any report page.
2. `usePrintReport()` reads `document.getElementById("report-print-area")` — the report content area must have this ID.
3. A `#print-portal` div is appended to `document.body` containing:
   - A `.pf-cover` header with the report title, period, and export timestamp.
   - A post-processed clone of the `#report-print-area` content.
4. `document.body.classList.add("print-active")` is set.
5. `window.print()` is called.
6. On `afterprint`, the portal is removed and `print-active` is cleared.

#### App shell isolation

The CSS rule in `client/src/index.css` is the key isolation mechanism:

```css
@media print {
  body.print-active > * {
    display: none !important;       /* hide everything including #root */
  }
  body.print-active > #print-portal {
    display: block !important;      /* show only the portal */
  }
}
```

This guarantees the sidebar, top-bar, breadcrumbs, and all other app chrome are **never rendered in the print output**, regardless of what the DOM contains.

#### DOM post-processing

Before printing, `processClone()` in `usePrintReport.ts` applies these transforms:

| Transform | Why |
|---|---|
| Add `viewBox` to SVG elements | Recharts charts reflow to printed column width |
| Remove `width`/`height` from SVGs | Let CSS control dimensions |
| Force `100%` width on `.recharts-responsive-container` | Responsive charts fill the page |
| Set `180pt` height on `[data-slot="chart"]` | shadcn `ChartContainer` would otherwise be invisible |
| Strip `button`, `input`, `[role="button"]` | No interactive controls in a printed document |
| Strip `.animate-pulse`, `[data-slot="skeleton"]` | Remove loading states |
| Strip `[data-no-print]` | Explicit exclusion marker for export-control UI |
| Strip `[role="dialog"]`, tooltip wrappers | Remove modal/overlay layers |
| Reset `sticky`/`fixed` positioning | Prevent repeated header/footer artefacts |
| Force 2-column layout on `.grid-cols-1` | A4 width is below the `md:` Tailwind breakpoint |

To **exclude an element from PDF output**, add `data-no-print` to it:
```tsx
<div data-no-print>
  <ExportButton />
</div>
```

#### Filename convention (PDF)

PDF filenames are not set by the browser print dialog — the user sees the page title as the suggested filename. The page `<title>` must be set before printing. See `buildFilename()` below for the canonical format.

---

### 2. CSV Export

**Files:** `server/src/lib/export-metadata.ts` → `buildCsv()`, `server/src/routes/reports-export.ts`

#### Format characteristics

- **UTF-8 BOM** as the very first byte (not a separate line) — required for Excel auto-detection.
- **Metadata comment block** at the top using `#` comment lines (report title, period, filters, exported timestamp, exported by, system name).
- **`## SECTION NAME`** marker before each sheet, followed by a blank line.
- **Human-readable column headers** from `sheet.headers` (not `sheet.keys`).
- **CRLF line endings** per RFC 4180.
- **Native numbers** — never quoted numeric strings.
- **Empty cells** for `null` — never `"N/A"`, `"—"`, or any placeholder string.
- **Row limit enforced** via `enforceRowLimit()` before writing.

Example output structure:
```
[BOM]# Report: Overview Report
# Period: last_30_days
# Filters: None
# Exported At: 2026-04-21 14:23:00 UTC
# Exported By: Alice
# System: ITSM Helpdesk

## KPI Summary
Metric,Value
total_tickets,142
open_tickets,38
...

## Daily Volume
Date,Tickets Created
2026-03-23,12
2026-03-24,8
...
```

---

### 3. Excel (XLSX) Export

**Files:** `server/src/lib/excel-export.ts` → `buildStyledWorkbook()`, `server/src/routes/reports-export.ts`

#### Workbook structure

Every workbook has the following tab layout:

| Tab | Purpose |
|---|---|
| **Cover** | Branded header band, metadata table (exported at/by, filters, system), sheet index (contents list with row counts) |
| **{Section Name}** × N | One data sheet per `Sheet` in `opts.sheets` |

#### Data sheet features

- **Row 1 frozen** — header row remains visible while scrolling.
- **Auto-filter** applied to header row — all columns are filterable by default.
- **Column widths** auto-calculated from header length and data content (min 10, max 48 characters).
- **Alternating row fills** — white / gray-50.
- **Semantic colour overrides** — breach/overdue/failed integer columns render in red; `bool_int` values render green (0) or red (1).
- **Print setup** — landscape A4, fit-to-width, header/footer with sheet name and page numbers.
- **Section accent colour** — each analytics section has a distinct tab and header row colour.
- **Empty state row** — sheets with zero data rows show "No data available for the selected period and filters." in row 2, styled in muted italic text.

#### Section accent colours

| Section | Colour |
|---|---|
| overview | blue-500 |
| tickets | violet-600 |
| sla | emerald-600 |
| agents | sky-600 |
| teams | indigo-600 |
| incidents | rose-600 |
| requests | teal-600 |
| problems | orange-600 |
| approvals | green-600 |
| changes | purple-600 |
| csat | amber-600 |
| kb | cyan-600 |
| realtime | red-600 |
| library | slate-600 |
| (default) | indigo-600 |

---

## Filename Naming Convention

**All three formats** must use `buildFilename()` from `server/src/lib/export-metadata.ts`:

```ts
buildFilename(title: string, exportedAt: string, format: "pdf" | "csv" | "xlsx"): string
```

### Format

```
ITSM_{Slug}_{YYYY-MM-DD}.{ext}
```

### Rules

1. Always prefixed with `ITSM_` for organisational clarity and file findability.
2. Title is slugified: non-alphanumeric characters removed, spaces → underscores, consecutive underscores collapsed.
3. Date is the **export date** (when the file was generated), not the data period. The data period is documented inside the file.
4. Extension is lowercase.

### Examples

| Title | Date | Format | Filename |
|---|---|---|---|
| Overview Report | 2026-04-21 | xlsx | `ITSM_Overview_Report_2026-04-21.xlsx` |
| SLA Report | 2026-04-21 | csv | `ITSM_SLA_Report_2026-04-21.csv` |
| Q1 & Q2 Analysis | 2026-04-21 | pdf | `ITSM_Q1_Q2_Analysis_2026-04-21.pdf` |

---

## Row Limits and Large Reports

**`MAX_EXPORT_ROWS = 50_000`** (defined in `export-metadata.ts`)

For any sheet with more than 50,000 rows:
1. Rows are truncated to `MAX_EXPORT_ROWS`.
2. A **warning row** is appended as the final row with the message:
   > `⚠ EXPORT TRUNCATED: Sheet limited to 50,000 rows. N rows omitted. Narrow the date range or apply filters to export the full dataset.`
3. The warning row has the same column count as the sheet headers (remaining cells are `null`).
4. The sheet name is unchanged; downstream renderers see a normal sheet.

`enforceRowLimit()` is called automatically by:
- `buildCsv()` on each sheet.
- `addDataSheet()` inside `buildStyledWorkbook()`.

**Rationale:** Excel degrades beyond ~50k rows (file size grows into tens of MB, making email delivery and browser download unreliable). For larger datasets, users should narrow the date range or apply filters.

---

## Empty Report Handling

Sheets with zero data rows are handled gracefully by all three paths:

| Format | Behaviour |
|---|---|
| **PDF** | The cloned content area renders its normal empty state UI (the report page's own empty state messaging). |
| **CSV** | The header row is written; no data rows follow. A valid, parse-able CSV is always produced. |
| **XLSX** | Row 1 is the header row. Row 2 contains "No data available for the selected period and filters." in muted italic. |

---

## Date and Time Utilities

All export code **must** use these helpers from `export-metadata.ts` — never locale-dependent formatters:

| Function | Returns | Use for |
|---|---|---|
| `isoDate(d)` | `"YYYY-MM-DD"` | Date column cell values |
| `isoTs(d?)` | `"YYYY-MM-DD HH:MM:SS UTC"` | Cover sheet / metadata timestamps |
| `buildPeriodLabel(period?, from?, to?)` | `"YYYY-MM-DD to YYYY-MM-DD"` or `"last_N_days"` | Period label in all three formats |

---

## How to Add a New Export Section

1. **Define the data fetcher** — a function returning `Sheet[]` in `server/src/routes/reports-export.ts`. Follow the existing pattern (`fetchOverviewSheets`, `fetchSlaSheets`, etc.).

2. **Define the sheets** using the `Sheet` type:
   ```ts
   const sheet: Sheet = {
     name:    "My Sheet",          // ≤ 31 characters
     headers: ["Date", "Count"],   // human-readable
     keys:    ["date", "count"],   // snake_case
     types:   ["date_iso", "integer"],
     rows:    data.map(r => [isoDate(r.date), r.count]),
   };
   ```

3. **Call `enforceRowLimit(sheet)`** on every sheet before passing it to any builder. (This is also called automatically inside `buildCsv` and `buildStyledWorkbook`, but calling it eagerly lets you log or respond to truncation before building.)

4. **Register the section** in `getSheetsForSection()` and `SECTION_TITLES` in `reports-export.ts`.

5. **Register the accent colour** in `SECTION_ACCENT` in `excel-export.ts` (optional — falls back to default indigo).

6. **Write a test** in `server/src/lib/__tests__/export-metadata.test.ts` that validates the sheet structure using `validateSheet()`. No database required — test with representative mock rows.

7. **Use `buildFilename()`** to set the `Content-Disposition` header.

---

## Tests

### Server tests (CSV + XLSX)

```bash
cd server && bun run test
```

| File | What it covers |
|---|---|
| `server/src/lib/__tests__/export-metadata.test.ts` | `isoDate`, `isoTs`, `buildPeriodLabel`, `buildFilename`, `enforceRowLimit`, `validateSheet`, `buildCsv` |
| `server/src/lib/__tests__/excel-export.test.ts` | `buildStyledWorkbook` — Cover sheet content, data sheet structure, freeze/auto-filter, empty sheet handling, row-limit enforcement, multi-sheet workbooks, all section accent keys |

### Client tests (PDF/print)

```bash
cd client && bun run test
```

| File | What it covers |
|---|---|
| `client/src/hooks/usePrintReport.test.tsx` | Cover header (title, period, XSS escaping), app shell isolation, element stripping (buttons/skeletons/dialogs/inputs), SVG normalisation, `body.print-active` class, `window.print()` call count, afterprint cleanup, stale portal cleanup |

### Test invariants (must stay green)

The tests enforce these non-negotiable quality gates:

| # | Invariant | Test |
|---|---|---|
| 1 | PDF portal never contains `<button>`, `<input>`, or skeleton elements | `usePrintReport.test.tsx` |
| 2 | PDF cover always includes report title and period label | `usePrintReport.test.tsx` |
| 3 | PDF title is HTML-escaped (no XSS via report title) | `usePrintReport.test.tsx` |
| 4 | CSV starts with UTF-8 BOM as the literal first character | `export-metadata.test.ts` |
| 5 | CSV uses human-readable headers, not snake_case keys | `export-metadata.test.ts` |
| 6 | CSV null values are empty cells, not em-dashes or "null" | `export-metadata.test.ts` |
| 7 | CSV uses CRLF line endings | `export-metadata.test.ts` |
| 8 | XLSX Cover sheet contains title, period, and filter description | `excel-export.test.ts` |
| 9 | XLSX data sheets have row 1 frozen and auto-filter applied | `excel-export.test.ts` |
| 10 | XLSX empty sheets produce "No data available" message (not a crash) | `excel-export.test.ts` |
| 11 | All exports enforce `MAX_EXPORT_ROWS = 50,000` with a warning row | `export-metadata.test.ts`, `excel-export.test.ts` |
| 12 | All filenames follow `ITSM_{Slug}_{YYYY-MM-DD}.{ext}` | `export-metadata.test.ts`, `excel-export.test.ts` |

---

## Key Files Reference

| File | Role |
|---|---|
| `server/src/lib/export-metadata.ts` | Single source of truth for `Sheet`, `ExportMeta`, `ColType`, `buildFilename`, `buildCsv`, `enforceRowLimit`, `validateSheet`, `isoDate`, `isoTs`, `buildPeriodLabel` |
| `server/src/lib/excel-export.ts` | `buildStyledWorkbook()` — produces styled XLSX Buffer from `WorkbookOptions` |
| `server/src/routes/reports-export.ts` | `POST /api/reports/export` — data fetchers for all sections + route handler |
| `server/src/routes/reports-share.ts` | `POST /api/reports/share-email` — sends formatted report snapshot by email |
| `client/src/hooks/usePrintReport.ts` | Browser print-to-PDF hook — portal creation, DOM post-processing, isolation |
| `client/src/index.css` | Print CSS — `@media print` rules, portal isolation, cover header styles, page geometry |
| `server/src/lib/__tests__/export-metadata.test.ts` | CSV/utility layer regression tests |
| `server/src/lib/__tests__/excel-export.test.ts` | XLSX workbook regression tests |
| `client/src/hooks/usePrintReport.test.tsx` | PDF/print hook regression tests |
