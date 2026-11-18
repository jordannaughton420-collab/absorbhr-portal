// Shift wording and UK-time helpers, shared by pages and the assistant.

/** Why someone was left out of an open shift, in plain English. */
export const LEFT_OUT: Record<string, string> = {
  on_leave: "on holiday or leave",
  off_sick: "off sick",
  overlap: "already on a shift then",
  rest_break: "would get less than 11 hours' rest between shifts",
  no_login: "has no portal login to accept with",
  not_your_team: "not in your team",
  leaver: "has left",
};

const LONDON = "Europe/London";

/** "2027-03-10" for a timestamp, in UK time. */
export function londonDay(iso: string) {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone: LONDON });
}

/** "20:00" for a timestamp, in UK time. */
export function londonTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GB", {
    timeZone: LONDON,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
}

/** "Wed 10 Mar 2027" for a date. */
export function shortDay(day: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    })
      .formatToParts(new Date(`${day}T12:00:00Z`))
      .map((p) => [p.type, p.value]),
  );
  return `${parts.weekday} ${parts.day} ${parts.month} ${parts.year}`;
}

/** "Wed 10 Mar 2027, 20:00 to 05:00 (next day)" */
export function shiftWhen(startsAt: string, endsAt: string) {
  const d1 = londonDay(startsAt);
  const d2 = londonDay(endsAt);
  const next = d2 !== d1 ? " (next day)" : "";
  return `${shortDay(d1)}, ${londonTime(startsAt)} to ${londonTime(endsAt)}${next}`;
}

/** Same wording from a form's date and times (end at or before start = next day). */
export function shiftWhenFromParts(date: string, start: string, end: string) {
  return `${shortDay(date)}, ${start} to ${end}${end <= start ? " (next day)" : ""}`;
}

/** Monday of the week containing the given day ("YYYY-MM-DD"). */
export function mondayOf(day: string) {
  const d = new Date(`${day}T12:00:00Z`);
  const offset = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - offset);
  return d.toISOString().slice(0, 10);
}

export function addDays(day: string, n: number) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** The instant a UK calendar day starts (for querying shifts by week). */
export function londonMidnightIso(day: string) {
  // Midnight UK time is 00:00 GMT in winter and 23:00 the day before in summer.
  const noonUtc = new Date(`${day}T12:00:00Z`);
  const ukHour = Number(
    noonUtc.toLocaleTimeString("en-GB", { timeZone: LONDON, hour: "2-digit", hourCycle: "h23" }),
  );
  const offsetHours = ukHour - 12; // 0 in GMT, 1 in BST
  return new Date(Date.parse(`${day}T00:00:00Z`) - offsetHours * 3_600_000).toISOString();
}
