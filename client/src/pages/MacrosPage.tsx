import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { type Macro, type MacroVisibility } from "core/constants/macro.ts";
import { categoryLabel } from "core/constants/ticket-category.ts";
import { type CreateMacroInput, type UpdateMacroInput } from "core/schemas/macros.ts";
import { createMacroSchema, updateMacroSchema } from "core/schemas/macros.ts";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useSession } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import ErrorAlert from "@/components/ErrorAlert";
import ErrorMessage from "@/components/ErrorMessage";
import { MACRO_VARIABLES } from "@/lib/macro-variables";
import {
  Plus, Pencil, Trash2, BookOpen, Copy, Globe, Lock,
  Shield, Sparkles, Search, Zap,
} from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function VisibilityBadge({ visibility }: { visibility: MacroVisibility }) {
  if (visibility === "personal") {
    return (
      <Badge variant="outline" className="gap-1 text-[11px] border-amber-500/40 text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30">
        <Lock className="h-2.5 w-2.5" />
        Personal
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1 text-[11px] border-blue-500/40 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30">
      <Globe className="h-2.5 w-2.5" />
      Global
    </Badge>
  );
}

function SystemBadge() {
  return (
    <Badge variant="outline" className="gap-1 text-[11px] border-violet-500/40 text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-950/30">
      <Shield className="h-2.5 w-2.5" />
      System
    </Badge>
  );
}

// ─── MacroForm ─────────────────────────────────────────────────────────────────

interface MacroFormProps {
  macro?: Macro;
  defaultBody?: string;
  onSuccess: () => void;
  canManage: boolean;
}

function MacroForm({ macro, defaultBody, onSuccess, canManage }: MacroFormProps) {
  const isEdit = !!macro;
  const queryClient = useQueryClient();

  const form = useForm<CreateMacroInput>({
    resolver: zodResolver(isEdit ? updateMacroSchema : createMacroSchema) as any,
    defaultValues: {
      title: macro?.title ?? "",
      body: macro?.body ?? defaultBody ?? "",
      category: macro?.category ?? undefined,
      isActive: macro?.isActive ?? true,
      visibility: macro?.visibility ?? (canManage ? "global" : "personal"),
    },
  });

  const mutation = useMutation({
    mutationFn: async (payload: CreateMacroInput | UpdateMacroInput) => {
      if (isEdit) {
        const { data } = await axios.put(`/api/macros/${macro.id}`, payload);
        return data;
      }
      const { data } = await axios.post("/api/macros", payload);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["macros"] });
      form.reset();
      mutation.reset();
      onSuccess();
    },
  });

  return (
    <form onSubmit={form.handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="title">Title</Label>
        <Input
          id="title"
          placeholder="e.g. Acknowledge & Investigating"
          {...form.register("title")}
        />
        {form.formState.errors.title && (
          <ErrorMessage message={form.formState.errors.title.message} />
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="body">Body</Label>
        <Textarea
          id="body"
          placeholder="Hi {{customer_name}}, thanks for contacting us..."
          rows={8}
          className="font-mono text-sm resize-none"
          {...form.register("body")}
        />
        {form.formState.errors.body && (
          <ErrorMessage message={form.formState.errors.body.message} />
        )}
        <div className="rounded-md border bg-muted/40 px-3 py-2 space-y-1.5">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Available variables</p>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {MACRO_VARIABLES.map((v) => (
              <span key={v.key} className="text-[11px] text-muted-foreground">
                <code className="font-mono bg-background border rounded px-1 py-0.5">{v.key}</code>
                {" — "}{v.description}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Category</Label>
          <Select
            defaultValue={macro?.category ?? "__none__"}
            onValueChange={(v) =>
              form.setValue("category", v === "__none__" ? undefined : (v as any), { shouldValidate: true })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="No category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">No category</SelectItem>
              <SelectItem value="general_question">{categoryLabel.general_question}</SelectItem>
              <SelectItem value="technical_question">{categoryLabel.technical_question}</SelectItem>
              <SelectItem value="refund_request">{categoryLabel.refund_request}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Status</Label>
          <Select
            defaultValue={macro?.isActive === false ? "inactive" : "active"}
            onValueChange={(v) => form.setValue("isActive", v === "active", { shouldValidate: true })}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Visibility</Label>
        <Select
          defaultValue={macro?.visibility ?? (canManage ? "global" : "personal")}
          onValueChange={(v) => form.setValue("visibility", v as MacroVisibility, { shouldValidate: true })}
          disabled={!canManage}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {canManage && (
              <SelectItem value="global">
                <span className="flex items-center gap-2">
                  <Globe className="h-3.5 w-3.5 text-blue-500" />
                  Global — visible to all agents
                </span>
              </SelectItem>
            )}
            <SelectItem value="personal">
              <span className="flex items-center gap-2">
                <Lock className="h-3.5 w-3.5 text-amber-500" />
                Personal — only visible to you
              </span>
            </SelectItem>
          </SelectContent>
        </Select>
        {!canManage && (
          <p className="text-[11px] text-muted-foreground">Only admins and supervisors can create global macros.</p>
        )}
      </div>

      {mutation.error && (
        <ErrorAlert error={mutation.error} fallback={`Failed to ${isEdit ? "update" : "create"} macro`} />
      )}

      <div className="flex justify-end gap-2 pt-1">
        <Button type="submit" disabled={mutation.isPending} className="gap-2">
          {isEdit
            ? mutation.isPending ? "Saving…" : "Save Changes"
            : mutation.isPending ? "Creating…" : "Create Macro"}
        </Button>
      </div>
    </form>
  );
}

// ─── MacrosPage ────────────────────────────────────────────────────────────────

type DialogState =
  | { mode: "create" }
  | { mode: "edit"; macro: Macro }
  | { mode: "clone"; macro: Macro }
  | null;

type TabValue = "all" | "system" | "global" | "personal";

export default function MacrosPage() {
  const [dialog, setDialog] = useState<DialogState>(null);
  const [deleting, setDeleting] = useState<Macro | null>(null);
  const [tab, setTab] = useState<TabValue>("all");
  const [search, setSearch] = useState("");
  const queryClient = useQueryClient();
  const { data: session } = useSession();

  const { data, isLoading, error } = useQuery({
    queryKey: ["macros"],
    queryFn: async () => {
      const { data } = await axios.get<{ macros: Macro[] }>("/api/macros");
      return data.macros;
    },
  });

  const seedMutation = useMutation({
    mutationFn: () => axios.post("/api/macros/seed-system"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["macros"] }),
  });

  const cloneMutation = useMutation({
    mutationFn: (id: number) => axios.post(`/api/macros/${id}/clone`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["macros"] });
      setDialog(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => axios.delete(`/api/macros/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["macros"] });
      setDeleting(null);
    },
  });

  const userId = session?.user?.id;
  const userRole = (session?.user as any)?.role as string | undefined;
  const canManage = userRole === "admin" || userRole === "supervisor";

  const allMacros = data ?? [];
  const systemCount = allMacros.filter((m) => m.isSystem).length;
  const globalCount = allMacros.filter((m) => !m.isSystem && m.visibility === "global").length;
  const personalCount = allMacros.filter((m) => m.visibility === "personal").length;

  const filtered = allMacros.filter((m) => {
    const matchesTab =
      tab === "all" ||
      (tab === "system" && m.isSystem) ||
      (tab === "global" && !m.isSystem && m.visibility === "global") ||
      (tab === "personal" && m.visibility === "personal");

    const q = search.trim().toLowerCase();
    const matchesSearch =
      !q ||
      m.title.toLowerCase().includes(q) ||
      m.body.toLowerCase().includes(q);

    return matchesTab && matchesSearch;
  });

  const close = () => setDialog(null);

  const dialogTitle =
    dialog?.mode === "edit" ? "Edit Macro"
    : dialog?.mode === "clone" ? "Clone Macro"
    : "New Macro";

  const dialogDescription =
    dialog?.mode === "edit"
      ? "Update the title, body, category, or visibility of this macro."
      : dialog?.mode === "clone"
      ? "A personal copy of this macro will be created for you to customise."
      : "Create a reusable reply template for your team or yourself.";

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2.5">
              <div className="p-1.5 rounded-lg bg-primary/10">
                <Zap className="h-5 w-5 text-primary" />
              </div>
              Macros
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Saved reply templates that agents can insert into the composer — with smart variable substitution.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {canManage && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={() => seedMutation.mutate()}
                    disabled={seedMutation.isPending}
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    {seedMutation.isPending ? "Loading…" : "Load System Macros"}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Seed curated system macros for your service desk</TooltipContent>
              </Tooltip>
            )}
            <Button onClick={() => setDialog({ mode: "create" })} className="gap-2">
              <Plus className="h-4 w-4" />
              New Macro
            </Button>
          </div>
        </div>

        {seedMutation.isSuccess && (
          <div className="rounded-lg border border-green-500/30 bg-green-50 dark:bg-green-950/20 px-4 py-3 text-sm text-green-700 dark:text-green-400">
            <strong>System macros loaded.</strong>{" "}
            {(seedMutation.data?.data as any)?.created ?? 0} created,{" "}
            {(seedMutation.data?.data as any)?.skipped ?? 0} already existed.
          </div>
        )}

        {error && <ErrorAlert message="Failed to load macros" />}

        {/* Filters */}
        <div className="flex items-center gap-4">
          <Tabs value={tab} onValueChange={(v) => setTab(v as TabValue)}>
            <TabsList className="h-9">
              <TabsTrigger value="all" className="text-xs gap-1.5">
                All
                <span className="text-[10px] bg-muted rounded-full px-1.5 py-0.5 tabular-nums">{allMacros.length}</span>
              </TabsTrigger>
              <TabsTrigger value="system" className="text-xs gap-1.5">
                <Shield className="h-3 w-3" />
                System
                <span className="text-[10px] bg-muted rounded-full px-1.5 py-0.5 tabular-nums">{systemCount}</span>
              </TabsTrigger>
              <TabsTrigger value="global" className="text-xs gap-1.5">
                <Globe className="h-3 w-3" />
                Global
                <span className="text-[10px] bg-muted rounded-full px-1.5 py-0.5 tabular-nums">{globalCount}</span>
              </TabsTrigger>
              <TabsTrigger value="personal" className="text-xs gap-1.5">
                <Lock className="h-3 w-3" />
                Personal
                <span className="text-[10px] bg-muted rounded-full px-1.5 py-0.5 tabular-nums">{personalCount}</span>
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="relative flex-1 max-w-72">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search macros…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-9 text-sm"
            />
          </div>
        </div>

        {/* Table */}
        <div className="rounded-xl border border-border/60 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">Title</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">Category</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">Preview</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">Visibility</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">Status</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">Created by</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 7 }).map((__, j) => (
                        <TableCell key={j}><Skeleton className="h-4 w-full max-w-[120px]" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                : filtered.map((macro) => {
                    const isOwner = macro.createdById === userId;
                    const canEdit = canManage || (isOwner && macro.visibility === "personal");
                    const canDelete = !macro.isSystem && (canManage || (isOwner && macro.visibility === "personal"));

                    return (
                      <TableRow
                        key={macro.id}
                        className={[
                          !macro.isActive ? "opacity-50" : "",
                          macro.isSystem ? "bg-violet-50/30 dark:bg-violet-950/10" : "",
                        ].join(" ")}
                      >
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm">{macro.title}</span>
                            {macro.isSystem && <SystemBadge />}
                          </div>
                        </TableCell>
                        <TableCell>
                          {macro.category ? (
                            <Badge variant="secondary" className="text-[11px]">{categoryLabel[macro.category]}</Badge>
                          ) : (
                            <span className="text-muted-foreground text-sm">—</span>
                          )}
                        </TableCell>
                        <TableCell className="max-w-[260px]">
                          <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                            {macro.body}
                          </p>
                        </TableCell>
                        <TableCell>
                          <VisibilityBadge visibility={macro.visibility} />
                        </TableCell>
                        <TableCell>
                          <Badge variant={macro.isActive ? "default" : "outline"} className="text-[11px]">
                            {macro.isActive ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {macro.createdBy.name}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 justify-end">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                  onClick={() => setDialog({ mode: "clone", macro })}
                                >
                                  <Copy className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Clone macro</TooltipContent>
                            </Tooltip>

                            {canEdit && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                    onClick={() => setDialog({ mode: "edit", macro })}
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Edit macro</TooltipContent>
                              </Tooltip>
                            )}

                            {canDelete && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                    onClick={() => setDeleting(macro)}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Delete macro</TooltipContent>
                              </Tooltip>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}

              {!isLoading && filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-16 text-muted-foreground">
                    <BookOpen className="h-8 w-8 mx-auto mb-3 opacity-20" />
                    <p className="text-sm font-medium">
                      {search ? "No macros match your search." : "No macros in this view."}
                    </p>
                    {!search && tab === "system" && canManage && (
                      <p className="text-xs mt-1">
                        Click <strong>Load System Macros</strong> to seed curated service desk templates.
                      </p>
                    )}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {/* Create / Edit / Clone dialog */}
        <Dialog open={dialog !== null} onOpenChange={(open) => { if (!open) close(); }}>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {dialog?.mode === "clone" && <Copy className="h-4 w-4 text-muted-foreground" />}
                {dialog?.mode === "edit" && <Pencil className="h-4 w-4 text-muted-foreground" />}
                {dialog?.mode === "create" && <Plus className="h-4 w-4 text-muted-foreground" />}
                {dialogTitle}
              </DialogTitle>
              <DialogDescription>{dialogDescription}</DialogDescription>
            </DialogHeader>

            {dialog?.mode === "clone" ? (
              <div className="space-y-4">
                <div className="rounded-lg border bg-muted/30 p-4 space-y-1">
                  <p className="text-sm font-medium">{dialog.macro.title}</p>
                  <p className="text-xs text-muted-foreground line-clamp-3">{dialog.macro.body}</p>
                </div>
                <p className="text-sm text-muted-foreground">
                  A personal copy named <strong>"Copy of {dialog.macro.title}"</strong> will be created.
                  You can then edit it freely without affecting the original.
                </p>
                {cloneMutation.error && (
                  <ErrorAlert error={cloneMutation.error} fallback="Failed to clone macro" />
                )}
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={close}>Cancel</Button>
                  <Button
                    onClick={() => cloneMutation.mutate(dialog.macro.id)}
                    disabled={cloneMutation.isPending}
                    className="gap-2"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    {cloneMutation.isPending ? "Cloning…" : "Clone & Edit Later"}
                  </Button>
                </div>
              </div>
            ) : (
              <MacroForm
                key={dialog?.mode === "edit" ? dialog.macro.id : "create"}
                macro={dialog?.mode === "edit" ? dialog.macro : undefined}
                onSuccess={close}
                canManage={canManage}
              />
            )}
          </DialogContent>
        </Dialog>

        {/* Delete confirm */}
        <AlertDialog
          open={deleting !== null}
          onOpenChange={(open) => { if (!open) { setDeleting(null); deleteMutation.reset(); } }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete macro?</AlertDialogTitle>
              <AlertDialogDescription>
                <strong>{deleting?.title}</strong> will be permanently deleted. This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            {deleteMutation.isError && <ErrorAlert message="Failed to delete macro" />}
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-white hover:bg-destructive/90"
                onClick={() => deleting && deleteMutation.mutate(deleting.id)}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  );
}
