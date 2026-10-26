// UK formatting helpers (safe for server and browser).

export function formatDate(value: string | null | undefined) {
  if (!value) return "";
  const d = new Date(value.length === 10 ? `${value}T12:00:00Z` : value);
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Europe/London",
  });
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return "";
  return new Date(value).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/London",
  });
}

export function formatMoney(amount: number, basis: "annual" | "hourly") {
  const money = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(
    amount,
  );
  return basis === "hourly" ? `${money} per hour` : `${money} per year`;
}

export function daysUntil(date: string) {
  const target = new Date(`${date}T00:00:00Z`).getTime();
  const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z").getTime();
  return Math.round((target - today) / 86_400_000);
}

// Converts a UK wall-clock time from <input type="datetime-local"> ("2026-10-26T14:30") to an
// ISO timestamp, allowing for British Summer Time.
export function londonLocalToIso(local: string) {
  const asUtc = new Date(`${local}:00Z`);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(asUtc);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  const shown = new Date(
    `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:00Z`,
  );
  return new Date(asUtc.getTime() - (shown.getTime() - asUtc.getTime())).toISOString();
}

// The reverse, for pre-filling datetime-local inputs.
export function isoToLondonLocal(iso: string | null | undefined) {
  if (!iso) return "";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}
