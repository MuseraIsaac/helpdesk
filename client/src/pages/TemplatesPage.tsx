import { useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  createTemplateSchema,
  updateTemplateSchema,
  TEMPLATE_VISIBILITIES,
  TEMPLATE_VISIBILITY_LABEL,
  TEMPLATE_VISIBILITY_DESCRIPTION,
  type TemplateVisibility,
} from "core/schemas/templates.ts";
import type { CreateTemplateInput, UpdateTemplateInput } from "core/schemas/templates.ts";
import { templateTypes, templateTypeLabel } from "core/constants/template.ts";
import type { TemplateType } from "core/constants/template.ts";
import { TEMPLATE_VARIABLES } from "@/lib/template-variables";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  Copy,
  Check,
  FileText,
  Ticket,
  Inbox,
  RefreshCw,
  Bug,
  BookOpen,
  Mail,
  BookMarked,
  Search,
  ChevronDown,
  ChevronUp,
  Lock,
  Users as UsersIcon,
  Globe,
} from "lucide-react";
import { useSession } from "@/lib/auth-client";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Template {
  id: number;
  title: string;
  body: string;
  bodyHtml?: string | null;
  type: TemplateType;
  isActive: boolean;
  visibility: TemplateVisibility;
  teamId: number | null;
  team: { id: number; name: string; color: string } | null;
  createdById: string;
  createdBy: { id: string; name: string };
  createdAt: string;
  updatedAt: string;
}

interface TeamOption { id: number; name: string; color: string }

// ── Helpers ───────────────────────────────────────────────────────────────────

const TAB_ICONS: Record<TemplateType, React.ReactNode> = {
  ticket:  <Ticket   className="h-3.5 w-3.5" />,
  request: <Inbox    className="h-3.5 w-3.5" />,
  change:  <RefreshCw className="h-3.5 w-3.5" />,
  problem: <Bug      className="h-3.5 w-3.5" />,
  article: <BookOpen className="h-3.5 w-3.5" />,
  email:   <Mail     className="h-3.5 w-3.5" />,
  macro:   <BookMarked className="h-3.5 w-3.5" />,
};

const TYPE_COLORS: Record<TemplateType, string> = {
  ticket:  "bg-blue-500/10 text-blue-700 border-blue-200",
  request: "bg-purple-500/10 text-purple-700 border-purple-200",
  change:  "bg-orange-500/10 text-orange-700 border-orange-200",
  problem: "bg-red-500/10 text-red-700 border-red-200",
  article: "bg-emerald-500/10 text-emerald-700 border-emerald-200",
  email:   "bg-sky-500/10 text-sky-700 border-sky-200",
  macro:   "bg-violet-500/10 text-violet-700 border-violet-200",
};

function VisibilityBadge({ template }: { template: Template }) {
  const v = template.visibility;
  const cls =
    v === "private"  ? "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-900/40 dark:text-slate-300" :
    v === "team"     ? "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300" :
                       "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300";
  const Icon = v === "private" ? Lock : v === "team" ? UsersIcon : Globe;
  const label =
    v === "team" && template.team
      ? template.team.name
      : TEMPLATE_VISIBILITY_LABEL[v];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${cls}`} title={TEMPLATE_VISIBILITY_DESCRIPTION[v]}>
      <Icon className="h-2.5 w-2.5" />
      {label}
    </span>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

// ── VariablePicker ────────────────────────────────────────────────────────────

function VariablePicker({ type, onInsert }: { type: TemplateType; onInsert: (k: string) => void }) {
  const variables = TEMPLATE_VARIABLES[type] ?? [];
  const groups = Array.from(new Set(variables.map((v) => v.group)));
  if (!variables.length) return null;
  return (
    <div className="rounded-lg border border-border/60 bg-muted/30 p-3 space-y-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
        Variables — click to insert
      </p>
      <div className="max-h-36 overflow-y-auto space-y-2 pr-1">
        {groups.map((group) => (
          <div key={group}>
            <p className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wider mb-1">{group}</p>
            <div className="flex flex-wrap gap-1">
              {variables.filter((v) => v.group === group).map((v) => (
                <button
                  key={v.key}
                  type="button"
                  title={v.description}
                  onClick={() => onInsert(v.key)}
                  className="font-mono text-[10px] bg-background border rounded px-1.5 py-0.5 hover:bg-accent hover:border-ring transition-colors"
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

// ── Template form (create / edit dialog) ──────────────────────────────────────

interface TemplateFormProps {
  template?: Template;
  defaultType: TemplateType;
  canManage: boolean;
  onSuccess: () => void;
}

function TemplateForm({ template, defaultType, canManage, onSuccess }: TemplateFormProps) {
  const isEdit = !!template;
  const queryClient = useQueryClient();
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);

  // Teams the current user can share with — used to populate the team dropdown
  // when "My team" is selected. Server enforces membership; this just keeps the
  // UI honest by only offering teams the user belongs to (or all teams for
  // admins/supervisors who can share with any team).
  const { data: session } = useSession();
  const isPrivileged = session?.user?.role === "admin" || session?.user?.role === "supervisor";
  const { data: teamsData } = useQuery({
    queryKey: ["teams"],
    queryFn: async () => {
      const { data } = await axios.get<{ teams: (TeamOption & { members: { id: string; name: string }[] })[] }>("/api/teams");
      return data.teams;
    },
  });
  const myTeams = (teamsData ?? []).filter((t) =>
    isPrivileged || t.members.some((m) => m.id === session?.user?.id),
  );

  const form = useForm<CreateTemplateInput>({
    resolver: zodResolver(isEdit ? (updateTemplateSchema as any) : createTemplateSchema),
    defaultValues: {
      title: template?.title ?? "",
      body: template?.body ?? "",
      type: template?.type ?? defaultType,
      isActive: template?.isActive ?? true,
      visibility: template?.visibility ?? "private",
      teamId: template?.teamId ?? null,
    },
  });

  const visibility = (form.watch("visibility") as TemplateVisibility) ?? "private";
  const teamId     = form.watch("teamId");

  const mutation = useMutation({
    mutationFn: async (payload: CreateTemplateInput | UpdateTemplateInput) => {
      if (isEdit) {
        const { data } = await axios.put(`/api/templates/${template.id}`, payload);
        return data;
      }
      const { data } = await axios.post("/api/templates", payload);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["templates"] });
      form.reset();
      mutation.reset();
      onSuccess();
    },
  });

  const selectedType = (form.watch("type") as TemplateType) ?? defaultType;

  function insertVariable(key: string) {
    const el = bodyRef.current;
    const current = form.getValues("body") ?? "";
    if (!el) { form.setValue("body", current + key); return; }
    const start = el.selectionStart ?? current.length;
    const end = el.selectionEnd ?? current.length;
    form.setValue("body", current.slice(0, start) + key + current.slice(end), { shouldValidate: true });
    requestAnimationFrame(() => { el.focus(); const pos = start + key.length; el.setSelectionRange(pos, pos); });
  }

  return (
    <form onSubmit={form.handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
      {!isEdit && (
        <div className="space-y-1.5">
          <Label>Template type</Label>
          <Select
            defaultValue={defaultType}
            onValueChange={(v) => form.setValue("type", v as TemplateType, { shouldValidate: true })}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {templateTypes.map((t) => (
                <SelectItem key={t} value={t}>{templateTypeLabel[t]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="tmpl-title">Title <span className="text-destructive">*</span></Label>
        <Input id="tmpl-title" placeholder="e.g. Acknowledge — Ticket received" {...form.register("title")} />
        {form.formState.errors.title && <ErrorMessage message={form.formState.errors.title.message} />}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="tmpl-body">Body <span className="text-destructive">*</span></Label>
        <Textarea
          id="tmpl-body"
          rows={8}
          placeholder="Template content… Use variables below as placeholders."
          className="font-mono text-sm resize-y"
          {...form.register("body")}
          ref={(el) => { form.register("body").ref(el); bodyRef.current = el; }}
        />
        {form.formState.errors.body && <ErrorMessage message={form.formState.errors.body.message} />}
        <VariablePicker type={selectedType} onInsert={insertVariable} />
      </div>

      {/* Visibility */}
      <div className="space-y-2">
        <Label className="flex items-center gap-1.5"><Lock className="h-3 w-3" />Sharing</Label>
        <div className="grid grid-cols-3 gap-2">
          {(TEMPLATE_VISIBILITIES).map((v) => {
            const Icon = v === "private" ? Lock : v === "team" ? UsersIcon : Globe;
            const selected = visibility === v;
            const disabled = v === "team" && myTeams.length === 0;
            return (
              <button
                key={v}
                type="button"
                disabled={disabled}
                onClick={() => {
                  form.setValue("visibility", v, { shouldValidate: true });
                  if (v !== "team") form.setValue("teamId", null, { shouldValidate: true });
                  else if (myTeams.length === 1) form.setValue("teamId", myTeams[0]!.id, { shouldValidate: true });
                }}
                className={[
                  "text-left rounded-lg border p-2.5 transition-all",
                  disabled ? "opacity-50 cursor-not-allowed" : "",
                  selected
                    ? "border-primary ring-2 ring-primary/20 bg-background"
                    : "border-border bg-background hover:bg-muted/50",
                ].join(" ")}
              >
                <div className="flex items-center gap-1.5 text-sm font-medium">
                  <Icon className="h-3.5 w-3.5" />
                  {TEMPLATE_VISIBILITY_LABEL[v]}
                </div>
                <p className="text-[11px] text-muted-foreground mt-1 leading-snug">
                  {TEMPLATE_VISIBILITY_DESCRIPTION[v]}
                </p>
              </button>
            );
          })}
        </div>
        {visibility === "team" && (
          <div className="space-y-1">
            <Label htmlFor="tmpl-team" className="text-xs text-muted-foreground">Team</Label>
            <Select
              value={teamId ? String(teamId) : ""}
              onValueChange={(v) => form.setValue("teamId", Number(v), { shouldValidate: true })}
            >
              <SelectTrigger id="tmpl-team"><SelectValue placeholder="Select a team…" /></SelectTrigger>
              <SelectContent>
                {myTeams.length === 0 && (
                  <div className="px-2 py-2 text-xs text-muted-foreground">You aren't a member of any team yet.</div>
                )}
                {myTeams.map((t) => (
                  <SelectItem key={t.id} value={String(t.id)}>
                    <span className="inline-flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full" style={{ background: t.color }} />
                      {t.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {(form.formState.errors as any).teamId && (
              <ErrorMessage message={String((form.formState.errors as any).teamId.message)} />
            )}
          </div>
        )}
      </div>

      {canManage && (
        <div className="flex items-center gap-3 rounded-lg border border-border/60 bg-muted/20 px-4 py-3">
          <Switch
            id="tmpl-active"
            checked={form.watch("isActive") ?? true}
            onCheckedChange={(v) => form.setValue("isActive", v)}
          />
          <Label htmlFor="tmpl-active" className="cursor-pointer text-sm">Active — available for use</Label>
        </div>
      )}

      {mutation.error && <ErrorAlert error={mutation.error} fallback={`Failed to ${isEdit ? "update" : "create"} template`} />}

      <div className="flex justify-end gap-2">
        <Button type="submit" disabled={mutation.isPending} className="gap-2">
          {mutation.isPending ? (
            <><span className="h-3.5 w-3.5 rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground animate-spin" />{isEdit ? "Saving…" : "Creating…"}</>
          ) : (
            isEdit ? "Save Changes" : "Create Template"
          )}
        </Button>
      </div>
    </form>
  );
}

// ── Template card ─────────────────────────────────────────────────────────────

function TemplateCard({
  template,
  canManage,
  onEdit,
  onDuplicate,
  onDelete,
}: {
  template: Template;
  canManage: boolean;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  function copyBody() {
    void navigator.clipboard.writeText(template.body).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const preview = template.body.slice(0, 160);
  const hasMore = template.body.length > 160;

  return (
    <div
      className={`group rounded-xl border bg-card shadow-sm overflow-hidden transition-all duration-150 hover:shadow-md ${
        !template.isActive ? "opacity-60" : ""
      }`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 px-4 pt-4 pb-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold shrink-0 ${TYPE_COLORS[template.type]}`}>
            {TAB_ICONS[template.type]}
            {templateTypeLabel[template.type]}
          </div>
          <VisibilityBadge template={template} />
          {!template.isActive && (
            <span className="text-[10px] font-medium text-muted-foreground border rounded-full px-2 py-0.5">
              Inactive
            </span>
          )}
        </div>
        {/* Action buttons — fade in on hover */}
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            title={copied ? "Copied!" : "Copy body to clipboard"}
            onClick={copyBody}
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            title="Duplicate"
            onClick={onDuplicate}
          >
            <FileText className="h-3.5 w-3.5" />
          </Button>
          {canManage && (
            <>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                title="Edit"
                onClick={onEdit}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                title="Delete"
                onClick={onDelete}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Title */}
      <div className="px-4 pb-2">
        <p className="font-semibold text-sm leading-snug">{template.title}</p>
      </div>

      {/* Body preview */}
      <div className="px-4 pb-3">
        <p className="text-sm text-muted-foreground font-mono leading-relaxed whitespace-pre-wrap break-words">
          {expanded ? template.body : preview}
          {!expanded && hasMore && "…"}
        </p>
        {hasMore && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="mt-1.5 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {expanded ? "Collapse" : "Show more"}
          </button>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-4 py-2.5 border-t border-border/50 bg-muted/20 text-[11px] text-muted-foreground">
        <span>by {template.createdBy.name}</span>
        <span>{formatDate(template.updatedAt)}</span>
      </div>
    </div>
  );
}

// ── Tab content ───────────────────────────────────────────────────────────────

function TemplateTabContent({
  type,
  templates,
  isLoading,
  search,
  canManageTemplate,
  onEdit,
  onDuplicate,
  onDelete,
  onNew,
}: {
  type: TemplateType;
  templates: Template[] | undefined;
  isLoading: boolean;
  search: string;
  canManageTemplate: (t: Template) => boolean;
  onEdit: (t: Template) => void;
  onDuplicate: (t: Template) => void;
  onDelete: (t: Template) => void;
  onNew: () => void;
}) {
  const q = search.toLowerCase();
  const filtered = (templates ?? [])
    .filter((t) => t.type === type)
    .filter((t) => !q || t.title.toLowerCase().includes(q) || t.body.toLowerCase().includes(q));

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-xl border bg-card p-4 space-y-3">
            <Skeleton className="h-5 w-24 rounded-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        ))}
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="h-14 w-14 rounded-2xl bg-muted flex items-center justify-center mb-4">
          {TAB_ICONS[type]}
        </div>
        <p className="font-semibold text-foreground">
          {search ? "No matching templates" : `No ${templateTypeLabel[type].toLowerCase()} templates yet`}
        </p>
        <p className="text-sm text-muted-foreground mt-1 max-w-xs">
          {search
            ? "Try a different search term."
            : `Create your first ${templateTypeLabel[type].toLowerCase()} template to reuse across your team.`}
        </p>
        {!search && (
          <Button className="mt-4 gap-2" onClick={onNew}>
            <Plus className="h-4 w-4" />
            New Template
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
      {filtered.map((t) => (
        <TemplateCard
          key={t.id}
          template={t}
          canManage={canManageTemplate(t)}
          onEdit={() => onEdit(t)}
          onDuplicate={() => onDuplicate(t)}
          onDelete={() => onDelete(t)}
        />
      ))}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

type DialogState =
  | { mode: "create"; type: TemplateType }
  | { mode: "edit"; template: Template }
  | null;

export default function TemplatesPage() {
  const { data: session } = useSession();
  const userId = session?.user?.id ?? "";
  const isPrivileged = session?.user?.role === "admin" || session?.user?.role === "supervisor";
  // Per-template manage check: own templates are always editable by their
  // creator; admins/supervisors can manage every template regardless of
  // ownership. Mirrors the server-side rule in routes/templates.ts.
  const canManageTemplate = (t: Template) => isPrivileged || t.createdById === userId;

  const [activeTab, setActiveTab] = useState<TemplateType>("ticket");
  const [search, setSearch] = useState("");
  const [dialog, setDialog] = useState<DialogState>(null);
  const [deleting, setDeleting] = useState<Template | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["templates"],
    queryFn: async () => {
      const { data } = await axios.get<{ templates: Template[] }>("/api/templates");
      return data.templates;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => axios.delete(`/api/templates/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["templates"] }); setDeleting(null); },
  });

  const duplicateMutation = useMutation({
    mutationFn: async (t: Template) => {
      const { data } = await axios.post("/api/templates", {
        title: `Copy of ${t.title}`,
        body: t.body,
        bodyHtml: t.bodyHtml,
        type: t.type,
        isActive: t.isActive,
        // Duplicates always start private — the duplicator may not have access
        // to the original's team and we don't want to silently re-share.
        visibility: "private",
        teamId: null,
      });
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["templates"] }),
  });

  const close = () => setDialog(null);

  const dialogType =
    dialog?.mode === "create" ? dialog.type :
    dialog?.mode === "edit" ? dialog.template.type :
    activeTab;

  const totalByType = (type: TemplateType) =>
    (data ?? []).filter((t) => t.type === type).length;

  return (
    <div className="space-y-6">
      {/* ── Page header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Templates</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Reusable content for tickets, requests, changes, problems, articles, emails, and macros.
            Agents can save templates directly from any entity's detail page.
          </p>
        </div>
        <Button onClick={() => setDialog({ mode: "create", type: activeTab })} className="gap-2 shrink-0">
          <Plus className="h-4 w-4" />
          New Template
        </Button>
      </div>

      {error && <ErrorAlert message="Failed to load templates" />}

      {/* ── Search ── */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        <Input
          type="text"
          placeholder="Search templates…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* ── Tabs ── */}
      <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v as TemplateType); setSearch(""); }}>
        <TabsList className="mb-6 h-auto flex-wrap gap-1 bg-transparent p-0">
          {templateTypes.map((t) => (
            <TabsTrigger
              key={t}
              value={t}
              className="flex items-center gap-1.5 rounded-lg border border-border/60 bg-card shadow-sm data-[state=active]:border-primary/40 data-[state=active]:bg-primary/5 data-[state=active]:text-primary data-[state=active]:shadow-none px-3 py-1.5 text-sm"
            >
              {TAB_ICONS[t]}
              {templateTypeLabel[t]}
              {!isLoading && data && (
                <span className="ml-0.5 text-[10px] tabular-nums text-muted-foreground">
                  ({totalByType(t)})
                </span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>

        {templateTypes.map((t) => (
          <TabsContent key={t} value={t} className="mt-0">
            <TemplateTabContent
              type={t}
              templates={data}
              isLoading={isLoading}
              search={search}
              canManageTemplate={canManageTemplate}
              onEdit={(tmpl) => setDialog({ mode: "edit", template: tmpl })}
              onDuplicate={(tmpl) => duplicateMutation.mutate(tmpl)}
              onDelete={(tmpl) => setDeleting(tmpl)}
              onNew={() => setDialog({ mode: "create", type: t })}
            />
          </TabsContent>
        ))}
      </Tabs>

      {/* ── Create / Edit dialog ── */}
      <Dialog open={dialog !== null} onOpenChange={(open) => { if (!open) close(); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {dialog?.mode === "edit"
                ? `Edit — ${dialog.template.title}`
                : `New ${templateTypeLabel[dialogType]} Template`}
            </DialogTitle>
          </DialogHeader>
          <TemplateForm
            key={dialog?.mode === "edit" ? dialog.template.id : `create-${activeTab}`}
            template={dialog?.mode === "edit" ? dialog.template : undefined}
            defaultType={dialogType}
            // For an edit, manage permission is per-template (creator or
            // privileged role); for a create, the user owns the new template
            // by definition so they can always manage it.
            canManage={
              dialog?.mode === "edit"
                ? canManageTemplate(dialog.template)
                : true
            }
            onSuccess={close}
          />
        </DialogContent>
      </Dialog>

      {/* ── Delete confirm ── */}
      <AlertDialog open={deleting !== null} onOpenChange={(open) => { if (!open) { setDeleting(null); deleteMutation.reset(); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete template?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{deleting?.title}</strong> will be permanently deleted. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteMutation.isError && <ErrorAlert message="Failed to delete template" />}
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
