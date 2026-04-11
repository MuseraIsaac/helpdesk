import { useState } from "react";
import { Link } from "react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import axios from "axios";
import {
  createKbCategorySchema,
  updateKbCategorySchema,
  type CreateKbCategoryInput,
  type UpdateKbCategoryInput,
} from "core/schemas/kb.ts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import ErrorAlert from "@/components/ErrorAlert";
import ErrorMessage from "@/components/ErrorMessage";
import {
  Plus,
  Pencil,
  Trash2,
  BookOpen,
  FolderOpen,
  ExternalLink,
} from "lucide-react";

interface KbCategory {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  position: number;
  _count: { articles: number };
}

interface KbArticle {
  id: number;
  title: string;
  slug: string;
  status: "draft" | "published";
  category: { id: number; name: string; slug: string } | null;
  author: { id: string; name: string };
  viewCount: number;
  updatedAt: string;
}

// ── Category form ─────────────────────────────────────────────────────────────

interface CategoryFormProps {
  category?: KbCategory;
  onSuccess: () => void;
}

function CategoryForm({ category, onSuccess }: CategoryFormProps) {
  const isEdit = !!category;
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CreateKbCategoryInput>({
    resolver: zodResolver(isEdit ? updateKbCategorySchema : createKbCategorySchema),
    defaultValues: category
      ? {
          name: category.name,
          description: category.description ?? "",
          position: category.position,
        }
      : { position: 0 },
  });

  const mutation = useMutation({
    mutationFn: async (data: CreateKbCategoryInput | UpdateKbCategoryInput) => {
      if (isEdit) {
        return axios.patch(`/api/kb/categories/${category.id}`, data);
      }
      return axios.post("/api/kb/categories", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["kb-categories"] });
      onSuccess();
    },
  });

  return (
    <form
      onSubmit={handleSubmit((data) => mutation.mutate(data))}
      className="space-y-4"
    >
      {mutation.error && (
        <ErrorAlert
          error={mutation.error}
          fallback={`Failed to ${isEdit ? "update" : "create"} category`}
        />
      )}
      <div className="grid gap-2">
        <Label htmlFor="cat-name">Name</Label>
        <Input id="cat-name" {...register("name")} placeholder="e.g. Getting Started" />
        {errors.name && <ErrorMessage message={errors.name.message} />}
      </div>
      <div className="grid gap-2">
        <Label htmlFor="cat-description">Description</Label>
        <Textarea
          id="cat-description"
          {...register("description")}
          placeholder="Short description (optional)"
          rows={2}
        />
        {errors.description && (
          <ErrorMessage message={errors.description.message} />
        )}
      </div>
      <div className="grid gap-2">
        <Label htmlFor="cat-position">Position</Label>
        <Input
          id="cat-position"
          type="number"
          {...register("position", { valueAsNumber: true })}
        />
        {errors.position && <ErrorMessage message={errors.position.message} />}
      </div>
      <div className="flex justify-end">
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending
            ? "Saving…"
            : isEdit
            ? "Save changes"
            : "Create category"}
        </Button>
      </div>
    </form>
  );
}

// ── KbPage ────────────────────────────────────────────────────────────────────

export default function KbPage() {
  const queryClient = useQueryClient();
  const [categoryDialog, setCategoryDialog] = useState<{
    open: boolean;
    category?: KbCategory;
  }>({ open: false });
  const [deleteCategoryId, setDeleteCategoryId] = useState<number | null>(null);
  const [deleteArticleId, setDeleteArticleId] = useState<number | null>(null);
  const [articleFilter, setArticleFilter] = useState("");

  const {
    data: categoriesData,
    isLoading: catsLoading,
    error: catsError,
  } = useQuery({
    queryKey: ["kb-categories"],
    queryFn: async () => {
      const { data } = await axios.get<{ categories: KbCategory[] }>(
        "/api/kb/categories"
      );
      return data.categories;
    },
  });

  const {
    data: articlesData,
    isLoading: artsLoading,
    error: artsError,
  } = useQuery({
    queryKey: ["kb-articles"],
    queryFn: async () => {
      const { data } = await axios.get<{ articles: KbArticle[] }>(
        "/api/kb/articles"
      );
      return data.articles;
    },
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: (id: number) => axios.delete(`/api/kb/categories/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["kb-categories"] });
      queryClient.invalidateQueries({ queryKey: ["kb-articles"] });
    },
  });

  const deleteArticleMutation = useMutation({
    mutationFn: (id: number) => axios.delete(`/api/kb/articles/${id}`),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["kb-articles"] }),
  });

  const filteredArticles = articlesData?.filter((a) =>
    articleFilter
      ? a.title.toLowerCase().includes(articleFilter.toLowerCase())
      : true
  );

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Knowledge Base</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage help articles and categories
          </p>
        </div>
        <Button asChild>
          <Link to="/kb/articles/new">
            <Plus className="h-4 w-4 mr-1.5" />
            New article
          </Link>
        </Button>
      </div>

      {/* Categories */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-medium flex items-center gap-2">
            <FolderOpen className="h-4 w-4 text-muted-foreground" />
            Categories
          </h2>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCategoryDialog({ open: true })}
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add category
          </Button>
        </div>

        {catsError && (
          <ErrorAlert error={catsError} fallback="Failed to load categories" />
        )}

        {catsLoading ? (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Articles</TableHead>
                  <TableHead className="w-[80px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {!categoriesData?.length ? (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="text-center text-muted-foreground py-8"
                    >
                      No categories yet
                    </TableCell>
                  </TableRow>
                ) : (
                  categoriesData.map((cat) => (
                    <TableRow key={cat.id}>
                      <TableCell className="font-medium">{cat.name}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {cat.description ?? "—"}
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {cat._count.articles}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() =>
                              setCategoryDialog({ open: true, category: cat })
                            }
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => setDeleteCategoryId(cat.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      {/* Articles */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-base font-medium flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-muted-foreground" />
            Articles
          </h2>
          <Input
            placeholder="Filter articles…"
            value={articleFilter}
            onChange={(e) => setArticleFilter(e.target.value)}
            className="max-w-xs h-8 text-sm"
          />
        </div>

        {artsError && (
          <ErrorAlert error={artsError} fallback="Failed to load articles" />
        )}

        {artsLoading ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Views</TableHead>
                  <TableHead className="w-[100px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {!filteredArticles?.length ? (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="text-center text-muted-foreground py-8"
                    >
                      {articleFilter ? "No articles match your filter" : "No articles yet"}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredArticles.map((article) => (
                    <TableRow key={article.id}>
                      <TableCell className="font-medium">
                        {article.title}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {article.category?.name ?? "—"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            article.status === "published"
                              ? "default"
                              : "secondary"
                          }
                        >
                          {article.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {article.viewCount}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            asChild
                          >
                            <Link to={`/kb/articles/${article.id}/edit`}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Link>
                          </Button>
                          {article.status === "published" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              asChild
                            >
                              <Link to={`/help/articles/${article.slug}`}>
                                <ExternalLink className="h-3.5 w-3.5" />
                              </Link>
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => setDeleteArticleId(article.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      {/* Category create/edit dialog */}
      <Dialog
        open={categoryDialog.open}
        onOpenChange={(open) =>
          setCategoryDialog((prev) => ({ ...prev, open }))
        }
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {categoryDialog.category ? "Edit category" : "New category"}
            </DialogTitle>
          </DialogHeader>
          <CategoryForm
            category={categoryDialog.category}
            onSuccess={() => setCategoryDialog({ open: false })}
          />
        </DialogContent>
      </Dialog>

      {/* Delete category confirm */}
      <AlertDialog
        open={deleteCategoryId !== null}
        onOpenChange={(open) => !open && setDeleteCategoryId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete category?</AlertDialogTitle>
            <AlertDialogDescription>
              Articles in this category will become uncategorized. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteCategoryId !== null) {
                  deleteCategoryMutation.mutate(deleteCategoryId);
                  setDeleteCategoryId(null);
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete article confirm */}
      <AlertDialog
        open={deleteArticleId !== null}
        onOpenChange={(open) => !open && setDeleteArticleId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete article?</AlertDialogTitle>
            <AlertDialogDescription>
              This article will be permanently deleted. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteArticleId !== null) {
                  deleteArticleMutation.mutate(deleteArticleId);
                  setDeleteArticleId(null);
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
