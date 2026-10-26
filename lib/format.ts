// UK formatting helpers (safe for server and browser).

export function formatDate(value: string | null | undefined) {
  if (!value) return "";
  const d = new Date(value.length === 10 ? `${value}T12:00:00Z` : value);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London" });
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
  const money = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(amount);
  return basis === "hourly" ? `${money} per hour` : `${money} per year`;
}

export function daysUntil(date: string) {
  const target = new Date(`${date}T00:00:00Z`).getTime();
  const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z").getTime();
  return Math.round((target - today) / 86_400_000);
}
