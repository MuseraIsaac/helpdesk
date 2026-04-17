/**
 * Incident audit event logger — append-only, best-effort.
 * Never throws — a logging failure must not abort the main flow.
 */

import type { Prisma } from "../generated/prisma/client";
import prisma from "../db";
import Sentry from "./sentry";

export async function logIncidentEvent(
  incidentId: number,
  actorId: string | null,
  action: string,
  meta: Record<string, unknown> = {}
): Promise<void> {
  try {
    await prisma.incidentEvent.create({
      data: {
        incidentId,
        actorId,
        action,
        meta: meta as Prisma.InputJsonValue,
      },
    });
  } catch (err) {
    Sentry.captureException(err, {
      tags: { context: "incident_audit", incidentId, action },
    });
    console.error(
      `[incident] Failed to log event "${action}" for incident ${incidentId}:`,
      err
    );
  }
}
