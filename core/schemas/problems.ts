import { z } from "zod/v4";
import { problemStatuses } from "../constants/problem-status.ts";

// ── Create Problem ────────────────────────────────────────────────────────────

export const createProblemSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().max(10000).optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
  affectedService: z.string().max(255).optional(),

  // Initial RCA / workaround (can be filled in later)
  rootCause: z.string().max(10000).optional(),
  workaround: z.string().max(10000).optional(),

  // Assignment
  ownerId: z.string().optional(),
  assignedToId: z.string().optional(),
  teamId: z.number().int().positive().optional(),

  // Link to change request (free-text ref; FK when Change module is built)
  linkedChangeRef: z.string().max(100).optional(),

  /**
   * Optional list of incident IDs to link at creation time.
   * Supports the "promote recurring incident → problem" workflow.
   */
  linkedIncidentIds: z.array(z.number().int().positive()).default([]),
});

export type CreateProblemInput = z.infer<typeof createProblemSchema>;

// ── Update Problem ────────────────────────────────────────────────────────────

export const updateProblemSchema = z
  .object({
    title: z.string().min(1).max(255),
    description: z.string().max(10000).nullable(),
    priority: z.enum(["low", "medium", "high", "urgent"]),
    status: z.enum(problemStatuses),
    affectedService: z.string().max(255).nullable(),
    rootCause: z.string().max(10000).nullable(),
    workaround: z.string().max(10000).nullable(),
    ownerId: z.string().nullable(),
    assignedToId: z.string().nullable(),
    teamId: z.number().int().positive().nullable(),
    linkedChangeRef: z.string().max(100).nullable(),
  })
  .partial();

export type UpdateProblemInput = z.infer<typeof updateProblemSchema>;

// ── List Problems ─────────────────────────────────────────────────────────────

export const listProblemsQuerySchema = z.object({
  status: z.enum(problemStatuses).optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  isKnownError: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
  assignedToMe: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
  search: z.string().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  sortBy: z
    .enum(["createdAt", "updatedAt", "priority", "status"])
    .default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export type ListProblemsQuery = z.infer<typeof listProblemsQuerySchema>;

// ── Link Incident ─────────────────────────────────────────────────────────────

export const linkIncidentSchema = z.object({
  incidentId: z.number().int().positive(),
});

export type LinkIncidentInput = z.infer<typeof linkIncidentSchema>;

// ── Add Problem Note ──────────────────────────────────────────────────────────

export const createProblemNoteSchema = z.object({
  body: z.string().min(1).max(10000),
  bodyHtml: z.string().max(100000).optional(),
  noteType: z
    .enum(["investigation", "workaround", "rca", "general"])
    .default("general"),
});

export type CreateProblemNoteInput = z.infer<typeof createProblemNoteSchema>;
