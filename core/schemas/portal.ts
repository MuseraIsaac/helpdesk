import { z } from "zod/v4";

export const portalRegisterSchema = z.object({
  email: z.email("Please enter a valid email"),
  name: z.string().min(1, "Name is required").max(100),
  password: z.string().min(8, "Password must be at least 8 characters"),
});
export type PortalRegisterInput = z.infer<typeof portalRegisterSchema>;

export const portalCreateTicketSchema = z.object({
  subject: z
    .string()
    .min(1, "Subject is required")
    .max(200, "Subject must be 200 characters or less"),
  body: z.string().min(1, "Description is required"),
  bodyHtml: z.string().optional(),
});
export type PortalCreateTicketInput = z.infer<typeof portalCreateTicketSchema>;

export const portalReplySchema = z.object({
  body: z.string().min(1, "Reply cannot be empty"),
  bodyHtml: z.string().optional(),
});
export type PortalReplyInput = z.infer<typeof portalReplySchema>;
