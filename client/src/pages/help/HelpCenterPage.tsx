import { useState } from "react";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import ErrorAlert from "@/components/ErrorAlert";
import { Search, ChevronRight, BookOpen } from "lucide-react";

interface KbCategory {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  _count: { articles: number };
}

interface KbArticle {
  id: number;
  title: string;
  slug: string;
  category: { id: number; name: string; slug: string } | null;
  viewCount: number;
  updatedAt: string;
}

export default function HelpCenterPage() {
  const [search, setSearch] = useState("");

  const { data: categories, isLoading: catsLoading } = useQuery({
    queryKey: ["help-categories"],
    queryFn: async () => {
      const { data } = await axios.get<{ categories: KbCategory[] }>(
        "/api/kb/public/categories"
      );
      return data.categories;
    },
  });

  const {
    data: searchResults,
    isLoading: searchLoading,
    error: searchError,
  } = useQuery({
    queryKey: ["help-search", search],
    queryFn: async () => {
      const { data } = await axios.get<{ articles: KbArticle[] }>(
        "/api/kb/public/articles",
        { params: { q: search } }
      );
      return data.articles;
    },
    enabled: search.trim().length > 1,
  });

  const isSearching = search.trim().length > 1;

  return (
    <div className="space-y-10">
      {/* Hero */}
      <div className="text-center space-y-4 py-6">
        <h1 className="text-3xl font-bold tracking-tight">How can we help?</h1>
        <p className="text-muted-foreground">
          Search our help articles or browse by category below.
        </p>
        <div className="relative max-w-lg mx-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search articles…"
            className="pl-9"
          />
        </div>
      </div>

      {/* Search results */}
      {isSearching && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Search results
          </h2>
          {searchError && (
            <ErrorAlert error={searchError} fallback="Search failed" />
          )}
          {searchLoading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : !searchResults?.length ? (
            <p className="text-sm text-muted-foreground py-4">
              No articles found for "{search}"
            </p>
          ) : (
            <div className="divide-y rounded-md border">
              {searchResults.map((article) => (
                <Link
                  key={article.id}
                  to={`/help/articles/${article.slug}`}
                  className="flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors group"
                >
                  <div>
                    <p className="text-sm font-medium group-hover:text-primary transition-colors">
                      {article.title}
                    </p>
                    {article.category && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {article.category.name}
                      </p>
                    )}
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
                </Link>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Categories */}
      {!isSearching && (
        <section className="space-y-6">
          {catsLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-28 w-full" />
              ))}
            </div>
          ) : !categories?.length ? (
            <div className="text-center py-12 text-muted-foreground">
              <BookOpen className="h-8 w-8 mx-auto mb-3 opacity-40" />
              <p>No articles published yet.</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {categories.map((cat) => (
                  <Link
                    key={cat.id}
                    to={`/help?category=${cat.id}`}
                    className="rounded-lg border p-5 hover:border-primary hover:bg-muted/30 transition-all group space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <h3 className="font-medium group-hover:text-primary transition-colors">
                        {cat.name}
                      </h3>
                      <Badge variant="secondary" className="text-xs">
                        {cat._count.articles}
                      </Badge>
                    </div>
                    {cat.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {cat.description}
                      </p>
                    )}
                  </Link>
                ))}
              </div>
              <AllArticles />
            </>
          )}
        </section>
      )}
    </div>
  );
}

function AllArticles() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["help-articles-all"],
    queryFn: async () => {
      const { data } = await axios.get<{ articles: KbArticle[] }>(
        "/api/kb/public/articles"
      );
      return data.articles;
    },
  });

  if (error) return null;

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
        All articles
      </h2>
      {isLoading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : !data?.length ? null : (
        <div className="divide-y rounded-md border">
          {data.map((article) => (
            <Link
              key={article.id}
              to={`/help/articles/${article.slug}`}
              className="flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors group"
            >
              <div>
                <p className="text-sm font-medium group-hover:text-primary transition-colors">
                  {article.title}
                </p>
                {article.category && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {article.category.name}
                  </p>
                )}
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
