import { z } from "zod/v4";
import { formEntityTypes } from "../constants/form-fields";

export const formFieldConfigSchema = z.object({
  key:         z.string(),
  visible:     z.boolean(),
  required:    z.boolean(),
  label:       z.string().max(120),
  placeholder: z.string().max(255),
  order:       z.number().int().min(0),
});

export type FormFieldConfig = z.infer<typeof formFieldConfigSchema>;

export const saveFormDefinitionSchema = z.object({
  fields: z.array(formFieldConfigSchema).min(1),
});

export type SaveFormDefinitionInput = z.infer<typeof saveFormDefinitionSchema>;

export const formEntityTypeSchema = z.enum(
  formEntityTypes as [string, ...string[]]
);
