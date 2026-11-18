import { defineConfig } from "@playwright/test";

// Read-only look at the live portal: no sign-in, no database, nothing changed.
export default defineConfig({
  testDir: "e2e/live",
  timeout: 60_000,
  reporter: "list",
  use: { baseURL: "https://absorbhr-portal.co.uk", channel: "chrome", locale: "en-GB" },
});
