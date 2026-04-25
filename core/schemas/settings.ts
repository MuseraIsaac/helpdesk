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
  // ── Enterprise ITSM sections ──
  "incidents",
  "requests",
  "problems",
  "changes",
  "approvals",
  "cmdb",
  "notifications",
  "security",
  "audit",
  "business_hours",
  // ── Data lifecycle ──
  "trash",
  // ── Demo & Developer tools ──
  "demo_data",
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
    description: "Organisation name, support email, inbound email, and locale defaults",
    keywords: ["name", "email", "inbound", "support inbox", "timezone", "language", "locale", "date", "time"],
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
  incidents: {
    label: "Incidents",
    description: "Incident severity levels, escalation rules, and major-incident thresholds",
    keywords: ["incident", "severity", "major", "escalate", "mtta", "mttr", "p1", "critical", "sev"],
  },
  requests: {
    label: "Requests",
    description: "Service request approval requirements, fulfillment targets, and catalog settings",
    keywords: ["request", "service", "catalog", "approval", "fulfillment", "sr"],
  },
  problems: {
    label: "Problems",
    description: "Problem management, RCA templates, known-error KB integration, and recurrence detection",
    keywords: ["problem", "rca", "root cause", "known error", "recurrence", "pir", "prb"],
  },
  changes: {
    label: "Changes",
    description: "Change types, CAB approval requirements, risk assessment, and freeze windows",
    keywords: ["change", "cab", "risk", "normal", "standard", "emergency", "freeze", "chg"],
  },
  approvals: {
    label: "Approvals",
    description: "Approval workflow reminders, escalation timeouts, and delegation rules",
    keywords: ["approval", "delegate", "remind", "escalate", "timeout", "matrix"],
  },
  cmdb: {
    label: "CMDB & Services",
    description: "Configuration item types, service catalog visibility, and dependency mapping",
    keywords: ["cmdb", "ci", "asset", "service", "dependency", "impact", "catalog", "configuration"],
  },
  notifications: {
    label: "Notifications",
    description: "Email notification events, digest mode, and agent notification preferences",
    keywords: ["notification", "email", "digest", "alert", "event", "subscribe", "watch"],
  },
  security: {
    label: "Security",
    description: "Password policy, MFA enforcement, IP allowlisting, and failed-login lockout",
    keywords: ["security", "password", "mfa", "2fa", "ip", "lockout", "policy", "auth"],
  },
  audit: {
    label: "Audit Log",
    description: "Audit log retention period, events to capture, and export settings",
    keywords: ["audit", "log", "retention", "export", "event", "history", "trail"],
  },
  business_hours: {
    label: "Business Hours",
    description: "Named business calendars, public holidays, and exclusion periods",
    keywords: ["business hours", "calendar", "holiday", "schedule", "working hours", "exclusion"],
  },
  trash: {
    label: "Trash",
    description: "Soft-delete retention period and automatic purge settings for the recycle bin",
    keywords: ["trash", "recycle", "bin", "delete", "restore", "retention", "purge", "soft delete"],
  },
  demo_data: {
    label: "Demo Data",
    description: "Control visibility of the Demo Data section in the sidebar (Super Admin only)",
    keywords: ["demo", "sample", "seed", "test data", "generate", "fake", "synthetic", "developer"],
  },
};

// ── Section schemas ───────────────────────────────────────────────────────────
// Each schema uses .default() so schema.parse({}) returns a fully-populated object.
// On read, stored data is merged with schema defaults — new fields are transparent.

export const generalSettingsSchema = z.object({
  helpdeskName:   z.string().min(1).max(100).default("Zentra"),
  supportEmail:   z.string().default(""),
  /**
   * The inbound support email address customers send tickets to.
   * Configure this address in SendGrid Inbound Parse to forward to the webhook.
   */
  inboundEmail:   z.string().default(""),
  timezone:       z.string().default("UTC"),
  language:       z.string().default("en"),
  dateFormat:     z.string().default("MMM d, yyyy"),
  timeFormat:     z.enum(["12h", "24h"]).default("12h"),
});

export const brandingSettingsSchema = z.object({
  companyName:        z.string().max(100).default(""),
  /** Short subtitle shown below the company name in the sidebar and on the login panel. */
  platformSubtitle:   z.string().max(60).default("Service Desk"),
  /**
   * Public website URL for the company. Shown as a branded link on the
   * customer portal homepage (e.g. "Acme Corp Website"). Leave blank to hide.
   */
  companyWebsite:     z.string().max(500).default(""),
  logoDataUrl:        z.string().default(""),
  /**
   * Dedicated browser favicon. Separate from the app logo so the two can differ.
   * Ideal: 32×32 px PNG or 16×16 px ICO. SVG is supported in modern browsers.
   * If not set, the app falls back to logoDataUrl for the tab icon.
   */
  faviconDataUrl:     z.string().default(""),
  primaryColor:       z.string().default("#6366f1"),
  helpCenterTitle:    z.string().max(100).default("Help Center"),
  helpCenterTagline:  z.string().max(200).default(""),

  // ── Customer portal customisation ─────────────────────────────────────────
  /**
   * Accent color for the customer portal (buttons, active nav, login panel).
   * Independent from the agent-side primaryColor so each surface can be branded separately.
   */
  portalAccentColor:    z.string().max(20).default("#059669"),
  /** First line of the login-page hero headline. */
  portalLoginHeadline:  z.string().max(100).default("We're here"),
  /** Second line — displayed in a gradient accent color on the dark panel. */
  portalLoginHighlight: z.string().max(100).default("to help you."),
  /** Supporting paragraph below the headline. */
  portalLoginTagline:   z.string().max(500).default(
    "Access your support requests, track resolutions, and get help from our team — all in one place."
  ),
  /** Text inside the small pill badge at the top of the hero. */
  portalLoginBadge:     z.string().max(100).default("Self-service support, anytime"),

  // ── Agent portal login page customisation ─────────────────────────────────
  /**
   * Hue/color tint for the agent login page left panel.
   * The panel is always rendered dark; this color controls its tint.
   */
  agentLoginPanelColor: z.string().max(20).default("#6366f1"),
  /** First line of the agent login hero headline. */
  agentLoginHeadline:   z.string().max(100).default("Resolve faster."),
  /** Second line — displayed in a gradient on the dark panel. */
  agentLoginHighlight:  z.string().max(100).default("Deliver better."),
  /** Supporting paragraph below the headline. */
  agentLoginTagline:    z.string().max(500).default(
    "The modern helpdesk built for IT teams who want to move fast without breaking things."
  ),
  /** Text inside the small pill badge at the top of the agent hero. */
  agentLoginBadge:      z.string().max(100).default("AI-Powered Service Management"),
});

export const ticketsSettingsSchema = z.object({
  defaultPriority:              z.enum(["low", "medium", "high", "urgent"]).nullable().default(null),
  defaultCategory:              z.string().nullable().default(null),
  autoAssignment:               z.boolean().default(false),
  allowCustomerReopenResolved:  z.boolean().default(true),
  csatEnabled:                  z.boolean().default(true),
  autoCloseResolvedAfterDays:   z.number().int().min(0).max(365).default(7),
  requireCategoryOnCreate:      z.boolean().default(false),
  /**
   * When true, agents only see tickets assigned to their team(s).
   * Admins and supervisors are always unrestricted.
   * Individual agents can be granted a global override via globalTicketView on the User record.
   */
  teamScopedVisibility:         z.boolean().default(false),
  // Reply composer defaults
  replyDraftEnabled:            z.boolean().default(true),
  replyGreeting:                z.string().max(500).default("Hi {senderName},"),
  replyFooter:                  z.string().max(500).default("Your Ticket number is {ticketNumber}."),
  replyDefaultMode:             z.enum(["reply_all", "reply_sender"]).default("reply_all"),
  // Presence / live collaboration indicators
  presenceEnabled:              z.boolean().default(true),
  // Merge tickets
  mergeTicketsEnabled:          z.boolean().default(true),
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
  // Shared counter for incidents, service requests, and untyped (generic) tickets.
  // All three use this one prefix and sequence — they are numbered together.
  ticket:         seriesConfigSchema.default({ prefix: "TKT", paddingLength: 4, startAt: 1, includeDateSegment: "none", resetPeriod: "never" }),
  change_request: seriesConfigSchema.default({ prefix: "CRQ", paddingLength: 7, startAt: 1, includeDateSegment: "none", resetPeriod: "never" }),
  problem:        seriesConfigSchema.default({ prefix: "PRB", paddingLength: 4, startAt: 1, includeDateSegment: "none", resetPeriod: "never" }),
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

// ── Inbound mailbox ───────────────────────────────────────────────────────────

export const mailboxSchema = z.object({
  /** Client-generated UUID, stable across edits */
  id:              z.string().min(1),
  /** The email address customers send to (e.g. billing@acme.io) */
  address:         z.string().email("Must be a valid email address").toLowerCase(),
  /** Friendly display label shown in the UI (e.g. "Billing Support") */
  label:           z.string().trim().min(1, "Label is required").max(100),
  /** Auto-assign tickets arriving at this mailbox to this team (DB team id) */
  teamId:          z.number().int().nullable().default(null),
  /** Default priority applied to tickets arriving at this mailbox */
  defaultPriority: z.enum(["low", "medium", "high", "urgent"]).nullable().default(null),
  isActive:        z.boolean().default(true),
});

export type Mailbox = z.infer<typeof mailboxSchema>;

export const VIDEO_BRIDGE_PROVIDERS = ["none", "teams", "googlemeet", "zoom", "webex"] as const;
export type VideoBridgeProvider = (typeof VIDEO_BRIDGE_PROVIDERS)[number];

export const integrationsSettingsSchema = z.object({
  // ── Email ──────────────────────────────────────────────────────────────────
  emailEnabled:       z.boolean().default(false),
  emailProvider:      z.enum(["sendgrid", "smtp", "ses"]).default("sendgrid"),
  fromEmail:          z.string().default(""),
  sendgridApiKey:     z.string().default(""),   // server-only; never echoed to client
  smtpHost:           z.string().default(""),
  smtpPort:           z.number().int().default(587),
  smtpUser:           z.string().default(""),
  smtpPassword:       z.string().default(""),   // server-only
  // ── Slack ──────────────────────────────────────────────────────────────────
  slackEnabled:       z.boolean().default(false),
  slackWebhookUrl:    z.string().default(""),   // server-only
  // ── Inbound email webhook ──────────────────────────────────────────────────
  webhookSecret:      z.string().default(""),   // server-only
  // ── AI / OpenAI ────────────────────────────────────────────────────────────
  openaiApiKey:       z.string().default(""),   // server-only
  openaiModel:        z.string().default("gpt-4o-mini"),
  // ── Inbound mailboxes ──────────────────────────────────────────────────────
  /** Additional inbound email addresses that create tickets when emailed. */
  mailboxes: z.array(mailboxSchema).default([]),
  // ── Video Bridge (Incident Bridge Calls) ───────────────────────────────────
  // The active provider. Only one can be active at a time.
  videoBridgeProvider: z.enum(VIDEO_BRIDGE_PROVIDERS).default("none"),
  // Microsoft Teams (Azure AD App — requires OnlineMeetings.ReadWrite.All app permission)
  teamsClientId:          z.string().default(""),
  teamsTenantId:          z.string().default(""),
  teamsClientSecret:      z.string().default(""),   // server-only
  teamsOrganizerUserId:   z.string().default(""),   // UPN or Object ID of the organizer
  // Google Meet (OAuth 2.0 — requires Calendar API + conferenceData scope)
  googleClientId:         z.string().default(""),
  googleClientSecret:     z.string().default(""),   // server-only
  googleRefreshToken:     z.string().default(""),   // server-only; obtained via OAuth consent
  // Zoom (Server-to-Server OAuth app)
  zoomAccountId:          z.string().default(""),
  zoomClientId:           z.string().default(""),
  zoomClientSecret:       z.string().default(""),   // server-only
  // Webex (Personal Access Token or Bot Token)
  webexBotToken:          z.string().default(""),   // server-only
  webexSiteUrl:           z.string().default(""),   // e.g. company.webex.com
});

export const advancedSettingsSchema = z.object({
  maintenanceMode:          z.boolean().default(false),
  maintenanceMessage:       z.string().max(500).default(""),
  debugLogging:             z.boolean().default(false),
  maxAttachmentSizeMb:      z.number().int().min(1).max(100).default(10),
  allowedFileExtensions:    z.string().default("pdf,doc,docx,xls,xlsx,png,jpg,jpeg,gif,webp,zip,txt"),
  sessionTimeoutMinutes:    z.number().int().min(5).max(43200).default(1440),
});

// ── Enterprise ITSM section schemas ──────────────────────────────────────────

export const incidentsSettingsSchema = z.object({
  enabled:                   z.boolean().default(true),
  // Auto-escalate: apply escalation rules automatically on incident create/update
  autoEscalate:              z.boolean().default(true),
  // Major incident threshold: severity at or above this triggers major-incident workflow
  majorIncidentSeverity:     z.enum(["sev1", "sev2", "sev3"]).default("sev1"),
  // Auto-escalate to on-call when breach imminent (minutes before SLA breach)
  autoEscalateMinutesBefore: z.number().int().min(0).default(15),
  requireRcaAboveSeverity:   z.enum(["sev1", "sev2", "sev3", "none"]).default("sev2"),
  // Default MTTA/MTTR targets (minutes) by severity — complements ticket-level SLA
  mttaSev1: z.number().int().positive().default(15),
  mttaSev2: z.number().int().positive().default(30),
  mttaSev3: z.number().int().positive().default(60),
  mttrSev1: z.number().int().positive().default(60),
  mttrSev2: z.number().int().positive().default(240),
  mttrSev3: z.number().int().positive().default(480),
  // Automatically link related incidents to a problem record above this count
  autoProblemLinkThreshold:  z.number().int().min(2).default(3),
  notifyStakeholdersOnMajor: z.boolean().default(true),
});

export const requestsSettingsSchema = z.object({
  enabled:                    z.boolean().default(true),
  // Auto-escalate: apply escalation rules automatically on request create/update
  autoEscalate:               z.boolean().default(false),
  requireApprovalByDefault:   z.boolean().default(false),
  // Default fulfillment SLA (hours) when no catalog item SLA is set
  defaultFulfillmentHours:    z.number().int().positive().default(24),
  allowSelfService:           z.boolean().default(true),
  catalogPubliclyVisible:     z.boolean().default(false),
  // Automatically close fulfilled requests after N days with no activity
  autoCloseFulfilledAfterDays: z.number().int().min(0).default(7),
  requireJustificationAboveImpact: z.enum(["low", "medium", "high", "none"]).default("high"),
});

export const problemsSettingsSchema = z.object({
  enabled:                     z.boolean().default(true),
  enableKnownErrorIntegration: z.boolean().default(true),
  // Days to look back when detecting recurring incidents for auto-problem creation
  recurrenceWindowDays:        z.number().int().min(1).default(30),
  // Auto-create problem record when this many linked incidents exist
  autoCreateProblemThreshold:  z.number().int().min(2).default(3),
  requireRcaTemplate:          z.boolean().default(false),
  pirTemplateEnabled:          z.boolean().default(false),
  // Link known-error articles to KB automatically
  autoPublishKnownErrorToKb:  z.boolean().default(false),
});

export const changesSettingsSchema = z.object({
  enabled:                     z.boolean().default(true),
  requireCabForNormal:         z.boolean().default(true),
  requireCabForEmergency:      z.boolean().default(false),
  standardChangesEnabled:      z.boolean().default(true),
  /** ID of the CabGroup used as the default approver pool for CAB reviews. */
  defaultCabGroupId:           z.number().int().positive().nullable().default(null),
  // Freeze window: no normal/major changes deployed (emergency still allowed)
  freezeWindowEnabled:         z.boolean().default(false),
  freezeWindowStart:           z.string().default(""),
  freezeWindowEnd:             z.string().default(""),
  // Risk matrix thresholds (1-10 score)
  lowRiskMaxScore:             z.number().int().min(1).max(10).default(3),
  highRiskMinScore:            z.number().int().min(1).max(10).default(7),
  requireTestPlanAboveRisk:    z.enum(["low", "medium", "high"]).default("medium"),
  requireRollbackPlan:         z.boolean().default(true),
  autoApproveStandardChanges:  z.boolean().default(true),
  /**
   * When false (default), all CAB approvers are notified simultaneously and
   * can approve in any order — no sequence is enforced.
   * When true, approvers must approve one at a time in the order listed.
   */
  cabApprovalSequential:       z.boolean().default(false),
  /** Minimum number of CAB approvers that must be selected before a change can be submitted for approval. */
  minCabApprovers:             z.number().int().min(1).default(1),
  /** Maximum number of times an approval request can be resent to an approver who has rejected. 0 = no resends allowed. */
  maxApprovalResends:          z.number().int().min(0).default(3),

  // ── Default field values ─────────────────────────────────────────────────────
  // Pre-populate new change forms so teams don't have to set the same values each time.
  defaultChangeType:           z.enum(["standard", "normal", "emergency"]).default("normal"),
  defaultRisk:                 z.enum(["low", "medium", "high", "critical"]).default("low"),
  defaultPriority:             z.enum(["low", "medium", "high", "urgent"]).default("medium"),

  // ── Scheduling rules ─────────────────────────────────────────────────────────
  // Minimum lead time between submission and planned start (0 = no minimum).
  leadTimeDaysNormal:               z.number().int().min(0).default(3),
  leadTimeDaysEmergency:            z.number().int().min(0).default(0),
  // Warn when the planned implementation window exceeds this many hours.
  maxImplementationWindowHours:     z.number().int().positive().default(8),
  // Require a planned start/end window before a normal change can advance past draft.
  requireScheduledWindowForNormal:  z.boolean().default(false),

  // ── Post-implementation review (PIR) ────────────────────────────────────────
  postImplementationReviewEnabled:  z.boolean().default(true),
  // Risk level at or above which a PIR is mandatory (none = never required).
  pirRequiredAboveRisk:             z.enum(["low", "medium", "high", "none"]).default("high"),
  // Days after implementation close within which the PIR must be completed.
  pirWindowDays:                    z.number().int().min(1).default(5),

  // ── Notifications ────────────────────────────────────────────────────────────
  notifyCoordinatorOnStateChange:   z.boolean().default(true),
  notifyAssigneeOnStateChange:      z.boolean().default(true),
});

export const approvalsSettingsSchema = z.object({
  reminderIntervalHours:       z.number().int().min(1).default(24),
  escalationTimeoutHours:      z.number().int().min(1).default(72),
  allowDelegation:             z.boolean().default(true),
  maxApprovalLevels:           z.number().int().min(1).max(10).default(3),
  requireCommentOnRejection:   z.boolean().default(true),
  // Quorum mode: require all approvers or just a majority
  quorumMode:                  z.enum(["all", "majority", "any_one"]).default("all"),
  // Auto-approve after timeout if no response
  autoApproveOnTimeout:        z.boolean().default(false),
  notifyRequesterOnDecision:   z.boolean().default(true),
});

export const cmdbSettingsSchema = z.object({
  enabled:                     z.boolean().default(false),
  trackSoftwareCIs:            z.boolean().default(true),
  trackHardwareCIs:            z.boolean().default(true),
  trackServiceCIs:             z.boolean().default(true),
  trackNetworkCIs:             z.boolean().default(false),
  autoDiscoveryEnabled:        z.boolean().default(false),
  // Link tickets to CIs automatically based on category/affected system
  autoLinkTicketsToCIs:        z.boolean().default(false),
  impactAnalysisEnabled:       z.boolean().default(true),
  // Max depth for dependency chain rendering
  dependencyTreeDepth:         z.number().int().min(1).max(10).default(3),
});

export const notificationsSettingsSchema = z.object({
  // Global toggles
  emailNotificationsEnabled:   z.boolean().default(true),
  inAppNotificationsEnabled:   z.boolean().default(true),
  // Digest mode — batch notifications instead of instant
  digestModeEnabled:           z.boolean().default(false),
  digestIntervalHours:         z.number().int().min(1).max(24).default(4),
  // Events to notify agents about
  notifyOnNewTicketAssigned:   z.boolean().default(true),
  notifyOnTicketReplied:       z.boolean().default(true),
  notifyOnSlaBreachImminent:   z.boolean().default(true),
  notifyOnTicketEscalated:     z.boolean().default(true),
  notifyOnMentioned:           z.boolean().default(true),
  notifyOnApprovalRequired:    z.boolean().default(true),
  notifyOnApprovalDecision:             z.boolean().default(true),
  notifyOnFollowedTicketStatusChanged:    z.boolean().default(true),
  notifyOnFollowedIncidentStatusChanged:  z.boolean().default(true),
  notifyOnFollowedChangeStatusChanged:    z.boolean().default(true),
  notifyOnFollowedRequestStatusChanged:   z.boolean().default(true),
  notifyOnFollowedProblemStatusChanged:   z.boolean().default(true),
  // Agent-facing notification sound
  notificationSoundEnabled:    z.boolean().default(false),
});

export const securitySettingsSchema = z.object({
  // Password policy
  passwordMinLength:           z.number().int().min(6).max(128).default(8),
  passwordRequireUppercase:    z.boolean().default(false),
  passwordRequireNumber:       z.boolean().default(true),
  passwordRequireSymbol:       z.boolean().default(false),
  // MFA
  mfaEnabled:                  z.boolean().default(false),
  mfaRequiredForAdmins:        z.boolean().default(false),
  mfaRequiredForAll:           z.boolean().default(false),
  // Failed login policy
  failedLoginLockoutEnabled:   z.boolean().default(true),
  failedLoginMaxAttempts:      z.number().int().min(3).max(20).default(5),
  lockoutDurationMinutes:      z.number().int().min(1).max(1440).default(30),
  // IP allowlist (comma-separated CIDRs)
  ipAllowlistEnabled:          z.boolean().default(false),
  ipAllowlist:                 z.string().default(""),
  // Session
  enforceSessionTimeout:       z.boolean().default(false),
});

export const auditSettingsSchema = z.object({
  enabled:                     z.boolean().default(true),
  retentionDays:               z.number().int().min(30).max(3650).default(365),
  // Which event categories to capture
  captureAuthEvents:           z.boolean().default(true),
  captureTicketEvents:         z.boolean().default(true),
  captureSettingsChanges:      z.boolean().default(true),
  captureUserManagement:       z.boolean().default(true),
  captureKbEvents:             z.boolean().default(false),
  // Export
  exportEnabled:               z.boolean().default(true),
  exportFormat:                z.enum(["json", "csv"]).default("json"),
});

export const trashSettingsSchema = z.object({
  enabled:            z.boolean().default(true),
  retentionDays:      z.number().int().min(1).max(365).default(30),
  autoEmptyEnabled:   z.boolean().default(true),
});

export const demoDataSettingsSchema = z.object({
  /**
   * When true, the Demo Data sidebar section and all /api/demo-data endpoints
   * become accessible to admin-role users. Off by default so the feature is
   * invisible on production until explicitly opted-in by a Super Admin.
   */
  enableDemoDataTools: z.boolean().default(false),
});

export const businessHoursSettingsSchema = z.object({
  // Default calendar name shown in UI
  defaultCalendarName:         z.string().max(100).default("Default"),
  // Business days and hours (mirrors SLA section but separate for non-SLA uses)
  workDays:                    z.array(z.number().int().min(0).max(6)).default([1, 2, 3, 4, 5]),
  workStart:                   z.string().default("09:00"),
  workEnd:                     z.string().default("17:00"),
  // Public holidays (comma-separated YYYY-MM-DD dates)
  publicHolidays:              z.string().default(""),
  // Exclusion period (e.g. company shutdown) — comma-separated date ranges "YYYY-MM-DD:YYYY-MM-DD"
  exclusionPeriods:            z.string().default(""),
  // Timezone for this calendar (defaults to general.timezone if blank)
  calendarTimezone:            z.string().default(""),
  // Announce upcoming out-of-office in portal
  showHoursInPortal:           z.boolean().default(true),
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
  incidents:        incidentsSettingsSchema,
  requests:         requestsSettingsSchema,
  problems:         problemsSettingsSchema,
  changes:          changesSettingsSchema,
  approvals:        approvalsSettingsSchema,
  cmdb:             cmdbSettingsSchema,
  notifications:    notificationsSettingsSchema,
  security:         securitySettingsSchema,
  audit:            auditSettingsSchema,
  business_hours:   businessHoursSettingsSchema,
  trash:            trashSettingsSchema,
  demo_data:        demoDataSettingsSchema,
} as const satisfies Record<SettingsSection, z.ZodObject<z.ZodRawShape>>;

// ── Inferred types ────────────────────────────────────────────────────────────

export type GeneralSettings          = z.infer<typeof generalSettingsSchema>;
export type BrandingSettings         = z.infer<typeof brandingSettingsSchema>;
export type TicketsSettings          = z.infer<typeof ticketsSettingsSchema>;
export type TicketNumberingSettings  = z.infer<typeof ticketNumberingSettingsSchema>;
export type SlaSettings              = z.infer<typeof slaSettingsSchema>;
export type KnowledgeBaseSettings    = z.infer<typeof knowledgeBaseSettingsSchema>;
export type TemplatesSettings        = z.infer<typeof templatesSettingsSchema>;
export type AutomationsSettings      = z.infer<typeof automationsSettingsSchema>;
export type UsersRolesSettings       = z.infer<typeof usersRolesSettingsSchema>;
export type AppearanceSettings       = z.infer<typeof appearanceSettingsSchema>;
export type IntegrationsSettings     = z.infer<typeof integrationsSettingsSchema>;
export type AdvancedSettings         = z.infer<typeof advancedSettingsSchema>;
export type IncidentsSettings        = z.infer<typeof incidentsSettingsSchema>;
export type RequestsSettings         = z.infer<typeof requestsSettingsSchema>;
export type ProblemsSettings         = z.infer<typeof problemsSettingsSchema>;
export type ChangesSettings          = z.infer<typeof changesSettingsSchema>;
export type ApprovalsSettings        = z.infer<typeof approvalsSettingsSchema>;
export type CmdbSettings             = z.infer<typeof cmdbSettingsSchema>;
export type NotificationsSettings    = z.infer<typeof notificationsSettingsSchema>;
export type SecuritySettings         = z.infer<typeof securitySettingsSchema>;
export type AuditSettings            = z.infer<typeof auditSettingsSchema>;
export type BusinessHoursSettings    = z.infer<typeof businessHoursSettingsSchema>;
export type TrashSettings            = z.infer<typeof trashSettingsSchema>;
export type DemoDataSettings         = z.infer<typeof demoDataSettingsSchema>;

export type SectionData<S extends SettingsSection> =
  z.infer<(typeof sectionSchemas)[S]>;

export type AllSettings = {
  [S in SettingsSection]: SectionData<S>;
};
