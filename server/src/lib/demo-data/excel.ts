/**
 * Demo Data Excel Workbook — Template Builder
 *
 * Produces a professional, polished .xlsx workbook that operators can fill in
 * and re-upload for custom demo data import.
 *
 * Design language
 * ───────────────
 *  • Required columns  → deep indigo header  (#312E81 bg / white text)
 *  • Optional columns  → violet header        (#6D28D9 bg / white text)
 *  • Info/note row     → pale lavender bg     (#F5F3FF), gray italic text
 *  • Data rows         → alternating white / barely-blue (#FAFAFE)
 *  • All cells         → thin #D1D5DB borders
 *  • Frozen panes      → after row 2 (header + notes)
 *  • Dropdown validation on every enum field
 *
 * Sheet order matches the dependency/import order expected by importer.ts:
 *   Instructions → Users → Teams → Organisations → Customers →
 *   KbArticles → Macros → CatalogItems → Tickets → Incidents →
 *   ServiceRequests → Problems → Changes → Assets
 */

import ExcelJS from "exceljs";

// ── Color palette ─────────────────────────────────────────────────────────────

const C = {
  // Required header
  reqBg:     "FF312E81",
  reqText:   "FFFFFFFF",
  // Optional header
  optBg:     "FF6D28D9",
  optText:   "FFFFFFFF",
  // Note row
  noteBg:    "FFF5F3FF",
  noteText:  "FF6B7280",
  // Data row alternating
  rowOdd:    "FFFFFFFF",
  rowEven:   "FFFAFAFE",
  // Border
  border:    "FFD1D5DB",
  // Instructions accent
  instrTitle:"FF4F46E5",
  instrHead: "FF1E1B4B",
  instrSub:  "FF374151",
  instrBody: "FF6B7280",
  instrNote: "FF7C3AED",
  // Success / warning in instructions
  green:     "FF065F46",
  greenBg:   "FFD1FAE5",
  amber:     "FF92400E",
  amberBg:   "FFFEF3C7",
};

// ── Column definition type ────────────────────────────────────────────────────

interface ColDef {
  header:      string;
  key:         string;
  width:       number;
  required:    boolean;
  note:        string;
  /** If set, adds a data-validation dropdown for this column */
  validation?: string[];  // list of allowed values
  type?:       "string" | "number" | "boolean";
}

// ── Thin border helper ────────────────────────────────────────────────────────

function thinBorder(): Partial<ExcelJS.Borders> {
  const side: Partial<ExcelJS.Border> = { style: "thin", color: { argb: C.border } };
  return { top: side, bottom: side, left: side, right: side };
}

// ── Sheet builder ─────────────────────────────────────────────────────────────

function buildSheet(
  wb:   ExcelJS.Workbook,
  name: string,
  cols: ColDef[],
  rows: Record<string, unknown>[],
) {
  const ws = wb.addWorksheet(name, { properties: { tabColor: { argb: "FF4F46E5" } } });

  // ── Row 1: column headers ───────────────────────────────────────────────────
  ws.columns = cols.map((c) => ({ header: "", key: c.key, width: c.width }));

  const headerRow = ws.getRow(1);
  headerRow.height = 24;

  cols.forEach((col, idx) => {
    const cell = headerRow.getCell(idx + 1);
    cell.value = col.header;
    cell.font  = { bold: true, color: { argb: col.required ? C.reqText : C.optText }, size: 10, name: "Calibri" };
    cell.fill  = {
      type:    "pattern",
      pattern: "solid",
      fgColor: { argb: col.required ? C.reqBg : C.optBg },
    };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: false };
    cell.border    = thinBorder();
  });

  // ── Row 2: field notes ──────────────────────────────────────────────────────
  const noteRow = ws.getRow(2);
  noteRow.height = 18;
  noteRow.font   = { italic: true, color: { argb: C.noteText }, size: 9, name: "Calibri" };

  cols.forEach((col, idx) => {
    const cell = noteRow.getCell(idx + 1);
    cell.value     = col.note;
    cell.fill      = { type: "pattern", pattern: "solid", fgColor: { argb: C.noteBg } };
    cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
    cell.border    = thinBorder();
  });

  // ── Data validation dropdowns ───────────────────────────────────────────────
  cols.forEach((col, idx) => {
    if (!col.validation?.length) return;
    const colLetter = ws.getColumn(idx + 1).letter;
    ws.dataValidations.add(`${colLetter}3:${colLetter}2000`, {
      type: "list",
      allowBlank: true,
      formulae: [`"${col.validation.join(",")}"`],
      showDropDown: false,
      showErrorMessage: true,
      errorStyle: "warning",
      errorTitle: "Invalid value",
      error: `Allowed values: ${col.validation.join(", ")}`,
    });
  });

  // ── Sample data rows ────────────────────────────────────────────────────────
  rows.forEach((rowData, rowIdx) => {
    const row    = ws.addRow(rowData);
    const isEven = rowIdx % 2 === 1;
    row.height   = 16;

    row.eachCell({ includeEmpty: true }, (cell, colNum) => {
      if (colNum > cols.length) return;
      cell.font      = { size: 10, name: "Calibri" };
      cell.fill      = { type: "pattern", pattern: "solid", fgColor: { argb: isEven ? C.rowEven : C.rowOdd } };
      cell.border    = thinBorder();
      cell.alignment = { vertical: "middle", horizontal: "left" };
    });
  });

  // ── Freeze panes after header + notes ────────────────────────────────────────
  ws.views = [{ state: "frozen", xSplit: 0, ySplit: 2, activeCell: "A3" }];

  return ws;
}

// ── Instructions sheet ────────────────────────────────────────────────────────

function buildInstructions(wb: ExcelJS.Workbook) {
  const ws = wb.addWorksheet("📖 Instructions", {
    properties: { tabColor: { argb: "FF312E81" } },
  });

  ws.getColumn("A").width = 90;
  ws.getColumn("B").width = 20;

  // Title banner
  ws.mergeCells("A1:B1");
  const title = ws.getCell("A1");
  title.value          = "  ITSM Platform — Demo Data Import Template";
  title.font           = { bold: true, size: 18, color: { argb: "FFFFFFFF" }, name: "Calibri" };
  title.fill           = { type: "pattern", pattern: "solid", fgColor: { argb: "FF312E81" } };
  title.alignment      = { vertical: "middle", horizontal: "left" };
  ws.getRow(1).height  = 40;

  // Subtitle
  ws.mergeCells("A2:B2");
  const sub = ws.getCell("A2");
  sub.value          = "  Fill each sheet with your custom data and upload via Demo Data → Import from Excel";
  sub.font           = { size: 11, color: { argb: "FFEDE9FE" }, italic: true, name: "Calibri" };
  sub.fill           = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4338CA" } };
  sub.alignment      = { vertical: "middle", horizontal: "left" };
  ws.getRow(2).height = 22;

  ws.getRow(3).height = 8; // spacer

  type Section = { heading: string; lines: string[]; type?: "normal" | "warning" | "success" };

  const sections: Section[] = [
    {
      heading: "HOW TO USE THIS TEMPLATE",
      lines: [
        "1.  Fill in the data sheets below (Users, Teams, Customers, Tickets, etc.)",
        "2.  You do not need to fill every sheet — empty sheets are skipped during import.",
        "3.  Row 1 of each sheet = column headers. Row 2 = field notes. Data starts on Row 3.",
        "4.  Cross-sheet references (e.g. team name on a Ticket row) must match exactly.",
        "5.  Save the file as .xlsx, then upload it from the Demo Data page.",
        "6.  Use the Preview step to validate your data before committing.",
      ],
    },
    {
      heading: "COLUMN COLOUR GUIDE",
      lines: [
        "🟦  Deep indigo header  →  REQUIRED field. Leaving it blank will cause a validation error.",
        "🟪  Violet header       →  Optional field. Leave blank to use system defaults.",
        "📝  Gray italic row 2   →  Field description / allowed values hint.",
      ],
    },
    {
      heading: "IMPORTANT SAFETY NOTES",
      type: "warning",
      lines: [
        "⚠  All imported records are tracked as a Demo Data Batch for safe, isolated deletion.",
        "⚠  Imported data never touches real production records — only demo-tagged rows.",
        "⚠  Duplicate emails will be skipped (the existing record is reused).",
        "⚠  Delete batches via Demo Data → Batch History → Delete before going live.",
      ],
    },
    {
      heading: "SHEETS IN THIS WORKBOOK",
      lines: [
        "Users          →  Agent and supervisor accounts (sheet: Users)",
        "Teams          →  Support teams and their members (sheet: Teams)",
        "Organisations  →  Client organisations (sheet: Organisations)",
        "Customers      →  End-user contacts (sheet: Customers)",
        "KB Articles    →  Knowledge base articles (sheet: KbArticles)",
        "Macros         →  Response macros / canned replies (sheet: Macros)",
        "Catalog Items  →  Service catalog items (sheet: CatalogItems)",
        "Tickets        →  Support tickets (sheet: Tickets)",
        "Incidents      →  ITIL incident records (sheet: Incidents)",
        "Service Reqs   →  Service requests (sheet: ServiceRequests)",
        "Problems       →  Problem records (sheet: Problems)",
        "Changes        →  Change requests (sheet: Changes)",
        "Assets         →  IT asset inventory (sheet: Assets)",
      ],
    },
    {
      heading: "CROSS-REFERENCE RULES",
      lines: [
        "• Tickets.agentEmail  → must match a row in the Users sheet (email column)",
        "• Tickets.teamName    → must match a row in the Teams sheet (name column)",
        "• Tickets.customerEmail → must match a row in the Customers sheet (email column)",
        "• Incidents.commanderEmail → must match a row in the Users sheet",
        "• ServiceRequests.requesterEmail → must match Users or Customers sheet",
        "• Problems.ownerEmail / assigneeEmail → must match Users sheet",
        "• Changes.assigneeEmail → must match Users sheet",
        "• Assets.assigneeEmail → must match Users sheet (optional)",
        "• KbArticles.category → auto-created if it does not exist in the DB",
      ],
    },
  ];

  let currentRow = 4;

  for (const section of sections) {
    const isWarning = section.type === "warning";
    const headCell  = ws.getCell(`A${currentRow}`);
    headCell.value  = section.heading;
    headCell.font   = { bold: true, size: 12, color: { argb: isWarning ? C.amber : C.instrHead }, name: "Calibri" };
    headCell.fill   = {
      type: "pattern", pattern: "solid",
      fgColor: { argb: isWarning ? C.amberBg : "FFF0EFFE" },
    };
    headCell.alignment  = { vertical: "middle", horizontal: "left" };
    ws.getRow(currentRow).height = 22;
    currentRow++;

    for (const line of section.lines) {
      const lineCell    = ws.getCell(`A${currentRow}`);
      lineCell.value    = `    ${line}`;
      lineCell.font     = { size: 10, color: { argb: isWarning ? "FF92400E" : C.instrBody }, name: "Calibri" };
      lineCell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
      ws.getRow(currentRow).height = 18;
      currentRow++;
    }

    // Spacer after each section
    ws.getRow(currentRow).height = 6;
    currentRow++;
  }

  ws.views = [{ state: "normal" }];
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function buildExcelTemplate(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator     = "ITSM Demo Data";
  wb.lastModifiedBy = "ITSM Demo Data";
  wb.created     = new Date();
  wb.modified    = new Date();
  wb.properties.date1904 = false;

  // Instructions first
  buildInstructions(wb);

  // ── Users ─────────────────────────────────────────────────────────────────

  buildSheet(wb, "Users", [
    { header: "name *",       key: "name",      width: 26, required: true,  note: "Full display name — e.g. Jane Smith" },
    { header: "email *",      key: "email",     width: 32, required: true,  note: "Corporate email (must be unique)" },
    { header: "role *",       key: "role",      width: 14, required: true,  note: "agent | supervisor", validation: ["agent","supervisor"] },
    { header: "jobTitle",     key: "jobTitle",  width: 28, required: false, note: "Job title shown on the profile card" },
    { header: "phone",        key: "phone",     width: 18, required: false, note: "Phone number e.g. +1-555-0101" },
  ], [
    { name: "Jane Smith",    email: "jane.smith@demo.local",    role: "supervisor", jobTitle: "IT Team Lead",         phone: "+1-555-0201" },
    { name: "Tom Garcia",    email: "tom.garcia@demo.local",    role: "agent",      jobTitle: "L1 Support Specialist", phone: "+1-555-0202" },
    { name: "Nina Patel",    email: "nina.patel@demo.local",    role: "agent",      jobTitle: "L2 Systems Engineer",   phone: "+1-555-0203" },
    { name: "Omar Hassan",   email: "omar.hassan@demo.local",   role: "agent",      jobTitle: "Infrastructure Eng",    phone: "+1-555-0204" },
    { name: "Laura Chen",    email: "laura.chen@demo.local",    role: "supervisor", jobTitle: "Security Lead",         phone: "+1-555-0205" },
  ]);

  // ── Teams ─────────────────────────────────────────────────────────────────

  buildSheet(wb, "Teams", [
    { header: "name *",      key: "name",        width: 28, required: true,  note: "Team display name (used as cross-reference key)" },
    { header: "description", key: "description", width: 48, required: false, note: "Brief description of this team's purpose" },
    { header: "color",       key: "color",       width: 14, required: false, note: "Hex color for the team badge e.g. #3b82f6" },
    { header: "memberEmails",key: "memberEmails",width: 50, required: false, note: "Comma-separated agent emails from the Users sheet" },
  ], [
    { name: "Level 1 Support",  description: "First-line support for all end-user requests",   color: "#3b82f6", memberEmails: "tom.garcia@demo.local, jane.smith@demo.local" },
    { name: "Infrastructure",   description: "Servers, networking, and cloud platform",         color: "#10b981", memberEmails: "omar.hassan@demo.local" },
    { name: "Security Ops",     description: "Security incidents and vulnerability management", color: "#f59e0b", memberEmails: "laura.chen@demo.local, nina.patel@demo.local" },
  ]);

  // ── Organisations ─────────────────────────────────────────────────────────

  buildSheet(wb, "Organisations", [
    { header: "name *",     key: "name",     width: 30, required: true,  note: "Organisation display name" },
    { header: "domain",     key: "domain",   width: 28, required: false, note: "Email domain e.g. acme.example (must be unique)" },
    { header: "industry",   key: "industry", width: 22, required: false, note: "Industry / sector e.g. Technology, Healthcare" },
    { header: "tier",       key: "tier",     width: 14, required: false, note: "Support tier", validation: ["standard","premium","enterprise"] },
    { header: "website",    key: "website",  width: 30, required: false, note: "Company website URL" },
    { header: "country",    key: "country",  width: 18, required: false, note: "Country name e.g. United States" },
  ], [
    { name: "Acme Corporation",    domain: "acme.example",    industry: "Manufacturing",       tier: "enterprise", website: "https://acme.example",    country: "United States" },
    { name: "Nexus Financial",     domain: "nexus.example",   industry: "Financial Services",  tier: "premium",    website: "https://nexus.example",   country: "United Kingdom" },
    { name: "Stellar Healthcare",  domain: "stellar.example", industry: "Healthcare",          tier: "premium",    website: "https://stellar.example", country: "United States" },
    { name: "Orbit Systems",       domain: "orbit.example",   industry: "Aerospace & Defence", tier: "standard",   website: "https://orbit.example",   country: "Germany" },
  ]);

  // ── Customers ─────────────────────────────────────────────────────────────

  buildSheet(wb, "Customers", [
    { header: "name *",         key: "name",     width: 26, required: true,  note: "Customer full name" },
    { header: "email *",        key: "email",    width: 34, required: true,  note: "Customer email (must be unique)" },
    { header: "orgName",        key: "orgName",  width: 26, required: false, note: "Organisation name from the Organisations sheet" },
    { header: "jobTitle",       key: "jobTitle", width: 28, required: false, note: "Customer job title" },
    { header: "phone",          key: "phone",    width: 18, required: false, note: "Phone number" },
    { header: "isVip",          key: "isVip",    width: 8,  required: false, note: "TRUE or FALSE", validation: ["TRUE","FALSE"] },
    { header: "supportTier",    key: "tier",     width: 12, required: false, note: "standard | premium | enterprise", validation: ["standard","premium","enterprise"] },
  ], [
    { name: "Alice Johnson",  email: "alice.johnson@acme.example",   orgName: "Acme Corporation",   jobTitle: "IT Director",        phone: "+1-800-100-1001", isVip: "TRUE",  tier: "enterprise" },
    { name: "Bob Wilson",     email: "bob.wilson@acme.example",      orgName: "Acme Corporation",   jobTitle: "Systems Admin",      phone: "+1-800-100-1002", isVip: "FALSE", tier: "enterprise" },
    { name: "Carol Martinez", email: "carol.m@nexus.example",        orgName: "Nexus Financial",    jobTitle: "CISO",               phone: "+44-20-1234-5678", isVip: "TRUE", tier: "premium"    },
    { name: "David Park",     email: "david.park@stellar.example",   orgName: "Stellar Healthcare", jobTitle: "IT Manager",         phone: "+1-310-555-9900", isVip: "FALSE", tier: "premium"    },
    { name: "Erin Walsh",     email: "erin.walsh@orbit.example",     orgName: "Orbit Systems",      jobTitle: "IT Coordinator",     phone: "+49-89-123456",   isVip: "FALSE", tier: "standard"   },
  ]);

  // ── KB Articles ───────────────────────────────────────────────────────────

  buildSheet(wb, "KbArticles", [
    { header: "title *",    key: "title",      width: 42, required: true,  note: "Article title (used to generate the URL slug)" },
    { header: "summary",    key: "summary",    width: 52, required: false, note: "1-2 sentence description shown on the article card" },
    { header: "body *",     key: "body",       width: 70, required: true,  note: "Full article content — Markdown supported" },
    { header: "category",   key: "category",   width: 24, required: false, note: "Category name — auto-created if it does not exist" },
    { header: "tags",       key: "tags",       width: 28, required: false, note: "Comma-separated tags e.g. vpn, security, password" },
    { header: "visibility", key: "visibility", width: 12, required: false, note: "public | internal", validation: ["public","internal"] },
  ], [
    { title: "How to Reset Your Password",        summary: "Self-service password reset guide for all corporate systems.",    body: "## Steps\n\n1. Go to account.company.internal/reset\n2. Enter your corporate email\n3. Check your email for a reset link (expires in 15 minutes)\n4. Create a new password meeting policy requirements",    category: "Account & Security", tags: "password, security, reset",        visibility: "public"   },
    { title: "VPN Setup and Troubleshooting",     summary: "How to install and troubleshoot the corporate VPN client.",      body: "## Installation\n\n1. Download the VPN client from the IT portal\n2. Install and open the application\n3. Enter your corporate credentials\n\n## Common Issues\n\n- Authentication failure: ensure your MFA app is in sync\n- Connection drops: disable network adapter power management", category: "Getting Started",    tags: "vpn, remote, network",            visibility: "public"   },
    { title: "Setting Up MFA (Multi-Factor Auth)",summary: "Step-by-step guide to enrolling in Microsoft Authenticator.",   body: "## Why MFA is Required\n\nMFA is mandatory per our security policy.\n\n## Setup Steps\n\n1. Install Microsoft Authenticator on your phone\n2. Go to aka.ms/mfasetup\n3. Sign in with corporate credentials\n4. Choose 'Mobile app' then 'Receive notifications'\n5. Scan the QR code and approve the test notification",        category: "Account & Security", tags: "mfa, 2fa, security, authenticator",visibility: "public"   },
  ]);

  // ── Macros ────────────────────────────────────────────────────────────────

  buildSheet(wb, "Macros", [
    { header: "title *", key: "title", width: 36, required: true,  note: "Macro name shown in the macro picker" },
    { header: "body *",  key: "body",  width: 90, required: true,  note: "Macro content — supports {{customer_name}}, {{ticket_id}}, {{agent_name}}" },
  ], [
    { title: "First Response — General",       body: "Hi {{customer_name}},\n\nThank you for contacting IT Support. I've received your ticket (#{{ticket_id}}) and I'm looking into it now.\n\nI'll update you within the hour. If this is urgent please call ext. 5000.\n\nBest regards,\n{{agent_name}}" },
    { title: "Password Reset Instructions",    body: "Hi {{customer_name}},\n\nTo reset your password:\n\n1. Go to account.company.internal/reset\n2. Enter your corporate email\n3. Check your email for the reset link (valid 15 min)\n\nLet me know if you need further help.\n\n{{agent_name}}" },
    { title: "Escalation to Tier 2",          body: "Hi {{customer_name}},\n\nYour ticket (#{{ticket_id}}) requires our Tier 2 team. I've escalated it with full context — a Tier 2 engineer will contact you within 2 business hours.\n\nApologies for the wait.\n\n{{agent_name}}" },
    { title: "Resolution Confirmation",        body: "Hi {{customer_name}},\n\nYour ticket (#{{ticket_id}}) has been resolved. Please test access and let us know if the issue recurs. We'll close this ticket in 48 hours if we don't hear back.\n\n{{agent_name}}" },
  ]);

  // ── Catalog Items ─────────────────────────────────────────────────────────

  buildSheet(wb, "CatalogItems", [
    { header: "name *",      key: "name",        width: 34, required: true,  note: "Catalog item name shown to requesters" },
    { header: "description", key: "description", width: 56, required: false, note: "Brief description of what this service provides" },
    { header: "teamName",    key: "teamName",    width: 24, required: false, note: "Fulfillment team name from the Teams sheet" },
  ], [
    { name: "New Employee Onboarding",    description: "Complete IT setup for new hires: laptop, accounts, software and access grants.",          teamName: "Level 1 Support" },
    { name: "VPN Access Request",         description: "Request remote-access VPN credentials for working from home or travelling.",              teamName: "Security Ops"    },
    { name: "Software Licence Request",   description: "Request a licence for approved business software. Include the software name and reason.",  teamName: "Level 1 Support" },
    { name: "Hardware Equipment Request", description: "Request new or replacement hardware: laptops, monitors, keyboards, docking stations.",     teamName: "Infrastructure"  },
    { name: "Application Access Request", description: "Request access to an internal or third-party application with role assignment workflow.",   teamName: "Security Ops"    },
  ]);

  // ── Tickets ───────────────────────────────────────────────────────────────

  buildSheet(wb, "Tickets", [
    { header: "subject *",      key: "subject",       width: 38, required: true,  note: "Ticket subject line" },
    { header: "body *",         key: "body",          width: 60, required: true,  note: "Full ticket description" },
    { header: "priority",       key: "priority",      width: 12, required: false, note: "low | medium | high | urgent",    validation: ["low","medium","high","urgent"] },
    { header: "status",         key: "status",        width: 14, required: false, note: "open | in_progress | resolved",   validation: ["open","in_progress","resolved","closed"] },
    { header: "customerEmail",  key: "customerEmail", width: 32, required: false, note: "Email from the Customers sheet" },
    { header: "teamName",       key: "teamName",      width: 22, required: false, note: "Team name from the Teams sheet" },
    { header: "agentEmail",     key: "agentEmail",    width: 32, required: false, note: "Agent email from the Users sheet" },
    { header: "senderName",     key: "senderName",    width: 22, required: false, note: "Override sender display name (optional)" },
  ], [
    { subject: "Cannot access email after password change",        body: "I changed my password this morning and now Outlook won't connect. Error: 'Authentication Failed'. Need access for a client call in 2 hours.",      priority: "high",   status: "in_progress", customerEmail: "alice.johnson@acme.example",   teamName: "Level 1 Support", agentEmail: "jane.smith@demo.local",  senderName: "" },
    { subject: "Laptop running very slowly — cannot work",         body: "My laptop takes 10+ minutes to boot and Outlook keeps freezing. I have a presentation tomorrow. Dell XPS 15, Windows 11.",                          priority: "high",   status: "open",        customerEmail: "bob.wilson@acme.example",      teamName: "Level 1 Support", agentEmail: "tom.garcia@demo.local",  senderName: "" },
    { subject: "MFA app not working after new phone setup",        body: "Switched to a new phone and the Microsoft Authenticator is not generating codes. Locked out of all corporate systems.",                             priority: "urgent", status: "resolved",    customerEmail: "carol.m@nexus.example",        teamName: "Security Ops",    agentEmail: "laura.chen@demo.local", senderName: "" },
    { subject: "VPN disconnecting every 45 minutes",               body: "VPN drops exactly every 45 minutes. Using Windows 11 24H2 on a Dell XPS. Started last week after a system update.",                                 priority: "medium", status: "in_progress", customerEmail: "david.park@stellar.example",   teamName: "Infrastructure",  agentEmail: "omar.hassan@demo.local",senderName: "" },
    { subject: "Request: 27-inch monitor for home office",         body: "Working fully remote now. Only have laptop screen which is causing eye strain. Can I get a monitor?",                                               priority: "low",    status: "resolved",    customerEmail: "erin.walsh@orbit.example",     teamName: "Level 1 Support", agentEmail: "tom.garcia@demo.local",  senderName: "" },
    { subject: "Teams calls dropping after 30 minutes",            body: "Microsoft Teams calls drop consistently after about 30 minutes. Started last week after the Teams update. Affects the whole department.",           priority: "high",   status: "open",        customerEmail: "alice.johnson@acme.example",   teamName: "Infrastructure",  agentEmail: "",                      senderName: "" },
    { subject: "Printer on Floor 3 showing offline",               body: "The HP LaserJet near the coffee station has been offline since this morning. Multiple staff need to print urgently.",                                priority: "medium", status: "resolved",    customerEmail: "bob.wilson@acme.example",      teamName: "Infrastructure",  agentEmail: "omar.hassan@demo.local",senderName: "" },
  ]);

  // ── Incidents ─────────────────────────────────────────────────────────────

  buildSheet(wb, "Incidents", [
    { header: "title *",          key: "title",          width: 44, required: true,  note: "Incident title — be specific about affected system" },
    { header: "description",      key: "description",    width: 60, required: false, note: "Full incident description and impact statement" },
    { header: "priority *",       key: "priority",       width: 8,  required: true,  note: "p1 | p2 | p3 | p4",                      validation: ["p1","p2","p3","p4"] },
    { header: "status",           key: "status",         width: 16, required: false, note: "new | acknowledged | in_progress | resolved | closed", validation: ["new","acknowledged","in_progress","resolved","closed"] },
    { header: "affectedSystem",   key: "affectedSystem", width: 26, required: false, note: "Name of the affected system or service" },
    { header: "affectedUsers",    key: "affectedUsers",  width: 14, required: false, note: "Approximate number of users impacted (number)", type: "number" },
    { header: "commanderEmail",   key: "commanderEmail", width: 32, required: false, note: "Incident Commander — email from the Users sheet" },
    { header: "assigneeEmail",    key: "assigneeEmail",  width: 32, required: false, note: "Primary assignee — email from the Users sheet" },
    { header: "teamName",         key: "teamName",       width: 22, required: false, note: "Handling team — name from the Teams sheet" },
    { header: "isMajor",          key: "isMajor",        width: 8,  required: false, note: "TRUE or FALSE — triggers major-incident workflow", validation: ["TRUE","FALSE"] },
    { header: "updateBody",       key: "updateBody",     width: 70, required: false, note: "First timeline update — leave blank to skip" },
  ], [
    { title: "Production Database Cluster — Primary Node Failure",  description: "The primary PostgreSQL node has failed over to the replica. Write latency elevated, application timeouts reported.", priority: "p1", status: "resolved",    affectedSystem: "PostgreSQL Production",  affectedUsers: 400, commanderEmail: "jane.smith@demo.local",  assigneeEmail: "omar.hassan@demo.local", teamName: "Infrastructure", isMajor: "TRUE",  updateBody: "P1 declared. Failover completed in 42 s. Root cause: OOM killer terminated postgres due to runaway analytics query." },
    { title: "Email Gateway Outage — Inbound Queue Backed Up",      description: "SendGrid inbound email pipeline stopped delivering. ~200 emails stuck in the queue.",                               priority: "p2", status: "resolved",    affectedSystem: "Email Gateway",          affectedUsers: 200, commanderEmail: "laura.chen@demo.local",  assigneeEmail: "nina.patel@demo.local",  teamName: "Infrastructure", isMajor: "FALSE", updateBody: "Regex error in deployment at 14:19. Rolled back. Queue processing resumed." },
    { title: "MFA Service Degraded — Authentication Delays",        description: "Users experiencing 30-90 second delays when completing MFA prompts.",                                               priority: "p2", status: "in_progress", affectedSystem: "Azure AD / MFA",         affectedUsers: 150, commanderEmail: "laura.chen@demo.local",  assigneeEmail: "nina.patel@demo.local",  teamName: "Security Ops",   isMajor: "FALSE", updateBody: "Microsoft confirms degradation in Azure AD. Escalated to Microsoft P1 support." },
    { title: "Network Switch Stack Failure — Floor 4",              description: "Switch stack serving Floor 4 East wing lost connectivity. 80 users without wired network.",                        priority: "p2", status: "in_progress", affectedSystem: "Network Infrastructure", affectedUsers: 80,  commanderEmail: "jane.smith@demo.local",  assigneeEmail: "omar.hassan@demo.local", teamName: "Infrastructure", isMajor: "FALSE", updateBody: "Physical inspection confirms master switch failure. Replacement in transit — ETA 2 hours." },
    { title: "SSL Certificate Expiry — External API Gateway",       description: "SSL certificate for api.company.external expires in 48 hours. Automated renewal failed.",                          priority: "p2", status: "new",         affectedSystem: "External API Gateway",   affectedUsers: 200, commanderEmail: "",                       assigneeEmail: "omar.hassan@demo.local", teamName: "Infrastructure", isMajor: "FALSE", updateBody: "" },
  ]);

  // ── Service Requests ──────────────────────────────────────────────────────

  buildSheet(wb, "ServiceRequests", [
    { header: "title *",        key: "title",           width: 46, required: true,  note: "Request title — describe what is being requested" },
    { header: "description",    key: "description",     width: 60, required: false, note: "Full details of the request" },
    { header: "status",         key: "status",          width: 18, required: false, note: "submitted | pending_approval | approved | in_fulfillment | fulfilled | closed", validation: ["submitted","pending_approval","approved","in_fulfillment","fulfilled","closed"] },
    { header: "priority",       key: "priority",        width: 12, required: false, note: "low | medium | high | urgent", validation: ["low","medium","high","urgent"] },
    { header: "requesterEmail", key: "requesterEmail",  width: 34, required: false, note: "Requester — email from Users or Customers sheet" },
    { header: "catalogItem",    key: "catalogItem",     width: 28, required: false, note: "Catalog item name from the CatalogItems sheet" },
    { header: "teamName",       key: "teamName",        width: 22, required: false, note: "Fulfillment team — name from the Teams sheet" },
    { header: "assigneeEmail",  key: "assigneeEmail",   width: 32, required: false, note: "Assignee — email from the Users sheet" },
  ], [
    { title: "New Employee IT Setup — J. Adams (Start: Dec 1)",   description: "New hire joining Finance. Needs: MacBook Pro, M365, Slack, Zoom, NetSuite access.",                     status: "in_fulfillment",  priority: "high",   requesterEmail: "jane.smith@demo.local",   catalogItem: "New Employee Onboarding",    teamName: "Level 1 Support", assigneeEmail: "tom.garcia@demo.local"  },
    { title: "VPN Access — Remote Work (C. Martinez)",            description: "CISO transitioning to hybrid. Full-tunnel access required for the development environment.",             status: "approved",        priority: "medium", requesterEmail: "carol.m@nexus.example",    catalogItem: "VPN Access Request",         teamName: "Security Ops",    assigneeEmail: "laura.chen@demo.local" },
    { title: "Adobe Creative Cloud — 3 Licences for Design Team", description: "3 Adobe Creative Cloud All-Apps licences for the marketing design team. Trial expires in 5 days.",       status: "fulfilled",       priority: "high",   requesterEmail: "jane.smith@demo.local",   catalogItem: "Software Licence Request",   teamName: "Level 1 Support", assigneeEmail: "tom.garcia@demo.local"  },
    { title: "Replacement Laptop — Water Damage (B. Wilson)",     description: "Laptop sustained water damage this morning. Client presentation at 2 PM. Urgent replacement needed.",    status: "in_fulfillment",  priority: "urgent", requesterEmail: "bob.wilson@acme.example",  catalogItem: "Hardware Equipment Request", teamName: "Infrastructure",  assigneeEmail: "omar.hassan@demo.local"},
    { title: "Jira Software Access — 4 New Engineers",            description: "4 new engineers joining platform team next week. Standard Jira Software user access required.",          status: "fulfilled",       priority: "medium", requesterEmail: "jane.smith@demo.local",   catalogItem: "Application Access Request", teamName: "Security Ops",    assigneeEmail: "laura.chen@demo.local" },
    { title: "Dual Monitor Setup — 3 Product Designers",          description: "Designers moved to open-plan office. No external displays. Requesting 2x 27\" 4K monitors each.",        status: "submitted",       priority: "medium", requesterEmail: "david.park@stellar.example",catalogItem: "Hardware Equipment Request", teamName: "Infrastructure",  assigneeEmail: ""                      },
  ]);

  // ── Problems ──────────────────────────────────────────────────────────────

  buildSheet(wb, "Problems", [
    { header: "title *",        key: "title",           width: 46, required: true,  note: "Problem record title" },
    { header: "description",    key: "description",     width: 60, required: false, note: "Problem description and background" },
    { header: "status",         key: "status",          width: 26, required: false, note: "new | under_investigation | root_cause_identified | known_error | change_required | resolved | closed", validation: ["new","under_investigation","root_cause_identified","known_error","change_required","resolved","closed"] },
    { header: "priority",       key: "priority",        width: 12, required: false, note: "low | medium | high | urgent", validation: ["low","medium","high","urgent"] },
    { header: "affectedService",key: "affectedService", width: 28, required: false, note: "Name of the affected service or system" },
    { header: "rootCause",      key: "rootCause",       width: 70, required: false, note: "Root cause analysis (Markdown supported)" },
    { header: "workaround",     key: "workaround",      width: 70, required: false, note: "Documented workaround for affected services" },
    { header: "ownerEmail",     key: "ownerEmail",      width: 32, required: false, note: "Problem manager — email from the Users sheet" },
    { header: "assigneeEmail",  key: "assigneeEmail",   width: 32, required: false, note: "Analyst — email from the Users sheet" },
    { header: "isKnownError",   key: "isKnownError",    width: 12, required: false, note: "TRUE | FALSE — marks entry in the KEDB", validation: ["TRUE","FALSE"] },
  ], [
    { title: "Recurring DB Connection Pool Exhaustion",       description: "Multiple P2 incidents caused by connection pool exhaustion on the primary PostgreSQL cluster.", status: "root_cause_identified", priority: "high",   affectedService: "PostgreSQL Production",  rootCause: "Nightly analytics reporting jobs consume all 100 connections during 02:00-04:00 UTC window.",              workaround: "Restart the connection pool manager. Kill long-running reporting queries via pg_cancel_backend().",                                    ownerEmail: "jane.smith@demo.local",  assigneeEmail: "omar.hassan@demo.local", isKnownError: "TRUE"  },
    { title: "Windows 11 24H2 VPN Disconnection — Systematic", description: "35+ users affected by VPN disconnecting every 45 minutes after Windows 11 24H2 update.",      status: "change_required",       priority: "medium", affectedService: "Corporate VPN",          rootCause: "Win 11 24H2 introduced aggressive network adapter power management that overrides per-adapter settings.", workaround: "Disable power management for all network adapters via Group Policy.",                                                                  ownerEmail: "jane.smith@demo.local",  assigneeEmail: "omar.hassan@demo.local", isKnownError: "TRUE"  },
    { title: "SharePoint Migration — Permission Mapping Failures", description: "Approx 12% of user-to-group permission mappings were not migrated correctly.",             status: "under_investigation",   priority: "high",   affectedService: "SharePoint Online",      rootCause: "",                                                                                                        workaround: "Affected users submit a ticket. Infrastructure team manually restores permissions within 4 hours.",       ownerEmail: "laura.chen@demo.local", assigneeEmail: "nina.patel@demo.local",  isKnownError: "FALSE" },
  ]);

  // ── Changes ───────────────────────────────────────────────────────────────

  buildSheet(wb, "Changes", [
    { header: "title *",         key: "title",         width: 46, required: true,  note: "Change request title" },
    { header: "changeType",      key: "changeType",    width: 14, required: false, note: "standard | normal | emergency",                              validation: ["standard","normal","emergency"] },
    { header: "state",           key: "state",         width: 14, required: false, note: "draft | submitted | assess | authorize | scheduled | implement | review | closed | cancelled | failed", validation: ["draft","submitted","assess","authorize","scheduled","implement","review","closed","cancelled","failed"] },
    { header: "risk",            key: "risk",          width: 10, required: false, note: "low | medium | high | critical",                            validation: ["low","medium","high","critical"] },
    { header: "priority",        key: "priority",      width: 12, required: false, note: "low | medium | high | urgent",                              validation: ["low","medium","high","urgent"] },
    { header: "justification",   key: "justification", width: 70, required: false, note: "Business justification for the change" },
    { header: "rollbackPlan",    key: "rollbackPlan",  width: 60, required: false, note: "How to revert if the change fails" },
    { header: "assigneeEmail",   key: "assigneeEmail", width: 32, required: false, note: "Implementor — email from the Users sheet" },
    { header: "teamName",        key: "teamName",      width: 22, required: false, note: "Coordinator team — name from the Teams sheet" },
    { header: "plannedStartDays",key: "plannedStartDays",width:14,required: false, note: "Days from today for planned start (-7 = 7 days ago, 3 = 3 days from now)", type: "number" },
    { header: "plannedEndDays",  key: "plannedEndDays",  width:14,required: false, note: "Days from today for planned end", type: "number" },
  ], [
    { title: "PostgreSQL Connection Pool Limit Increase + PgBouncer",  changeType: "normal",    state: "closed",    risk: "medium",   priority: "high",   justification: "Recurring P2 incidents due to pool exhaustion. Permanent fix.", rollbackPlan: "Revert max_connections to 100 and restart PostgreSQL.",                                     assigneeEmail: "omar.hassan@demo.local", teamName: "Infrastructure", plannedStartDays: -5, plannedEndDays: -4 },
    { title: "GPO — Disable Network Adapter Power Management",          changeType: "standard",  state: "implement", risk: "low",      priority: "medium", justification: "35+ users affected by VPN drops every 45 min since Win 11 24H2 update.", rollbackPlan: "Delete the GPO object. Policy unlinked within next refresh cycle (90 min).",           assigneeEmail: "omar.hassan@demo.local", teamName: "Infrastructure", plannedStartDays: -1, plannedEndDays: 0  },
    { title: "Emergency: SSL Certificate Renewal — api.company.external",changeType:"emergency", state: "scheduled", risk: "low",      priority: "urgent", justification: "Certificate expires in 48 hours. Automated renewal failed.",              rollbackPlan: "Revert to expiring certificate — HTTPS still functional until expiry.",                  assigneeEmail: "omar.hassan@demo.local", teamName: "Infrastructure", plannedStartDays: 0,  plannedEndDays: 0  },
    { title: "CrowdStrike Sensor Upgrade — v7.14",                      changeType: "standard",  state: "authorize", risk: "low",      priority: "medium", justification: "Security vendor advisory: v7.14 contains critical ransomware detection improvements.", rollbackPlan: "CrowdStrike sensor rollback via Falcon console. 15 min rollback per endpoint group.", assigneeEmail: "laura.chen@demo.local",  teamName: "Security Ops",   plannedStartDays: 3,  plannedEndDays: 4  },
    { title: "Kubernetes RBAC Secret Rotation Automation",              changeType: "normal",    state: "assess",    risk: "medium",   priority: "medium", justification: "Automation eliminates human error that caused INC-0005.",                  rollbackPlan: "Revert to manual rotation. Version-controlled in Git.",                                 assigneeEmail: "nina.patel@demo.local",  teamName: "Infrastructure", plannedStartDays: 7,  plannedEndDays: 9  },
  ]);

  // ── Assets ────────────────────────────────────────────────────────────────

  buildSheet(wb, "Assets", [
    { header: "name *",          key: "name",          width: 38, required: true,  note: "Asset display name — be descriptive e.g. 'MacBook Pro 14\" — Jane Smith'" },
    { header: "type *",          key: "type",          width: 20, required: true,  note: "end_user_device | hardware | network_equipment | software_license | peripheral | mobile_device | cloud_resource | other", validation: ["end_user_device","hardware","network_equipment","software_license","peripheral","mobile_device","cloud_resource","other"] },
    { header: "status",          key: "status",        width: 18, required: false, note: "in_stock | in_use | under_maintenance | retired | disposed",                                                                validation: ["in_stock","in_use","under_maintenance","retired","disposed"] },
    { header: "manufacturer",    key: "manufacturer",  width: 16, required: false, note: "e.g. Apple, Dell, HP, Cisco" },
    { header: "model",           key: "model",         width: 24, required: false, note: "Product model name" },
    { header: "serialNumber",    key: "serialNumber",  width: 22, required: false, note: "Device serial number (must be unique if provided)" },
    { header: "assetTag",        key: "assetTag",      width: 16, required: false, note: "Asset tag / barcode label (must be unique if provided)" },
    { header: "purchasePrice",   key: "purchasePrice", width: 14, required: false, note: "Purchase cost in USD (number only)", type: "number" },
    { header: "warrantyYears",   key: "warrantyYears", width: 14, required: false, note: "Warranty duration in years (e.g. 3)", type: "number" },
    { header: "assigneeEmail",   key: "assigneeEmail", width: 32, required: false, note: "Assigned-to agent — email from the Users sheet" },
    { header: "teamName",        key: "teamName",      width: 22, required: false, note: "Responsible team — name from the Teams sheet" },
    { header: "location",        key: "location",      width: 22, required: false, note: "Physical location e.g. Head Office — Floor 3" },
  ], [
    { name: "MacBook Pro 16\" (M3 Max) — Jane Smith",   type: "end_user_device",   status: "in_use",  manufacturer: "Apple",  model: "MacBook Pro 16\" M3 Max",  serialNumber: "C02ZK1FWMD6N", assetTag: "TAG-001", purchasePrice: 3499, warrantyYears: 3, assigneeEmail: "jane.smith@demo.local",  teamName: "Infrastructure", location: "Head Office" },
    { name: "Dell XPS 15 — Tom Garcia",                 type: "end_user_device",   status: "in_use",  manufacturer: "Dell",   model: "XPS 15 9530",              serialNumber: "DK7X82LMN",    assetTag: "TAG-002", purchasePrice: 1899, warrantyYears: 3, assigneeEmail: "tom.garcia@demo.local",  teamName: "Level 1 Support",location: "Head Office" },
    { name: "HP ProLiant DL380 Gen11 — Web Server 01",  type: "hardware",          status: "in_use",  manufacturer: "HP",     model: "ProLiant DL380 Gen11",     serialNumber: "USE248XLNQ",   assetTag: "TAG-003", purchasePrice: 12800, warrantyYears:3, assigneeEmail: "omar.hassan@demo.local", teamName: "Infrastructure", location: "Server Room A"},
    { name: "Cisco Catalyst 9300 — Core Switch Floor 4",type: "network_equipment", status: "in_use",  manufacturer: "Cisco",  model: "Catalyst 9300-48T",        serialNumber: "FJC2301A0NK",  assetTag: "TAG-004", purchasePrice: 8200,  warrantyYears:5, assigneeEmail: "omar.hassan@demo.local", teamName: "Infrastructure", location: "Server Room A"},
    { name: "CrowdStrike Falcon — Enterprise Licence",  type: "software_license",  status: "in_use",  manufacturer: "CrowdStrike", model: "Falcon Enterprise",   serialNumber: "CS-ENT-2024",  assetTag: "TAG-005", purchasePrice: 42000, warrantyYears:1, assigneeEmail: "",                       teamName: "Security Ops",   location: "Cloud"       },
    { name: "HP EliteBook 840 G10 — Nina Patel",        type: "end_user_device",   status: "in_use",  manufacturer: "HP",     model: "EliteBook 840 G10",        serialNumber: "5CG3504KNW",   assetTag: "TAG-006", purchasePrice: 1350,  warrantyYears:3, assigneeEmail: "nina.patel@demo.local",  teamName: "Level 1 Support",location: "Head Office" },
    { name: "NetApp AFF A400 — Primary Storage",        type: "hardware",          status: "in_use",  manufacturer: "NetApp", model: "AFF A400",                 serialNumber: "701758000380", assetTag: "TAG-007", purchasePrice: 85000, warrantyYears:3, assigneeEmail: "omar.hassan@demo.local", teamName: "Infrastructure", location: "Server Room A"},
  ]);

  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
