/**
 * notify — core notification dispatch.
 *
 * Creates per-user Notification records and routes each one through the
 * appropriate channel handlers. Always best-effort: never throws.
 *
 * Channel implementations live in ./channels/. Each is modular so more can
 * be added later without touching this file.
 *
 * Current channels:
 *  - in_app  : writes a Notification row (the record IS the notification)
 *  - email   : stub — logs intent, sends if SMTP is configured
 *  - slack   : stub — POST to SLACK_WEBHOOK_URL if configured
 *  - webhook : stub — POST to NOTIFICATION_WEBHOOK_URL if configured
 */

import prisma from "../db";
import Sentry from "./sentry";
import type { NotificationEvent, NotificationChannel } from "core/constants/notification.ts";
import { deliverEmail } from "./channels/email";
import { deliverSlack } from "./channels/slack";
import { deliverWebhook } from "./channels/webhook";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface NotifyPayload {
  /** The event type that triggered the notification */
  event: NotificationEvent;
  /** User IDs of people who should receive this notification */
  recipientIds: string[];
  /** Short title shown in the notification center */
  title: string;
  /** Optional longer description */
  body?: string;
  /** Type of the related entity for navigation — "ticket", "incident", etc. */
  entityType?: string;
  /** String ID of the related entity */
  entityId?: string;
  /** Relative URL the user should be taken to when clicking the notification */
  entityUrl?: string;
  /**
   * Channels to deliver to. Defaults to ["in_app"].
   * Add "email", "slack", or "webhook" to also route through those channels.
   */
  channels?: NotificationChannel[];
}

// ── Main dispatch ─────────────────────────────────────────────────────────────

/**
 * Send a notification to one or more users across one or more channels.
 * Fire-and-forget safe: call with `void notify(...)`.
 */
export async function notify(payload: NotifyPayload): Promise<void> {
  if (payload.recipientIds.length === 0) return;

  // Deduplicate recipient IDs
  const recipientIds = [...new Set(payload.recipientIds)];
  const channels: NotificationChannel[] = payload.channels ?? ["in_app"];

  try {
    // Create one Notification row per recipient, plus delivery log rows for each channel
    const notifications = await prisma.$transaction(
      recipientIds.map((userId) =>
        prisma.notification.create({
          data: {
            userId,
            event: payload.event,
            title: payload.title,
            body: payload.body ?? null,
            entityType: payload.entityType ?? null,
            entityId: payload.entityId ?? null,
            entityUrl: payload.entityUrl ?? null,
            deliveries: {
              create: channels.map((channel) => ({
                channel,
                // in_app is "sent" immediately (the row is the notification)
                status: channel === "in_app" ? "sent" : "pending",
                sentAt: channel === "in_app" ? new Date() : null,
              })),
            },
          },
          select: { id: true, userId: true },
        })
      )
    );

    // Dispatch async channels (email, slack, webhook) — fire-and-forget per notification
    for (const notification of notifications) {
      for (const channel of channels) {
        if (channel === "in_app") continue;

        const deliveryPromise = (async () => {
          let status: "sent" | "failed" | "skipped" = "skipped";
          let error: string | undefined;
          let sentAt: Date | undefined;

          try {
            if (channel === "email") {
              const result = await deliverEmail(notification.userId, payload);
              status = result.status;
              error = result.error;
              if (status === "sent") sentAt = new Date();
            } else if (channel === "slack") {
              const result = await deliverSlack(payload);
              status = result.status;
              error = result.error;
              if (status === "sent") sentAt = new Date();
            } else if (channel === "webhook") {
              const result = await deliverWebhook(payload);
              status = result.status;
              error = result.error;
              if (status === "sent") sentAt = new Date();
            }
          } catch (err) {
            status = "failed";
            error = err instanceof Error ? err.message : String(err);
          }

          // Update the delivery log
          await prisma.notificationDelivery.updateMany({
            where: { notificationId: notification.id, channel },
            data: { status, error: error ?? null, sentAt: sentAt ?? null },
          });
        })();

        deliveryPromise.catch((err) => {
          Sentry.captureException(err, { tags: { context: "notify_channel", channel } });
        });
      }
    }
  } catch (err) {
    Sentry.captureException(err, {
      tags: { context: "notify", event: payload.event },
    });
    console.error("[notify] Failed to create notifications:", err);
  }
}
