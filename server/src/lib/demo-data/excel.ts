/**
 * Demo Data Excel Template Generator
 *
 * Produces a multi-sheet Excel workbook that operators can fill in and
 * re-upload to import custom demo data. Each sheet represents one entity
 * type. Column headers are colour-coded (required vs. optional).
 */

import ExcelJS from "exceljs";

const HEADER_REQUIRED = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FF4F46E5" } };
const HEADER_OPTIONAL = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FF818CF8" } };
const HEADER_FONT     = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };

type ColDef = { header: string; key: string; width: number; required: boolean; note?: string };

function addSheet(wb: ExcelJS.Workbook, name: string, cols: ColDef[], rows: Record<string, unknown>[]) {
  const ws = wb.addWorksheet(name);

  ws.columns = cols.map((c) => ({ header: c.header, key: c.key, width: c.width }));

  // Style header row
  ws.getRow(1).eachCell((cell, colNum) => {
    const col = cols[colNum - 1];
    cell.fill   = col?.required ? HEADER_REQUIRED : HEADER_OPTIONAL;
    cell.font   = HEADER_FONT;
    cell.alignment = { vertical: "middle", horizontal: "center" };
  });
  ws.getRow(1).height = 22;

  // Freeze header
  ws.views = [{ state: "frozen", xSplit: 0, ySplit: 1 }];

  // Add notes row
  const noteRow = ws.addRow(cols.map((c) => c.note ?? ""));
  noteRow.font = { italic: true, color: { argb: "FF6B7280" }, size: 9 };

  // Add sample data rows
  for (const row of rows) {
    ws.addRow(row);
  }

  return ws;
}

export async function buildExcelTemplate(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "ITSM Demo Data";
  wb.created = new Date();

  // ── Instructions sheet ────────────────────────────────────────────────────

  const instructions = wb.addWorksheet("📖 Instructions");
  instructions.getColumn("A").width = 80;
  instructions.mergeCells("A1:A1");
  const title = instructions.getCell("A1");
  title.value = "ITSM Demo Data Import Template";
  title.font  = { bold: true, size: 16, color: { argb: "FF4F46E5" } };
  title.alignment = { vertical: "middle" };
  instructions.getRow(1).height = 32;

  const lines = [
    "",
    "HOW TO USE THIS TEMPLATE",
    "─────────────────────────────────────────────────────",
    "1. Fill in each sheet with your custom data.",
    "2. Purple column headers = REQUIRED fields.",
    "3. Light-purple headers = optional fields (leave blank to use defaults).",
    "4. Row 2 in each sheet contains field descriptions — do not delete it.",
    "5. Save as .xlsx and upload via Settings → Demo Data → Import from Excel.",
    "",
    "IMPORTANT NOTES",
    "─────────────────────────────────────────────────────",
    "• The system creates records in dependency order automatically.",
    "• You do not need to fill every sheet — empty sheets are skipped.",
    "• Cross-sheet references (e.g., team name on a ticket) must match exactly.",
    "• Demo records are tagged and can be deleted safely without affecting real data.",
    "",
    "SHEETS IN THIS WORKBOOK",
    "─────────────────────────────────────────────────────",
    "• Users        — Agent and supervisor accounts",
    "• Teams        — Support teams",
    "• Customers    — End-user/customer accounts",
    "• Tickets      — Support tickets",
    "• Incidents    — ITIL incidents",
    "• Requests     — Service requests",
    "• Problems     — Problem records",
    "• Changes      — Change requests",
    "• Assets       — IT assets",
    "• KbArticles   — Knowledge base articles",
    "• Macros       — Response macros/templates",
  ];

  lines.forEach((line, i) => {
    const cell = instructions.getCell(`A${i + 2}`);
    cell.value = line;
    if (line.startsWith("──") || line === "HOW TO USE THIS TEMPLATE" || line === "IMPORTANT NOTES" || line === "SHEETS IN THIS WORKBOOK") {
      cell.font = { bold: true, color: { argb: "FF374151" } };
    } else {
      cell.font = { color: { argb: "FF6B7280" } };
    }
  });

  // ── Users sheet ───────────────────────────────────────────────────────────

  addSheet(wb, "Users", [
    { header: "name *",      key: "name",     width: 25, required: true,  note: "Full display name" },
    { header: "email *",     key: "email",    width: 30, required: true,  note: "Must be unique" },
    { header: "role *",      key: "role",     width: 15, required: true,  note: "agent | supervisor" },
    { header: "jobTitle",    key: "jobTitle", width: 25, required: false, note: "Optional job title" },
  ], [
    { name: "Jane Smith",    email: "jane.smith@example.com",    role: "agent",      jobTitle: "L1 Support" },
    { name: "Tom Garcia",    email: "tom.garcia@example.com",    role: "supervisor", jobTitle: "Team Lead" },
    { name: "Nina Patel",    email: "nina.patel@example.com",    role: "agent",      jobTitle: "L2 Engineer" },
  ]);

  // ── Teams sheet ───────────────────────────────────────────────────────────

  addSheet(wb, "Teams", [
    { header: "name *",       key: "name",        width: 25, required: true,  note: "Team display name" },
    { header: "description",  key: "description", width: 40, required: false, note: "Optional description" },
    { header: "color",        key: "color",       width: 12, required: false, note: "Hex color e.g. #3b82f6" },
  ], [
    { name: "Level 1 Support",  description: "First line of support",   color: "#3b82f6" },
    { name: "Infrastructure",   description: "Servers and networking",   color: "#10b981" },
    { name: "Security Ops",     description: "Security incident response", color: "#f59e0b" },
  ]);

  // ── Customers sheet ───────────────────────────────────────────────────────

  addSheet(wb, "Customers", [
    { header: "name *",       key: "name",     width: 25, required: true,  note: "Customer full name" },
    { header: "email *",      key: "email",    width: 30, required: true,  note: "Must be unique" },
    { header: "organization", key: "org",      width: 25, required: false, note: "Organization name (must exist)" },
    { header: "jobTitle",     key: "jobTitle", width: 25, required: false, note: "Customer job title" },
    { header: "isVip",        key: "isVip",    width: 8,  required: false, note: "TRUE or FALSE" },
  ], [
    { name: "Alice Johnson",  email: "alice.j@acme.example",  org: "Acme Corp",    jobTitle: "IT Director",  isVip: true },
    { name: "Bob Wilson",     email: "bob.w@acme.example",    org: "Acme Corp",    jobTitle: "Developer",    isVip: false },
    { name: "Carol Martinez", email: "carol.m@nexus.example", org: "Nexus Systems", jobTitle: "Manager",     isVip: false },
  ]);

  // ── Tickets sheet ─────────────────────────────────────────────────────────

  addSheet(wb, "Tickets", [
    { header: "subject *",    key: "subject",     width: 35, required: true,  note: "Ticket subject line" },
    { header: "body *",       key: "body",        width: 50, required: true,  note: "Full description" },
    { header: "priority",     key: "priority",    width: 12, required: false, note: "low | medium | high | urgent" },
    { header: "status",       key: "status",      width: 14, required: false, note: "open | in_progress | resolved | closed" },
    { header: "senderName",   key: "senderName",  width: 20, required: false, note: "Customer display name" },
    { header: "senderEmail",  key: "senderEmail", width: 30, required: false, note: "Customer email" },
    { header: "teamName",     key: "teamName",    width: 20, required: false, note: "Assigned team name" },
    { header: "agentEmail",   key: "agentEmail",  width: 30, required: false, note: "Assigned agent email" },
  ], [
    { subject: "Cannot log in after password reset", body: "I changed my password and now cannot log in.", priority: "high", status: "open", senderName: "Alice Johnson", senderEmail: "alice.j@acme.example", teamName: "Level 1 Support", agentEmail: "jane.smith@example.com" },
    { subject: "Laptop running slowly", body: "My laptop has been very slow for the past week.", priority: "medium", status: "in_progress", senderName: "Bob Wilson", senderEmail: "bob.w@acme.example", teamName: "Level 1 Support", agentEmail: "" },
  ]);

  // ── Incidents sheet ───────────────────────────────────────────────────────

  addSheet(wb, "Incidents", [
    { header: "title *",         key: "title",            width: 40, required: true,  note: "Incident title" },
    { header: "description",     key: "description",      width: 50, required: false, note: "Full description" },
    { header: "priority *",      key: "priority",         width: 8,  required: true,  note: "p1 | p2 | p3 | p4" },
    { header: "status",          key: "status",           width: 15, required: false, note: "new | acknowledged | in_progress | resolved | closed" },
    { header: "affectedSystem",  key: "affectedSystem",   width: 25, required: false, note: "Affected system name" },
    { header: "affectedUsers",   key: "affectedUsers",    width: 12, required: false, note: "Number of users affected" },
    { header: "commanderEmail",  key: "commanderEmail",   width: 30, required: false, note: "Incident commander email" },
    { header: "isMajor",         key: "isMajor",          width: 8,  required: false, note: "TRUE or FALSE" },
  ], [
    { title: "Database server unresponsive", description: "The production DB is not responding to connections.", priority: "p1", status: "in_progress", affectedSystem: "PostgreSQL", affectedUsers: 500, commanderEmail: "tom.garcia@example.com", isMajor: true },
    { title: "Email delays — 30 minute lag", description: "Inbound emails are delayed by ~30 minutes.", priority: "p2", status: "acknowledged", affectedSystem: "Email Gateway", affectedUsers: 200, commanderEmail: "", isMajor: false },
  ]);

  // ── Assets sheet ──────────────────────────────────────────────────────────

  addSheet(wb, "Assets", [
    { header: "name *",        key: "name",         width: 35, required: true,  note: "Asset display name" },
    { header: "type *",        key: "type",         width: 18, required: true,  note: "end_user_device | hardware | network_equipment | software_license | peripheral | mobile_device | cloud_resource | other" },
    { header: "status",        key: "status",       width: 15, required: false, note: "in_stock | in_use | under_maintenance | retired | disposed" },
    { header: "manufacturer",  key: "manufacturer", width: 15, required: false, note: "e.g. Apple, Dell, HP" },
    { header: "model",         key: "model",        width: 20, required: false, note: "Product model name" },
    { header: "serialNumber",  key: "serialNumber", width: 20, required: false, note: "Device serial number" },
    { header: "purchasePrice", key: "purchasePrice",width: 12, required: false, note: "Purchase cost (USD)" },
    { header: "assigneeEmail", key: "assigneeEmail",width: 30, required: false, note: "Assigned-to agent email" },
  ], [
    { name: "MacBook Pro 14\" — Jane Smith", type: "end_user_device", status: "in_use", manufacturer: "Apple", model: "MacBook Pro 14\"", serialNumber: "C02X1234MD6N", purchasePrice: 1999, assigneeEmail: "jane.smith@example.com" },
    { name: "Dell XPS 15 — Tom Garcia",      type: "end_user_device", status: "in_use", manufacturer: "Dell",  model: "XPS 15 9530",     serialNumber: "DK7X81LMN",    purchasePrice: 1899, assigneeEmail: "tom.garcia@example.com" },
  ]);

  // ── KbArticles sheet ──────────────────────────────────────────────────────

  addSheet(wb, "KbArticles", [
    { header: "title *",    key: "title",    width: 40, required: true,  note: "Article title" },
    { header: "summary",    key: "summary",  width: 50, required: false, note: "Short summary (1-2 sentences)" },
    { header: "body *",     key: "body",     width: 60, required: true,  note: "Article content (Markdown supported)" },
    { header: "category",   key: "category", width: 20, required: false, note: "Category name (must exist or will be created)" },
    { header: "tags",       key: "tags",     width: 25, required: false, note: "Comma-separated tags" },
    { header: "visibility", key: "visibility",width: 12, required: false, note: "public | internal" },
  ], [
    { title: "How to Reset Your Password", summary: "Self-service password reset guide.", body: "## Steps\n1. Go to account.example.com/reset\n2. Enter your email\n3. Check inbox for reset link", category: "Account & Security", tags: "password, security, reset", visibility: "public" },
    { title: "VPN Setup Guide",             summary: "Connect to corporate VPN from home.",  body: "## Installation\n1. Download VPN client\n2. Install and open\n3. Enter your credentials", category: "Getting Started", tags: "vpn, remote, setup", visibility: "public" },
  ]);

  // ── Macros sheet ──────────────────────────────────────────────────────────

  addSheet(wb, "Macros", [
    { header: "title *",  key: "title",  width: 35, required: true,  note: "Macro name" },
    { header: "body *",   key: "body",   width: 80, required: true,  note: "Macro content. Supports {{customer_name}}, {{ticket_id}}, {{agent_name}}" },
  ], [
    { title: "First Response", body: "Hi {{customer_name}},\n\nThank you for contacting support. I'll look into this right away.\n\nBest,\n{{agent_name}}" },
    { title: "Resolution Confirmation", body: "Hi {{customer_name}},\n\nYour ticket (#{{ticket_id}}) has been resolved. Please let us know if the issue recurs.\n\nBest,\n{{agent_name}}" },
  ]);

  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
