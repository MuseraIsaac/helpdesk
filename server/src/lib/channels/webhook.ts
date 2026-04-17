/**
 * webhook channel — delivers a notification via a generic HTTP POST.
 *
 * Set NOTIFICATION_WEBHOOK_URL in .env to enable. The payload is a JSON
 * object with the notification fields — your endpoint can transform and
 * forward it to any downstream system (Teams, PagerDuty, etc.).
 *
 * Returns "skipped" when NOTIFICATION_WEBHOOK_URL is not set.
 */

import type { NotifyPayload } from "../notify";

interface ChannelResult {
  status: "sent" | "failed" | "skipped";
  error?: string;
}

export async function deliverWebhook(payload: NotifyPayload): Promise<ChannelResult> {
  const webhookUrl = process.env.NOTIFICATION_WEBHOOK_URL;
  if (!webhookUrl) return { status: "skipped" };

  try {
    const body = {
      event: payload.event,
      title: payload.title,
      body: payload.body ?? null,
      entityType: payload.entityType ?? null,
      entityId: payload.entityId ?? null,
      entityUrl: payload.entityUrl
        ? `${process.env.APP_URL ?? ""}${payload.entityUrl}`
        : null,
      sentAt: new Date().toISOString(),
    };

    const resp = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.NOTIFICATION_WEBHOOK_SECRET
          ? { "X-Notification-Secret": process.env.NOTIFICATION_WEBHOOK_SECRET }
          : {}),
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const text = await resp.text();
      return { status: "failed", error: `Webhook returned ${resp.status}: ${text}` };
    }

    return { status: "sent" };
  } catch (err) {
    return { status: "failed", error: err instanceof Error ? err.message : String(err) };
  }
}
