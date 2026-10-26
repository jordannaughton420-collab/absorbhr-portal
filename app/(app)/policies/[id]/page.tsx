import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatDateTime } from "@/lib/format";
import { POLICY_CATEGORIES } from "@/lib/validation/policy";
import { Markdown } from "@/components/app/markdown";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, Badge } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import { acknowledgePolicy, setPolicyArchived } from "../actions";
import {
  DraftForm,
  PolicyDetailsForm,
  PolicyFileDownload,
  PolicyFileUpload,
  PublishForm,
} from "../policy-forms";

export const metadata: Metadata = { title: "Policy · AbsorbHR Portal" };

type Category = keyof typeof POLICY_CATEGORIES;

export default async function PolicyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const ctx = await requireContext();
  const supabase = await createClient();
  const { data: policy } = await supabase.from("policies").select("*").eq("id", id).maybeSingle();
  if (!policy) notFound();

  const isTemplate = policy.tenant_id === null;
  const canManage = isTemplate ? ctx.isPlatformAdmin && !ctx.supportSession : ctx.isHr;
  const { data: versions } = await supabase
    .from("policy_versions")
    .select(
      "id, version, body, file_name, file_path, change_summary, requires_reacknowledgement, published_at",
    )
    .eq("policy_id", id)
    .order("version", { ascending: false });
  const published = (versions ?? []).find((v) => v.published_at);
  const draft = (versions ?? []).find((v) => !v.published_at);

  const [{ data: mine }, { data: tracker }, { data: departments }, { data: directory }] =
    await Promise.all([
      !isTemplate && ctx.employeeId && !ctx.supportSession
        ? supabase.rpc("my_policies")
        : Promise.resolve({ data: null }),
      canManage && !isTemplate && published
        ? supabase.rpc("policy_acknowledgement_status", { p_policy: id })
        : Promise.resolve({ data: null }),
      canManage && !isTemplate
        ? supabase.from("departments").select("id, name").order("name")
        : Promise.resolve({ data: [] }),
      canManage && !isTemplate
        ? supabase.from("employee_directory").select("id, first_name, preferred_name, last_name")
        : Promise.resolve({ data: null }),
    ]);
  const myStatus = (mine ?? []).find((p) => p.policy_id === id);
  const names = new Map(
    (directory ?? []).map((d) => [d.id!, `${d.preferred_name || d.first_name} ${d.last_name}`]),
  );
  const outstanding = (tracker ?? []).filter((t) => !t.acknowledged);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/policies" className="text-sm text-primary underline-offset-4 hover:underline">
          ← Policies
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{policy.title}</h1>
        <div className="mt-2 flex flex-wrap gap-2">
          <Badge variant="muted">{POLICY_CATEGORIES[policy.category as Category]}</Badge>
          {isTemplate && <Badge>AbsorbHR template</Badge>}
          <Badge
            variant={
              policy.status === "published"
                ? "success"
                : policy.status === "draft"
                  ? "warning"
                  : "muted"
            }
          >
            {policy.status}
          </Badge>
          {published && (
            <Badge variant="muted">
              Version {published.version} · {formatDate(published.published_at)}
            </Badge>
          )}
        </div>
        {policy.summary && <p className="mt-2 text-muted-foreground">{policy.summary}</p>}
      </div>

      {myStatus && !myStatus.acknowledged && published && (
        <Alert variant="warning">
          Please read this policy, then confirm at the bottom of the page.
        </Alert>
      )}

      {published ? (
        <Card>
          <CardHeader>
            <CardTitle>Version {published.version}</CardTitle>
            {published.change_summary && (
              <CardDescription>What changed: {published.change_summary}</CardDescription>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {published.body && (
              <div
                className="max-h-[70vh] overflow-y-auto rounded-lg border bg-muted/40 p-4"
                tabIndex={0}
                aria-label="Policy text"
              >
                <Markdown source={published.body} />
              </div>
            )}
            {published.file_path && (
              <PolicyFileDownload
                versionId={published.id}
                fileName={published.file_name ?? "document"}
              />
            )}
            {myStatus &&
              (myStatus.acknowledged ? (
                <p className="text-sm text-success">
                  {myStatus.requires_acknowledgement
                    ? `You confirmed you'd read this on ${formatDate(myStatus.acknowledged_at)}.`
                    : "For information — no confirmation needed."}
                </p>
              ) : (
                <form action={acknowledgePolicy}>
                  <input type="hidden" name="version_id" value={published.id} />
                  <input type="hidden" name="policy_id" value={id} />
                  <Button type="submit">I have read and understood this policy</Button>
                </form>
              ))}
          </CardContent>
        </Card>
      ) : (
        !canManage && <p>This policy hasn&apos;t been published yet.</p>
      )}

      {canManage && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>{draft ? `Draft — version ${draft.version}` : "Make changes"}</CardTitle>
              <CardDescription>
                {draft
                  ? "Not visible to staff until you publish it."
                  : "Published versions can't be edited. Saving here starts a new draft version."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <DraftForm
                policyId={id}
                body={draft?.body ?? published?.body ?? ""}
                changeSummary={draft?.change_summary ?? ""}
                isNewVersion={!draft}
              />
              {draft && (
                <>
                  <div className="space-y-2 border-t pt-4">
                    {draft.file_path && (
                      <PolicyFileDownload
                        versionId={draft.id}
                        fileName={draft.file_name ?? "document"}
                      />
                    )}
                    <PolicyFileUpload versionId={draft.id} />
                  </div>
                  <div className="border-t pt-4">
                    <PublishForm policyId={id} versionId={draft.id} version={draft.version} />
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {tracker && (
            <Card>
              <CardHeader>
                <CardTitle>
                  Read and confirmed: {tracker.length - outstanding.length} of {tracker.length}
                </CardTitle>
                <CardDescription>
                  Based on the latest version that needed everyone to re-read it.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {outstanding.length ? (
                  <>
                    <h3 className="mb-2 text-sm font-semibold">Still to confirm</h3>
                    <ul className="columns-1 gap-6 text-sm sm:columns-2 lg:columns-3">
                      {outstanding
                        .map((t) => ({ ...t, name: names.get(t.employee_id) ?? "Unknown" }))
                        .sort((a, b) => a.name.localeCompare(b.name))
                        .map((t) => (
                          <li key={t.employee_id} className="py-0.5">
                            {t.name}
                            {t.acknowledged_version && (
                              <span className="text-xs text-muted-foreground">
                                {" "}
                                (read v{t.acknowledged_version})
                              </span>
                            )}
                          </li>
                        ))}
                    </ul>
                  </>
                ) : (
                  <p className="text-sm text-success">Everyone has confirmed. 🎉</p>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <PolicyDetailsForm
                values={{ ...policy, department_ids: policy.department_ids ?? [] }}
                departments={departments ?? []}
                isTemplate={isTemplate}
              />
              {policy.status !== "draft" && (
                <form action={setPolicyArchived} className="border-t pt-4">
                  <input type="hidden" name="id" value={id} />
                  <input
                    type="hidden"
                    name="archived"
                    value={policy.status === "archived" ? "false" : "true"}
                  />
                  <Button type="submit" variant="outline">
                    {policy.status === "archived" ? "Restore this policy" : "Archive this policy"}
                  </Button>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Archived policies are hidden from staff. The record of who confirmed them is
                    kept.
                  </p>
                </form>
              )}
            </CardContent>
          </Card>

          {(versions?.length ?? 0) > 1 && (
            <Card>
              <CardHeader>
                <CardTitle>Version history</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="divide-y text-sm">
                  {versions!.map((v) => (
                    <li key={v.id} className="flex flex-wrap justify-between gap-2 py-2">
                      <span>
                        Version {v.version}
                        {v.change_summary && (
                          <span className="text-muted-foreground"> — {v.change_summary}</span>
                        )}
                      </span>
                      <span className="text-muted-foreground">
                        {v.published_at
                          ? `Published ${formatDateTime(v.published_at)}${v.version > 1 && !v.requires_reacknowledgement ? " · no re-read needed" : ""}`
                          : "Draft"}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
