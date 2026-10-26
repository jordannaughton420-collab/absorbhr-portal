import { Lock, Trash2 } from "lucide-react";
import type { SessionContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/format";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import { deleteNote } from "@/app/(app)/employees/notes-actions";
import { NoteForm } from "./note-form";

// 1-to-1 notes: written by the direct line manager or HR; shared with the employee unless marked private.
export async function NotesSection({
  employeeId,
  ctx,
  isSelf,
  isDirectManager,
}: {
  employeeId: string;
  ctx: SessionContext;
  isSelf: boolean;
  isDirectManager: boolean;
}) {
  const canWrite = !isSelf && (isDirectManager || ctx.isHr);
  if (!canWrite && !isSelf) return null;
  const supabase = await createClient();
  const { data: notes } = await supabase
    .from("one_to_one_notes")
    .select("id, meeting_date, notes, actions, is_private, author_id")
    .eq("employee_id", employeeId)
    .order("meeting_date", { ascending: false })
    .limit(30);

  return (
    <Card>
      <CardHeader>
        <CardTitle>1-to-1 notes</CardTitle>
        <CardDescription>
          {isSelf
            ? "Notes your manager has shared with you."
            : "Shared with the employee unless you mark a note private."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {notes?.length ? (
          <ul className="space-y-3">
            {notes.map((n) => (
              <li key={n.id} className="rounded-lg border p-3 text-sm">
                <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold">{formatDate(n.meeting_date)}</span>
                  <span className="flex items-center gap-2">
                    {n.is_private && (
                      <Badge variant="muted">
                        <Lock className="mr-1 size-3" aria-hidden="true" /> Private
                      </Badge>
                    )}
                    {(n.author_id === ctx.userId || ctx.isHr) && (
                      <form action={deleteNote}>
                        <input type="hidden" name="id" value={n.id} />
                        <Button
                          type="submit"
                          variant="ghost"
                          size="sm"
                          aria-label={`Delete note from ${formatDate(n.meeting_date)}`}
                        >
                          <Trash2 aria-hidden="true" />
                        </Button>
                      </form>
                    )}
                  </span>
                </div>
                <p className="whitespace-pre-line">{n.notes}</p>
                {n.actions && (
                  <p className="mt-2 whitespace-pre-line">
                    <span className="font-medium">Actions:</span> {n.actions}
                  </p>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No notes yet.</p>
        )}
        {canWrite && (
          <details className="rounded-lg border p-4">
            <summary className="cursor-pointer text-sm font-medium text-primary">
              Add 1-to-1 notes
            </summary>
            <div className="mt-4">
              <NoteForm employeeId={employeeId} />
            </div>
          </details>
        )}
      </CardContent>
    </Card>
  );
}
