import { Router } from "express";
import { requireAuth } from "../middleware/require-auth";
import { requirePermission } from "../middleware/require-permission";
import { can } from "core/constants/permission.ts";
import { validate } from "../lib/validate";
import { parseId } from "../lib/parse-id";
import { createMacroSchema, updateMacroSchema } from "core/schemas/macros.ts";
import prisma from "../db";

const router = Router();

const MACRO_SELECT = {
  id: true,
  title: true,
  body: true,
  category: true,
  isActive: true,
  isSystem: true,
  visibility: true,
  createdById: true,
  createdBy: { select: { id: true, name: true } },
  createdAt: true,
  updatedAt: true,
} as const;

// ─── System macro seed data ───────────────────────────────────────────────────

const SYSTEM_MACROS = [
  {
    title: "Acknowledge & Investigating",
    body: `Hi {{customer_name}},

Thank you for reaching out to us. I've received your request (Ticket #{{ticket_id}}) and I'm currently investigating the issue.

I'll keep you updated on my progress and aim to have a resolution for you as soon as possible. In the meantime, please don't hesitate to add any additional information that might help.

Best regards,
{{agent_name}}`,
    category: "general_question",
  },
  {
    title: "Request More Information",
    body: `Hi {{customer_name}},

Thank you for contacting us about Ticket #{{ticket_id}}. To help resolve your issue as quickly as possible, I need a bit more information:

1. Could you describe the exact steps that led to this issue?
2. When did you first notice this problem?
3. Have you made any recent changes to your setup or environment?

Once I have these details, I'll be able to assist you more effectively.

Best regards,
{{agent_name}}`,
    category: "technical_question",
  },
  {
    title: "Escalation Notice",
    body: `Hi {{customer_name}},

I wanted to let you know that your ticket (#{{ticket_id}}) has been escalated to our specialist team for further investigation. This is to ensure you receive the best possible support for your issue.

You can expect a response from the team within the next 2–4 business hours. We appreciate your patience and will keep you updated throughout the process.

Best regards,
{{agent_name}}`,
    category: "general_question",
  },
  {
    title: "Resolution Confirmed — Please Verify",
    body: `Hi {{customer_name}},

I believe we've resolved the issue raised in Ticket #{{ticket_id}}. Could you please verify on your end and confirm that everything is working as expected?

If you're still experiencing any problems, please reply to this message and I'll continue to assist you right away.

Best regards,
{{agent_name}}`,
    category: "general_question",
  },
  {
    title: "Closing — No Response",
    body: `Hi {{customer_name}},

We haven't heard back from you regarding Ticket #{{ticket_id}}, so we'll be closing this ticket for now.

If you still require assistance or the issue persists, please don't hesitate to reach out and we'll be happy to help. Simply reply to this email or create a new ticket.

Best regards,
{{agent_name}}`,
    category: "general_question",
  },
  {
    title: "Password Reset Instructions",
    body: `Hi {{customer_name}},

Here are the steps to reset your password:

1. Go to the login page and click "Forgot Password"
2. Enter your registered email address ({{customer_email}})
3. Check your inbox for a password reset link (it expires in 30 minutes)
4. Click the link and follow the prompts to set a new password
5. Log in with your new credentials

If you don't receive the email within a few minutes, please check your spam/junk folder. Let us know if you need further assistance with Ticket #{{ticket_id}}.

Best regards,
{{agent_name}}`,
    category: "technical_question",
  },
  {
    title: "Scheduled Maintenance Notice",
    body: `Hi {{customer_name}},

We wanted to inform you that scheduled maintenance will be performed on our systems. During this window, some services may be temporarily unavailable.

If your issue (Ticket #{{ticket_id}}) is related to this maintenance window, please rest assured that it will be resolved once maintenance is complete. We apologise for any inconvenience caused.

We'll notify you as soon as the maintenance is finished.

Best regards,
{{agent_name}}`,
    category: "technical_question",
  },
  {
    title: "Remote Session Request",
    body: `Hi {{customer_name}},

To better assist you with Ticket #{{ticket_id}}, I'd like to schedule a remote support session to take a closer look at the issue.

Could you please let me know your availability for a 30-minute session? I'm available on most weekdays during business hours.

Please share your preferred time slot and I'll send a calendar invite with connection details.

Best regards,
{{agent_name}}`,
    category: "technical_question",
  },
  {
    title: "Refund Approved",
    body: `Hi {{customer_name}},

I'm pleased to confirm that your refund request (Ticket #{{ticket_id}}) has been approved and processed.

The refund should appear in your account within 3–5 business days depending on your bank or payment provider. If you have any questions or don't see the refund within that timeframe, please don't hesitate to get in touch.

We appreciate your patience and apologise for any inconvenience caused.

Best regards,
{{agent_name}}`,
    category: "refund_request",
  },
  {
    title: "Thank You — CSAT Survey",
    body: `Hi {{customer_name}},

I'm glad we could resolve your issue with Ticket #{{ticket_id}}! Your satisfaction is our top priority.

We'd love to hear about your support experience. If you have a moment, please take our short satisfaction survey — your feedback helps us improve our service for everyone.

Thank you for choosing us. Don't hesitate to reach out if you ever need assistance again.

Best regards,
{{agent_name}}`,
    category: "general_question",
  },
] as const;

// ─── Seed system macros ────────────────────────────────────────────────────────

router.post("/seed-system", requireAuth, requirePermission("macros.manage"), async (req, res) => {
  const adminUserId = req.user.id;

  let created = 0;
  let skipped = 0;

  for (const seed of SYSTEM_MACROS) {
    const existing = await prisma.macro.findFirst({
      where: { title: seed.title, isSystem: true },
    });
    if (existing) { skipped++; continue; }

    await prisma.macro.create({
      data: {
        title: seed.title,
        body: seed.body,
        category: seed.category as any,
        isActive: true,
        isSystem: true,
        visibility: "global",
        createdById: adminUserId,
      },
    });
    created++;
  }

  res.json({ created, skipped, total: SYSTEM_MACROS.length });
});

// ─── List macros ──────────────────────────────────────────────────────────────
// Admins/supervisors (macros.manage): see all macros.
// Agents (macros.view only): see global active macros + their own personal macros.

router.get("/", requireAuth, async (req, res) => {
  const canManage = can(req.user.role, "macros.manage");

  const macros = await prisma.macro.findMany({
    where: canManage
      ? undefined
      : {
          AND: [
            { isActive: true },
            {
              OR: [
                { visibility: "global" },
                { visibility: "personal", createdById: req.user.id },
              ],
            },
          ],
        },
    select: MACRO_SELECT,
    orderBy: [{ isSystem: "desc" }, { visibility: "asc" }, { title: "asc" }],
  });

  res.json({ macros });
});

// ─── Create a macro ───────────────────────────────────────────────────────────
// Admins/supervisors can create global macros.
// Agents with macros.create can create personal macros only.

router.post("/", requireAuth, requirePermission("macros.create"), async (req, res) => {
  const data = validate(createMacroSchema, req.body, res);
  if (!data) return;

  const canManage = can(req.user.role, "macros.manage");

  // Agents can only create personal macros
  const visibility = canManage ? (data.visibility ?? "global") : "personal";

  const macro = await prisma.macro.create({
    data: {
      title: data.title,
      body: data.body,
      category: data.category ?? null,
      isActive: data.isActive ?? true,
      isSystem: false,
      visibility,
      createdById: req.user.id,
    },
    select: MACRO_SELECT,
  });

  res.status(201).json(macro);
});

// ─── Update a macro ───────────────────────────────────────────────────────────
// Admins/supervisors: can update any non-system field on any macro.
// Agents: can update their own personal macros only.

router.put("/:id", requireAuth, async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid macro ID" }); return; }

  const existing = await prisma.macro.findUnique({ where: { id } });
  if (!existing) { res.status(404).json({ error: "Macro not found" }); return; }

  const canManage = can(req.user.role, "macros.manage");
  const isOwner = existing.createdById === req.user.id;

  if (!canManage && !(isOwner && existing.visibility === "personal")) {
    res.status(403).json({ error: "Not authorised to edit this macro" });
    return;
  }

  const data = validate(updateMacroSchema, req.body, res);
  if (!data) return;

  const macro = await prisma.macro.update({
    where: { id },
    data: {
      ...(data.title !== undefined && { title: data.title }),
      ...(data.body !== undefined && { body: data.body }),
      ...("category" in data && { category: data.category ?? null }),
      ...(data.isActive !== undefined && { isActive: data.isActive }),
      // Only managers can change visibility or system flag
      ...(canManage && data.visibility !== undefined && { visibility: data.visibility }),
    },
    select: MACRO_SELECT,
  });

  res.json(macro);
});

// ─── Clone a macro ────────────────────────────────────────────────────────────
// Any agent can clone any visible macro as a personal copy.

router.post("/:id/clone", requireAuth, requirePermission("macros.create"), async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid macro ID" }); return; }

  const source = await prisma.macro.findUnique({ where: { id } });
  if (!source) { res.status(404).json({ error: "Macro not found" }); return; }

  const canManage = can(req.user.role, "macros.manage");

  // Ensure the user can actually see this macro before cloning
  const canSee =
    canManage ||
    source.visibility === "global" ||
    (source.visibility === "personal" && source.createdById === req.user.id);

  if (!canSee) { res.status(404).json({ error: "Macro not found" }); return; }

  const clone = await prisma.macro.create({
    data: {
      title: `Copy of ${source.title}`,
      body: source.body,
      category: source.category,
      isActive: true,
      isSystem: false,
      visibility: "personal",
      createdById: req.user.id,
    },
    select: MACRO_SELECT,
  });

  res.status(201).json(clone);
});

// ─── Delete a macro ───────────────────────────────────────────────────────────
// System macros cannot be deleted.
// Admins can delete any non-system macro.
// Agents can delete their own personal macros.

router.delete("/:id", requireAuth, async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid macro ID" }); return; }

  const existing = await prisma.macro.findUnique({ where: { id } });
  if (!existing) { res.status(404).json({ error: "Macro not found" }); return; }

  if (existing.isSystem) {
    res.status(403).json({ error: "System macros cannot be deleted" });
    return;
  }

  const canManage = can(req.user.role, "macros.manage");
  const isOwner = existing.createdById === req.user.id;

  if (!canManage && !(isOwner && existing.visibility === "personal")) {
    res.status(403).json({ error: "Not authorised to delete this macro" });
    return;
  }

  await prisma.macro.delete({ where: { id } });
  res.status(204).send();
});

export default router;
