import { Trash2 } from "lucide-react";
import type { SessionContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/format";
import { DOCUMENT_CATEGORIES, DOCUMENT_VISIBILITY } from "@/lib/validation/documents";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import { deleteDocument } from "@/app/(app)/documents/actions";
import {
  DocumentUpload,
  DownloadButton,
  VisibilitySelect,
} from "@/app/(app)/documents/document-widgets";

type Category = keyof typeof DOCUMENT_CATEGORIES;
type Visibility = keyof typeof DOCUMENT_VISIBILITY;

function formatSize(bytes: number | null) {
  if (!bytes) return "";
  return bytes > 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.ceil(bytes / 1024)} KB`;
}

// Who may upload what (mirrors the database rule app.document_upload_allowed).
function uploadRights(ctx: SessionContext, isSelf: boolean, isDirectManager: boolean) {
  if (ctx.isHr) {
    const all = Object.keys(DOCUMENT_CATEGORIES) as Category[];
    return {
      categories: ctx.supportSession ? all.filter((c) => c !== "fit_note") : all,
      visibilities: Object.keys(DOCUMENT_VISIBILITY) as Visibility[],
      defaultVisibility: "hr_and_employee" as Visibility,
    };
  }
  if (isSelf)
    return {
      categories: ["certificate", "fit_note", "right_to_work", "other"] as Category[],
      visibilities: ["hr_and_employee", "everyone"] as Visibility[],
      defaultVisibility: "hr_and_employee" as Visibility,
    };
  if (isDirectManager)
    return {
      categories: ["certificate", "meeting_notes", "fit_note", "other"] as Category[],
      visibilities: ["hr_and_manager", "everyone"] as Visibility[],
      defaultVisibility: "hr_and_manager" as Visibility,
    };
  return null;
}

export async function DocumentsSection({
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
  const rights = uploadRights(ctx, isSelf, isDirectManager);
  if (!rights) return null;
  const supabase = await createClient();
  // RLS returns only the documents this person may see.
  const { data: docs } = await supabase
    .from("documents")
    .select("id, category, title, file_name, size_bytes, visibility, created_at")
    .eq("employee_id", employeeId)
    .eq("status", "available")
    .order("created_at", { ascending: false });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Documents</CardTitle>
        <CardDescription>
          Stored privately in the UK. Downloads use a link that expires after 60 seconds, and every
          download is logged.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {docs?.length ? (
          <ul className="divide-y rounded-lg border">
            {docs.map((d) => (
              <li
                key={d.id}
                className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="font-medium">{d.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {DOCUMENT_CATEGORIES[d.category as Category]} · {formatDate(d.created_at)} ·{" "}
                    {formatSize(d.size_bytes)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {ctx.isHr ? (
                    <VisibilitySelect
                      id={d.id}
                      value={d.visibility as Visibility}
                      label={d.title}
                    />
                  ) : (
                    <Badge variant="muted">{DOCUMENT_VISIBILITY[d.visibility as Visibility]}</Badge>
                  )}
                  <DownloadButton id={d.id} label={d.title} />
                  {ctx.isHr && (
                    <form action={deleteDocument}>
                      <input type="hidden" name="id" value={d.id} />
                      <Button
                        type="submit"
                        variant="ghost"
                        size="sm"
                        aria-label={`Delete ${d.title}`}
                      >
                        <Trash2 aria-hidden="true" />
                      </Button>
                    </form>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No documents you can see yet.</p>
        )}
        <details className="rounded-lg border p-4">
          <summary className="cursor-pointer text-sm font-medium text-primary">
            Upload a document
          </summary>
          <div className="mt-4">
            <DocumentUpload employeeId={employeeId} {...rights} />
          </div>
        </details>
      </CardContent>
    </Card>
  );
}
