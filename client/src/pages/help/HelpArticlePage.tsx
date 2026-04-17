import { useState } from "react";
import { Link, useParams } from "react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import axios from "axios";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import ErrorAlert from "@/components/ErrorAlert";
import MarkdownRenderer from "@/components/MarkdownRenderer";
import BackLink from "@/components/BackLink";
import { Eye, ThumbsUp, ThumbsDown, CheckCircle2 } from "lucide-react";

interface KbArticle {
  id: number;
  title: string;
  slug: string;
  body: string;
  status: "draft" | "published";
  category: { id: number; name: string; slug: string } | null;
  author: { id: string; name: string };
  viewCount: number;
  helpfulCount: number;
  notHelpfulCount: number;
  createdAt: string;
  updatedAt: string;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric", month: "long", day: "numeric",
  });
}

// ── Feedback widget ───────────────────────────────────────────────────────────

function ArticleFeedback({ slug }: { slug: string }) {
  const [voted, setVoted] = useState<"helpful" | "not-helpful" | null>(null);
  const [showComment, setShowComment] = useState(false);
  const [comment, setComment] = useState("");

  const feedbackMutation = useMutation({
    mutationFn: async ({ helpful, comment }: { helpful: boolean; comment?: string }) => {
      await axios.post(`/api/kb/public/articles/${slug}/feedback`, {
        helpful,
        comment: comment || undefined,
      });
    },
    onSuccess: (_, vars) => {
      setVoted(vars.helpful ? "helpful" : "not-helpful");
      setShowComment(false);
    },
  });

  if (voted) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <CheckCircle2 className="h-4 w-4 text-green-500" />
        Thanks for your feedback!
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Was this article helpful?</p>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => feedbackMutation.mutate({ helpful: true })}
          disabled={feedbackMutation.isPending}
        >
          <ThumbsUp className="h-3.5 w-3.5 mr-1.5" />
          Yes, helpful
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowComment(true)}
          disabled={feedbackMutation.isPending}
        >
          <ThumbsDown className="h-3.5 w-3.5 mr-1.5" />
          Not helpful
        </Button>
      </div>
      {showComment && (
        <div className="space-y-2 max-w-md">
          <Textarea
            placeholder="What could be improved? (optional)"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={3}
            className="text-sm"
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => feedbackMutation.mutate({ helpful: false, comment })}
              disabled={feedbackMutation.isPending}
            >
              {feedbackMutation.isPending ? "Sending…" : "Send feedback"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowComment(false)}
            >
              Cancel
            </Button>
          </div>
          {feedbackMutation.error && (
            <ErrorAlert error={feedbackMutation.error} fallback="Failed to submit feedback" />
          )}
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function HelpArticlePage() {
  const { slug } = useParams<{ slug: string }>();

  const { data: article, isLoading, error } = useQuery({
    queryKey: ["help-article", slug],
    queryFn: async () => {
      const { data } = await axios.get<{ article: KbArticle }>(`/api/kb/public/articles/${slug}`);
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
              <Link to="/help" className="hover:text-foreground transition-colors">Help Center</Link>
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
              {(article.helpfulCount + article.notHelpfulCount) > 0 && (
                <span className="flex items-center gap-1">
                  <ThumbsUp className="h-3 w-3 text-green-500" />
                  {Math.round((article.helpfulCount / (article.helpfulCount + article.notHelpfulCount)) * 100)}% found helpful
                </span>
              )}
            </div>
          </div>

          {/* Body */}
          <div className="rounded-lg border p-6 bg-card">
            <MarkdownRenderer content={article.body} />
          </div>

          {/* Feedback */}
          <div className="rounded-lg border border-dashed p-5 space-y-3">
            <ArticleFeedback slug={article.slug} />
          </div>

          {/* Footer CTA */}
          <div className="rounded-lg border border-dashed p-5 text-center space-y-2">
            <p className="text-sm text-muted-foreground">Didn't find what you were looking for?</p>
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
