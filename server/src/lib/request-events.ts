/**
 * Service Request audit event logger — append-only, best-effort.
 * Never throws — a logging failure must not abort the main request flow.
 */

import type { Prisma } from "../generated/prisma/client";
import prisma from "../db";
import Sentry from "./sentry";

export async function logRequestEvent(
  requestId: number,
  actorId: string | null,
  action: string,
  meta: Record<string, unknown> = {}
): Promise<void> {
  try {
    await prisma.requestEvent.create({
      data: {
        requestId,
        actorId,
        action,
        meta: meta as Prisma.InputJsonValue,
      },
    });
  } catch (err) {
    Sentry.captureException(err, {
      tags: { context: "request_audit", requestId, action },
    });
    console.error(
      `[request] Failed to log event "${action}" for request ${requestId}:`,
      err
    );
  }
}
