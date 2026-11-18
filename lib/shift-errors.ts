import "server-only";
import { safeError } from "@/lib/errors";

// The shift database functions attach a machine-readable hint to rule failures.
const HINTS: Record<string, string> = {
  overlap: "This person already has a shift at that time.",
  rest_break:
    "This would give the person less than 11 hours' rest between shifts (Working Time Regulations). Tick “Allow a shorter rest break” only if there's a valid reason, such as an agreed shift-work exception.",
  on_leave: "This person is on approved leave that day.",
  off_sick: "This person is recorded as off sick that day.",
  leaver: "This person has left the company.",
  in_past: "That shift has already started. Choose a time in the future.",
  no_one_available:
    "Nobody you chose is free for that shift, so it wasn't posted. Try other people or another time.",
  no_people: "Choose a group or tick at least one person.",
  bad_group: "That group doesn't exist any more. Please refresh the page.",
  bad_location: "That location doesn't exist any more. Please refresh the page.",
  shift_taken: "Sorry, someone else has already accepted this shift.",
  shift_closed: "This shift has already started, so it can't be changed or accepted now.",
  shift_cancelled: "This shift has been cancelled.",
  not_pending: "You've already answered this one.",
  not_in_group: "That person isn't in the group.",
};

export function shiftError(error: unknown, context: string): { ok: false; error: string } {
  const hint =
    typeof error === "object" && error && "hint" in error
      ? String((error as { hint: unknown }).hint)
      : "";
  if (HINTS[hint]) return { ok: false, error: HINTS[hint] };
  return safeError(error, context);
}
