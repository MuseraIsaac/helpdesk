/**
 * approval-hooks.ts — Post-decision callbacks for approval subjects.
 *
 * The approval engine is intentionally subject-agnostic. When an
 * ApprovalRequest reaches a final state (approved / rejected / expired /
 * cancelled), it fires the hook registered for that subjectType.
 *
 * This keeps the engine decoupled: adding a new governed module (changes,
 * service_requests, policy exceptions, …) only requires registering a handler
 * here — no changes to the engine itself.
 *
 * Usage
 * ─────
 *   // In your module's init / server startup:
 *   registerApprovalHook("change_request", handleChangeApprovalResolved);
 *
 *   // In approval-engine or the /decide route, after a final decision:
 *   await fireApprovalHook(subjectType, approvalRequestId, subjectId, finalStatus);
 */

import Sentry from "./sentry";

export type ApprovalFinalStatus = "approved" | "rejected" | "expired" | "cancelled";

export type ApprovalResolvedHandler = (
  approvalRequestId: number,
  subjectId: string,
  finalStatus: ApprovalFinalStatus
) => Promise<void>;

const registry = new Map<string, ApprovalResolvedHandler>();

/**
 * Register a post-decision handler for a subject type.
 * Call once at server startup (e.g. in index.ts or the module's init file).
 * Registering twice for the same subjectType overwrites the previous handler.
 */
export function registerApprovalHook(
  subjectType: string,
  handler: ApprovalResolvedHandler
): void {
  registry.set(subjectType, handler);
}

/**
 * Fire the registered hook for a subject type after an approval reaches a
 * final state. Errors are caught and logged — hook failures must never
 * propagate back to the HTTP response that triggered the decision.
 */
export async function fireApprovalHook(
  subjectType: string,
  approvalRequestId: number,
  subjectId: string,
  finalStatus: ApprovalFinalStatus
): Promise<void> {
  const handler = registry.get(subjectType);
  if (!handler) return;

  try {
    await handler(approvalRequestId, subjectId, finalStatus);
  } catch (err) {
    Sentry.captureException(err, {
      tags: { context: "approval_hook", subjectType, approvalRequestId, finalStatus },
    });
    console.error(
      `[approval-hook] Handler for "${subjectType}" threw on approval ${approvalRequestId} (${finalStatus}):`,
      err
    );
  }
}
