import { z } from "zod/v4";
import { templateTypes } from "../constants/template";
import { ticketCategories } from "../constants/ticket-category";
import { ticketPriorities } from "../constants/ticket-priority";
import { ticketSeverities } from "../constants/ticket-severity";
import { ticketImpacts } from "../constants/ticket-impact";
import { ticketUrgencies } from "../constants/ticket-urgency";
import { ticketTypes } from "../constants/ticket-type";

// ── Captured ticket fields ───────────────────────────────────────────────────
//
// When an agent saves a ticket as a template, we snapshot the structured
// fields too — not just the text body. Applying the template to a new
// ticket replays these onto the form so an agent doesn't have to re-pick
// category / priority / impact every time.
//
// Every field is optional; absent fields mean "don't touch the form".
// Stored on Template.fields as JSON.

export const templateFieldsSchema = z.object({
  category:           z.enum(ticketCategories).nullable().optional(),
  ticketType:         z.enum(ticketTypes).nullable().optional(),
  customTicketTypeId: z.number().int().positive().nullable().optional(),
  priority:           z.enum(ticketPriorities).nullable().optional(),
  severity:           z.enum(ticketSeverities).nullable().optional(),
  impact:             z.enum(ticketImpacts).nullable().optional(),
  urgency:            z.enum(ticketUrgencies).nullable().optional(),
  affectedSystem:     z.string().trim().max(255).nullable().optional(),
  teamId:             z.number().int().positive().nullable().optional(),
  assignedToId:       z.string().nullable().optional(),
  /** Free-form per-form custom field values keyed by field key. */
  customFields:       z.record(z.string(), z.unknown()).optional(),
}).default({});

export type TemplateFields = z.infer<typeof templateFieldsSchema>;

/** Sharing scope for personal-style templates. */
export const TEMPLATE_VISIBILITIES = ["private", "team", "everyone"] as const;
export type TemplateVisibility = (typeof TEMPLATE_VISIBILITIES)[number];

export const TEMPLATE_VISIBILITY_LABEL: Record<TemplateVisibility, string> = {
  private:  "Only me",
  team:     "My team",
  everyone: "Everyone",
};

export const TEMPLATE_VISIBILITY_DESCRIPTION: Record<TemplateVisibility, string> = {
  private:  "Only you can see and use this template.",
  team:     "All members of the selected team can see and use it.",
  everyone: "Every agent in the helpdesk can see and use it.",
};

const baseShape = {
  visibility: z.enum(TEMPLATE_VISIBILITIES).default("private"),
  teamId:     z.number().int().positive().nullable().optional(),
  /** Captured ticket fields that get replayed onto the new ticket form. */
  fields:     templateFieldsSchema,
};

export const createTemplateSchema = z
  .object({
    title: z.string().trim().min(1, "Title is required").max(255, "Title must be 255 characters or fewer"),
    body: z.string().trim().min(1, "Body is required").max(20000, "Body must be 20000 characters or fewer"),
    bodyHtml: z.string().max(40000).optional().nullable(),
    type: z.enum(templateTypes as [string, ...string[]]),
    isActive: z.boolean().optional().default(true),
    ...baseShape,
  })
  .refine(
    (d) => d.visibility !== "team" || (d.teamId != null && d.teamId > 0),
    { message: "Pick a team when sharing with a team", path: ["teamId"] },
  );

export type CreateTemplateInput = z.infer<typeof createTemplateSchema>;

export const updateTemplateSchema = z
  .object({
    title: z.string().trim().min(1, "Title is required").max(255).optional(),
    body: z.string().trim().min(1, "Body is required").max(20000).optional(),
    bodyHtml: z.string().max(40000).optional().nullable(),
    isActive: z.boolean().optional(),
    visibility: z.enum(TEMPLATE_VISIBILITIES).optional(),
    teamId:     z.number().int().positive().nullable().optional(),
    fields:     templateFieldsSchema.optional(),
  })
  .refine(
    (d) => d.visibility !== "team" || (d.teamId != null && d.teamId > 0),
    { message: "Pick a team when sharing with a team", path: ["teamId"] },
  );

export type UpdateTemplateInput = z.infer<typeof updateTemplateSchema>;

export const listTemplatesQuerySchema = z.object({
  type: z.enum(templateTypes as [string, ...string[]]).optional(),
});
