import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { type Macro } from "core/constants/macro.ts";
import { categoryLabel } from "core/constants/ticket-category.ts";
import { type CreateMacroInput, type UpdateMacroInput } from "core/schemas/macros.ts";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createMacroSchema, updateMacroSchema } from "core/schemas/macros.ts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
import { MACRO_VARIABLES } from "@/lib/macro-variables";
import { Plus, Pencil, Trash2, BookOpen } from "lucide-react";

// ─── MacroForm ─────────────────────────────────────────────────────────────────

interface MacroFormProps {
  macro?: Macro;
  onSuccess: () => void;
}

function MacroForm({ macro, onSuccess }: MacroFormProps) {
  const isEdit = !!macro;
  const queryClient = useQueryClient();

  const form = useForm<CreateMacroInput>({
    resolver: zodResolver(isEdit ? updateMacroSchema : createMacroSchema) as any,
    defaultValues: {
      title: macro?.title ?? "",
      body: macro?.body ?? "",
      category: macro?.category ?? undefined,
      isActive: macro?.isActive ?? true,
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
    <form
      onSubmit={form.handleSubmit((d) => mutation.mutate(d))}
      className="space-y-4"
    >
      <div className="space-y-2">
        <Label htmlFor="title">Title</Label>
        <Input
          id="title"
          placeholder="e.g. Greeting — Thanks for reaching out"
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
          rows={6}
          {...form.register("body")}
        />
        {form.formState.errors.body && (
          <ErrorMessage message={form.formState.errors.body.message} />
        )}
        {/* Variable hint */}
        <div className="rounded-md border bg-muted/40 px-3 py-2 space-y-1">
          <p className="text-[11px] font-medium text-muted-foreground">Available variables:</p>
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {MACRO_VARIABLES.map((v) => (
              <span key={v.key} className="text-[11px] text-muted-foreground">
                <code className="font-mono bg-background border rounded px-1">{v.key}</code>{" "}
                — {v.description}
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
              form.setValue("category", v === "__none__" ? undefined : (v as any), {
                shouldValidate: true,
              })
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
            onValueChange={(v) =>
              form.setValue("isActive", v === "active", { shouldValidate: true })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {mutation.error && (
        <ErrorAlert
          error={mutation.error}
          fallback={`Failed to ${isEdit ? "update" : "create"} macro`}
        />
      )}

      <div className="flex justify-end">
        <Button type="submit" disabled={mutation.isPending}>
          {isEdit
            ? mutation.isPending ? "Saving..." : "Save Changes"
            : mutation.isPending ? "Creating..." : "Create Macro"}
        </Button>
      </div>
    </form>
  );
}

// ─── MacrosPage ────────────────────────────────────────────────────────────────

type DialogState =
  | { mode: "create" }
  | { mode: "edit"; macro: Macro }
  | null;

export default function MacrosPage() {
  const [dialog, setDialog] = useState<DialogState>(null);
  const [deleting, setDeleting] = useState<Macro | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["macros"],
    queryFn: async () => {
      const { data } = await axios.get<{ macros: Macro[] }>("/api/macros");
      return data.macros;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => axios.delete(`/api/macros/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["macros"] });
      setDeleting(null);
    },
  });

  const close = () => setDialog(null);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Macros</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Saved reply templates agents can insert into the reply composer.
          </p>
        </div>
        <Button onClick={() => setDialog({ mode: "create" })}>
          <Plus className="mr-2 h-4 w-4" />
          New Macro
        </Button>
      </div>

      {error && <ErrorAlert message="Failed to load macros" />}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Title</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Preview</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Created by</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading
            ? Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 6 }).map((__, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-24" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            : (data ?? []).map((macro) => (
                <TableRow key={macro.id} className={!macro.isActive ? "opacity-50" : ""}>
                  <TableCell className="font-medium">{macro.title}</TableCell>
                  <TableCell>
                    {macro.category ? (
                      <Badge variant="secondary">{categoryLabel[macro.category]}</Badge>
                    ) : (
                      <span className="text-muted-foreground text-sm">—</span>
                    )}
                  </TableCell>
                  <TableCell className="max-w-[280px]">
                    <p className="text-sm text-muted-foreground truncate">{macro.body}</p>
                  </TableCell>
                  <TableCell>
                    <Badge variant={macro.isActive ? "default" : "outline"}>
                      {macro.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {macro.createdBy.name}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1 justify-end">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setDialog({ mode: "edit", macro })}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={() => setDeleting(macro)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}

          {!isLoading && (data ?? []).length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                <BookOpen className="h-8 w-8 mx-auto mb-3 opacity-30" />
                <p className="text-sm">No macros yet. Create your first one to get started.</p>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      {/* Create / Edit dialog */}
      <Dialog
        open={dialog !== null}
        onOpenChange={(open) => { if (!open) close(); }}
      >
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {dialog?.mode === "edit" ? "Edit Macro" : "New Macro"}
            </DialogTitle>
          </DialogHeader>
          <MacroForm
            key={dialog?.mode === "edit" ? dialog.macro.id : "create"}
            macro={dialog?.mode === "edit" ? dialog.macro : undefined}
            onSuccess={close}
          />
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) { setDeleting(null); deleteMutation.reset(); }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete macro?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{deleting?.title}</strong> will be permanently deleted. Agents will no
              longer be able to insert it. This cannot be undone.
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
  );
}
