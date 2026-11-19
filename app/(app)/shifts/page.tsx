import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireContext } from "@/lib/auth/context";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/feedback";
import { shiftWhen } from "@/lib/shifts";
import { claimOpenShift, declineOpenShift } from "../rota/actions";
import { RowAction } from "../rota/rota-forms";

export const metadata: Metadata = { title: "My shifts · AbsorbHR Portal" };

export default async function MyShiftsPage() {
  const ctx = await requireContext();
  if (!ctx.employeeId || ctx.supportSession) redirect("/dashboard");
  const supabase = await createClient();
  const nowIso = new Date().toISOString();

  const [{ data: mine }, { data: offers }] = await Promise.all([
    supabase
      .from("shifts")
      .select("id, starts_at, ends_at, role_label, notes, claimed_at, locations(name)")
      .eq("employee_id", ctx.employeeId)
      .eq("status", "scheduled")
      .gte("ends_at", nowIso)
      .order("starts_at")
      .limit(60),
    supabase
      .from("shift_offers")
      .select("shift_id, response, offered_at")
      .eq("employee_id", ctx.employeeId)
      .order("offered_at", { ascending: false })
      .limit(30),
  ]);

  const offerIds = (offers ?? []).map((o) => o.shift_id);
  const { data: offered } = offerIds.length
    ? await supabase
        .from("shifts")
        .select("id, starts_at, ends_at, role_label, notes, status, employee_id, locations(name)")
        .in("id", offerIds)
        .gte("starts_at", nowIso)
        .order("starts_at")
    : { data: [] };
  const responseFor = new Map((offers ?? []).map((o) => [o.shift_id, o.response]));
  const open = (offered ?? []).filter((s) => s.status === "open");
  const gone = (offered ?? []).filter(
    (s) => s.status !== "open" && s.employee_id !== ctx.employeeId,
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">My shifts</h1>
        <p className="text-sm text-muted-foreground">
          Your upcoming shifts, and any open shifts you can pick up. Times are UK time.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Open shifts you can pick up</CardTitle>
          <CardDescription>
            The first person to accept gets the shift. Once someone has, nobody else can.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {open.length === 0 && gone.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing at the moment.</p>
          ) : (
            <ul className="divide-y">
              {open.map((s) => (
                <li key={s.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                  <div className="space-y-1 text-sm">
                    <p className="font-medium">{shiftWhen(s.starts_at, s.ends_at)}</p>
                    {(s.role_label || s.locations?.name) && (
                      <p>{[s.role_label, s.locations?.name].filter(Boolean).join(" · ")}</p>
                    )}
                    {s.notes && <p className="text-muted-foreground">{s.notes}</p>}
                    {responseFor.get(s.id) === "declined" && (
                      <Badge variant="muted">You said no, but you can still accept it</Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap items-start gap-2">
                    <RowAction
                      action={claimOpenShift}
                      fields={{ shift_id: s.id }}
                      label="Accept shift"
                      pendingLabel="Accepting…"
                      variant="default"
                    />
                    {responseFor.get(s.id) !== "declined" && (
                      <RowAction
                        action={declineOpenShift}
                        fields={{ shift_id: s.id }}
                        label="Not for me"
                      />
                    )}
                  </div>
                </li>
              ))}
              {gone.map((s) => (
                <li
                  key={s.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"
                >
                  <span className="text-muted-foreground">
                    {shiftWhen(s.starts_at, s.ends_at)}
                    {s.role_label && <> · {s.role_label}</>}
                  </span>
                  <Badge variant="muted">
                    {s.status === "cancelled" ? "Cancelled" : "Already taken"}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>My upcoming shifts</CardTitle>
        </CardHeader>
        <CardContent>
          {(mine ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No shifts on the rota for you yet.</p>
          ) : (
            <ul className="divide-y">
              {(mine ?? []).map((s) => (
                <li key={s.id} className="space-y-1 py-3 text-sm">
                  <p className="font-medium">
                    {shiftWhen(s.starts_at, s.ends_at)}
                    {s.claimed_at && (
                      <Badge variant="success" className="ml-2">
                        Open shift you picked up
                      </Badge>
                    )}
                  </p>
                  {(s.role_label || s.locations?.name) && (
                    <p>{[s.role_label, s.locations?.name].filter(Boolean).join(" · ")}</p>
                  )}
                  {s.notes && <p className="text-muted-foreground">{s.notes}</p>}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-4 text-sm text-muted-foreground">
            Holiday and sickness are on the{" "}
            <Link href="/calendar" className="underline">
              Team calendar
            </Link>
            .
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
