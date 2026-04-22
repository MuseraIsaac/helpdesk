import { useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod/v4";
import axios from "axios";
import { type MacroVisibility } from "core/constants/macro.ts";
import { categoryLabel } from "core/constants/ticket-category.ts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import ErrorAlert from "@/components/ErrorAlert";
import ErrorMessage from "@/components/ErrorMessage";
import { BookmarkPlus, Globe, Lock, CheckCircle2 } from "lucide-react";

// Only the fields the user fills in — body comes from the prop directly
const saveMacroFormSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(120, "Title must be 120 characters or fewer"),
  category: z.enum(["general_question", "technical_question", "refund_request"]).optional().nullable(),
  visibility: z.enum(["global", "personal"]).default("personal"),
});

type SaveMacroFormValues = z.infer<typeof saveMacroFormSchema>;

interface SaveMacroDialogProps {
  open: boolean;
  onClose: () => void;
  bodyText: string;
  canManage: boolean;
}

export default function SaveMacroDialog({ open, onClose, bodyText, canManage }: SaveMacroDialogProps) {
  const queryClient = useQueryClient();

  const form = useForm<SaveMacroFormValues>({
    resolver: zodResolver(saveMacroFormSchema) as any,
    defaultValues: {
      title: "",
      category: undefined,
      visibility: canManage ? "global" : "personal",
    },
  });

  // Reset form each time the dialog opens
  useEffect(() => {
    if (open) {
      form.reset({
        title: "",
        category: undefined,
        visibility: canManage ? "global" : "personal",
      });
      mutation.reset();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const mutation = useMutation({
    mutationFn: async (values: SaveMacroFormValues) => {
      const { data: macro } = await axios.post("/api/macros", {
        title: values.title,
        body: bodyText,          // injected from prop, not form state
        category: values.category ?? null,
        isActive: true,
        visibility: values.visibility,
      });
      return macro;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["macros"] });
    },
  });

  function handleClose() {
    form.reset();
    mutation.reset();
    onClose();
  }

  if (mutation.isSuccess) {
    return (
      <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
        <DialogContent className="max-w-sm">
          <div className="flex flex-col items-center text-center py-6 gap-3">
            <div className="rounded-full bg-green-100 dark:bg-green-900/30 p-3">
              <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="font-semibold">Macro saved!</p>
              <p className="text-sm text-muted-foreground mt-1">
                <strong>{(mutation.data as any)?.title}</strong> is now available in your macro library.
              </p>
            </div>
            <Button onClick={handleClose} className="mt-2">Done</Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookmarkPlus className="h-4 w-4 text-primary" />
            Save as Macro
          </DialogTitle>
          <DialogDescription>
            Save your current reply as a reusable macro for future tickets.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label htmlFor="macro-title">Title</Label>
            <Input
              id="macro-title"
              autoFocus
              placeholder="e.g. Password Reset Instructions"
              {...form.register("title")}
            />
            {form.formState.errors.title && (
              <ErrorMessage message={form.formState.errors.title.message} />
            )}
          </div>

          {/* Read-only preview of the body */}
          <div className="rounded-md border bg-muted/30 px-3 py-2.5 space-y-1">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/60">Body preview</p>
            <p className="text-xs text-muted-foreground line-clamp-4 whitespace-pre-wrap leading-relaxed">
              {bodyText}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Category</Label>
              <Select
                defaultValue="__none__"
                onValueChange={(v) =>
                  form.setValue("category", v === "__none__" ? undefined : (v as any), { shouldValidate: true })
                }
              >
                <SelectTrigger className="text-sm">
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
              <Label>Visibility</Label>
              <Select
                defaultValue={canManage ? "global" : "personal"}
                onValueChange={(v) => form.setValue("visibility", v as MacroVisibility, { shouldValidate: true })}
                disabled={!canManage}
              >
                <SelectTrigger className="text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {canManage && (
                    <SelectItem value="global">
                      <span className="flex items-center gap-2">
                        <Globe className="h-3 w-3 text-blue-500" />
                        Global
                      </span>
                    </SelectItem>
                  )}
                  <SelectItem value="personal">
                    <span className="flex items-center gap-2">
                      <Lock className="h-3 w-3 text-amber-500" />
                      Personal
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
              {!canManage && (
                <p className="text-[10px] text-muted-foreground">Saved as personal only</p>
              )}
            </div>
          </div>

          {mutation.error && (
            <ErrorAlert error={mutation.error} fallback="Failed to save macro" />
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending} className="gap-2">
              <BookmarkPlus className="h-3.5 w-3.5" />
              {mutation.isPending ? "Saving…" : "Save Macro"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
