import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import axios from "axios";
import {
  FORM_FIELD_REGISTRY,
  formEntityTypes,
  formEntityTypeLabel,
  getFormSections,
} from "core/constants/form-fields.ts";
import type { FormEntityType } from "core/constants/form-fields.ts";
import type { FormFieldConfig } from "core/schemas/form-definitions.ts";
import { createCustomFieldSchema, updateCustomFieldSchema } from "core/schemas/custom-fields.ts";
import type { CreateCustomFieldInput, UpdateCustomFieldInput } from "core/schemas/custom-fields.ts";
import { customFieldTypes, customFieldTypeLabel } from "core/constants/custom-field-types.ts";
import type { CustomFieldDef } from "@/hooks/useCustomFields";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import ErrorAlert from "@/components/ErrorAlert";
import ErrorMessage from "@/components/ErrorMessage";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  ArrowUp,
  ArrowDown,
  RotateCcw,
  Save,
  Settings2,
  EyeOff,
  Plus,
  Pencil,
  Trash2,
  GripVertical,
  Tag,
  ArrowLeft,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface FormDefinitionResponse {
  entityType: FormEntityType;
  fields: FormFieldConfig[];
  isDefault: boolean;
  updatedAt?: string;
}

// ─── FieldRow ─────────────────────────────────────────────────────────────────

interface FieldRowProps {
  field: FormFieldConfig;
  isFirst: boolean;
  isLast: boolean;
  onChange: (updated: FormFieldConfig) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

function FieldRow({ field, isFirst, isLast, onChange, onMoveUp, onMoveDown }: FieldRowProps) {
  const isRequired = field.required;

  return (
    <div className={`flex items-start gap-3 rounded-lg border p-3 transition-colors ${
      field.visible ? "bg-background" : "bg-muted/30 opacity-60"
    }`}>
      {/* Visibility toggle */}
      <div className="flex items-center pt-0.5">
        <Switch
          checked={field.visible}
          onCheckedChange={(v) => onChange({ ...field, visible: v })}
          className="scale-90"
        />
      </div>

      {/* Field info */}
      <div className="flex-1 min-w-0 space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <code className="text-[10px] bg-muted border rounded px-1.5 py-0.5 font-mono text-muted-foreground">
            {field.key}
          </code>
          {isRequired && (
            <Badge variant="outline" className="text-[10px] h-4 px-1.5 text-destructive border-destructive/30">
              required
            </Badge>
          )}
          {!field.visible && (
            <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
              <EyeOff className="h-3 w-3" /> hidden
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Label</p>
            <Input
              value={field.label}
              onChange={(e) => onChange({ ...field, label: e.target.value })}
              className="h-7 text-xs"
            />
          </div>
          <div className="space-y-1">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Placeholder</p>
            <Input
              value={field.placeholder}
              onChange={(e) => onChange({ ...field, placeholder: e.target.value })}
              className="h-7 text-xs"
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none">
            <input
              type="checkbox"
              checked={field.required}
              onChange={(e) => onChange({ ...field, required: e.target.checked })}
              className="accent-primary"
            />
            Required
          </label>
        </div>
      </div>

      {/* Reorder */}
      <div className="flex flex-col gap-0.5 pt-0.5">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          disabled={isFirst}
          onClick={onMoveUp}
        >
          <ArrowUp className="h-3 w-3" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          disabled={isLast}
          onClick={onMoveDown}
        >
          <ArrowDown className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

// ─── CustomFieldForm ──────────────────────────────────────────────────────────

type CFDialogState =
  | { mode: "create" }
  | { mode: "edit"; field: CustomFieldDef }
  | null;

interface CustomFieldFormProps {
  entityType: FormEntityType;
  ticketTypeId?: number;
  existing?: CustomFieldDef;
  onSuccess: () => void;
}

function CustomFieldForm({ entityType, ticketTypeId, existing, onSuccess }: CustomFieldFormProps) {
  const isEdit = !!existing;
  const queryClient = useQueryClient();

  const form = useForm<CreateCustomFieldInput>({
    resolver: zodResolver(isEdit ? (updateCustomFieldSchema as any) : createCustomFieldSchema),
    defaultValues: {
      entityType,
      label:       existing?.label ?? "",
      fieldType:   existing?.fieldType ?? "text",
      placeholder: existing?.placeholder ?? "",
      helpText:    existing?.helpText ?? "",
      required:    existing?.required ?? false,
      options:     existing?.options ?? [],
    },
  });

  const fieldType = form.watch("fieldType");
  const needsOptions = fieldType === "select" || fieldType === "multiselect";

  // Options as a single newline-separated textarea for simplicity
  const [optionsText, setOptionsText] = useState(
    (existing?.options ?? []).join("\n")
  );

  const mutation = useMutation({
    mutationFn: async (payload: CreateCustomFieldInput | UpdateCustomFieldInput) => {
      if (isEdit) {
        const { data } = await axios.put(`/api/custom-fields/${existing.id}`, payload);
        return data.field;
      }
      const { data } = await axios.post("/api/custom-fields", {
        ...payload,
        ...(ticketTypeId != null && { ticketTypeId }),
      });
      return data.field;
    },
    onSuccess: () => {
      if (ticketTypeId != null) {
        queryClient.invalidateQueries({ queryKey: ["custom-fields-ticket-type", ticketTypeId] });
      } else {
        queryClient.invalidateQueries({ queryKey: ["custom-fields", entityType] });
      }
      onSuccess();
    },
  });

  function handleSubmit(raw: CreateCustomFieldInput) {
    const options = optionsText
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    mutation.mutate({ ...raw, options });
  }

  return (
    <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
      <div className="space-y-1.5">
        <Label>Label <span className="text-destructive">*</span></Label>
        <Input {...form.register("label")} placeholder="e.g. Customer Reference Number" />
        {form.formState.errors.label && (
          <ErrorMessage message={form.formState.errors.label.message} />
        )}
        <p className="text-[11px] text-muted-foreground">
          The field key is auto-generated from this label and cannot be changed later.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Field Type <span className="text-destructive">*</span></Label>
          <Controller
            name="fieldType"
            control={form.control}
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange} disabled={isEdit}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {customFieldTypes.map((t) => (
                    <SelectItem key={t} value={t}>{customFieldTypeLabel[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          {isEdit && (
            <p className="text-[11px] text-muted-foreground">Field type cannot be changed after creation.</p>
          )}
        </div>

        <div className="space-y-1.5 flex items-end gap-3 pb-0.5">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <Controller
              name="required"
              control={form.control}
              render={({ field }) => (
                <Switch checked={field.value} onCheckedChange={field.onChange} />
              )}
            />
            Required field
          </label>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Placeholder</Label>
        <Input {...form.register("placeholder")} placeholder="Hint text shown inside the field…" />
      </div>

      <div className="space-y-1.5">
        <Label>Help Text</Label>
        <Input {...form.register("helpText")} placeholder="Short description shown below the field…" />
      </div>

      {needsOptions && (
        <div className="space-y-1.5">
          <Label>Options <span className="text-destructive">*</span></Label>
          <Textarea
            value={optionsText}
            onChange={(e) => setOptionsText(e.target.value)}
            placeholder={"Option A\nOption B\nOption C"}
            className="min-h-[100px] font-mono text-sm resize-y"
          />
          <p className="text-[11px] text-muted-foreground">One option per line.</p>
        </div>
      )}

      {mutation.error && (
        <ErrorAlert error={mutation.error} fallback={`Failed to ${isEdit ? "update" : "create"} field`} />
      )}

      <div className="flex justify-end">
        <Button type="submit" disabled={mutation.isPending}>
          {isEdit
            ? mutation.isPending ? "Saving…" : "Save Changes"
            : mutation.isPending ? "Creating…" : "Add Field"}
        </Button>
      </div>
    </form>
  );
}

// ─── CustomFieldsSection ──────────────────────────────────────────────────────

interface CustomFieldsSectionProps {
  entityType: FormEntityType;
}

function CustomFieldsSection({ entityType }: CustomFieldsSectionProps) {
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<CFDialogState>(null);
  const [deleting, setDeleting] = useState<CustomFieldDef | null>(null);

  const { data: fields = [], isLoading, error } = useQuery<CustomFieldDef[]>({
    queryKey: ["custom-fields", entityType],
    queryFn: async () => {
      const { data } = await axios.get<{ fields: CustomFieldDef[] }>(
        `/api/custom-fields?entityType=${entityType}`
      );
      return data.fields;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => axios.delete(`/api/custom-fields/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["custom-fields", entityType] });
      setDeleting(null);
    },
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="flex items-center gap-3">
            <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">
              Custom Fields
            </span>
            <div className="flex-1 h-px bg-border w-16" />
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Add organisation-specific fields that agents fill in when creating records.
            Values are stored in the database alongside standard fields.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 text-xs gap-1.5 shrink-0"
          onClick={() => setDialog({ mode: "create" })}
        >
          <Plus className="h-3 w-3" />
          Add custom field
        </Button>
      </div>

      {error && <ErrorAlert message="Failed to load custom fields" />}

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
        </div>
      ) : fields.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          No custom fields yet. Click <strong>Add custom field</strong> to create one.
        </div>
      ) : (
        <div className="space-y-2">
          {fields.map((f) => (
            <div
              key={f.id}
              className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 ${
                !f.visible ? "opacity-50 bg-muted/30" : "bg-background"
              }`}
            >
              <GripVertical className="h-4 w-4 text-muted-foreground/40 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium">{f.label}</span>
                  <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                    {customFieldTypeLabel[f.fieldType]}
                  </Badge>
                  {f.required && (
                    <Badge variant="outline" className="text-[10px] h-4 px-1.5 text-destructive border-destructive/30">
                      required
                    </Badge>
                  )}
                  {!f.visible && (
                    <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                      <EyeOff className="h-3 w-3" /> hidden
                    </span>
                  )}
                </div>
                <code className="text-[10px] text-muted-foreground font-mono">{f.key}</code>
                {f.options.length > 0 && (
                  <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                    Options: {f.options.join(", ")}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setDialog({ mode: "edit", field: f })}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  onClick={() => setDeleting(f)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit dialog */}
      <Dialog open={dialog !== null} onOpenChange={(open) => { if (!open) setDialog(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {dialog?.mode === "edit" ? "Edit Custom Field" : "Add Custom Field"}
            </DialogTitle>
          </DialogHeader>
          <CustomFieldForm
            key={dialog?.mode === "edit" ? dialog.field.id : `create-${entityType}`}
            entityType={entityType}
            existing={dialog?.mode === "edit" ? dialog.field : undefined}
            onSuccess={() => setDialog(null)}
          />
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog
        open={deleting !== null}
        onOpenChange={(open) => { if (!open) { setDeleting(null); deleteMutation.reset(); } }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete custom field?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{deleting?.label}</strong> (<code className="font-mono text-xs">{deleting?.key}</code>) will be permanently deleted.
              Existing records that have data in this field will retain the raw JSON value but the field will no longer render in forms.
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteMutation.isError && <ErrorAlert message="Failed to delete field" />}
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

// ─── EntityFormBuilder ─────────────────────────────────────────────────────────

interface EntityFormBuilderProps {
  entityType: FormEntityType;
}

function EntityFormBuilder({ entityType }: EntityFormBuilderProps) {
  const queryClient = useQueryClient();
  const [fields, setFields] = useState<FormFieldConfig[] | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);

  const { data, isLoading, error } = useQuery<FormDefinitionResponse>({
    queryKey: ["form-definition", entityType],
    queryFn: async () => {
      const { data } = await axios.get<FormDefinitionResponse>(
        `/api/form-definitions/${entityType}`
      );
      return data;
    },
  });

  // Sync server data into local state once loaded (or on reset)
  useEffect(() => {
    if (data) {
      // Merge server fields with registry so newly added registry fields appear
      const registryFields = FORM_FIELD_REGISTRY[entityType];
      const savedMap = new Map(data.fields.map((f) => [f.key, f]));
      const merged: FormFieldConfig[] = registryFields.map((def) => {
        const saved = savedMap.get(def.key);
        return saved ?? {
          key:         def.key,
          visible:     true,
          required:    def.required,
          label:       def.label,
          placeholder: def.placeholder,
          order:       def.order,
        };
      });
      setFields(merged);
      setIsDirty(false);
    }
  }, [data, entityType]);

  const saveMutation = useMutation({
    mutationFn: async (payload: FormFieldConfig[]) => {
      const { data } = await axios.put<FormDefinitionResponse>(
        `/api/form-definitions/${entityType}`,
        { fields: payload }
      );
      return data;
    },
    onSuccess: (saved) => {
      queryClient.setQueryData(["form-definition", entityType], saved);
      setIsDirty(false);
    },
  });

  const resetMutation = useMutation({
    mutationFn: async () => {
      const { data } = await axios.post<FormDefinitionResponse>(
        `/api/form-definitions/${entityType}/reset`
      );
      return data;
    },
    onSuccess: (fresh) => {
      queryClient.setQueryData(["form-definition", entityType], fresh);
      setResetOpen(false);
    },
  });

  function updateField(key: string, updated: FormFieldConfig) {
    setFields((prev) => {
      if (!prev) return prev;
      return prev.map((f) => (f.key === key ? updated : f));
    });
    setIsDirty(true);
  }

  function moveField(key: string, direction: "up" | "down") {
    setFields((prev) => {
      if (!prev) return prev;
      const idx = prev.findIndex((f) => f.key === key);
      if (idx < 0) return prev;
      const next = [...prev];
      const swapIdx = direction === "up" ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= next.length) return prev;
      [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
      // Update order values to reflect new positions
      return next.map((f, i) => ({ ...f, order: (i + 1) * 10 }));
    });
    setIsDirty(true);
  }

  if (isLoading || !fields) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (error) return <ErrorAlert message="Failed to load form configuration" />;

  const sections = getFormSections(entityType);

  // Group fields by section (preserving current order within each group)
  const fieldsBySection = new Map<string, FormFieldConfig[]>();
  for (const s of sections) fieldsBySection.set(s, []);
  for (const f of fields) {
    // Find which section this field belongs to via registry
    const def = FORM_FIELD_REGISTRY[entityType].find((d) => d.key === f.key);
    const section = def?.section ?? "Other";
    if (!fieldsBySection.has(section)) fieldsBySection.set(section, []);
    fieldsBySection.get(section)!.push(f);
  }

  const visibleCount = fields.filter((f) => f.visible).length;
  const totalCount = fields.length;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {visibleCount} of {totalCount} fields visible
          {data?.isDefault && (
            <Badge variant="outline" className="ml-2 text-[10px]">using defaults</Badge>
          )}
          {!data?.isDefault && data?.updatedAt && (
            <span className="ml-2 text-[10px]">
              Last saved {new Date(data.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1.5"
            onClick={() => setResetOpen(true)}
            disabled={resetMutation.isPending || data?.isDefault}
          >
            <RotateCcw className="h-3 w-3" />
            Reset to defaults
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-8 text-xs gap-1.5"
            disabled={!isDirty || saveMutation.isPending}
            onClick={() => fields && saveMutation.mutate(fields)}
          >
            <Save className="h-3 w-3" />
            {saveMutation.isPending ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </div>

      {saveMutation.error && (
        <ErrorAlert error={saveMutation.error} fallback="Failed to save form configuration" />
      )}

      {/* Sections */}
      <div className="space-y-6">
        {sections.map((section) => {
          const sectionFields = fieldsBySection.get(section) ?? [];
          if (sectionFields.length === 0) return null;
          const sectionVisible = sectionFields.some((f) => f.visible);
          return (
            <div key={section}>
              <div className="flex items-center gap-3 mb-2">
                <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">
                  {section}
                </span>
                <div className="flex-1 h-px bg-border" />
                {!sectionVisible && (
                  <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                    <EyeOff className="h-3 w-3" /> section hidden
                  </span>
                )}
              </div>
              <div className="space-y-2">
                {sectionFields.map((f, i) => (
                  <FieldRow
                    key={f.key}
                    field={f}
                    isFirst={i === 0}
                    isLast={i === sectionFields.length - 1}
                    onChange={(updated) => updateField(f.key, updated)}
                    onMoveUp={() => moveField(f.key, "up")}
                    onMoveDown={() => moveField(f.key, "down")}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <Separator className="my-6" />
      <CustomFieldsSection entityType={entityType} />

      {/* Reset confirm */}
      <AlertDialog open={resetOpen} onOpenChange={setResetOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset to defaults?</AlertDialogTitle>
            <AlertDialogDescription>
              All customisations to the <strong>{formEntityTypeLabel[entityType]}</strong> form will
              be discarded and the form will revert to the system defaults. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => resetMutation.mutate()}
            >
              Reset
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── TicketTypeCustomFieldsSection ────────────────────────────────────────────

interface TicketTypeCustomFieldsSectionProps {
  ticketTypeId: number;
}

function TicketTypeCustomFieldsSection({ ticketTypeId }: TicketTypeCustomFieldsSectionProps) {
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<CFDialogState>(null);
  const [deleting, setDeleting] = useState<CustomFieldDef | null>(null);

  const { data: fields = [], isLoading, error } = useQuery<CustomFieldDef[]>({
    queryKey: ["custom-fields-ticket-type", ticketTypeId],
    queryFn: async () => {
      const { data } = await axios.get<{ fields: CustomFieldDef[] }>(
        `/api/custom-fields?entityType=ticket&ticketTypeId=${ticketTypeId}`
      );
      return data.fields;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => axios.delete(`/api/custom-fields/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["custom-fields-ticket-type", ticketTypeId] });
      setDeleting(null);
    },
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="flex items-center gap-3">
            <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">
              Custom Fields
            </span>
            <div className="flex-1 h-px bg-border w-16" />
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Add fields specific to this ticket type. Values are stored alongside standard ticket fields.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 text-xs gap-1.5 shrink-0"
          onClick={() => setDialog({ mode: "create" })}
        >
          <Plus className="h-3 w-3" />
          Add custom field
        </Button>
      </div>

      {error && <ErrorAlert message="Failed to load custom fields" />}

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
        </div>
      ) : fields.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          No custom fields yet. Click <strong>Add custom field</strong> to create one.
        </div>
      ) : (
        <div className="space-y-2">
          {fields.map((f) => (
            <div
              key={f.id}
              className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 ${
                !f.visible ? "opacity-50 bg-muted/30" : "bg-background"
              }`}
            >
              <GripVertical className="h-4 w-4 text-muted-foreground/40 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium">{f.label}</span>
                  <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                    {customFieldTypeLabel[f.fieldType]}
                  </Badge>
                  {f.required && (
                    <Badge variant="outline" className="text-[10px] h-4 px-1.5 text-destructive border-destructive/30">
                      required
                    </Badge>
                  )}
                  {!f.visible && (
                    <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                      <EyeOff className="h-3 w-3" /> hidden
                    </span>
                  )}
                </div>
                <code className="text-[10px] text-muted-foreground font-mono">{f.key}</code>
                {f.options.length > 0 && (
                  <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                    Options: {f.options.join(", ")}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setDialog({ mode: "edit", field: f })}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  onClick={() => setDeleting(f)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit dialog */}
      <Dialog open={dialog !== null} onOpenChange={(open) => { if (!open) setDialog(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {dialog?.mode === "edit" ? "Edit Custom Field" : "Add Custom Field"}
            </DialogTitle>
          </DialogHeader>
          <CustomFieldForm
            key={dialog?.mode === "edit" ? dialog.field.id : `create-tt-${ticketTypeId}`}
            entityType="ticket"
            ticketTypeId={ticketTypeId}
            existing={dialog?.mode === "edit" ? dialog.field : undefined}
            onSuccess={() => {
              queryClient.invalidateQueries({ queryKey: ["custom-fields-ticket-type", ticketTypeId] });
              setDialog(null);
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog
        open={deleting !== null}
        onOpenChange={(open) => { if (!open) { setDeleting(null); deleteMutation.reset(); } }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete custom field?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{deleting?.label}</strong> (<code className="font-mono text-xs">{deleting?.key}</code>) will
              be permanently deleted. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteMutation.isError && <ErrorAlert message="Failed to delete field" />}
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

// ─── TicketTypeEntityFormBuilder ──────────────────────────────────────────────

interface TicketTypeFormResponse {
  ticketTypeId: number;
  fields: FormFieldConfig[];
  isDefault: boolean;
  updatedAt?: string;
}

interface TicketTypeEntityFormBuilderProps {
  ticketTypeId: number;
  ticketTypeName: string;
}

function TicketTypeEntityFormBuilder({ ticketTypeId, ticketTypeName }: TicketTypeEntityFormBuilderProps) {
  const queryClient = useQueryClient();
  const [fields, setFields] = useState<FormFieldConfig[] | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);

  const { data, isLoading, error } = useQuery<TicketTypeFormResponse>({
    queryKey: ["ticket-type-form", ticketTypeId],
    queryFn: async () => {
      const { data } = await axios.get<TicketTypeFormResponse>(
        `/api/ticket-types/${ticketTypeId}/form`
      );
      return data;
    },
  });

  useEffect(() => {
    if (data) {
      const registryFields = FORM_FIELD_REGISTRY.ticket.filter((f) => f.key !== "ticketType");
      const savedMap = new Map(data.fields.map((f) => [f.key, f]));
      const merged: FormFieldConfig[] = registryFields.map((def) => {
        const saved = savedMap.get(def.key);
        return saved ?? {
          key:         def.key,
          visible:     true,
          required:    def.required,
          label:       def.label,
          placeholder: def.placeholder,
          order:       def.order,
        };
      });
      setFields(merged);
      setIsDirty(false);
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: async (payload: FormFieldConfig[]) => {
      const { data } = await axios.put<TicketTypeFormResponse>(
        `/api/ticket-types/${ticketTypeId}/form`,
        { fields: payload }
      );
      return data;
    },
    onSuccess: (saved) => {
      queryClient.setQueryData(["ticket-type-form", ticketTypeId], saved);
      setIsDirty(false);
    },
  });

  const resetMutation = useMutation({
    mutationFn: async () => {
      const { data } = await axios.post<TicketTypeFormResponse>(
        `/api/ticket-types/${ticketTypeId}/form/reset`
      );
      return data;
    },
    onSuccess: (fresh) => {
      queryClient.setQueryData(["ticket-type-form", ticketTypeId], fresh);
      setResetOpen(false);
    },
  });

  function updateField(key: string, updated: FormFieldConfig) {
    setFields((prev) => prev ? prev.map((f) => (f.key === key ? updated : f)) : prev);
    setIsDirty(true);
  }

  function moveField(key: string, direction: "up" | "down") {
    setFields((prev) => {
      if (!prev) return prev;
      const idx = prev.findIndex((f) => f.key === key);
      if (idx < 0) return prev;
      const next = [...prev];
      const swapIdx = direction === "up" ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= next.length) return prev;
      [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
      return next.map((f, i) => ({ ...f, order: (i + 1) * 10 }));
    });
    setIsDirty(true);
  }

  if (isLoading || !fields) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (error) return <ErrorAlert message="Failed to load form configuration" />;

  const sections = getFormSections("ticket");
  const fieldsBySection = new Map<string, FormFieldConfig[]>();
  for (const s of sections) fieldsBySection.set(s, []);
  for (const f of fields) {
    const def = FORM_FIELD_REGISTRY.ticket.find((d) => d.key === f.key);
    const section = def?.section ?? "Other";
    if (!fieldsBySection.has(section)) fieldsBySection.set(section, []);
    fieldsBySection.get(section)!.push(f);
  }

  const visibleCount = fields.filter((f) => f.visible).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {visibleCount} of {fields.length} fields visible
          {data?.isDefault && (
            <Badge variant="outline" className="ml-2 text-[10px]">using defaults</Badge>
          )}
          {!data?.isDefault && data?.updatedAt && (
            <span className="ml-2 text-[10px]">
              Last saved {new Date(data.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1.5"
            onClick={() => setResetOpen(true)}
            disabled={resetMutation.isPending || data?.isDefault}
          >
            <RotateCcw className="h-3 w-3" />
            Reset to defaults
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-8 text-xs gap-1.5"
            disabled={!isDirty || saveMutation.isPending}
            onClick={() => fields && saveMutation.mutate(fields)}
          >
            <Save className="h-3 w-3" />
            {saveMutation.isPending ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </div>

      {saveMutation.error && (
        <ErrorAlert error={saveMutation.error} fallback="Failed to save form configuration" />
      )}

      <div className="space-y-6">
        {sections.map((section) => {
          const sectionFields = (fieldsBySection.get(section) ?? []).filter(
            (f) => fields.some((ff) => ff.key === f.key)
          );
          if (sectionFields.length === 0) return null;
          const sectionVisible = sectionFields.some((f) => f.visible);
          return (
            <div key={section}>
              <div className="flex items-center gap-3 mb-2">
                <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">
                  {section}
                </span>
                <div className="flex-1 h-px bg-border" />
                {!sectionVisible && (
                  <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                    <EyeOff className="h-3 w-3" /> section hidden
                  </span>
                )}
              </div>
              <div className="space-y-2">
                {sectionFields.map((f, i) => (
                  <FieldRow
                    key={f.key}
                    field={f}
                    isFirst={i === 0}
                    isLast={i === sectionFields.length - 1}
                    onChange={(updated) => updateField(f.key, updated)}
                    onMoveUp={() => moveField(f.key, "up")}
                    onMoveDown={() => moveField(f.key, "down")}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <Separator className="my-6" />
      <TicketTypeCustomFieldsSection ticketTypeId={ticketTypeId} />

      <AlertDialog open={resetOpen} onOpenChange={setResetOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset to defaults?</AlertDialogTitle>
            <AlertDialogDescription>
              All customisations to the <strong>{ticketTypeName}</strong> form will be discarded
              and the form will revert to the standard ticket field defaults. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => resetMutation.mutate()}
            >
              Reset
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── FormBuilderPage ──────────────────────────────────────────────────────────

interface TicketTypeConfig {
  id:      number;
  name:    string;
  slug:    string;
  color:   string;
  isActive: boolean;
}

export default function FormBuilderPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const ticketTypeSlug = searchParams.get("ticketType");

  const [activeTab, setActiveTab] = useState<FormEntityType>("ticket");

  const { data: ticketTypesData } = useQuery<{ ticketTypes: TicketTypeConfig[] }>({
    queryKey: ["ticket-types"],
    queryFn: async () => {
      const { data } = await axios.get("/api/ticket-types");
      return data;
    },
  });
  const ticketTypes = ticketTypesData?.ticketTypes ?? [];

  // When arriving via ?ticketType=<slug> (e.g. from TicketTypesPage after creation),
  // find the matching ticket type and show the dedicated view.
  const targetTicketType = ticketTypeSlug
    ? ticketTypes.find((t) => t.slug === ticketTypeSlug)
    : null;

  if (ticketTypeSlug && targetTicketType) {
    return (
      <div>
        <button
          type="button"
          onClick={() => navigate("/admin/forms")}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-4 transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Form Builder
        </button>

        <div className="flex items-center gap-2 mb-2">
          <div
            className="h-4 w-4 rounded-full shrink-0"
            style={{ backgroundColor: targetTicketType.color }}
          />
          <Tag className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-2xl font-semibold tracking-tight">
            {targetTicketType.name} — Form
          </h1>
        </div>
        <p className="text-sm text-muted-foreground mb-6">
          Customize the fields agents see when creating a <strong>{targetTicketType.name}</strong> ticket.
          Toggle fields on or off, rename labels, adjust placeholders, and reorder them.
        </p>

        <TicketTypeEntityFormBuilder
          ticketTypeId={targetTicketType.id}
          ticketTypeName={targetTicketType.name}
        />
      </div>
    );
  }

  // If slug is present but not yet loaded (types still fetching), show nothing until ready.
  if (ticketTypeSlug && !targetTicketType && ticketTypes.length === 0) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <Settings2 className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-2xl font-semibold tracking-tight">Form Builder</h1>
      </div>
      <p className="text-sm text-muted-foreground mb-6">
        Control which fields appear on each creation form, their labels, placeholders, required
        status, and display order. Changes take effect immediately for all agents.
      </p>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as FormEntityType)}>
        <TabsList className="mb-6">
          {formEntityTypes.map((t) => (
            <TabsTrigger key={t} value={t}>
              {formEntityTypeLabel[t]}
            </TabsTrigger>
          ))}
          {ticketTypes.length > 0 && (
            <TabsTrigger value="__ticket_types__" className="gap-1.5">
              <Tag className="h-3.5 w-3.5" />
              Ticket Types
            </TabsTrigger>
          )}
        </TabsList>

        {formEntityTypes.map((t) => (
          <TabsContent key={t} value={t}>
            <EntityFormBuilder entityType={t} />
          </TabsContent>
        ))}

        {ticketTypes.length > 0 && (
          <TabsContent value="__ticket_types__">
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Select a ticket type below to customize its form, or{" "}
                <button
                  type="button"
                  className="text-primary underline-offset-4 hover:underline"
                  onClick={() => navigate("/admin/ticket-types")}
                >
                  manage ticket types
                </button>.
              </p>
              {ticketTypes.map((tt) => (
                <button
                  key={tt.id}
                  type="button"
                  className="flex items-center gap-3 w-full rounded-lg border px-4 py-3 text-left hover:bg-muted/50 transition-colors"
                  onClick={() => navigate(`/admin/forms?ticketType=${tt.slug}`)}
                >
                  <div
                    className="h-3 w-3 rounded-full shrink-0"
                    style={{ backgroundColor: tt.color }}
                  />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium">{tt.name}</span>
                    <code className="ml-2 text-[10px] text-muted-foreground font-mono">
                      {tt.slug}
                    </code>
                  </div>
                  <ArrowLeft className="h-4 w-4 text-muted-foreground rotate-180" />
                </button>
              ))}
            </div>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
