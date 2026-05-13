import { Router } from "express";
import { z } from "zod/v4";
import { requireAuth } from "../middleware/require-auth";
import { requireAdmin } from "../middleware/require-admin";
import { requirePermission } from "../middleware/require-permission";
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
router.get("/", requireAuth, requirePermission("settings.view"), async (_req, res) => {
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
router.get("/sections", requireAuth, requirePermission("settings.view"), (_req, res) => {
  res.json({ sections: settingsSections });
});

/**
 * GET /api/settings/:section
 * Any authenticated non-customer user can read settings (sensitive fields are
 * always redacted). This lets agents load reply-composer defaults, branding
 * colours, SLA config, etc. without needing admin privileges.
 */
/**
 * GET /api/settings/password-policy
 * Public — returns just the password complexity rules. Used by the login,
 * forgot-password, and admin user-create forms to show a live checklist as
 * the user types. Only the four policy flags are exposed; nothing else.
 *
 * Mounted before `/:section` so the literal path matches first.
 */
router.get("/password-policy", async (_req, res) => {
  const s = await getSection("security");
  res.json({
    passwordMinLength:        s.passwordMinLength        ?? 8,
    passwordRequireUppercase: s.passwordRequireUppercase ?? false,
    passwordRequireNumber:    s.passwordRequireNumber    ?? true,
    passwordRequireSymbol:    s.passwordRequireSymbol    ?? false,
  });
});

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
    if (incoming.googleSignInClientSecret === REDACTED) delete incoming.googleSignInClientSecret;
    // Video bridge secrets
    if (incoming.teamsClientSecret  === REDACTED) delete incoming.teamsClientSecret;
    if (incoming.googleClientSecret === REDACTED) delete incoming.googleClientSecret;
    if (incoming.googleRefreshToken === REDACTED) delete incoming.googleRefreshToken;
    if (incoming.zoomClientSecret   === REDACTED) delete incoming.zoomClientSecret;
    if (incoming.webexBotToken      === REDACTED) delete incoming.webexBotToken;

    // For each outbound email account, replace REDACTED secrets with the value
    // currently stored for the same account id. This lets the UI re-submit the
    // masked value without overwriting the real secret.
    if (Array.isArray(incoming.outboundAccounts)) {
      const stored = await getSection("integrations");
      const storedById = new Map<string, { smtpPassword?: string; sendgridApiKey?: string }>();
      for (const acc of stored.outboundAccounts ?? []) {
        storedById.set(acc.id, { smtpPassword: acc.smtpPassword, sendgridApiKey: acc.sendgridApiKey });
      }
      incoming.outboundAccounts = (incoming.outboundAccounts as Array<Record<string, unknown>>).map((acc) => {
        const prev = typeof acc.id === "string" ? storedById.get(acc.id) : undefined;
        const next = { ...acc };
        if (acc.smtpPassword   === REDACTED) next.smtpPassword   = prev?.smtpPassword   ?? "";
        if (acc.sendgridApiKey === REDACTED) next.sendgridApiKey = prev?.sendgridApiKey ?? "";
        return next;
      });
    }
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

  // Validate incoming data against the section schema.
  //
  // ⚠ Zod's `.partial()` makes fields optional but does NOT strip their
  // defaults. So `schema.partial().safeParse({ minCabApprovers: 2 })`
  // returns an object with ALL fields populated — the missing ones
  // filled in from the schema defaults (e.g. `defaultCabGroupId: null`).
  // Passing that into setSection's spread-merge would overwrite every
  // unrelated stored field with a default, silently wiping the user's
  // previous configuration on every save.
  //
  // Fix: only forward keys that were actually present in the incoming
  // body. The values come from the validated parse so they're typed
  // correctly, but we drop any key the user didn't send.
  const result = schema.partial().safeParse(incoming);
  if (!result.success) {
    res.status(400).json({ error: result.error.issues[0]?.message ?? "Validation failed" });
    return;
  }

  const incomingKeys = new Set(Object.keys(incoming));
  const diff: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(result.data as Record<string, unknown>)) {
    if (incomingKeys.has(key)) diff[key] = value;
  }

  const saved = await setSection(section, diff as never, req.user.id);

  // Bust the in-memory audit settings cache so logAudit picks up the change
  // within the same request cycle, not after the 60-second TTL expires.
  if (section === "audit") invalidateAuditSettingsCache();

  // Same idea for the security policy cache (lockout, IP allowlist, password
  // rules) so the admin's save is effective on the very next request.
  if (section === "security") {
    const { invalidateSecurityPolicyCache } = await import("../lib/security-policy");
    invalidateSecurityPolicyCache();
    // Email-verification enforcement lives inside Better Auth itself, so we
    // also rebuild the auth instance to pick up changes to that flag.
    void (async () => {
      try {
        const { reloadAuth } = await import("../lib/auth");
        await reloadAuth();
      } catch (err) {
        console.error("[auth] reloadAuth after security save failed:", err);
      }
    })();
  }

  // Rebuild Better Auth so Google Sign-In credential changes apply immediately
  // without a server restart. Fire-and-forget; failure is logged but doesn't
  // block the response — the next boot will recover from settings.
  if (section === "integrations") {
    void (async () => {
      try {
        const { reloadAuth } = await import("../lib/auth");
        await reloadAuth();
      } catch (err) {
        console.error("[auth] reloadAuth after settings save failed:", err);
      }
    })();
  }

  // Log the settings change (fire-and-forget; must come after cache bust above)
  void logSystemAudit(req.user.id, "settings.updated", { section });

  const safe = redactSensitive(section, saved as Record<string, unknown>);
  res.json({ section, data: safe });
});

/**
 * GET /api/settings/auth-providers/public
 * Public — no auth required. Tells the login pages which social providers
 * are active so they can show/hide buttons without leaking credentials.
 */
router.get("/auth-providers/public", async (_req, res) => {
  const { isGoogleSignInEnabled } = await import("../lib/auth");
  res.json({
    google: isGoogleSignInEnabled(),
  });
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

/**
 * POST /api/settings/integrations/test-smtp
 * Admin only — verifies the SMTP host/port/credentials by opening a connection
 * and (if creds supplied) authenticating, without sending a message.
 * Any field omitted in the body falls back to the saved setting so the test
 * works without re-entering the password.
 */
const testSmtpSchema = z.object({
  smtpHost:     z.string().optional(),
  smtpPort:     z.number().int().positive().optional(),
  smtpUser:     z.string().optional(),
  smtpPassword: z.string().optional(),
  /** Optional outbound account id. When set, missing fields fall back to that
   *  saved account's values rather than the top-level default. Lets the UI
   *  test a named account without re-entering its password. */
  accountId:    z.string().optional(),
});

router.post(
  "/integrations/test-smtp",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    const parsed = testSmtpSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ ok: false, error: "Invalid request body" });
      return;
    }
    const saved = await getSection("integrations");

    // If an accountId is given, prefer that account's saved values as the
    // fallback. Otherwise fall back to the top-level default-account fields.
    const fallback = parsed.data.accountId
      ? saved.outboundAccounts?.find((a) => a.id === parsed.data.accountId) ?? null
      : null;

    const host = parsed.data.smtpHost     ?? fallback?.smtpHost     ?? saved.smtpHost     ?? "";
    const port = parsed.data.smtpPort     ?? fallback?.smtpPort     ?? saved.smtpPort     ?? 587;
    const user = parsed.data.smtpUser     ?? fallback?.smtpUser     ?? saved.smtpUser     ?? "";
    const pass = parsed.data.smtpPassword ?? fallback?.smtpPassword ?? saved.smtpPassword ?? "";

    if (!host) {
      res.status(400).json({ ok: false, error: "SMTP host is required" });
      return;
    }

    const { default: nodemailer } = await import("nodemailer");
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      ...(user || pass ? { auth: { user, pass } } : {}),
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 10_000,
    });

    try {
      await transporter.verify();
      res.json({ ok: true });
    } catch (err) {
      const e = err as { message?: string; code?: string; responseCode?: number; command?: string };
      res.status(200).json({
        ok: false,
        error: e.message ?? String(err),
        code: e.code ?? null,
        responseCode: e.responseCode ?? null,
        command: e.command ?? null,
      });
    } finally {
      transporter.close();
    }
  },
);

export default router;
