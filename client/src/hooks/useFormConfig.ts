import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { FORM_FIELD_REGISTRY } from "core/constants/form-fields.ts";
import type { FormEntityType } from "core/constants/form-fields.ts";
import type { FormFieldConfig } from "core/schemas/form-definitions.ts";

interface FormDefinitionResponse {
  entityType: FormEntityType;
  fields: FormFieldConfig[];
  isDefault: boolean;
}

/**
 * Returns helpers to read per-field config driven by the admin form builder.
 * Falls back to registry defaults while loading or on error.
 */
export function useFormConfig(entityType: FormEntityType) {
  const { data, isLoading } = useQuery<FormDefinitionResponse>({
    queryKey: ["form-definition", entityType],
    queryFn: async () => {
      const { data } = await axios.get<FormDefinitionResponse>(
        `/api/form-definitions/${entityType}`
      );
      return data;
    },
    staleTime: 5 * 60 * 1000,
  });

  const fieldMap = new Map<string, FormFieldConfig>(
    (data?.fields ?? []).map((f) => [f.key, f])
  );

  function getField(key: string): FormFieldConfig {
    const saved = fieldMap.get(key);
    if (saved) return saved;
    const def = FORM_FIELD_REGISTRY[entityType].find((f) => f.key === key);
    return {
      key,
      visible:     true,
      required:    def?.required ?? false,
      label:       def?.label ?? key,
      placeholder: def?.placeholder ?? "",
      order:       def?.order ?? 999,
    };
  }

  return {
    isLoading,
    /** Whether the field should be rendered at all. */
    visible:     (key: string) => getField(key).visible,
    /** Whether the field is required (may be elevated by admin). */
    required:    (key: string) => getField(key).required,
    /** Admin-overridden label, falls back to registry default. */
    label:       (key: string) => getField(key).label,
    /** Admin-overridden placeholder, falls back to registry default. */
    placeholder: (key: string) => getField(key).placeholder,
    /** Full field config object. */
    field:       (key: string) => getField(key),
  };
}
