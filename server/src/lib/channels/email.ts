/**
 * email channel — delivers a notification via email.
 *
 * Currently a stub. To enable:
 *  1. Set SMTP_FROM, SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS in .env
 *  2. Look up the recipient's email address from the DB
 *  3. Call the existing sendEmail helper (lib/send-email.ts) or nodemailer directly
 *
 * Returns "skipped" when SMTP is not configured so the delivery log reflects
 * intent without requiring config changes to run the system.
 */

import type { NotifyPayload } from "../notify";

interface ChannelResult {
  status: "sent" | "failed" | "skipped";
  error?: string;
}

export async function deliverEmail(
  _userId: string,
  _payload: NotifyPayload
): Promise<ChannelResult> {
  const smtpConfigured = !!(
    process.env.SMTP_HOST &&
    process.env.SMTP_FROM
  );

  if (!smtpConfigured) {
    return { status: "skipped" };
  }

  // TODO: implement email delivery
  // 1. Look up user email from DB
  // 2. Render an email template using payload.title, payload.body, payload.entityUrl
  // 3. Call sendEmail() from lib/send-email.ts
  // Example:
  //   const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, name: true } });
  //   if (!user) return { status: "skipped" };
  //   await sendEmail({ to: user.email, subject: payload.title, html: `<p>${payload.body}</p>` });
  //   return { status: "sent" };

  return { status: "skipped" };
}
