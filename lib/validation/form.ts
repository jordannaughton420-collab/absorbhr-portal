import type { z } from "zod";

// Turns FormData into a plain object, mapping empty strings to undefined so
// optional fields stay optional.
export function formToObject(formData: FormData) {
  const out: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("$ACTION")) continue;
    out[key] = typeof value === "string" && value.trim() === "" ? undefined : value;
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
