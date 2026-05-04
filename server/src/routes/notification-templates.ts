/**
 * /api/notification-templates
 *
 * Manages system email notification templates — one template per notification
 * event. Admins can view, edit, and reset templates to their defaults.
 *
 * GET    /api/notification-templates        — list all notification templates
 * PUT    /api/notification-templates/:event — upsert template for event
 * POST   /api/notification-templates/seed   — insert missing defaults (idempotent)
 */

import { Router } from "express";
import { z } from "zod/v4";
import { requireAuth } from "../middleware/require-auth";
import { requirePermission } from "../middleware/require-permission";
import { validate } from "../lib/validate";
import prisma from "../db";

const router = Router();

// ── Default templates ────────────────────────────────────────────────────────

const DEFAULT_TEMPLATES: Array<{
  event: string;
  title: string;
  emailSubject: string;
  body: string;
  bodyHtml: string;
}> = [
  {
    event: "ticket.created",
    title: "Auto-Response: Ticket Received",
    emailSubject: "We've received your request — {{entity.number}}",
    body: `Hi {{sender.name}},

Thank you for contacting us. Your support request has been received and a ticket has been created for you.

Ticket Number: {{entity.number}}
Subject: {{entity.title}}

Our team will review your request and get back to you as soon as possible.

If you have any additional information to add, simply reply to this email.

Best regards,
The Support Team`,
    bodyHtml: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
  <h2 style="color:#4f46e5">We've Received Your Request</h2>
  <p>Hi {{sender.name}},</p>
  <p>Thank you for contacting us. Your support request has been received and a ticket has been created for you.</p>
  <table style="background:#f9fafb;border-radius:8px;padding:16px;width:100%;margin:16px 0">
    <tr><td style="color:#6b7280;font-size:13px">Ticket Number</td><td style="font-weight:600">{{entity.number}}</td></tr>
    <tr><td style="color:#6b7280;font-size:13px;padding-top:8px">Subject</td><td style="padding-top:8px">{{entity.title}}</td></tr>
  </table>
  <p>Our team will review your request and get back to you as soon as possible. If you have any additional information, simply reply to this email.</p>
  <p style="color:#6b7280;font-size:13px;margin-top:32px">Best regards,<br>The Support Team</p>
</div>`,
  },
  {
    event: "ticket.escalated",
    title: "Escalation Notification: Ticket Assigned to You",
    emailSubject: "Escalated ticket requires your attention — {{entity.number}}",
    body: `Hi {{recipient.name}},

A ticket has been escalated to you and requires your immediate attention.

Ticket: {{entity.number}} — {{entity.title}}
Status: {{entity.status}}
Priority: {{entity.priority}}

{{note}}

Please review and take action at your earliest convenience.

Best regards,
The Support Team`,
    bodyHtml: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
  <h2 style="color:#dc2626">Escalated Ticket Requires Your Attention</h2>
  <p>Hi {{recipient.name}},</p>
  <p>A ticket has been escalated to you and requires your immediate attention.</p>
  <table style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:16px;width:100%;margin:16px 0">
    <tr><td style="color:#6b7280;font-size:13px">Ticket</td><td style="font-weight:600">{{entity.number}}</td></tr>
    <tr><td style="color:#6b7280;font-size:13px;padding-top:8px">Subject</td><td style="padding-top:8px">{{entity.title}}</td></tr>
    <tr><td style="color:#6b7280;font-size:13px;padding-top:8px">Status</td><td style="padding-top:8px">{{entity.status}}</td></tr>
    <tr><td style="color:#6b7280;font-size:13px;padding-top:8px">Priority</td><td style="padding-top:8px">{{entity.priority}}</td></tr>
  </table>
  <p>{{note}}</p>
  <p>Please review and take action at your earliest convenience.</p>
  <p style="color:#6b7280;font-size:13px;margin-top:32px">Best regards,<br>The Support Team</p>
</div>`,
  },
  {
    event: "incident.escalated",
    title: "Escalation Notification: Incident Assigned to You",
    emailSubject: "Incident escalated to you — {{entity.number}}",
    body: `Hi {{recipient.name}},

An incident has been escalated to you and requires your immediate attention.

Incident: {{entity.number}} — {{entity.title}}
Priority: {{entity.priority}}

{{note}}

Please investigate and take action immediately.

Best regards,
The Incident Management Team`,
    bodyHtml: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
  <h2 style="color:#dc2626">Incident Escalated to You</h2>
  <p>Hi {{recipient.name}},</p>
  <p>An incident has been escalated to you and requires your immediate attention.</p>
  <table style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:16px;width:100%;margin:16px 0">
    <tr><td style="color:#6b7280;font-size:13px">Incident</td><td style="font-weight:600">{{entity.number}}</td></tr>
    <tr><td style="color:#6b7280;font-size:13px;padding-top:8px">Title</td><td style="padding-top:8px">{{entity.title}}</td></tr>
    <tr><td style="color:#6b7280;font-size:13px;padding-top:8px">Priority</td><td style="padding-top:8px">{{entity.priority}}</td></tr>
  </table>
  <p>{{note}}</p>
  <p>Please investigate and take action immediately.</p>
  <p style="color:#6b7280;font-size:13px;margin-top:32px">Best regards,<br>The Incident Management Team</p>
</div>`,
  },
  {
    event: "ticket.assigned",
    title: "Assignment Notification: Ticket Assigned to You",
    emailSubject: "A ticket has been assigned to you — {{entity.number}}",
    body: `Hi {{recipient.name}},

A support ticket has been assigned to you.

Ticket: {{entity.number}} — {{entity.title}}
Status: {{entity.status}}
Priority: {{entity.priority}}

Please review and respond to the customer at your earliest convenience.

Best regards,
The Support Team`,
    bodyHtml: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
  <h2 style="color:#4f46e5">Ticket Assigned to You</h2>
  <p>Hi {{recipient.name}},</p>
  <p>A support ticket has been assigned to you.</p>
  <table style="background:#f9fafb;border-radius:8px;padding:16px;width:100%;margin:16px 0">
    <tr><td style="color:#6b7280;font-size:13px">Ticket</td><td style="font-weight:600">{{entity.number}}</td></tr>
    <tr><td style="color:#6b7280;font-size:13px;padding-top:8px">Subject</td><td style="padding-top:8px">{{entity.title}}</td></tr>
    <tr><td style="color:#6b7280;font-size:13px;padding-top:8px">Status</td><td style="padding-top:8px">{{entity.status}}</td></tr>
    <tr><td style="color:#6b7280;font-size:13px;padding-top:8px">Priority</td><td style="padding-top:8px">{{entity.priority}}</td></tr>
  </table>
  <p>Please review and respond to the customer at your earliest convenience.</p>
  <p style="color:#6b7280;font-size:13px;margin-top:32px">Best regards,<br>The Support Team</p>
</div>`,
  },
  {
    event: "sla.breached",
    title: "SLA Breach Alert",
    emailSubject: "SLA breached — {{entity.number}} requires immediate attention",
    body: `Hi {{recipient.name}},

An SLA deadline has been breached for a ticket assigned to you or your team.

Ticket: {{entity.number}} — {{entity.title}}
Status: {{entity.status}}

This ticket requires immediate attention to prevent further SLA violations.

Best regards,
The Support Team`,
    bodyHtml: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
  <h2 style="color:#dc2626">⚠ SLA Breach Alert</h2>
  <p>Hi {{recipient.name}},</p>
  <p>An SLA deadline has been breached for a ticket assigned to you or your team.</p>
  <table style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:16px;width:100%;margin:16px 0">
    <tr><td style="color:#6b7280;font-size:13px">Ticket</td><td style="font-weight:600">{{entity.number}}</td></tr>
    <tr><td style="color:#6b7280;font-size:13px;padding-top:8px">Subject</td><td style="padding-top:8px">{{entity.title}}</td></tr>
    <tr><td style="color:#6b7280;font-size:13px;padding-top:8px">Status</td><td style="padding-top:8px">{{entity.status}}</td></tr>
  </table>
  <p>This ticket requires <strong>immediate attention</strong> to prevent further SLA violations.</p>
  <p style="color:#6b7280;font-size:13px;margin-top:32px">Best regards,<br>The Support Team</p>
</div>`,
  },
  {
    event: "saas.renewal_soon",
    title: "SaaS Subscription Renewal Upcoming",
    emailSubject: "Renewal upcoming: {{entity.title}} ({{entity.number}})",
    body: `Hi {{recipient.name}},

A SaaS subscription is approaching its renewal date.

Subscription: {{entity.number}} — {{entity.title}}

{{note}}

Review the subscription in {{helpdesk.name}} to confirm the plan, seat count, and renewal terms before billing.

— SaaS Management`,
    bodyHtml: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#0f172a">
  <div style="display:inline-block;padding:4px 10px;border-radius:9999px;background:#eef2ff;color:#4338ca;font-size:11px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase">Renewal upcoming</div>
  <h2 style="margin:16px 0 4px;color:#4338ca">{{entity.title}}</h2>
  <p style="color:#475569;margin:0 0 20px">Hi {{recipient.name}}, a SaaS subscription is approaching its renewal date.</p>
  <table style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px;width:100%;margin:0 0 20px">
    <tr><td style="color:#64748b;font-size:12px;padding:4px 0">Subscription</td><td style="font-weight:600;padding:4px 0">{{entity.number}}</td></tr>
    <tr><td style="color:#64748b;font-size:12px;padding:4px 0">App</td><td style="padding:4px 0">{{entity.title}}</td></tr>
  </table>
  <p style="margin:0 0 16px">{{note}}</p>
  <p style="color:#64748b;font-size:13px;margin:0">Review the subscription in <strong>{{helpdesk.name}}</strong> to confirm plan, seats, and renewal terms before billing.</p>
  <p style="color:#94a3b8;font-size:12px;margin-top:28px">— SaaS Management</p>
</div>`,
  },
  {
    event: "license.expiry_soon",
    title: "Software License Expiring Soon",
    emailSubject: "License expiring: {{entity.title}} ({{entity.number}})",
    body: `Hi {{recipient.name}},

A software license is approaching its expiry date.

License: {{entity.number}} — {{entity.title}}

{{note}}

Plan renewal or replacement before the expiry date to avoid service interruption.

— Asset Management`,
    bodyHtml: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#0f172a">
  <div style="display:inline-block;padding:4px 10px;border-radius:9999px;background:#fff7ed;color:#c2410c;font-size:11px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase">Expiring soon</div>
  <h2 style="margin:16px 0 4px;color:#c2410c">{{entity.title}}</h2>
  <p style="color:#475569;margin:0 0 20px">Hi {{recipient.name}}, a software license is approaching its expiry date.</p>
  <table style="background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;padding:16px;width:100%;margin:0 0 20px">
    <tr><td style="color:#64748b;font-size:12px;padding:4px 0">License</td><td style="font-weight:600;padding:4px 0">{{entity.number}}</td></tr>
    <tr><td style="color:#64748b;font-size:12px;padding:4px 0">Product</td><td style="padding:4px 0">{{entity.title}}</td></tr>
  </table>
  <p style="margin:0 0 16px">{{note}}</p>
  <p style="color:#64748b;font-size:13px;margin:0">Plan renewal or replacement before the expiry date to avoid service interruption.</p>
  <p style="color:#94a3b8;font-size:12px;margin-top:28px">— Asset Management</p>
</div>`,
  },
  {
    event: "license.expired",
    title: "Software License Expired",
    emailSubject: "License expired: {{entity.title}} ({{entity.number}})",
    body: `Hi {{recipient.name}},

A software license has passed its expiry date and may no longer be entitled to use.

License: {{entity.number}} — {{entity.title}}

{{note}}

Confirm renewal status or revoke assignments to remain compliant.

— Asset Management`,
    bodyHtml: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#0f172a">
  <div style="display:inline-block;padding:4px 10px;border-radius:9999px;background:#fef2f2;color:#b91c1c;font-size:11px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase">Expired</div>
  <h2 style="margin:16px 0 4px;color:#b91c1c">{{entity.title}}</h2>
  <p style="color:#475569;margin:0 0 20px">Hi {{recipient.name}}, a software license has passed its expiry date and may no longer be entitled to use.</p>
  <table style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:16px;width:100%;margin:0 0 20px">
    <tr><td style="color:#64748b;font-size:12px;padding:4px 0">License</td><td style="font-weight:600;padding:4px 0">{{entity.number}}</td></tr>
    <tr><td style="color:#64748b;font-size:12px;padding:4px 0">Product</td><td style="padding:4px 0">{{entity.title}}</td></tr>
  </table>
  <p style="margin:0 0 16px">{{note}}</p>
  <p style="color:#64748b;font-size:13px;margin:0">Confirm renewal status or revoke assignments to remain compliant.</p>
  <p style="color:#94a3b8;font-size:12px;margin-top:28px">— Asset Management</p>
</div>`,
  },
  {
    event: "license.over_limit",
    title: "Software License Over Seat Limit",
    emailSubject: "License over limit: {{entity.title}} ({{entity.number}})",
    body: `Hi {{recipient.name}},

A software license has more active assignments than the seats it covers.

License: {{entity.number}} — {{entity.title}}

{{note}}

Reclaim unused seats or procure additional capacity to remain compliant.

— Asset Management`,
    bodyHtml: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#0f172a">
  <div style="display:inline-block;padding:4px 10px;border-radius:9999px;background:#fef2f2;color:#b91c1c;font-size:11px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase">Over limit</div>
  <h2 style="margin:16px 0 4px;color:#b91c1c">{{entity.title}}</h2>
  <p style="color:#475569;margin:0 0 20px">Hi {{recipient.name}}, a software license has more active assignments than the seats it covers.</p>
  <table style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:16px;width:100%;margin:0 0 20px">
    <tr><td style="color:#64748b;font-size:12px;padding:4px 0">License</td><td style="font-weight:600;padding:4px 0">{{entity.number}}</td></tr>
    <tr><td style="color:#64748b;font-size:12px;padding:4px 0">Product</td><td style="padding:4px 0">{{entity.title}}</td></tr>
  </table>
  <p style="margin:0 0 16px">{{note}}</p>
  <p style="color:#64748b;font-size:13px;margin:0">Reclaim unused seats or procure additional capacity to remain compliant.</p>
  <p style="color:#94a3b8;font-size:12px;margin-top:28px">— Asset Management</p>
</div>`,
  },
];

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /api/notification-templates
router.get("/", requireAuth, requirePermission("templates.manage"), async (_req, res) => {
  const templates = await prisma.template.findMany({
    where: { notificationEvent: { not: null } },
    select: {
      id: true, title: true, emailSubject: true, body: true, bodyHtml: true,
      notificationEvent: true, isActive: true, updatedAt: true,
      createdBy: { select: { id: true, name: true } },
    },
    orderBy: { notificationEvent: "asc" },
  });
  res.json({ templates });
});

// PUT /api/notification-templates/:event — upsert (create or replace) for this event
const upsertSchema = z.object({
  title:        z.string().min(1).max(255),
  emailSubject: z.string().min(1).max(255),
  body:         z.string().min(1),
  bodyHtml:     z.string().optional(),
  isActive:     z.boolean().default(true),
});

router.put("/:event", requireAuth, requirePermission("templates.manage"), async (req, res) => {
  const event = String(req.params.event);
  const data  = validate(upsertSchema, req.body, res);
  if (!data) return;

  const existing = await prisma.template.findFirst({
    where: { notificationEvent: event },
    select: { id: true },
  });

  const TMPL_SELECT = {
    id: true, title: true, emailSubject: true, body: true, bodyHtml: true,
    notificationEvent: true, isActive: true, updatedAt: true,
  } as const;

  const base = {
    title:             data.title,
    emailSubject:      data.emailSubject,
    body:              data.body,
    bodyHtml:          data.bodyHtml ?? null,
    isActive:          data.isActive,
    notificationEvent: event,
    type:              "email" as any,
  };

  const template = existing
    ? await prisma.template.update({ where: { id: existing.id }, data: base, select: TMPL_SELECT })
    : await prisma.template.create({ data: { ...base, createdById: req.user.id }, select: TMPL_SELECT });

  res.json({ template });
});

// POST /api/notification-templates/seed — insert defaults for any missing events
router.post("/seed", requireAuth, requirePermission("templates.manage"), async (req, res) => {
  const existing = await prisma.template.findMany({
    where: { notificationEvent: { not: null } },
    select: { notificationEvent: true },
  });
  const existingEvents = new Set(existing.map((t) => t.notificationEvent));

  const toCreate = DEFAULT_TEMPLATES.filter((t) => !existingEvents.has(t.event));

  if (toCreate.length > 0) {
    await prisma.template.createMany({
      data: toCreate.map((t) => ({
        title:             t.title,
        emailSubject:      t.emailSubject,
        body:              t.body,
        bodyHtml:          t.bodyHtml,
        notificationEvent: t.event,
        type:              "email" as any,
        isActive:          true,
        createdById:       req.user.id,
      })),
    });
  }

  res.json({ seeded: toCreate.length, message: `${toCreate.length} default template(s) created` });
});

export default router;
