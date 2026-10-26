import { formatDateTime, isoToLondonLocal } from "@/lib/format";
import { RISK_LEVELS } from "@/lib/validation/gdpr";
import { Badge } from "@/components/ui/feedback";
import type { Database } from "@/lib/database.types";
import { BreachForm, type BreachValues } from "./breach-form";

type Breach = Database["public"]["Tables"]["data_breaches"]["Row"];

// Shared by the client's breach log and AbsorbHR's all-clients view.
export function BreachList({
  breaches,
  editable,
  companyNames,
}: {
  breaches: Breach[];
  editable: boolean;
  companyNames?: Map<string, string>;
}) {
  const now = Date.now();
  if (!breaches.length)
    return <p className="text-sm text-muted-foreground">No breaches recorded.</p>;
  return (
    <ul className="space-y-4">
      {breaches.map((b) => {
        const deadline = new Date(b.discovered_at).getTime() + 72 * 3600_000;
        const hoursLeft = Math.round((deadline - now) / 3600_000);
        const needsDecision =
          b.status === "open" && b.ico_reportable !== false && !b.ico_reported_at;
        const values: BreachValues = {
          id: b.id,
          title: b.title,
          discovered_at: isoToLondonLocal(b.discovered_at),
          occurred_at: isoToLondonLocal(b.occurred_at),
          description: b.description,
          data_types: b.data_types ?? "",
          people_affected: b.people_affected?.toString() ?? "",
          special_category: b.special_category,
          risk_level: b.risk_level as BreachValues["risk_level"],
          ico_decision: b.ico_reportable === null ? "undecided" : b.ico_reportable ? "yes" : "no",
          decision_reason: b.decision_reason ?? "",
          ico_reported_at: isoToLondonLocal(b.ico_reported_at),
          ico_reference: b.ico_reference ?? "",
          individuals_informed_at: isoToLondonLocal(b.individuals_informed_at),
          actions_taken: b.actions_taken ?? "",
          closed: b.status === "closed",
        };
        return (
          <li key={b.id} className="rounded-lg border p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-semibold">
                  {companyNames && (
                    <span className="text-muted-foreground">
                      {companyNames.get(b.tenant_id) ?? "Company"} ·{" "}
                    </span>
                  )}
                  {b.title}
                </p>
                <p className="text-sm text-muted-foreground">
                  Discovered {formatDateTime(b.discovered_at)}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant={b.status === "closed" ? "muted" : "warning"}>
                  {b.status === "closed" ? "Closed" : "Open"}
                </Badge>
                <Badge variant={b.risk_level === "high" ? "destructive" : "muted"}>
                  {RISK_LEVELS[b.risk_level as keyof typeof RISK_LEVELS].split(" —")[0]} risk
                </Badge>
                {b.ico_reported_at ? (
                  <Badge variant="success">Reported to ICO</Badge>
                ) : b.ico_reportable === false ? (
                  <Badge variant="muted">Not reportable</Badge>
                ) : needsDecision ? (
                  <Badge variant="destructive">
                    {hoursLeft > 0 ? `ICO deadline in ${hoursLeft}h` : "ICO deadline passed"}
                  </Badge>
                ) : null}
              </div>
            </div>
            <p className="mt-2 whitespace-pre-line text-sm">{b.description}</p>
            {editable && (
              <details className="mt-3 rounded-lg border p-4">
                <summary className="cursor-pointer text-sm font-medium text-primary">
                  Update this record
                </summary>
                <div className="mt-4">
                  <BreachForm values={values} />
                </div>
              </details>
            )}
            {!editable && (
              <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                <div>
                  <dt className="font-medium">People affected</dt>
                  <dd>{b.people_affected ?? "Unknown"}</dd>
                </div>
                <div>
                  <dt className="font-medium">Sensitive data</dt>
                  <dd>{b.special_category ? "Yes" : "No"}</dd>
                </div>
                {b.decision_reason && (
                  <div className="sm:col-span-2">
                    <dt className="font-medium">ICO decision</dt>
                    <dd>{b.decision_reason}</dd>
                  </div>
                )}
                {b.actions_taken && (
                  <div className="sm:col-span-2">
                    <dt className="font-medium">Actions</dt>
                    <dd className="whitespace-pre-line">{b.actions_taken}</dd>
                  </div>
                )}
              </dl>
            )}
          </li>
        );
      })}
    </ul>
  );
}
