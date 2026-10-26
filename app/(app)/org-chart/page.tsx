import type { Metadata } from "next";
import Link from "next/link";
import { requireContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = { title: "Org chart · AbsorbHR Portal" };

type Person = {
  id: string;
  name: string;
  jobTitle: string | null;
  department: string | null;
  managerId: string | null;
};

function Branch({ person, reports, canOpen }: { person: Person; reports: Map<string, Person[]>; canOpen: (id: string) => boolean }) {
  const children = reports.get(person.id) ?? [];
  const card = (
    <div className="inline-block min-w-56 rounded-xl border bg-card px-4 py-3 shadow-sm">
      {canOpen(person.id) ? (
        <Link href={`/employees/${person.id}`} className="font-medium text-primary underline-offset-4 hover:underline">
          {person.name}
        </Link>
      ) : (
        <p className="font-medium">{person.name}</p>
      )}
      <p className="text-sm text-muted-foreground">{[person.jobTitle, person.department].filter(Boolean).join(" · ")}</p>
    </div>
  );

  return (
    <li className="relative pl-6 before:absolute before:left-0 before:top-6 before:h-px before:w-5 before:bg-border">
      {children.length ? (
        <details open>
          <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
            {card}
            <span className="ml-2 text-xs text-muted-foreground">
              {children.length} direct report{children.length === 1 ? "" : "s"}
            </span>
          </summary>
          <ul className="mt-2 space-y-2 border-l pl-2">
            {children.map((c) => (
              <Branch key={c.id} person={c} reports={reports} canOpen={canOpen} />
            ))}
          </ul>
        </details>
      ) : (
        card
      )}
    </li>
  );
}

export default async function OrgChartPage() {
  const ctx = await requireContext();
  const supabase = await createClient();
  const [{ data }, { data: visible }] = await Promise.all([
    supabase.from("employee_directory").select("id, first_name, preferred_name, last_name, job_title, department_name, manager_id"),
    supabase.from("employees").select("id"), // profiles this user may open (RLS)
  ]);

  const people: Person[] = (data ?? []).map((p) => ({
    id: p.id!,
    name: `${p.preferred_name || p.first_name} ${p.last_name}`,
    jobTitle: p.job_title,
    department: p.department_name,
    managerId: p.manager_id,
  }));
  const ids = new Set(people.map((p) => p.id));
  const reports = new Map<string, Person[]>();
  for (const p of people) {
    if (p.managerId && ids.has(p.managerId)) reports.set(p.managerId, [...(reports.get(p.managerId) ?? []), p]);
  }
  for (const list of reports.values()) list.sort((a, b) => a.name.localeCompare(b.name));
  const roots = people.filter((p) => !p.managerId || !ids.has(p.managerId)).sort((a, b) => a.name.localeCompare(b.name));
  const openable = new Set((visible ?? []).map((v) => v.id));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Org chart</h1>
        <p className="text-sm text-muted-foreground">
          {people.length} people in {ctx.supportSession?.tenantName ?? ctx.tenantName}. Select a name with reports to expand or
          collapse their team.
        </p>
      </div>
      <Card className="overflow-x-auto p-4 sm:p-6">
        {roots.length ? (
          <ul className="space-y-3 -ml-6">
            {roots.map((r) => (
              <Branch key={r.id} person={r} reports={reports} canOpen={(id) => openable.has(id)} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No people yet.</p>
        )}
      </Card>
    </div>
  );
}
