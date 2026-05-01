/**
 * /api/changes — Change Management endpoints.
 *
 * Endpoints:
 *   GET    /api/changes                         — list change requests (paginated, filterable)
 *   GET    /api/changes/:id                     — fetch a single change with tasks and events
 *   POST   /api/changes                         — create a new change request (draft state)
 *   PATCH  /api/changes/:id                     — update a change (fields + state transitions)
 *   GET    /api/changes/:id/conflicts           — detect schedule/CI/service/team conflicts
 *   GET    /api/changes/:id/approval            — get the latest approval request for a change
 *   POST   /api/changes/:id/request-approval    — submit a change for CAB approval
 *   POST   /api/changes/:id/ci-links            — link an additional CI to a change
 *   DELETE /api/changes/:id/ci-links/:ciId      — remove a CI link from a change
 *   POST   /api/changes/:id/tasks               — create a task on a change
 *   PATCH  /api/changes/:id/tasks/:taskId       — update a task (status, title, etc.)
 *   DELETE /api/changes/:id/tasks/:taskId       — remove a task from a change
 */

import { Router } from "express";
import { requireAuth } from "../middleware/require-auth";
import { requirePermission } from "../middleware/require-permission";
import { validate } from "../lib/validate";
import { parseId } from "../lib/parse-id";
import {
  createChangeSchema,
  updateChangeSchema,
  listChangesQuerySchema,
} from "core/schemas/changes.ts";
import { generateChangeNumber } from "../lib/change-number";
import { getSection } from "../lib/settings";
import {
  requestChangeApproval,
  getChangeApproval,
  getAllChangeApprovals,
  assertChangeApproved,
  ApprovalRequiredError,
} from "../lib/change-approval";
import { detectChangeConflicts } from "../lib/change-conflicts";
import { notify } from "../lib/notify";
import { notifyEntityFollowers } from "../lib/notify-entity-followers";
import { fireChangeEvent } from "../lib/event-bus";
import { logSystemAudit } from "../lib/audit";
import prisma from "../db";
import type { Prisma } from "../generated/prisma/client";

const router = Router();

// ── Shared select projections ─────────────────────────────────────────────────

const USER_SUMMARY   = { id: true, name: true } as const;
const TEAM_SUMMARY   = { id: true, name: true, color: true } as const;

const LIST_SELECT = {
  id:           true,
  changeNumber: true,
  title:        true,
  state:        true,
  changeType:   true,
  changeModel:  true,
  risk:         true,
  priority:     true,
  impact:       true,
  urgency:      true,
  changePurpose: true,
  categorizationTier1: true,
  serviceName:  true,
  service:      { select: { id: true, name: true } },
  coordinatorGroup: { select: TEAM_SUMMARY },
  assignedTo:   { select: USER_SUMMARY },
  createdBy:    { select: USER_SUMMARY },
  plannedStart: true,
  plannedEnd:   true,
  submittedAt:  true,
  approvedAt:   true,
  closedAt:     true,
  createdAt:    true,
  updatedAt:    true,
} as const;

const DETAIL_SELECT = {
  ...LIST_SELECT,
  description:  true,
  categorizationTier2: true,
  categorizationTier3: true,
  serviceCategoryTier2: true,
  serviceCategoryTier3: true,
  configurationItemId: true,
  configurationItem: { select: { id: true, name: true, ciNumber: true } },
  linkedProblemId: true,
  linkedProblem: { select: { id: true, problemNumber: true, title: true } },
  actualStart: true,
  actualEnd:   true,
  justification: true,
  workInstructions: true,
  serviceImpactAssessment: true,
  rollbackPlan: true,
  riskAssessmentAndMitigation: true,
  prechecks:   true,
  postchecks:  true,
  notificationRequired: true,
  impactedUsers:        true,
  communicationNotes:   true,
  implementationOutcome: true,
  rollbackUsed:   true,
  closureCode:    true,
  closureNotes:   true,
  reviewSummary:  true,
  lessonsLearned: true,
  tasks: {
    orderBy: [
      { phase: "asc" as const },
      { position: "asc" as const },
    ] as { phase: "asc"; position?: "asc" | "desc" }[],
    select: {
      id: true,
      phase: true,
      position: true,
      title: true,
      description: true,
      status: true,
      assignedTo: { select: USER_SUMMARY },
      completedAt: true,
      completionNote: true,
    },
  },
  events: {
    orderBy: { createdAt: "asc" as const },
    select: {
      id: true,
      action: true,
      meta: true,
      actor: { select: USER_SUMMARY },
      createdAt: true,
    },
  },
  ciLinks: {
    orderBy: { linkedAt: "asc" as const },
    select: {
      id: true,
      ciId: true,
      linkedAt: true,
      linkedBy: { select: USER_SUMMARY },
      ci: {
        select: {
          id: true,
          ciNumber: true,
          name: true,
          type: true,
          environment: true,
          criticality: true,
          status: true,
        },
      },
    },
  },
} as const;

// ── GET /api/changes ──────────────────────────────────────────────────────────

router.get(
  "/",
  requireAuth,
  requirePermission("changes.view"),
  async (req, res) => {
    const query = validate(listChangesQuerySchema, req.query, res);
    if (!query) return;

    const { state, changeType, risk, priority, assignedToMe, search, page, pageSize, sortBy, sortOrder } = query;

    const where: Prisma.ChangeWhereInput = { deletedAt: null };
    if (state)      where.state      = state;
    if (changeType) where.changeType = changeType;
    if (risk)       where.risk       = risk;
    if (priority)   where.priority   = priority;
    if (assignedToMe) where.assignedToId = req.user.id;
    if (search) {
      where.OR = [
        { changeNumber: { contains: search, mode: "insensitive" } },
        { title:        { contains: search, mode: "insensitive" } },
        { serviceName:  { contains: search, mode: "insensitive" } },
        { categorizationTier1: { contains: search, mode: "insensitive" } },
      ];
    }

    const orderBy: Prisma.ChangeOrderByWithRelationInput =
      sortBy === "plannedStart" ? { plannedStart: sortOrder }
      : sortBy === "risk"       ? { risk: sortOrder }
      : sortBy === "priority"   ? { priority: sortOrder }
      : sortBy === "state"      ? { state: sortOrder }
      : sortBy === "updatedAt"  ? { updatedAt: sortOrder }
      : { createdAt: sortOrder };

    const [total, changes] = await prisma.$transaction([
      prisma.change.count({ where }),
      prisma.change.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: LIST_SELECT,
      }),
    ]);

    res.json({
      changes,
      meta: { total, page, pageSize, pages: Math.ceil(total / pageSize) },
    });
  }
);

// ── GET /api/changes/:id ──────────────────────────────────────────────────────

router.get(
  "/:id",
  requireAuth,
  requirePermission("changes.view"),
  async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) { res.status(400).json({ error: "Invalid ID" }); return; }

    const change = await prisma.change.findUnique({ where: { id }, select: DETAIL_SELECT });
    if (!change) { res.status(404).json({ error: "Change not found" }); return; }

    res.json(change);
  }
);

// ── POST /api/changes ─────────────────────────────────────────────────────────

router.post(
  "/",
  requireAuth,
  requirePermission("changes.create"),
  async (req, res) => {
    const data = validate(createChangeSchema, req.body, res);
    if (!data) return;

    // Validate referenced records exist
    if (data.assignedToId) {
      const u = await prisma.user.findFirst({ where: { id: data.assignedToId, deletedAt: null } });
      if (!u) { res.status(400).json({ error: "Assignee not found" }); return; }
    }
    if (data.coordinatorGroupId) {
      const t = await prisma.team.findUnique({ where: { id: data.coordinatorGroupId } });
      if (!t) { res.status(400).json({ error: "Coordinator group not found" }); return; }
    }
    if (data.linkedProblemId) {
      const p = await prisma.problem.findUnique({ where: { id: data.linkedProblemId } });
      if (!p) { res.status(400).json({ error: "Linked problem not found" }); return; }
    }

    const changeNumber = await generateChangeNumber();

    const change = await prisma.change.create({
      data: {
        changeNumber,
        title:        data.title,
        description:  data.description ?? null,
        changeType:   data.changeType,
        changeModel:  data.changeModel,
        state:        "draft",
        risk:         data.risk,
        changePurpose: data.changePurpose ?? null,
        priority:     data.priority,
        impact:       data.impact,
        urgency:      data.urgency,
        categorizationTier1: data.categorizationTier1 ?? null,
        categorizationTier2: data.categorizationTier2 ?? null,
        categorizationTier3: data.categorizationTier3 ?? null,
        serviceCategoryTier2: data.serviceCategoryTier2 ?? null,
        serviceCategoryTier3: data.serviceCategoryTier3 ?? null,
        serviceId:    data.serviceId ?? null,
        serviceName:  data.serviceName ?? null,
        configurationItemId: data.configurationItemId ?? null,
        coordinatorGroupId:  data.coordinatorGroupId ?? null,
        assignedToId:  data.assignedToId ?? null,
        linkedProblemId: data.linkedProblemId ?? null,
        plannedStart:  data.plannedStart ? new Date(data.plannedStart) : null,
        plannedEnd:    data.plannedEnd   ? new Date(data.plannedEnd)   : null,
        justification: data.justification ?? null,
        workInstructions: data.workInstructions ?? null,
        serviceImpactAssessment: data.serviceImpactAssessment ?? null,
        rollbackPlan:  data.rollbackPlan ?? null,
        riskAssessmentAndMitigation: data.riskAssessmentAndMitigation ?? null,
        prechecks:     data.prechecks  ?? null,
        postchecks:    data.postchecks ?? null,
        notificationRequired: data.notificationRequired ?? null,
        impactedUsers:        data.impactedUsers        ?? null,
        communicationNotes:   data.communicationNotes   ?? null,
        customFields:   (data.customFields ?? {}) as any,
        organizationId: data.organizationId ?? null,
        createdById:    req.user.id,
      },
      select: DETAIL_SELECT,
    });

    // Write creation event
    await prisma.changeEvent.create({
      data: {
        changeId: change.id,
        actorId:  req.user.id,
        action:   "change.created",
        meta:     { changeNumber, title: change.title },
      },
    });

    void logSystemAudit(req.user.id, "change.created", {
      entityType: "change", entityId: change.id, entityNumber: changeNumber,
      entityTitle: change.title, changeType: change.changeType, risk: change.risk,
    });

    // Fire change.created event for event_workflow rules
    fireChangeEvent("change.created", change.id, req.user.id);

    res.status(201).json(change);
  }
);

// ── PATCH /api/changes/:id ────────────────────────────────────────────────────

router.patch(
  "/:id",
  requireAuth,
  requirePermission("changes.update"),
  async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) { res.status(400).json({ error: "Invalid ID" }); return; }

    const data = validate(updateChangeSchema, req.body, res);
    if (!data) return;

    const existing = await prisma.change.findUnique({
      where: { id },
      select: {
        id: true,
        state: true,
        risk: true,
        priority: true,
        changeType: true,
        assignedToId: true,
        assignedTo: { select: { id: true, name: true } },
        coordinatorGroupId: true,
        coordinatorGroup: { select: { id: true, name: true } },
        plannedStart: true,
        plannedEnd: true,
        title: true,
      },
    });
    if (!existing) { res.status(404).json({ error: "Change not found" }); return; }

    // Closed/cancelled changes are immutable except for re-opening via state (future)
    if (existing.state === "closed" || existing.state === "cancelled") {
      res.status(422).json({ error: "Closed or cancelled changes cannot be modified" });
      return;
    }

    // Approval gate: "scheduled" requires an approved CAB approval request.
    // Standard changes (pre-approved model) bypass this gate if autoApproveStandard
    // is configured — for now we enforce for all types, matching requireCabForNormal.
    if (data.state === "scheduled") {
      try {
        await assertChangeApproved(id);
      } catch (err) {
        if (err instanceof ApprovalRequiredError) {
          res.status(422).json({ error: err.message });
          return;
        }
        throw err;
      }
    }

    // Build update payload — only include provided fields
    const updateData: Prisma.ChangeUpdateInput = {};
    if (data.title !== undefined)        updateData.title        = data.title;
    if (data.description !== undefined)  updateData.description  = data.description;
    if (data.changeType !== undefined)   updateData.changeType   = data.changeType;
    if (data.changeModel !== undefined)  updateData.changeModel  = data.changeModel;
    if (data.state !== undefined)        updateData.state        = data.state;
    if (data.risk !== undefined)         updateData.risk         = data.risk;
    if (data.changePurpose !== undefined) updateData.changePurpose = data.changePurpose;
    if (data.priority !== undefined)     updateData.priority     = data.priority;
    if (data.impact !== undefined)       updateData.impact       = data.impact;
    if (data.urgency !== undefined)      updateData.urgency      = data.urgency;
    if (data.categorizationTier1 !== undefined) updateData.categorizationTier1 = data.categorizationTier1;
    if (data.categorizationTier2 !== undefined) updateData.categorizationTier2 = data.categorizationTier2;
    if (data.categorizationTier3 !== undefined) updateData.categorizationTier3 = data.categorizationTier3;
    if (data.serviceCategoryTier2 !== undefined) updateData.serviceCategoryTier2 = data.serviceCategoryTier2;
    if (data.serviceCategoryTier3 !== undefined) updateData.serviceCategoryTier3 = data.serviceCategoryTier3;
    if (data.serviceId !== undefined) {
      updateData.service = data.serviceId
        ? { connect: { id: data.serviceId } }
        : { disconnect: true };
    }
    if (data.serviceName !== undefined) updateData.serviceName = data.serviceName;
    if (data.configurationItemId !== undefined) {
      updateData.configurationItem = data.configurationItemId
        ? { connect: { id: data.configurationItemId } }
        : { disconnect: true };
    }
    if (data.coordinatorGroupId !== undefined) {
      updateData.coordinatorGroup = data.coordinatorGroupId
        ? { connect: { id: data.coordinatorGroupId } }
        : { disconnect: true };
    }
    if (data.assignedToId !== undefined) {
      updateData.assignedTo = data.assignedToId
        ? { connect: { id: data.assignedToId } }
        : { disconnect: true };
    }
    if (data.linkedProblemId !== undefined) {
      updateData.linkedProblem = data.linkedProblemId
        ? { connect: { id: data.linkedProblemId } }
        : { disconnect: true };
    }
    if (data.plannedStart !== undefined) updateData.plannedStart = data.plannedStart ? new Date(data.plannedStart) : null;
    if (data.plannedEnd !== undefined)   updateData.plannedEnd   = data.plannedEnd   ? new Date(data.plannedEnd)   : null;
    if (data.actualStart !== undefined)  updateData.actualStart  = data.actualStart  ? new Date(data.actualStart)  : null;
    if (data.actualEnd !== undefined)    updateData.actualEnd    = data.actualEnd    ? new Date(data.actualEnd)    : null;
    if (data.submittedAt !== undefined)  updateData.submittedAt  = data.submittedAt  ? new Date(data.submittedAt)  : null;
    if (data.approvedAt !== undefined)   updateData.approvedAt   = data.approvedAt   ? new Date(data.approvedAt)   : null;
    if (data.closedAt !== undefined)     updateData.closedAt     = data.closedAt     ? new Date(data.closedAt)     : null;
    if (data.justification !== undefined)   updateData.justification   = data.justification;
    if (data.workInstructions !== undefined) updateData.workInstructions = data.workInstructions;
    if (data.serviceImpactAssessment !== undefined) updateData.serviceImpactAssessment = data.serviceImpactAssessment;
    if (data.rollbackPlan !== undefined) updateData.rollbackPlan = data.rollbackPlan;
    if (data.riskAssessmentAndMitigation !== undefined) updateData.riskAssessmentAndMitigation = data.riskAssessmentAndMitigation;
    if (data.prechecks !== undefined)    updateData.prechecks    = data.prechecks;
    if (data.postchecks !== undefined)   updateData.postchecks   = data.postchecks;
    // Notification / Communication fields — writable in any non-terminal state
    if (data.notificationRequired !== undefined) updateData.notificationRequired = data.notificationRequired;
    if (data.impactedUsers        !== undefined) updateData.impactedUsers        = data.impactedUsers;
    if (data.communicationNotes   !== undefined) updateData.communicationNotes   = data.communicationNotes;

    // Closure & PIR fields — only writable in terminal/closure-eligible states
    const closureEligibleStates = ["implement", "review", "closed", "failed", "cancelled"];
    const closureFieldsPresent = (
      data.implementationOutcome !== undefined ||
      data.rollbackUsed         !== undefined ||
      data.closureCode          !== undefined ||
      data.closureNotes         !== undefined ||
      data.reviewSummary        !== undefined ||
      data.lessonsLearned       !== undefined
    );
    if (closureFieldsPresent) {
      const effectiveState = data.state ?? existing.state;
      if (!closureEligibleStates.includes(effectiveState)) {
        res.status(422).json({
          error: `Closure information can only be recorded once the change is in implement, review, closed, failed, or cancelled state. Current state: ${effectiveState}.`,
        });
        return;
      }
      if (data.implementationOutcome !== undefined) updateData.implementationOutcome = data.implementationOutcome;
      if (data.rollbackUsed          !== undefined) updateData.rollbackUsed          = data.rollbackUsed;
      if (data.closureCode           !== undefined) updateData.closureCode           = data.closureCode;
      if (data.closureNotes          !== undefined) updateData.closureNotes          = data.closureNotes;
      if (data.reviewSummary         !== undefined) updateData.reviewSummary         = data.reviewSummary;
      if (data.lessonsLearned        !== undefined) updateData.lessonsLearned        = data.lessonsLearned;
    }

    const updated = await prisma.change.update({
      where: { id },
      data: updateData,
      select: DETAIL_SELECT,
    });

    // ── Granular audit events ──────────────────────────────────────────────────
    // Fire one ChangeEvent per meaningful field change so the timeline is readable.
    // Each event is created in sequence (not batched) to preserve insertion order.
    // Best-effort: a logging failure does not roll back the update.

    // 1. State transition — uses the named state as the action for easy filtering
    if (data.state && data.state !== existing.state) {
      await prisma.changeEvent.create({
        data: {
          changeId: id,
          actorId:  req.user.id,
          action:   `change.${data.state}`,
          meta:     { previousState: existing.state, newState: data.state },
        },
      });
    }

    // 2. Assignment change
    if (data.assignedToId !== undefined && data.assignedToId !== existing.assignedToId) {
      const assignee = data.assignedToId
        ? (await prisma.user.findUnique({ where: { id: data.assignedToId }, select: { id: true, name: true } }))
        : null;
      await prisma.changeEvent.create({
        data: {
          changeId: id,
          actorId:  req.user.id,
          action:   "change.assigned",
          meta: {
            from: existing.assignedTo ? { id: existing.assignedTo.id, name: existing.assignedTo.name } : null,
            to:   assignee ? { id: assignee.id, name: assignee.name } : null,
          },
        },
      });
    }

    // 3. Coordinator group change
    if (data.coordinatorGroupId !== undefined && data.coordinatorGroupId !== existing.coordinatorGroupId) {
      const group = data.coordinatorGroupId
        ? (await prisma.team.findUnique({ where: { id: data.coordinatorGroupId }, select: { id: true, name: true } }))
        : null;
      await prisma.changeEvent.create({
        data: {
          changeId: id,
          actorId:  req.user.id,
          action:   "change.coordinator_changed",
          meta: {
            from: existing.coordinatorGroup ? { id: existing.coordinatorGroup.id, name: existing.coordinatorGroup.name } : null,
            to:   group ? { id: group.id, name: group.name } : null,
          },
        },
      });
    }

    // 4. Schedule (planned window) change
    const newStart = data.plannedStart ? new Date(data.plannedStart).toISOString() : null;
    const newEnd   = data.plannedEnd   ? new Date(data.plannedEnd).toISOString()   : null;
    const oldStart = existing.plannedStart?.toISOString() ?? null;
    const oldEnd   = existing.plannedEnd?.toISOString()   ?? null;
    if (
      (data.plannedStart !== undefined && newStart !== oldStart) ||
      (data.plannedEnd   !== undefined && newEnd   !== oldEnd)
    ) {
      await prisma.changeEvent.create({
        data: {
          changeId: id,
          actorId:  req.user.id,
          action:   "change.schedule_updated",
          meta:     { from: { start: oldStart, end: oldEnd }, to: { start: newStart ?? oldStart, end: newEnd ?? oldEnd } },
        },
      });
    }

    // 5. Risk change
    if (data.risk !== undefined && data.risk !== existing.risk) {
      await prisma.changeEvent.create({
        data: {
          changeId: id,
          actorId:  req.user.id,
          action:   "change.risk_updated",
          meta:     { from: existing.risk, to: data.risk },
        },
      });
    }

    // 6. Change type update
    if (data.changeType !== undefined && data.changeType !== existing.changeType) {
      await prisma.changeEvent.create({
        data: {
          changeId: id,
          actorId:  req.user.id,
          action:   "change.type_updated",
          meta:     { from: existing.changeType, to: data.changeType },
        },
      });
    }

    // 7. Title edit
    if (data.title !== undefined && data.title !== existing.title) {
      await prisma.changeEvent.create({
        data: {
          changeId: id,
          actorId:  req.user.id,
          action:   "change.title_updated",
          meta:     { from: existing.title, to: data.title },
        },
      });
    }

    // 8. Rich-text / planning doc fields — log which section changed without storing full content
    const richFields: Array<{ key: keyof typeof data; label: string }> = [
      { key: "description",              label: "Description" },
      { key: "justification",            label: "Justification" },
      { key: "workInstructions",         label: "Work Instructions" },
      { key: "serviceImpactAssessment",  label: "Service Impact Assessment" },
      { key: "rollbackPlan",             label: "Rollback Plan" },
      { key: "riskAssessmentAndMitigation", label: "Risk Assessment" },
      { key: "prechecks",                label: "Pre-checks" },
      { key: "postchecks",               label: "Post-checks" },
    ];
    const updatedDocs = richFields
      .filter((f) => data[f.key] !== undefined)
      .map((f) => f.label);
    if (updatedDocs.length > 0) {
      await prisma.changeEvent.create({
        data: {
          changeId: id,
          actorId:  req.user.id,
          action:   "change.fields_updated",
          meta:     { fields: updatedDocs },
        },
      });
    }

    // 9. Closure fields saved
    if (closureFieldsPresent) {
      await prisma.changeEvent.create({
        data: {
          changeId: id,
          actorId:  req.user.id,
          action:   "change.closure_updated",
          meta: {
            outcome:      data.implementationOutcome ?? null,
            rollbackUsed: data.rollbackUsed ?? null,
            closureCode:  data.closureCode ?? null,
            fields: [
              data.closureCode     !== undefined ? "Closure Code"    : null,
              data.closureNotes    !== undefined ? "Closure Notes"   : null,
              data.reviewSummary   !== undefined ? "Review Summary"  : null,
              data.lessonsLearned  !== undefined ? "Lessons Learned" : null,
            ].filter(Boolean),
          },
        },
      });
    }

    // Fire event_workflow events for change state transitions
    if (data.state && data.state !== existing.state) {
      const stateTriggerMap: Record<string, string> = {
        submitted:  "change.submitted_for_approval",
        authorized: "change.approved",
        cancelled:  "change.rejected",
        implemented:"change.implemented",
      };
      const trigger = stateTriggerMap[data.state] as any;
      if (trigger) fireChangeEvent(trigger, id, req.user.id, { state: existing.state });
    }

    // ── Global audit log entries ───────────────────────────────────────────
    const cBase = { entityType: "change", entityId: id, entityNumber: updated.changeNumber, entityTitle: updated.title };
    if (data.state && data.state !== existing.state) {
      void logSystemAudit(req.user.id, "change.status_changed", { ...cBase, from: existing.state, to: data.state });
      const stateMap: Record<string, "change.submitted" | "change.approved" | "change.rejected" | "change.scheduled" | "change.started" | "change.completed" | "change.cancelled"> = {
        submitted:   "change.submitted",
        authorized:  "change.approved",
        rejected:    "change.rejected",
        scheduled:   "change.scheduled",
        implement:   "change.started",
        implemented: "change.completed",
        cancelled:   "change.cancelled",
      };
      const named = stateMap[data.state];
      if (named) void logSystemAudit(req.user.id, named, cBase);
    }
    if (data.assignedToId !== undefined && data.assignedToId !== existing.assignedToId) {
      void logSystemAudit(req.user.id, "change.assigned", {
        ...cBase,
        from: existing.assignedTo ? { id: existing.assignedTo.id, name: existing.assignedTo.name } : null,
        to: data.assignedToId ?? null,
      });
    }
    if (data.rollbackUsed !== undefined && data.rollbackUsed === true) {
      void logSystemAudit(req.user.id, "change.rolled_back", cBase);
    }

    // Notify followers on state change (fire-and-forget)
    if (data.state && data.state !== existing.state) {
      void notifyEntityFollowers({
        entityType:   "change",
        entityId:     id,
        actorUserId:  req.user.id,
        event:        "change.followed_status_changed",
        entityNumber: updated.changeNumber,
        entityTitle:  updated.title,
        fromStatus:   existing.state,
        toStatus:     data.state,
        entityUrl:    `/changes/${id}`,
      });
    }

    res.json(updated);
  }
);

// ── GET /api/changes/:id/approval ────────────────────────────────────────────
// Returns the most recent ApprovalRequest for this change (or null).
// Used by the UI approval panel to show current status without a full detail fetch.

router.get(
  "/:id/approval",
  requireAuth,
  requirePermission("changes.view"),
  async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) { res.status(400).json({ error: "Invalid ID" }); return; }

    const change = await prisma.change.findUnique({ where: { id }, select: { id: true } });
    if (!change) { res.status(404).json({ error: "Change not found" }); return; }

    const approvals = await getAllChangeApprovals(id);
    res.json({ approvals });
  }
);

// ── GET /api/changes/:id/resend-counts ───────────────────────────────────────
// Returns how many times each approver has been sent an approval request for
// this change, plus the configured maxApprovalResends limit.

router.get(
  "/:id/resend-counts",
  requireAuth,
  requirePermission("changes.view"),
  async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) { res.status(400).json({ error: "Invalid ID" }); return; }

    const [sendCounts, { maxApprovalResends, minCabApprovers, cabApprovalSequential }] = await Promise.all([
      prisma.approvalStep.groupBy({
        by: ["approverId"],
        where: {
          approvalRequest: { subjectType: "change_request", subjectId: String(id) },
        },
        _count: { approverId: true },
      }),
      getSection("changes"),
    ]);

    const counts: Record<string, number> = {};
    for (const row of sendCounts) counts[row.approverId] = row._count.approverId;

    res.json({ counts, maxApprovalResends, minCabApprovers, cabApprovalSequential });
  }
);

// ── POST /api/changes/:id/request-approval ────────────────────────────────────
// Submit a change for CAB (or ECAB) approval.
//
// The change must be in one of the pre-authorization states (assess / authorize)
// and must not already have an active (pending) approval request.
// Body: { approverIds: string[], approvalMode?: "all"|"any", requiredCount?: number, expiresAt?: string }

router.post(
  "/:id/request-approval",
  requireAuth,
  requirePermission("changes.approve"),
  async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) { res.status(400).json({ error: "Invalid ID" }); return; }

    const change = await prisma.change.findUnique({
      where: { id },
      select: { id: true, state: true, changeNumber: true, title: true },
    });
    if (!change) { res.status(404).json({ error: "Change not found" }); return; }

    // Only allow requesting approval when the change is in a pre-authorization state
    const eligibleStates: string[] = ["submitted", "assess", "authorize"];
    if (!eligibleStates.includes(change.state)) {
      res.status(422).json({
        error: `Approval can only be requested when the change is in the submitted, assess, or authorize state. Current state: ${change.state}.`,
      });
      return;
    }

    // Handle existing pending approval:
    // - No rejections yet → block (the round is still active, nothing to resend)
    // - Has rejections → re-activate only the rejected steps for the chosen approvers;
    //   other members' pending steps are left completely untouched so their votes
    //   still count. If the caller also lists approvers not yet in this round,
    //   add them as new active steps in the same request.
    const existing = await getChangeApproval(id);
    const isResend = existing !== null;
    if (existing && existing.status === "pending") {
      const hasRejection = existing.steps.some((s) => s.status === "rejected");
      if (!hasRejection) {
        res.status(422).json({
          error: "There is already a pending approval request for this change with no rejections yet. Resolve it before requesting a new one.",
        });
        return;
      }

      // Validate body early so we know which approverIds are being resent
      const body = req.body as { approverIds?: unknown };
      if (!Array.isArray(body.approverIds) || body.approverIds.length === 0) {
        res.status(400).json({ error: "approverIds must be a non-empty array of user IDs" });
        return;
      }
      const resendIds = body.approverIds as string[];

      // Steps to re-activate: currently rejected AND chosen by the requester
      const stepsToReset = existing.steps.filter(
        (s) => s.status === "rejected" && resendIds.includes(s.approver.id)
      );
      // Truly new approvers not in the current round at all
      const existingApproverSet = new Set(existing.steps.map((s) => s.approver.id));
      const brandNewIds = resendIds.filter((aid) => !existingApproverSet.has(aid));
      const maxOrder = Math.max(...existing.steps.map((s) => s.stepOrder), 0);

      // Load settings so we can update requiredCount
      const { minCabApprovers: min } = await getSection("changes");

      await prisma.$transaction([
        // Re-activate rejected steps without touching any pending ones
        ...(stepsToReset.length > 0
          ? [prisma.approvalStep.updateMany({
              where: { id: { in: stepsToReset.map((s) => s.id) } },
              data: { status: "pending", isActive: true },
            })]
          : []),
        // Add new approvers as extra steps in the same round
        ...brandNewIds.map((approverId, idx) =>
          prisma.approvalStep.create({
            data: {
              approvalRequestId: existing.id,
              approverId,
              stepOrder: maxOrder + idx + 1,
              isActive: true,
              status: "pending",
            },
          })
        ),
        // Keep requiredCount aligned with the current setting
        prisma.approvalRequest.update({
          where: { id: existing.id },
          data: { requiredCount: min },
        }),
      ]);

      // Notify re-invited approvers
      void notify({
        event: "approval.requested",
        recipientIds: resendIds,
        title: `Re-sent for approval: CAB Approval — ${change.changeNumber} — ${change.title}`,
        entityType: "approval",
        entityId: String(existing.id),
        entityUrl: `/approvals`,
      });

      await prisma.changeEvent.create({
        data: {
          changeId: id,
          actorId: req.user.id,
          action: "change.approval_requested",
          meta: { approvalRequestId: existing.id, approverCount: resendIds.length, isResend: true },
        },
      });

      const approvals = await getAllChangeApprovals(id);
      res.status(201).json({ approvalRequestId: existing.id, approvals });
      return;
    }

    // Validate body
    const body = req.body as {
      approverIds?: unknown;
      approvalMode?: unknown;
      requiredCount?: unknown;
      expiresAt?: unknown;
    };

    if (!Array.isArray(body.approverIds) || body.approverIds.length === 0) {
      res.status(400).json({ error: "approverIds must be a non-empty array of user IDs" });
      return;
    }
    const approverIds = body.approverIds as string[];
    const approvalMode: "all" | "any" =
      body.approvalMode === "any" ? "any" : "all";
    const requiredCount =
      typeof body.requiredCount === "number" && body.requiredCount >= 1
        ? body.requiredCount
        : 1;
    const expiresAt =
      typeof body.expiresAt === "string" ? body.expiresAt : undefined;

    // Verify approver IDs exist
    const users = await prisma.user.findMany({
      where: { id: { in: approverIds }, deletedAt: null },
      select: { id: true },
    });
    if (users.length !== approverIds.length) {
      res.status(400).json({ error: "One or more approver user IDs are invalid" });
      return;
    }

    // ── CAB membership enforcement ─────────────────────────────────────────────
    // If the changes settings require CAB review for this change type and a
    // default CAB group is configured, every approver must be a member.
    const changeSettings = await getSection("changes");
    const {
      defaultCabGroupId, requireCabForNormal, requireCabForEmergency,
      cabApprovalSequential, minCabApprovers, maxApprovalResends,
      cabRequireUnanimous,
    } = changeSettings;

    // Only enforce minimum approvers on a fresh (first-ever) request.
    // Resends after rejection may legitimately target fewer approvers.
    if (!isResend && approverIds.length < minCabApprovers) {
      res.status(422).json({
        error: `At least ${minCabApprovers} CAB approver${minCabApprovers !== 1 ? "s" : ""} must be selected. You selected ${approverIds.length}.`,
      });
      return;
    }

    const changeForCab = await prisma.change.findUnique({
      where: { id },
      select: { changeType: true },
    });

    const needsCab =
      defaultCabGroupId !== null &&
      changeForCab !== null &&
      ((changeForCab.changeType === "normal"    && requireCabForNormal) ||
       (changeForCab.changeType === "emergency" && requireCabForEmergency));

    if (needsCab && defaultCabGroupId) {
      const cabMembers = await prisma.cabMember.findMany({
        where: { cabGroupId: defaultCabGroupId },
        select: { userId: true },
      });
      const cabMemberIds = new Set(cabMembers.map((m) => m.userId));
      const nonCab = approverIds.filter((aid) => !cabMemberIds.has(aid));
      if (nonCab.length > 0) {
        const nonCabUsers = await prisma.user.findMany({
          where: { id: { in: nonCab } },
          select: { name: true },
        });
        const names = nonCabUsers.map((u) => u.name).join(", ");
        res.status(422).json({
          error: `CAB approval is required for this change type. The following approvers are not members of the designated CAB group: ${names}. Please select only CAB members as approvers.`,
        });
        return;
      }
    }

    // ── Resend-limit enforcement ───────────────────────────────────────────────
    // Count how many times each approver has already been sent an approval
    // request for this change. Exceeding maxApprovalResends blocks the approver.
    const sendCounts = await prisma.approvalStep.groupBy({
      by: ["approverId"],
      where: {
        approvalRequest: { subjectType: "change_request", subjectId: String(id) },
      },
      _count: { approverId: true },
    });
    const countByApprover = new Map(sendCounts.map((r) => [r.approverId, r._count.approverId]));
    const exceeded = approverIds.filter((aid) => (countByApprover.get(aid) ?? 0) >= maxApprovalResends);
    if (exceeded.length > 0) {
      const exceededUsers = await prisma.user.findMany({
        where: { id: { in: exceeded } },
        select: { name: true },
      });
      const names = exceededUsers.map((u) => u.name).join(", ");
      res.status(422).json({
        error: `Max Approval Sends (${maxApprovalResends}) reached for: ${names}. Increase the limit in Settings → Changes or choose different approvers.`,
      });
      return;
    }

    // Threshold rule:
    //  - Default ("quorum") behaviour: a change is approved as soon as
    //    `minCabApprovers` members have approved. Remaining steps are skipped.
    //  - Unanimous (`cabRequireUnanimous = true`): every invited approver must
    //    approve. Threshold = approverIds.length. A single rejection rejects
    //    the whole request immediately (existing engine behaviour).
    //
    // Mode selection:
    //  - Parallel (default): all approvers notified at once → "any" mode with
    //    the threshold above.
    //  - Sequential: approvers activated one at a time in order → "all" mode
    //    with the same threshold; remaining steps are skipped once met.
    //
    // For resends (isResend=true) we cap the threshold at the number of approvers
    // actually submitted, so a targeted resend to e.g. 1 rejected member can still
    // succeed without requiring the full minimum count from a fresh round.
    const effectiveMode: "all" | "any" = cabApprovalSequential ? "all" : "any";
    const baseRequired = cabRequireUnanimous ? approverIds.length : minCabApprovers;
    const effectiveRequired = isResend
      ? Math.min(baseRequired, approverIds.length)
      : baseRequired;

    const { approvalRequestId } = await requestChangeApproval(
      { changeId: id, approverIds, approvalMode: effectiveMode, requiredCount: effectiveRequired, expiresAt },
      req.user.id
    );

    // Advance the change to "authorize" state if it isn't already
    if (change.state !== "authorize") {
      await prisma.change.update({
        where: { id },
        data: { state: "authorize" },
      });
      await prisma.changeEvent.create({
        data: {
          changeId: id,
          actorId: req.user.id,
          action: "change.authorize",
          meta: { previousState: change.state, newState: "authorize", triggeredByApprovalRequest: approvalRequestId },
        },
      });
    }

    const approval = await getChangeApproval(id);
    res.status(201).json({ approvalRequestId, approval });
  }
);

// ── GET /api/changes/:id/conflicts ────────────────────────────────────────────
// Detect changes that conflict with this one (schedule overlap, shared CI/service/team).
// Query-derived at request time — see server/src/lib/change-conflicts.ts for algorithm.

router.get(
  "/:id/conflicts",
  requireAuth,
  requirePermission("changes.view"),
  async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) { res.status(400).json({ error: "Invalid ID" }); return; }

    const change = await prisma.change.findUnique({ where: { id }, select: { id: true } });
    if (!change) { res.status(404).json({ error: "Change not found" }); return; }

    const conflicts = await detectChangeConflicts(id);
    res.json({ conflicts });
  }
);

// ── POST /api/changes/:id/ci-links ────────────────────────────────────────────
// Add an affected CI to a change (beyond the primary CI stored on the change itself).
// Body: { ciId: number }

router.post(
  "/:id/ci-links",
  requireAuth,
  requirePermission("changes.update"),
  async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) { res.status(400).json({ error: "Invalid ID" }); return; }

    const ciId = typeof req.body.ciId === "number" ? req.body.ciId : parseInt(req.body.ciId, 10);
    if (!ciId || isNaN(ciId)) { res.status(400).json({ error: "ciId must be a valid CI integer ID" }); return; }

    const [change, ci] = await Promise.all([
      prisma.change.findUnique({ where: { id }, select: { id: true, state: true } }),
      prisma.configItem.findUnique({ where: { id: ciId }, select: { id: true, name: true, ciNumber: true } }),
    ]);

    if (!change) { res.status(404).json({ error: "Change not found" }); return; }
    if (!ci)     { res.status(404).json({ error: "Configuration item not found" }); return; }
    if (change.state === "closed" || change.state === "cancelled") {
      res.status(422).json({ error: "CI links cannot be modified on closed or cancelled changes" });
      return;
    }

    // Upsert — silently succeeds if the link already exists
    const link = await prisma.changeCiLink.upsert({
      where: { changeId_ciId: { changeId: id, ciId } },
      create: { changeId: id, ciId, linkedById: req.user.id },
      update: {},
      select: {
        id: true,
        ciId: true,
        linkedAt: true,
        linkedBy: { select: { id: true, name: true } },
        ci: { select: { id: true, ciNumber: true, name: true, type: true, environment: true, criticality: true, status: true } },
      },
    });

    await prisma.changeEvent.create({
      data: {
        changeId: id,
        actorId:  req.user.id,
        action:   "change.ci_linked",
        meta:     { ciId: link.ci.id, ciNumber: link.ci.ciNumber, ciName: link.ci.name },
      },
    });

    res.status(201).json({ ciLink: link });
  }
);

// ── DELETE /api/changes/:id/ci-links/:ciId ────────────────────────────────────
// Remove a CI link from a change.

router.delete(
  "/:id/ci-links/:ciId",
  requireAuth,
  requirePermission("changes.update"),
  async (req, res) => {
    const id   = parseId(req.params.id);
    const ciId = parseId(req.params.ciId);
    if (id === null || ciId === null) { res.status(400).json({ error: "Invalid ID" }); return; }

    const change = await prisma.change.findUnique({ where: { id }, select: { id: true, state: true } });
    if (!change) { res.status(404).json({ error: "Change not found" }); return; }
    if (change.state === "closed" || change.state === "cancelled") {
      res.status(422).json({ error: "CI links cannot be modified on closed or cancelled changes" });
      return;
    }

    const existing = await prisma.changeCiLink.findUnique({
      where: { changeId_ciId: { changeId: id, ciId } },
      select: { id: true },
    });
    if (!existing) { res.status(404).json({ error: "CI link not found" }); return; }

    const ciInfo = await prisma.configItem.findUnique({
      where: { id: ciId },
      select: { id: true, ciNumber: true, name: true },
    });

    await prisma.changeCiLink.delete({ where: { changeId_ciId: { changeId: id, ciId } } });

    await prisma.changeEvent.create({
      data: {
        changeId: id,
        actorId:  req.user.id,
        action:   "change.ci_unlinked",
        meta:     { ciId, ciNumber: ciInfo?.ciNumber ?? null, ciName: ciInfo?.name ?? null },
      },
    });

    res.status(204).send();
  }
);

// ─── Task CRUD ────────────────────────────────────────────────────────────────

import { z as zTask } from "zod/v4";

const createTaskSchema = zTask.object({
  title:        zTask.string().min(1).max(500),
  description:  zTask.string().max(2000).optional(),
  phase:        zTask.enum(["pre_implementation", "implementation", "post_implementation"]).default("implementation"),
  assignedToId: zTask.string().optional().nullable(),
  position:     zTask.number().int().min(1).optional(),
});

const updateTaskSchema = zTask.object({
  title:          zTask.string().min(1).max(500).optional(),
  description:    zTask.string().max(2000).optional().nullable(),
  phase:          zTask.enum(["pre_implementation", "implementation", "post_implementation"]).optional(),
  status:         zTask.enum(["pending", "in_progress", "completed", "skipped", "failed"]).optional(),
  assignedToId:   zTask.string().optional().nullable(),
  completionNote: zTask.string().max(2000).optional().nullable(),
});

router.post("/:id/tasks", requireAuth, requirePermission("changes.update"), async (req, res) => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid change ID" }); return; }

  const change = await prisma.change.findFirst({ where: { id, deletedAt: null }, select: { id: true, state: true } });
  if (!change) { res.status(404).json({ error: "Change not found" }); return; }

  const body = validate(createTaskSchema, req.body, res);
  if (!body) return;

  const count = await prisma.changeTask.count({ where: { changeId: id } });

  const task = await prisma.changeTask.create({
    data: {
      changeId:     id,
      title:        body.title,
      description:  body.description ?? null,
      phase:        body.phase,
      position:     body.position ?? count + 1,
      assignedToId: body.assignedToId ?? null,
    },
    include: { assignedTo: { select: { id: true, name: true } } },
  });

  await prisma.changeEvent.create({
    data: { changeId: id, actorId: req.user.id, action: "task.created", meta: { taskId: task.id, title: task.title } },
  });

  const chg = await prisma.change.findUnique({ where: { id }, select: { changeNumber: true, title: true } });
  void logSystemAudit(req.user.id, "change.task_created", {
    entityType: "change", entityId: id,
    entityNumber: chg?.changeNumber ?? `CHG-${id}`, entityTitle: chg?.title ?? "",
    taskId: task.id, taskTitle: task.title,
  });

  res.status(201).json({ task });
});

router.patch("/:id/tasks/:taskId", requireAuth, requirePermission("changes.update"), async (req, res) => {
  const id     = parseId(req.params.id);
  const taskId = parseId(req.params.taskId);
  if (!id || !taskId) { res.status(400).json({ error: "Invalid ID" }); return; }

  const task = await prisma.changeTask.findUnique({ where: { id: taskId, changeId: id } });
  if (!task) { res.status(404).json({ error: "Task not found" }); return; }

  const body = validate(updateTaskSchema, req.body, res);
  if (!body) return;

  const completedNow = body.status === "completed" && task.status !== "completed";

  const updated = await prisma.changeTask.update({
    where: { id: taskId },
    data: {
      ...(body.title          !== undefined && { title: body.title }),
      ...(body.description    !== undefined && { description: body.description }),
      ...(body.phase          !== undefined && { phase: body.phase }),
      ...(body.assignedToId   !== undefined && { assignedToId: body.assignedToId }),
      ...(body.completionNote !== undefined && { completionNote: body.completionNote }),
      ...(body.status         !== undefined && { status: body.status }),
      ...(completedNow && { completedById: req.user.id, completedAt: new Date() }),
    },
    include: { assignedTo: { select: { id: true, name: true } }, completedBy: { select: { id: true, name: true } } },
  });

  await prisma.changeEvent.create({
    data: { changeId: id, actorId: req.user.id, action: "task.updated", meta: { taskId, title: updated.title, status: updated.status } },
  });

  if (completedNow) {
    const chg2 = await prisma.change.findUnique({ where: { id }, select: { changeNumber: true, title: true } });
    void logSystemAudit(req.user.id, "change.task_completed", {
      entityType: "change", entityId: id,
      entityNumber: chg2?.changeNumber ?? `CHG-${id}`, entityTitle: chg2?.title ?? "",
      taskId, taskTitle: updated.title,
    });
  }

  res.json({ task: updated });
});

router.delete("/:id/tasks/:taskId", requireAuth, requirePermission("changes.update"), async (req, res) => {
  const id     = parseId(req.params.id);
  const taskId = parseId(req.params.taskId);
  if (!id || !taskId) { res.status(400).json({ error: "Invalid ID" }); return; }

  const task = await prisma.changeTask.findUnique({ where: { id: taskId, changeId: id } });
  if (!task) { res.status(404).json({ error: "Task not found" }); return; }

  await prisma.changeTask.delete({ where: { id: taskId } });

  await prisma.changeEvent.create({
    data: { changeId: id, actorId: req.user.id, action: "task.deleted", meta: { taskId, title: task.title } },
  });

  const chg3 = await prisma.change.findUnique({ where: { id }, select: { changeNumber: true, title: true } });
  void logSystemAudit(req.user.id, "change.task_deleted", {
    entityType: "change", entityId: id,
    entityNumber: chg3?.changeNumber ?? `CHG-${id}`, entityTitle: chg3?.title ?? "",
    taskId, taskTitle: task.title,
  });

  res.json({ ok: true });
});

// ─── Bulk Actions ──────────────────────────────────────────────────────────────

import { z as zBulk } from "zod/v4";

const changesBulkSchema = zBulk.discriminatedUnion("action", [
  zBulk.object({ action: zBulk.literal("delete"), ids: zBulk.array(zBulk.number().int().positive()).min(1).max(100) }),
  zBulk.object({ action: zBulk.literal("assign"), ids: zBulk.array(zBulk.number().int().positive()).min(1).max(100), assignedToId: zBulk.string().nullable().optional(), teamId: zBulk.number().int().positive().nullable().optional() }),
]);

router.post("/bulk", requireAuth, requirePermission("changes.manage"), async (req, res) => {
  const data = validate(changesBulkSchema, req.body, res);
  if (!data) return;
  switch (data.action) {
    case "delete": {
      const { count } = await prisma.change.updateMany({
        where: { id: { in: data.ids }, deletedAt: null },
        data:  { deletedAt: new Date(), deletedById: req.user.id, deletedByName: req.user.name },
      });
      res.json({ affected: count }); return;
    }
    case "assign": {
      await prisma.change.updateMany({ where: { id: { in: data.ids } }, data: { ...(data.assignedToId !== undefined && { assignedToId: data.assignedToId }), ...(data.teamId !== undefined && { coordinatorGroupId: data.teamId }) } });
      res.json({ affected: data.ids.length }); return;
    }
  }
});

export default router;
