import type { NextConfig } from "next";

// Security headers applied to every response.
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "no-referrer" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // A self-contained build (server + only the packages it needs) for hosting on Krystal.
  // Vercel ignores this setting.
  output: "standalone",
  // The end-to-end tests run their own server beside a normal `npm run dev`; a separate
  // build folder stops the two from overwriting each other's files.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // The assistant's speak button needs the microphone; every other page keeps it blocked.
      // (When two rules set the same header, the later one wins.)
      {
        source: "/assistant/:path*",
        headers: [
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(self), geolocation=(), interest-cohort=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
