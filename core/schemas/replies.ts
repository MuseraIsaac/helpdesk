import { z } from "zod/v4";

export const createReplySchema = z.object({
  body: z.string().trim().min(1, "Reply body is required"),
  bodyHtml: z.string().optional(),
  attachmentIds: z.array(z.number().int().positive()).max(5).optional(),
  /** CC recipients (array of address strings — format not strictly validated). */
  cc: z.array(z.string().trim().min(1)).max(20).optional(),
  /** BCC recipients (array of address strings — format not strictly validated). */
  bcc: z.array(z.string().trim().min(1)).max(20).optional(),
  /** Determines who receives the email and how it is labelled. */
  replyType: z.enum(["reply_all", "reply_sender", "forward"]).default("reply_all"),
  /**
   * Optional override for the primary recipient on `reply_all` / `reply_sender`.
   * When omitted, the server falls back to `ticket.senderEmail`. Ignored for
   * `forward` (use `forwardTo` for that path). Format is not strictly validated
   * so agents can paste display-name addresses or list-style values like
   * `"Asha <asha@acme.io>, ops@acme.io"` and have them passed straight through
   * to the SMTP transport.
   */
  to: z.string().trim().min(1).optional(),
  /** Required when replyType is "forward" — the address(es) to forward to. */
  forwardTo: z.string().trim().min(1).optional(),
  /** Plain-text snapshot of the message being replied to or forwarded. */
  quotedBody: z.string().optional(),
  /** HTML snapshot of the message being replied to or forwarded. */
  quotedHtml: z.string().optional(),
});

export type CreateReplyInput = z.infer<typeof createReplySchema>;

export const polishReplySchema = z.object({
  body: z.string().min(1, "Body is required").max(1000),
});

export type PolishReplyInput = z.infer<typeof polishReplySchema>;
