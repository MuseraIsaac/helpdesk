/**
 * render-notification-email.ts
 *
 * Renders a system notification email template by substituting {{variable}}
 * placeholders with real values from the entity context.
 *
 * Templates are stored in the Template table with type="email" and a
 * notificationEvent value matching the event being fired.
 */

import prisma from "../db";

export interface EmailContext {
  /** Ticket / incident / request number (e.g. TKT0001) */
  entityNumber?: string;
  /** Subject / title of the entity */
  entityTitle?: string;
  /** Current status */
  entityStatus?: string;
  /** Priority */
  entityPriority?: string;
  /** URL to the entity in the agent UI (relative, e.g. /tickets/42) */
  entityUrl?: string;
  /** Name of the person the notification is addressed to */
  recipientName?: string;
  /** Email of the recipient (for personalization) */
  recipientEmail?: string;
  /** Name of the team being escalated to / assigned */
  teamName?: string;
  /** Name of the agent being escalated to / assigned */
  agentName?: string;
  /** Optional message added by the escalation rule */
  note?: string;
  /** App / helpdesk name from general settings */
  helpdeskName?: string;
  /** Sender / customer name */
  senderName?: string;
  /** Sender / customer email */
  senderEmail?: string;
}

const VAR_PATTERNS: Array<[RegExp, keyof EmailContext]> = [
  [/\{\{entity\.number\}\}/gi,    "entityNumber"],
  [/\{\{entity\.title\}\}/gi,     "entityTitle"],
  [/\{\{entity\.status\}\}/gi,    "entityStatus"],
  [/\{\{entity\.priority\}\}/gi,  "entityPriority"],
  [/\{\{entity\.url\}\}/gi,       "entityUrl"],
  [/\{\{recipient\.name\}\}/gi,   "recipientName"],
  [/\{\{recipient\.email\}\}/gi,  "recipientEmail"],
  [/\{\{team\.name\}\}/gi,        "teamName"],
  [/\{\{agent\.name\}\}/gi,       "agentName"],
  [/\{\{note\}\}/gi,              "note"],
  [/\{\{helpdesk\.name\}\}/gi,    "helpdeskName"],
  [/\{\{sender\.name\}\}/gi,      "senderName"],
  [/\{\{sender\.email\}\}/gi,     "senderEmail"],
  // Legacy ticket-prefixed aliases used in agent-facing templates
  [/\{\{ticket\.number\}\}/gi,    "entityNumber"],
  [/\{\{ticket\.subject\}\}/gi,   "entityTitle"],
  [/\{\{ticket\.status\}\}/gi,    "entityStatus"],
  [/\{\{ticket\.priority\}\}/gi,  "entityPriority"],
  [/\{\{customer\.name\}\}/gi,    "senderName"],
  [/\{\{customer\.email\}\}/gi,   "senderEmail"],
];

function interpolate(text: string, ctx: EmailContext): string {
  let result = text;
  for (const [pattern, key] of VAR_PATTERNS) {
    const val = ctx[key];
    result = result.replace(pattern, val ?? "");
  }
  return result;
}

export interface RenderedEmail {
  subject: string;
  bodyText: string;
  bodyHtml: string;
}

/**
 * Fetch the active notification email template for an event and render it.
 * Returns null if no active template exists for this event.
 */
export async function renderNotificationEmail(
  event: string,
  ctx: EmailContext
): Promise<RenderedEmail | null> {
  const template = await prisma.template.findFirst({
    where: { notificationEvent: event, isActive: true, type: "email" as any },
    select: { emailSubject: true, body: true, bodyHtml: true },
    orderBy: { updatedAt: "desc" },
  });

  if (!template) return null;

  const subject  = interpolate(template.emailSubject ?? `Notification: ${event}`, ctx);
  const bodyText = interpolate(template.body, ctx);
  const bodyHtml = interpolate(template.bodyHtml ?? template.body, ctx);

  return { subject, bodyText, bodyHtml };
}
