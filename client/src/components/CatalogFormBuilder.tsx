import { useState } from "react";
import { FORM_FIELD_TYPES, FORM_FIELD_TYPE_LABEL } from "core/constants/catalog.ts";
import type { FormField, FormFieldType } from "core/constants/catalog.ts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GripVertical, Trash2, Plus, ChevronDown, ChevronUp } from "lucide-react";

interface Props {
  value: FormField[];
  onChange: (fields: FormField[]) => void;
}

function generateId(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/^(\d)/, "f_$1") || "field";
}

function makeUnique(id: string, existing: string[]): string {
  if (!existing.includes(id)) return id;
  let n = 2;
  while (existing.includes(`${id}_${n}`)) n++;
  return `${id}_${n}`;
}

const OPTION_TYPES: FormFieldType[] = ["select", "multiselect"];

interface FieldEditorProps {
  field: FormField;
  index: number;
  total: number;
  existingIds: string[];
  onChange: (updated: FormField) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}

function FieldEditor({ field, index, total, existingIds, onChange, onRemove, onMove }: FieldEditorProps) {
  const [expanded, setExpanded] = useState(true);
  const [optionInput, setOptionInput] = useState("");

  const update = (partial: Partial<FormField>) => onChange({ ...field, ...partial });

  const addOption = () => {
    const trimmed = optionInput.trim();
    if (!trimmed) return;
    const value = trimmed.toLowerCase().replace(/\s+/g, "_");
    update({ options: [...(field.options ?? []), { label: trimmed, value }] });
    setOptionInput("");
  };

  return (
    <Card className="border">
      <CardHeader className="py-2 px-3">
        <div className="flex items-center gap-2">
          <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
          <CardTitle className="text-sm font-medium flex-1">
            {field.label || <span className="text-muted-foreground italic">Untitled field</span>}
            <span className="ml-2 text-xs text-muted-foreground font-normal">
              {FORM_FIELD_TYPE_LABEL[field.type]}
            </span>
          </CardTitle>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              disabled={index === 0}
              onClick={() => onMove(-1)}
            >
              <ChevronUp className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              disabled={index === total - 1}
              onClick={() => onMove(1)}
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => setExpanded((x) => !x)}
            >
              {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-destructive hover:text-destructive"
              onClick={onRemove}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="pt-0 px-3 pb-3 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Label *</Label>
              <Input
                value={field.label}
                placeholder="Field label"
                onChange={(e) => {
                  const newLabel = e.target.value;
                  // Auto-generate ID if label was empty before
                  const newId = field.label === "" && newLabel !== ""
                    ? makeUnique(generateId(newLabel), existingIds.filter((x) => x !== field.id))
                    : field.id;
                  update({ label: newLabel, id: newId });
                }}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Field ID *</Label>
              <Input
                value={field.id}
                placeholder="field_id"
                onChange={(e) => update({ id: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Type</Label>
              <Select
                value={field.type}
                onValueChange={(v) => update({ type: v as FormFieldType, options: OPTION_TYPES.includes(v as FormFieldType) ? (field.options ?? []) : undefined })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FORM_FIELD_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{FORM_FIELD_TYPE_LABEL[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Placeholder</Label>
              <Input
                value={field.placeholder ?? ""}
                placeholder="Optional placeholder"
                onChange={(e) => update({ placeholder: e.target.value || undefined })}
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Help text</Label>
            <Textarea
              value={field.helpText ?? ""}
              placeholder="Optional help text shown below the field"
              rows={2}
              onChange={(e) => update({ helpText: e.target.value || undefined })}
            />
          </div>

          {(field.type === "number") && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Min</Label>
                <Input
                  type="number"
                  value={field.min ?? ""}
                  onChange={(e) => update({ min: e.target.value === "" ? undefined : Number(e.target.value) })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Max</Label>
                <Input
                  type="number"
                  value={field.max ?? ""}
                  onChange={(e) => update({ max: e.target.value === "" ? undefined : Number(e.target.value) })}
                />
              </div>
            </div>
          )}

          {OPTION_TYPES.includes(field.type) && (
            <div className="space-y-2">
              <Label className="text-xs">Options</Label>
              {(field.options ?? []).map((opt, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    value={opt.label}
                    className="flex-1"
                    onChange={(e) => {
                      const opts = [...(field.options ?? [])];
                      opts[i] = { ...opts[i], label: e.target.value };
                      update({ options: opts });
                    }}
                  />
                  <Input
                    value={opt.value}
                    className="w-32 font-mono text-xs"
                    placeholder="value"
                    onChange={(e) => {
                      const opts = [...(field.options ?? [])];
                      opts[i] = { ...opts[i], value: e.target.value };
                      update({ options: opts });
                    }}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive shrink-0"
                    onClick={() => update({ options: (field.options ?? []).filter((_, j) => j !== i) })}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
              <div className="flex gap-2">
                <Input
                  value={optionInput}
                  placeholder="Add option label..."
                  onChange={(e) => setOptionInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addOption(); } }}
                />
                <Button type="button" variant="outline" size="sm" onClick={addOption}>
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Add
                </Button>
              </div>
            </div>
          )}

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id={`req-${field.id}`}
              checked={field.required}
              onChange={(e) => update({ required: e.target.checked })}
              className="h-4 w-4 rounded border-border accent-primary cursor-pointer"
            />
            <label htmlFor={`req-${field.id}`} className="text-sm cursor-pointer">
              Required field
            </label>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

export default function CatalogFormBuilder({ value, onChange }: Props) {
  const addField = () => {
    const existingIds = value.map((f) => f.id);
    const id = makeUnique("field", existingIds);
    onChange([
      ...value,
      { id, type: "text", label: "", required: false },
    ]);
  };

  const updateField = (index: number, updated: FormField) => {
    const next = [...value];
    next[index] = updated;
    onChange(next);
  };

  const removeField = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };

  const moveField = (index: number, dir: -1 | 1) => {
    const next = [...value];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  return (
    <div className="space-y-3">
      {value.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4 border rounded-md">
          No fields yet. Add a field to build your form.
        </p>
      )}
      {value.map((field, i) => (
        <FieldEditor
          key={field.id + i}
          field={field}
          index={i}
          total={value.length}
          existingIds={value.map((f) => f.id)}
          onChange={(updated) => updateField(i, updated)}
          onRemove={() => removeField(i)}
          onMove={(dir) => moveField(i, dir)}
        />
      ))}
      <Button type="button" variant="outline" className="w-full" onClick={addField}>
        <Plus className="h-4 w-4 mr-2" />
        Add field
      </Button>
    </div>
  );
}
