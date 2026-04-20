/**
 * notifyEntityFollowers — fire-and-forget helper shared by all ITSM modules.
 * Queries entity_follower for the given entity, excludes the actor, checks
 * the relevant settings toggle, then dispatches in-app notifications.
 */

import prisma from "../db";
import { notify } from "./notify";
import { getSection } from "./settings";
import type { NotificationEvent } from "core/constants/notification.ts";
import type { EntityFollowerType } from "../generated/prisma/client";

const SETTINGS_KEY: Record<EntityFollowerType, string> = {
  incident:        "notifyOnFollowedIncidentStatusChanged",
  change:          "notifyOnFollowedChangeStatusChanged",
  service_request: "notifyOnFollowedRequestStatusChanged",
  problem:         "notifyOnFollowedProblemStatusChanged",
};

const ENTITY_LABEL: Record<EntityFollowerType, string> = {
  incident:        "Incident",
  change:          "Change",
  service_request: "Service Request",
  problem:         "Problem",
};

export async function notifyEntityFollowers({
  entityType,
  entityId,
  actorUserId,
  event,
  entityNumber,
  entityTitle,
  fromStatus,
  toStatus,
  entityUrl,
}: {
  entityType:   EntityFollowerType;
  entityId:     number;
  actorUserId:  string;
  event:        NotificationEvent;
  entityNumber: string;
  entityTitle:  string;
  fromStatus:   string;
  toStatus:     string;
  entityUrl:    string;
}): Promise<void> {
  const settings = await getSection("notifications");
  const settingKey = SETTINGS_KEY[entityType] as keyof typeof settings;
  if (settings?.[settingKey] === false) return;

  const followers = await prisma.entityFollower.findMany({
    where: { entityType, entityId },
    select: { userId: true },
  });

  const recipientIds = followers
    .map((f) => f.userId)
    .filter((uid) => uid !== actorUserId);

  if (recipientIds.length === 0) return;

  const label = ENTITY_LABEL[entityType];
  const from  = fromStatus.replace(/_/g, " ");
  const to    = toStatus.replace(/_/g, " ");

  await notify({
    event,
    recipientIds,
    title: `${entityNumber} status changed`,
    body:  `${label} ${entityNumber} — ${from} → ${to}: ${entityTitle}`,
    entityType: entityType.replace("_", "-"),
    entityId:   String(entityId),
    entityUrl,
  });
}
