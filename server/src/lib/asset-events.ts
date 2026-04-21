import type { Prisma } from "../generated/prisma/client";
import prisma from "../db";
import Sentry from "./sentry";

export async function logAssetEvent(
  assetId: number,
  actorId: string | null,
  action: string,
  meta: Record<string, unknown> = {}
): Promise<void> {
  try {
    await prisma.assetEvent.create({
      data: {
        assetId,
        actorId,
        action,
        meta: meta as Prisma.InputJsonValue,
      },
    });
  } catch (err) {
    Sentry.captureException(err, {
      tags: { context: "asset_audit", assetId, action },
    });
    console.error(
      `[assets] Failed to log event "${action}" for asset ${assetId}:`,
      err
    );
  }
}
