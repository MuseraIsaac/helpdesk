import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { createTemplateSchema, type CreateTemplateInput } from "core/schemas/templates.ts";
import { templateTypeLabel } from "core/constants/template.ts";
import type { TemplateType } from "core/constants/template.ts";
import { TEMPLATE_VARIABLES } from "@/lib/template-variables";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import ErrorAlert from "@/components/ErrorAlert";
import ErrorMessage from "@/components/ErrorMessage";
import { BookmarkPlus, CheckCircle2 } from "lucide-react";

// ── Variable picker ───────────────────────────────────────────────────────────

function VariablePicker({ type, onInsert }: { type: TemplateType; onInsert: (key: string) => void }) {
  const variables = TEMPLATE_VARIABLES[type] ?? [];
  if (!variables.length) return null;
  const groups = Array.from(new Set(variables.map((v) => v.group)));

  return (
    <div className="rounded-lg border border-border/60 bg-muted/30 p-3 space-y-3">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
        Variables — click to insert
      </p>
      <div className="max-h-36 overflow-y-auto space-y-2.5 pr-1">
        {groups.map((group) => (
          <div key={group}>
            <p className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wider mb-1">
              {group}
            </p>
            <div className="flex flex-wrap gap-1">
              {variables
                .filter((v) => v.group === group)
                .map((v) => (
                  <button
                    key={v.key}
                    type="button"
                    title={v.description}
                    onClick={() => onInsert(v.key)}
                    className="inline-flex items-center font-mono text-[10px] bg-background border rounded px-1.5 py-0.5 hover:bg-accent hover:border-ring transition-colors"
                  >
                    {v.key}
                  </button>
                ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main dialog ───────────────────────────────────────────────────────────────

export interface SaveAsTemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: TemplateType;
  defaultTitle?: string;
  defaultBody?: string;
}

export default function SaveAsTemplateDialog({
  open,
  onOpenChange,
  type,
  defaultTitle = "",
  defaultBody = "",
}: SaveAsTemplateDialogProps) {
  const queryClient = useQueryClient();
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);
  const [saved, setSaved] = useState(false);

  const form = useForm<CreateTemplateInput>({
    resolver: zodResolver(createTemplateSchema),
    defaultValues: { title: defaultTitle, body: defaultBody, type, isActive: true },
  });

  const mutation = useMutation({
    mutationFn: async (payload: CreateTemplateInput) => {
      const { data } = await axios.post("/api/templates", payload);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["templates"] });
      setSaved(true);
      setTimeout(() => {
        setSaved(false);
        form.reset({ title: "", body: "", type, isActive: true });
        mutation.reset();
        onOpenChange(false);
      }, 1400);
    },
  });

  function insertVariable(key: string) {
    const el = bodyRef.current;
    const current = form.getValues("body") ?? "";
    if (!el) {
      form.setValue("body", current + key, { shouldValidate: true });
      return;
    }
    const start = el.selectionStart ?? current.length;
    const end = el.selectionEnd ?? current.length;
    const next = current.slice(0, start) + key + current.slice(end);
    form.setValue("body", next, { shouldValidate: true });
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + key.length;
      el.setSelectionRange(pos, pos);
    });
  }

  function handleClose(open: boolean) {
    if (!open) {
      form.reset({ title: defaultTitle, body: defaultBody, type, isActive: true });
      mutation.reset();
      setSaved(false);
    }
    onOpenChange(open);
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookmarkPlus className="h-4 w-4 text-primary" />
            Save as Template
          </DialogTitle>
          <DialogDescription>
            Save this content as a reusable{" "}
            <span className="font-medium text-foreground">{templateTypeLabel[type]}</span> template.
            Use variables like{" "}
            <code className="text-[11px] bg-muted px-1 py-0.5 rounded">{"{{ticket.number}}"}</code> as placeholders.
          </DialogDescription>
        </DialogHeader>

        {saved ? (
          <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
            <CheckCircle2 className="h-12 w-12 text-emerald-500" />
            <p className="font-semibold text-lg">Template saved!</p>
            <p className="text-sm text-muted-foreground">
              Your template is now available in the Templates library.
            </p>
          </div>
        ) : (
          <form
            onSubmit={form.handleSubmit((d) => mutation.mutate(d))}
            className="space-y-4 mt-1"
          >
            {/* Type badge (read-only) */}
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Type:</span>
              <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium bg-primary/10 text-primary border-primary/20">
                {templateTypeLabel[type]}
              </span>
            </div>

            {/* Title */}
            <div className="space-y-1.5">
              <Label htmlFor="tmpl-title">Template name <span className="text-destructive">*</span></Label>
              <Input
                id="tmpl-title"
                placeholder="e.g. Standard acknowledgement reply"
                autoFocus
                {...form.register("title")}
              />
              {form.formState.errors.title && (
                <ErrorMessage message={form.formState.errors.title.message} />
              )}
            </div>

            {/* Body */}
            <div className="space-y-1.5">
              <Label htmlFor="tmpl-body">Content <span className="text-destructive">*</span></Label>
              <Textarea
                id="tmpl-body"
                rows={8}
                placeholder="Template content… Replace specific values with variables from the picker below."
                {...form.register("body")}
                ref={(el) => {
                  form.register("body").ref(el);
                  bodyRef.current = el;
                }}
                className="font-mono text-sm resize-y"
              />
              {form.formState.errors.body && (
                <ErrorMessage message={form.formState.errors.body.message} />
              )}
              <VariablePicker type={type} onInsert={insertVariable} />
            </div>

            {mutation.error && (
              <ErrorAlert error={mutation.error} fallback="Failed to save template" />
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" onClick={() => handleClose(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={mutation.isPending} className="gap-2">
                {mutation.isPending ? (
                  <>
                    <span className="h-3.5 w-3.5 rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground animate-spin" />
                    Saving…
                  </>
                ) : (
                  <>
                    <BookmarkPlus className="h-3.5 w-3.5" />
                    Save Template
                  </>
                )}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
