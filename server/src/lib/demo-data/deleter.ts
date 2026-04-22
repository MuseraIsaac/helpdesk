/**
 * Demo Data Deleter
 *
 * Safety guarantees
 * ─────────────────
 * 1. Identity-based deletion only — every DELETE uses WHERE id IN (ids) where ids
 *    come exclusively from batch.recordIds. No heuristics, no name patterns, no
 *    blanket table wipes.
 * 2. Pre-deletion live count verification — previewBatchDeletion() queries the DB
 *    to count how many of the recorded IDs still exist, giving the UI accurate
 *    data for the confirmation dialog before deletion begins.
 * 3. FK-order compliance — child records are removed before parent records to
 *    avoid constraint violations without relying on cascade deletes.
 * 4. Audit trail — deletedById, deletedByName, deletedAt are written to the
 *    DemoBatch row; every deletion is also structured-logged to stdout.
 * 5. Partial-failure recovery — if any step throws, the batch is marked "error"
 *    and the partial deletedCounts are preserved in the error payload so an admin
 *    can inspect what was removed before the failure.
 */

import prisma from "../../db";

// ── Shared types ──────────────────────────────────────────────────────────────

export interface DeletionActor {
  id:   string;
  name: string;
}

interface StoredRecordIds {
  userIds?:            string[];
  teamIds?:            number[];
  orgIds?:             number[];
  customerIds?:        number[];
  kbCategoryIds?:      number[];
  kbArticleIds?:       number[];
  macroIds?:           number[];
  cabGroupIds?:        number[];
  catalogItemIds?:     number[];
  ticketIds?:          number[];
  incidentIds?:        number[];
  requestIds?:         number[];
  problemIds?:         number[];
  changeIds?:          number[];
  assetIds?:           number[];
  ciIds?:              number[];
  noteIds?:            number[];
  replyIds?:           number[];
  csatRatingIds?:      number[];
  incidentUpdateIds?:  number[];
  approvalRequestIds?: number[];
}

export interface LiveEntityCounts {
  users:           number;
  teams:           number;
  organisations:   number;
  customers:       number;
  kbArticles:      number;
  kbCategories:    number;
  macros:          number;
  cabGroups:       number;
  catalogItems:    number;
  tickets:         number;
  incidents:       number;
  serviceRequests: number;
  problems:        number;
  changes:         number;
  assets:          number;
  configItems:     number;
  // sub-records (notes, replies, etc.) counted separately for display clarity
  notes:           number;
  replies:         number;
  csatRatings:     number;
  incidentUpdates: number;
  approvals:       number;
}

export interface BatchPreview {
  batchId:    number;
  batchLabel: string;
  liveCounts: LiveEntityCounts;
  totalLive:  number;
  /** True when one or more IDs from recordIds no longer exist in the DB
   *  (e.g. cascade-deleted by another operation). The deletion will still
   *  succeed — we simply skip missing records. */
  hasStaleIds: boolean;
}

export interface DeletionSummary {
  batchId:      number;
  batchLabel:   string;
  deletedAt:    Date;
  deletedBy:    DeletionActor;
  entityCounts: Partial<LiveEntityCounts>;
}

// ── Pre-deletion preview ──────────────────────────────────────────────────────

/**
 * Returns the count of records that actually still exist in the database for
 * each entity type tracked by the batch. Use this to populate the confirmation
 * dialog before calling deleteDemoBatch().
 */
export async function previewBatchDeletion(batchId: number): Promise<BatchPreview> {
  const batch = await prisma.demoBatch.findUnique({ where: { id: batchId } });
  if (!batch) throw new Error(`Batch ${batchId} not found`);

  const ids = batch.recordIds as StoredRecordIds;

  // Count in parallel for speed
  const [
    users, teams, orgs, customers, kbArticles, kbCategories,
    macros, cabGroups, catalogItems,
    tickets, incidents, serviceRequests, problems, changes,
    assets, configItems, notes, replies, csatRatings, incidentUpdates, approvals,
  ] = await Promise.all([
    ids.userIds?.length            ? prisma.user.count({ where: { id: { in: ids.userIds } } }) : 0,
    ids.teamIds?.length            ? prisma.team.count({ where: { id: { in: ids.teamIds } } }) : 0,
    ids.orgIds?.length             ? prisma.organization.count({ where: { id: { in: ids.orgIds } } }) : 0,
    ids.customerIds?.length        ? prisma.customer.count({ where: { id: { in: ids.customerIds } } }) : 0,
    ids.kbArticleIds?.length       ? prisma.kbArticle.count({ where: { id: { in: ids.kbArticleIds } } }) : 0,
    ids.kbCategoryIds?.length      ? prisma.kbCategory.count({ where: { id: { in: ids.kbCategoryIds } } }) : 0,
    ids.macroIds?.length           ? prisma.macro.count({ where: { id: { in: ids.macroIds } } }) : 0,
    ids.cabGroupIds?.length        ? prisma.cabGroup.count({ where: { id: { in: ids.cabGroupIds } } }) : 0,
    ids.catalogItemIds?.length     ? prisma.catalogItem.count({ where: { id: { in: ids.catalogItemIds } } }) : 0,
    ids.ticketIds?.length          ? prisma.ticket.count({ where: { id: { in: ids.ticketIds } } }) : 0,
    ids.incidentIds?.length        ? prisma.incident.count({ where: { id: { in: ids.incidentIds } } }) : 0,
    ids.requestIds?.length         ? prisma.serviceRequest.count({ where: { id: { in: ids.requestIds } } }) : 0,
    ids.problemIds?.length         ? prisma.problem.count({ where: { id: { in: ids.problemIds } } }) : 0,
    ids.changeIds?.length          ? prisma.change.count({ where: { id: { in: ids.changeIds } } }) : 0,
    ids.assetIds?.length           ? prisma.asset.count({ where: { id: { in: ids.assetIds } } }) : 0,
    ids.ciIds?.length              ? prisma.configItem.count({ where: { id: { in: ids.ciIds } } }) : 0,
    ids.noteIds?.length            ? prisma.note.count({ where: { id: { in: ids.noteIds } } }) : 0,
    ids.replyIds?.length           ? prisma.reply.count({ where: { id: { in: ids.replyIds } } }) : 0,
    ids.csatRatingIds?.length      ? prisma.csatRating.count({ where: { id: { in: ids.csatRatingIds } } }) : 0,
    ids.incidentUpdateIds?.length  ? prisma.incidentUpdate.count({ where: { id: { in: ids.incidentUpdateIds } } }) : 0,
    ids.approvalRequestIds?.length ? prisma.approvalRequest.count({ where: { id: { in: ids.approvalRequestIds } } }) : 0,
  ]);

  const liveCounts: LiveEntityCounts = {
    users, teams, organisations: orgs, customers,
    kbArticles, kbCategories, macros, cabGroups, catalogItems,
    tickets, incidents, serviceRequests, problems, changes,
    assets, configItems,
    notes, replies, csatRatings, incidentUpdates, approvals,
  };

  const totalLive = Object.values(liveCounts).reduce((s, v) => s + v, 0);

  // Check for stale IDs (recorded count vs live count)
  const recorded = Object.values(batch.recordCounts as Record<string, number>).reduce((s, v) => s + v, 0);
  const hasStaleIds = totalLive < recorded;

  return { batchId, batchLabel: batch.label, liveCounts, totalLive, hasStaleIds };
}

// ── Single batch deletion ─────────────────────────────────────────────────────

/**
 * Permanently removes every record tracked in the batch.
 * Must only be called on batches with status "ready" or "error".
 * Records the actor and timestamps in the DemoBatch row.
 */
export async function deleteDemoBatch(batchId: number, actor: DeletionActor): Promise<DeletionSummary> {
  const batch = await prisma.demoBatch.findUnique({ where: { id: batchId } });
  if (!batch)                        throw new Error(`Demo batch ${batchId} not found`);
  if (batch.status === "deleted")    throw new Error(`Batch ${batchId} is already deleted`);
  if (batch.status === "deleting")   throw new Error(`Batch ${batchId} is currently being deleted`);
  if (batch.status === "generating") throw new Error(`Batch ${batchId} is still generating — wait for it to complete`);

  const deletedAt = new Date();

  // Mark as deleting immediately so concurrent requests are rejected
  await prisma.demoBatch.update({
    where: { id: batchId },
    data:  { status: "deleting", deletedById: actor.id, deletedByName: actor.name },
  });

  // Structured audit log — written before deletion so it appears even on failure
  console.info(JSON.stringify({
    event:      "demo_batch.deletion_started",
    batchId,
    batchLabel: batch.label,
    actor:      { id: actor.id, name: actor.name },
    timestamp:  deletedAt.toISOString(),
    recordedCounts: batch.recordCounts,
  }));

  const ids = batch.recordIds as StoredRecordIds;
  const deleted: Partial<LiveEntityCounts> = {};

  try {
    // ── 1. Approval engine (deepest children first) ──────────────────────────
    if (ids.approvalRequestIds?.length) {
      await prisma.approvalDecision.deleteMany({ where: { step: { approvalRequestId: { in: ids.approvalRequestIds } } } });
      await prisma.approvalStep.deleteMany({ where: { approvalRequestId: { in: ids.approvalRequestIds } } });
      await prisma.approvalEvent.deleteMany({ where: { approvalRequestId: { in: ids.approvalRequestIds } } });
      const { count } = await prisma.approvalRequest.deleteMany({ where: { id: { in: ids.approvalRequestIds } } });
      deleted.approvals = count;
    }

    // ── 2. Ticket sub-records ────────────────────────────────────────────────
    if (ids.csatRatingIds?.length) {
      const { count } = await prisma.csatRating.deleteMany({ where: { id: { in: ids.csatRatingIds } } });
      deleted.csatRatings = count;
    }
    if (ids.noteIds?.length) {
      const { count } = await prisma.note.deleteMany({ where: { id: { in: ids.noteIds } } });
      deleted.notes = count;
    }
    if (ids.replyIds?.length) {
      const { count } = await prisma.reply.deleteMany({ where: { id: { in: ids.replyIds } } });
      deleted.replies = count;
    }

    // ── 3. Incident updates ──────────────────────────────────────────────────
    if (ids.incidentUpdateIds?.length) {
      const { count } = await prisma.incidentUpdate.deleteMany({ where: { id: { in: ids.incidentUpdateIds } } });
      deleted.incidentUpdates = count;
    }

    // ── 4. Problem sub-records ───────────────────────────────────────────────
    if (ids.problemIds?.length) {
      await prisma.problemIncidentLink.deleteMany({ where: { problemId: { in: ids.problemIds } } });
      await prisma.problemTicketLink.deleteMany({ where: { problemId: { in: ids.problemIds } } });
      await prisma.problemNote.deleteMany({ where: { problemId: { in: ids.problemIds } } });
      await prisma.problemEvent.deleteMany({ where: { problemId: { in: ids.problemIds } } });
    }

    // ── 5. Change sub-records ────────────────────────────────────────────────
    if (ids.changeIds?.length) {
      await prisma.changeCiLink.deleteMany({ where: { changeId: { in: ids.changeIds } } });
      await prisma.changeTask.deleteMany({ where: { changeId: { in: ids.changeIds } } });
      await prisma.changeEvent.deleteMany({ where: { changeId: { in: ids.changeIds } } });
      await prisma.changeAttachment.deleteMany({ where: { changeId: { in: ids.changeIds } } });
    }

    // ── 6. Incident sub-records ──────────────────────────────────────────────
    if (ids.incidentIds?.length) {
      await prisma.incidentCiLink.deleteMany({ where: { incidentId: { in: ids.incidentIds } } });
      await prisma.incidentEvent.deleteMany({ where: { incidentId: { in: ids.incidentIds } } });
    }

    // ── 7. Ticket audit + escalation events ──────────────────────────────────
    if (ids.ticketIds?.length) {
      await prisma.auditEvent.deleteMany({ where: { ticketId: { in: ids.ticketIds } } });
      await prisma.escalationEvent.deleteMany({ where: { ticketId: { in: ids.ticketIds } } });
      await prisma.ticketFollower.deleteMany({ where: { ticketId: { in: ids.ticketIds } } });
      await prisma.ticketCiLink.deleteMany({ where: { ticketId: { in: ids.ticketIds } } });
    }

    // ── 8. Asset sub-records (junction tables) ────────────────────────────────
    if (ids.assetIds?.length) {
      await prisma.assetIncidentLink.deleteMany({ where: { assetId: { in: ids.assetIds } } });
      await prisma.assetChangeLink.deleteMany({ where: { assetId: { in: ids.assetIds } } });
      await prisma.assetProblemLink.deleteMany({ where: { assetId: { in: ids.assetIds } } });
      await prisma.assetRequestLink.deleteMany({ where: { assetId: { in: ids.assetIds } } });
      await prisma.assetRelationship.deleteMany({ where: { OR: [{ fromAssetId: { in: ids.assetIds } }, { toAssetId: { in: ids.assetIds } }] } });
      await prisma.assetEvent.deleteMany({ where: { assetId: { in: ids.assetIds } } });
      await prisma.assetAssignment.deleteMany({ where: { assetId: { in: ids.assetIds } } });
      // Break CI FK before deleting assets
      await prisma.asset.updateMany({ where: { id: { in: ids.assetIds } }, data: { ciId: null } });
    }

    // ── 9. CMDB sub-records ──────────────────────────────────────────────────
    if (ids.ciIds?.length) {
      await prisma.ciRelationship.deleteMany({ where: { OR: [{ fromCiId: { in: ids.ciIds } }, { toCiId: { in: ids.ciIds } }] } });
      await prisma.ciEvent.deleteMany({ where: { ciId: { in: ids.ciIds } } });
      await prisma.ticketCiLink.deleteMany({ where: { ciId: { in: ids.ciIds } } });
      await prisma.incidentCiLink.deleteMany({ where: { ciId: { in: ids.ciIds } } });
      await prisma.problemCiLink.deleteMany({ where: { ciId: { in: ids.ciIds } } });
      await prisma.changeCiLink.deleteMany({ where: { ciId: { in: ids.ciIds } } });
    }

    // ── 10. Main entity records (leaves → roots) ──────────────────────────────
    if (ids.assetIds?.length) {
      const { count } = await prisma.asset.deleteMany({ where: { id: { in: ids.assetIds } } });
      deleted.assets = count;
    }
    if (ids.ciIds?.length) {
      const { count } = await prisma.configItem.deleteMany({ where: { id: { in: ids.ciIds } } });
      deleted.configItems = count;
    }
    if (ids.changeIds?.length) {
      const { count } = await prisma.change.deleteMany({ where: { id: { in: ids.changeIds } } });
      deleted.changes = count;
    }
    if (ids.problemIds?.length) {
      const { count } = await prisma.problem.deleteMany({ where: { id: { in: ids.problemIds } } });
      deleted.problems = count;
    }
    if (ids.requestIds?.length) {
      await prisma.requestItem.deleteMany({ where: { requestId: { in: ids.requestIds } } });
      await prisma.fulfillmentTask.deleteMany({ where: { requestId: { in: ids.requestIds } } });
      await prisma.requestEvent.deleteMany({ where: { requestId: { in: ids.requestIds } } });
      const { count } = await prisma.serviceRequest.deleteMany({ where: { id: { in: ids.requestIds } } });
      deleted.serviceRequests = count;
    }
    if (ids.incidentIds?.length) {
      const { count } = await prisma.incident.deleteMany({ where: { id: { in: ids.incidentIds } } });
      deleted.incidents = count;
    }
    if (ids.ticketIds?.length) {
      const { count } = await prisma.ticket.deleteMany({ where: { id: { in: ids.ticketIds } } });
      deleted.tickets = count;
    }

    // ── 11. Knowledge base ────────────────────────────────────────────────────
    if (ids.kbArticleIds?.length) {
      await prisma.kbArticleVersion.deleteMany({ where: { articleId: { in: ids.kbArticleIds } } });
      await prisma.kbArticleFeedback.deleteMany({ where: { articleId: { in: ids.kbArticleIds } } });
      const { count } = await prisma.kbArticle.deleteMany({ where: { id: { in: ids.kbArticleIds } } });
      deleted.kbArticles = count;
    }
    if (ids.kbCategoryIds?.length) {
      const { count } = await prisma.kbCategory.deleteMany({ where: { id: { in: ids.kbCategoryIds } } });
      deleted.kbCategories = count;
    }

    // ── 12. Supporting entities ───────────────────────────────────────────────
    if (ids.macroIds?.length) {
      const { count } = await prisma.macro.deleteMany({ where: { id: { in: ids.macroIds } } });
      deleted.macros = count;
    }
    if (ids.catalogItemIds?.length) {
      const { count } = await prisma.catalogItem.deleteMany({ where: { id: { in: ids.catalogItemIds } } });
      deleted.catalogItems = count;
    }
    if (ids.cabGroupIds?.length) {
      await prisma.cabMember.deleteMany({ where: { cabGroupId: { in: ids.cabGroupIds } } });
      const { count } = await prisma.cabGroup.deleteMany({ where: { id: { in: ids.cabGroupIds } } });
      deleted.cabGroups = count;
    }

    // ── 13. Contacts ──────────────────────────────────────────────────────────
    if (ids.customerIds?.length) {
      const { count } = await prisma.customer.deleteMany({ where: { id: { in: ids.customerIds } } });
      deleted.customers = count;
    }
    if (ids.orgIds?.length) {
      await prisma.serviceEntitlement.deleteMany({ where: { organizationId: { in: ids.orgIds } } });
      const { count } = await prisma.organization.deleteMany({ where: { id: { in: ids.orgIds } } });
      deleted.organisations = count;
    }

    // ── 14. Teams ─────────────────────────────────────────────────────────────
    if (ids.teamIds?.length) {
      await prisma.teamMember.deleteMany({ where: { teamId: { in: ids.teamIds } } });
      const { count } = await prisma.team.deleteMany({ where: { id: { in: ids.teamIds } } });
      deleted.teams = count;
    }

    // ── 15. Users (last — many tables hold FK references to user) ────────────
    if (ids.userIds?.length) {
      await prisma.userPreference.deleteMany({ where: { userId: { in: ids.userIds } } });
      await prisma.account.deleteMany({ where: { userId: { in: ids.userIds } } });
      await prisma.session.deleteMany({ where: { userId: { in: ids.userIds } } });
      const { count } = await prisma.user.deleteMany({ where: { id: { in: ids.userIds } } });
      deleted.users = count;
    }

    // ── Finalise batch record ─────────────────────────────────────────────────
    await prisma.demoBatch.update({
      where: { id: batchId },
      data:  { status: "deleted", deletedAt },
    });

    const summary: DeletionSummary = { batchId, batchLabel: batch.label, deletedAt, deletedBy: actor, entityCounts: deleted };

    console.info(JSON.stringify({
      event:       "demo_batch.deletion_completed",
      batchId,
      batchLabel:  batch.label,
      actor:       { id: actor.id, name: actor.name },
      timestamp:   deletedAt.toISOString(),
      entityCounts: deleted,
    }));

    return summary;

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(JSON.stringify({
      event:      "demo_batch.deletion_failed",
      batchId,
      batchLabel: batch.label,
      actor:      { id: actor.id, name: actor.name },
      error:      msg,
      partialDeletions: deleted,
    }));
    await prisma.demoBatch.update({
      where: { id: batchId },
      data:  { status: "error", errorMessage: `Deletion failed: ${msg}` },
    }).catch(() => {});
    throw err;
  }
}

// ── Delete all batches ────────────────────────────────────────────────────────

export interface DeleteAllResult {
  attempted:  number;
  succeeded:  number;
  failed:     number;
  skipped:    number;
  summaries:  DeletionSummary[];
  errors:     { batchId: number; label: string; error: string }[];
}

/**
 * Deletes every batch that is currently in "ready" or "error" state.
 * Batches in "generating" or "deleting" state are skipped.
 * Runs sequentially (not in parallel) to avoid DB lock contention.
 */
export async function deleteAllDemoBatches(actor: DeletionActor): Promise<DeleteAllResult> {
  const candidates = await prisma.demoBatch.findMany({
    where: { status: { in: ["ready", "error"] } },
    orderBy: { createdAt: "asc" },
  });

  console.info(JSON.stringify({
    event:     "demo_batch.delete_all_started",
    count:     candidates.length,
    actor:     { id: actor.id, name: actor.name },
    timestamp: new Date().toISOString(),
  }));

  const result: DeleteAllResult = { attempted: candidates.length, succeeded: 0, failed: 0, skipped: 0, summaries: [], errors: [] };

  for (const batch of candidates) {
    // Re-fetch to verify state hasn't changed since we queried
    const fresh = await prisma.demoBatch.findUnique({ where: { id: batch.id } });
    if (!fresh || !["ready", "error"].includes(fresh.status)) {
      result.skipped++;
      continue;
    }
    try {
      const summary = await deleteDemoBatch(batch.id, actor);
      result.summaries.push(summary);
      result.succeeded++;
    } catch (err) {
      result.errors.push({ batchId: batch.id, label: batch.label, error: err instanceof Error ? err.message : String(err) });
      result.failed++;
    }
  }

  console.info(JSON.stringify({
    event:     "demo_batch.delete_all_completed",
    actor:     { id: actor.id, name: actor.name },
    timestamp: new Date().toISOString(),
    result:    { attempted: result.attempted, succeeded: result.succeeded, failed: result.failed, skipped: result.skipped },
  }));

  return result;
}
