/**
 * slack channel — delivers a notification via a Slack incoming webhook.
 *
 * Set SLACK_WEBHOOK_URL in .env to enable. The webhook URL is the Incoming
 * Webhook URL from your Slack App configuration.
 *
 * Returns "skipped" when SLACK_WEBHOOK_URL is not set.
 */

import type { NotifyPayload } from "../notify";

interface ChannelResult {
  status: "sent" | "failed" | "skipped";
  error?: string;
}

export async function deliverSlack(payload: NotifyPayload): Promise<ChannelResult> {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) return { status: "skipped" };

  try {
    const text = payload.body
      ? `*${payload.title}*\n${payload.body}`
      : `*${payload.title}*`;

    const blocks = [
      { type: "section", text: { type: "mrkdwn", text } },
      ...(payload.entityUrl
        ? [{
            type: "actions",
            elements: [{
              type: "button",
              text: { type: "plain_text", text: "View" },
              url: `${process.env.APP_URL ?? ""}${payload.entityUrl}`,
            }],
          }]
        : []),
    ];

    const resp = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, blocks }),
    });

    if (!resp.ok) {
      const body = await resp.text();
      return { status: "failed", error: `Slack returned ${resp.status}: ${body}` };
    }

    return { status: "sent" };
  } catch (err) {
    return { status: "failed", error: err instanceof Error ? err.message : String(err) };
  }
}
