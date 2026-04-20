import { useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createTemplateSchema, updateTemplateSchema } from "core/schemas/templates.ts";
import type { CreateTemplateInput, UpdateTemplateInput } from "core/schemas/templates.ts";
import { templateTypes, templateTypeLabel } from "core/constants/template.ts";
import type { TemplateType } from "core/constants/template.ts";
import { TEMPLATE_VARIABLES } from "@/lib/template-variables";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
  FileText,
  Ticket,
  Inbox,
  RefreshCw,
  Bug,
  BookOpen,
  Mail,
  BookMarked,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Template {
  id: number;
  title: string;
  body: string;
  bodyHtml?: string | null;
  type: TemplateType;
  isActive: boolean;
  createdById: string;
  createdBy: { id: string; name: string };
  createdAt: string;
  updatedAt: string;
}

// ─── Tab config ───────────────────────────────────────────────────────────────

const TAB_ICONS: Record<TemplateType, React.ReactNode> = {
  ticket: <Ticket className="h-3.5 w-3.5" />,
  request: <Inbox className="h-3.5 w-3.5" />,
  change: <RefreshCw className="h-3.5 w-3.5" />,
  problem: <Bug className="h-3.5 w-3.5" />,
  article: <BookOpen className="h-3.5 w-3.5" />,
  email: <Mail className="h-3.5 w-3.5" />,
  macro: <BookMarked className="h-3.5 w-3.5" />,
};

// ─── VariablePicker ───────────────────────────────────────────────────────────

interface VariablePickerProps {
  type: TemplateType;
  onInsert: (key: string) => void;
}

function VariablePicker({ type, onInsert }: VariablePickerProps) {
  const variables = TEMPLATE_VARIABLES[type];

  const groups = Array.from(new Set(variables.map((v) => v.group)));

  return (
    <div className="rounded-md border bg-muted/40 p-3 space-y-3">
      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
        Available variables — click to insert
      </p>
      <div className="max-h-44 overflow-y-auto space-y-3 pr-1">
        {groups.map((group) => (
          <div key={group}>
            <p className="text-[10px] font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">
              {group}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {variables
                .filter((v) => v.group === group)
                .map((v) => (
                  <button
                    key={v.key}
                    type="button"
                    title={v.description}
                    onClick={() => onInsert(v.key)}
                    className="inline-flex items-center text-[11px] font-mono bg-background border rounded px-1.5 py-0.5 hover:bg-accent hover:border-ring transition-colors cursor-pointer"
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

// ─── TemplateForm ─────────────────────────────────────────────────────────────

interface TemplateFormProps {
  template?: Template;
  defaultType: TemplateType;
  onSuccess: () => void;
}

function TemplateForm({ template, defaultType, onSuccess }: TemplateFormProps) {
  const isEdit = !!template;
  const queryClient = useQueryClient();
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);

  const form = useForm<CreateTemplateInput>({
    resolver: zodResolver(isEdit ? (updateTemplateSchema as any) : createTemplateSchema),
    defaultValues: {
      title: template?.title ?? "",
      body: template?.body ?? "",
      type: template?.type ?? defaultType,
      isActive: template?.isActive ?? true,
    },
  });

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
    if (!el) {
      form.setValue("body", (form.getValues("body") ?? "") + key);
      return;
    }
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    const current = el.value;
    const next = current.slice(0, start) + key + current.slice(end);
    form.setValue("body", next, { shouldValidate: true });
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + key.length;
      el.setSelectionRange(pos, pos);
    });
  }

  return (
    <form
      onSubmit={form.handleSubmit((d) => mutation.mutate(d))}
      className="space-y-4"
    >
      <div className="space-y-2">
        <Label htmlFor="title">Title</Label>
        <Input
          id="title"
          placeholder="e.g. Acknowledge — Ticket received"
          {...form.register("title")}
        />
        {form.formState.errors.title && (
          <ErrorMessage message={form.formState.errors.title.message} />
        )}
      </div>

      {!isEdit && (
        <div className="space-y-2">
          <Label>Template type</Label>
          <Select
            defaultValue={defaultType}
            onValueChange={(v) => form.setValue("type", v as TemplateType, { shouldValidate: true })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {templateTypes.map((t) => (
                <SelectItem key={t} value={t}>
                  {templateTypeLabel[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="body">Body</Label>
        <Textarea
          id="body"
          placeholder={`Write your ${templateTypeLabel[selectedType].toLowerCase()} template here. Click variables below to insert placeholders.`}
          rows={7}
          {...form.register("body")}
          ref={(el) => {
            form.register("body").ref(el);
            bodyRef.current = el;
          }}
        />
        {form.formState.errors.body && (
          <ErrorMessage message={form.formState.errors.body.message} />
        )}
        <VariablePicker type={selectedType} onInsert={insertVariable} />
      </div>

      <div className="space-y-2">
        <Label>Status</Label>
        <Select
          defaultValue={template?.isActive === false ? "inactive" : "active"}
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

      {mutation.error && (
        <ErrorAlert
          error={mutation.error}
          fallback={`Failed to ${isEdit ? "update" : "create"} template`}
        />
      )}

      <div className="flex justify-end">
        <Button type="submit" disabled={mutation.isPending}>
          {isEdit
            ? mutation.isPending ? "Saving..." : "Save Changes"
            : mutation.isPending ? "Creating..." : "Create Template"}
        </Button>
      </div>
    </form>
  );
}

// ─── TemplateTabContent ────────────────────────────────────────────────────────

interface TemplateTabContentProps {
  type: TemplateType;
  templates: Template[] | undefined;
  isLoading: boolean;
  onEdit: (t: Template) => void;
  onDelete: (t: Template) => void;
}

function TemplateTabContent({
  type,
  templates,
  isLoading,
  onEdit,
  onDelete,
}: TemplateTabContentProps) {
  const filtered = (templates ?? []).filter((t) => t.type === type);

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Title</TableHead>
          <TableHead>Preview</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Created by</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {isLoading
          ? Array.from({ length: 3 }).map((_, i) => (
              <TableRow key={i}>
                {Array.from({ length: 5 }).map((__, j) => (
                  <TableCell key={j}>
                    <Skeleton className="h-4 w-24" />
                  </TableCell>
                ))}
              </TableRow>
            ))
          : filtered.map((tmpl) => (
              <TableRow key={tmpl.id} className={!tmpl.isActive ? "opacity-50" : ""}>
                <TableCell className="font-medium">{tmpl.title}</TableCell>
                <TableCell className="max-w-[300px]">
                  <p className="text-sm text-muted-foreground truncate">{tmpl.body}</p>
                </TableCell>
                <TableCell>
                  <Badge variant={tmpl.isActive ? "default" : "outline"}>
                    {tmpl.isActive ? "Active" : "Inactive"}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {tmpl.createdBy.name}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1 justify-end">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => onEdit(tmpl)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => onDelete(tmpl)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}

        {!isLoading && filtered.length === 0 && (
          <TableRow>
            <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
              <FileText className="h-8 w-8 mx-auto mb-3 opacity-30" />
              <p className="text-sm">
                No {templateTypeLabel[type].toLowerCase()} templates yet. Create the first one.
              </p>
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}

// ─── TemplatesPage ─────────────────────────────────────────────────────────────

type DialogState =
  | { mode: "create"; type: TemplateType }
  | { mode: "edit"; template: Template }
  | null;

export default function TemplatesPage() {
  const [activeTab, setActiveTab] = useState<TemplateType>("ticket");
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["templates"] });
      setDeleting(null);
    },
  });

  const close = () => setDialog(null);

  const dialogType =
    dialog?.mode === "create"
      ? dialog.type
      : dialog?.mode === "edit"
      ? dialog.template.type
      : activeTab;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Templates</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Reusable content templates for tickets, requests, changes, problems, articles, emails, and macros.
          </p>
        </div>
        <Button onClick={() => setDialog({ mode: "create", type: activeTab })}>
          <Plus className="mr-2 h-4 w-4" />
          New Template
        </Button>
      </div>

      {error && <ErrorAlert message="Failed to load templates" />}

      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as TemplateType)}
      >
        <TabsList className="mb-4">
          {templateTypes.map((t) => (
            <TabsTrigger key={t} value={t} className="flex items-center gap-1.5">
              {TAB_ICONS[t]}
              {templateTypeLabel[t]}
              {!isLoading && data && (
                <span className="ml-1 text-[10px] text-muted-foreground tabular-nums">
                  ({(data ?? []).filter((tmpl) => tmpl.type === t).length})
                </span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>

        {templateTypes.map((t) => (
          <TabsContent key={t} value={t}>
            <TemplateTabContent
              type={t}
              templates={data}
              isLoading={isLoading}
              onEdit={(tmpl) => setDialog({ mode: "edit", template: tmpl })}
              onDelete={(tmpl) => setDeleting(tmpl)}
            />
          </TabsContent>
        ))}
      </Tabs>

      {/* Create / Edit dialog */}
      <Dialog open={dialog !== null} onOpenChange={(open) => { if (!open) close(); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {dialog?.mode === "edit"
                ? `Edit ${templateTypeLabel[dialog.template.type]} Template`
                : `New ${templateTypeLabel[dialogType]} Template`}
            </DialogTitle>
          </DialogHeader>
          <TemplateForm
            key={dialog?.mode === "edit" ? dialog.template.id : `create-${activeTab}`}
            template={dialog?.mode === "edit" ? dialog.template : undefined}
            defaultType={dialogType}
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
            <AlertDialogTitle>Delete template?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{deleting?.title}</strong> will be permanently deleted. This cannot be undone.
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
