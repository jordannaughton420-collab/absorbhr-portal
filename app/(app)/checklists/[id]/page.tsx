import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, Circle } from "lucide-react";
import { requireContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { daysUntil, formatDate } from "@/lib/format";
import { ASSIGNEES } from "@/lib/validation/people";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import { deleteChecklist, setItem } from "../actions";

export const metadata: Metadata = { title: "Checklist · AbsorbHR Portal" };

export default async function ChecklistPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const ctx = await requireContext();
  const supabase = await createClient();
  const { data: list } = await supabase.from("checklists").select("*").eq("id", id).maybeSingle();
  if (!list) notFound();
  const [{ data: items }, { data: person }] = await Promise.all([
    supabase.from("checklist_items").select("*").eq("checklist_id", id).order("position"),
    supabase
      .from("employees")
      .select("first_name, preferred_name, last_name, manager_id")
      .eq("id", list.employee_id)
      .maybeSingle(),
  ]);
  const isSelf = ctx.employeeId === list.employee_id;
  const isManager = Boolean(ctx.employeeId) && person?.manager_id === ctx.employeeId;
  const canTick = (assignee: string) =>
    ctx.isHr || (assignee === "manager" && isManager) || (assignee === "employee" && isSelf);
  const name = person
    ? `${person.preferred_name || person.first_name} ${person.last_name}`
    : "Employee";
  const done = (items ?? []).filter((i) => i.completed_at).length;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/checklists"
          className="text-sm text-primary underline-offset-4 hover:underline"
        >
          ← Checklists
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          {list.title}: {isSelf ? "you" : name}
        </h1>
        <p className="text-muted-foreground">
          {list.kind === "onboarding" ? "Start date" : "Leaving date"}{" "}
          {formatDate(list.anchor_date)} · {done} of {items?.length ?? 0} done
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Tasks</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="divide-y">
            {(items ?? []).map((i) => {
              const overdue = !i.completed_at && i.due_date && daysUntil(i.due_date) < 0;
              const mine = canTick(i.assignee);
              return (
                <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="flex items-start gap-3">
                    {i.completed_at ? (
                      <CheckCircle2
                        className="mt-0.5 size-5 shrink-0 text-success"
                        aria-hidden="true"
                      />
                    ) : (
                      <Circle
                        className="mt-0.5 size-5 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                    )}
                    <div>
                      <p
                        className={
                          i.completed_at ? "text-muted-foreground line-through" : "font-medium"
                        }
                      >
                        {i.title}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {ASSIGNEES[i.assignee as keyof typeof ASSIGNEES]}
                        {i.due_date && ` · due ${formatDate(i.due_date)}`}
                        {i.completed_at && ` · done ${formatDate(i.completed_at)}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {overdue && <Badge variant="destructive">Overdue</Badge>}
                    {mine && (
                      <form action={setItem}>
                        <input type="hidden" name="item_id" value={i.id} />
                        <input
                          type="hidden"
                          name="done"
                          value={i.completed_at ? "false" : "true"}
                        />
                        <Button
                          type="submit"
                          size="sm"
                          variant={i.completed_at ? "ghost" : "outline"}
                          aria-label={`${i.completed_at ? "Undo" : "Mark done"}: ${i.title}`}
                        >
                          {i.completed_at ? "Undo" : "Mark done"}
                        </Button>
                      </form>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>
      {ctx.isHr && (
        <form action={deleteChecklist}>
          <input type="hidden" name="id" value={id} />
          <Button type="submit" variant="outline">
            Delete this checklist
          </Button>
        </form>
      )}
    </div>
  );
}
