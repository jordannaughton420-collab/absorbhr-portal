import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BreachForm } from "./breach-form";
import { BreachList } from "./breach-list";

export const metadata: Metadata = { title: "Breach log · AbsorbHR Portal" };

export default async function BreachesPage() {
  const ctx = await requireContext();
  const isAbsorb = ctx.isPlatformAdmin && !ctx.supportSession;
  if (!(ctx.isClientAdmin && !ctx.supportSession) && !isAbsorb) redirect("/dashboard");
  const supabase = await createClient();
  const [{ data: breaches }, { data: tenants }] = await Promise.all([
    supabase.from("data_breaches").select("*").order("discovered_at", { ascending: false }),
    isAbsorb ? supabase.from("tenants").select("id, name") : Promise.resolve({ data: null }),
  ]);
  const companyNames = tenants ? new Map(tenants.map((t) => [t.id, t.name])) : undefined;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Personal data breach log</h1>
        <p className="text-sm text-muted-foreground">
          {isAbsorb
            ? "Every client company's breach log. Read only."
            : "Record every personal data breach, even ones you don't report (UK GDPR Article 33(5)). AbsorbHR can see this log so it can advise you."}
        </p>
      </div>
      {!isAbsorb && (
        <Card>
          <CardHeader>
            <CardTitle>Record a breach</CardTitle>
            <CardDescription>
              If it&apos;s likely to put people at risk, you must report it to the ICO within 72
              hours of discovering it (ico.org.uk/report-a-breach). If the risk is high, tell the
              people affected too. Call AbsorbHR if you&apos;re unsure.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <BreachForm />
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Recorded breaches</CardTitle>
        </CardHeader>
        <CardContent>
          <BreachList breaches={breaches ?? []} editable={!isAbsorb} companyNames={companyNames} />
        </CardContent>
      </Card>
    </div>
  );
}
