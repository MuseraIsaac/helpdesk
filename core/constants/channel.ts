/**
 * Intake Channel — normalized channel type system for omnichannel support.
 *
 * Every ticket and reply now carries a channel identifier so the UI can
 * render the right icon, and so future connectors can plug in without
 * touching ticket business logic.
 *
 * ── Implemented ────────────────────────────────────────────────────────────
 *   email        Inbound email via SendGrid (webhooks/inbound-email)
 *   portal       Self-service customer portal
 *   api          Direct REST API submission (programmatic / integration)
 *   agent        Created manually by an agent in the UI
 *
 * ── Planned / Roadmap ───────────────────────────────────────────────────────
 *   chat         Live chat widget (e.g. Intercom, Crisp, custom WebSocket)
 *   whatsapp     WhatsApp Business API via Meta Cloud API or Twilio
 *   slack_teams  Slack / Microsoft Teams app (bidirectional via bot)
 *   voice        Voice/telephony integration (Twilio Voice, Amazon Connect)
 *   social       Social media DMs (Twitter/X, Facebook Messenger, Instagram)
 *
 * ── Side conversations (future) ────────────────────────────────────────────
 *   Planned: agents can open "side conversations" on a ticket to communicate
 *   with third parties (vendors, other teams) without creating a new ticket.
 *   These will use the same channel abstraction with a `sideConversation` flag.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type IntakeChannel =
  | "email"
  | "portal"
  | "api"
  | "agent"
  | "chat"
  | "whatsapp"
  | "slack_teams"
  | "voice"
  | "social";

export const INTAKE_CHANNELS: IntakeChannel[] = [
  "email",
  "portal",
  "api",
  "agent",
  "chat",
  "whatsapp",
  "slack_teams",
  "voice",
  "social",
];

// ── Labels ────────────────────────────────────────────────────────────────────

export const CHANNEL_LABEL: Record<IntakeChannel, string> = {
  email:       "Email",
  portal:      "Self-Service Portal",
  api:         "API",
  agent:       "Agent",
  chat:        "Live Chat",
  whatsapp:    "WhatsApp",
  slack_teams: "Slack / Teams",
  voice:       "Voice",
  social:      "Social Media",
};

export const CHANNEL_SHORT_LABEL: Record<IntakeChannel, string> = {
  email:       "Email",
  portal:      "Portal",
  api:         "API",
  agent:       "Agent",
  chat:        "Chat",
  whatsapp:    "WhatsApp",
  slack_teams: "Slack/Teams",
  voice:       "Voice",
  social:      "Social",
};

// ── Emoji icons ───────────────────────────────────────────────────────────────

export const CHANNEL_ICON: Record<IntakeChannel, string> = {
  email:       "✉️",
  portal:      "🖥️",
  api:         "🔌",
  agent:       "🎧",
  chat:        "💬",
  whatsapp:    "📱",
  slack_teams: "🔷",
  voice:       "📞",
  social:      "📣",
};

// ── Implementation status ─────────────────────────────────────────────────────

export const CHANNEL_IMPLEMENTED: Record<IntakeChannel, boolean> = {
  email:       true,
  portal:      true,
  api:         true,
  agent:       true,
  chat:        false,
  whatsapp:    false,
  slack_teams: false,
  voice:       false,
  social:      false,
};

// ── Color tokens (Tailwind classes) ───────────────────────────────────────────

export const CHANNEL_COLOR: Record<IntakeChannel, string> = {
  email:       "bg-blue-500/10 text-blue-700 dark:text-blue-400",
  portal:      "bg-violet-500/10 text-violet-700 dark:text-violet-400",
  api:         "bg-slate-500/10 text-slate-700 dark:text-slate-400",
  agent:       "bg-teal-500/10 text-teal-700 dark:text-teal-400",
  chat:        "bg-green-500/10 text-green-700 dark:text-green-400",
  whatsapp:    "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  slack_teams: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-400",
  voice:       "bg-orange-500/10 text-orange-700 dark:text-orange-400",
  social:      "bg-pink-500/10 text-pink-700 dark:text-pink-400",
};

// ── Support tier definitions ──────────────────────────────────────────────────

export type SupportTier = "free" | "standard" | "premium" | "enterprise";

export const SUPPORT_TIERS: SupportTier[] = ["free", "standard", "premium", "enterprise"];

export const SUPPORT_TIER_LABEL: Record<SupportTier, string> = {
  free:       "Free",
  standard:   "Standard",
  premium:    "Premium",
  enterprise: "Enterprise",
};

export const SUPPORT_TIER_COLOR: Record<SupportTier, string> = {
  free:       "bg-muted text-muted-foreground",
  standard:   "bg-blue-500/10 text-blue-700 dark:text-blue-400",
  premium:    "bg-violet-500/10 text-violet-700 dark:text-violet-400",
  enterprise: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
};
