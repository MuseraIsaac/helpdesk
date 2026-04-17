/**
 * Problem Management audit event logger — append-only, best-effort.
 * Never throws — a logging failure must not abort the main flow.
 */

import type { Prisma } from "../generated/prisma/client";
import prisma from "../db";
import Sentry from "./sentry";

export async function logProblemEvent(
  problemId: number,
  actorId: string | null,
  action: string,
  meta: Record<string, unknown> = {}
): Promise<void> {
  try {
    await prisma.problemEvent.create({
      data: {
        problemId,
        actorId,
        action,
        meta: meta as Prisma.InputJsonValue,
      },
    });
  } catch (err) {
    Sentry.captureException(err, {
      tags: { context: "problem_audit", problemId, action },
    });
    console.error(
      `[problem] Failed to log event "${action}" for problem ${problemId}:`,
      err
    );
  }
}
