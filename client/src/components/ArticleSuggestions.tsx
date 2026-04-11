import { useState, useEffect, useRef } from "react";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { fetchSuggestions } from "@/lib/kb-suggest";
import { BookOpen, X, ChevronRight, Lightbulb } from "lucide-react";

interface Props {
  /** The text to match against — ticket subject + body, or just subject. */
  query: string;
  /** Debounce delay in ms (default 600). */
  debounceMs?: number;
}

export default function ArticleSuggestions({ query, debounceMs = 600 }: Props) {
  const [dismissed, setDismissed] = useState(false);
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset dismissed state when the query changes significantly
  const prevQueryRef = useRef("");
  useEffect(() => {
    if (query.length > prevQueryRef.current.length + 10) {
      setDismissed(false);
    }
    prevQueryRef.current = query;
  }, [query]);

  // Debounce
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setDebouncedQuery(query), debounceMs);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [query, debounceMs]);

  const { data: articles = [], isFetching } = useQuery({
    queryKey: ["kb-suggest", debouncedQuery],
    queryFn: () => fetchSuggestions(debouncedQuery),
    enabled: debouncedQuery.trim().length >= 3,
    staleTime: 60_000,
  });

  // Nothing to show
  if (dismissed || (!isFetching && articles.length === 0)) return null;
  // Still debouncing / fetching with no prior results — stay silent
  if (isFetching && articles.length === 0) return null;

  return (
    <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-3 animate-in fade-in slide-in-from-top-1 duration-200">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-primary">
          <Lightbulb className="h-4 w-4 shrink-0" />
          These articles might answer your question
        </div>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="text-muted-foreground hover:text-foreground transition-colors p-0.5 rounded"
          aria-label="Dismiss suggestions"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Article list */}
      <ul className="space-y-2">
        {articles.map((article) => (
          <li key={article.id}>
            <Link
              to={`/help/articles/${article.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-start gap-3 rounded-md p-2 hover:bg-primary/10 transition-colors"
            >
              <BookOpen className="h-3.5 w-3.5 shrink-0 mt-0.5 text-muted-foreground group-hover:text-primary transition-colors" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium leading-snug group-hover:text-primary transition-colors">
                  {article.title}
                </p>
                {article.excerpt && (
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">
                    {article.excerpt}
                  </p>
                )}
              </div>
              <ChevronRight className="h-3.5 w-3.5 shrink-0 mt-0.5 text-muted-foreground group-hover:text-primary transition-colors" />
            </Link>
          </li>
        ))}
      </ul>

      {/* Soft CTA to still submit if nothing helps */}
      <p className="text-xs text-muted-foreground pt-1 border-t border-primary/10">
        Didn't find what you need?{" "}
        <span className="font-medium text-foreground">
          Continue filling in the form below to submit your request.
        </span>
      </p>
    </div>
  );
}
