import type { NextRequest } from "next/server";

// Behind Krystal's web server (Passenger) the app only sees its own address, localhost:3000,
// so redirects use the configured public address whenever one is set.
export function siteOrigin(request: NextRequest) {
  return process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? request.nextUrl.origin;
}
