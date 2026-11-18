import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";
import { assertTestDatabase } from "./e2e/guard.mjs";

// End-to-end tests: a real Chrome window clicks through the portal on this computer,
// against the TEST database only. Run with `npm run test:e2e`.
// The portal's own .env.local holds the test keys and SEED_PASSWORD; it is read here, never printed.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
assertTestDatabase();

const PORT = 3100; // not 3000, so it can run beside a normal `npm run dev`
const baseURL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "e2e",
  testIgnore: ["live/**"],
  timeout: 120_000,
  expect: { timeout: 15_000 },
  // Tests share one database, so they run one at a time, in order.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    channel: "chrome", // the Google Chrome already installed on this computer
    locale: "en-GB",
    timezoneId: "Europe/London",
    navigationTimeout: 60_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "sign-in", testMatch: /auth\.setup\.ts/ },
    {
      name: "portal",
      dependencies: ["sign-in"],
      use: { ...devices["Desktop Chrome"], channel: "chrome" },
    },
  ],
  // A production build, like the live site: no half-built pages or reloads mid-test.
  webServer: {
    command: `npx next build --turbopack && npx next start --port ${PORT}`,
    url: `${baseURL}/login`,
    reuseExistingServer: false,
    timeout: 600_000,
    env: {
      NEXT_DIST_DIR: ".next-e2e",
      // Redirects must stay on this computer, never point at the live site.
      NEXT_PUBLIC_SITE_URL: baseURL,
    },
  },
});
