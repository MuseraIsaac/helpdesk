import { z } from "zod/v4";
import { CONNECTOR_SOURCES, SYNC_RUN_STATUS_LABEL } from "../constants/discovery.ts";

type Source = typeof CONNECTOR_SOURCES[number];

// ── Connector CRUD ────────────────────────────────────────────────────────────

export const createConnectorSchema = z.object({
  source:             z.enum(CONNECTOR_SOURCES as [Source, ...Source[]]),
  label:              z.string().min(1, "Label is required").max(200),
  isEnabled:          z.boolean().default(true),
  scheduleExpression: z.string().max(100).nullish(),
  syncPolicy:         z.enum(["merge", "overwrite"]).default("merge"),
  /** Non-secret configuration only (baseUrl, tenantId, clientId, field mappings). */
  config:             z.record(z.string(), z.unknown()).default({}),
  description:        z.string().max(2000).nullish(),
});

export type CreateConnectorInput = z.infer<typeof createConnectorSchema>;

export const updateConnectorSchema = createConnectorSchema.partial();
export type UpdateConnectorInput = z.infer<typeof updateConnectorSchema>;

// ── CSV import ────────────────────────────────────────────────────────────────

export const csvImportOptionsSchema = z.object({
  /** Override the source slug stamped on imported assets. Defaults to "csv". */
  source:        z.string().max(50).default("csv"),
  /** "merge" preserves operator fields; "overwrite" replaces them. */
  syncPolicy:    z.enum(["merge", "overwrite"]).default("merge"),
  /** Mark assets previously from this source that were absent from the file as stale. */
  detectStale:   z.boolean().default(false),
  connectorId:   z.coerce.number().int().positive().optional(),
});

export type CsvImportOptions = z.infer<typeof csvImportOptionsSchema>;

// ── Sync run list query ───────────────────────────────────────────────────────

export const listSyncRunsQuerySchema = z.object({
  source:      z.string().optional(),
  status:      z.enum(Object.keys(SYNC_RUN_STATUS_LABEL) as [string, ...string[]]).optional(),
  connectorId: z.coerce.number().int().positive().optional(),
  page:        z.coerce.number().int().positive().default(1),
  pageSize:    z.coerce.number().int().min(1).max(50).default(20),
});

export type ListSyncRunsQuery = z.infer<typeof listSyncRunsQuerySchema>;
