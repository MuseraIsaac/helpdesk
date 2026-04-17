import { z } from "zod/v4";
import { changeTypes, changeModels, changeStates, changeRisks, changePurposes, implementationOutcomes } from "../constants/change.ts";
import { ticketPriorities } from "../constants/ticket-priority.ts";

export const createChangeSchema = z.object({
  title:               z.string().trim().min(1, "Title is required").max(255),
  description:         z.string().trim().max(10000).optional(),
  changeType:          z.enum(changeTypes).default("normal"),
  changeModel:         z.enum(changeModels).default("normal_change"),
  risk:                z.enum(changeRisks).default("medium"),
  changePurpose:       z.enum(changePurposes).optional(),
  priority:            z.enum(ticketPriorities).default("medium"),
  categorizationTier1: z.string().trim().max(100).optional(),
  categorizationTier2: z.string().trim().max(100).optional(),
  categorizationTier3: z.string().trim().max(100).optional(),
  serviceCategoryTier2: z.string().trim().max(100).optional(),
  serviceCategoryTier3: z.string().trim().max(100).optional(),
  serviceId:            z.number().int().positive().optional(),
  serviceName:          z.string().trim().max(255).optional(),
  configurationItemId:  z.number().int().positive().optional(),
  coordinatorGroupId:   z.number().int().positive().optional(),
  assignedToId:         z.string().optional(),
  linkedProblemId:      z.number().int().positive().optional(),
  plannedStart:         z.string().datetime({ offset: true }).optional(),
  plannedEnd:           z.string().datetime({ offset: true }).optional(),
  justification:        z.string().trim().max(10000).optional(),
  workInstructions:     z.string().trim().max(10000).optional(),
  serviceImpactAssessment: z.string().trim().max(10000).optional(),
  rollbackPlan:         z.string().trim().max(10000).optional(),
  riskAssessmentAndMitigation: z.string().trim().max(10000).optional(),
  prechecks:            z.string().trim().max(5000).optional(),
  postchecks:           z.string().trim().max(5000).optional(),
});
export type CreateChangeInput = z.infer<typeof createChangeSchema>;

export const updateChangeSchema = createChangeSchema
  .partial()
  .extend({
    state: z.enum(changeStates).optional(),
    actualStart: z.string().datetime({ offset: true }).nullable().optional(),
    actualEnd:   z.string().datetime({ offset: true }).nullable().optional(),
    submittedAt: z.string().datetime({ offset: true }).nullable().optional(),
    approvedAt:  z.string().datetime({ offset: true }).nullable().optional(),
    closedAt:    z.string().datetime({ offset: true }).nullable().optional(),
    // Closure & PIR fields — validated server-side against state eligibility
    implementationOutcome: z.enum(implementationOutcomes).nullable().optional(),
    rollbackUsed:   z.boolean().nullable().optional(),
    closureNotes:   z.string().trim().max(10000).nullable().optional(),
    reviewSummary:  z.string().trim().max(10000).nullable().optional(),
    lessonsLearned: z.string().trim().max(10000).nullable().optional(),
  });
export type UpdateChangeInput = z.infer<typeof updateChangeSchema>;

export const listChangesQuerySchema = z.object({
  state:        z.enum(changeStates).optional(),
  changeType:   z.enum(changeTypes).optional(),
  risk:         z.enum(changeRisks).optional(),
  priority:     z.enum(ticketPriorities).optional(),
  assignedToMe: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
  search:   z.string().optional(),
  page:     z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  sortBy:   z.enum(["createdAt", "updatedAt", "plannedStart", "risk", "priority", "state"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});
export type ListChangesQuery = z.infer<typeof listChangesQuerySchema>;
