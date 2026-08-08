// Shared model for dynamic service-request forms (stored as JSON on Service.formSchema).

export const FIELD_TYPES = [
  "text",
  "textarea",
  "select",
  "number",
  "date",
  "checkbox",
] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export type ServiceField = {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  options?: string[]; // for select
  placeholder?: string;
  help?: string;
};

export function parseFormSchema(json: string | null | undefined): ServiceField[] {
  if (!json) return [];
  try {
    const arr = JSON.parse(json);
    if (!Array.isArray(arr)) return [];
    return arr.filter((f) => f && typeof f.key === "string" && typeof f.label === "string");
  } catch {
    return [];
  }
}

/** Validate submitted answers against a schema. Returns {values, errors}. */
export function validateAnswers(
  fields: ServiceField[],
  data: Record<string, string>,
): { values: Record<string, unknown>; errors: Record<string, string> } {
  const values: Record<string, unknown> = {};
  const errors: Record<string, string> = {};
  for (const f of fields) {
    const raw = data[`f_${f.key}`];
    if (f.type === "checkbox") {
      values[f.key] = raw === "on" || raw === "true";
      if (f.required && !values[f.key]) errors[f.key] = "Required";
      continue;
    }
    const v = (raw ?? "").trim();
    if (f.required && !v) {
      errors[f.key] = "This field is required";
      continue;
    }
    if (f.type === "number" && v && Number.isNaN(Number(v))) {
      errors[f.key] = "Must be a number";
      continue;
    }
    values[f.key] = v;
  }
  return { values, errors };
}

/** Render answers as a readable text block (for ticket description / email). */
export function answersToText(fields: ServiceField[], values: Record<string, unknown>) {
  return fields
    .map((f) => {
      const v = values[f.key];
      const shown = f.type === "checkbox" ? (v ? "Yes" : "No") : String(v ?? "—");
      return `• ${f.label}: ${shown}`;
    })
    .join("\n");
}
