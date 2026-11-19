import { test, expect, as, USERS, adminClient } from "./fixtures";

// The assistant's speak button needs the microphone. The browser keeps the rule of the first page
// opened, and the portal swaps pages without reloading, so the rule must allow it on every page.
// It once only allowed it on /assistant, which broke opening the assistant from the menu.
test.describe.configure({ mode: "serial" });

const admin = adminClient();
let tenantId = "";

test.beforeAll(async () => {
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const userId = data.users.find((u) => u.email === USERS.bwEmployee.email)!.id;
  const { data: m } = await admin
    .from("memberships")
    .select("tenant_id")
    .eq("user_id", userId)
    .single();
  tenantId = m!.tenant_id;
  await admin.from("tenant_settings").update({ assistant_enabled: true }).eq("tenant_id", tenantId);
});

test.afterAll(async () => {
  await admin
    .from("tenant_settings")
    .update({ assistant_enabled: false })
    .eq("tenant_id", tenantId);
});

test("the microphone works after opening the assistant from the menu", async ({ browser }) => {
  const ctx = await browser.newContext(as("bwEmployee"));
  const page = await ctx.newPage();
  const allows = (feature: string) =>
    page.evaluate((f) => {
      const d = document as unknown as {
        permissionsPolicy?: { allowsFeature: (x: string) => boolean };
        featurePolicy?: { allowsFeature: (x: string) => boolean };
      };
      return (d.permissionsPolicy ?? d.featurePolicy)?.allowsFeature(f) ?? null;
    }, feature);

  const dashboard = await page.goto("/dashboard");
  expect(dashboard?.headers()["permissions-policy"]).toContain("microphone=(self)");
  await page.getByRole("navigation").first().getByRole("link", { name: "Assistant" }).click();
  await expect(page).toHaveURL(/\/assistant/);
  expect(await allows("microphone")).toBe(true);
  // Camera and location stay blocked everywhere.
  expect(await allows("camera")).toBe(false);
  expect(await allows("geolocation")).toBe(false);
  await ctx.close();
});
