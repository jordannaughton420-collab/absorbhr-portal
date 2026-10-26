import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NewPolicyForm } from "../policy-forms";

export const metadata: Metadata = { title: "New policy · AbsorbHR Portal" };

export default async function NewPolicyPage({
  searchParams,
}: {
  searchParams: Promise<{ template?: string }>;
}) {
  const ctx = await requireContext();
  const isTemplate =
    (await searchParams).template === "1" && ctx.isPlatformAdmin && !ctx.supportSession;
  if (!isTemplate && !ctx.isHr) redirect("/policies");
  const supabase = await createClient();
  const { data: departments } = isTemplate
    ? { data: [] }
    : await supabase.from("departments").select("id, name").order("name");
  return (
    <Card className="max-w-3xl">
      <CardHeader>
        <CardTitle>
          <span className="text-2xl">{isTemplate ? "New AbsorbHR template" : "New policy"}</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <NewPolicyForm departments={departments ?? []} isTemplate={isTemplate} />
      </CardContent>
    </Card>
  );
}
