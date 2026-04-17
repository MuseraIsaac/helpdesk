import { Controller, type Control, type FieldErrors } from "react-hook-form";
import type { FormField } from "core/constants/catalog.ts";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import ErrorMessage from "@/components/ErrorMessage";

interface Props {
  fields: FormField[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  control: Control<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  errors: FieldErrors<any>;
}

export default function CatalogFormRenderer({ fields, control, errors }: Props) {
  if (fields.length === 0) return null;

  return (
    <div className="space-y-4">
      {fields.map((field) => {
        const fieldPath = `formData.${field.id}`;
        const fieldError = (errors.formData as Record<string, { message?: string }> | undefined)?.[field.id];

        return (
          <div key={field.id} className="space-y-1.5">
            <Label htmlFor={field.id}>
              {field.label}
              {field.required && <span className="text-destructive ml-1">*</span>}
            </Label>

            {field.helpText && (
              <p className="text-xs text-muted-foreground">{field.helpText}</p>
            )}

            <Controller
              name={fieldPath}
              control={control}
              defaultValue={field.defaultValue ?? (field.type === "checkbox" ? false : field.type === "multiselect" ? [] : "")}
              render={({ field: f }) => {
                switch (field.type) {
                  case "text":
                  case "email":
                    return (
                      <Input
                        id={field.id}
                        type={field.type}
                        placeholder={field.placeholder}
                        value={f.value ?? ""}
                        onChange={f.onChange}
                      />
                    );

                  case "textarea":
                    return (
                      <Textarea
                        id={field.id}
                        placeholder={field.placeholder}
                        rows={4}
                        value={f.value ?? ""}
                        onChange={f.onChange}
                      />
                    );

                  case "number":
                    return (
                      <Input
                        id={field.id}
                        type="number"
                        placeholder={field.placeholder}
                        min={field.min}
                        max={field.max}
                        value={f.value ?? ""}
                        onChange={(e) => f.onChange(e.target.value === "" ? "" : Number(e.target.value))}
                      />
                    );

                  case "date":
                    return (
                      <Input
                        id={field.id}
                        type="date"
                        value={f.value ?? ""}
                        onChange={f.onChange}
                      />
                    );

                  case "select":
                    return (
                      <Select value={f.value ?? ""} onValueChange={f.onChange}>
                        <SelectTrigger id={field.id}>
                          <SelectValue placeholder={field.placeholder ?? "Select an option"} />
                        </SelectTrigger>
                        <SelectContent>
                          {(field.options ?? []).map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    );

                  case "multiselect":
                    return (
                      <div className="space-y-2 rounded-md border p-3">
                        {(field.options ?? []).map((opt) => {
                          const selected: string[] = Array.isArray(f.value) ? f.value : [];
                          const checked = selected.includes(opt.value);
                          return (
                            <div key={opt.value} className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                id={`${field.id}-${opt.value}`}
                                checked={checked}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    f.onChange([...selected, opt.value]);
                                  } else {
                                    f.onChange(selected.filter((v) => v !== opt.value));
                                  }
                                }}
                                className="h-4 w-4 rounded border-border accent-primary cursor-pointer"
                              />
                              <label
                                htmlFor={`${field.id}-${opt.value}`}
                                className="text-sm cursor-pointer"
                              >
                                {opt.label}
                              </label>
                            </div>
                          );
                        })}
                      </div>
                    );

                  case "checkbox":
                    return (
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id={field.id}
                          checked={!!f.value}
                          onChange={(e) => f.onChange(e.target.checked)}
                          className="h-4 w-4 rounded border-border accent-primary cursor-pointer"
                        />
                        <label htmlFor={field.id} className="text-sm cursor-pointer">
                          {field.placeholder ?? field.label}
                        </label>
                      </div>
                    );

                  default:
                    return <Input id={field.id} value={f.value ?? ""} onChange={f.onChange} />;
                }
              }}
            />

            {fieldError && <ErrorMessage message={fieldError.message} />}
          </div>
        );
      })}
    </div>
  );
}
