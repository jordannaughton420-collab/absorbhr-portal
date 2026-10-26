import "server-only";
import { createClient } from "@/lib/supabase/server";

type LoggableAction =
  "view" | "export" | "login" | "logout" | "mfa_enrolled" | "mfa_verified" | "acknowledge";

// Records reads/exports/logins in the append-only audit log. Writes (create/update/delete)
// are logged automatically by database triggers. Never put personal data in `metadata`.
export async function logEvent(
  action: LoggableAction,
  entity: string,
  opts: {
    entityId?: string;
    subjectEmployeeId?: string;
    metadata?: Record<string, string | number | boolean>;
  } = {},
) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("log_event", {
    p_action: action,
    p_entity: entity,
    p_entity_id: opts.entityId,
    p_subject_employee_id: opts.subjectEmployeeId,
    p_metadata: opts.metadata ?? {},
  });
  if (error) console.error(JSON.stringify({ level: "error", context: "audit", code: error.code }));
}
