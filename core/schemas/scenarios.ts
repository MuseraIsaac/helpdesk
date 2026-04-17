import { z } from "zod/v4";

// ── Action schemas (subset of WorkflowAction — excludes system-only types) ─────
//
// create_task and add_audit_entry are intentionally excluded:
// - create_task: model not yet implemented
// - add_audit_entry: low-value for manual invocation; every execution already writes one
// send_notification is excluded until the notification infrastructure is wired.

export const scenarioActionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("update_field"),
    field: z.enum(["category", "priority", "severity", "status", "ticketType"]),
    value: z.string().min(1),
  }),
  z.object({
    type: z.literal("assign_user"),
    agentId: z.string().min(1),
    agentName: z.string().optional(),
  }),
  z.object({
    type: z.literal("assign_team"),
    teamId: z.number().int().positive(),
    teamName: z.string().optional(),
  }),
  z.object({
    type: z.literal("add_note"),
    body: z.string().min(1).max(5000),
    isPinned: z.boolean().optional(),
  }),
  z.object({ type: z.literal("escalate") }),
]);

export type ScenarioAction = z.infer<typeof scenarioActionSchema>;

// ── CRUD schemas ───────────────────────────────────────────────────────────────

export const createScenarioSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  /** Hex colour for UI chip, e.g. "#3b82f6". Validated server-side only for format. */
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Must be a 6-digit hex colour e.g. #3b82f6")
    .optional(),
  actions: z.array(scenarioActionSchema).min(1, "At least one action is required").max(20),
});

export type CreateScenarioInput = z.infer<typeof createScenarioSchema>;

export const updateScenarioSchema = createScenarioSchema
  .partial()
  .extend({ isEnabled: z.boolean().optional() });

export type UpdateScenarioInput = z.infer<typeof updateScenarioSchema>;

export const runScenarioSchema = z.object({
  ticketId: z.number().int().positive(),
});

export type RunScenarioInput = z.infer<typeof runScenarioSchema>;
