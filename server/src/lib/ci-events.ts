/**
 * CMDB audit event logger — append-only, best-effort.
 * Never throws — a logging failure must not abort the main flow.
 */

import type { Prisma } from "../generated/prisma/client";
import prisma from "../db";
import Sentry from "./sentry";

export async function logCiEvent(
  ciId: number,
  actorId: string | null,
  action: string,
  meta: Record<string, unknown> = {}
): Promise<void> {
  try {
    await prisma.ciEvent.create({
      data: {
        ciId,
        actorId,
        action,
        meta: meta as Prisma.InputJsonValue,
      },
    });
  } catch (err) {
    Sentry.captureException(err, {
      tags: { context: "ci_audit", ciId, action },
    });
    console.error(
      `[cmdb] Failed to log event "${action}" for CI ${ciId}:`,
      err
    );
  }
}
