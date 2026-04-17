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
  type KbReviewStatus,
  type KbVisibility,
} from "core/schemas/kb.ts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import {
  Plus,
  Pencil,
  Trash2,
  BookOpen,
  FolderOpen,
  ExternalLink,
  MoreHorizontal,
  ThumbsUp,
  ThumbsDown,
  Lock,
  Globe,
  SendHorizonal,
  CheckCheck,
  Archive,
  EyeOff,
  History,
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
  reviewStatus: KbReviewStatus;
  visibility: KbVisibility;
  category: { id: number; name: string; slug: string } | null;
  author: { id: string; name: string };
  owner: { id: string; name: string } | null;
  reviewedBy: { id: string; name: string } | null;
  viewCount: number;
  helpfulCount: number;
  notHelpfulCount: number;
  publishedAt: string | null;
  updatedAt: string;
  _count: { feedback: number; versions: number };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function ReviewStatusBadge({ status }: { status: KbReviewStatus }) {
  const map: Record<KbReviewStatus, { label: string; className: string }> = {
    draft:     { label: "Draft",     className: "bg-muted text-muted-foreground" },
    in_review: { label: "In Review", className: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400" },
    approved:  { label: "Approved",  className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" },
    archived:  { label: "Archived",  className: "bg-muted text-muted-foreground line-through" },
  };
  const { label, className } = map[status] ?? map.draft;
  return <Badge variant="outline" className={`text-[11px] ${className}`}>{label}</Badge>;
}

// ── Category form ─────────────────────────────────────────────────────────────

interface CategoryFormProps {
  category?: KbCategory;
  onSuccess: () => void;
}

function CategoryForm({ category, onSuccess }: CategoryFormProps) {
  const isEdit = !!category;
  const queryClient = useQueryClient();

  const { register, handleSubmit, formState: { errors } } = useForm<CreateKbCategoryInput>({
    resolver: zodResolver(isEdit ? updateKbCategorySchema : createKbCategorySchema),
    defaultValues: category
      ? { name: category.name, description: category.description ?? "", position: category.position }
      : { position: 0 },
  });

  const mutation = useMutation({
    mutationFn: async (data: CreateKbCategoryInput | UpdateKbCategoryInput) => {
      if (isEdit) return axios.patch(`/api/kb/categories/${category.id}`, data);
      return axios.post("/api/kb/categories", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["kb-categories"] });
      onSuccess();
    },
  });

  return (
    <form onSubmit={handleSubmit((data) => mutation.mutate(data))} className="space-y-4">
      {mutation.error && (
        <ErrorAlert error={mutation.error} fallback={`Failed to ${isEdit ? "update" : "create"} category`} />
      )}
      <div className="grid gap-2">
        <Label htmlFor="cat-name">Name</Label>
        <Input id="cat-name" {...register("name")} placeholder="e.g. Getting Started" />
        {errors.name && <ErrorMessage message={errors.name.message} />}
      </div>
      <div className="grid gap-2">
        <Label htmlFor="cat-description">Description</Label>
        <Textarea id="cat-description" {...register("description")} placeholder="Short description (optional)" rows={2} />
        {errors.description && <ErrorMessage message={errors.description.message} />}
      </div>
      <div className="grid gap-2">
        <Label htmlFor="cat-position">Position</Label>
        <Input id="cat-position" type="number" {...register("position", { valueAsNumber: true })} />
        {errors.position && <ErrorMessage message={errors.position.message} />}
      </div>
      <div className="flex justify-end">
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? "Saving…" : isEdit ? "Save changes" : "Create category"}
        </Button>
      </div>
    </form>
  );
}

// ── KbPage ────────────────────────────────────────────────────────────────────

export default function KbPage() {
  const queryClient = useQueryClient();
  const [categoryDialog, setCategoryDialog] = useState<{ open: boolean; category?: KbCategory }>({ open: false });
  const [deleteCategoryId, setDeleteCategoryId] = useState<number | null>(null);
  const [deleteArticleId, setDeleteArticleId] = useState<number | null>(null);
  const [articleFilter, setArticleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [reviewFilter, setReviewFilter] = useState<string>("all");

  const { data: categoriesData, isLoading: catsLoading, error: catsError } = useQuery({
    queryKey: ["kb-categories"],
    queryFn: async () => {
      const { data } = await axios.get<{ categories: KbCategory[] }>("/api/kb/categories");
      return data.categories;
    },
  });

  const { data: articlesData, isLoading: artsLoading, error: artsError } = useQuery({
    queryKey: ["kb-articles"],
    queryFn: async () => {
      const { data } = await axios.get<{ articles: KbArticle[] }>("/api/kb/articles");
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["kb-articles"] }),
  });

  const workflowMutation = useMutation({
    mutationFn: ({ id, action }: { id: number; action: string }) =>
      axios.post(`/api/kb/articles/${id}/${action}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["kb-articles"] }),
  });

  const filteredArticles = articlesData?.filter((a) => {
    const matchTitle = !articleFilter || a.title.toLowerCase().includes(articleFilter.toLowerCase());
    const matchStatus = statusFilter === "all" || a.status === statusFilter;
    const matchReview = reviewFilter === "all" || a.reviewStatus === reviewFilter;
    return matchTitle && matchStatus && matchReview;
  });

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Knowledge Base</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage help articles and categories</p>
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
          <Button variant="outline" size="sm" onClick={() => setCategoryDialog({ open: true })}>
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add category
          </Button>
        </div>

        {catsError && <ErrorAlert error={catsError} fallback="Failed to load categories" />}

        {catsLoading ? (
          <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
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
                    <TableCell colSpan={4} className="text-center text-muted-foreground py-8">No categories yet</TableCell>
                  </TableRow>
                ) : (
                  categoriesData.map((cat) => (
                    <TableRow key={cat.id}>
                      <TableCell className="font-medium">{cat.name}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">{cat.description ?? "—"}</TableCell>
                      <TableCell className="text-right text-sm">{cat._count.articles}</TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7"
                            onClick={() => setCategoryDialog({ open: true, category: cat })}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => setDeleteCategoryId(cat.id)}>
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
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <h2 className="text-base font-medium flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-muted-foreground" />
            Articles
          </h2>
          <div className="flex items-center gap-2 flex-wrap">
            <Input
              placeholder="Filter articles…"
              value={articleFilter}
              onChange={(e) => setArticleFilter(e.target.value)}
              className="max-w-[180px] h-8 text-sm"
            />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-8 text-sm w-[120px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="published">Published</SelectItem>
              </SelectContent>
            </Select>
            <Select value={reviewFilter} onValueChange={setReviewFilter}>
              <SelectTrigger className="h-8 text-sm w-[130px]">
                <SelectValue placeholder="Review" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All reviews</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="in_review">In Review</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {artsError && <ErrorAlert error={artsError} fallback="Failed to load articles" />}

        {artsLoading ? (
          <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Review</TableHead>
                  <TableHead>Visibility</TableHead>
                  <TableHead className="text-right">Views</TableHead>
                  <TableHead className="text-right">Feedback</TableHead>
                  <TableHead className="w-[52px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {!filteredArticles?.length ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      {articleFilter || statusFilter !== "all" || reviewFilter !== "all"
                        ? "No articles match your filters"
                        : "No articles yet"}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredArticles.map((article) => (
                    <TableRow key={article.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{article.title}</span>
                          {article.status === "published" && (
                            <Badge variant="default" className="text-[10px] h-4 px-1">Live</Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          by {article.author.name}
                          {article._count.versions > 0 && (
                            <span className="ml-2 inline-flex items-center gap-0.5">
                              <History className="h-3 w-3" />
                              {article._count.versions} rev
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {article.category?.name ?? "—"}
                      </TableCell>
                      <TableCell>
                        <ReviewStatusBadge status={article.reviewStatus} />
                      </TableCell>
                      <TableCell>
                        {article.visibility === "internal" ? (
                          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                            <Lock className="h-3 w-3" /> Internal
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                            <Globe className="h-3 w-3" /> Public
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {article.viewCount}
                      </TableCell>
                      <TableCell className="text-right">
                        {article._count.feedback > 0 ? (
                          <div className="flex items-center justify-end gap-2 text-xs tabular-nums">
                            <span className="inline-flex items-center gap-0.5 text-green-600">
                              <ThumbsUp className="h-3 w-3" />{article.helpfulCount}
                            </span>
                            <span className="inline-flex items-center gap-0.5 text-muted-foreground">
                              <ThumbsDown className="h-3 w-3" />{article.notHelpfulCount}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7">
                              <MoreHorizontal className="h-3.5 w-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-44">
                            <DropdownMenuItem asChild>
                              <Link to={`/kb/articles/${article.id}/edit`}>
                                <Pencil className="h-3.5 w-3.5 mr-2" />
                                Edit
                              </Link>
                            </DropdownMenuItem>
                            {article.status === "published" && (
                              <DropdownMenuItem asChild>
                                <Link to={`/help/articles/${article.slug}`} target="_blank">
                                  <ExternalLink className="h-3.5 w-3.5 mr-2" />
                                  View live
                                </Link>
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            {/* Workflow actions */}
                            {article.reviewStatus === "draft" && (
                              <DropdownMenuItem
                                onClick={() => workflowMutation.mutate({ id: article.id, action: "submit-review" })}
                              >
                                <SendHorizonal className="h-3.5 w-3.5 mr-2" />
                                Submit for review
                              </DropdownMenuItem>
                            )}
                            {article.reviewStatus === "in_review" && (
                              <DropdownMenuItem
                                onClick={() => workflowMutation.mutate({ id: article.id, action: "approve" })}
                              >
                                <CheckCheck className="h-3.5 w-3.5 mr-2" />
                                Approve
                              </DropdownMenuItem>
                            )}
                            {article.reviewStatus !== "archived" && article.status !== "published" && (
                              <DropdownMenuItem
                                onClick={() => workflowMutation.mutate({ id: article.id, action: "publish" })}
                              >
                                <Globe className="h-3.5 w-3.5 mr-2" />
                                Publish
                              </DropdownMenuItem>
                            )}
                            {article.status === "published" && (
                              <DropdownMenuItem
                                onClick={() => workflowMutation.mutate({ id: article.id, action: "unpublish" })}
                              >
                                <EyeOff className="h-3.5 w-3.5 mr-2" />
                                Unpublish
                              </DropdownMenuItem>
                            )}
                            {article.reviewStatus !== "archived" && (
                              <DropdownMenuItem
                                onClick={() => workflowMutation.mutate({ id: article.id, action: "archive" })}
                                className="text-muted-foreground"
                              >
                                <Archive className="h-3.5 w-3.5 mr-2" />
                                Archive
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => setDeleteArticleId(article.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
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
      <Dialog open={categoryDialog.open} onOpenChange={(open) => setCategoryDialog((prev) => ({ ...prev, open }))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{categoryDialog.category ? "Edit category" : "New category"}</DialogTitle>
          </DialogHeader>
          <CategoryForm category={categoryDialog.category} onSuccess={() => setCategoryDialog({ open: false })} />
        </DialogContent>
      </Dialog>

      {/* Delete category confirm */}
      <AlertDialog open={deleteCategoryId !== null} onOpenChange={(open) => !open && setDeleteCategoryId(null)}>
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
              onClick={() => { if (deleteCategoryId !== null) { deleteCategoryMutation.mutate(deleteCategoryId); setDeleteCategoryId(null); } }}
            >Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete article confirm */}
      <AlertDialog open={deleteArticleId !== null} onOpenChange={(open) => !open && setDeleteArticleId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete article?</AlertDialogTitle>
            <AlertDialogDescription>
              This article will be permanently deleted along with all its versions and feedback. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (deleteArticleId !== null) { deleteArticleMutation.mutate(deleteArticleId); setDeleteArticleId(null); } }}
            >Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
