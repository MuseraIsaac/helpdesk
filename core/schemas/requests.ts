import { z } from "zod/v4";
import { requestStatuses, requestStatusTransitions } from "../constants/request-status.ts";
import { fulfillmentTaskStatuses } from "../constants/fulfillment-task-status.ts";

// ── Create Service Request ────────────────────────────────────────────────────

export const createRequestSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),

  /** Priority inherited from ticket system. */
  priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),

  /** Snapshot of catalog item name at submission time. */
  catalogItemName: z.string().max(200).optional(),
  /** FK to a future CatalogItem row; optional so requests can be created free-form. */
  catalogItemId: z.number().int().positive().optional(),

  /** Free-form JSON bag of submitted form variables. */
  formData: z.record(z.string(), z.unknown()).default({}),

  /**
   * When true, route through the approval engine before fulfillment.
   * Caller provides approverIds; the route creates the ApprovalRequest.
   */
  requiresApproval: z.boolean().default(false),
  approverIds: z.array(z.string()).min(1).max(20).optional(),

  /** Who should fulfill this request (optional at creation). */
  assignedToId: z.string().optional(),
  teamId: z.number().int().positive().optional(),

  /** Target fulfillment date. */
  dueDate: z.string().datetime().optional(),

  /**
   * Items within the request.
   * A request may have one or more items (e.g. "2x MacBook Pro" + "1x Docking Station").
   */
  items: z
    .array(
      z.object({
        name: z.string().min(1).max(200),
        description: z.string().max(2000).optional(),
        quantity: z.number().int().min(1).default(1),
        unit: z.string().max(50).optional(),
        catalogItemId: z.number().int().positive().optional(),
        formData: z.record(z.string(), z.unknown()).default({}),
      })
    )
    .default([]),
});

export type CreateRequestInput = z.infer<typeof createRequestSchema>;

// ── Update Service Request ────────────────────────────────────────────────────

export const updateRequestSchema = z
  .object({
    title: z.string().min(1).max(200),
    description: z.string().max(5000).nullable(),
    priority: z.enum(["low", "medium", "high", "urgent"]),
    status: z.enum(requestStatuses),
    assignedToId: z.string().nullable(),
    teamId: z.number().int().positive().nullable(),
    dueDate: z.string().datetime().nullable(),
    formData: z.record(z.string(), z.unknown()),
  })
  .partial();

export type UpdateRequestInput = z.infer<typeof updateRequestSchema>;

// ── List Requests ─────────────────────────────────────────────────────────────

export const listRequestsQuerySchema = z.object({
  status: z.enum(requestStatuses).optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  assignedToMe: z
    .string()
    .transform((v) => v === "true")
    .pipe(z.boolean())
    .optional(),
  search: z.string().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  sortBy: z
    .enum(["createdAt", "updatedAt", "priority", "status", "dueDate"])
    .default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

export type ListRequestsQuery = z.infer<typeof listRequestsQuerySchema>;

// ── Create Fulfillment Task ───────────────────────────────────────────────────

export const createFulfillmentTaskSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  assignedToId: z.string().optional(),
  teamId: z.number().int().positive().optional(),
  dueAt: z.string().datetime().optional(),
  position: z.number().int().min(0).default(0),
});

export type CreateFulfillmentTaskInput = z.infer<typeof createFulfillmentTaskSchema>;

// ── Update Fulfillment Task ───────────────────────────────────────────────────

export const updateFulfillmentTaskSchema = z
  .object({
    title: z.string().min(1).max(200),
    description: z.string().max(2000).nullable(),
    status: z.enum(fulfillmentTaskStatuses),
    assignedToId: z.string().nullable(),
    teamId: z.number().int().positive().nullable(),
    dueAt: z.string().datetime().nullable(),
    position: z.number().int().min(0),
  })
  .partial();

export type UpdateFulfillmentTaskInput = z.infer<typeof updateFulfillmentTaskSchema>;

// ── Portal: Create Request ────────────────────────────────────────────────────

export const portalCreateRequestSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(5000).optional(),
  catalogItemName: z.string().max(200).optional(),
  catalogItemId: z.number().int().positive().optional(),
  formData: z.record(z.string(), z.unknown()).default({}),
  items: z
    .array(
      z.object({
        name: z.string().min(1).max(200),
        description: z.string().max(2000).optional(),
        quantity: z.number().int().min(1).default(1),
        unit: z.string().max(50).optional(),
        catalogItemId: z.number().int().positive().optional(),
        formData: z.record(z.string(), z.unknown()).default({}),
      })
    )
    .default([]),
});

export type PortalCreateRequestInput = z.infer<typeof portalCreateRequestSchema>;
