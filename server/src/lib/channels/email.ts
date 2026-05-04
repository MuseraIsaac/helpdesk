/**
 * email channel — delivers a notification email to an internal agent/user.
 *
 * Looks up the recipient's email address, renders the notification email
 * template for the event (if one exists), then enqueues via send-email job.
 * Falls back to a plain-text email when no template is configured.
 *
 * Skipped when SendGrid API key is not configured.
 */

import prisma from "../../db";
import { getSection } from "../settings";
import { sendEmailJob } from "../send-email";
import { renderNotificationEmail } from "../render-notification-email";
import type { NotifyPayload } from "../notify";

interface ChannelResult {
  status: "sent" | "failed" | "skipped";
  error?: string;
}

export async function deliverEmail(
  userId: string,
  payload: NotifyPayload
): Promise<ChannelResult> {
  try {
    // Respect the global email notifications toggle
    const notifSettings = await getSection("notifications");
    if (!notifSettings.emailNotificationsEnabled) {
      return { status: "skipped" };
    }

    // Require SendGrid to be configured
    const integrations = await getSection("integrations");
    const apiKey   = integrations.sendgridApiKey  || process.env.SENDGRID_API_KEY  || "";
    const fromAddr = integrations.fromEmail        || process.env.SENDGRID_FROM_EMAIL || "";
    if (!apiKey || !fromAddr) {
      return { status: "skipped" };
    }

    // Look up recipient
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, name: true },
    });
    if (!user) return { status: "skipped" };

    // General settings give us the helpdesk name for template branding
    const general = await getSection("general").catch(() => null);

    // Render notification email template for this event
    const rendered = await renderNotificationEmail(payload.event, {
      entityNumber:   payload.entityId,
      entityTitle:    payload.title,
      entityUrl:      payload.entityUrl,
      recipientName:  user.name,
      recipientEmail: user.email,
      note:           payload.body,
      helpdeskName:   general?.helpdeskName,
    });

    // Fall back to a minimal plain-text email when no template is configured
    const subject  = rendered?.subject  ?? payload.title;
    const bodyText = rendered?.bodyText ?? (payload.body ?? payload.title);
    const bodyHtml = rendered?.bodyHtml;

    await sendEmailJob({ to: user.email, subject, body: bodyText, bodyHtml });

    return { status: "sent" };
  } catch (err) {
    return {
      status: "failed",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
