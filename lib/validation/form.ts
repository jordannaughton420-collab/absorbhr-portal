import type { z } from "zod";

// Turns FormData into a plain object, mapping empty strings to undefined so
// optional fields stay optional. Repeated keys become arrays.
export function formToObject(formData: FormData) {
  const out: Record<string, unknown> = {};
  for (const key of new Set(formData.keys())) {
    if (key.startsWith("$ACTION")) continue;
    const values = formData.getAll(key);
    if (values.length > 1) {
      // Tick-box groups (e.g. working days): keep every non-empty value.
      out[key] = values.filter((v) => !(typeof v === "string" && v.trim() === ""));
    } else {
      const value = values[0];
      out[key] = typeof value === "string" && value.trim() === "" ? undefined : value;
    }
  }
  return out;
}

export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "form";
    out[key] ??= issue.message;
  }
  return out;
}

export function parseForm<S extends z.ZodType>(schema: S, formData: FormData) {
  return schema.safeParse(formToObject(formData)) as z.ZodSafeParseResult<z.infer<S>>;
}
