import { z } from "zod/v4";

// ── Section registry ──────────────────────────────────────────────────────────

export const settingsSections = [
  "general",
  "branding",
  "tickets",
  "ticket_numbering",
  "sla",
  "knowledge_base",
  "templates",
  "automations",
  "users_roles",
  "appearance",
  "integrations",
  "advanced",
] as const;

export type SettingsSection = (typeof settingsSections)[number];

export function isSettingsSection(value: string): value is SettingsSection {
  return (settingsSections as readonly string[]).includes(value);
}

// ── Section metadata (used by UI for sidebar, search) ────────────────────────

export interface SettingsSectionMeta {
  label: string;
  description: string;
  /** Keywords used by the search index (label + description are always included) */
  keywords: string[];
}

export const settingsSectionMeta: Record<SettingsSection, SettingsSectionMeta> = {
  general: {
    label: "General",
    description: "Helpdesk name, support email, default locale and time format",
    keywords: ["name", "email", "timezone", "language", "locale", "date", "time"],
  },
  branding: {
    label: "Branding",
    description: "Company identity, logo, colors, and help-center appearance",
    keywords: ["logo", "color", "company", "favicon", "theme", "brand", "help center"],
  },
  tickets: {
    label: "Tickets",
    description: "Ticket defaults, auto-resolution, CSAT, and closing rules",
    keywords: ["priority", "category", "auto assign", "close", "csat", "status", "default"],
  },
  ticket_numbering: {
    label: "Ticket Numbering",
    description: "Prefix, start number, and zero-padding for ticket IDs",
    keywords: ["prefix", "number", "id", "sequence", "padding", "format"],
  },
  sla: {
    label: "SLA",
    description: "Service-level targets and business-hours configuration",
    keywords: ["sla", "response", "resolution", "breach", "business hours", "target"],
  },
  knowledge_base: {
    label: "Knowledge Base",
    description: "Help center visibility, article display, and search settings",
    keywords: ["kb", "articles", "help center", "public", "search", "published"],
  },
  templates: {
    label: "Templates",
    description: "Response template settings and variable configuration",
    keywords: ["template", "macro", "response", "canned", "variable", "placeholder"],
  },
  automations: {
    label: "Automations",
    description: "Automation rules engine settings and limits",
    keywords: ["automation", "rule", "trigger", "action", "workflow"],
  },
  users_roles: {
    label: "Users & Roles",
    description: "Agent permissions, role defaults, and account policies",
    keywords: ["user", "role", "agent", "permission", "account", "invite", "signup"],
  },
  appearance: {
    label: "Appearance",
    description: "Default theme and interface layout for all users",
    keywords: ["theme", "dark", "light", "sidebar", "layout", "interface"],
  },
  integrations: {
    label: "Integrations",
    description: "Email provider, Slack, and third-party service connections",
    keywords: ["email", "sendgrid", "slack", "smtp", "webhook", "api", "integration"],
  },
  advanced: {
    label: "Advanced",
    description: "Maintenance mode, session timeouts, file uploads, and debug settings",
    keywords: ["maintenance", "debug", "upload", "file", "session", "timeout", "log"],
  },
};

// ── Section schemas ───────────────────────────────────────────────────────────
// Each schema uses .default() so schema.parse({}) returns a fully-populated object.
// On read, stored data is merged with schema defaults — new fields are transparent.

export const generalSettingsSchema = z.object({
  helpdeskName:   z.string().min(1).max(100).default("Helpdesk"),
  supportEmail:   z.string().default(""),
  timezone:       z.string().default("UTC"),
  language:       z.string().default("en"),
  dateFormat:     z.string().default("MMM d, yyyy"),
  timeFormat:     z.enum(["12h", "24h"]).default("12h"),
});

export const brandingSettingsSchema = z.object({
  companyName:        z.string().max(100).default(""),
  logoUrl:            z.string().default(""),
  faviconUrl:         z.string().default(""),
  primaryColor:       z.string().default("#6366f1"),
  helpCenterTitle:    z.string().max(100).default("Help Center"),
  helpCenterTagline:  z.string().max(200).default(""),
});

export const ticketsSettingsSchema = z.object({
  defaultPriority:              z.enum(["low", "medium", "high", "urgent"]).nullable().default(null),
  defaultCategory:              z.string().nullable().default(null),
  autoAssignment:               z.boolean().default(false),
  allowCustomerReopenResolved:  z.boolean().default(true),
  csatEnabled:                  z.boolean().default(true),
  autoCloseResolvedAfterDays:   z.number().int().min(0).max(365).default(7),
  requireCategoryOnCreate:      z.boolean().default(false),
});

// Per-series configuration for one numbering series (incident, SR, etc.)
export const seriesConfigSchema = z.object({
  prefix:             z.string().max(10).default("TKT"),
  paddingLength:      z.number().int().min(1).max(10).default(4),
  // NOTE: startAt seeds the counter only on the very first ticket in that series.
  // It has no effect once the counter row exists in ticket_counter.
  startAt:            z.number().int().min(1).default(1),
  includeDateSegment: z.enum(["none", "year", "year_month"]).default("none"),
  resetPeriod:        z.enum(["never", "yearly", "monthly"]).default("never"),
});

export type SeriesConfig = z.infer<typeof seriesConfigSchema>;

export const ticketNumberingSettingsSchema = z.object({
  incident:        seriesConfigSchema.default({ prefix: "INC", paddingLength: 4, startAt: 1,    includeDateSegment: "none", resetPeriod: "never" }),
  service_request: seriesConfigSchema.default({ prefix: "SR",  paddingLength: 4, startAt: 1,    includeDateSegment: "none", resetPeriod: "never" }),
  change_request:  seriesConfigSchema.default({ prefix: "CHG", paddingLength: 4, startAt: 1,    includeDateSegment: "none", resetPeriod: "never" }),
  problem:         seriesConfigSchema.default({ prefix: "PRB", paddingLength: 4, startAt: 1,    includeDateSegment: "none", resetPeriod: "never" }),
  generic:         seriesConfigSchema.default({ prefix: "TKT", paddingLength: 6, startAt: 1000, includeDateSegment: "none", resetPeriod: "never" }),
});

export const slaSettingsSchema = z.object({
  enabled:              z.boolean().default(true),
  businessHoursOnly:    z.boolean().default(false),
  businessHoursStart:   z.string().default("09:00"),
  businessHoursEnd:     z.string().default("17:00"),
  // Days of week: 0=Sun, 1=Mon … 6=Sat
  businessDays:         z.array(z.number().int().min(0).max(6)).default([1, 2, 3, 4, 5]),
  // First-response targets (minutes) by priority
  frLow:    z.number().int().positive().default(480),
  frMedium: z.number().int().positive().default(240),
  frHigh:   z.number().int().positive().default(60),
  frUrgent: z.number().int().positive().default(30),
  // Resolution targets (minutes) by priority
  resLow:    z.number().int().positive().default(2880),
  resMedium: z.number().int().positive().default(1440),
  resHigh:   z.number().int().positive().default(480),
  resUrgent: z.number().int().positive().default(240),
});

export const knowledgeBaseSettingsSchema = z.object({
  enabled:                    z.boolean().default(true),
  publicAccess:               z.boolean().default(true),
  requireAccountToSearch:     z.boolean().default(false),
  articlesPerPage:            z.number().int().min(1).max(100).default(10),
  showRelatedArticles:        z.boolean().default(true),
  enableArticleVoting:        z.boolean().default(false),
});

export const templatesSettingsSchema = z.object({
  enabled:              z.boolean().default(true),
  allowAgentCreate:     z.boolean().default(true),
  // Future: default template for each ticket type
});

export const automationsSettingsSchema = z.object({
  enabled:          z.boolean().default(true),
  maxActionsPerRule: z.number().int().min(1).max(50).default(10),
  // Future: runOrder, concurrency limits
});

export const usersRolesSettingsSchema = z.object({
  defaultAgentRole:         z.enum(["agent", "readonly"]).default("agent"),
  allowAgentSelfAssignment: z.boolean().default(true),
  requireEmailVerification: z.boolean().default(false),
  // Future: SSO settings, SCIM provisioning
});

export const appearanceSettingsSchema = z.object({
  defaultTheme:            z.enum(["light", "dark", "system"]).default("system"),
  allowUserThemeOverride:  z.boolean().default(true),
  sidebarCollapsedDefault: z.boolean().default(false),
  // Custom brand/surface colors (6-digit hex string, empty = use CSS default)
  customPrimaryColor:      z.string().default(""),
  customSuccessColor:      z.string().default(""),
  customWarningColor:      z.string().default(""),
  customDangerColor:       z.string().default(""),
  customSecondaryColor:    z.string().default(""),
  customAccentColor:       z.string().default(""),
  // Sidebar background: separate light and dark values
  customSidebarLightColor: z.string().default(""),
  customSidebarDarkColor:  z.string().default(""),
});

export const integrationsSettingsSchema = z.object({
  emailEnabled:       z.boolean().default(false),
  emailProvider:      z.enum(["sendgrid", "smtp", "ses"]).default("sendgrid"),
  sendgridApiKey:     z.string().default(""),   // stored server-side; never exposed to client
  smtpHost:           z.string().default(""),
  smtpPort:           z.number().int().default(587),
  smtpUser:           z.string().default(""),
  smtpPassword:       z.string().default(""),   // stored server-side; never exposed to client
  slackEnabled:       z.boolean().default(false),
  slackWebhookUrl:    z.string().default(""),
  // Future: Jira, PagerDuty, Zapier webhook
});

export const advancedSettingsSchema = z.object({
  maintenanceMode:          z.boolean().default(false),
  maintenanceMessage:       z.string().max(500).default(""),
  debugLogging:             z.boolean().default(false),
  maxAttachmentSizeMb:      z.number().int().min(1).max(100).default(10),
  allowedFileExtensions:    z.string().default("pdf,doc,docx,xls,xlsx,png,jpg,jpeg,gif,webp,zip,txt"),
  sessionTimeoutMinutes:    z.number().int().min(5).max(43200).default(1440),
  // Future: IP allowlist, 2FA enforcement, audit log retention
});

// ── Master map ────────────────────────────────────────────────────────────────

export const sectionSchemas = {
  general:          generalSettingsSchema,
  branding:         brandingSettingsSchema,
  tickets:          ticketsSettingsSchema,
  ticket_numbering: ticketNumberingSettingsSchema,
  sla:              slaSettingsSchema,
  knowledge_base:   knowledgeBaseSettingsSchema,
  templates:        templatesSettingsSchema,
  automations:      automationsSettingsSchema,
  users_roles:      usersRolesSettingsSchema,
  appearance:       appearanceSettingsSchema,
  integrations:     integrationsSettingsSchema,
  advanced:         advancedSettingsSchema,
} as const satisfies Record<SettingsSection, z.ZodObject<z.ZodRawShape>>;

// ── Inferred types ────────────────────────────────────────────────────────────

export type GeneralSettings       = z.infer<typeof generalSettingsSchema>;
export type BrandingSettings      = z.infer<typeof brandingSettingsSchema>;
export type TicketsSettings       = z.infer<typeof ticketsSettingsSchema>;
export type TicketNumberingSettings = z.infer<typeof ticketNumberingSettingsSchema>;
export type SlaSettings           = z.infer<typeof slaSettingsSchema>;
export type KnowledgeBaseSettings = z.infer<typeof knowledgeBaseSettingsSchema>;
export type TemplatesSettings     = z.infer<typeof templatesSettingsSchema>;
export type AutomationsSettings   = z.infer<typeof automationsSettingsSchema>;
export type UsersRolesSettings    = z.infer<typeof usersRolesSettingsSchema>;
export type AppearanceSettings    = z.infer<typeof appearanceSettingsSchema>;
export type IntegrationsSettings  = z.infer<typeof integrationsSettingsSchema>;
export type AdvancedSettings      = z.infer<typeof advancedSettingsSchema>;

export type SectionData<S extends SettingsSection> =
  z.infer<(typeof sectionSchemas)[S]>;

export type AllSettings = {
  [S in SettingsSection]: SectionData<S>;
};
