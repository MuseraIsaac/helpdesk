import { z } from "zod/v4";
import { incidentPriorities } from "../constants/incident-priority.ts";
import { incidentStatuses } from "../constants/incident-status.ts";
import { incidentUpdateTypes } from "../constants/incident-update-type.ts";

export const createIncidentSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(255),
  description: z.string().trim().max(5000).optional(),
  priority: z.enum(incidentPriorities),
  isMajor: z.boolean().default(false),
  affectedSystem: z.string().trim().max(255).optional(),
  affectedUserCount: z.number().int().min(0).optional(),
  commanderId: z.string().optional(),
  assignedToId: z.string().optional(),
  teamId: z.number().int().positive().optional(),
});
export type CreateIncidentInput = z.infer<typeof createIncidentSchema>;

export const updateIncidentSchema = z.object({
  title: z.string().trim().min(1).max(255).optional(),
  description: z.string().trim().max(5000).nullable().optional(),
  priority: z.enum(incidentPriorities).optional(),
  status: z.enum(incidentStatuses).optional(),
  isMajor: z.boolean().optional(),
  affectedSystem: z.string().trim().max(255).nullable().optional(),
  affectedUserCount: z.number().int().min(0).nullable().optional(),
  commanderId: z.string().nullable().optional(),
  assignedToId: z.string().nullable().optional(),
  teamId: z.number().int().positive().nullable().optional(),
});
export type UpdateIncidentInput = z.infer<typeof updateIncidentSchema>;

export const createIncidentUpdateSchema = z.object({
  body: z.string().trim().min(1, "Update body is required").max(5000),
  updateType: z.enum(incidentUpdateTypes).default("update"),
});
export type CreateIncidentUpdateInput = z.infer<typeof createIncidentUpdateSchema>;

export const listIncidentsQuerySchema = z.object({
  status: z.enum(incidentStatuses).optional(),
  priority: z.enum(incidentPriorities).optional(),
  isMajor: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
  assignedToMe: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  sortBy: z.enum(["createdAt", "updatedAt", "priority", "status"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});
export type ListIncidentsQuery = z.infer<typeof listIncidentsQuerySchema>;
