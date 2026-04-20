import { Controller, useFormContext } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import ErrorMessage from "@/components/ErrorMessage";
import type { CustomFieldDef } from "@/hooks/useCustomFields";

interface Props {
  fields: CustomFieldDef[];
}

/**
 * Renders admin-defined custom fields inside any react-hook-form context.
 * Values are stored under `customFields.<key>` in the form state.
 * Must be used inside a <FormProvider> (or a form that calls useForm).
 */
export default function DynamicCustomFields({ fields }: Props) {
  const { register, control, formState: { errors } } = useFormContext();

  const visible = fields.filter((f) => f.visible);
  if (visible.length === 0) return null;

  const customErrors = (errors as any).customFields ?? {};

  return (
    <>
      <Separator />
      <div>
        <div className="flex items-center gap-3 mb-4">
          <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70">
            Additional Fields
          </span>
          <div className="flex-1 h-px bg-border" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          {visible.map((f) => {
            const fieldPath = `customFields.${f.key}` as const;
            const fieldError = customErrors[f.key];

            return (
              <div
                key={f.key}
                className={
                  f.fieldType === "textarea" ||
                  f.fieldType === "multiselect" ||
                  f.fieldType === "switch"
                    ? "col-span-2 space-y-1.5"
                    : "space-y-1.5"
                }
              >
                <Label className="text-xs font-medium text-foreground">
                  {f.label}
                  {f.required && <span className="text-destructive ml-0.5">*</span>}
                </Label>

                {/* text / email / url / number */}
                {(f.fieldType === "text" ||
                  f.fieldType === "email" ||
                  f.fieldType === "url" ||
                  f.fieldType === "number") && (
                  <Input
                    type={
                      f.fieldType === "number"
                        ? "number"
                        : f.fieldType === "email"
                        ? "email"
                        : f.fieldType === "url"
                        ? "url"
                        : "text"
                    }
                    placeholder={f.placeholder ?? ""}
                    {...register(fieldPath, {
                      required: f.required ? `${f.label} is required` : false,
                      ...(f.fieldType === "number" && { valueAsNumber: true }),
                    })}
                  />
                )}

                {/* textarea */}
                {f.fieldType === "textarea" && (
                  <Textarea
                    placeholder={f.placeholder ?? ""}
                    className="min-h-[80px] resize-y"
                    {...register(fieldPath, {
                      required: f.required ? `${f.label} is required` : false,
                    })}
                  />
                )}

                {/* date */}
                {f.fieldType === "date" && (
                  <Input
                    type="date"
                    {...register(fieldPath, {
                      required: f.required ? `${f.label} is required` : false,
                    })}
                  />
                )}

                {/* switch (boolean) */}
                {f.fieldType === "switch" && (
                  <div className="flex items-center gap-3">
                    <Controller
                      name={fieldPath}
                      control={control}
                      defaultValue={false}
                      rules={{ required: false }}
                      render={({ field }) => (
                        <Switch
                          checked={!!field.value}
                          onCheckedChange={field.onChange}
                        />
                      )}
                    />
                    {f.helpText && (
                      <span className="text-xs text-muted-foreground">{f.helpText}</span>
                    )}
                  </div>
                )}

                {/* select (single) */}
                {f.fieldType === "select" && (
                  <Controller
                    name={fieldPath}
                    control={control}
                    defaultValue=""
                    rules={{
                      required: f.required ? `${f.label} is required` : false,
                      validate: f.required
                        ? (v) => (v && v !== "__none__") || `${f.label} is required`
                        : undefined,
                    }}
                    render={({ field }) => (
                      <Select
                        value={(field.value as string) || "__none__"}
                        onValueChange={(v) => field.onChange(v === "__none__" ? "" : v)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={f.placeholder ?? "Select…"} />
                        </SelectTrigger>
                        <SelectContent>
                          {!f.required && <SelectItem value="__none__">None</SelectItem>}
                          {f.options.map((opt) => (
                            <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                )}

                {/* multiselect */}
                {f.fieldType === "multiselect" && (
                  <Controller
                    name={fieldPath}
                    control={control}
                    defaultValue={[]}
                    rules={{
                      validate: f.required
                        ? (v) =>
                            Array.isArray(v) && v.length > 0
                              ? true
                              : `${f.label} requires at least one selection`
                        : undefined,
                    }}
                    render={({ field }) => {
                      const selected: string[] = Array.isArray(field.value) ? field.value : [];
                      return (
                        <div className="rounded-md border divide-y max-h-40 overflow-y-auto">
                          {f.options.map((opt) => {
                            const checked = selected.includes(opt);
                            return (
                              <label
                                key={opt}
                                className={`flex items-center gap-2 px-3 py-2 cursor-pointer text-sm transition-colors ${
                                  checked ? "bg-primary/5" : "hover:bg-muted/50"
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(e) => {
                                    const next = e.target.checked
                                      ? [...selected, opt]
                                      : selected.filter((s) => s !== opt);
                                    field.onChange(next);
                                  }}
                                  className="accent-primary"
                                />
                                {opt}
                              </label>
                            );
                          })}
                        </div>
                      );
                    }}
                  />
                )}

                {/* help text (non-switch) */}
                {f.fieldType !== "switch" && f.helpText && (
                  <p className="text-[11px] text-muted-foreground">{f.helpText}</p>
                )}

                {fieldError && (
                  <ErrorMessage message={(fieldError as any).message} />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
