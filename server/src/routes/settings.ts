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

// All settings routes are admin-only
router.use(requireAuth, requireAdmin);

/**
 * GET /api/settings
 * Returns all sections with defaults applied.
 * Sensitive credential fields are redacted.
 */
router.get("/", async (_req, res) => {
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
router.get("/sections", (_req, res) => {
  res.json({ sections: settingsSections });
});

/**
 * GET /api/settings/:section
 * Returns settings for a single section with defaults applied.
 */
router.get("/:section", async (req, res) => {
  const { section } = req.params;
  if (!isSettingsSection(section)) {
    res.status(404).json({ error: `Unknown settings section: ${section}` });
    return;
  }

  const data = await getSection(section);
  const safe = redactSensitive(section, data as Record<string, unknown>);
  res.json({ section, data: safe });
});

/**
 * PUT /api/settings/:section
 * Validates and saves a complete section (partial updates are accepted;
 * missing fields are filled from the existing stored value then schema defaults).
 *
 * For the integrations section: fields that arrive as "••••••••" (redacted
 * placeholder) are stripped before merging so they don't overwrite real values.
 */
router.put("/:section", async (req, res) => {
  const { section } = req.params;
  if (!isSettingsSection(section)) {
    res.status(404).json({ error: `Unknown settings section: ${section}` });
    return;
  }

  let incoming = { ...req.body };

  // Strip redacted placeholders so stored secrets are not overwritten
  if (section === "integrations") {
    const REDACTED = "••••••••";
    if (incoming.sendgridApiKey === REDACTED) delete incoming.sendgridApiKey;
    if (incoming.smtpPassword   === REDACTED) delete incoming.smtpPassword;
    if (incoming.slackWebhookUrl === REDACTED) delete incoming.slackWebhookUrl;
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

export default router;
