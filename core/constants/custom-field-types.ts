export const customFieldTypes = [
  "text",
  "textarea",
  "number",
  "select",
  "multiselect",
  "date",
  "switch",
  "email",
  "url",
] as const;

export type CustomFieldType = (typeof customFieldTypes)[number];

export const customFieldTypeLabel: Record<CustomFieldType, string> = {
  text:        "Short Text",
  textarea:    "Long Text",
  number:      "Number",
  select:      "Dropdown (single)",
  multiselect: "Dropdown (multi)",
  date:        "Date",
  switch:      "Yes / No toggle",
  email:       "Email",
  url:         "URL",
};
