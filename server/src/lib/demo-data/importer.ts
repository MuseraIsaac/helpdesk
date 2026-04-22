/**
 * Demo Data Excel Importer
 *
 * Parses a workbook produced by buildExcelTemplate() (or any conforming file),
 * validates every row, resolves cross-sheet references, and inserts the data
 * as a tracked DemoBatch — using the exact same Prisma calls as the generator
 * so behaviour is consistent.
 *
 * Two public entry-points:
 *   validateExcelImport(buffer)               → dry-run: no DB writes
 *   runExcelImport(buffer, batchId, adminId)  → full insert with progress tracking
 *
 * Safety guarantees
 * ─────────────────
 * • Only newly-created records are tracked in the batch's recordIds.
 *   Pre-existing users/customers whose emails appear in the file are REUSED
 *   for cross-references but are NEVER added to recordIds — so they can never
 *   be deleted by a batch cleanup operation.
 * • All record numbers are prefixed with DEMO-B{batchId}- to prevent collisions
 *   with any existing records.
 * • The import function never wraps all inserts in a single transaction: partial
 *   success is preserved and the batch is marked "error" on failure so the admin
 *   can review and clean up via the normal batch-deletion flow.
 */

import ExcelJS from "exceljs";
import { hashPassword } from "better-auth/crypto";
import prisma from "../../db";
import { daysAgo, pad } from "./data-pools";
import { type BatchProgress, type RecordIds, computeRecordCounts } from "./types";

// ── Public types ──────────────────────────────────────────────────────────────

export interface ValidationError {
  sheet:     string;
  row:       number;
  field?:    string;
  message:   string;
  severity:  "error" | "warning";
}

export interface SheetSummary {
  sheet:      string;
  label:      string;
  totalRows:  number;
  validRows:  number;
  errorRows:  number;
  willCreate: number;
  willSkip:   number;
}

export interface ValidationResult {
  isValid:    boolean;
  canImport:  boolean;
  errors:     ValidationError[];
  warnings:   ValidationError[];
  summary:    SheetSummary[];
}

// ── Internal types ────────────────────────────────────────────────────────────

type RawRow = Record<string, string | number | boolean | null>;

interface ParsedSheet {
  name:  string;
  label: string;
  rows:  { rowNum: number; data: RawRow }[];
}

// ── Cell value normaliser ─────────────────────────────────────────────────────

function cellText(val: ExcelJS.CellValue): string {
  if (val === null || val === undefined) return "";
  if (typeof val === "string")  return val.trim();
  if (typeof val === "number")  return String(val);
  if (typeof val === "boolean") return val ? "TRUE" : "FALSE";
  if (val instanceof Date)      return val.toISOString();
  if (typeof val === "object" && "richText" in val) {
    return (val.richText as { text: string }[]).map((r) => r.text).join("").trim();
  }
  if (typeof val === "object" && "result" in val) {
    // formula cell
    return cellText((val as { result: ExcelJS.CellValue }).result);
  }
  return String(val).trim();
}

function cellNum(val: ExcelJS.CellValue): number | null {
  const s = cellText(val);
  if (!s) return null;
  const n = Number(s.replace(/[,$]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function cellBool(val: ExcelJS.CellValue): boolean | null {
  const s = cellText(val).toUpperCase();
  if (s === "TRUE"  || s === "YES" || s === "1") return true;
  if (s === "FALSE" || s === "NO"  || s === "0") return false;
  return null;
}

function normaliseEnum(val: string, allowed: string[]): string | null {
  const lower = val.toLowerCase().trim();
  if (allowed.includes(lower)) return lower;
  // try exact match (for mixed case enums)
  if (allowed.includes(val.trim())) return val.trim();
  return null;
}

// ── Sheet column schemas ──────────────────────────────────────────────────────

interface ColSchema {
  header:   string;   // stripped header (no " *")
  key:      string;
  required: boolean;
  type?:    "number" | "boolean";
  enum?:    string[];
}

const SHEET_SCHEMAS: Record<string, { label: string; cols: ColSchema[] }> = {
  Users: {
    label: "Users",
    cols: [
      { header: "name",     key: "name",     required: true  },
      { header: "email",    key: "email",    required: true  },
      { header: "role",     key: "role",     required: true,  enum: ["agent","supervisor"] },
      { header: "jobTitle", key: "jobTitle", required: false },
      { header: "phone",    key: "phone",    required: false },
    ],
  },
  Teams: {
    label: "Teams",
    cols: [
      { header: "name",         key: "name",         required: true  },
      { header: "description",  key: "description",  required: false },
      { header: "color",        key: "color",        required: false },
      { header: "memberEmails", key: "memberEmails", required: false },
    ],
  },
  Organisations: {
    label: "Organisations",
    cols: [
      { header: "name",     key: "name",     required: true  },
      { header: "domain",   key: "domain",   required: false },
      { header: "industry", key: "industry", required: false },
      { header: "tier",     key: "tier",     required: false, enum: ["standard","premium","enterprise"] },
      { header: "website",  key: "website",  required: false },
      { header: "country",  key: "country",  required: false },
    ],
  },
  Customers: {
    label: "Customers",
    cols: [
      { header: "name",       key: "name",     required: true  },
      { header: "email",      key: "email",    required: true  },
      { header: "orgName",    key: "orgName",  required: false },
      { header: "jobTitle",   key: "jobTitle", required: false },
      { header: "phone",      key: "phone",    required: false },
      { header: "isVip",      key: "isVip",    required: false, type: "boolean" },
      { header: "supportTier",key: "tier",     required: false, enum: ["standard","premium","enterprise"] },
    ],
  },
  KbArticles: {
    label: "KB Articles",
    cols: [
      { header: "title",      key: "title",      required: true  },
      { header: "summary",    key: "summary",    required: false },
      { header: "body",       key: "body",       required: true  },
      { header: "category",   key: "category",   required: false },
      { header: "tags",       key: "tags",       required: false },
      { header: "visibility", key: "visibility", required: false, enum: ["public","internal"] },
    ],
  },
  Macros: {
    label: "Macros",
    cols: [
      { header: "title", key: "title", required: true },
      { header: "body",  key: "body",  required: true },
    ],
  },
  CatalogItems: {
    label: "Catalog Items",
    cols: [
      { header: "name",        key: "name",        required: true  },
      { header: "description", key: "description", required: false },
      { header: "teamName",    key: "teamName",    required: false },
    ],
  },
  Tickets: {
    label: "Tickets",
    cols: [
      { header: "subject",      key: "subject",       required: true  },
      { header: "body",         key: "body",          required: true  },
      { header: "priority",     key: "priority",      required: false, enum: ["low","medium","high","urgent"] },
      { header: "status",       key: "status",        required: false, enum: ["open","in_progress","resolved","closed"] },
      { header: "customerEmail",key: "customerEmail", required: false },
      { header: "teamName",     key: "teamName",      required: false },
      { header: "agentEmail",   key: "agentEmail",    required: false },
      { header: "senderName",   key: "senderName",    required: false },
    ],
  },
  Incidents: {
    label: "Incidents",
    cols: [
      { header: "title",          key: "title",          required: true  },
      { header: "description",    key: "description",    required: false },
      { header: "priority",       key: "priority",       required: true,  enum: ["p1","p2","p3","p4"] },
      { header: "status",         key: "status",         required: false, enum: ["new","acknowledged","in_progress","resolved","closed"] },
      { header: "affectedSystem", key: "affectedSystem", required: false },
      { header: "affectedUsers",  key: "affectedUsers",  required: false, type: "number" },
      { header: "commanderEmail", key: "commanderEmail", required: false },
      { header: "assigneeEmail",  key: "assigneeEmail",  required: false },
      { header: "teamName",       key: "teamName",       required: false },
      { header: "isMajor",        key: "isMajor",        required: false, type: "boolean" },
      { header: "updateBody",     key: "updateBody",     required: false },
    ],
  },
  ServiceRequests: {
    label: "Service Requests",
    cols: [
      { header: "title",          key: "title",          required: true  },
      { header: "description",    key: "description",    required: false },
      { header: "status",         key: "status",         required: false, enum: ["submitted","pending_approval","approved","in_fulfillment","fulfilled","closed"] },
      { header: "priority",       key: "priority",       required: false, enum: ["low","medium","high","urgent"] },
      { header: "requesterEmail", key: "requesterEmail", required: false },
      { header: "catalogItem",    key: "catalogItem",    required: false },
      { header: "teamName",       key: "teamName",       required: false },
      { header: "assigneeEmail",  key: "assigneeEmail",  required: false },
    ],
  },
  Problems: {
    label: "Problems",
    cols: [
      { header: "title",          key: "title",          required: true  },
      { header: "description",    key: "description",    required: false },
      { header: "status",         key: "status",         required: false, enum: ["new","under_investigation","root_cause_identified","known_error","change_required","resolved","closed"] },
      { header: "priority",       key: "priority",       required: false, enum: ["low","medium","high","urgent"] },
      { header: "affectedService",key: "affectedService",required: false },
      { header: "rootCause",      key: "rootCause",      required: false },
      { header: "workaround",     key: "workaround",     required: false },
      { header: "ownerEmail",     key: "ownerEmail",     required: false },
      { header: "assigneeEmail",  key: "assigneeEmail",  required: false },
      { header: "isKnownError",   key: "isKnownError",   required: false, type: "boolean" },
    ],
  },
  Changes: {
    label: "Changes",
    cols: [
      { header: "title",            key: "title",            required: true  },
      { header: "changeType",       key: "changeType",       required: false, enum: ["standard","normal","emergency"] },
      { header: "state",            key: "state",            required: false, enum: ["draft","submitted","assess","authorize","scheduled","implement","review","closed","cancelled","failed"] },
      { header: "risk",             key: "risk",             required: false, enum: ["low","medium","high","critical"] },
      { header: "priority",         key: "priority",         required: false, enum: ["low","medium","high","urgent"] },
      { header: "justification",    key: "justification",    required: false },
      { header: "rollbackPlan",     key: "rollbackPlan",     required: false },
      { header: "assigneeEmail",    key: "assigneeEmail",    required: false },
      { header: "teamName",         key: "teamName",         required: false },
      { header: "plannedStartDays", key: "plannedStartDays", required: false, type: "number" },
      { header: "plannedEndDays",   key: "plannedEndDays",   required: false, type: "number" },
    ],
  },
  Assets: {
    label: "Assets",
    cols: [
      { header: "name",          key: "name",          required: true  },
      { header: "type",          key: "type",          required: true,  enum: ["end_user_device","hardware","network_equipment","software_license","peripheral","mobile_device","cloud_resource","other"] },
      { header: "status",        key: "status",        required: false, enum: ["in_stock","in_use","under_maintenance","retired","disposed"] },
      { header: "manufacturer",  key: "manufacturer",  required: false },
      { header: "model",         key: "model",         required: false },
      { header: "serialNumber",  key: "serialNumber",  required: false },
      { header: "assetTag",      key: "assetTag",      required: false },
      { header: "purchasePrice", key: "purchasePrice", required: false, type: "number" },
      { header: "warrantyYears", key: "warrantyYears", required: false, type: "number" },
      { header: "assigneeEmail", key: "assigneeEmail", required: false },
      { header: "teamName",      key: "teamName",      required: false },
      { header: "location",      key: "location",      required: false },
    ],
  },
};

// ── Sheet reader ──────────────────────────────────────────────────────────────

function readSheet(wb: ExcelJS.Workbook, name: string): ParsedSheet | null {
  const schema = SHEET_SCHEMAS[name];
  if (!schema) return null;

  const ws = wb.getWorksheet(name);
  if (!ws) return null;

  // Build header → colIndex map from row 1
  const colMap: Record<string, number> = {};
  const headerRow = ws.getRow(1);
  headerRow.eachCell({ includeEmpty: false }, (cell, colNum) => {
    // Strip trailing " *" and whitespace from header
    const raw  = cellText(cell.value).replace(/\s*\*\s*$/, "").trim();
    colMap[raw.toLowerCase()] = colNum;
  });

  const rows: ParsedSheet["rows"] = [];

  ws.eachRow({ includeEmpty: false }, (row, rowNum) => {
    if (rowNum <= 2) return; // skip header + notes rows

    // Check if row is entirely empty (all cells blank)
    let hasData = false;
    row.eachCell({ includeEmpty: false }, () => { hasData = true; });
    if (!hasData) return;

    const data: RawRow = {};
    for (const col of schema.cols) {
      const idx = colMap[col.header.toLowerCase()];
      const rawVal = idx !== undefined ? row.getCell(idx).value : null;

      if (col.type === "number") {
        data[col.key] = cellNum(rawVal);
      } else if (col.type === "boolean") {
        const boolStr = cellText(rawVal);
        data[col.key] = boolStr ? cellBool(rawVal) : null;
      } else {
        const str = cellText(rawVal);
        data[col.key] = str || null;
      }
    }

    rows.push({ rowNum, data });
  });

  return { name, label: schema.label, rows };
}

// ── Row validator ─────────────────────────────────────────────────────────────

function validateRows(
  sheet:  ParsedSheet,
  errors: ValidationError[],
): { validRows: number; errorRows: number } {
  const schema  = SHEET_SCHEMAS[sheet.name]!;
  const emailsSeen = new Set<string>();
  let validRows = 0, errorRows = 0;

  for (const { rowNum, data } of sheet.rows) {
    let rowHasError = false;

    for (const col of schema.cols) {
      const val = data[col.key];

      if (col.required && (val === null || val === undefined || val === "")) {
        errors.push({ sheet: sheet.name, row: rowNum, field: col.key, message: `Required field "${col.header}" is blank`, severity: "error" });
        rowHasError = true;
        continue;
      }

      if (val !== null && val !== undefined && val !== "" && col.enum) {
        const str = String(val);
        const normalised = normaliseEnum(str, col.enum);
        if (normalised === null) {
          errors.push({ sheet: sheet.name, row: rowNum, field: col.key, message: `"${str}" is not a valid value for "${col.header}". Allowed: ${col.enum.join(", ")}`, severity: "error" });
          rowHasError = true;
        } else {
          // Normalise in-place
          data[col.key] = normalised;
        }
      }
    }

    // Duplicate email check within the sheet
    const emailKey = sheet.name === "Users" || sheet.name === "Customers" ? "email" : null;
    if (emailKey && data[emailKey]) {
      const email = String(data[emailKey]).toLowerCase();
      if (emailsSeen.has(email)) {
        errors.push({ sheet: sheet.name, row: rowNum, field: emailKey, message: `Duplicate email "${data[emailKey]}" in this sheet — row will be skipped`, severity: "warning" });
        rowHasError = true;
      } else {
        emailsSeen.add(email);
      }
    }

    rowHasError ? errorRows++ : validRows++;
  }

  return { validRows, errorRows };
}

// ── Workbook parser ───────────────────────────────────────────────────────────

async function parseWorkbook(buffer: Buffer): Promise<Record<string, ParsedSheet>> {
  const wb = new ExcelJS.Workbook();
  // ExcelJS types don't match Bun's Buffer<ArrayBufferLike> generic
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await wb.xlsx.load(buffer as any);

  const sheets: Record<string, ParsedSheet> = {};
  for (const name of Object.keys(SHEET_SCHEMAS)) {
    const sheet = readSheet(wb, name);
    if (sheet && sheet.rows.length > 0) {
      sheets[name] = sheet;
    }
  }
  return sheets;
}

// ── Public: validate only (no DB writes) ─────────────────────────────────────

export async function validateExcelImport(buffer: Buffer): Promise<ValidationResult> {
  const sheets  = await parseWorkbook(buffer);
  const allErrors: ValidationError[] = [];
  const summary: SheetSummary[]       = [];

  for (const name of Object.keys(SHEET_SCHEMAS)) {
    const schema = SHEET_SCHEMAS[name]!;
    const sheet  = sheets[name];

    if (!sheet) {
      summary.push({ sheet: name, label: schema.label, totalRows: 0, validRows: 0, errorRows: 0, willCreate: 0, willSkip: 0 });
      continue;
    }

    const sheetErrors: ValidationError[] = [];
    const { validRows, errorRows } = validateRows(sheet, sheetErrors);
    allErrors.push(...sheetErrors);

    summary.push({
      sheet:      name,
      label:      schema.label,
      totalRows:  sheet.rows.length,
      validRows,
      errorRows,
      willCreate: validRows,
      willSkip:   errorRows,
    });
  }

  const errors   = allErrors.filter((e) => e.severity === "error");
  const warnings = allErrors.filter((e) => e.severity === "warning");
  const totalValid = summary.reduce((s, x) => s + x.validRows, 0);

  return {
    isValid:   errors.length === 0,
    canImport: totalValid > 0,
    errors,
    warnings,
    summary,
  };
}

// ── Progress helpers (mirrors generator.ts) ───────────────────────────────────

async function markRunning(batchId: number, module: string, progress: BatchProgress) {
  (progress as Record<string, unknown>)[module] = { status: "running", count: 0, startedAt: new Date().toISOString() };
  await prisma.demoBatch.update({ where: { id: batchId }, data: { progress: progress as object } });
}

async function markDone(batchId: number, module: string, count: number, progress: BatchProgress) {
  (progress as Record<string, unknown>)[module] = {
    status: "done", count,
    startedAt:   (progress as Record<string, { startedAt?: string }>)[module]?.startedAt,
    completedAt: new Date().toISOString(),
  };
  await prisma.demoBatch.update({ where: { id: batchId }, data: { progress: progress as object } });
}

async function markError(batchId: number, module: string, error: string, progress: BatchProgress) {
  (progress as Record<string, unknown>)[module] = {
    status: "error", count: 0,
    startedAt: (progress as Record<string, { startedAt?: string }>)[module]?.startedAt,
    error,
  };
  await prisma.demoBatch.update({ where: { id: batchId }, data: { progress: progress as object } });
}

// ── Number prefixer (avoids collision with generated records) ─────────────────

function mkNum(prefix: string, batchId: number, i: number) {
  return `${prefix}-B${batchId}-${pad(i + 1, 4)}`;
}

// ── Public: full import ───────────────────────────────────────────────────────

export async function runExcelImport(
  buffer:    Buffer,
  batchId:   number,
  adminId:   string,
  adminName: string,
): Promise<void> {
  const sheets   = await parseWorkbook(buffer);
  const progress = {} as BatchProgress;
  const ids: Partial<RecordIds> = {
    userIds: [], teamIds: [], orgIds: [], customerIds: [],
    kbCategoryIds: [], kbArticleIds: [], macroIds: [],
    catalogItemIds: [], cabGroupIds: [],
    ticketIds: [], incidentIds: [], requestIds: [],
    problemIds: [], changeIds: [], assetIds: [], ciIds: [],
    noteIds: [], replyIds: [], csatRatingIds: [],
    incidentUpdateIds: [], approvalRequestIds: [],
  };

  // Initialise all sheet modules as pending
  const sheetModules = Object.keys(SHEET_SCHEMAS);
  for (const mod of sheetModules) {
    if (sheets[mod]) {
      (progress as Record<string, unknown>)[mod] = { status: "pending", count: 0 };
    }
  }
  await prisma.demoBatch.update({ where: { id: batchId }, data: { progress: progress as object } });

  // ── Resolution maps ──────────────────────────────────────────────────────────
  // Built from the imported sheets; look up DB for fallback resolution.

  const emailToUserId    = new Map<string, string>();
  const teamNameToId     = new Map<string, number>();
  const orgNameToId      = new Map<string, number>();
  const catalogNameToId  = new Map<string, number>();
  const customerEmailToId = new Map<string, number>();

  async function resolveEmail(email: string | null | undefined): Promise<string | null> {
    if (!email) return null;
    const lower = email.toString().toLowerCase().trim();
    if (emailToUserId.has(lower)) return emailToUserId.get(lower)!;
    const user = await prisma.user.findUnique({ where: { email: lower } });
    if (user) { emailToUserId.set(lower, user.id); return user.id; }
    return null;
  }

  async function resolveTeam(name: string | null | undefined): Promise<number | null> {
    if (!name) return null;
    const key = name.toString().trim().toLowerCase();
    if (teamNameToId.has(key)) return teamNameToId.get(key)!;
    const team = await prisma.team.findFirst({ where: { name: { equals: name.toString().trim(), mode: "insensitive" } } });
    if (team) { teamNameToId.set(key, team.id); return team.id; }
    return null;
  }

  async function resolveOrg(name: string | null | undefined): Promise<number | null> {
    if (!name) return null;
    const key = name.toString().trim().toLowerCase();
    if (orgNameToId.has(key)) return orgNameToId.get(key)!;
    const org = await prisma.organization.findFirst({ where: { name: { equals: name.toString().trim(), mode: "insensitive" } } });
    if (org) { orgNameToId.set(key, org.id); return org.id; }
    return null;
  }

  async function resolveCatalogItem(name: string | null | undefined): Promise<number | null> {
    if (!name) return null;
    const key = name.toString().trim().toLowerCase();
    if (catalogNameToId.has(key)) return catalogNameToId.get(key)!;
    const item = await prisma.catalogItem.findFirst({ where: { name: { equals: name.toString().trim(), mode: "insensitive" } } });
    if (item) { catalogNameToId.set(key, item.id); return item.id; }
    return null;
  }

  async function resolveCustomerEmail(email: string | null | undefined): Promise<number | null> {
    if (!email) return null;
    const lower = email.toString().toLowerCase().trim();
    if (customerEmailToId.has(lower)) return customerEmailToId.get(lower)!;
    const cust = await prisma.customer.findUnique({ where: { email: lower } });
    if (cust) { customerEmailToId.set(lower, cust.id); return cust.id; }
    return null;
  }

  const now = new Date();
  const hashedPw = await hashPassword("Demo@Pass1");

  // ── Users ──────────────────────────────────────────────────────────────────

  if (sheets.Users) {
    await markRunning(batchId, "Users", progress);
    let count = 0;

    for (const { data } of sheets.Users.rows) {
      const email = String(data.email ?? "").toLowerCase().trim();
      if (!email || !data.name || !data.role) continue;

      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) {
        // Reuse existing user for cross-references but DON'T track in batch
        emailToUserId.set(email, existing.id);
        continue;
      }

      const role = String(data.role) as "agent" | "supervisor";
      const id   = crypto.randomUUID();
      await prisma.user.create({
        data: {
          id,
          name: String(data.name),
          email,
          emailVerified: false,
          role,
          createdAt: now,
          updatedAt: now,
          preference: {
            create: {
              jobTitle: data.jobTitle ? String(data.jobTitle) : null,
              phone:    data.phone    ? String(data.phone)    : null,
              timezone: "America/New_York",
              language: "en",
              theme:    "system",
              updatedAt: now,
            },
          },
        },
      });
      await prisma.account.create({
        data: {
          id: crypto.randomUUID(), accountId: id, providerId: "credential",
          userId: id, password: hashedPw, createdAt: now, updatedAt: now,
        },
      });

      emailToUserId.set(email, id);
      ids.userIds!.push(id);
      count++;
    }

    await markDone(batchId, "Users", count, progress);
  }

  // ── Teams ──────────────────────────────────────────────────────────────────

  if (sheets.Teams) {
    await markRunning(batchId, "Teams", progress);
    let count = 0;

    for (const { data } of sheets.Teams.rows) {
      if (!data.name) continue;

      const memberEmailList = data.memberEmails
        ? String(data.memberEmails).split(",").map((e) => e.trim().toLowerCase()).filter(Boolean)
        : [];

      const memberUserIds: string[] = [];
      for (const email of memberEmailList) {
        const uid = await resolveEmail(email);
        if (uid) memberUserIds.push(uid);
      }

      const team = await prisma.team.create({
        data: {
          name:        String(data.name).trim(),
          description: data.description ? String(data.description) : undefined,
          color:       data.color       ? String(data.color)       : undefined,
          members: { create: memberUserIds.map((userId) => ({ userId })) },
        },
      });

      teamNameToId.set(String(data.name).trim().toLowerCase(), team.id);
      ids.teamIds!.push(team.id);
      count++;
    }

    await markDone(batchId, "Teams", count, progress);
  }

  // ── Organisations ──────────────────────────────────────────────────────────

  if (sheets.Organisations) {
    await markRunning(batchId, "Organisations", progress);
    let count = 0;

    for (const { data } of sheets.Organisations.rows) {
      if (!data.name) continue;
      const org = await prisma.organization.create({
        data: {
          name:        String(data.name).trim(),
          domain:      data.domain   ? String(data.domain)   : null,
          industry:    data.industry ? String(data.industry) : null,
          supportTier: data.tier     ? String(data.tier)     : "standard",
          isActive:    true,
        },
      });
      orgNameToId.set(String(data.name).trim().toLowerCase(), org.id);
      ids.orgIds!.push(org.id);
      count++;
    }

    await markDone(batchId, "Organisations", count, progress);
  }

  // ── Customers ─────────────────────────────────────────────────────────────

  if (sheets.Customers) {
    await markRunning(batchId, "Customers", progress);
    let count = 0;

    for (const { data } of sheets.Customers.rows) {
      const email = String(data.email ?? "").toLowerCase().trim();
      if (!email || !data.name) continue;

      const existing = await prisma.customer.findUnique({ where: { email } });
      if (existing) {
        customerEmailToId.set(email, existing.id);
        continue;
      }

      const orgId = await resolveOrg(data.orgName as string | null);
      const tier  = data.tier ? String(data.tier) : "standard";

      const cust = await prisma.customer.create({
        data: {
          name:           String(data.name),
          email,
          jobTitle:       data.jobTitle ? String(data.jobTitle) : null,
          phone:          data.phone    ? String(data.phone)    : null,
          organizationId: orgId,
          supportTier:    tier,
          isVip:          data.isVip === true,
          timezone:       "America/New_York",
          language:       "en",
        },
      });

      customerEmailToId.set(email, cust.id);
      ids.customerIds!.push(cust.id);
      count++;
    }

    await markDone(batchId, "Customers", count, progress);
  }

  // ── KB Articles ────────────────────────────────────────────────────────────

  if (sheets.KbArticles) {
    await markRunning(batchId, "KbArticles", progress);
    let count = 0;
    const kbCatMap = new Map<string, number>();

    for (const { data } of sheets.KbArticles.rows) {
      if (!data.title || !data.body) continue;

      // Auto-create category if needed
      let catId: number | null = null;
      if (data.category) {
        const catName = String(data.category).trim();
        const catKey  = catName.toLowerCase();
        if (kbCatMap.has(catKey)) {
          catId = kbCatMap.get(catKey)!;
        } else {
          const existing = await prisma.kbCategory.findFirst({
            where: { name: { equals: catName, mode: "insensitive" } },
          });
          if (existing) {
            catId = existing.id;
          } else {
            const slug    = catName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
            const newCat  = await prisma.kbCategory.create({ data: { name: catName, slug, position: 0 } });
            catId         = newCat.id;
            ids.kbCategoryIds!.push(newCat.id);
          }
          kbCatMap.set(catKey, catId);
        }
      }

      const tags = data.tags
        ? String(data.tags).split(",").map((t) => t.trim()).filter(Boolean)
        : [];

      const slugBase = String(data.title).toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 60);
      const slug     = `${slugBase}-${batchId}-${count + 1}`;

      const art = await prisma.kbArticle.create({
        data: {
          title:       String(data.title),
          slug,
          summary:     data.summary    ? String(data.summary)    : null,
          body:        String(data.body),
          tags,
          status:      "published",
          reviewStatus:"approved",
          visibility:  (data.visibility ? String(data.visibility) : "public") as "public" | "internal",
          categoryId:  catId,
          authorId:    adminId,
          ownerId:     adminId,
          reviewedById:adminId,
          publishedAt: daysAgo(1),
          viewCount:   0,
          helpfulCount:0,
        },
      });

      ids.kbArticleIds!.push(art.id);
      count++;
    }

    await markDone(batchId, "KbArticles", count, progress);
  }

  // ── Macros ────────────────────────────────────────────────────────────────

  if (sheets.Macros) {
    await markRunning(batchId, "Macros", progress);
    let count = 0;

    for (const { data } of sheets.Macros.rows) {
      if (!data.title || !data.body) continue;
      const m = await prisma.macro.create({
        data: {
          title:       String(data.title),
          body:        String(data.body),
          isActive:    true,
          createdById: adminId,
        },
      });
      ids.macroIds!.push(m.id);
      count++;
    }

    await markDone(batchId, "Macros", count, progress);
  }

  // ── Catalog Items ─────────────────────────────────────────────────────────

  if (sheets.CatalogItems) {
    await markRunning(batchId, "CatalogItems", progress);
    let count = 0;

    for (const { data } of sheets.CatalogItems.rows) {
      if (!data.name) continue;
      const teamId = await resolveTeam(data.teamName as string | null);
      const item   = await prisma.catalogItem.create({
        data: {
          name:              String(data.name),
          description:       data.description ? String(data.description) : null,
          isActive:          true,
          fulfillmentTeamId: teamId,
          createdById:       adminId,
        },
      });
      catalogNameToId.set(String(data.name).trim().toLowerCase(), item.id);
      ids.catalogItemIds!.push(item.id);
      count++;
    }

    await markDone(batchId, "CatalogItems", count, progress);
  }

  // ── Tickets ───────────────────────────────────────────────────────────────

  if (sheets.Tickets) {
    await markRunning(batchId, "Tickets", progress);
    let count = 0;

    for (let i = 0; i < sheets.Tickets.rows.length; i++) {
      const { data } = sheets.Tickets.rows[i]!;
      if (!data.subject || !data.body) continue;

      const customerId = await resolveCustomerEmail(data.customerEmail as string | null);
      const custRec    = customerId ? await prisma.customer.findUnique({ where: { id: customerId } }) : null;
      const agentId    = await resolveEmail(data.agentEmail as string | null);
      const teamId     = await resolveTeam(data.teamName as string | null);
      const status     = (data.status as string | null) ?? "open";

      const ticket = await prisma.ticket.create({
        data: {
          ticketNumber:  mkNum("DEMO-TKT", batchId, i),
          subject:       String(data.subject),
          body:          String(data.body),
          status:        status as "open" | "in_progress" | "resolved" | "closed",
          priority:      ((data.priority as string | null) ?? "medium") as "low" | "medium" | "high" | "urgent",
          senderName:    data.senderName ? String(data.senderName) : (custRec?.name ?? "Imported Contact"),
          senderEmail:   custRec?.email  ?? `import-${batchId}-${i}@import.local`,
          customerId,
          assignedToId:  agentId,
          teamId,
          source:        "portal",
          createdAt:     daysAgo(Math.floor(Math.random() * 14) + 1),
          updatedAt:     now,
          ...(["resolved","closed"].includes(status) ? { resolvedAt: daysAgo(1) } : {}),
        },
      });

      ids.ticketIds!.push(ticket.id);
      count++;
    }

    await markDone(batchId, "Tickets", count, progress);
  }

  // ── Incidents ─────────────────────────────────────────────────────────────

  if (sheets.Incidents) {
    await markRunning(batchId, "Incidents", progress);
    let count = 0, updateCount = 0;

    for (let i = 0; i < sheets.Incidents.rows.length; i++) {
      const { data } = sheets.Incidents.rows[i]!;
      if (!data.title || !data.priority) continue;

      const commanderId = await resolveEmail(data.commanderEmail as string | null);
      const assigneeId  = await resolveEmail(data.assigneeEmail  as string | null);
      const teamId      = await resolveTeam(data.teamName as string | null);
      const status      = (data.status as string | null) ?? "new";

      const inc = await prisma.incident.create({
        data: {
          incidentNumber:    mkNum("DEMO-INC", batchId, i),
          title:             String(data.title),
          description:       data.description    ? String(data.description)    : null,
          status:            status as "new" | "acknowledged" | "in_progress" | "resolved" | "closed",
          priority:          String(data.priority) as "p1" | "p2" | "p3" | "p4",
          isMajor:           data.isMajor === true,
          affectedSystem:    data.affectedSystem ? String(data.affectedSystem) : null,
          affectedUserCount: data.affectedUsers  ? Number(data.affectedUsers)  : null,
          commanderId,
          assignedToId:      assigneeId,
          teamId,
          createdById:       commanderId ?? adminId,
          createdAt:         daysAgo(Math.floor(Math.random() * 20) + 1),
          ...(["resolved","closed"].includes(status) ? {
            resolvedAt:     daysAgo(1),
            acknowledgedAt: daysAgo(2),
          } : {}),
        },
      });

      ids.incidentIds!.push(inc.id);
      count++;

      if (data.updateBody) {
        const upd = await prisma.incidentUpdate.create({
          data: {
            incidentId: inc.id,
            updateType: ["resolved","closed"].includes(status) ? "resolution" : "update",
            body:       String(data.updateBody),
            authorId:   assigneeId ?? adminId,
          },
        });
        ids.incidentUpdateIds!.push(upd.id);
        updateCount++;
      }
    }

    await markDone(batchId, "Incidents", count + updateCount, progress);
  }

  // ── Service Requests ──────────────────────────────────────────────────────

  if (sheets.ServiceRequests) {
    await markRunning(batchId, "ServiceRequests", progress);
    let count = 0;

    for (let i = 0; i < sheets.ServiceRequests.rows.length; i++) {
      const { data } = sheets.ServiceRequests.rows[i]!;
      if (!data.title) continue;

      const requesterId = await resolveEmail(data.requesterEmail as string | null);
      const requesterRec = requesterId ? await prisma.user.findUnique({ where: { id: requesterId } }) : null;
      const teamId       = await resolveTeam(data.teamName as string | null);
      const assigneeId   = await resolveEmail(data.assigneeEmail as string | null);
      const catalogId    = await resolveCatalogItem(data.catalogItem as string | null);
      const catalogRec   = catalogId ? await prisma.catalogItem.findUnique({ where: { id: catalogId } }) : null;
      const status       = (data.status as string | null) ?? "submitted";

      const req = await prisma.serviceRequest.create({
        data: {
          requestNumber: mkNum("DEMO-SRQ", batchId, i),
          title:         String(data.title),
          description:   data.description ? String(data.description) : null,
          status:        status as "submitted" | "pending_approval" | "approved" | "in_fulfillment" | "fulfilled" | "closed",
          priority:      ((data.priority as string | null) ?? "medium") as "low" | "medium" | "high" | "urgent",
          requesterId,
          requesterName:  requesterRec?.name  ?? "Imported User",
          requesterEmail: requesterRec?.email ?? `import-${batchId}-${i}@import.local`,
          teamId:         teamId ?? undefined,
          assignedToId:   assigneeId,
          catalogItemId:  catalogId,
          catalogItemName:catalogRec?.name ?? undefined,
          approvalStatus: status === "pending_approval" ? "pending" : "not_required",
          createdById:    requesterId ?? adminId,
          createdAt:      daysAgo(Math.floor(Math.random() * 10) + 1),
          ...(status === "fulfilled" ? { resolvedAt: daysAgo(1) } : {}),
        },
      });

      ids.requestIds!.push(req.id);
      count++;
    }

    await markDone(batchId, "ServiceRequests", count, progress);
  }

  // ── Problems ──────────────────────────────────────────────────────────────

  if (sheets.Problems) {
    await markRunning(batchId, "Problems", progress);
    let count = 0;

    for (let i = 0; i < sheets.Problems.rows.length; i++) {
      const { data } = sheets.Problems.rows[i]!;
      if (!data.title) continue;

      const ownerId    = await resolveEmail(data.ownerEmail    as string | null) ?? adminId;
      const assigneeId = await resolveEmail(data.assigneeEmail as string | null) ?? adminId;

      const prob = await prisma.problem.create({
        data: {
          problemNumber:   mkNum("DEMO-PRB", batchId, i),
          title:           String(data.title),
          status:          ((data.status as string | null) ?? "new") as "new" | "under_investigation" | "root_cause_identified" | "known_error" | "change_required" | "resolved" | "closed",
          priority:        ((data.priority as string | null) ?? "medium") as "low" | "medium" | "high" | "urgent",
          isKnownError:    data.isKnownError === true,
          rootCause:       data.rootCause      ? String(data.rootCause)      : null,
          workaround:      data.workaround     ? String(data.workaround)     : null,
          affectedService: data.affectedService? String(data.affectedService): null,
          ownerId,
          assignedToId:    assigneeId,
          createdAt:       daysAgo(Math.floor(Math.random() * 20) + 5),
        },
      });

      ids.problemIds!.push(prob.id);
      count++;
    }

    await markDone(batchId, "Problems", count, progress);
  }

  // ── Changes ───────────────────────────────────────────────────────────────

  if (sheets.Changes) {
    await markRunning(batchId, "Changes", progress);
    let count = 0;

    for (let i = 0; i < sheets.Changes.rows.length; i++) {
      const { data } = sheets.Changes.rows[i]!;
      if (!data.title) continue;

      const assigneeId = await resolveEmail(data.assigneeEmail as string | null);
      const teamId     = await resolveTeam(data.teamName as string | null);
      const startDays  = data.plannedStartDays != null ? Number(data.plannedStartDays) : -3;
      const endDays    = data.plannedEndDays   != null ? Number(data.plannedEndDays)   : -1;
      const state      = (data.state as string | null) ?? "draft";

      const change = await prisma.change.create({
        data: {
          changeNumber:      mkNum("DEMO-CRQ", batchId, i),
          title:             String(data.title),
          changeType:        ((data.changeType as string | null) ?? "normal") as "standard" | "normal" | "emergency",
          state:             state as "draft" | "submitted" | "assess" | "authorize" | "scheduled" | "implement" | "review" | "closed" | "cancelled" | "failed",
          risk:              ((data.risk     as string | null) ?? "medium") as "low" | "medium" | "high" | "critical",
          priority:          ((data.priority as string | null) ?? "medium") as "low" | "medium" | "high" | "urgent",
          impact:            "medium",
          urgency:           "medium",
          justification:     data.justification ? String(data.justification) : null,
          rollbackPlan:      data.rollbackPlan  ? String(data.rollbackPlan)  : null,
          assignedToId:      assigneeId,
          coordinatorGroupId:teamId,
          createdById:       assigneeId ?? adminId,
          plannedStart:      daysAgo(-startDays),
          plannedEnd:        daysAgo(-endDays),
          createdAt:         daysAgo(Math.floor(Math.random() * 15) + 1),
          ...(state === "closed" ? { closedAt: daysAgo(1), submittedAt: daysAgo(5) } : {}),
        },
      });

      ids.changeIds!.push(change.id);
      count++;
    }

    await markDone(batchId, "Changes", count, progress);
  }

  // ── Assets ────────────────────────────────────────────────────────────────

  if (sheets.Assets) {
    await markRunning(batchId, "Assets", progress);
    let count = 0;

    for (let i = 0; i < sheets.Assets.rows.length; i++) {
      const { data } = sheets.Assets.rows[i]!;
      if (!data.name || !data.type) continue;

      const assigneeId  = await resolveEmail(data.assigneeEmail as string | null);
      const teamId      = await resolveTeam(data.teamName as string | null);
      const price       = data.purchasePrice  != null ? Number(data.purchasePrice)  : null;
      const warYears    = data.warrantyYears   != null ? Number(data.warrantyYears)  : null;
      const purchDate   = daysAgo(Math.floor(Math.random() * 300) + 60);

      const asset = await prisma.asset.create({
        data: {
          assetNumber:     mkNum("DEMO-AST", batchId, i),
          name:            String(data.name),
          type:            String(data.type) as "end_user_device" | "hardware" | "network_equipment" | "software_license" | "peripheral" | "mobile_device" | "cloud_resource" | "other",
          status:          ((data.status as string | null) ?? "in_use") as "in_stock" | "in_use" | "under_maintenance" | "retired" | "disposed",
          condition:       "good",
          manufacturer:    data.manufacturer ? String(data.manufacturer) : null,
          model:           data.model        ? String(data.model)        : null,
          serialNumber:    data.serialNumber ? String(data.serialNumber) : null,
          assetTag:        data.assetTag     ? String(data.assetTag)     : null,
          purchaseDate:    purchDate,
          purchasePrice:   price,
          currency:        "USD",
          vendor:          data.manufacturer ? String(data.manufacturer) : null,
          warrantyExpiry:  warYears ? daysAgo(-(warYears * 365)) : null,
          warrantyType:    warYears ? "Standard Warranty" : null,
          assignedToId:    assigneeId,
          assignedAt:      assigneeId ? daysAgo(Math.floor(Math.random() * 60) + 1) : null,
          teamId,
          location:        data.location ? String(data.location) : null,
          depreciationMethod: "straight_line",
          usefulLifeYears: 3,
          createdById:     adminId,
        },
      });

      ids.assetIds!.push(asset.id);
      count++;
    }

    await markDone(batchId, "Assets", count, progress);
  }

  // ── Finalise batch ────────────────────────────────────────────────────────

  const finalIds = ids as RecordIds;
  const counts   = computeRecordCounts(finalIds);

  await prisma.demoBatch.update({
    where: { id: batchId },
    data: {
      status:      "ready",
      completedAt: now,
      recordIds:   finalIds  as object,
      recordCounts:counts    as object,
      progress:    progress  as object,
    },
  });
}
