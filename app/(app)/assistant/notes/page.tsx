import type { Metadata } from "next";
import Link from "next/link";
import { requireContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/format";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { deleteNote } from "../actions";

export const metadata: Metadata = { title: "Company notes · AbsorbHR Portal" };

export default async function AssistantNotesPage() {
  const ctx = await requireContext();
  if (!ctx.tenantId || ctx.supportSession) {
    return <p>Company notes belong to each company&apos;s own portal.</p>;
  }
  const supabase = await createClient();
  const { data: notes } = await supabase
    .from("assistant_memories")
    .select("id, note, created_at, created_by")
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-6">
      <div>
        <Link href="/assistant" className="text-sm text-primary underline-offset-4 hover:underline">
          ← Back to the assistant
        </Link>
        <h1 className="mt-2 text-2xl font-extrabold tracking-tight sm:text-3xl">Company notes</h1>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>What the assistant remembers</CardTitle>
          <CardDescription>
            The assistant reads these before answering anyone in {ctx.tenantName ?? "your company"}.
            A note is only saved when someone confirms it. You can remove notes you added; a Client
            Admin can remove any note. Notes are for company knowledge, never for details about a
            person.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {(notes ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No notes yet. Tell the assistant something like &ldquo;Remember that holiday requests
              need two weeks&apos; notice&rdquo;.
            </p>
          ) : (
            <ul className="divide-y">
              {(notes ?? []).map((n) => {
                const canDelete = n.created_by === ctx.userId || ctx.isClientAdmin;
                return (
                  <li key={n.id} className="flex items-start justify-between gap-4 py-3">
                    <div>
                      <p className="text-sm">{n.note}</p>
                      <p className="text-xs text-muted-foreground">
                        Added {formatDate(n.created_at)}
                      </p>
                    </div>
                    {canDelete && (
                      <form action={deleteNote}>
                        <input type="hidden" name="note_id" value={n.id} />
                        <Button
                          type="submit"
                          variant="outline"
                          size="sm"
                          aria-label={`Remove note: ${n.note}`}
                        >
                          Remove
                        </Button>
                      </form>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
