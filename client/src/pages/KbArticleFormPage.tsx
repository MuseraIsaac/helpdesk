import { useState, useEffect, useCallback } from "react";
import { useNavigate, useParams } from "react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import axios from "axios";
import { marked } from "marked";
import {
  createKbArticleSchema,
  type CreateKbArticleInput,
  type KbReviewStatus,
  type KbVisibility,
} from "core/schemas/kb.ts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import ErrorAlert from "@/components/ErrorAlert";
import RichTextEditor from "@/components/RichTextEditor";
import RichTextRenderer from "@/components/RichTextRenderer";
import BackLink from "@/components/BackLink";
import { Eye, Edit2, Globe, Lock } from "lucide-react";

interface KbCategory { id: number; name: string; slug: string; }

interface KbArticle {
  id: number;
  title: string;
  slug: string;
  body: string;
  status: "draft" | "published";
  reviewStatus: KbReviewStatus;
  visibility: KbVisibility;
  categoryId: number | null;
  category: KbCategory | null;
  ownerId: string | null;
  owner: { id: string; name: string } | null;
  reviewedBy: { id: string; name: string } | null;
  publishedAt: string | null;
}

function toEditorHtml(body: string): string {
  if (!body) return "";
  const trimmed = body.trimStart();
  if (trimmed.startsWith("<")) return body;
  return marked.parse(body, { async: false }) as string;
}

const REVIEW_STATUS_LABELS: Record<KbReviewStatus, string> = {
  draft:     "Draft",
  in_review: "In Review",
  approved:  "Approved",
  archived:  "Archived",
};

const REVIEW_STATUS_COLORS: Record<KbReviewStatus, string> = {
  draft:     "bg-muted text-muted-foreground",
  in_review: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  approved:  "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  archived:  "bg-muted text-muted-foreground",
};

export default function KbArticleFormPage() {
  const { id } = useParams<{ id?: string }>();
  const isEdit = !!id;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [preview, setPreview] = useState(false);
  const [bodyHtml, setBodyHtml] = useState("");
  const [isDirtyBody, setIsDirtyBody] = useState(false);

  const handleBodyChange = useCallback((html: string) => {
    setBodyHtml(html);
    setIsDirtyBody(true);
  }, []);

  const { data: article, isLoading: articleLoading } = useQuery({
    queryKey: ["kb-article", id],
    queryFn: async () => {
      const { data } = await axios.get<{ article: KbArticle }>(`/api/kb/articles/${id}`);
      return data.article;
    },
    enabled: isEdit,
  });

  const { data: categories } = useQuery({
    queryKey: ["kb-categories"],
    queryFn: async () => {
      const { data } = await axios.get<{ categories: KbCategory[] }>("/api/kb/categories");
      return data.categories;
    },
  });

  const { register, handleSubmit, control, reset, formState: { errors, isDirty } } =
    useForm<CreateKbArticleInput>({
      resolver: zodResolver(createKbArticleSchema),
      defaultValues: { status: "draft", visibility: "public", categoryId: null },
    });

  useEffect(() => {
    if (article) {
      reset({
        title:        article.title,
        body:         article.body,
        status:       article.status,
        reviewStatus: article.reviewStatus,
        visibility:   article.visibility,
        categoryId:   article.categoryId,
        ownerId:      article.ownerId ?? undefined,
      });
      setBodyHtml(toEditorHtml(article.body));
      setIsDirtyBody(false);
    }
  }, [article, reset]);

  const mutation = useMutation({
    mutationFn: async (data: CreateKbArticleInput) => {
      const payload = { ...data, body: bodyHtml };
      if (isEdit) {
        const { data: res } = await axios.patch<{ article: KbArticle }>(`/api/kb/articles/${id}`, payload);
        return res.article;
      }
      const { data: res } = await axios.post<{ article: KbArticle }>("/api/kb/articles", payload);
      return res.article;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["kb-articles"] });
      if (isEdit) queryClient.invalidateQueries({ queryKey: ["kb-article", id] });
      navigate("/kb");
    },
  });

  const canSave = !mutation.isPending && bodyHtml.trim().length > 0 &&
    (isEdit ? isDirty || isDirtyBody : true);

  if (isEdit && articleLoading) {
    return (
      <div className="space-y-4 max-w-[800px]">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-[800px]">
      <BackLink to="/kb">Back to knowledge base</BackLink>

      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold">
          {isEdit ? "Edit article" : "New article"}
        </h1>
        {isEdit && article && (
          <>
            <Badge variant="outline" className={`text-[11px] ${REVIEW_STATUS_COLORS[article.reviewStatus]}`}>
              {REVIEW_STATUS_LABELS[article.reviewStatus]}
            </Badge>
            {article.status === "published" && (
              <Badge variant="default" className="text-[11px]">Live</Badge>
            )}
          </>
        )}
      </div>

      {/* Review ownership info */}
      {isEdit && article && (article.owner || article.reviewedBy) && (
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          {article.owner && <span>Owner: <span className="text-foreground font-medium">{article.owner.name}</span></span>}
          {article.reviewedBy && <span>Reviewed by: <span className="text-foreground font-medium">{article.reviewedBy.name}</span></span>}
          {article.publishedAt && (
            <span>Published: <span className="text-foreground font-medium">
              {new Date(article.publishedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
            </span></span>
          )}
        </div>
      )}

      <form onSubmit={handleSubmit((data) => mutation.mutate(data))} className="space-y-5">
        {mutation.error && (
          <ErrorAlert error={mutation.error} fallback={`Failed to ${isEdit ? "update" : "create"} article`} />
        )}

        {/* Title */}
        <div className="grid gap-2">
          <Label htmlFor="title">Title</Label>
          <Input id="title" {...register("title")} placeholder="Article title" />
          {errors.title && <p className="text-sm text-destructive">{errors.title.message}</p>}
        </div>

        {/* Category + Status + Visibility row */}
        <div className="grid grid-cols-3 gap-4">
          <div className="grid gap-2">
            <Label>Category</Label>
            <Controller
              name="categoryId"
              control={control}
              render={({ field }) => (
                <Select
                  value={field.value !== null && field.value !== undefined ? String(field.value) : "none"}
                  onValueChange={(v) => field.onChange(v === "none" ? null : Number(v))}
                >
                  <SelectTrigger><SelectValue placeholder="No category" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No category</SelectItem>
                    {categories?.map((cat) => (
                      <SelectItem key={cat.id} value={String(cat.id)}>{cat.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          <div className="grid gap-2">
            <Label>Status</Label>
            <Controller
              name="status"
              control={control}
              render={({ field }) => (
                <Select value={field.value ?? "draft"} onValueChange={field.onChange}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="published">Published</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          <div className="grid gap-2">
            <Label>Visibility</Label>
            <Controller
              name="visibility"
              control={control}
              render={({ field }) => (
                <Select value={field.value ?? "public"} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="public">
                      <span className="flex items-center gap-1.5">
                        <Globe className="h-3.5 w-3.5" /> Public
                      </span>
                    </SelectItem>
                    <SelectItem value="internal">
                      <span className="flex items-center gap-1.5">
                        <Lock className="h-3.5 w-3.5" /> Internal only
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </div>
        </div>

        {/* Body — editor / preview toggle */}
        <div className="grid gap-2">
          <div className="flex items-center justify-between">
            <Label>Body</Label>
            <button
              type="button"
              onClick={() => setPreview((p) => !p)}
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {preview ? (
                <><Edit2 className="h-3.5 w-3.5" />Edit</>
              ) : (
                <><Eye className="h-3.5 w-3.5" />Preview</>
              )}
            </button>
          </div>

          {preview ? (
            <div className="min-h-[300px] rounded-md border p-4 bg-muted/30">
              {bodyHtml ? (
                <RichTextRenderer content={bodyHtml} />
              ) : (
                <p className="text-muted-foreground text-sm">Nothing to preview</p>
              )}
            </div>
          ) : (
            <RichTextEditor
              content={bodyHtml}
              onChange={handleBodyChange}
              placeholder="Write your article here…"
              minHeight="300px"
            />
          )}
          {errors.body && <p className="text-sm text-destructive">{errors.body.message}</p>}
        </div>

        <div className="flex items-center gap-3 pt-1">
          <Button type="submit" disabled={!canSave}>
            {mutation.isPending ? "Saving…" : isEdit ? "Save changes" : "Create article"}
          </Button>
          <Button type="button" variant="outline" onClick={() => navigate("/kb")}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
