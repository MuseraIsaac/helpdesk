import { z } from "zod/v4";

// ── Column registry ───────────────────────────────────────────────────────────

export const COLUMN_IDS = [
  "ticketNumber",
  "subject",
  "requester",
  "ticketType",
  "status",
  "priority",
  "severity",
  "category",
  "team",
  "assignee",
  "slaStatus",
  "createdAt",
  "updatedAt",
  "source",
  "organization",
] as const;

export type ColumnId = (typeof COLUMN_IDS)[number];

export interface ColumnMeta {
  label: string;
  defaultVisible: boolean;
  /** Whether this column can be used as a sort key */
  sortable: boolean;
  /** API sort key (must match sortableColumns in core/schemas/tickets.ts) */
  sortKey?: string;
}

export const COLUMN_META: Record<ColumnId, ColumnMeta> = {
  ticketNumber: { label: "#",             defaultVisible: true,  sortable: false },
  subject:      { label: "Subject",       defaultVisible: true,  sortable: true,  sortKey: "subject" },
  requester:    { label: "Requester",     defaultVisible: true,  sortable: true,  sortKey: "senderName" },
  ticketType:   { label: "Type",          defaultVisible: true,  sortable: false },
  status:       { label: "Status",        defaultVisible: true,  sortable: true,  sortKey: "status" },
  priority:     { label: "Priority",      defaultVisible: true,  sortable: true,  sortKey: "priority" },
  severity:     { label: "Severity",      defaultVisible: false, sortable: true,  sortKey: "severity" },
  category:     { label: "Category",      defaultVisible: true,  sortable: true,  sortKey: "category" },
  team:         { label: "Team",          defaultVisible: true,  sortable: false },
  assignee:     { label: "Assignee",      defaultVisible: false, sortable: false },
  slaStatus:    { label: "SLA",           defaultVisible: true,  sortable: false },
  createdAt:    { label: "Created",       defaultVisible: true,  sortable: true,  sortKey: "createdAt" },
  updatedAt:    { label: "Updated",       defaultVisible: false, sortable: true,  sortKey: "updatedAt" },
  source:       { label: "Source",        defaultVisible: false, sortable: false },
  organization: { label: "Organization",  defaultVisible: false, sortable: false },
};

// ── Config schemas ────────────────────────────────────────────────────────────

const columnEntrySchema = z.object({
  id:      z.enum(COLUMN_IDS),
  visible: z.boolean(),
});

// Accept either a single value or an array; normalize to an array.
// Allows legacy saved views (single string/number) to keep working.
function arrayish<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess(
    (v) => (v == null ? undefined : Array.isArray(v) ? v : [v]),
    z.array(schema).optional(),
  );
}

/**
 * Optional filter preset embedded in a saved view.
 * When the user activates a saved view that has filters, those filters are
 * applied as the initial URL params (user can still refine from there).
 */
const savedViewFiltersSchema = z.object({
  // Multi-value fields — accept legacy single values via arrayish() preprocess
  status:             arrayish(z.string()),
  customStatusId:     arrayish(z.number().int().positive()),
  ticketType:         arrayish(z.string()),
  customTicketTypeId: arrayish(z.number().int().positive()),
  assignedToId:       arrayish(z.string()),
  teamId:             arrayish(z.union([z.number().int().positive(), z.literal("none")])),
  // Existing array filters
  category:           z.array(z.string()).optional(),
  priority:           z.array(z.string()).optional(),
  severity:           z.array(z.string()).optional(),
  impact:             z.array(z.string()).optional(),
  urgency:            z.array(z.string()).optional(),
  source:             z.array(z.string()).optional(),
  // Boolean toggles
  escalated:          z.boolean().optional(),
  assignedToMe:       z.boolean().optional(),
  unassigned:         z.boolean().optional(),
  slaBreached:        z.boolean().optional(),
}).optional();

export type SavedViewFilters = NonNullable<z.infer<typeof savedViewFiltersSchema>>;

export const savedViewConfigSchema = z.object({
  columns: z.array(columnEntrySchema),
  sort: z.object({
    by:    z.string().default("createdAt"),
    order: z.enum(["asc", "desc"]).default("desc"),
  }),
  filters: savedViewFiltersSchema,
});

export type SavedViewConfig = z.infer<typeof savedViewConfigSchema>;

// ── System default ────────────────────────────────────────────────────────────

/** Built-in baseline view — never stored in DB, used when no saved view is active. */
export const SYSTEM_DEFAULT_VIEW_CONFIG: SavedViewConfig = {
  columns: COLUMN_IDS.map(id => ({ id, visible: COLUMN_META[id].defaultVisible })),
  sort: { by: "createdAt", order: "desc" },
  filters: undefined,
};

// ── CRUD schemas (used by server routes) ─────────────────────────────────────

export const createSavedViewSchema = z.object({
  name:         z.string().trim().min(1, "Name is required").max(100, "Name too long"),
  emoji:        z.string().max(10).optional(),
  isShared:     z.boolean().default(false),
  setAsDefault: z.boolean().default(false),
  config:       savedViewConfigSchema,
});

export const updateSavedViewSchema = z.object({
  name:     z.string().trim().min(1).max(100).optional(),
  emoji:    z.string().max(10).optional(),
  isShared: z.boolean().optional(),
  config:   savedViewConfigSchema.optional(),
});
