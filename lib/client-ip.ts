// Works out the visitor's address from the X-Forwarded-For header without trusting
// anything the visitor wrote themselves.
//
// Each proxy in front of the app adds the address it was connected from to the END
// of X-Forwarded-For. Anything further left came from the visitor (or a proxy we
// don't run) and can be made up, so we count TRUSTED_PROXY_HOPS entries in from the
// right. On Krystal one web server (LiteSpeed) sits in front of the app, so the
// default is 1. If a CDN is ever put in front of LiteSpeed, set it to 2.
//
// When no proxy is in front (local development), Next.js fills the header in from
// the connection itself, so the right-most entry is still the real address.

export const DEFAULT_TRUSTED_PROXY_HOPS = 1;
const MAX_TRUSTED_PROXY_HOPS = 5;
// The longest IPv6 text form with a zone is well under this; anything longer is junk.
const MAX_ADDRESS_LENGTH = 64;

/** Reads TRUSTED_PROXY_HOPS, falling back to 1 for a missing or nonsense value. */
export function trustedProxyHops(value: string | undefined = process.env.TRUSTED_PROXY_HOPS) {
  if (!value || !/^\d+$/.test(value.trim())) return DEFAULT_TRUSTED_PROXY_HOPS;
  const n = Number(value.trim());
  if (n < 1) return DEFAULT_TRUSTED_PROXY_HOPS;
  return Math.min(n, MAX_TRUSTED_PROXY_HOPS);
}

/**
 * Picks the address added by the outermost trusted proxy.
 * Returns "unknown" when the header is missing or the chosen entry is unusable.
 */
export function clientIpFromForwardedFor(
  header: string | null | undefined,
  hops: number = DEFAULT_TRUSTED_PROXY_HOPS,
) {
  if (!header) return "unknown";
  const entries = header
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (entries.length === 0) return "unknown";
  // Fewer entries than proxies means the request skipped an outer proxy; the
  // left-most entry was then still written by one of ours, not by the visitor.
  const chosen = entries[Math.max(0, entries.length - hops)];
  return normaliseAddress(chosen);
}

function normaliseAddress(raw: string) {
  if (raw.length > MAX_ADDRESS_LENGTH) return "unknown";
  let ip = raw.toLowerCase();
  // "[2001:db8::1]:443" -> "2001:db8::1"
  const bracketed = /^\[([^\]]+)\](?::\d+)?$/.exec(ip);
  if (bracketed) ip = bracketed[1];
  // "203.0.113.7:51234" -> "203.0.113.7" (only one colon, so not IPv6)
  else if (/^[\d.]+:\d+$/.test(ip)) ip = ip.slice(0, ip.indexOf(":"));
  // "::ffff:203.0.113.7" is the same visitor as "203.0.113.7"
  if (/^::ffff:[\d.]+$/.test(ip)) ip = ip.slice("::ffff:".length);
  if (!/^[0-9a-f:.%]+$/.test(ip)) return "unknown";
  return ip;
}
