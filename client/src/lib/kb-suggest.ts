/**
 * KB article suggestion service.
 *
 * Current implementation: keyword search via GET /api/kb/public/suggest
 *
 * Upgrade path:
 *   Replace the axios call below with a call to a semantic search endpoint
 *   (e.g. POST /api/kb/public/suggest-semantic) that uses OpenAI embeddings
 *   + pgvector. The ArticleSuggestions component stays unchanged.
 */
import axios from "axios";

export interface SuggestedArticle {
  id: number;
  title: string;
  slug: string;
  excerpt: string;
  category: { id: number; name: string; slug: string } | null;
}

/**
 * Fetch KB suggestions. Pass `subject` separately when you have it — the
 * server weights subject-keyword matches ~3× over body matches and gates
 * candidates on them, which is what makes results actually topical.
 *
 * Legacy single-string call shape is still supported.
 */
export async function fetchSuggestions(
  arg: string | { subject?: string; body?: string },
): Promise<SuggestedArticle[]> {
  const subject = typeof arg === "string" ? "" : (arg.subject ?? "");
  const body    = typeof arg === "string" ? arg : (arg.body ?? "");
  const q       = `${subject} ${body}`.trim();
  if (!q || q.length < 3) return [];
  const params: Record<string, string> = { q };
  if (subject) params.subject = subject;
  const { data } = await axios.get<{ articles: SuggestedArticle[] }>(
    "/api/kb/public/suggest",
    { params },
  );
  return data.articles;
}
