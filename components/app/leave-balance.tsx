import { formatDate } from "@/lib/format";

export type Balance = {
  leave_year_start: string;
  leave_year_end: string;
  entitlement: number;
  bank_holidays: number;
  adjustments: number;
  carried_over: number;
  approved: number;
  pending: number;
  remaining: number;
  policy_configured: boolean;
};

const fmt = (n: number) => (Number.isInteger(Number(n)) ? String(Number(n)) : Number(n).toFixed(1));

// Shows how the remaining holiday figure is worked out, line by line.
export function LeaveBalance({
  balance,
  bankHolidaysIncluded,
}: {
  balance: Balance;
  bankHolidaysIncluded: boolean;
}) {
  const rows: [string, number, string?][] = [
    [
      "Annual entitlement",
      balance.entitlement,
      "Pro-rated for your working pattern and start/leave dates",
    ],
  ];
  if (bankHolidaysIncluded)
    rows.push(["Bank holidays on your working days", -balance.bank_holidays]);
  if (Number(balance.carried_over))
    rows.push(["Carried over from last year", balance.carried_over]);
  if (Number(balance.adjustments)) rows.push(["Adjustments by HR", balance.adjustments]);
  rows.push(["Approved holiday", -balance.approved]);

  return (
    <div>
      <p className="text-sm text-muted-foreground">
        Leave year {formatDate(balance.leave_year_start)} – {formatDate(balance.leave_year_end)}
      </p>
      <p className="mt-2 flex items-baseline gap-2">
        <span className="text-4xl font-semibold text-primary">{fmt(balance.remaining)}</span>
        <span className="text-muted-foreground">days left to book</span>
      </p>
      {Number(balance.pending) > 0 && (
        <p className="text-sm text-warning">{fmt(balance.pending)} days waiting for approval</p>
      )}
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-primary">How this is worked out</summary>
        <dl className="mt-2 divide-y rounded-lg border">
          {rows.map(([label, value, hint]) => (
            <div key={label} className="flex justify-between gap-4 px-3 py-2">
              <dt>
                {label}
                {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
              </dt>
              <dd className="font-medium tabular-nums">
                {Number(value) > 0 && label !== "Annual entitlement" ? "+" : ""}
                {fmt(value)}
              </dd>
            </div>
          ))}
          <div className="flex justify-between px-3 py-2 font-semibold">
            <dt>Left to book</dt>
            <dd className="tabular-nums">{fmt(balance.remaining)}</dd>
          </div>
        </dl>
        {!bankHolidaysIncluded && (
          <p className="mt-2 text-xs text-muted-foreground">
            Bank holidays are given on top of this allowance.
          </p>
        )}
      </details>
    </div>
  );
}
