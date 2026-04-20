import { Router } from "express";
import { requireAuth } from "../middleware/require-auth";
import { requireAdmin } from "../middleware/require-admin";
import {
  isSettingsSection,
  sectionSchemas,
  settingsSections,
} from "core/schemas/settings.ts";
import { getSection, setSection, getAllSettings, redactSensitive } from "../lib/settings";

const router = Router();

/**
 * GET /api/settings/branding/public
 * Public endpoint — no auth required. Returns only safe display fields used
 * by layouts and the favicon injector before the user is authenticated.
 */
router.get("/branding/public", async (_req, res) => {
  const data = await getSection("branding");
  res.json({
    data: {
      logoDataUrl:    (data as Record<string, unknown>).logoDataUrl    ?? "",
      faviconDataUrl: (data as Record<string, unknown>).faviconDataUrl ?? "",
      companyName:    (data as Record<string, unknown>).companyName    ?? "",
      primaryColor:   (data as Record<string, unknown>).primaryColor   ?? "#6366f1",
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
  const { section } = req.params;
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
  const { section } = req.params;
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

  // Validate incoming data against the section schema
  const schema = sectionSchemas[section];
  const result = schema.partial().safeParse(incoming);
  if (!result.success) {
    res.status(400).json({ error: result.error.issues[0]?.message ?? "Validation failed" });
    return;
  }

  const saved = await setSection(section, result.data as never, req.user.id);
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
