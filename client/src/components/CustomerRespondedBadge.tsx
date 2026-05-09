/**
 * CustomerRespondedBadge
 *
 * Visible signal that the customer is following up on a ticket — i.e. the
 * most recent message on the conversation came from them, so the team is
 * the one expected to act next. Helps agents triaging the queue spot at a
 * glance which tickets have new inbound activity that needs a response.
 *
 * Data source — the most recent reply on the thread (`lastReply`).
 * Deriving from the actual reply row (rather than per-ticket reply
 * timestamp columns) means the badge is correct regardless of whether
 * historical writes happened to populate those columns. Self-healing.
 *
 * Visibility logic:
 *   • There must be at least one reply on the thread (`lastReply` set) —
 *     so a brand-new ticket with only the original body never qualifies.
 *   • That most recent reply must be from the customer
 *     (`lastReply.senderType === "customer"`). If an agent replied last,
 *     the ball is in the customer's court and the badge is suppressed.
 *   • Hidden on resolved / closed tickets — once the ticket is done the
 *     "awaiting reply" framing no longer applies.
 *
 * Synchronizes with the `tickets.customerRespondedBadgeEnabled` admin
 * setting — when off, the badge disappears from every surface.
 */

import { MessageSquareReply } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useSettings } from "@/hooks/useSettings";

// Most recent reply, as returned by both the list and detail endpoints.
export interface LastReplySummary {
  senderType: "agent" | "customer";
  createdAt:  string;
  authorName?: string | null;
}

export interface CustomerRespondedBadgeProps {
  /** Most recent reply on the thread — null/undefined when none yet. */
  lastReply: LastReplySummary | null | undefined;
  /** Ticket status — drives suppression on resolved / closed tickets. */
  status?: string | null;
  /** "compact" → tiny chip used in the list. "full" → full pill on the detail page header. */
  size?: "compact" | "full";
}

/**
 * Pure helper — true when the customer is the most recent participant on
 * the thread (i.e. there's a reply, and it came from the customer). Exposed
 * so other surfaces (filters, reports, tooltips) can reuse the same
 * semantics without re-deriving them.
 */
export function isCustomerWaitingForReply(
  lastReply: LastReplySummary | null | undefined,
): boolean {
  return !!lastReply && lastReply.senderType === "customer";
}

const TERMINAL_STATUSES = new Set(["resolved", "closed"]);

// ── Lightweight time-ago for the inline timestamp on the full pill ──────────
//
// Kept local rather than pulled from a date lib — this is the only place we
// use it and it avoids dragging another dependency into the bundle.
function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1)  return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7)  return `${d}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function CustomerRespondedBadge({
  lastReply, status, size = "full",
}: CustomerRespondedBadgeProps) {
  const { data: ticketSettings } = useSettings("tickets");
  const enabled = ticketSettings?.customerRespondedBadgeEnabled ?? true;

  if (!enabled) return null;
  if (status && TERMINAL_STATUSES.has(status)) return null;
  if (!isCustomerWaitingForReply(lastReply)) return null;

  // Amber palette intentional — sky-blue read as "informational background
  // metadata" in user testing on the list. Amber registers as "needs your
  // attention" without being as alarming as red, which we reserve for SLA
  // breaches and escalations.
  const ring =
    "border-amber-300 bg-amber-50 text-amber-800 " +
    "dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-200";

  // The icon dot pulses softly — strong enough to catch the eye while
  // skimming, soft enough not to feel like an alert. Animation is purely
  // decorative; the badge is fully accessible without it.
  const PulsingIcon = () => (
    <span className="relative inline-flex h-3 w-3 shrink-0 items-center justify-center">
      <span
        className="absolute inline-flex h-3 w-3 rounded-full bg-amber-400/50 animate-ping"
        aria-hidden
      />
      <MessageSquareReply className="relative h-3 w-3" />
    </span>
  );

  const tooltip = lastReply?.authorName
    ? `${lastReply.authorName} replied — awaiting your response`
    : "Customer replied — awaiting your response";

  if (size === "compact") {
    return (
      <Badge
        variant="outline"
        className={`gap-1.5 px-2 py-0.5 h-5 text-[10.5px] font-semibold tracking-wide shrink-0 ${ring}`}
        title={tooltip}
      >
        <PulsingIcon />
        Customer Responded
      </Badge>
    );
  }

  return (
    <Badge
      variant="outline"
      className={`gap-1.5 px-2.5 py-0.5 text-[11px] font-semibold tracking-wide ${ring}`}
      title={tooltip}
    >
      <PulsingIcon />
      Customer Responded
      {lastReply?.createdAt && (
        <span className="font-medium text-amber-700/70 dark:text-amber-300/70">
          · {timeAgo(lastReply.createdAt)}
        </span>
      )}
    </Badge>
  );
}
