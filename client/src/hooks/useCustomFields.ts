import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import type { FormEntityType } from "core/constants/form-fields.ts";
import type { CustomFieldType } from "core/constants/custom-field-types.ts";

export interface CustomFieldDef {
  id: number;
  entityType: FormEntityType;
  key: string;
  label: string;
  fieldType: CustomFieldType;
  placeholder: string | null;
  helpText: string | null;
  required: boolean;
  visible: boolean;
  options: string[];
  displayOrder: number;
}

export function useCustomFields(entityType: FormEntityType) {
  return useQuery<CustomFieldDef[]>({
    queryKey: ["custom-fields", entityType],
    queryFn: async () => {
      const { data } = await axios.get<{ fields: CustomFieldDef[] }>(
        `/api/custom-fields?entityType=${entityType}`
      );
      return data.fields;
    },
    staleTime: 2 * 60 * 1000,
  });
}
