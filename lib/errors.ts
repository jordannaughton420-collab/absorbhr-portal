import "server-only";
import { randomUUID } from "node:crypto";

// Database error messages can contain personal data (e.g. "Key (work_email)=(...) already exists"),
// so they are NEVER shown to users or written to logs. We log only the error code and a
// reference number the user can quote to support.

export type ActionResult<T = undefined> =
  | { ok: true; data?: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

const FRIENDLY: Record<string, string> = {
  "23505": "That value is already in use. Please use a different one.",
  "23503": "That refers to something that no longer exists or belongs to another company.",
  "23514": "Some of the details are not valid. Please check and try again.",
  "42501": "You don't have permission to do that.",
  "22023": "Some of the details are not valid. Please check and try again.",
  PGRST116: "We couldn't find that record.",
};

export function safeError(error: unknown, context: string): { ok: false; error: string } {
  const ref = randomUUID().slice(0, 8).toUpperCase();
  const code =
    typeof error === "object" && error && "code" in error ? String((error as { code: unknown }).code) : "unknown";
  console.error(JSON.stringify({ level: "error", ref, context, code }));
  return { ok: false, error: `${FRIENDLY[code] ?? "Something went wrong."} (Ref ${ref})` };
}
