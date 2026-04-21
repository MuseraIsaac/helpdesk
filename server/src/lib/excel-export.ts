/**
 * excel-export.ts
 *
 * Builds presentation-ready, fully-styled Excel workbooks using ExcelJS.
 *
 * Why ExcelJS instead of SheetJS (xlsx):
 *   SheetJS Community Edition has zero cell-styling API.
 *   ExcelJS 4.x exposes the full OOXML styling surface:
 *   fills, fonts, borders, number formats, freeze panes, tab colours,
 *   auto-filter, column widths, print setup — everything needed to produce
 *   a workbook that management can open and use directly without cleanup.
 *
 * Workbook structure:
 *   - Tab "Cover"       : branded header band + metadata table + sheet index
 *   - Tab per Sheet     : column-typed data table, header in row 1, freeze row 1,
 *                         auto-filter, alternating row fills, section accent colour
 *
 * Colour palette (cool, modern, professional):
 *   Brand indigo  #4F46E5  header fills, section accent fallback
 *   Brand dark    #3730A3  cover top stripe, tab colour
 *   Near-black    #111827  primary text
 *   Gray-600      #4B5563  label text, metadata keys
 *   Gray-400      #9CA3AF  empty-state text
 *   Gray-100      #F3F4F6  odd-row fill, section label bg
 *   Gray-50       #F9FAFB  even-row fill
 *   White         #FFFFFF  odd-row fill (default)
 *   Success green #059669  positive booleans, good compliance
 *   Danger red    #DC2626  SLA breached booleans, danger values
 *   Border        #E5E7EB  cell border, divider lines
 */

// ExcelJS is ESM-compatible; Bun resolves the package correctly.
import ExcelJS from "exceljs";
import {
  enforceRowLimit, validateSheet,
} from "./export-metadata";

// Re-export types so callers that already import from excel-export.ts
// don't need to change their import path.
export type { ColType, CellValue, Sheet } from "./export-metadata";

export interface WorkbookOptions {
  title:      string;
  dateLabel:  string;
  section:    string;
  filterDesc: string;
  exportedBy: string;
  exportedAt: string;   // ISO timestamp string — output of isoTs()
  sheets:     Sheet[];
}

// ── Colour palette (all ARGB: AA RR GG BB) ───────────────────────────────────

const C = {
  brand:        "FF4F46E5",
  brandDark:    "FF3730A3",
  brandVeryDark:"FF1E1B4B",
  white:        "FFFFFFFF",
  textPrimary:  "FF111827",
  textLabel:    "FF4B5563",
  textMuted:    "FF9CA3AF",
  textWhite80:  "CCFFFFFF",
  borderLight:  "FFE5E7EB",
  rowOdd:       "FFFFFFFF",
  rowEven:      "FFF9FAFB",
  sectionBg:    "FFF3F4F6",
  success:      "FF059669",
  danger:       "FFDC2626",
  warning:      "FFD97706",
} as const;

/** Section-specific accent colours match the app nav palette */
const SECTION_ACCENT: Record<string, string> = {
  overview:  "FF3B82F6",  // blue-500
  tickets:   "FF7C3AED",  // violet-600
  sla:       "FF059669",  // emerald-600
  agents:    "FF0284C7",  // sky-600
  teams:     "FF4F46E5",  // indigo-600
  incidents: "FFE11D48",  // rose-600
  requests:  "FF0D9488",  // teal-600
  problems:  "FFEA580C",  // orange-600
  approvals: "FF16A34A",  // green-600
  changes:   "FF9333EA",  // purple-600
  csat:      "FFD97706",  // amber-600
  kb:        "FF0891B2",  // cyan-600
  realtime:  "FFDC2626",  // red-600
  library:   "FF475569",  // slate-600
  default:   "FF4F46E5",
};

function accentForSection(section: string): string {
  return SECTION_ACCENT[section] ?? SECTION_ACCENT.default!;
}

// ── Number format strings (Excel OOXML numFmt) ────────────────────────────────

const EXCEL_FMT: Record<ColType, string | undefined> = {
  string:    undefined,
  integer:   "#,##0",
  decimal_1: "#,##0.0",
  decimal_2: "#,##0.00",
  percent:   '0"%"',         // stores integer 87 → displays "87%"
  date_iso:  undefined,      // stored as ISO string, no Excel serial
  seconds:   "#,##0",
  bool_int:  "0",
};

function isNumericType(t: ColType): boolean {
  return t !== "string" && t !== "date_iso";
}

// ── Column-width calculation ──────────────────────────────────────────────────

const MIN_COL_WIDTH = 10;
const MAX_COL_WIDTH = 48;

function calcColWidths(sheet: Sheet): number[] {
  return sheet.headers.map((header, ci) => {
    let max = Math.max(header.length + 3, MIN_COL_WIDTH);
    for (const row of sheet.rows) {
      const v = row[ci];
      if (v != null) {
        const len = String(v).length + 2;
        if (len > max) max = len;
      }
    }
    return Math.min(max, MAX_COL_WIDTH);
  });
}

// ── Shared style helpers ──────────────────────────────────────────────────────

function solidFill(argb: string): ExcelJS.Fill {
  return { type: "pattern", pattern: "solid", fgColor: { argb } };
}

function thinBorder(argb: string): Partial<ExcelJS.Borders> {
  return { bottom: { style: "thin", color: { argb } } };
}

function hairBorder(): Partial<ExcelJS.Borders> {
  return { bottom: { style: "hair", color: { argb: C.borderLight } } };
}

// ── Cover sheet ───────────────────────────────────────────────────────────────

function addCoverSheet(wb: ExcelJS.Workbook, opts: WorkbookOptions): void {
  const ws = wb.addWorksheet("Cover", {
    properties: { tabColor: { argb: C.brandDark } },
  });

  // Fix visible columns: A (labels/merged header) and B (values)
  ws.getColumn(1).width = 24;
  ws.getColumn(2).width = 52;
  // Columns C-H are used for merged header cells only
  for (let c = 3; c <= 8; c++) ws.getColumn(c).width = 10;

  const SPAN = 8; // header merges A-H

  // ── Header band: 3 rows ────────────────────────────────────────────

  // Row 1: Brand / system name
  ws.mergeCells(1, 1, 1, SPAN);
  const r1 = ws.getRow(1);
  r1.height = 30;
  const c1 = ws.getCell("A1");
  c1.value     = "ITSM HELPDESK";
  c1.font      = { name: "Calibri", size: 10, bold: true, color: { argb: C.textWhite80 } };
  c1.fill      = solidFill(C.brandVeryDark);
  c1.alignment = { vertical: "middle", horizontal: "left", indent: 2 };

  // Row 2: Report title (large)
  ws.mergeCells(2, 1, 2, SPAN);
  const r2 = ws.getRow(2);
  r2.height = 52;
  const c2 = ws.getCell("A2");
  c2.value     = opts.title;
  c2.font      = { name: "Calibri", size: 22, bold: true, color: { argb: C.white } };
  c2.fill      = solidFill(C.brand);
  c2.alignment = { vertical: "middle", horizontal: "left", indent: 2 };

  // Row 3: Period subtitle
  ws.mergeCells(3, 1, 3, SPAN);
  const r3 = ws.getRow(3);
  r3.height = 28;
  const c3 = ws.getCell("A3");
  c3.value     = `Period: ${opts.dateLabel}`;
  c3.font      = { name: "Calibri", size: 11, color: { argb: C.textWhite80 } };
  c3.fill      = solidFill(C.brand);
  c3.alignment = { vertical: "middle", horizontal: "left", indent: 2 };

  // ── Spacer ─────────────────────────────────────────────────────────
  ws.getRow(4).height = 10;

  // ── Metadata section ───────────────────────────────────────────────
  const addSectionLabel = (rowNum: number, label: string) => {
    const row = ws.getRow(rowNum);
    row.height = 18;
    const cell = ws.getCell(rowNum, 1);
    ws.mergeCells(rowNum, 1, rowNum, SPAN);
    cell.value     = label;
    cell.font      = { name: "Calibri", size: 8, bold: true, color: { argb: C.textLabel } };
    cell.fill      = solidFill(C.sectionBg);
    cell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    cell.border    = thinBorder(C.borderLight);
  };

  addSectionLabel(5, "REPORT DETAILS");

  const meta: [string, string][] = [
    ["Exported At",     opts.exportedAt],
    ["Exported By",     opts.exportedBy],
    ["Active Filters",  opts.filterDesc || "None"],
    ["System",          "ITSM Helpdesk"],
  ];

  meta.forEach(([label, value], i) => {
    const rowNum = 6 + i;
    ws.getRow(rowNum).height = 22;

    const labelCell = ws.getCell(rowNum, 1);
    labelCell.value     = label;
    labelCell.font      = { name: "Calibri", size: 10, color: { argb: C.textLabel } };
    labelCell.alignment = { vertical: "middle", horizontal: "left", indent: 2 };
    labelCell.border    = hairBorder();

    const valueCell = ws.getCell(rowNum, 2);
    valueCell.value     = value;
    valueCell.font      = { name: "Calibri", size: 10, bold: true, color: { argb: C.textPrimary } };
    valueCell.alignment = { vertical: "middle", horizontal: "left" };
    valueCell.border    = hairBorder();

    // Alternating rows
    if (i % 2 === 1) {
      labelCell.fill = solidFill(C.rowEven);
      valueCell.fill = solidFill(C.rowEven);
    }
  });

  // ── Spacer ─────────────────────────────────────────────────────────
  ws.getRow(6 + meta.length).height = 12;

  // ── Sheet index ────────────────────────────────────────────────────
  const indexStart = 6 + meta.length + 1;
  addSectionLabel(indexStart, "CONTENTS");

  opts.sheets.forEach((sheet, i) => {
    const rowNum = indexStart + 1 + i;
    ws.getRow(rowNum).height = 20;

    const nameCell = ws.getCell(rowNum, 1);
    nameCell.value     = sheet.name;
    nameCell.font      = { name: "Calibri", size: 10, color: { argb: C.brand }, underline: true };
    nameCell.alignment = { vertical: "middle", horizontal: "left", indent: 2 };
    nameCell.border    = hairBorder();

    const countCell = ws.getCell(rowNum, 2);
    const count     = sheet.rows.length;
    countCell.value     = `${count.toLocaleString()} row${count !== 1 ? "s" : ""}`;
    countCell.font      = { name: "Calibri", size: 10, color: { argb: C.textMuted } };
    countCell.alignment = { vertical: "middle", horizontal: "left" };
    countCell.border    = hairBorder();

    if (i % 2 === 1) {
      nameCell.fill  = solidFill(C.rowEven);
      countCell.fill = solidFill(C.rowEven);
    }
  });

  // ── Print setup ────────────────────────────────────────────────────
  ws.pageSetup = { paperSize: 9, orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
}

// ── Data sheet ────────────────────────────────────────────────────────────────

function addDataSheet(
  wb:          ExcelJS.Workbook,
  rawSheet:    Sheet,
  accentArgb:  string,
  isKpiSheet:  boolean,
): void {
  // Validate before rendering; enforce row limit before writing any rows.
  validateSheet(rawSheet);
  const sheet = enforceRowLimit(rawSheet);

  const ws = wb.addWorksheet(sheet.name.slice(0, 31), {
    properties: { tabColor: { argb: accentArgb } },
    views: [{ state: "frozen", ySplit: 1, activeCell: "A2" }],
  });

  const colWidths = calcColWidths(sheet);

  // ── Column definitions ─────────────────────────────────────────────
  sheet.headers.forEach((header, ci) => {
    const col  = ws.getColumn(ci + 1);
    col.width  = colWidths[ci];
    col.key    = sheet.keys[ci] ?? String(ci);
  });

  // ── Header row ─────────────────────────────────────────────────────
  const headerRow = ws.addRow(sheet.headers);
  headerRow.height = 26;

  sheet.headers.forEach((_, ci) => {
    const cell  = headerRow.getCell(ci + 1);
    const type  = sheet.types[ci] ?? "string";
    const isNum = isNumericType(type);

    cell.font      = { name: "Calibri", size: 10, bold: true, color: { argb: C.white } };
    cell.fill      = solidFill(accentArgb);
    cell.alignment = { vertical: "middle", horizontal: isNum ? "right" : "left", wrapText: false };
    cell.border    = { bottom: { style: "medium", color: { argb: C.brandDark } } };
  });

  // Auto-filter on header row
  ws.autoFilter = {
    from: { row: 1, column: 1 },
    to:   { row: 1, column: sheet.headers.length },
  };

  // ── Data rows ──────────────────────────────────────────────────────
  if (sheet.rows.length === 0) {
    // Empty state row
    ws.getRow(2).height = 22;
    const emptyCell = ws.getCell(2, 1);
    emptyCell.value     = "No data available for the selected period and filters.";
    emptyCell.font      = { name: "Calibri", size: 10, italic: true, color: { argb: C.textMuted } };
    emptyCell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    return;
  }

  sheet.rows.forEach((rowData, ri) => {
    const dataRow  = ws.addRow(rowData);
    dataRow.height = isKpiSheet ? 24 : 20;
    const isEven   = ri % 2 === 0;

    rowData.forEach((value, ci) => {
      const cell  = dataRow.getCell(ci + 1);
      const type  = sheet.types[ci] ?? "string";
      const isNum = isNumericType(type);

      // ── Number format ──────────────────────────────────────────────
      const fmt = EXCEL_FMT[type];
      if (fmt && value !== null) cell.numFmt = fmt;

      // ── Alignment ─────────────────────────────────────────────────
      cell.alignment = {
        vertical:   "middle",
        horizontal: isNum ? "right" : "left",
        wrapText:   false,
      };

      // ── Row fill (alternating) ─────────────────────────────────────
      cell.fill = solidFill(isEven ? C.rowOdd : C.rowEven);

      // ── Bottom border (hairline divider) ───────────────────────────
      cell.border = hairBorder();

      // ── Base font ──────────────────────────────────────────────────
      const isBigVal = isKpiSheet && ci === 1;  // value column on KPI sheets
      cell.font = {
        name:  "Calibri",
        size:  isBigVal ? 11 : 10,
        bold:  isBigVal,
        color: { argb: C.textPrimary },
      };

      // ── Semantic colour overrides ──────────────────────────────────
      if (type === "bool_int") {
        if (value === 1) {
          cell.font = { name: "Calibri", size: 10, bold: true, color: { argb: C.danger } };
        } else if (value === 0) {
          cell.font = { name: "Calibri", size: 10, color: { argb: C.success } };
        }
      }

      // Highlight cells labelled *_breached or *_overdue
      if (type === "integer" && value !== null && Number(value) > 0) {
        const key = sheet.keys[ci] ?? "";
        if (key.includes("breach") || key.includes("overdue") || key.includes("failed")) {
          cell.font = { name: "Calibri", size: isBigVal ? 11 : 10, bold: isBigVal, color: { argb: C.danger } };
        }
      }

      // KPI label column: slightly muted
      if (isKpiSheet && ci === 0) {
        cell.font      = { name: "Calibri", size: 10, color: { argb: C.textLabel } };
        cell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
      }
    });
  });

  // ── Print setup ────────────────────────────────────────────────────
  ws.pageSetup = {
    paperSize:   9,
    orientation: "landscape",
    fitToPage:   true,
    fitToWidth:  1,
    fitToHeight: 0,
    margins: {
      left: 0.5, right: 0.5, top: 0.75, bottom: 0.75,
      header: 0.3, footer: 0.3,
    },
  };

  ws.headerFooter = {
    oddHeader: `&L&8&"Calibri,Regular"ITSM Helpdesk \u2014 ${sheet.name}&R&8&"Calibri,Regular"${new Date().toISOString().slice(0, 10)}`,
    oddFooter:  '&C&8&"Calibri,Regular"Page &P of &N',
  };
}

// ── Main builder (async — ExcelJS writes via streams internally) ──────────────

export async function buildStyledWorkbook(opts: WorkbookOptions): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator  = "ITSM Helpdesk";
  wb.company  = "ITSM Helpdesk";
  wb.created  = new Date();
  wb.modified = new Date();

  const accent = accentForSection(opts.section);

  // Cover sheet first
  addCoverSheet(wb, opts);

  // One data sheet per section sheet
  for (const sheet of opts.sheets) {
    const isKpi = sheet.name.toLowerCase().includes("kpi") ||
                  sheet.name.toLowerCase().includes("summary");
    addDataSheet(wb, sheet, accent, isKpi);
  }

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
