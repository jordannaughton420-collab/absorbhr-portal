import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { requireContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/format";
import { POLICY_CATEGORIES } from "@/lib/validation/policy";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/feedback";
import { Button, buttonVariants } from "@/components/ui/button";
import { Table, Td, Th } from "@/components/ui/table";
import { copyTemplate } from "./actions";

export const metadata: Metadata = { title: "Policies · AbsorbHR Portal" };

type Category = keyof typeof POLICY_CATEGORIES;

export default async function PoliciesPage() {
  const ctx = await requireContext();
  const supabase = await createClient();
  const managesTemplates = ctx.isPlatformAdmin && !ctx.supportSession;
  const ownRecord = Boolean(ctx.employeeId) && !ctx.supportSession;

  const [{ data: mine }, { data: all }, { data: templates }] = await Promise.all([
    ownRecord ? supabase.rpc("my_policies") : Promise.resolve({ data: null }),
    ctx.isHr
      ? supabase
          .from("policies")
          .select("id, title, category, status, audience, requires_acknowledgement, updated_at")
          .not("tenant_id", "is", null)
          .order("title")
      : Promise.resolve({ data: null }),
    ctx.isHr || managesTemplates
      ? supabase
          .from("policies")
          .select("id, title, category, summary, status, updated_at")
          .is("tenant_id", null)
          .order("title")
      : Promise.resolve({ data: null }),
  ]);

  // Acknowledgement progress for HR's list.
  const progress = new Map<string, { done: number; total: number }>();
  if (ctx.isHr && all) {
    await Promise.all(
      all
        .filter((p) => p.status === "published" && p.requires_acknowledgement)
        .map(async (p) => {
          const { data } = await supabase.rpc("policy_acknowledgement_status", { p_policy: p.id });
          progress.set(p.id, {
            done: (data ?? []).filter((r) => r.acknowledged).length,
            total: data?.length ?? 0,
          });
        }),
    );
  }
  const toRead = (mine ?? []).filter((p) => !p.acknowledged);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Policies</h1>
          <p className="text-sm text-muted-foreground">
            {managesTemplates
              ? "AbsorbHR's template library for clients."
              : "Your company's policies and procedures."}
          </p>
        </div>
        {(ctx.isHr || managesTemplates) && (
          <Link
            href={managesTemplates ? "/policies/new?template=1" : "/policies/new"}
            className={buttonVariants()}
          >
            <Plus aria-hidden="true" /> {managesTemplates ? "New template" : "New policy"}
          </Link>
        )}
      </div>

      {mine && (
        <Card>
          <CardHeader>
            <CardTitle>
              {toRead.length ? `${toRead.length} to read` : "You're up to date"}
            </CardTitle>
            <CardDescription>Policies that apply to you.</CardDescription>
          </CardHeader>
          <CardContent>
            {mine.length ? (
              <ul className="divide-y">
                {[...mine]
                  .sort((a, b) => Number(a.acknowledged) - Number(b.acknowledged))
                  .map((p) => (
                    <li
                      key={p.policy_id}
                      className="flex flex-wrap items-center justify-between gap-2 py-2.5"
                    >
                      <div>
                        <Link
                          href={`/policies/${p.policy_id}`}
                          className="font-medium text-primary underline-offset-4 hover:underline"
                        >
                          {p.title}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          {POLICY_CATEGORIES[p.category as Category]} · version {p.current_version}
                          {p.summary ? ` · ${p.summary}` : ""}
                        </p>
                      </div>
                      {p.acknowledged ? (
                        <Badge variant="success">
                          {p.requires_acknowledgement
                            ? `Read ${formatDate(p.acknowledged_at)}`
                            : "For information"}
                        </Badge>
                      ) : (
                        <Badge variant="warning">Please read and confirm</Badge>
                      )}
                    </li>
                  ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No policies have been published yet.</p>
            )}
          </CardContent>
        </Card>
      )}

      {all && (
        <Card>
          <CardHeader>
            <CardTitle>Manage policies</CardTitle>
          </CardHeader>
          <CardContent>
            {all.length ? (
              <Table>
                <thead>
                  <tr>
                    <Th>Policy</Th>
                    <Th>Status</Th>
                    <Th className="hidden sm:table-cell">Who</Th>
                    <Th>Read and confirmed</Th>
                  </tr>
                </thead>
                <tbody>
                  {all.map((p) => {
                    const pr = progress.get(p.id);
                    return (
                      <tr key={p.id}>
                        <Td>
                          <Link
                            href={`/policies/${p.id}`}
                            className="font-medium text-primary underline-offset-4 hover:underline"
                          >
                            {p.title}
                          </Link>
                        </Td>
                        <Td>
                          <Badge
                            variant={
                              p.status === "published"
                                ? "success"
                                : p.status === "draft"
                                  ? "warning"
                                  : "muted"
                            }
                          >
                            {p.status}
                          </Badge>
                        </Td>
                        <Td className="hidden sm:table-cell">
                          {p.audience === "all" ? "Everyone" : "Some departments"}
                        </Td>
                        <Td className="tabular-nums">{pr ? `${pr.done} of ${pr.total}` : "—"}</Td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            ) : (
              <p className="text-sm text-muted-foreground">
                No policies yet. Create one, or start from an AbsorbHR template below.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {templates && (
        <Card>
          <CardHeader>
            <CardTitle>{managesTemplates ? "Templates" : "Templates from AbsorbHR"}</CardTitle>
            <CardDescription>
              {managesTemplates
                ? "Published templates are visible to every client's HR team, who can copy and adapt them."
                : "Copy a template into your library as a draft, then adapt it to your business before publishing."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {templates.length ? (
              <ul className="divide-y">
                {templates.map((t) => (
                  <li
                    key={t.id}
                    className="flex flex-wrap items-center justify-between gap-2 py-2.5"
                  >
                    <div>
                      {managesTemplates ? (
                        <Link
                          href={`/policies/${t.id}`}
                          className="font-medium text-primary underline-offset-4 hover:underline"
                        >
                          {t.title}
                        </Link>
                      ) : (
                        <p className="font-medium">{t.title}</p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {POLICY_CATEGORIES[t.category as Category]}
                        {t.summary ? ` · ${t.summary}` : ""}
                      </p>
                    </div>
                    {managesTemplates ? (
                      <Badge variant={t.status === "published" ? "success" : "warning"}>
                        {t.status}
                      </Badge>
                    ) : (
                      <form action={copyTemplate}>
                        <input type="hidden" name="template_id" value={t.id} />
                        <Button
                          type="submit"
                          variant="outline"
                          size="sm"
                          aria-label={`Copy to my library: ${t.title}`}
                        >
                          Copy to my library
                        </Button>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No templates yet.</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
