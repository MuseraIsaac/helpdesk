/**
 * check-asset-renewals — runs periodically to detect software license
 * and SaaS subscription lifecycle events that require admin attention,
 * then dispatches notifications via the configured channels.
 *
 * Triggered events:
 *   - saas.renewal_soon     SaaS subscription renewal within N days
 *   - license.expiry_soon   software license expiring within N days
 *   - license.expired       software license past its expiry date
 *   - license.over_limit    license assignments > totalSeats
 *
 * Each fired notification is deduplicated per entity per event so the
 * worker can run as often as we want without spamming. The dedup key
 * lives in `Notification.entityId` + `event`.
 *
 * Recipients are computed from CMDB settings:
 *   alertRecipientUserIds + members of alertRecipientTeamIds
 *   plus the asset owner if `notifyAssetOwners` is enabled.
 *
 * Channels are derived from the per-feature switches:
 *   in_app on  → ["in_app"]
 *   email on   → adds "email"
 *   both off   → entire feature is skipped
 */

import type { PgBoss } from "pg-boss";
import prisma from "../db";
import Sentry from "./sentry";
import { notify } from "./notify";
import { getSection } from "./settings";
import type { NotificationChannel, NotificationEvent } from "core/constants/notification.ts";

const QUEUE_NAME = "check-asset-renewals";
// Every 6 hours — license/SaaS dates change at day-granularity.
const CRON_SCHEDULE = "0 */6 * * *";

export async function registerAssetRenewalsWorker(boss: PgBoss): Promise<void> {
  await boss.createQueue(QUEUE_NAME);

  await boss.work(QUEUE_NAME, async () => {
    try {
      await runAssetRenewalCheck();
    } catch (error) {
      Sentry.captureException(error, { tags: { queue: QUEUE_NAME } });
      throw error;
    }
  });

  await boss.schedule(QUEUE_NAME, CRON_SCHEDULE);
}

// ── Internals ────────────────────────────────────────────────────────────────

async function resolveRecipients(
  cfg: Awaited<ReturnType<typeof getSection<"cmdb">>>,
  ownerId: string | null,
): Promise<string[]> {
  const ids = new Set<string>();

  for (const id of cfg.alertRecipientUserIds) ids.add(id);

  if (cfg.alertRecipientTeamIds.length > 0) {
    const members = await prisma.teamMember.findMany({
      where: { teamId: { in: cfg.alertRecipientTeamIds } },
      select: { userId: true },
    });
    for (const m of members) ids.add(m.userId);
  }

  if (cfg.notifyAssetOwners && ownerId) ids.add(ownerId);

  return [...ids];
}

function channelsFor(inAppOn: boolean, emailOn: boolean): NotificationChannel[] | null {
  const channels: NotificationChannel[] = [];
  if (inAppOn) channels.push("in_app");
  if (emailOn) channels.push("email");
  return channels.length > 0 ? channels : null;
}

async function alreadyNotified(
  event: NotificationEvent,
  entityId: string,
  // Don't refire the same alert within this window so a re-run doesn't spam.
  withinDays: number,
): Promise<boolean> {
  const since = new Date(Date.now() - withinDays * 24 * 60 * 60 * 1000);
  const existing = await prisma.notification.findFirst({
    where: { event, entityId, createdAt: { gte: since } },
    select: { id: true },
  });
  return existing !== null;
}

export async function runAssetRenewalCheck(now: Date = new Date()): Promise<void> {
  const cfg = await getSection("cmdb");

  // Both feature toggles off → bail entirely.
  const licenseChannels = channelsFor(cfg.licenseAlertsInAppEnabled, cfg.licenseAlertsEmailEnabled);
  const saasChannels    = channelsFor(cfg.saasAlertsInAppEnabled,    cfg.saasAlertsEmailEnabled);
  if (!licenseChannels && !saasChannels) return;

  // ── Software licenses ─────────────────────────────────────────────────────
  if (licenseChannels) {
    const expiryWindow = new Date(now.getTime() + cfg.licenseExpiryWarningDays * 24 * 60 * 60 * 1000);

    const licenses = await prisma.softwareLicense.findMany({
      where: {
        deletedAt: null,
        status: { not: "expired" },
        OR: [
          { expiryDate: { gte: now, lte: expiryWindow } },          // expiry_soon
          { expiryDate: { lt: now } },                               // expired
        ],
      },
      select: {
        id: true, licenseNumber: true, productName: true, vendor: true,
        expiryDate: true, totalSeats: true, ownerId: true,
      },
    });

    for (const lic of licenses) {
      if (!lic.expiryDate) continue;
      const isExpired = lic.expiryDate < now;
      const event: NotificationEvent = isExpired ? "license.expired" : "license.expiry_soon";

      if (isExpired && !cfg.licenseNotifyOnExpired) continue;

      // Refire allowance: warning re-fires every 7 days, expired re-fires every 30 days.
      const refireDays = isExpired ? 30 : 7;
      if (await alreadyNotified(event, String(lic.id), refireDays)) continue;

      const recipients = await resolveRecipients(cfg, lic.ownerId);
      if (recipients.length === 0) continue;

      const daysOut = Math.round((lic.expiryDate.getTime() - now.getTime()) / 86_400_000);
      const productLabel = lic.vendor ? `${lic.vendor} ${lic.productName}` : lic.productName;
      const title = isExpired
        ? `License expired: ${productLabel}`
        : `License expiring soon: ${productLabel}`;
      const body = isExpired
        ? `${lic.licenseNumber} expired on ${lic.expiryDate.toISOString().slice(0, 10)}.`
        : `${lic.licenseNumber} expires on ${lic.expiryDate.toISOString().slice(0, 10)} (in ${daysOut} day${daysOut === 1 ? "" : "s"}).`;

      void notify({
        event,
        recipientIds: recipients,
        title,
        body,
        entityType: "software_license",
        entityId: String(lic.id),
        entityUrl: `/software/licenses/${lic.id}`,
        channels: licenseChannels,
      });
    }

    // Over-limit detection: count active assignments and compare to totalSeats.
    if (cfg.licenseNotifyOnOverLimit) {
      const seated = await prisma.softwareLicense.findMany({
        where: { deletedAt: null, totalSeats: { not: null } },
        select: {
          id: true, licenseNumber: true, productName: true, vendor: true,
          totalSeats: true, ownerId: true,
          _count: { select: { assignments: true } },
        },
      });

      for (const lic of seated) {
        if (lic.totalSeats === null) continue;
        if (lic._count.assignments <= lic.totalSeats) continue;

        if (await alreadyNotified("license.over_limit", String(lic.id), 7)) continue;

        const recipients = await resolveRecipients(cfg, lic.ownerId);
        if (recipients.length === 0) continue;

        const productLabel = lic.vendor ? `${lic.vendor} ${lic.productName}` : lic.productName;
        void notify({
          event: "license.over_limit",
          recipientIds: recipients,
          title: `License over seat limit: ${productLabel}`,
          body: `${lic.licenseNumber} has ${lic._count.assignments} active assignments but only ${lic.totalSeats} seats.`,
          entityType: "software_license",
          entityId: String(lic.id),
          entityUrl: `/software/licenses/${lic.id}`,
          channels: licenseChannels,
        });
      }
    }
  }

  // ── SaaS subscriptions ────────────────────────────────────────────────────
  if (saasChannels) {
    const renewalWindow = new Date(now.getTime() + cfg.saasRenewalWarningDays * 24 * 60 * 60 * 1000);

    const subs = await prisma.saaSSubscription.findMany({
      where: {
        deletedAt: null,
        status: { in: ["active", "trial"] },
        renewalDate: { gte: now, lte: renewalWindow },
      },
      select: {
        id: true, subscriptionNumber: true, appName: true, vendor: true,
        renewalDate: true, ownerId: true,
      },
    });

    for (const sub of subs) {
      if (!sub.renewalDate) continue;
      if (await alreadyNotified("saas.renewal_soon", String(sub.id), 7)) continue;

      const recipients = await resolveRecipients(cfg, sub.ownerId);
      if (recipients.length === 0) continue;

      const daysOut = Math.round((sub.renewalDate.getTime() - now.getTime()) / 86_400_000);
      const appLabel = sub.vendor ? `${sub.vendor} ${sub.appName}` : sub.appName;
      void notify({
        event: "saas.renewal_soon",
        recipientIds: recipients,
        title: `SaaS renewal upcoming: ${appLabel}`,
        body: `${sub.subscriptionNumber} renews on ${sub.renewalDate.toISOString().slice(0, 10)} (in ${daysOut} day${daysOut === 1 ? "" : "s"}).`,
        entityType: "saas_subscription",
        entityId: String(sub.id),
        entityUrl: `/saas/subscriptions/${sub.id}`,
        channels: saasChannels,
      });
    }
  }
}
