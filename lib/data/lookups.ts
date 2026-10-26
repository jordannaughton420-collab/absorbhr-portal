import "server-only";
import { createClient } from "@/lib/supabase/server";

// Departments, locations and people (for manager pickers) in the caller's company.
export async function getLookups() {
  const supabase = await createClient();
  const [{ data: departments }, { data: locations }, { data: people }] = await Promise.all([
    supabase.from("departments").select("id, name").order("name"),
    supabase.from("locations").select("id, name").order("name"),
    supabase
      .from("employee_directory")
      .select("id, first_name, preferred_name, last_name")
      .order("last_name"),
  ]);
  return {
    departments: departments ?? [],
    locations: locations ?? [],
    managers: (people ?? []).map((p) => ({
      id: p.id!,
      name: `${p.preferred_name || p.first_name} ${p.last_name}`,
    })),
  };
}
