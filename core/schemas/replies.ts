import { z } from "zod/v4";

export const createReplySchema = z.object({
  body: z.string().trim().min(1, "Reply body is required"),
  bodyHtml: z.string().optional(),
  attachmentIds: z.array(z.number().int().positive()).max(5).optional(),
  /** CC recipients (array of email strings). */
  cc: z.array(z.email()).max(10).optional(),
  /** BCC recipients (array of email strings). */
  bcc: z.array(z.email()).max(10).optional(),
  /** Determines who receives the email and how it is labelled. */
  replyType: z.enum(["reply_all", "reply_sender", "forward"]).default("reply_all"),
  /** Required when replyType is "forward" — the address to forward to. */
  forwardTo: z.email().optional(),
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
