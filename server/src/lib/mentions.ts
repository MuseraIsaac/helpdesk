/**
 * mentions.ts — extract @mentioned user IDs from TipTap HTML and send
 * in-app notifications to those users.
 *
 * TipTap's Mention extension renders nodes as:
 *   <span data-type="mention" data-id="<userId>" ...>@Name</span>
 *
 * We parse these with a regex (no DOM library needed for this simple pattern)
 * and send in-app notifications respecting the notifyOnMentioned setting.
 */

import { getSection } from "./settings";
import { notify } from "./notify";

/** Extract every @mention user ID from TipTap HTML, preserving duplicates.
 *
 * Returns one entry per mention occurrence — if the same user is mentioned
 * three times, their ID appears three times. The caller decides whether to
 * deduplicate or send one notification per occurrence.
 *
 * Matches any opening <span> tag that has data-type="mention" and data-id="..."
 * regardless of attribute order.
 */
/**
 * Extract unique email addresses from @mention spans in TipTap HTML.
 * Matches <span data-type="mention" data-email="..."> rendered by MentionWithEmail.
 * Returns a deduplicated list; entries with no email are omitted.
 */
export function extractMentionedEmails(html: string | null | undefined): string[] {
  if (!html) return [];
  const seen = new Set<string>();

  const tagRegex   = /<span\s[^>]*>/gi;
  const isMention  = /data-type="mention"/i;
  const extractEmail = /data-email="([^"]+)"/i;

  let tagMatch: RegExpExecArray | null;
  while ((tagMatch = tagRegex.exec(html)) !== null) {
    const tag = tagMatch[0];
    if (!isMention.test(tag)) continue;
    const m = extractEmail.exec(tag);
    if (m?.[1]?.trim()) seen.add(m[1].trim().toLowerCase());
  }
  return [...seen];
}

export function extractMentionedUserIds(html: string | null | undefined): string[] {
  if (!html) return [];
  const ids: string[] = [];

  const tagRegex  = /<span\s[^>]*>/gi;
  const isMention = /data-type="mention"/i;
  const extractId = /data-id="([^"]+)"/i;

  let tagMatch: RegExpExecArray | null;
  while ((tagMatch = tagRegex.exec(html)) !== null) {
    const tag = tagMatch[0];
    if (!isMention.test(tag)) continue;
    const idMatch = extractId.exec(tag);
    if (idMatch?.[1]) ids.push(idMatch[1]); // no dedup — one entry per occurrence
  }
  return ids;
}

export interface MentionContext {
  /** IDs of users who are NOT the author (they don't notify themselves) */
  authorId: string | null;
  /** Short label like "TKT-0001" or "INC-0001" */
  entityNumber: string;
  /** Human-readable title / subject */
  entityTitle: string;
  /** Relative URL, e.g. /tickets/42 */
  entityUrl: string;
  /** Entity kind for the notification link */
  entityType: string;
  entityId: string;
}

/**
 * Parse mentions from HTML and fire in-app notifications to the mentioned
 * users (skipping the author). Respects the `notifyOnMentioned` setting.
 * Fire-and-forget safe.
 *
 * Each unique mentioned user receives exactly one notification per
 * note/update, regardless of how many times they appear in the content.
 */
export async function notifyMentions(
  html: string | null | undefined,
  ctx: MentionContext
): Promise<void> {
  const allMentions = extractMentionedUserIds(html);
  if (allMentions.length === 0) return;

  const settings = await getSection("notifications");
  if (!settings.inAppNotificationsEnabled || !settings.notifyOnMentioned) return;

  // Deduplicate — one notification per user per note/update, self-mentions excluded.
  const recipientIds = [...new Set(allMentions)].filter((id) => id !== ctx.authorId);
  if (recipientIds.length === 0) return;

  void notify({
    event:        "user.mentioned",
    recipientIds,
    title:        `You were mentioned in ${ctx.entityNumber}`,
    body:         ctx.entityTitle,
    entityType:   ctx.entityType,
    entityId:     ctx.entityId,
    entityUrl:    ctx.entityUrl,
    channels:     ["in_app"],
  });
}
