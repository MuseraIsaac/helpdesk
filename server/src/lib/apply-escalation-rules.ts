import prisma from "../db";
import { getSection } from "./settings";
import { notify } from "./notify";
import { sendEmailJob } from "./send-email";
import { renderNotificationEmail } from "./render-notification-email";

type Condition = { field: string; operator: "equals" | "not_equals" | "in"; value: string };

type EscalationModule = "incident" | "request" | "ticket";

/** Field values extracted from the entity being evaluated. */
type EntitySnapshot = Record<string, string | boolean | number | null | undefined>;

function evaluateCondition(condition: Condition, snapshot: EntitySnapshot): boolean {
  const raw = snapshot[condition.field];
  const actual = raw === null || raw === undefined ? "" : String(raw);

  switch (condition.operator) {
    case "equals":    return actual === condition.value;
    case "not_equals": return actual !== condition.value;
    case "in": {
      const values = condition.value.split(",").map((v) => v.trim());
      return values.includes(actual);
    }
    default: return false;
  }
}

function evaluateRule(
  conditions: Condition[],
  logic: "AND" | "OR",
  snapshot: EntitySnapshot
): boolean {
  if (conditions.length === 0) return false;
  if (logic === "AND") return conditions.every((c) => evaluateCondition(c, snapshot));
  return conditions.some((c) => evaluateCondition(c, snapshot));
}

export interface EscalationResult {
  teamId: number | null;
  userId: string | null;
  ruleName: string;
  notifyByEmail: boolean;
  notifyInApp: boolean;
  notificationNote: string | null;
}

/**
 * Evaluate active escalation rules for a module against an entity snapshot.
 * Returns the first matching rule's result, or null if none match.
 *
 * Checks the module's autoEscalate setting before evaluating rules.
 */
export async function applyEscalationRules(
  module: EscalationModule,
  snapshot: EntitySnapshot
): Promise<EscalationResult | null> {
  const settingsSection = module === "incident" ? "incidents" : module === "request" ? "requests" : null;
  if (settingsSection) {
    const settings = await getSection(settingsSection as "incidents" | "requests");
    if (!settings.autoEscalate) return null;
  }

  const rules = await prisma.escalationRule.findMany({
    where: { module: module as any, isActive: true },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    select: {
      id: true, name: true, conditions: true, conditionLogic: true,
      escalateToTeamId: true, escalateToUserId: true,
      notifyByEmail: true, notifyInApp: true, notificationNote: true,
    },
  });

  for (const rule of rules) {
    const conditions = rule.conditions as Condition[];
    const matched = evaluateRule(conditions, rule.conditionLogic as "AND" | "OR", snapshot);
    if (matched) {
      return {
        teamId:           rule.escalateToTeamId,
        userId:           rule.escalateToUserId,
        ruleName:         rule.name,
        notifyByEmail:    rule.notifyByEmail,
        notifyInApp:      rule.notifyInApp,
        notificationNote: rule.notificationNote,
      };
    }
  }

  return null;
}

/**
 * Send in-app and/or email notifications to the escalation target.
 * Resolves team members when the target is a team.
 */
export async function sendEscalationNotifications(opts: {
  escalation:   EscalationResult;
  event:        "ticket.escalated" | "incident.escalated";
  entityId:     string;
  entityUrl:    string;
  entityTitle:  string;
  entityNumber: string;
  note?:        string;
}): Promise<void> {
  const { escalation, event, entityId, entityUrl, entityTitle, entityNumber } = opts;
  const note = opts.note ?? escalation.notificationNote ?? undefined;

  if (!escalation.notifyByEmail && !escalation.notifyInApp) return;

  // Resolve recipient user IDs
  let recipientIds: string[] = [];

  if (escalation.userId) {
    recipientIds = [escalation.userId];
  } else if (escalation.teamId) {
    const members = await prisma.teamMember.findMany({
      where: { teamId: escalation.teamId },
      select: { userId: true },
    });
    recipientIds = members.map((m) => m.userId);
  }

  if (recipientIds.length === 0) return;

  const channels: ("in_app" | "email")[] = [];
  if (escalation.notifyInApp) channels.push("in_app");

  const notificationTitle = `Escalated to you: ${entityTitle}`;
  const notificationBody  = note
    ? `Rule: ${escalation.ruleName}. ${note}`
    : `Rule: ${escalation.ruleName}`;

  // In-app notification
  if (escalation.notifyInApp) {
    void notify({
      event,
      recipientIds,
      title: notificationTitle,
      body:  notificationBody,
      entityType: event === "ticket.escalated" ? "ticket" : "incident",
      entityId,
      entityUrl,
      channels: ["in_app"],
    });
  }

  // Email notification — send individually so each gets a personalised template
  if (escalation.notifyByEmail) {
    const integrations = await getSection("integrations");
    const apiKey  = integrations.sendgridApiKey  || process.env.SENDGRID_API_KEY  || "";
    const fromAddr = integrations.fromEmail       || process.env.SENDGRID_FROM_EMAIL || "";
    if (!apiKey || !fromAddr) return;

    const teamName  = escalation.teamId
      ? (await prisma.team.findUnique({ where: { id: escalation.teamId }, select: { name: true } }))?.name
      : undefined;

    const users = await prisma.user.findMany({
      where: { id: { in: recipientIds } },
      select: { id: true, name: true, email: true },
    });

    for (const user of users) {
      const rendered = await renderNotificationEmail(event, {
        entityNumber,
        entityTitle,
        entityUrl,
        recipientName:  user.name,
        recipientEmail: user.email,
        agentName:      user.name,
        teamName,
        note,
      });

      const subject  = rendered?.subject  ?? notificationTitle;
      const bodyText = rendered?.bodyText ?? notificationBody;
      const bodyHtml = rendered?.bodyHtml;

      void sendEmailJob({ to: user.email, subject, body: bodyText, bodyHtml });
    }
  }
}
