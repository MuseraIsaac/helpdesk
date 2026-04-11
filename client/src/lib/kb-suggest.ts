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

export async function fetchSuggestions(query: string): Promise<SuggestedArticle[]> {
  if (!query || query.trim().length < 3) return [];
  const { data } = await axios.get<{ articles: SuggestedArticle[] }>(
    "/api/kb/public/suggest",
    { params: { q: query } }
  );
  return data.articles;
}
