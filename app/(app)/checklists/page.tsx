import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/format";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/feedback";
import { buttonVariants } from "@/components/ui/button";
import { Table, Td, Th } from "@/components/ui/table";
import { StartChecklistForm } from "./checklist-forms";

export const metadata: Metadata = { title: "Checklists · AbsorbHR Portal" };

export default async function ChecklistsPage() {
  const ctx = await requireContext();
  if (!ctx.tenantId && !ctx.supportSession) redirect("/dashboard");
  const supabase = await createClient();
  // RLS: HR sees all; managers their direct reports'; employees their own.
  const [{ data: lists }, { data: items }, { data: directory }, { data: templates }] =
    await Promise.all([
      supabase
        .from("checklists")
        .select("id, employee_id, kind, title, anchor_date, created_at")
        .order("created_at", { ascending: false }),
      supabase.from("checklist_items").select("checklist_id, completed_at"),
      supabase
        .from("employee_directory")
        .select("id, first_name, preferred_name, last_name")
        .order("last_name"),
      ctx.isHr
        ? supabase
            .from("checklist_templates")
            .select("id, name, kind")
            .eq("active", true)
            .order("kind")
        : Promise.resolve({ data: null }),
    ]);
  const names = new Map(
    (directory ?? []).map((d) => [d.id!, `${d.preferred_name || d.first_name} ${d.last_name}`]),
  );
  const progress = new Map<string, { done: number; total: number }>();
  for (const i of items ?? []) {
    const p = progress.get(i.checklist_id) ?? { done: 0, total: 0 };
    p.total += 1;
    if (i.completed_at) p.done += 1;
    progress.set(i.checklist_id, p);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Onboarding and offboarding</h1>
          <p className="text-sm text-muted-foreground">
            Checklists of tasks for HR, line managers and the person joining or leaving.
          </p>
        </div>
        {ctx.isHr && (
          <Link href="/checklists/templates" className={buttonVariants({ variant: "outline" })}>
            Edit templates
          </Link>
        )}
      </div>

      {ctx.isHr && templates && (
        <Card>
          <CardHeader>
            <CardTitle>Start a checklist</CardTitle>
          </CardHeader>
          <CardContent>
            <StartChecklistForm
              people={(directory ?? []).map((d) => ({ id: d.id!, name: names.get(d.id!)! }))}
              templates={templates}
            />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Checklists</CardTitle>
          {!ctx.isHr && (
            <CardDescription>Your own, and those for people who report to you.</CardDescription>
          )}
        </CardHeader>
        <CardContent>
          {lists?.length ? (
            <Table>
              <thead>
                <tr>
                  <Th>Person</Th>
                  <Th>Checklist</Th>
                  <Th className="hidden sm:table-cell">Date</Th>
                  <Th>Progress</Th>
                </tr>
              </thead>
              <tbody>
                {lists.map((l) => {
                  const p = progress.get(l.id) ?? { done: 0, total: 0 };
                  const complete = p.total > 0 && p.done === p.total;
                  return (
                    <tr key={l.id}>
                      <Td>
                        <Link
                          href={`/checklists/${l.id}`}
                          className="font-medium text-primary underline-offset-4 hover:underline"
                        >
                          {names.get(l.employee_id) ?? "Former employee"}
                        </Link>
                      </Td>
                      <Td>
                        {l.title}{" "}
                        <Badge variant="muted" className="ml-1">
                          {l.kind}
                        </Badge>
                      </Td>
                      <Td className="hidden sm:table-cell">{formatDate(l.anchor_date)}</Td>
                      <Td>
                        <Badge variant={complete ? "success" : "warning"}>
                          {p.done} of {p.total} done
                        </Badge>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">No checklists yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
