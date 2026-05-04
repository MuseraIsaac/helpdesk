import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import {
  createTemplateSchema,
  type CreateTemplateInput,
  TEMPLATE_VISIBILITIES,
  TEMPLATE_VISIBILITY_LABEL,
  TEMPLATE_VISIBILITY_DESCRIPTION,
  type TemplateVisibility,
  type TemplateFields,
} from "core/schemas/templates.ts";
import type { TemplateType } from "core/constants/template.ts";
import { TEMPLATE_VARIABLES } from "@/lib/template-variables";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import ErrorAlert from "@/components/ErrorAlert";
import ErrorMessage from "@/components/ErrorMessage";
import {
  BookmarkPlus, CheckCircle2, Lock, Users, Globe, Trash2, Loader2, Sparkles, X, Plus,
} from "lucide-react";

// ── Variable picker ───────────────────────────────────────────────────────────
//
// Every variable is visible up front — no scroll cap. Each chip is a toggle:
//   ● present in body → click removes every occurrence
//   ○ absent from body → click inserts at the caret
//
// Templates start blank (or with whatever the agent has typed) so they don't
// pre-seed the body with raw `{{…}}` placeholders that would surface as
// literal text on a fresh ticket form before substitution can run.

function VariablePicker({
  type,
  body,
  onInsert,
  onRemove,
}: {
  type: TemplateType;
  body: string;
  onInsert: (key: string) => void;
  onRemove: (key: string) => void;
}) {
  const variables = TEMPLATE_VARIABLES[type] ?? [];
  if (!variables.length) return null;
  const groups = Array.from(new Set(variables.map((v) => v.group)));

  return (
    <div className="rounded-lg border border-border/60 bg-gradient-to-br from-muted/40 to-muted/10 p-3 space-y-3">
      <div className="flex items-center gap-1.5">
        <Sparkles className="h-3 w-3 text-primary" />
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          Variables — click to toggle
        </p>
        <span className="text-[10px] text-muted-foreground/70 ml-auto">
          click to insert · click again to remove
        </span>
      </div>
      <div className="space-y-2.5 pr-1">
        {groups.map((group) => (
          <div key={group}>
            <p className="text-[10px] font-semibold text-muted-foreground/80 uppercase tracking-wider mb-1.5">
              {group}
            </p>
            <div className="flex flex-wrap gap-1">
              {variables
                .filter((v) => v.group === group)
                .map((v) => {
                  const inBody = body.includes(v.key);
                  return (
                    <button
                      key={v.key}
                      type="button"
                      title={inBody ? `Remove ${v.key} from the template` : `Insert ${v.key} at the caret`}
                      onClick={() => (inBody ? onRemove(v.key) : onInsert(v.key))}
                      className={[
                        "group/chip inline-flex items-center gap-1 font-mono text-[10px] rounded-md px-1.5 py-0.5 border transition-colors",
                        inBody
                          ? "bg-primary/10 border-primary/40 text-primary hover:bg-destructive/10 hover:border-destructive/40 hover:text-destructive"
                          : "bg-background border-border text-muted-foreground hover:bg-primary/10 hover:border-primary/40 hover:text-primary",
                      ].join(" ")}
                    >
                      <span>{v.key}</span>
                      {inBody ? (
                        <X className="h-2.5 w-2.5 opacity-60 group-hover/chip:opacity-100" />
                      ) : (
                        <Plus className="h-2.5 w-2.5 opacity-50 group-hover/chip:opacity-100" />
                      )}
                    </button>
                  );
                })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Remove every occurrence of a variable key (and any surrounding whitespace
 *  it leaves behind) from the body. */
function stripVariable(body: string, key: string): string {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return body.replace(new RegExp(`${escaped}[ \\t]*`, "g"), "");
}

// ── Visibility selector ───────────────────────────────────────────────────────

const VISIBILITY_ICON: Record<TemplateVisibility, React.ElementType> = {
  private:  Lock,
  team:     Users,
  everyone: Globe,
};

function VisibilitySelector({
  value,
  onChange,
}: {
  value: TemplateVisibility;
  onChange: (v: TemplateVisibility) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {TEMPLATE_VISIBILITIES.map((v) => {
        const Icon = VISIBILITY_ICON[v];
        const active = value === v;
        return (
          <button
            key={v}
            type="button"
            onClick={() => onChange(v)}
            className={`group flex items-center gap-2 rounded-lg border px-3 py-2 text-left transition-all ${
              active
                ? "border-primary bg-primary/[0.08] text-primary shadow-sm"
                : "border-border bg-card hover:border-primary/40 hover:bg-muted/40"
            }`}
            title={TEMPLATE_VISIBILITY_DESCRIPTION[v]}
          >
            <Icon className={`h-3.5 w-3.5 shrink-0 ${active ? "text-primary" : "text-muted-foreground"}`} />
            <span className="text-xs font-semibold leading-none">
              {TEMPLATE_VISIBILITY_LABEL[v]}
            </span>
          </button>
        );
      })}
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
  /** Snapshot of the source ticket's structured fields. Persisted as
   *  template.fields and replayed onto the new ticket form when the
   *  template is later applied. Pass an empty object for "no fields". */
  defaultFields?: TemplateFields;
}

interface TeamOption { id: number; name: string; color?: string | null }

interface CreatedTemplate { id: number; title: string }

export default function SaveAsTemplateDialog({
  open,
  onOpenChange,
  type,
  defaultTitle = "",
  defaultBody = "",
  defaultFields,
}: SaveAsTemplateDialogProps) {
  const queryClient = useQueryClient();
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);
  const [savedTemplate, setSavedTemplate] = useState<CreatedTemplate | null>(null);
  const [deleted,       setDeleted]       = useState(false);

  // The body starts at whatever was passed in (typically the agent's
  // current draft). We do NOT pre-fill it with a dump of every variable —
  // applying such a template to a fresh ticket form would surface the
  // unresolved `{{ticket.subject}}` placeholders as literal text. The
  // variable picker below handles insertion at the caret on demand.
  const form = useForm<CreateTemplateInput>({
    resolver: zodResolver(createTemplateSchema),
    defaultValues: {
      title:      defaultTitle,
      body:       defaultBody,
      type,
      isActive:   true,
      visibility: "private",
      teamId:     null,
      fields:     defaultFields ?? {},
    },
  });

  const watchedBody = form.watch("body") ?? "";

  const visibility = form.watch("visibility");

  // Teams list — only fetched when the user actually picks "Team" so the
  // dialog opens fast for the common private/everyone cases.
  const teamsQuery = useQuery({
    queryKey: ["teams"],
    queryFn: async () => {
      const { data } = await axios.get<{ teams: TeamOption[] }>("/api/teams");
      return data.teams;
    },
    enabled: visibility === "team",
  });

  const createMutation = useMutation({
    mutationFn: async (payload: CreateTemplateInput) => {
      const { data } = await axios.post<CreatedTemplate>("/api/templates", payload);
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["templates"] });
      setSavedTemplate({ id: data.id, title: data.title });
    },
  });

  // Owner can immediately undo a save without leaving the dialog. The
  // server's permission gate already restricts deletion to author/admin.
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await axios.delete(`/api/templates/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["templates"] });
      setDeleted(true);
      setSavedTemplate(null);
    },
  });

  function removeVariable(key: string) {
    const current = form.getValues("body") ?? "";
    const next = stripVariable(current, key);
    form.setValue("body", next, { shouldValidate: true });
  }

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
      form.reset({
        title: defaultTitle, body: defaultBody, type, isActive: true,
        visibility: "private", teamId: null,
        fields: defaultFields ?? {},
      });
      createMutation.reset();
      deleteMutation.reset();
      setSavedTemplate(null);
      setDeleted(false);
    }
    onOpenChange(open);
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-xl max-h-[92vh] overflow-y-auto p-0 gap-0">

        {/* ── Hero header ──────────────────────────────────────────────── */}
        <div className="px-6 pt-6 pb-4 border-b bg-gradient-to-br from-primary/[0.06] via-primary/[0.02] to-transparent">
          <DialogHeader className="space-y-1.5">
            <DialogTitle className="flex items-center gap-2.5 text-base">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-primary/30 bg-primary/10">
                <BookmarkPlus className="h-4 w-4 text-primary" />
              </span>
              Save as Template
            </DialogTitle>
            <DialogDescription className="text-xs leading-relaxed pl-[42px]">
              Save reusable content with placeholders like{" "}
              <code className="text-[10px] bg-background border rounded px-1 py-0.5 font-mono">{"{{ticket.subject}}"}</code>{" "}
              that auto-fill when the template is applied.
            </DialogDescription>
          </DialogHeader>
        </div>

        {/* ── Body ─────────────────────────────────────────────────────── */}
        <div className="px-6 py-5">

          {deleted ? (
            <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted/60 border">
                <Trash2 className="h-5 w-5 text-muted-foreground" />
              </span>
              <p className="font-semibold">Template deleted</p>
              <p className="text-xs text-muted-foreground max-w-xs">
                The template has been removed. You can save a new one at any time.
              </p>
              <Button size="sm" variant="outline" className="mt-1" onClick={() => handleClose(false)}>
                Close
              </Button>
            </div>
          ) : savedTemplate ? (
            <div className="flex flex-col items-center justify-center py-8 gap-3 text-center">
              <CheckCircle2 className="h-12 w-12 text-emerald-500" />
              <div>
                <p className="font-semibold text-base">Template saved!</p>
                <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                  <span className="font-medium text-foreground">{savedTemplate.title}</span> is now available in your Templates library.
                </p>
              </div>
              <div className="flex items-center gap-2 mt-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/5 hover:border-destructive/30"
                  disabled={deleteMutation.isPending}
                  onClick={() => {
                    if (window.confirm(`Delete "${savedTemplate.title}"? This cannot be undone.`)) {
                      deleteMutation.mutate(savedTemplate.id);
                    }
                  }}
                >
                  {deleteMutation.isPending
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <Trash2 className="h-3.5 w-3.5" />}
                  Delete this template
                </Button>
                <Button size="sm" onClick={() => handleClose(false)}>
                  Done
                </Button>
              </div>
              {deleteMutation.error && (
                <ErrorAlert error={deleteMutation.error} fallback="Couldn't delete template" />
              )}
            </div>
          ) : (
            <form
              onSubmit={form.handleSubmit((d) => createMutation.mutate(d))}
              className="space-y-4"
            >
              {/* Title */}
              <div className="space-y-1.5">
                <Label htmlFor="tmpl-title" className="text-xs font-semibold">
                  Template name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="tmpl-title"
                  placeholder="e.g. Standard acknowledgement reply"
                  autoFocus
                  className="h-9"
                  {...form.register("title")}
                />
                {form.formState.errors.title && (
                  <ErrorMessage message={form.formState.errors.title.message} />
                )}
              </div>

              {/* Captured field summary — only when there are any fields
                  to capture so the dialog stays clean for plain text
                  templates. Each chip is a non-interactive badge showing
                  what's about to be persisted. */}
              {defaultFields && Object.values(defaultFields).some((v) => v != null && v !== "") && (
                <div className="rounded-lg border border-emerald-300/40 bg-emerald-500/[0.04] p-3 space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                    <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
                      Ticket fields captured
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {Object.entries(defaultFields)
                      .filter(([, v]) => v != null && v !== "" && (typeof v !== "object" || Object.keys(v as object).length > 0))
                      .map(([k, v]) => (
                        <span
                          key={k}
                          className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-background px-1.5 py-0.5 text-[10px]"
                          title={`${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`}
                        >
                          <span className="font-semibold text-muted-foreground">{k}</span>
                          <span className="text-foreground/80 truncate max-w-[140px]">
                            {typeof v === "object" ? "…" : String(v)}
                          </span>
                        </span>
                      ))}
                  </div>
                  <p className="text-[10px] text-muted-foreground/80">
                    These will be applied to the new ticket alongside the body.
                  </p>
                </div>
              )}

              {/* Body */}
              <div className="space-y-1.5">
                <Label htmlFor="tmpl-body" className="text-xs font-semibold">
                  Content <span className="text-destructive">*</span>
                </Label>
                <Textarea
                  id="tmpl-body"
                  rows={7}
                  placeholder="Template content… use the variables below as placeholders."
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
                <VariablePicker
                  type={type}
                  body={watchedBody}
                  onInsert={insertVariable}
                  onRemove={removeVariable}
                />
              </div>

              {/* Visibility */}
              <div className="space-y-2 pt-1">
                <div className="flex items-baseline justify-between gap-2 flex-wrap">
                  <Label className="text-xs font-semibold">
                    Who can use this template?
                  </Label>
                  <span className="text-[10px] text-muted-foreground">
                    {TEMPLATE_VISIBILITY_DESCRIPTION[visibility ?? "private"]}
                  </span>
                </div>
                <VisibilitySelector
                  value={visibility ?? "private"}
                  onChange={(v) => {
                    form.setValue("visibility", v, { shouldValidate: true });
                    if (v !== "team") form.setValue("teamId", null);
                  }}
                />
                {visibility === "team" && (
                  <div className="space-y-1.5 pt-1">
                    <Label htmlFor="tmpl-team" className="text-[11px] font-semibold text-muted-foreground">
                      Team
                    </Label>
                    <Select
                      value={form.watch("teamId") != null ? String(form.watch("teamId")) : ""}
                      onValueChange={(v) => form.setValue("teamId", v ? Number(v) : null, { shouldValidate: true })}
                    >
                      <SelectTrigger id="tmpl-team" className="h-9">
                        <SelectValue placeholder={teamsQuery.isLoading ? "Loading teams…" : "Pick a team"} />
                      </SelectTrigger>
                      <SelectContent>
                        {(teamsQuery.data ?? []).map((t) => (
                          <SelectItem key={t.id} value={String(t.id)}>
                            <span className="inline-flex items-center gap-2">
                              {t.color && (
                                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: t.color }} />
                              )}
                              {t.name}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {form.formState.errors.teamId && (
                      <ErrorMessage message={form.formState.errors.teamId.message} />
                    )}
                  </div>
                )}
              </div>

              {createMutation.error && (
                <ErrorAlert error={createMutation.error} fallback="Failed to save template" />
              )}

              <div className="flex justify-end gap-2 pt-2 border-t">
                <Button type="button" variant="outline" onClick={() => handleClose(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createMutation.isPending} className="gap-1.5">
                  {createMutation.isPending ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
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
        </div>
      </DialogContent>
    </Dialog>
  );
}
