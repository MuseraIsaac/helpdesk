import { z } from "zod/v4";

export const SEARCH_TYPES = [
  "tickets",
  "incidents",
  "problems",
  "requests",
  "cmdb",
  "kb",
] as const;

export type SearchType = (typeof SEARCH_TYPES)[number];

export const searchQuerySchema = z.object({
  q:     z.string().min(2).max(200),
  types: z
    .string()
    .optional()
    .transform((v) =>
      v
        ? (v.split(",").filter((t) => SEARCH_TYPES.includes(t as SearchType)) as SearchType[])
        : ([...SEARCH_TYPES] as SearchType[])
    ),
  limit: z.coerce.number().int().min(1).max(10).default(5),
});

export type SearchQuery = z.infer<typeof searchQuerySchema>;
