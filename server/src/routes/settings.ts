import { Router } from "express";
import { z } from "zod/v4";
import { requireAuth } from "../middleware/require-auth";
import { requireAdmin } from "../middleware/require-admin";
import {
  isSettingsSection,
  sectionSchemas,
  settingsSections,
} from "core/schemas/settings.ts";
import { getSection, setSection, getAllSettings, redactSensitive } from "../lib/settings";
import { invalidateAuditSettingsCache, logSystemAudit } from "../lib/audit";

const router = Router();

/**
 * GET /api/settings/branding/public
 * Public endpoint — no auth required. Returns safe display fields for layouts.
 * The favicon is a static asset (/favicon.png) and is not returned here.
 */
router.get("/branding/public", async (_req, res) => {
  const data = await getSection("branding");
  const d = data as Record<string, unknown>;
  res.json({
    data: {
      logoDataUrl:          d.logoDataUrl          ?? "",
      faviconDataUrl:       d.faviconDataUrl       ?? "",
      companyName:          d.companyName          ?? "",
      platformSubtitle:     d.platformSubtitle     ?? "Service Desk",
      primaryColor:         d.primaryColor         ?? "#6366f1",
      companyWebsite:       d.companyWebsite       ?? "",
      portalAccentColor:    d.portalAccentColor    ?? "#059669",
      portalLoginHeadline:  d.portalLoginHeadline  ?? "We're here",
      portalLoginHighlight: d.portalLoginHighlight ?? "to help you.",
      portalLoginTagline:   d.portalLoginTagline   ?? "Access your support requests, track resolutions, and get help from our team — all in one place.",
      portalLoginBadge:     d.portalLoginBadge     ?? "Self-service support, anytime",
      agentLoginPanelColor: d.agentLoginPanelColor ?? "#6366f1",
      agentLoginHeadline:   d.agentLoginHeadline   ?? "Resolve faster.",
      agentLoginHighlight:  d.agentLoginHighlight  ?? "Deliver better.",
      agentLoginTagline:    d.agentLoginTagline    ?? "The modern helpdesk built for IT teams who want to move fast without breaking things.",
      agentLoginBadge:      d.agentLoginBadge      ?? "AI-Powered Service Management",
      // Service desk contacts — exposed publicly so the customer portal can render them
      serviceDeskEmail:     d.serviceDeskEmail     ?? "",
      serviceDeskPhone:     d.serviceDeskPhone     ?? "",
      serviceDeskHours:     d.serviceDeskHours     ?? "",
      emergencyContact:     d.emergencyContact     ?? "",
      serviceDeskLocation:  d.serviceDeskLocation  ?? "",
    },
  });
});

// ── Read endpoints — any authenticated non-customer user ─────────────────────

/**
 * GET /api/settings
 * Returns all sections with defaults applied.
 * Admin-only: exposes all sections including sensitive integrations data.
 */
router.get("/", requireAuth, requireAdmin, async (_req, res) => {
  const all = await getAllSettings();

  // Redact sensitive fields in each section
  const safe: Record<string, unknown> = {};
  for (const section of settingsSections) {
    safe[section] = redactSensitive(section, all[section] as Record<string, unknown>);
  }

  res.json({ settings: safe });
});

/**
 * GET /api/settings/sections
 * Returns the list of available section keys (for the UI sidebar).
 */
router.get("/sections", requireAuth, requireAdmin, (_req, res) => {
  res.json({ sections: settingsSections });
});

/**
 * GET /api/settings/:section
 * Any authenticated non-customer user can read settings (sensitive fields are
 * always redacted). This lets agents load reply-composer defaults, branding
 * colours, SLA config, etc. without needing admin privileges.
 */
router.get("/:section", requireAuth, async (req, res) => {
  const section = req.params.section as string;
  if (!isSettingsSection(section)) {
    res.status(404).json({ error: `Unknown settings section: ${section}` });
    return;
  }

  const data = await getSection(section);
  const safe = redactSensitive(section, data as Record<string, unknown>);
  res.json({ section, data: safe });
});

// ── Write endpoints — admin only ──────────────────────────────────────────────

/**
 * PUT /api/settings/:section
 * Validates and saves a complete section (partial updates are accepted;
 * missing fields are filled from the existing stored value then schema defaults).
 *
 * For the integrations section: fields that arrive as "••••••••" (redacted
 * placeholder) are stripped before merging so they don't overwrite real values.
 */
router.put("/:section", requireAuth, requireAdmin, async (req, res) => {
  const section = req.params.section as string;
  if (!isSettingsSection(section)) {
    res.status(404).json({ error: `Unknown settings section: ${section}` });
    return;
  }

  let incoming = { ...req.body };

  // Strip redacted placeholders so stored secrets are not overwritten
  if (section === "integrations") {
    const REDACTED = "••••••••";
    if (incoming.sendgridApiKey    === REDACTED) delete incoming.sendgridApiKey;
    if (incoming.smtpPassword      === REDACTED) delete incoming.smtpPassword;
    if (incoming.slackWebhookUrl   === REDACTED) delete incoming.slackWebhookUrl;
    if (incoming.webhookSecret     === REDACTED) delete incoming.webhookSecret;
    if (incoming.openaiApiKey      === REDACTED) delete incoming.openaiApiKey;
    // Video bridge secrets
    if (incoming.teamsClientSecret  === REDACTED) delete incoming.teamsClientSecret;
    if (incoming.googleClientSecret === REDACTED) delete incoming.googleClientSecret;
    if (incoming.googleRefreshToken === REDACTED) delete incoming.googleRefreshToken;
    if (incoming.zoomClientSecret   === REDACTED) delete incoming.zoomClientSecret;
    if (incoming.webexBotToken      === REDACTED) delete incoming.webexBotToken;
  }

  const schema = sectionSchemas[section];

  // For each field that arrives as null, test whether the schema field actually accepts null.
  // If it doesn't (e.g. a number field), remove it so the stored value is preserved via merge.
  // This guards against cleared number inputs that serialize as JSON null.
  const schemaShape = schema.shape as Record<string, z.ZodTypeAny>;
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(incoming as Record<string, unknown>)) {
    if (value === null && key in schemaShape) {
      const fieldSchema = schemaShape[key];
      if (fieldSchema) {
        const accepts = fieldSchema.safeParse(null);
        if (!accepts.success) continue; // drop — stored value will be used in merge
      }
    }
    sanitized[key] = value;
  }
  incoming = sanitized;

  // Validate incoming data against the section schema
  const result = schema.partial().safeParse(incoming);
  if (!result.success) {
    res.status(400).json({ error: result.error.issues[0]?.message ?? "Validation failed" });
    return;
  }

  const saved = await setSection(section, result.data as never, req.user.id);

  // Bust the in-memory audit settings cache so logAudit picks up the change
  // within the same request cycle, not after the 60-second TTL expires.
  if (section === "audit") invalidateAuditSettingsCache();

  // Log the settings change (fire-and-forget; must come after cache bust above)
  void logSystemAudit(req.user.id, "settings.updated", { section });

  const safe = redactSensitive(section, saved as Record<string, unknown>);
  res.json({ section, data: safe });
});

/**
 * POST /api/settings/integrations/test-video-bridge
 * Admin only — validates the configured video bridge credentials by creating
 * a real test meeting. The meeting is NOT cancelled; it will expire naturally.
 */
router.post(
  "/integrations/test-video-bridge",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    const { testVideoBridge } = await import("./bridge-call");
    await testVideoBridge(req, res);
  },
);

export default router;
