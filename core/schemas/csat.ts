import { z } from "zod/v4";

export const submitCsatSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(500).optional(),
});

export type SubmitCsatInput = z.infer<typeof submitCsatSchema>;
