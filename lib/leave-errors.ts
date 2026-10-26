import "server-only";
import { safeError } from "@/lib/errors";

// The leave/sickness database functions attach a machine-readable hint to rule failures.
const HINTS: Record<string, string> = {
  overlap: "This overlaps with leave or sickness that's already booked.",
  insufficient: "There isn't enough holiday left for this request (pending requests count too).",
  span_years: "Requests can't cross into the next leave year — please book each year separately.",
  no_days: "There are no working days in those dates (weekends and bank holidays don't count).",
  not_configured:
    "Your company hasn't finished setting up its holiday rules yet. Please ask your HR team.",
  not_pending: "This request has already been dealt with.",
  not_cancellable: "This request can't be cancelled.",
};

export function leaveError(error: unknown, context: string): { ok: false; error: string } {
  const hint =
    typeof error === "object" && error && "hint" in error
      ? String((error as { hint: unknown }).hint)
      : "";
  if (HINTS[hint]) return { ok: false, error: HINTS[hint] };
  return safeError(error, context);
}
