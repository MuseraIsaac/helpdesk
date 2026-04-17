import { z } from "zod/v4";
import {
  CI_TYPES,
  CI_ENVIRONMENTS,
  CI_CRITICALITIES,
  CI_STATUSES,
  CI_RELATIONSHIP_TYPES,
} from "../constants/cmdb.ts";

// ── Create / Update ───────────────────────────────────────────────────────────

export const createCiSchema = z.object({
  name:        z.string().min(1).max(200),
  type:        z.enum(CI_TYPES as [string, ...string[]]),
  environment: z.enum(CI_ENVIRONMENTS as [string, ...string[]]).default("production"),
  criticality: z.enum(CI_CRITICALITIES as [string, ...string[]]).default("medium"),
  status:      z.enum(CI_STATUSES as [string, ...string[]]).default("active"),
  description: z.string().max(5000).optional(),
  tags:        z.array(z.string().max(50)).max(20).default([]),
  ownerId:     z.string().optional(),
  teamId:      z.number().int().positive().optional(),
});

export type CreateCiInput = z.infer<typeof createCiSchema>;

export const updateCiSchema = z.object({
  name:        z.string().min(1).max(200).optional(),
  type:        z.enum(CI_TYPES as [string, ...string[]]).optional(),
  environment: z.enum(CI_ENVIRONMENTS as [string, ...string[]]).optional(),
  criticality: z.enum(CI_CRITICALITIES as [string, ...string[]]).optional(),
  status:      z.enum(CI_STATUSES as [string, ...string[]]).optional(),
  description: z.string().max(5000).nullable().optional(),
  tags:        z.array(z.string().max(50)).max(20).optional(),
  ownerId:     z.string().nullable().optional(),
  teamId:      z.number().int().positive().nullable().optional(),
});

export type UpdateCiInput = z.infer<typeof updateCiSchema>;

// ── Relationships ─────────────────────────────────────────────────────────────

export const addCiRelationshipSchema = z.object({
  toCiId: z.number().int().positive(),
  type:   z.enum(CI_RELATIONSHIP_TYPES as [string, ...string[]]),
});

export type AddCiRelationshipInput = z.infer<typeof addCiRelationshipSchema>;

// ── CI link (attach a CI to a ticket / incident / problem) ────────────────────

export const linkCiSchema = z.object({
  ciId: z.number().int().positive(),
});

export type LinkCiInput = z.infer<typeof linkCiSchema>;

// ── List query ────────────────────────────────────────────────────────────────

export const listCisQuerySchema = z.object({
  type:        z.enum(CI_TYPES as [string, ...string[]]).optional(),
  environment: z.enum(CI_ENVIRONMENTS as [string, ...string[]]).optional(),
  criticality: z.enum(CI_CRITICALITIES as [string, ...string[]]).optional(),
  status:      z.enum(CI_STATUSES as [string, ...string[]]).optional(),
  search:      z.string().max(200).optional(),
  page:        z.coerce.number().int().positive().default(1),
  pageSize:    z.coerce.number().int().min(1).max(100).default(25),
  sortBy:      z.enum(["name", "criticality", "type", "status", "updatedAt", "createdAt"]).default("name"),
  sortOrder:   z.enum(["asc", "desc"]).default("asc"),
});

export type ListCisQuery = z.infer<typeof listCisQuerySchema>;
