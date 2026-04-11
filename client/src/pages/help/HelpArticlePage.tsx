import { Link, useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { Skeleton } from "@/components/ui/skeleton";
import ErrorAlert from "@/components/ErrorAlert";
import MarkdownRenderer from "@/components/MarkdownRenderer";
import BackLink from "@/components/BackLink";
import { Eye } from "lucide-react";

interface KbArticle {
  id: number;
  title: string;
  slug: string;
  body: string;
  status: "draft" | "published";
  category: { id: number; name: string; slug: string } | null;
  author: { id: string; name: string };
  viewCount: number;
  createdAt: string;
  updatedAt: string;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default function HelpArticlePage() {
  const { slug } = useParams<{ slug: string }>();

  const { data: article, isLoading, error } = useQuery({
    queryKey: ["help-article", slug],
    queryFn: async () => {
      const { data } = await axios.get<{ article: KbArticle }>(
        `/api/kb/public/articles/${slug}`
      );
      return data.article;
    },
  });

  return (
    <div className="space-y-6">
      <BackLink to="/help">Back to Help Center</BackLink>

      {isLoading && (
        <div className="space-y-4">
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-64 w-full" />
        </div>
      )}

      {error && (
        <ErrorAlert
          message={
            axios.isAxiosError(error) && error.response?.status === 404
              ? "Article not found"
              : "Failed to load article"
          }
        />
      )}

      {article && (
        <div className="space-y-6">
          {/* Breadcrumb */}
          {article.category && (
            <nav className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Link to="/help" className="hover:text-foreground transition-colors">
                Help Center
              </Link>
              <span>/</span>
              <span>{article.category.name}</span>
            </nav>
          )}

          {/* Title + meta */}
          <div className="space-y-2">
            <h1 className="text-2xl font-bold tracking-tight">{article.title}</h1>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span>Updated {formatDate(article.updatedAt)}</span>
              <span className="flex items-center gap-1">
                <Eye className="h-3 w-3" />
                {article.viewCount} views
              </span>
            </div>
          </div>

          {/* Body */}
          <div className="rounded-lg border p-6 bg-card">
            <MarkdownRenderer content={article.body} />
          </div>

          {/* Footer CTA */}
          <div className="rounded-lg border border-dashed p-5 text-center space-y-2">
            <p className="text-sm text-muted-foreground">
              Didn't find what you were looking for?
            </p>
            <Link
              to="/portal/new-ticket"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
            >
              Submit a support request
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
