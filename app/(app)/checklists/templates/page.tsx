import type { Metadata } from "next";
import Link from "next/link";
import { Trash2 } from "lucide-react";
import { requireHr } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { ASSIGNEES } from "@/lib/validation/people";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { deleteTemplateItem } from "../actions";
import { TemplateItemForm } from "../checklist-forms";

export const metadata: Metadata = { title: "Checklist templates · AbsorbHR Portal" };

function due(n: number) {
  if (n === 0) return "on the day";
  return n < 0 ? `${-n} day${n === -1 ? "" : "s"} before` : `${n} day${n === 1 ? "" : "s"} after`;
}

export default async function TemplatesPage() {
  await requireHr();
  const supabase = await createClient();
  const [{ data: templates }, { data: items }] = await Promise.all([
    supabase.from("checklist_templates").select("id, name, kind").order("kind"),
    supabase.from("checklist_template_items").select("*").order("position"),
  ]);
  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/checklists"
          className="text-sm text-primary underline-offset-4 hover:underline"
        >
          ← Checklists
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Checklist templates</h1>
        <p className="text-sm text-muted-foreground">
          Changes apply to checklists started from now on.
        </p>
      </div>
      {(templates ?? []).map((t) => (
        <Card key={t.id}>
          <CardHeader>
            <CardTitle>{t.name}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <ol className="divide-y rounded-lg border">
              {(items ?? [])
                .filter((i) => i.template_id === t.id)
                .map((i) => (
                  <li
                    key={i.id}
                    className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                  >
                    <span>
                      {i.title}
                      <span className="block text-xs text-muted-foreground">
                        {ASSIGNEES[i.assignee as keyof typeof ASSIGNEES]} · {due(i.due_offset_days)}{" "}
                        the {t.kind === "onboarding" ? "start" : "leaving"} date
                      </span>
                    </span>
                    <form action={deleteTemplateItem}>
                      <input type="hidden" name="id" value={i.id} />
                      <Button
                        type="submit"
                        variant="ghost"
                        size="sm"
                        aria-label={`Remove task ${i.title}`}
                      >
                        <Trash2 aria-hidden="true" />
                      </Button>
                    </form>
                  </li>
                ))}
            </ol>
            <TemplateItemForm templateId={t.id} />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
