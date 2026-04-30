/**
 * settings.ts — helpers for reading and writing system settings.
 *
 * Storage: one row per section in `system_setting`, keyed by section name.
 * On read, stored JSON is merged with schema defaults so new fields are
 * automatically available without a migration.
 *
 * Usage:
 *   const data = await getSection("general");
 *   await setSection("general", { helpdeskName: "Acme Support" }, userId);
 */
import prisma from "../db";
import {
  type SettingsSection,
  type SectionData,
  sectionSchemas,
  settingsSections,
  type AllSettings,
} from "core/schemas/settings.ts";

/**
 * Read one section, applying schema defaults to any missing fields.
 */
export async function getSection<S extends SettingsSection>(
  section: S
): Promise<SectionData<S>> {
  const row = await prisma.systemSetting.findUnique({ where: { section } });
  const schema = sectionSchemas[section] as (typeof sectionSchemas)[S];
  // schema.parse fills in defaults for any missing fields
  return schema.parse(row?.data ?? {}) as SectionData<S>;
}

/**
 * Write one section. Merges incoming data over the current stored value so
 * callers can send only the fields they want to change.
 */
export async function setSection<S extends SettingsSection>(
  section: S,
  incoming: Partial<SectionData<S>>,
  updatedById?: string
): Promise<SectionData<S>> {
  const existing = await getSection(section);
  const merged = { ...existing, ...incoming };
  const schema = sectionSchemas[section] as (typeof sectionSchemas)[S];
  const validated = schema.parse(merged) as SectionData<S>;

  await prisma.systemSetting.upsert({
    where: { section },
    create: {
      section,
      data: validated as object,
      updatedById: updatedById ?? null,
    },
    update: {
      data: validated as object,
      updatedById: updatedById ?? null,
    },
  });

  return validated;
}

/**
 * Read all sections at once (used by GET /api/settings).
 */
export async function getAllSettings(): Promise<AllSettings> {
  const rows = await prisma.systemSetting.findMany();
  const rowMap = new Map(rows.map((r) => [r.section, r.data]));

  const result = {} as AllSettings;
  for (const section of settingsSections) {
    const schema = sectionSchemas[section];
    result[section] = schema.parse(rowMap.get(section) ?? {}) as never;
  }
  return result;
}

/**
 * Redact sensitive credential fields before sending to the client.
 * Integrations section stores API keys — strip them on GET so they
 * are never echoed back to the browser.
 */
export function redactSensitive(
  section: SettingsSection,
  data: Record<string, unknown>
): Record<string, unknown> {
  if (section === "integrations") {
    return {
      ...data,
      // Email
      sendgridApiKey:  data.sendgridApiKey  ? "••••••••" : "",
      smtpPassword:    data.smtpPassword    ? "••••••••" : "",
      // Slack / Webhook
      slackWebhookUrl: data.slackWebhookUrl ? "••••••••" : "",
      webhookSecret:   data.webhookSecret   ? "••••••••" : "",
      // AI
      openaiApiKey:    data.openaiApiKey    ? "••••••••" : "",
      // Google Sign-In
      googleSignInClientSecret: data.googleSignInClientSecret ? "••••••••" : "",
      // Video bridge secrets
      teamsClientSecret:  data.teamsClientSecret  ? "••••••••" : "",
      googleClientSecret: data.googleClientSecret ? "••••••••" : "",
      googleRefreshToken: data.googleRefreshToken ? "••••••••" : "",
      zoomClientSecret:   data.zoomClientSecret   ? "••••••••" : "",
      webexBotToken:      data.webexBotToken      ? "••••••••" : "",
    };
  }
  return data;
}
