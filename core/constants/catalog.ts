/**
 * Service Catalog — constants, field types, and domain interfaces.
 * Shared between server and client.
 */

// ── Form field types ───────────────────────────────────────────────────────────

export type FormFieldType =
  | "text"
  | "textarea"
  | "number"
  | "email"
  | "select"
  | "multiselect"
  | "checkbox"
  | "date";

export const FORM_FIELD_TYPES: FormFieldType[] = [
  "text", "textarea", "number", "email",
  "select", "multiselect", "checkbox", "date",
];

export const FORM_FIELD_TYPE_LABEL: Record<FormFieldType, string> = {
  text:        "Text",
  textarea:    "Long Text",
  number:      "Number",
  email:       "Email",
  select:      "Dropdown",
  multiselect: "Multi-Select",
  checkbox:    "Checkbox",
  date:        "Date",
};

// ── Form schema types ─────────────────────────────────────────────────────────

export interface FormFieldOption {
  label: string;
  value: string;
}

export interface FormField {
  /** Unique key used as the formData property name. Snake_case recommended. */
  id: string;
  type: FormFieldType;
  label: string;
  placeholder?: string;
  required: boolean;
  helpText?: string;
  /** For select/multiselect */
  options?: FormFieldOption[];
  /** For number fields */
  min?: number;
  max?: number;
  /** Default value pre-filled in the form */
  defaultValue?: string | number | boolean | string[];
}

export type FormSchema = FormField[];

// ── Visibility ────────────────────────────────────────────────────────────────

/** Who can see and request a catalog item. */
export type CatalogVisibility = "internal" | "portal" | "both";

export const CATALOG_VISIBILITIES: CatalogVisibility[] = ["internal", "portal", "both"];

export const CATALOG_VISIBILITY_LABEL: Record<CatalogVisibility, string> = {
  internal: "Agents only",
  portal:   "Customer portal only",
  both:     "Agents & customer portal",
};

export const CATALOG_VISIBILITY_DESCRIPTION: Record<CatalogVisibility, string> = {
  internal: "Visible to internal agents in the agent service catalog. Hidden from the customer portal.",
  portal:   "Visible to customers in the portal. Hidden from the agent catalog.",
  both:     "Visible everywhere — to agents and to customers in the portal.",
};

// ── Domain interfaces (API response shapes) ───────────────────────────────────

export interface CatalogCategorySummary {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  position: number;
  isActive: boolean;
}

export interface CatalogItemSummary {
  id: number;
  name: string;
  shortDescription: string | null;
  icon: string | null;
  isActive: boolean;
  visibility: CatalogVisibility;
  requiresApproval: boolean;
  category: CatalogCategorySummary | null;
  fulfillmentTeam: { id: number; name: string; color: string } | null;
  position: number;
  createdAt: string;
  updatedAt: string;
}

export interface CatalogItemDetail extends CatalogItemSummary {
  description: string | null;
  requestorInstructions: string | null;
  formSchema: FormSchema;
  approvalMode: string;
  approverIds: string[];
}

export interface CatalogWithItems {
  category: CatalogCategorySummary | null;
  items: CatalogItemSummary[];
}
