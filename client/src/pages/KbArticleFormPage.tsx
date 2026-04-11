import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import axios from "axios";
import {
  createKbArticleSchema,
  type CreateKbArticleInput,
} from "core/schemas/kb.ts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import ErrorAlert from "@/components/ErrorAlert";
import ErrorMessage from "@/components/ErrorMessage";
import MarkdownRenderer from "@/components/MarkdownRenderer";
import BackLink from "@/components/BackLink";
import { Eye, Code } from "lucide-react";

interface KbCategory {
  id: number;
  name: string;
  slug: string;
}

interface KbArticle {
  id: number;
  title: string;
  slug: string;
  body: string;
  status: "draft" | "published";
  categoryId: number | null;
  category: KbCategory | null;
}

export default function KbArticleFormPage() {
  const { id } = useParams<{ id?: string }>();
  const isEdit = !!id;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [preview, setPreview] = useState(false);

  const { data: article, isLoading: articleLoading } = useQuery({
    queryKey: ["kb-article", id],
    queryFn: async () => {
      const { data } = await axios.get<{ article: KbArticle }>(
        `/api/kb/articles/${id}`
      );
      return data.article;
    },
    enabled: isEdit,
  });

  const { data: categories } = useQuery({
    queryKey: ["kb-categories"],
    queryFn: async () => {
      const { data } = await axios.get<{ categories: KbCategory[] }>(
        "/api/kb/categories"
      );
      return data.categories;
    },
  });

  const {
    register,
    handleSubmit,
    control,
    watch,
    reset,
    formState: { errors, isDirty },
  } = useForm<CreateKbArticleInput>({
    resolver: zodResolver(createKbArticleSchema),
    defaultValues: { status: "draft", categoryId: null },
  });

  useEffect(() => {
    if (article) {
      reset({
        title: article.title,
        body: article.body,
        status: article.status,
        categoryId: article.categoryId,
      });
    }
  }, [article, reset]);

  const bodyValue = watch("body") ?? "";

  const mutation = useMutation({
    mutationFn: async (data: CreateKbArticleInput) => {
      if (isEdit) {
        const { data: res } = await axios.patch<{ article: KbArticle }>(
          `/api/kb/articles/${id}`,
          data
        );
        return res.article;
      }
      const { data: res } = await axios.post<{ article: KbArticle }>(
        "/api/kb/articles",
        data
      );
      return res.article;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["kb-articles"] });
      if (isEdit) {
        queryClient.invalidateQueries({ queryKey: ["kb-article", id] });
      }
      navigate("/kb");
    },
  });

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

      <div>
        <h1 className="text-2xl font-semibold">
          {isEdit ? "Edit article" : "New article"}
        </h1>
      </div>

      <form
        onSubmit={handleSubmit((data) => mutation.mutate(data))}
        className="space-y-5"
      >
        {mutation.error && (
          <ErrorAlert
            error={mutation.error}
            fallback={`Failed to ${isEdit ? "update" : "create"} article`}
          />
        )}

        {/* Title */}
        <div className="grid gap-2">
          <Label htmlFor="title">Title</Label>
          <Input
            id="title"
            {...register("title")}
            placeholder="Article title"
          />
          {errors.title && <ErrorMessage message={errors.title.message} />}
        </div>

        {/* Category + Status row */}
        <div className="grid grid-cols-2 gap-4">
          <div className="grid gap-2">
            <Label>Category</Label>
            <Controller
              name="categoryId"
              control={control}
              render={({ field }) => (
                <Select
                  value={field.value !== null && field.value !== undefined ? String(field.value) : "none"}
                  onValueChange={(v) =>
                    field.onChange(v === "none" ? null : Number(v))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="No category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No category</SelectItem>
                    {categories?.map((cat) => (
                      <SelectItem key={cat.id} value={String(cat.id)}>
                        {cat.name}
                      </SelectItem>
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
                <Select
                  value={field.value ?? "draft"}
                  onValueChange={field.onChange}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="published">Published</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </div>
        </div>

        {/* Body with preview toggle */}
        <div className="grid gap-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="body">Body (Markdown)</Label>
            <button
              type="button"
              onClick={() => setPreview((p) => !p)}
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              {preview ? (
                <>
                  <Code className="h-3.5 w-3.5" />
                  Edit
                </>
              ) : (
                <>
                  <Eye className="h-3.5 w-3.5" />
                  Preview
                </>
              )}
            </button>
          </div>

          {preview ? (
            <div className="min-h-[300px] rounded-md border p-4 bg-muted/30">
              {bodyValue ? (
                <MarkdownRenderer content={bodyValue} />
              ) : (
                <p className="text-muted-foreground text-sm">Nothing to preview</p>
              )}
            </div>
          ) : (
            <Textarea
              id="body"
              {...register("body")}
              placeholder="Write your article in Markdown…"
              rows={16}
              className="font-mono text-sm"
            />
          )}
          {errors.body && <ErrorMessage message={errors.body.message} />}
        </div>

        <div className="flex items-center gap-3 pt-1">
          <Button
            type="submit"
            disabled={mutation.isPending || (isEdit && !isDirty)}
          >
            {mutation.isPending
              ? "Saving…"
              : isEdit
              ? "Save changes"
              : "Create article"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate("/kb")}
          >
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
